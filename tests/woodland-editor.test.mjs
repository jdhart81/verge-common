import { memberView } from '../lib/network.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkConnectivitySync, LIGHT_INTENSITIES } from '@viridis/dfm-core';
import {
  LAYER_TYPES,
  newFeature,
  withPoints,
  featurePoints,
  editorFeature,
  featureProblems,
  draftProblems,
  sizeReport,
  emptyLayers,
  importDraft,
  jsonBytes,
} from '../lib/woodland-editor.mjs';
import {
  woodlandCheckInput,
  consentParcels,
  previewTreatmentCheck,
} from '../lib/woodland.mjs';
import {
  setup,
  reviewedLayers,
  layers,
  params,
  cut,
  away,
  plan,
  byId,
  rect,
} from './woodland-editor-fixture.mjs';
const valid = (layer) =>
  withPoints(
    newFeature(layer),
    layer === 'crossings'
      ? [[1, 1]]
      : layer === 'roads'
        ? [
            [0, 0],
            [1, 1],
          ]
        : [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
  );
for (const [layer, type] of Object.entries(LAYER_TYPES)) {
  await test(`M2/M4 ${layer} produces only ${type} and rejects other geometry`, () => {
    const f = valid(layer);
    if (layer === 'treatments') f.properties.intensity = 'clearcut';
    assert.equal(f.geometry.type, type);
    assert.deepEqual(featureProblems(layer, f, LIGHT_INTENSITIES), []);
    for (const other of [
      'Point',
      'LineString',
      'Polygon',
      'MultiPolygon',
      'MultiLineString',
      'GeometryCollection',
    ])
      if (other !== type)
        assert.ok(
          featureProblems(layer, {
            ...f,
            geometry: { type: other, coordinates: [] },
          }).length,
        );
    assert.throws(
      () =>
        importDraft(
          {
            layers: {
              [layer]: [
                { ...f, geometry: { type: 'MultiPolygon', coordinates: [] } },
              ],
            },
          },
          layer === 'treatments' ? 'plan' : 'layers',
        ),
      /geometry/,
    );
  });
}
await test('M3 stable UUID, defaults, editable core classes and crossing passages', () => {
  const f = newFeature('coreAreas');
  assert.match(
    f.properties.dfm_id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.equal(withPoints(f, [[0, 0]]).properties.dfm_id, f.properties.dfm_id);
  const legacy = editorFeature('coreAreas', {
    ...valid('coreAreas'),
    properties: { dfm_id: 'legacy' },
  });
  assert.match(legacy.properties.dfm_id, /^[0-9a-f-]{36}$/);
  assert.equal(
    editorFeature('coreAreas', legacy).properties.dfm_id,
    legacy.properties.dfm_id,
  );
  assert.equal(f.properties.core_class, 'old-growth-candidate');
  assert.equal(newFeature('crossings').properties.passage, 'assumed');
  const core = valid('coreAreas');
  core.properties.core_class = 'old-growth-verified';
  core.properties.evidence_id = 'evidence';
  assert.ok(
    featureProblems('coreAreas', core).some((p) => /elsewhere/.test(p)),
  );
  const crossing = valid('crossings');
  crossing.properties.passage = 'bad';
  assert.ok(
    featureProblems('crossings', crossing).some((p) => /passage/.test(p)),
  );
});
await test('M3 treatment intensity, light choices from engine, and required permission reason', () => {
  const f = valid('treatments');
  assert.ok(
    featureProblems('treatments', f, LIGHT_INTENSITIES).some((p) =>
      /Intensity/.test(p),
    ),
  );
  f.properties.intensity = 'custom landholder prescription';
  assert.deepEqual(featureProblems('treatments', f, LIGHT_INTENSITIES), []);
  f.properties.corridor_permitted = true;
  assert.ok(featureProblems('treatments', f, LIGHT_INTENSITIES).length);
  for (const intensity of LIGHT_INTENSITIES) {
    f.properties.intensity = intensity;
    f.properties.reason = 'Field prescription';
    assert.deepEqual(featureProblems('treatments', f, LIGHT_INTENSITIES), []);
  }
  f.properties.reason = ' ';
  assert.ok(featureProblems('treatments', f, LIGHT_INTENSITIES).length);
});
await test('M4 invalid polygons, closure, crossing, duplicates, bounds and corner count', () => {
  const f = valid('retained');
  const invalid = [
    withPoints(f, [
      [0, 0],
      [1, 1],
      [0, 1],
      [1, 0],
    ]),
    withPoints(f, [
      [0, 0],
      [1, 0],
    ]),
    withPoints(f, [
      [0, 0],
      [181, 0],
      [1, 1],
    ]),
    withPoints(f, [
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 1],
    ]),
    {
      ...f,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        ],
      },
    },
    withPoints(
      f,
      Array.from({ length: 201 }, (_, i) => [
        Math.cos((i / 201) * 2 * Math.PI),
        Math.sin((i / 201) * 2 * Math.PI),
      ]),
    ),
  ];
  for (const x of invalid) assert.ok(featureProblems('retained', x).length);
  assert.equal(featurePoints(f).length, 4);
});
await test('M4 line/point range, vertex count, self-crossing and feature-specific errors', () => {
  const road = valid('roads');
  for (const points of [
    [],
    [[0, 0]],
    [
      [0, 0],
      [181, 0],
    ],
    [
      [0, 0],
      [1, 1],
      [0, 1],
      [1, 0],
    ],
    [
      [0, 0],
      [1, 1],
      [0, 0],
    ],
    Array.from({ length: 201 }, (_, i) => [i / 1000, 0]),
  ])
    assert.ok(featureProblems('roads', withPoints(road, points)).length);
  assert.ok(
    featureProblems(
      'roads',
      withPoints(road, [
        [0, 0],
        [2, 0],
        [1, 0],
      ]),
    ).length,
  );
  const crossing = withPoints(newFeature('crossings'), [[0, 91]]);
  crossing.properties.name = 'North crossing';
  assert.match(
    draftProblems(
      { ...emptyLayers(), crossings: [crossing] },
      [],
      LIGHT_INTENSITIES,
    )[0],
    /crossings: North crossing/,
  );
  assert.ok(
    featureProblems('crossings', {
      ...crossing,
      geometry: { type: 'Point', coordinates: [0, 0, 0] },
    }).length,
  );
  const dup = valid('coreAreas');
  assert.ok(
    draftProblems(
      { ...emptyLayers(), coreAreas: [dup, dup] },
      [],
      LIGHT_INTENSITIES,
    ).some((p) => /unique/.test(p)),
  );
});
await test('M5 exact bytes, 90k/40k, 400 features, 50 units and strict full-body <100k', () => {
  const l = emptyLayers(),
    t = [valid('treatments')];
  t[0].properties.intensity = 'clearcut';
  const small = sizeReport(
    'plan',
    l,
    t,
    { projectId: 'p', treatments: t },
    { id: 'coop', version: 1, op: 'submit_treatment_plan' },
  );
  assert.equal(small.bytes, jsonBytes(t));
  assert.deepEqual(small.problems, []);
  const huge = structuredClone(t);
  huge[0].properties.name = 'é'.repeat(21000);
  assert.ok(
    sizeReport('plan', l, huge, {}).problems.some((p) => /40000/.test(p)),
  );
  const big = {
    ...l,
    retained: [
      { ...valid('retained'), properties: { name: 'x'.repeat(90000) } },
    ],
  };
  assert.ok(
    sizeReport('layers', big, [], {}).problems.some((p) => /90000/.test(p)),
  );
  assert.ok(
    sizeReport(
      'layers',
      { ...l, roads: Array(401).fill(valid('roads')) },
      [],
      {},
    ).problems.some((p) => /400/.test(p)),
  );
  assert.ok(
    sizeReport('plan', l, Array(51).fill(t[0]), {}).problems.some((p) =>
      /50/.test(p),
    ),
  );
  const envelope = { id: 'coop', version: 1, op: 'save_woodland_layers' };
  const n =
    100000 - sizeReport('layers', l, [], { notes: '' }, envelope).requestBytes;
  assert.ok(
    sizeReport(
      'layers',
      l,
      [],
      { notes: 'x'.repeat(n) },
      envelope,
    ).problems.some((p) => /under 100000/.test(p)),
  );
  assert.ok(
    !sizeReport('layers', l, [], { notes: 'x'.repeat(n - 1) }, envelope)
      .problems.length,
  );
});
await test('M1/M8 local preview equals server status, lostLinks and checksum on original fixture', () => {
  const f = setup();
  reviewedLayers(f);
  for (const units of [[cut], [away], [cut, away]]) {
    const input = woodlandCheckInput(
      f.s.woodlandLayers.at(-1).layers,
      units,
      consentParcels(f.s, f.project),
      params,
    );
    const local = checkConnectivitySync(input);
    const original = checkConnectivitySync({
      ...f.s.woodlandLayers.at(-1).layers,
      treatments: units,
      parcels: consentParcels(f.s, f.project),
      params,
    });
    assert.deepEqual(
      local,
      original,
      'refactor must preserve the original engine input and result',
    );
    const p = byId(f, plan(f, units));
    const serverPreview = previewTreatmentCheck(f.s, f.project, units);
    for (const k of ['status', 'lostLinks', 'inputChecksum']) {
      assert.deepEqual(local[k], p.check[k]);
      assert.deepEqual(local[k], serverPreview[k]);
    }
    // Match the original persisted filtering/rounding byte for byte.
    const { geometry, ...rest } = original;
    const expected = JSON.parse(
      JSON.stringify(
        {
          ...rest,
          geometry: {
            type: 'FeatureCollection',
            features: geometry.features.filter(
              (x) => x.properties.dfm_layer === 'connectivity-loss',
            ),
          },
        },
        (k, v) =>
          typeof v === 'number' && k !== 'version'
            ? Math.round(v * 1e7) / 1e7
            : v,
      ),
    );
    assert.equal(JSON.stringify(p.check), JSON.stringify(expected));
  }
});
await test('M8 shared input truncates properties exactly as the server and preserves parcel consent shape', () => {
  const f = setup();
  reviewedLayers(f);
  const p = f.run('record_parcel', {
    projectId: f.project,
    name: 'Private',
    landReference: 'fixture',
    areaSquareMetres: 1e6,
    consentReference: 'fixture',
  });
  f.run('review_parcel', { id: p, decision: 'approve' }, { id: 'reviewer' });
  const b = f.run('save_boundary', {
    parcelId: p,
    geometry: rect(0, 0, 1000, 1000),
    consentReference: 'Fixture consent',
  });
  f.run(
    'review_boundary',
    { parcelId: p, id: b, decision: 'approve' },
    { id: 'reviewer' },
  );
  const parcels = consentParcels(f.s, f.project);
  assert.equal(parcels[0].properties.consent, 'none');
  const treatment = {
    ...away,
    properties: {
      ...away.properties,
      name: 'é'.repeat(320),
      unexpected: 'discard',
    },
  };
  const input = woodlandCheckInput(layers(), [treatment], parcels, params);
  assert.equal(input.treatments[0].properties.name.length, 300);
  assert.equal(input.treatments[0].properties.unexpected, undefined);
  const local = checkConnectivitySync(
    woodlandCheckInput(
      f.s.woodlandLayers.at(-1).layers,
      [treatment],
      parcels,
      params,
    ),
  );
  const stored = byId(f, plan(f, [treatment]));
  assert.equal(local.inputChecksum, stored.check.inputChecksum);
});
await test('M6/M7/M8 gated lazy UI, explicit basemap opt-in and no persistent drafts', async () => {
  const app = await readFile(
    new URL('../components/network-app.tsx', import.meta.url),
    'utf8',
  );
  const editor = await readFile(
    new URL('../components/woodland-map-editor.tsx', import.meta.url),
    'utf8',
  );
  const map = await readFile(
    new URL('../components/woodland-map.tsx', import.meta.url),
    'utf8',
  );
  assert.match(app, /const WoodlandPanel = lazy/);
  assert.match(app, /data.features\?\.woodland && \(/);
  assert.match(editor, /mapOn && \(\s*<Suspense/);
  assert.match(editor, /Load background map/);
  assert.doesNotMatch(
    editor + map,
    /localStorage|sessionStorage|indexedDB|nominatim|geocod/i,
  );
  assert.match(editor, /await import\('@viridis\/dfm-core'\)/);
  assert.doesNotMatch(editor, /import .* from '@viridis\/dfm-core'/);
  assert.match(editor, /disabled=\{blocked/);
});
await test('M9 keyboard feature/vertex actions, text legend and wrapping layout', async () => {
  const s = await readFile(
    new URL('../components/woodland-map-editor.tsx', import.meta.url),
    'utf8',
  );
  for (const label of [
    'Select feature',
    'Delete feature',
    'Add coordinate',
    'Update vertex',
    'Remove vertex',
    'Undo',
    'Redo',
    'Longitude',
    'Latitude',
  ])
    assert.ok(s.includes(label));
  assert.match(s, /flex flex-wrap/);
  assert.match(s, /Legend:/);
});

await test('M6 non-steward member projection never includes another member parcel geometry', () => {
  const f = setup();
  reviewedLayers(f);
  const id = f.run('record_parcel', {
    projectId: f.project,
    name: 'Private landholder',
    landReference: 'Private deed',
    areaSquareMetres: 1e6,
    consentReference: 'Private consent',
  });
  f.run('review_parcel', { id, decision: 'approve' }, { id: 'reviewer' });
  const boundary = f.run('save_boundary', {
    parcelId: id,
    geometry: rect(0, 0, 1000, 1000),
    consentReference: 'Private boundary reference',
  });
  f.run(
    'review_boundary',
    { parcelId: id, id: boundary, decision: 'approve' },
    { id: 'reviewer' },
  );
  const consent = f.run('record_parcel_consent', {
    parcelId: id,
    holder: 'Private holder',
    authority: 'Private authority',
    reference: 'Private reference',
    scope: 'Private scope',
    attested: true,
  });
  f.run(
    'review_parcel_consent',
    { parcelId: id, id: consent, decision: 'approve', note: 'Private review' },
    { id: 'reviewer' },
  );
  const view = memberView(f.s, 'member');
  assert.deepEqual(view.state.parcels, []);
  assert.equal(view.state.woodlandParcels, undefined);
  assert.ok(
    !JSON.stringify(view).includes(JSON.stringify(rect(0, 0, 1000, 1000))),
  );
  assert.equal(memberView(f.s, 'owner').state.parcels.length, 1);
});

await test('Member GET and POST responses use the privacy-filtered view without an extra parcel projection', async () => {
  const route = await readFile(
    new URL('../app/api/workspaces/route.ts', import.meta.url),
    'utf8',
  );
  assert.match(route, /\.\.\.memberView\(state, user.id\)/);
  assert.match(route, /\.\.\.memberView\(result.state, user.id\)/);
  assert.doesNotMatch(
    route,
    /woodlandEditorView|woodlandParcels|consentParcels/,
  );
});
