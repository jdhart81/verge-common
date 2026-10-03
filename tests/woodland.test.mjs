// Woodland (DFM) projects. Each test names the invariant in lib/woodland.mjs it checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {newWorkspace, applyCommand, memberView} from '../lib/network.mjs';
import {previewTreatmentCheck, WOODLAND_OPS} from '../lib/woodland.mjs';
import {woodlandEnabled} from '../lib/woodland-config.mjs';

const owner = {id: 'owner'}, reviewer = {id: 'reviewer'}, member = {id: 'member'};
// Fictional geometry at the equator in local meters (Turf sphere: 111,195.08 m per degree).
const M = 111195.0802335329;
const pt = (x, y) => [x / M, y / M];
const rect = (x0, y0, x1, y1) => ({type: 'Polygon', coordinates: [[pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)]]});
const F = (geometry, properties = {}) => ({type: 'Feature', geometry, properties});
const layers = (corridorWidth = 120) => ({
  coreAreas: [
    F(rect(100, 300, 400, 700), {dfm_id: 'core-A', core_class: 'old-growth-candidate'}),
    F(rect(1600, 300, 1900, 700), {dfm_id: 'core-B', core_class: 'riparian-core'}),
  ],
  retained: [F(rect(400, 500 - corridorWidth / 2, 1600, 500 + corridorWidth / 2), {dfm_id: 'corridor-1'})],
  roads: [F({type: 'LineString', coordinates: [pt(1000, 0), pt(1000, 1000)]}, {dfm_id: 'road-1'})],
  water: [],
  crossings: [F({type: 'Point', coordinates: pt(1000, 500)}, {dfm_id: 'crossing-1', passage: 'verified'})],
});
const params = {minWidthM: 100, minWidthSource: 'Co-op woodland policy (fixture)', roadWidthM: 6};
const cut = F(rect(700, 300, 800, 800), {dfm_id: 'harvest-3', intensity: 'clearcut'});
const away = F(rect(1200, 750, 1500, 950), {dfm_id: 'harvest-1', intensity: 'shelterwood'});

function setup() {
  let s = newWorkspace({name: 'Woodland co-op', region: 'Synthetic', summary: 'Synthetic test only', displayName: 'Founding steward'}, owner, 1, 'coop');
  let n = 1;
  const f = {
    get s() { return s; },
    run(op, payload = {}, actor = owner, now = 100) {
      const id = `record-${n++}`;
      s = applyCommand(s, actor, {op, payload}, now, id);
      return id;
    },
  };
  f.run('update_coop', {name: s.name, region: s.region, summary: s.summary, visibility: 'public'});
  const r = f.run('request_membership', {name: 'Review steward'}, reviewer);
  f.run('member_status', {id: r, status: 'active'});
  f.run('member_role', {id: r, role: 'steward'});
  const m = f.run('request_membership', {name: 'Member'}, member);
  f.run('member_status', {id: m, status: 'active'});
  f.project = f.run('create_project', {name: 'North woodlot', summary: 'Keep old-growth candidates linked.', region: 'Synthetic', kind: 'woodland'});
  return f;
}
function reviewedLayers(f, corridorWidth) {
  const id = f.run('save_woodland_layers', {projectId: f.project, layers: layers(corridorWidth), params, notes: 'Fixture'});
  f.run('review_woodland_layers', {id, decision: 'approve', note: 'Checked against field map'}, reviewer);
  return id;
}
const plan = (f, treatments, actor = member) =>
  f.run('submit_treatment_plan', {projectId: f.project, name: 'Winter 2027 harvest', period: '2027', treatments}, actor);
const byId = (f, id) => f.s.treatmentPlans.find((p) => p.id === id);

await test('flag is off unless VERGE_WOODLAND_DFM=1', () => {
  assert.equal(woodlandEnabled({}), false);
  assert.equal(woodlandEnabled({VERGE_WOODLAND_DFM: 'true'}), false);
  assert.equal(woodlandEnabled({VERGE_WOODLAND_DFM: '1'}), true);
  assert.ok(WOODLAND_OPS.includes('submit_treatment_plan'));
});

await test('W1 layers need a steward to save and another steward to review before plans are checked', () => {
  const f = setup();
  assert.throws(() => f.run('save_woodland_layers', {projectId: f.project, layers: layers(), params}, member), /steward/i);
  assert.throws(() => plan(f, [away]), /review the woodland layers/);
  const id = f.run('save_woodland_layers', {projectId: f.project, layers: layers(), params});
  assert.throws(() => f.run('review_woodland_layers', {id, decision: 'approve', note: 'Self'}), /Another steward/);
  assert.throws(() => plan(f, [away]), /review the woodland layers/);
  f.run('review_woodland_layers', {id, decision: 'approve', note: 'Independent'}, reviewer);
  assert.equal(byId(f, plan(f, [away])).status, 'submitted');
});

await test('W1 layers are validated: missing width source or a second core is rejected', () => {
  const f = setup();
  assert.throws(() => f.run('save_woodland_layers', {projectId: f.project, layers: layers(), params: {...params, minWidthSource: ''}}), /minWidthSource/);
  const one = layers(); one.coreAreas.pop();
  assert.throws(() => f.run('save_woodland_layers', {projectId: f.project, layers: one, params}), /two core areas/);
  const other = f.run('create_project', {name: 'Hedge', summary: 'Not woodland', region: 'Synthetic', kind: 'ecohedge'});
  assert.throws(() => f.run('save_woodland_layers', {projectId: other, layers: layers(), params}), /woodland projects/);
});

await test('W2 a plan that cuts the only corridor is stored as blocked with its reasons and cannot be reviewed', () => {
  const f = setup(); reviewedLayers(f);
  const id = plan(f, [cut, away]);
  const p = byId(f, id);
  assert.equal(p.status, 'blocked');
  assert.equal(p.check.status, 'fail');
  assert.deepEqual(p.check.lostLinks[0].causes, ['harvest-3']);
  assert.match(p.check.inputChecksum, /^sha256:[0-9a-f]{64}$/);
  assert.throws(() => f.run('review_treatment_plan', {id, decision: 'approve', note: 'x'}, reviewer), /override vote/);
});

await test('W3 an adopted override vote returns a failed plan to review; it still needs a second steward', () => {
  const f = setup(); reviewedLayers(f);
  const id = plan(f, [cut]);
  assert.throws(() => f.run('propose_plan_override', {id, reason: 'x'}, member), /steward/i);
  f.run('propose_plan_override', {id, reason: 'Salvage after windthrow; corridor replanted elsewhere.', days: 7});
  const o = byId(f, id).override;
  assert.equal(o.electorate.length, 3);
  assert.equal(o.quorum, 2);
  assert.throws(() => f.run('close_plan_override', {id}, owner, 200), /Wait for the deadline/);
  f.run('vote_plan_override', {id, choice: 'approve'}, owner);
  f.run('vote_plan_override', {id, choice: 'approve'}, reviewer);
  f.run('vote_plan_override', {id, choice: 'oppose'}, member);
  f.run('close_plan_override', {id});
  assert.equal(byId(f, id).override.status, 'adopted');
  assert.equal(byId(f, id).status, 'submitted');
  f.run('review_treatment_plan', {id, decision: 'approve', note: 'Override recorded'}, reviewer);
  assert.equal(byId(f, id).status, 'reviewed');
});

await test('W3 a rejected override keeps the plan blocked; incomplete checks cannot be overridden', () => {
  const f = setup(); reviewedLayers(f);
  const id = plan(f, [cut]);
  f.run('propose_plan_override', {id, reason: 'Proposed exception', days: 1});
  f.run('vote_plan_override', {id, choice: 'oppose'}, member);
  f.run('close_plan_override', {id}, owner, 100 + 2 * 86_400_000);
  assert.equal(byId(f, id).override.status, 'not_adopted');
  assert.equal(byId(f, id).status, 'blocked');
  const bad = plan(f, [F({type: 'Point', coordinates: pt(1, 1)}, {dfm_id: 'not-a-unit'})]);
  assert.equal(byId(f, bad).check.status, 'incomplete');
  assert.throws(() => f.run('propose_plan_override', {id: bad, reason: 'x'}), /incomplete/);
});

await test('W4 changed layers invalidate a pending plan review', () => {
  const f = setup(); reviewedLayers(f);
  const id = plan(f, [away]);
  reviewedLayers(f, 140);
  assert.throws(() => f.run('review_treatment_plan', {id, decision: 'approve', note: 'x'}, reviewer), /changed after this plan/);
});

await test('W5 corridor sections are committed only on parcels with current reviewed consent', () => {
  const f = setup(); reviewedLayers(f);
  const parcel = f.run('record_parcel', {projectId: f.project, name: 'West parcel', landReference: 'private', areaSquareMetres: 1_000_000, consentReference: 'fixture'});
  f.run('review_parcel', {id: parcel, decision: 'approve'}, reviewer);
  const b = f.run('save_boundary', {parcelId: parcel, geometry: rect(0, 0, 1000, 1000), consentReference: 'Fixture boundary consent'});
  f.run('review_boundary', {parcelId: parcel, id: b, decision: 'approve'}, reviewer);
  const before = previewTreatmentCheck(f.s, f.project, []);
  assert.equal(Math.round(before.consent.committedM2), 0, 'boundary reviewed but no consent yet');
  const c = f.run('record_parcel_consent', {parcelId: parcel, holder: 'Fixture holder', authority: 'Test authority', reference: 'Fixture consent', scope: 'Fixture only', attested: true});
  f.run('review_parcel_consent', {parcelId: parcel, id: c, decision: 'approve', note: 'Synthetic review'}, reviewer);
  const after = previewTreatmentCheck(f.s, f.project, []);
  assert.ok(Math.abs(after.consent.committedM2 - 72_000) / 72_000 < 0.01, after.consent.committedM2);
});

await test('W6 members see plans; review flags only for other stewards; no one reviews their own plan', () => {
  const f = setup(); reviewedLayers(f);
  const own = plan(f, [away], owner);
  assert.throws(() => f.run('review_treatment_plan', {id: own, decision: 'approve', note: 'x'}), /Another steward/);
  const view = memberView(f.s, reviewer.id);
  assert.equal(view.state?.treatmentPlans?.[0]?.canReview ?? view.treatmentPlans?.[0]?.canReview, true);
  const memberSees = memberView(f.s, member.id);
  assert.equal((memberSees.state ?? memberSees).treatmentPlans.length, 1);
});

await test('W7 oversized layers are refused', () => {
  const f = setup();
  const big = layers();
  big.retained = Array.from({length: 300}, (_, i) => F(rect(400 + i, 440, 401 + i, 560), {dfm_id: `r-${i}`, name: 'x'.repeat(250)}));
  assert.throws(() => f.run('save_woodland_layers', {projectId: f.project, layers: big, params}), /Simplify the layers/);
});
