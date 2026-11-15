// Corridor facts: rights-of-way and blowdown. Each test names the invariant it checks: CF1-CF6
// in lib/woodland-recreation.mjs. Runs through ordinary co-op commands on the synthetic
// watershed co-op (tests/woodland-spine-fixture.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { memberView } from '../lib/network.mjs';
import { spineAnalysisInput } from '../lib/woodland-spine.mjs';
import { runSpineAnalysis } from '../lib/woodland-spine-run.mjs';
import { adoptedUseUnits, FACT_KINDS } from '../lib/woodland-recreation.mjs';
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

const line = (pts, cleared_width_m) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: pts.map(([x, y]) => P(x, y)) },
  properties: { cleared_width_m },
});
const area = (pts) => ({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [[...pts, pts[0]].map(([x, y]) => P(x, y))],
  },
  properties: {},
});
// A power line down the middle of the upper main stem's corridor, kept clear 20 m wide.
const POWER_LINE = [line([[276, 150], [280, 196], [288, 232]], 20)];
const ALONG_EDGE = [line([[289, 150], [293, 196], [301, 232]], 8)];
const PATCH = [area([[270, 170], [290, 170], [290, 190], [270, 190]])];

function coop() {
  const f = spineCoop();
  reviewWatershedLayers(f);
  return f;
}
const fact = (f, id) => f.s.corridorUses.find((u) => u.id === id);
const record = (f, payload, actor = owner) =>
  f.run('record_corridor_fact', { projectId: f.project, ...payload }, actor);
const rightOfWay = (f, features = POWER_LINE, extra = {}) =>
  record(f, {
    kind: 'right-of-way',
    name: 'Transmission line',
    source: 'Synthetic utility easement, book 12 page 40',
    features,
    ...extra,
  });
const blowdown = (f, extra = {}) =>
  record(f, {
    kind: 'blowdown',
    name: 'December windstorm',
    source: 'Synthetic field visit',
    features: PATCH,
    eventYear: 2026,
    severity: 'stand-replacing',
    ...extra,
  });
const approve = (f, id, actor = reviewer) =>
  f.run('review_corridor_fact', { id, decision: 'approve', note: 'Seen on the ground' }, actor);
const input = (f) => spineAnalysisInput(f.s, f.project, { now: NOW });
const refuses = (fn, pattern, status) =>
  assert.throws(fn, (e) => {
    assert.match(e.message, pattern);
    if (status) assert.equal(e.status, status);
    return true;
  });

await test('CF1 a fact is recorded by a steward with its source and reviewed by another; nobody votes or agrees', () => {
  assert.deepEqual([...FACT_KINDS], ['right-of-way', 'blowdown']);
  const f = coop();
  refuses(() => record(f, { kind: 'right-of-way', name: 'x', source: 'y', features: POWER_LINE }, member), /steward/i);
  refuses(() => rightOfWay(f, POWER_LINE, { source: ' ' }), /source/i);
  refuses(() => record(f, { kind: 'pipeline', name: 'x', source: 'y', features: POWER_LINE }), /kind of fact/);
  const id = rightOfWay(f);
  assert.equal(fact(f, id).basis, 'fact');
  assert.equal(fact(f, id).status, 'submitted');
  // Not in effect until reviewed, and not by its author.
  assert.deepEqual(adoptedUseUnits(f.s, f.project), []);
  refuses(() => approve(f, id, owner), /Another steward must review/, 403);
  refuses(() => f.run('review_corridor_fact', { id, decision: 'approve' }, reviewer), /review note/i);
  refuses(() => approve(f, id, member), /steward/i);
  approve(f, id);
  assert.equal(fact(f, id).status, 'reviewed');
  // No agreement and no vote apply to a fact.
  refuses(() => f.run('agree_corridor_use', { id, parcelId: 'woodlot-1', decision: 'agree', attested: true }, owner), /reviewed by a steward, not agreed/, 409);
  refuses(() => f.run('open_corridor_use_vote', { id }, owner), /must agree before/, 409);
  // A rejected fact never takes effect.
  const other = rightOfWay(f, ALONG_EDGE, { name: 'Mistaken line' });
  f.run('review_corridor_fact', { id: other, decision: 'reject', note: 'Not on this land' }, reviewer);
  assert.equal(fact(f, other).status, 'rejected');
  assert.equal(adoptedUseUnits(f.s, f.project).length, fact(f, id).units.length);
  // A use is not reviewed like a fact.
  const use = f.run('propose_corridor_use', { projectId: f.project, name: 'Trail', kind: 'ski-trail', audience: 'members', features: ALONG_EDGE.map((l) => ({ ...l, properties: { cleared_width_m: 0 } })) }, member);
  refuses(() => f.run('review_corridor_fact', { id: use, decision: 'approve', note: 'x' }, reviewer), /Only a recorded fact or an edge band is reviewed/, 409);
});

await test('CF2 + CF3 a right-of-way is never blocked: the co-op sees the links it breaks, and its cleared ground stops counting', () => {
  const f = coop();
  const before = runSpineAnalysis('outlook', input(f).input);
  const id = rightOfWay(f);
  const row = fact(f, id);
  // A 20 m clearing down the corridor's middle splits it. That is recorded, not refused.
  assert.equal(row.status, 'submitted');
  assert.equal(row.holds, false);
  assert.ok(row.check.lostLinks.length > 0);
  assert.ok(row.clearedM2 > 2000, `${row.clearedM2} m² of corridor under the line`);
  approve(f, id);
  assert.deepEqual(adoptedUseUnits(f.s, f.project), row.units);
  // Every later analysis sees the ground as it is: the links through that stretch are gone.
  const after = runSpineAnalysis('outlook', input(f).input);
  assert.equal(after.status, 'ok');
  assert.ok(after.linkedAfter.length < before.linkedAfter.length);
  assert.ok(after.milestones[4].oldGrowthAgeLinks.length < before.milestones[4].oldGrowthAgeLinks.length);
  // A harvest plan away from the line is still checked, against that reduced corridor.
  const planId = f.run('submit_treatment_plan', { projectId: f.project, name: 'Away', period: '2027', treatments: [UNITS['unit-a']] }, member);
  const plan = f.s.treatmentPlans.find((p) => p.id === planId);
  assert.equal(plan.status, 'submitted');
  assert.deepEqual(plan.clearedGround, row.units);
  // A right-of-way along the edge that leaves the minimum width keeps every link.
  const g = coop();
  const edge = rightOfWay(g, ALONG_EDGE);
  assert.equal(fact(g, edge).holds, true);
  approve(g, edge);
  assert.deepEqual(
    runSpineAnalysis('outlook', input(g).input).linkedAfter,
    before.linkedAfter,
  );
});

await test('CF4 blowdown stays habitat; a stand-replacing one warns until stand ages are recorded again', () => {
  const f = coop();
  const clean = input(f);
  const before = runSpineAnalysis('outlook', clean.input);
  const id = blowdown(f);
  approve(f, id);
  const b = fact(f, id);
  assert.deepEqual(b.units, []);
  assert.equal(b.check, null);
  assert.deepEqual(adoptedUseUnits(f.s, f.project), []);
  // No check or analysis input changes: fallen trees are still corridor.
  const now = input(f);
  assert.deepEqual(now.input, clean.input);
  assert.deepEqual(runSpineAnalysis('outlook', now.input).milestones, before.milestones);
  // The fixture's stand ages were recorded for 2026; a 2026 blowdown is not after them.
  assert.deepEqual(now.context.warnings, clean.context.warnings);
  // Ages recorded for 2020 are too old after a 2026 stand-replacing blowdown: every analysis says so.
  const g = spineCoop();
  reviewWatershedLayers(g, (x) => ({ ...x, params: { ...x.params, ageAsOfYear: 2020 } }));
  approve(g, blowdown(g));
  const warned = input(g).context.warnings;
  assert.equal(warned.length, 1);
  assert.match(warned[0], /stand-replacing blowdown in 2026, after the stand ages were recorded \(2020\)/);
  // Gaps under a standing canopy do not reset a stand's age, and an unreviewed record warns nobody.
  const h = spineCoop();
  reviewWatershedLayers(h, (x) => ({ ...x, params: { ...x.params, ageAsOfYear: 2020 } }));
  approve(h, blowdown(h, { severity: 'gaps' }));
  blowdown(h, { name: 'Unreviewed' });
  assert.deepEqual(input(h).context.warnings, []);
  // Salvage is a treatment plan: taking the fallen trees out of the corridor meets the check.
  const salvage = f.run('submit_treatment_plan', { projectId: f.project, name: 'Salvage', period: '2027', treatments: [{ ...PATCH[0], properties: { dfm_id: 'salvage-1', intensity: 'salvage' } }] }, member);
  assert.equal(f.s.treatmentPlans.find((p) => p.id === salvage).status, 'blocked');
  for (const [extra, pattern] of [
    [{ eventYear: 2031 }, /year of the blowdown/],
    [{ eventYear: undefined }, /year of the blowdown/],
    [{ severity: 'bad' }, /gaps.*stand-replacing/],
    [{ features: POWER_LINE }, /one or more polygons/],
  ])
    refuses(() => blowdown(coop(), extra), pattern);
});

await test('CF5 + CF6 a steward ends a fact; a woodlot leaving does not; privacy and erasure follow a use', () => {
  const f = coop();
  const id = rightOfWay(f);
  approve(f, id);
  // The line crosses woodlot-1. Withdrawing a woodlot does not remove a power line.
  refuses(() => f.run('end_corridor_use', { id }, member), /steward/i);
  const g = coop();
  const across = rightOfWay(g, [line([[300, 200], [450, 200]], 0)], { name: 'Access path' });
  approve(g, across);
  assert.deepEqual(fact(g, across).woodlots.map((w) => w.parcelId), ['woodlot-1', 'woodlot-4']);
  g.run('withdraw_parcel', { parcelId: 'woodlot-4', reason: 'Sold' }, member);
  assert.equal(fact(g, across).status, 'reviewed');
  // Members see the fact and its source; only stewards and holders see which woodlots it crosses.
  const view = (actor) => memberView(f.s, actor.id).state.corridorUses.find((u) => u.id === id);
  assert.equal(view(member).source, 'Synthetic utility easement, book 12 page 40');
  assert.deepEqual(view(member).woodlots, []);
  assert.equal(view(member).woodlotCount, 1);
  assert.equal(view(member).canEnd, false);
  assert.equal(view(reviewer).canEnd, true);
  assert.equal('reviewedBy' in view(reviewer), false);
  const pending = rightOfWay(f, ALONG_EDGE, { name: 'Pending' });
  assert.equal(memberView(f.s, reviewer.id).state.corridorUses.find((u) => u.id === pending).canReview, true);
  assert.equal(memberView(f.s, owner.id).state.corridorUses.find((u) => u.id === pending).canReview, false);
  // Ended: the ground counts again.
  f.run('end_corridor_use', { id }, reviewer);
  assert.equal(fact(f, id).status, 'ended');
  assert.deepEqual(adoptedUseUnits(f.s, f.project), []);
  refuses(() => f.run('end_corridor_use', { id }, reviewer), /already ended/, 409);
  // Erasing the steward who recorded a reviewed fact keeps it, without its description.
  const k = coop();
  const kept = rightOfWay(k, POWER_LINE, { description: 'Seen from the road' });
  approve(k, kept);
  const unreviewed = blowdown(k);
  const erased = eraseWorkspaceState(k.s, owner.id, NOW + 1).state;
  assert.equal(erased.corridorUses.find((u) => u.id === kept).description, '');
  assert.equal(erased.corridorUses.find((u) => u.id === kept).status, 'reviewed');
  assert.equal(erased.corridorUses.some((u) => u.id === unreviewed), false);
});
