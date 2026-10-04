// WS12: woodland projects and other DFM tools exchange the Landscape Package with no loss of
// meaning. tests/dfm-workspace-package.json was exported by the DFM workspace (hdfm-framework
// web 0.6.0, POST /api/projects/:id/connectivity) for a fictional woodlot; it is regenerated
// only when the workspace's export changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  checkConnectivitySync,
  fromLandscapePackage,
  toLandscapePackage,
} from '@viridis/dfm-core';
import { newWorkspace, applyCommand, memberView } from '../lib/network.mjs';
import { importDraft, isUUID } from '../lib/woodland-editor.mjs';
import { consentParcels, planCheckInput } from '../lib/woodland-input.mjs';

const workspacePackage = JSON.parse(
  await readFile(new URL('./dfm-workspace-package.json', import.meta.url)),
);
const owner = { id: 'owner' },
  reviewer = { id: 'reviewer' };
function coop() {
  let s = newWorkspace(
    { name: 'Interop co-op', region: 'Synthetic', summary: 'Synthetic', displayName: 'Steward' },
    owner,
    1,
    'coop',
  );
  let n = 1;
  const run = (op, payload, actor = owner) => {
    const id = `r-${n++}`;
    s = applyCommand(s, actor, { op, payload }, Date.UTC(2026, 9, 4), id);
    return id;
  };
  run('update_coop', { name: s.name, region: s.region, summary: s.summary, visibility: 'public' });
  const r = run('request_membership', { name: 'Reviewer' }, reviewer);
  run('member_status', { id: r, status: 'active' });
  run('member_role', { id: r, role: 'steward' });
  const project = run('create_project', { name: 'Brook woodlot', summary: 'Interop', region: 'Synthetic', kind: 'woodland' });
  return { get s() { return s; }, run, project };
}
const names = (features) =>
  new Map(features.map((f) => [f.properties.dfm_id, f.properties.name]));

await test('WS12 a package from the DFM workspace imports into a woodland project and gives the same answer', () => {
  assert.equal(workspacePackage.generator, 'viridis-dfm-workspace');
  const { layers, params } = importDraft(workspacePackage, 'layers');
  // IDs become UUIDs; names survive; the planning boundary is not a woodland layer.
  for (const list of Object.values(layers))
    for (const f of list) assert.ok(isUUID(f.properties.dfm_id));
  assert.deepEqual(
    layers.coreAreas.map((f) => f.properties.name),
    ['West stand', 'East brook'],
  );
  assert.ok(!('boundary' in layers));
  const f = coop();
  const version = f.run('save_woodland_layers', { projectId: f.project, layers, params, notes: 'From the workspace' });
  f.run('review_woodland_layers', { id: version, decision: 'approve', note: 'Independent' }, reviewer);
  const { treatments } = importDraft(workspacePackage, 'plan');
  const planId = f.run('submit_treatment_plan', { projectId: f.project, name: 'Workspace plan', period: '2027', treatments });
  const stored = f.s.treatmentPlans.find((p) => p.id === planId);
  // The workspace's own answer for the same package.
  const theirs = checkConnectivitySync(fromLandscapePackage(workspacePackage));
  assert.equal(stored.check.status, theirs.status);
  assert.equal(stored.status, 'blocked');
  const ourNames = new Map([...names(f.s.woodlandLayers.at(-1).layers.coreAreas), ...names(stored.treatments)]);
  const theirNames = new Map([
    ...names(workspacePackage.layers.coreAreas),
    ...names(workspacePackage.layers.treatments),
  ]);
  const byName = (links, labels) =>
    links.map((l) => ({
      pair: [labels.get(l.a), labels.get(l.b)].sort((x, y) => x.localeCompare(y)),
      causes: l.causes.map((c) => labels.get(c)).sort((x, y) => x.localeCompare(y)),
    }));
  assert.deepEqual(
    byName(stored.check.lostLinks, ourNames),
    byName(theirs.lostLinks, theirNames),
  );
  assert.deepEqual(byName(stored.check.lostLinks, ourNames)[0].causes, ['Patch cut 3']);
  assert.deepEqual(stored.check.pinchedLinks, theirs.pinchedLinks);
  // Woodland records are stored at 1e-7 degrees (about 1 cm), so areas agree to 0.01%.
  for (const k of ['committedM2', 'proposedM2'])
    assert.ok(
      Math.abs(stored.check.consent[k] - theirs.consent[k]) <=
        1e-4 * Math.max(1, theirs.consent[k]),
      `${k}: ${stored.check.consent[k]} vs ${theirs.consent[k]}`,
    );
});

await test('WS12 a stored plan check is reproduced exactly, checksum included, from the package a steward downloads', () => {
  const f = coop();
  const { layers, params } = importDraft(workspacePackage, 'layers');
  const version = f.run('save_woodland_layers', { projectId: f.project, layers, params });
  f.run('review_woodland_layers', { id: version, decision: 'approve', note: 'Independent' }, reviewer);
  // One woodlot with reviewed consent, so the package carries a covered parcel.
  const parcel = f.run('record_parcel', {
    projectId: f.project,
    name: 'North lot',
    landReference: 'Synthetic',
    areaSquareMetres: 1,
    consentReference: 'Synthetic',
  });
  f.run('review_parcel', { id: parcel, decision: 'approve' }, reviewer);
  const M = 111195.0802335329;
  const ring = [[0, 0], [2000, 0], [2000, 1000], [0, 1000], [0, 0]].map(([x, y]) => [x / M, y / M]);
  const b = f.run('save_boundary', { parcelId: parcel, geometry: { type: 'Polygon', coordinates: [ring] }, consentReference: 'Synthetic' });
  f.run('review_boundary', { parcelId: parcel, id: b, decision: 'approve' }, reviewer);
  const c = f.run('record_parcel_consent', {
    parcelId: parcel, holder: 'Holder', authority: 'Deed', reference: 'Ref', scope: 'Pooling', attested: true,
  });
  f.run('review_parcel_consent', { parcelId: parcel, id: c, decision: 'approve', note: 'Checked' }, reviewer);
  const { treatments } = importDraft(workspacePackage, 'plan');
  const planId = f.run('submit_treatment_plan', { projectId: f.project, name: 'Plan', period: '2027', treatments });
  const stored = f.s.treatmentPlans.find((p) => p.id === planId);
  assert.equal(stored.check.consent.committedM2 > 0, true);
  // What a steward downloads: the plan's layers version, its units and the woodlot consents.
  const view = memberView(f.s, owner.id).state;
  const input = planCheckInput(view.woodlandLayers, view.treatmentPlans.find((p) => p.id === planId), consentParcels(view, f.project));
  const download = JSON.stringify(toLandscapePackage(input, { name: 'Plan', generator: 'VergeCommon' }));
  const again = checkConnectivitySync(fromLandscapePackage(JSON.parse(download)));
  assert.equal(again.inputChecksum, stored.check.inputChecksum);
  assert.equal(again.status, stored.check.status);
  assert.deepEqual(again.lostLinks, stored.check.lostLinks);
  assert.deepEqual(
    Object.fromEntries(Object.entries(again.consent).map(([k, v]) => [k, Math.round(v * 1e7) / 1e7])),
    stored.check.consent,
  );
  // Once the version's geometry is dropped, there is nothing exact to download.
  assert.equal(planCheckInput([], stored, []), null);
});
