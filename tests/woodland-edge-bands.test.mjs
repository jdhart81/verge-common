// Edge bands: agroforestry where a field meets the corridor. Each test names the invariant it
// checks: AG1-AG7 in lib/woodland-recreation.mjs. Runs through ordinary co-op commands on the
// synthetic watershed co-op. The member recorded woodlot-4; the east brook's corridor runs
// through its north-west, and its south-east corner is open ground.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memberView } from '../lib/network.mjs';
import { spineAnalysisInput } from '../lib/woodland-spine.mjs';
import {
  adoptedUseUnits,
  EDGE_BAND_KINDS,
  RECREATION_KINDS,
} from '../lib/woodland-recreation.mjs';
import { eraseWorkspaceState } from '../self-hosted/erasure.mjs';
import {
  owner,
  reviewer,
  member,
  NOW,
  spineCoop,
  reviewWatershedLayers,
} from './woodland-spine-fixture.mjs';
import { P, UNITS } from './dfm-watershed-fixture.mjs';

const rect = (x0, y0, x1, y1) => ({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => P(x, y))],
  },
  properties: {},
});
const FIELD_EDGE = [rect(470, 205, 486, 221)]; // open ground in the member's woodlot-4
const IN_CORRIDOR = [rect(420, 150, 440, 170)]; // on the east brook's corridor, same woodlot
const STEWARDS_LAND = [rect(340, 290, 355, 305)]; // open ground the founding steward recorded
const NATIVE = [
  { name: 'Quercus rubra', native: true },
  { name: 'Carya ovata', native: true },
  { name: 'Juglans cinerea', native: true },
];

function coop() {
  const f = spineCoop();
  reviewWatershedLayers(f);
  return f;
}
const band = (f, id) => f.s.corridorUses.find((u) => u.id === id);
const propose = (f, extra = {}, actor = member) =>
  f.run(
    'propose_edge_band',
    {
      projectId: f.project,
      kind: 'tree-crop-edge',
      name: 'Nut trees along the brook field',
      species: NATIVE,
      nativeStatusSource: 'Synthetic state flora',
      plantedYear: 2027,
      features: FIELD_EDGE,
      ...extra,
    },
    actor,
  );
const approve = (f, id, actor = reviewer) =>
  f.run('review_corridor_fact', { id, decision: 'approve', note: 'Map and species checked' }, actor);
const refuses = (fn, pattern, status) =>
  assert.throws(fn, (e) => {
    assert.match(e.message, pattern);
    if (status) assert.equal(e.status, status);
    return true;
  });

await test('AG1 a band lies beside the corridor: one that overlaps retained forest or a core is refused', () => {
  assert.ok(EDGE_BAND_KINDS.includes('silvopasture') && EDGE_BAND_KINDS.includes('alley-cropping'));
  // Farming under the canopy is inside the forest, so it is a use the co-op votes on.
  assert.ok(RECREATION_KINDS.includes('forest-farming'));
  assert.equal(EDGE_BAND_KINDS.includes('forest-farming'), false);
  const f = coop();
  refuses(() => propose(f, { features: IN_CORRIDOR }), /overlaps \d+ m² of retained forest or a core area.*corridor itself is not farmed/s, 409);
  assert.equal(f.s.corridorUses?.length ?? 0, 0);
  const id = propose(f);
  const b = band(f, id);
  assert.equal(b.basis, 'band');
  assert.equal(b.status, 'submitted');
  assert.ok(b.areaM2 > 6000 && b.areaM2 < 6800, `${b.areaM2} m²`); // 80 m by 80 m
  refuses(() => propose(f, { features: [{ ...FIELD_EDGE[0], geometry: { type: 'LineString', coordinates: [P(465, 205), P(488, 228)] } }] }), /one or more polygons/);
  refuses(() => propose(spineCoop()), /review the woodland layers first/, 409);
});

await test('AG2 a band is a buffer, never corridor: no check, analysis or plan changes', () => {
  const f = coop();
  const before = spineAnalysisInput(f.s, f.project, { now: NOW });
  approve(f, propose(f));
  assert.deepEqual(adoptedUseUnits(f.s, f.project), []);
  assert.deepEqual(spineAnalysisInput(f.s, f.project, { now: NOW }), before);
  const planId = f.run('submit_treatment_plan', { projectId: f.project, name: 'Away', period: '2027', treatments: [UNITS['unit-a']] }, member);
  const plan = f.s.treatmentPlans.find((p) => p.id === planId);
  assert.equal(plan.status, 'submitted');
  assert.equal('clearedGround' in plan, false);
  const fresh = coop();
  const same = fresh.run('submit_treatment_plan', { projectId: fresh.project, name: 'Away', period: '2027', treatments: [UNITS['unit-a']] }, member);
  assert.equal(plan.check.inputChecksum, fresh.s.treatmentPlans.find((p) => p.id === same).check.inputChecksum);
});

await test('AG3 native tree crops only, each species named once, with the source of its native status', () => {
  const f = coop();
  refuses(() => propose(f, { species: [...NATIVE, { name: 'Castanea mollissima', native: false }] }), /native tree crops only: Castanea mollissima is not recorded as native/);
  refuses(() => propose(f, { species: [{ name: 'Quercus rubra' }] }), /native tree crops only/);
  refuses(() => propose(f, { species: [] }), /List the species planted/);
  refuses(() => propose(f, { species: [NATIVE[0], { name: 'quercus rubra', native: true }] }), /each species once/);
  refuses(() => propose(f, { species: [{ name: ' ', native: true }] }), /Name every species/);
  refuses(() => propose(f, { nativeStatusSource: '' }), /native status comes from/);
  refuses(() => propose(f, { kind: 'orchard' }), /kind of edge band/);
  refuses(() => propose(f, { plantedYear: 1500 }), /planting year/);
  const b = band(f, propose(f, { species: [{ name: '  Carya ovata ', native: true, note: 'x' }] }));
  assert.deepEqual(b.species, [{ name: 'Carya ovata', native: true }]);
  assert.equal(b.nativeStatusSource, 'Synthetic state flora');
});

await test('AG4 the holder decides, on their own woodlots; a steward reviews; nobody votes', () => {
  const f = coop();
  // Not on someone else's woodlot, and not on land nobody has recorded.
  refuses(() => propose(f, { features: STEWARDS_LAND }), /only on woodlots you recorded/, 403);
  refuses(() => propose(f, { features: [rect(700, 700, 720, 720)] }), /on a woodlot you recorded/);
  // A steward plants on their own woodlot the same way.
  const stewards = propose(f, { features: STEWARDS_LAND }, owner);
  refuses(() => approve(f, stewards, owner), /Another steward must review/, 403);
  const id = propose(f);
  refuses(() => approve(f, id, member), /steward/i);
  refuses(() => f.run('open_corridor_use_vote', { id }, owner), /must agree before/, 409);
  refuses(() => f.run('agree_corridor_use', { id, parcelId: 'woodlot-4', decision: 'agree', attested: true }, member), /reviewed by a steward, not agreed/, 409);
  approve(f, id);
  assert.equal(band(f, id).status, 'reviewed');
  f.run('review_corridor_fact', { id: stewards, decision: 'reject', note: 'Wet ground' }, reviewer);
  assert.equal(band(f, stewards).status, 'rejected');
});

await test('AG6 the holder or a steward ends a band; a withdrawn woodlot or an erased account removes it', () => {
  const f = coop();
  const id = propose(f);
  approve(f, id);
  refuses(() => f.run('end_corridor_use', { id }, { id: 'someone-else' }), /./);
  f.run('end_corridor_use', { id }, member);
  assert.equal(band(f, id).status, 'ended');
  const second = propose(f, { name: 'Second band' });
  f.run('end_corridor_use', { id: second }, reviewer);
  assert.equal(band(f, second).status, 'withdrawn');
  // Withdrawing the woodlot ends its band.
  const g = coop();
  const gid = propose(g);
  approve(g, gid);
  g.run('withdraw_parcel', { parcelId: 'woodlot-4', reason: 'Sold' }, member);
  assert.equal(band(g, gid).status, 'ended');
  // Erasing the holder removes the band entirely, reviewed or not.
  const k = coop();
  const kid = propose(k);
  approve(k, kid);
  const erased = eraseWorkspaceState(k.s, member.id, NOW + 1).state;
  assert.equal((erased.corridorUses ?? []).some((u) => u.id === kid), false);
  assert.doesNotMatch(JSON.stringify(erased.corridorUses ?? []), /Nut trees/);
});

await test('AG7 a band is shown to stewards and its holder; other members see its kind and area only', () => {
  const f = coop();
  const id = propose(f, { features: STEWARDS_LAND, name: 'Owner’s hazel row' }, owner);
  const seen = (actor) => memberView(f.s, actor.id).state.corridorUses.find((u) => u.id === id);
  const holder = seen(owner);
  assert.equal(holder.name, 'Owner’s hazel row');
  assert.equal(holder.features.length, 1);
  assert.equal(holder.canEnd, true);
  const steward = seen(reviewer);
  assert.equal(steward.features.length, 1);
  assert.equal(steward.canReview, true);
  assert.deepEqual(steward.species, NATIVE);
  const other = seen(member);
  assert.deepEqual(
    { hidden: other.hidden, name: other.name, features: other.features, woodlots: other.woodlots, kind: other.kind, areaM2: other.areaM2 },
    { hidden: true, name: '', features: [], woodlots: [], kind: 'tree-crop-edge', areaM2: holder.areaM2 },
  );
  for (const key of ['species', 'nativeStatusSource', 'description', 'createdBy', 'plantedYear'])
    assert.equal(key in other, false, key);
  assert.doesNotMatch(JSON.stringify(other), /hazel|coordinates":\[\[/);
  assert.equal(other.canEnd, false);
});
