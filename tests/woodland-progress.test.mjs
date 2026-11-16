// Corridor progress: the co-op's path toward one branching old-growth corridor, joined woodlot
// by woodlot. Each test names the invariant it checks: CP1-CP6 in lib/woodland-progress.mjs.
// Runs on the synthetic watershed co-op (tests/woodland-spine-fixture.mjs): nine woodlots with
// reviewed boundaries, consent on three, two of the nine recorded by the ordinary member.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { memberView } from '../lib/network.mjs';
import {
  corridorProgress,
  spinePattern,
  PROGRESS_STAGES,
} from '../lib/woodland-progress.mjs';
import { consentParcels } from '../lib/woodland-input.mjs';
import {
  owner,
  reviewer,
  member,
  spineCoop,
  reviewWatershedLayers,
} from './woodland-spine-fixture.mjs';

const read = (f) => readFile(new URL('../' + f, import.meta.url), 'utf8');
const steward = (f) =>
  corridorProgress(f.s, f.project, { userId: owner.id, steward: true });
const ordinary = (f) =>
  corridorProgress(f.s, f.project, { userId: member.id, steward: false });

await test('CP1 progress reads records, stores nothing, and exists only for woodland projects', () => {
  const f = spineCoop();
  reviewWatershedLayers(f);
  const before = JSON.stringify(f.s);
  const p = steward(f);
  assert.equal(JSON.stringify(f.s), before, 'state is untouched');
  assert.equal(f.s.corridorProgress, undefined, 'nothing is stored');
  assert.equal(p.layers, 'reviewed');
  assert.equal(
    corridorProgress(f.s, 'no-such-project', { userId: owner.id, steward: true }),
    null,
  );
  const other = f.run('create_project', {
    name: 'Hedge',
    summary: 'Not a woodland project',
    region: 'Synthetic',
    kind: 'ecohedge',
  });
  assert.equal(
    corridorProgress(f.s, other, { userId: owner.id, steward: true }),
    null,
  );
  assert.deepEqual(Object.keys(memberView(f.s, owner.id).state.corridorProgress), [
    f.project,
  ]);
});

await test('CP2 a steward sees every woodlot; a member sees their own rows and counts only', () => {
  const f = spineCoop();
  reviewWatershedLayers(f);
  const s = memberView(f.s, owner.id).state.corridorProgress[f.project];
  const m = memberView(f.s, member.id).state.corridorProgress[f.project];
  assert.equal(s.rows.length, 9);
  assert.deepEqual(m.rows.map((r) => r.parcelId).sort(), [
    'woodlot-4',
    'woodlot-5',
  ]);
  // The same four counts for both, and nothing else about neighbours.
  for (const k of ['woodlots', 'joined', 'onCorridor', 'onCorridorJoined'])
    assert.equal(m[k], s[k], k);
  const text = JSON.stringify(m);
  for (const hidden of ['woodlot-1', 'woodlot-2', 'woodlot-9', 'Woodlot 1'])
    assert.ok(!text.includes(`"${hidden}"`), `${hidden} is not named`);
  assert.ok(!text.includes('coordinates'), 'no geometry in progress');
  assert.deepEqual(Object.keys(m.rows[0]).sort(), [
    'boundary',
    'joined',
    'name',
    'onCorridor',
    'parcelId',
  ]);
});

await test('CP3 joined is exactly what the engine counts as committed', () => {
  const f = spineCoop();
  reviewWatershedLayers(f);
  const covered = consentParcels(f.s, f.project)
    .filter((p) => p.properties.consent === 'covered')
    .map((p) => p.properties.dfm_id)
    .sort();
  const p = steward(f);
  assert.deepEqual(
    p.rows
      .filter((r) => r.joined)
      .map((r) => r.parcelId)
      .sort(),
    covered,
  );
  assert.equal(p.joined, covered.length);
  assert.equal(p.joined, 3);
  // Withdrawing consent un-joins the woodlot at once.
  const none = spineCoop({ consents: false });
  reviewWatershedLayers(none);
  assert.equal(steward(none).joined, 0);
  assert.equal(steward(none).reached.joining, false);
});

await test('CP4 on the corridor compares a reviewed boundary with the reviewed habitat only', () => {
  const f = spineCoop();
  // Without reviewed layers nothing can be said about any woodlot.
  assert.ok(steward(f).rows.every((r) => r.onCorridor === null));
  assert.equal(steward(f).onCorridor, 0);
  reviewWatershedLayers(f);
  const p = steward(f);
  assert.ok(p.rows.every((r) => typeof r.onCorridor === 'boolean'));
  assert.ok(p.onCorridor > 0 && p.onCorridor <= 9);
  assert.equal(p.onCorridor, p.rows.filter((r) => r.onCorridor).length);
  // A woodlot whose boundary is not reviewed is never placed on the corridor.
  f.run(
    'save_boundary',
    {
      parcelId: 'woodlot-4',
      geometry: f.s.parcels.find((x) => x.id === 'woodlot-4').boundaries.at(-1)
        .geometry,
      consentReference: 'Synthetic boundary statement, again',
    },
    member,
  );
  const row = ordinary(f).rows.find((r) => r.parcelId === 'woodlot-4');
  assert.equal(row.boundary, 'submitted');
  assert.equal(row.onCorridor, null);
  assert.equal(row.joined, false);
});

await test('CP5 the stages are ordered and the result names the first one not reached', () => {
  const f = spineCoop({ consents: false });
  let p = steward(f);
  assert.equal(p.layers, 'none');
  assert.equal(p.next, 'map');
  reviewWatershedLayers(f);
  p = steward(f);
  assert.deepEqual(
    PROGRESS_STAGES.map((s) => p.reached[s]),
    [true, true, true, false, false],
  );
  assert.equal(p.next, 'joining');
  const joined = spineCoop();
  reviewWatershedLayers(joined);
  p = steward(joined);
  assert.equal(p.next, 'whole');
  assert.ok(p.onCorridorJoined < p.onCorridor);
  // The branching pattern is counted from the reviewed layers.
  const pattern = spinePattern(joined.s.woodlandLayers.at(-1).layers);
  assert.deepEqual(p.pattern, pattern);
  assert.ok(pattern.streams > 0 && pattern.maxStreamOrder >= 2);
  assert.ok(pattern.saddle > 0, 'the fixture has saddle links');
  assert.equal(pattern.coreAreas, joined.s.woodlandLayers.at(-1).layers.coreAreas.length);
});

await test('CP6 a boundary that cannot be tested gives no answer and never breaks the member view', () => {
  const f = spineCoop();
  reviewWatershedLayers(f);
  const broken = structuredClone(f.s);
  broken.parcels.find((x) => x.id === 'woodlot-4').boundaries.at(-1).geometry = {
    type: 'Polygon',
    coordinates: 'not coordinates',
  };
  const view = memberView(broken, member.id).state;
  const row = view.corridorProgress[f.project].rows.find(
    (r) => r.parcelId === 'woodlot-4',
  );
  assert.equal(row.onCorridor, null);
  assert.equal(view.parcels.length, 2);
});

await test('the panel states the aim, keeps the caveat and leads the Woodland tab', async () => {
  const view = await read('components/woodland-progress.tsx');
  assert.match(view, /branches along the streams,\s+valleys and ridges/);
  assert.match(view, /Each woodlot is a node/);
  assert.match(
    view,
    /does not establish species\s+movement, genetics, regulatory compliance or old-growth condition/,
  );
  assert.doesNotMatch(view, /certif/i);
  assert.doesNotMatch(view, /@turf/, 'the browser never loads Turf here');
  const panel = await read('components/woodland-panel.tsx');
  assert.ok(
    panel.indexOf('<WoodlandProgress') < panel.indexOf('Corridor layers</h3>'),
    'progress comes before the layers',
  );
  void reviewer;
});

await test('the rest of the app points at the corridor: a line above the tabs and a join path in Parcels', async () => {
  const app = await read('components/network-app.tsx');
  // The line shows on every tab but the Woodland tab itself, and only with woodland on.
  assert.match(
    app,
    /workspaceTab !== 'woodland' && data\.features\?\.woodland && \(\s*<CorridorStrip/,
  );
  // In a woodland project a parcel is a woodlot and consent is how its owner joins.
  for (const copy of [
    'Each woodlot is a node on the corridor',
    'Joined the corridor: the owner’s consent is reviewed.',
    'Join the corridor: record the owner’s consent for this woodlot',
    'Submit consent to join for review',
    'Review consent to join',
  ])
    assert.ok(app.includes(copy), copy);
  // Every state short of joined names one next step.
  assert.equal((app.match(/Not joined yet\. Next: /g) ?? []).length, 5);
  // Other project kinds keep the pooling wording.
  for (const copy of [
    'Submit pooling consent for review',
    'Review pooling consent',
    'Current pooling consent needed',
  ])
    assert.ok(app.includes(copy), copy);
  const view = await read('components/woodland-progress.tsx');
  assert.match(view, /export function CorridorStrip/);
  assert.match(view, /Record the owner’s consent/);
  assert.doesNotMatch(app + view, /certified/i);
});
