// The old-growth spine in woodland projects (dfm-core 0.2.0). Each test names the invariant it
// checks: WS1–WS5 in lib/woodland.mjs and lib/woodland-input.mjs, WS4/WS8/WS9/WS11 in
// lib/woodland-spine.mjs, WS7/WS10 in server/woodland-analysis.mjs and
// self-hosted/woodland-analysis.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  ENGINE_VERSION,
  SPINE_LINK_KINDS,
  checkConnectivitySync,
  buildOutFrontier,
  projectSpine,
  climateRoutes,
} from '@viridis/dfm-core';
import { memberView } from '../lib/network.mjs';
import {
  cleanFeatures,
  cleanLayers,
  checkLayers,
  woodlandCheckInput,
  consentParcels,
  LAYER_KEYS,
  SPINE_PROPERTIES,
} from '../lib/woodland-input.mjs';
import { WOODLAND_OPS } from '../lib/woodland.mjs';
import {
  LINK_KINDS,
  spineParams,
  spineProblems,
  spineAnalysisInput,
  spineResultForViewer,
} from '../lib/woodland-spine.mjs';
import { runSpineAnalysis } from '../lib/woodland-spine-run.mjs';
import {
  reviewer,
  member,
  NOW,
  spineCoop,
  reviewWatershedLayers,
  watershedLayers,
} from './woodland-spine-fixture.mjs';
import { watershed, withAges } from './dfm-watershed-fixture.mjs';

const pair = (a, b) => ({ a, b });
// npm pack of hdfm-framework packages/dfm-core at 2db6710 (#44 merged), the same bytes as its
// web/vendor tarball.
const PUBLISHED_0_2_0_SHA256 =
  'dd5d1f41a1cb24ff49cfeb851ab0eaa13df2fa311ffb2fd5a4597046069d16f9';

await test('WS1 the vendored engine is dfm-core 0.2.0 as merged, and every link kind offered here is an engine kind', async () => {
  const tgz = await readFile(
    new URL('../vendor/viridis-dfm-core-0.2.0.tgz', import.meta.url),
  );
  assert.equal(
    createHash('sha256').update(tgz).digest('hex'),
    PUBLISHED_0_2_0_SHA256,
    'vendor/ must hold the exact npm pack of hdfm-framework packages/dfm-core 0.2.0',
  );
  const pkg = JSON.parse(
    await readFile(
      new URL(
        '../node_modules/@viridis/dfm-core/package.json',
        import.meta.url,
      ),
    ),
  );
  assert.equal(pkg.version, '0.2.0');
  assert.equal(ENGINE_VERSION, 'dfm-connectivity-0.2.0');
  // VergeCommon offers the forest link kinds; the engine also reads flat-land kinds
  // (swale, moraine, right-of-way, hedgerow and others) that woodland projects do not offer yet.
  for (const kind of LINK_KINDS) assert.ok(SPINE_LINK_KINDS.includes(kind), kind);
});

await test('WS2 a version without spine lines stores, checks and checksums as before', () => {
  const f = spineCoop({ consents: false, planned: false });
  const { layers, params } = watershedLayers();
  const only = (keys) => (f) => ({
    ...f,
    properties: Object.fromEntries(keys.map((k) => [k, f.properties[k]])),
  });
  const plain = {
    coreAreas: layers.coreAreas.map(only(['dfm_id', 'core_class'])),
    retained: layers.retained.map(only(['dfm_id'])),
    roads: layers.roads,
    water: [],
    crossings: layers.crossings,
    streams: [],
    connectors: [],
  };
  const base = {
    minWidthM: params.minWidthM,
    minWidthSource: params.minWidthSource,
    roadWidthM: params.roadWidthM,
  };
  const id = f.run('save_woodland_layers', {
    projectId: f.project,
    layers: plain,
    params: base,
  });
  const version = f.s.woodlandLayers.find((v) => v.id === id);
  assert.deepEqual(Object.keys(version.layers), [...LAYER_KEYS]);
  assert.deepEqual(version.params, base);
  const input = woodlandCheckInput(version.layers, [], [], version.params);
  assert.deepEqual(Object.keys(input).sort(), [
    'boundary',
    'coreAreas',
    'crossings',
    'params',
    'parcels',
    'retained',
    'roads',
    'treatments',
    'water',
  ]);
  assert.equal(checkConnectivitySync(input).status, 'pass');
  assert.deepEqual(checkLayers({ streams: [], retained: [] }), {
    retained: [],
  });
});

await test('WS3 layer cleaning keeps spine properties; treatment cleaning is unchanged', () => {
  const props = {
    dfm_id: 'x',
    stream_order: 2,
    kind: 'saddle',
    spine: true,
    origin: 'stream',
    source_id: 'h1',
    width_source: 'Table',
    stand_age: 90,
    temp_c: 6.5,
    secret: 'dropped',
  };
  const feature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [0, 0] },
    properties: props,
  };
  const layer = cleanLayers({ retained: [feature] }).retained[0].properties;
  for (const k of SPINE_PROPERTIES) assert.equal(layer[k], props[k], k);
  assert.equal(layer.secret, undefined);
  const unit = cleanFeatures([feature], 'treatments', 50)[0].properties;
  assert.deepEqual(unit, { dfm_id: 'x' });
});

await test('WS4 optional spine settings are kept only when set and validated with sources', () => {
  assert.deepEqual(spineParams({ minWidthM: 100, ageAsOfYear: '' }), {});
  assert.deepEqual(
    spineParams({
      spineWidthByOrderM: { 1: 115, 2: '', 3: '180' },
      milestoneYears: ['2030', 2040],
      climateSource: '  IPCC ',
      oldGrowthAgeYears: '150',
    }),
    {
      spineWidthByOrderM: { 1: 115, 3: 180 },
      milestoneYears: [2030, 2040],
      climateSource: 'IPCC',
      oldGrowthAgeYears: 150,
    },
  );
  const problems = (layers, params) =>
    spineProblems(layers, { minWidthM: 100, ...params }, 2026).join(' ');
  assert.match(
    problems({}, { spineWidthByOrderM: { 1: 140, 2: 120 } }),
    /never gets a narrower corridor.*Record where the spine widths/,
  );
  assert.match(
    problems({}, { spineWidthByOrderM: { 1: 90 }, spineWidthSource: 's' }),
    /at least the minimum width/,
  );
  assert.match(
    problems({}, { connectorWidthM: 120 }),
    /where the link width comes from/,
  );
  assert.match(problems({}, { ageAsOfYear: 2027 }), /from 1800 to 2026/);
  assert.match(
    problems({}, { oldGrowthAgeYears: 150 }),
    /old-growth age comes from/,
  );
  assert.match(
    problems({}, { milestoneYears: [2040, 2030] }),
    /must increase/,
  );
  assert.match(
    problems({}, { climateWarmingC: 2 }),
    /warming target comes from/,
  );
  const core = (properties) => ({
    type: 'Feature',
    geometry: null,
    properties: { dfm_id: 'c', ...properties },
  });
  assert.match(
    problems({ coreAreas: [core({ temp_c: 70 })] }, { coreTempSource: 's' }),
    /between −60 and 60/,
  );
  assert.match(
    problems({ coreAreas: [core({ temp_c: 6 })] }, {}),
    /core temperatures come from/,
  );
  assert.match(
    problems({ retained: [core({ stand_age: -1, origin: 'river' })] }, {}),
    /stand age.*origin must be/,
  );
  assert.match(
    problems({ streams: [core({ stream_order: 2.5 })] }, {}),
    /whole number from 1 to 12/,
  );
  assert.match(
    problems({ connectors: [core({ kind: 'bridge' })] }, {}),
    /ridge, valley or saddle/,
  );
  assert.equal(problems(watershedLayers().layers, watershedLayers().params), '');
});

await test('WS5 spine lines save only when the engine can draft them; versions stay within the size limit', () => {
  const f = spineCoop({ consents: false, planned: false });
  const id = reviewWatershedLayers(f);
  const version = f.s.woodlandLayers.find((v) => v.id === id);
  assert.equal(version.status, 'reviewed');
  assert.equal(version.layers.streams.length, 12);
  assert.equal(version.layers.connectors.length, 2);
  assert.ok(version.layers.retained.every((r) => r.properties.spine === true));
  const bytes = new TextEncoder().encode(
    JSON.stringify(version.layers),
  ).length;
  assert.ok(bytes < 90_000, `${bytes} bytes`);
  // A stream without an order, or a width table that narrows downstream, is refused.
  assert.throws(
    () =>
      reviewWatershedLayers(f, ({ layers, params }) => ({
        layers: {
          ...layers,
          streams: layers.streams.map((s, i) =>
            i ? s : { ...s, properties: { dfm_id: s.properties.dfm_id } },
          ),
        },
        params,
      })),
    /spine settings cannot be used: Stream h1: stream order/,
  );
  assert.throws(
    () =>
      reviewWatershedLayers(f, ({ layers, params }) => ({
        layers,
        params: { ...params, spineWidthByOrderM: { 1: 180, 3: 115 } },
      })),
    /narrower corridor/,
  );
  // A line shorter than 1 m is caught by the engine's own drafting rules.
  assert.throws(
    () =>
      reviewWatershedLayers(f, ({ layers, params }) => ({
        layers: {
          ...layers,
          connectors: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [0.001, 0.001],
                  [0.001000001, 0.001],
                ],
              },
              properties: { dfm_id: 'tiny', kind: 'ridge' },
            },
          ],
        },
        params,
      })),
    /spine lines cannot be drafted: .*shorter than 1 m/,
  );
});

await test('WS9 planned join years are projection assumptions set by the recorder or a steward', () => {
  assert.ok(WOODLAND_OPS.includes('plan_parcel_join'));
  const f = spineCoop({ consents: false, planned: false });
  f.run('plan_parcel_join', { parcelId: 'woodlot-4', year: 2031 }, member);
  assert.equal(
    f.s.parcels.find((p) => p.id === 'woodlot-4').plannedJoinYear,
    2031,
  );
  assert.throws(
    () =>
      f.run('plan_parcel_join', { parcelId: 'woodlot-1', year: 2031 }, member),
    /steward/i,
  );
  f.run('plan_parcel_join', { parcelId: 'woodlot-1', year: 2033 }, reviewer);
  assert.throws(
    () => f.run('plan_parcel_join', { parcelId: 'woodlot-4', year: 2026 }),
    /after 2026/,
  );
  assert.throws(
    () => f.run('plan_parcel_join', { parcelId: 'woodlot-4', year: '2030' }),
    /after 2026/,
  );
  f.run('plan_parcel_join', { parcelId: 'woodlot-4', year: null }, member);
  assert.equal(
    f.s.parcels.find((p) => p.id === 'woodlot-4').plannedJoinYear,
    undefined,
  );
  // Members never see another member's planned year: parcels stay owner-or-steward.
  const seen = memberView(f.s, member.id).state.parcels.map((p) => p.id);
  assert.deepEqual(seen.sort(), ['woodlot-4', 'woodlot-5']);
});

await test('WS9 analysis input: consent years from reviews, planned years ahead only, ages rolled to the analysis year', () => {
  const f = spineCoop();
  const id = reviewWatershedLayers(f);
  assert.throws(
    () => spineAnalysisInput(spineCoop().s, f.project, { now: NOW }),
    /review the woodland layers/,
  );
  const { input, context } = spineAnalysisInput(f.s, f.project, { now: NOW });
  assert.equal(context.layersVersionId, id);
  assert.equal(context.analysisYear, 2026);
  assert.equal(context.ageShiftYears, 0);
  const years = Object.fromEntries(
    input.parcels.map((p) => [
      p.properties.dfm_id,
      [p.properties.consent, p.properties.consent_year ?? p.properties.planned_year ?? null],
    ]),
  );
  assert.deepEqual(years, {
    'woodlot-1': ['covered', 2024],
    'woodlot-2': ['covered', 2025],
    'woodlot-3': ['covered', 2026],
    'woodlot-4': ['none', 2030],
    'woodlot-5': ['none', 2032],
    'woodlot-6': ['none', null],
    'woodlot-7': ['none', 2040],
    'woodlot-8': ['none', 2045],
    'woodlot-9': ['none', null],
  });
  assert.deepEqual(input.params.milestoneYears, [2026, 2036, 2051, 2076, 2126]);
  // The consent parcels used by the corridor check are unchanged (no years in them).
  assert.ok(
    consentParcels(f.s, f.project).every(
      (p) => Object.keys(p.properties).join() === 'dfm_id,consent',
    ),
  );
  // Five years on: ages grow by five, the 2030 plan has lapsed, milestones start in 2031.
  const later = spineAnalysisInput(f.s, f.project, {
    now: Date.UTC(2031, 2, 1),
  });
  assert.equal(later.context.ageShiftYears, 5);
  assert.equal(later.input.params.ageAsOfYear, 2031);
  assert.equal(later.input.params.milestoneYears[0], 2031);
  const h1 = (inp) =>
    inp.retained.find((r) => r.properties.source_id === 'h1').properties
      .stand_age;
  assert.equal(h1(later.input), h1(input) + 5);
  assert.equal(
    later.input.parcels.find((p) => p.properties.dfm_id === 'woodlot-4')
      .properties.planned_year,
    undefined,
  );
  assert.throws(
    () => spineAnalysisInput(f.s, f.project, { now: NOW, planId: 'missing' }),
    /Treatment plan not found/,
  );
});

await test('WS8 + engine parity: co-op analyses reproduce the DFM watershed results', () => {
  const f = spineCoop();
  reviewWatershedLayers(f);
  const { input } = spineAnalysisInput(f.s, f.project, { now: NOW });
  const frontier = runSpineAnalysis('frontier', input);
  assert.equal(frontier.status, 'ok');
  assert.deepEqual(
    frontier.frontier.map((e) => e.parcel),
    ['woodlot-4', 'woodlot-5', 'woodlot-9', 'woodlot-7', 'woodlot-8'],
  );
  assert.deepEqual(frontier.frontier[0].completesLinks, [
    pair('core-e', 'core-n'),
    pair('core-e', 'core-s'),
  ]);
  assert.deepEqual(frontier.committed.parcels, [
    'woodlot-1',
    'woodlot-2',
    'woodlot-3',
  ]);
  // The same answer as the engine on the fixture's own input (WS1/WS8 parity).
  const fixture = {
    ...watershed({ treatments: [] }),
    retained: withAges(watershedLayers().layers.retained),
  };
  assert.deepEqual(
    buildOutFrontier(fixture).frontier.map((e) => [e.parcel, e.completesLinks]),
    frontier.frontier.map((e) => [e.parcel, e.completesLinks]),
  );
  const outlook = runSpineAnalysis('outlook', input);
  assert.equal(outlook.status, 'ok');
  const counts = outlook.milestones.map((m) => [
    m.year,
    m.committedLinks.length,
    m.oldGrowthAgeLinks.length,
  ]);
  assert.deepEqual(
    counts,
    projectSpine(fixture, { years: [2026, 2036, 2051, 2076, 2126] }).milestones.map(
      (m) => [m.year, m.committedLinks.length, m.oldGrowthAgeLinks.length],
    ),
  );
  const climate = runSpineAnalysis('climate', input);
  assert.deepEqual(
    climate.cores.map((c) => [c.id, c.status]),
    climateRoutes(fixture).cores.map((c) => [c.id, c.status]),
  );
  // WS8: any other member gets the build-out total only. A per-woodlot row would reveal where
  // neighbours have consented (its place in the order and the links it completes).
  const seen = spineResultForViewer('frontier', frontier, {
    steward: false,
    ownParcelIds: ['woodlot-4', 'woodlot-5'],
    parcelIds: input.parcels.map((p) => p.properties.dfm_id),
  });
  assert.deepEqual(seen.frontier, []);
  assert.deepEqual(seen.laterParcels, []);
  assert.equal(seen.frontierForStewards, true);
  assert.deepEqual(seen.committed.parcels, []);
  assert.equal(seen.committed.parcelCount, 3);
  assert.equal(seen.committed.spineM2, frontier.committed.spineM2);
  assert.equal(seen.committed.share, frontier.committed.share);
  const view = spineResultForViewer('outlook', outlook, {
    steward: false,
    ownParcelIds: ['woodlot-4'],
  });
  assert.deepEqual(
    view.milestones.map((m) => [m.committedParcels, m.committedParcelCount]),
    [
      [[], 3],
      [['woodlot-4'], 5],
      [['woodlot-4'], 7],
      [['woodlot-4'], 7],
      [['woodlot-4'], 7],
    ],
  );
  assert.equal(
    spineResultForViewer('frontier', frontier, { steward: true }),
    frontier,
  );
});

await test('WS8 messages naming another member’s woodlot are reworded for non-stewards', () => {
  const mine = '11111111-1111-4111-8111-111111111111';
  const theirs = '22222222-2222-4222-8222-222222222222';
  const core = '33333333-3333-4333-8333-333333333333';
  const result = {
    status: 'incomplete',
    reasons: [
      `Parcel ${theirs} consent_year must be a year.`,
      `Core ${core} has no width source.`,
    ],
    warnings: [`Parcel ${mine} already has covering consent.`],
  };
  const seen = spineResultForViewer('outlook', result, {
    steward: false,
    ownParcelIds: [mine],
    parcelIds: [mine, theirs],
  });
  // Only other members' woodlot ids are reworded; core, line and unit ids every member already
  // sees in the reviewed layers are left alone, so the message stays actionable.
  assert.deepEqual(seen.reasons, [
    'Parcel another woodlot consent_year must be a year.',
    `Core ${core} has no width source.`,
  ]);
  assert.deepEqual(seen.warnings, result.warnings);
  assert.equal(
    spineResultForViewer('outlook', result, { steward: true }),
    result,
  );
});

await test('WS8 a member’s projection uses only the planned join years of woodlots they recorded', () => {
  const f = spineCoop();
  reviewWatershedLayers(f);
  const planned = (viewer) =>
    Object.fromEntries(
      spineAnalysisInput(f.s, f.project, { now: NOW, viewer })
        .input.parcels.filter((p) => p.properties.planned_year)
        .map((p) => [p.properties.dfm_id, p.properties.planned_year]),
    );
  const all = {
    'woodlot-4': 2030,
    'woodlot-5': 2032,
    'woodlot-7': 2040,
    'woodlot-8': 2045,
  };
  assert.deepEqual(planned(null), all, 'server-side callers see every year');
  assert.deepEqual(planned({ userId: reviewer.id, steward: true }), all);
  // The member recorded woodlots 4 and 5; years on woodlots 7 and 8 are someone else's.
  assert.deepEqual(planned({ userId: member.id, steward: false }), {
    'woodlot-4': 2030,
    'woodlot-5': 2032,
  });
  // Consent years are records every analysis uses alike: they are not the viewer's to filter.
  const consentYears = (viewer) =>
    spineAnalysisInput(f.s, f.project, { now: NOW, viewer })
      .input.parcels.map((p) => p.properties.consent_year ?? null);
  assert.deepEqual(
    consentYears({ userId: member.id, steward: false }),
    consentYears(null),
  );
});
