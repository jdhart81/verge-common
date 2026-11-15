// Native old growth in woodland projects (dfm-core 0.3.0). Each test names the invariant it
// checks: NO1-NO5 in lib/woodland-spine.mjs, which rest on the engine's O1-O6 and N1-N4.
// Everything runs through ordinary co-op commands on the synthetic watershed co-op: layers are
// saved by one steward and reviewed by another, plans are submitted by a member, and analyses
// read the reviewed layers exactly as the server does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  STAND_ORIGINS as ENGINE_STAND_ORIGINS,
  LIGHT_INTENSITIES,
  checkConnectivitySync,
  deriveSpine,
} from '@viridis/dfm-core';
import {
  cleanFeatures,
  cleanLayers,
  consentParcels,
  woodlandCheckInput,
  NATIVE_PROPERTIES,
  PLANTING_PROPERTIES,
} from '../lib/woodland-input.mjs';
import {
  SPINE_ANALYSES,
  STAND_ORIGINS,
  PLANTING_INTENSITY,
  SUPPORTED_PARAMS,
  spineParams,
  spineProblems,
  spineAnalysisInput,
} from '../lib/woodland-spine.mjs';
import {
  MAX_SPECIES,
  featureProblems,
  importNotes,
  mergeSpineDraft,
} from '../lib/woodland-editor.mjs';
import { runSpineAnalysis } from '../lib/woodland-spine-run.mjs';
import {
  member,
  NOW,
  spineCoop,
  reviewWatershedLayers,
  watershedLayers,
} from './woodland-spine-fixture.mjs';
import { UNITS } from './dfm-watershed-fixture.mjs';

const OLD_GROWTH_AGE = 150; // the fixture's threshold (params.oldGrowthAgeYears)
const MAIN = 'spine-main'; // the main-stem corridor: inside woodlots committed from 2026
const SOURCE = 'Synthetic stand inventory';

/** Reviewed watershed layers with `properties` merged into one retained corridor. */
function coopWith(properties, { id = MAIN, params = {}, drop = [] } = {}) {
  const f = spineCoop();
  const version = reviewWatershedLayers(f, (x) => {
    const target = x.layers.retained.find((r) => r.properties.dfm_id === id);
    assert.ok(target, `${id} is a drafted corridor`);
    Object.assign(target.properties, properties);
    for (const k of drop) delete target.properties[k];
    return { ...x, params: { ...x.params, ...params } };
  });
  return { f, version };
}
const analyse = (f, kind) =>
  runSpineAnalysis(
    kind,
    spineAnalysisInput(f.s, f.project, { now: NOW }).input,
  );
const oldM2 = (outlook) => outlook.milestones.map((m) => m.oldGrowthAgeM2);
const links = (outlook) =>
  outlook.milestones.map((m) => [m.committedLinks, m.committedM2]);

await test('NO1 the editor’s stand origins and species limit are the engine’s', async () => {
  assert.deepEqual([...STAND_ORIGINS], [...ENGINE_STAND_ORIGINS]);
  assert.ok(LIGHT_INTENSITIES.includes(PLANTING_INTENSITY));
  const engine = await readFile(
    new URL(
      '../node_modules/@viridis/dfm-core/src/connectivity.mjs',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(engine, new RegExp(`species: ${MAX_SPECIES}\\b`));
});

await test('NO1 (a) a plantation past the age threshold is not counted at old-growth age', () => {
  // Control: the same stand, the same age past the threshold, naturally regenerating.
  const natural = coopWith({
    stand_age: OLD_GROWTH_AGE + 50,
    stand_origin: 'natural',
    origin_source: SOURCE,
  });
  const control = analyse(natural.f, 'outlook');
  assert.equal(control.status, 'ok');
  assert.ok(
    oldM2(control)[0] > 100_000,
    'the control stand is at old-growth age from the first year',
  );

  const { f, version } = coopWith({
    stand_age: OLD_GROWTH_AGE + 50,
    stand_origin: 'plantation',
    origin_source: SOURCE,
  });
  const stored = f.s.woodlandLayers
    .find((v) => v.id === version)
    .layers.retained.find((r) => r.properties.dfm_id === MAIN).properties;
  assert.equal(stored.stand_origin, 'plantation');
  assert.equal(stored.origin_source, SOURCE);
  const outlook = analyse(f, 'outlook');
  assert.equal(outlook.status, 'ok');
  // Never at old-growth age while it is the only stand old enough (2026 to 2076)...
  assert.deepEqual(oldM2(outlook).slice(0, 4), [0, 0, 0, 0]);
  // ...and not in 2126 either, when every other stand has passed the threshold.
  const without = analyse(coopWith({}).f, 'outlook');
  assert.ok(oldM2(outlook)[4] > 0, 'other stands still reach old-growth age');
  assert.ok(
    oldM2(without)[4] - oldM2(outlook)[4] > 100_000,
    'the plantation is left out of the old-growth area in 2126',
  );
  // The result says so by name, and reports how much committed forest is plantation (O5).
  assert.ok(
    outlook.warnings.some(
      (w) => w.includes(MAIN) && /plantation, which never counts/.test(w),
    ),
    outlook.warnings.join(' | '),
  );
  assert.ok(outlook.milestones.every((m) => m.plantationM2 > 100_000));
  assert.ok(
    outlook.limitations.some((l) => /a plantation never counts/.test(l)),
  );
  // NO4: structure is unchanged. The plantation still carries today's links, in the
  // projection, the network and the corridor check.
  assert.deepEqual(links(outlook), links(control));
  assert.deepEqual(
    analyse(f, 'network').coreLinks,
    analyse(natural.f, 'network').coreLinks,
  );
  // A planted stand that is not a plantation counts by its recorded age.
  const planted = analyse(
    coopWith({
      stand_age: OLD_GROWTH_AGE + 50,
      stand_origin: 'planted',
      origin_source: SOURCE,
    }).f,
    'outlook',
  );
  assert.deepEqual(oldM2(planted), oldM2(control));
});

await test('NO1 (b) a remnant counts at old-growth age in every year', () => {
  const { f, version } = coopWith(
    { remnant: true, remnant_source: 'Synthetic land record: never plowed' },
    { drop: ['stand_age'] },
  );
  const stored = f.s.woodlandLayers
    .find((v) => v.id === version)
    .layers.retained.find((r) => r.properties.dfm_id === MAIN).properties;
  assert.equal(stored.remnant, true);
  assert.equal(stored.stand_age, undefined);
  const outlook = analyse(f, 'outlook');
  assert.equal(outlook.status, 'ok');
  const m2 = oldM2(outlook);
  assert.equal(m2.length, 5);
  assert.ok(
    m2.every((v) => v > 100_000),
    `at old-growth age in every milestone year: ${m2.join(', ')}`,
  );
  assert.ok(
    m2.every((v, i) => i === 0 || v >= m2[i - 1]),
    'never decreasing',
  );
  // Without the remnant record the same stand (60 years old) waits until 2126.
  assert.deepEqual(
    oldM2(analyse(coopWith({}).f, 'outlook')).slice(0, 4),
    [0, 0, 0, 0],
  );
  // A stand cannot be both, and each record needs its source: refused when saved.
  const refuse = (properties, message) =>
    assert.throws(() => coopWith(properties), message);
  refuse({ remnant: true }, /never plowed or clear-cut status comes from/);
  refuse(
    {
      remnant: true,
      remnant_source: 'Synthetic',
      stand_origin: 'plantation',
      origin_source: SOURCE,
    },
    /cannot be both a plantation and never plowed or clear-cut/,
  );
  refuse({ stand_origin: 'plantation' }, /where the stand origin comes from/);
  refuse(
    { stand_origin: 'exotic', origin_source: SOURCE },
    /stand origin must be natural, planted, plantation/,
  );
  refuse({ native_share: 0.4 }, /where the native share comes from/);
  refuse({ native_share: 1.4, composition_source: SOURCE }, /from 0 to 1/);
});

await test('NO2 with a minimum native share, habitat of introduced species never counts at old-growth age', () => {
  const policy = {
    nativeShareMin: 0.9,
    nativeShareSource: 'Synthetic co-op policy',
  };
  // No stand records a share: none counts, and the result reports the shortfall.
  const none = analyse(coopWith({}, { params: policy }).f, 'outlook');
  assert.equal(none.status, 'ok');
  assert.deepEqual(oldM2(none), [0, 0, 0, 0, 0]);
  assert.ok(none.milestones.every((m) => m.belowNativeShareM2 > 0));
  // An old stand of mostly introduced species does not count; a native one does.
  const old = { stand_age: OLD_GROWTH_AGE + 50, composition_source: SOURCE };
  const introduced = analyse(
    coopWith({ ...old, native_share: 0.3 }, { params: policy }).f,
    'outlook',
  );
  assert.equal(oldM2(introduced)[0], 0);
  const native = analyse(
    coopWith({ ...old, native_share: 0.95 }, { params: policy }).f,
    'outlook',
  );
  assert.ok(oldM2(native)[0] > 100_000);
  assert.deepEqual(native.parameters.nativeShareMin, 0.9);
  // The setting needs its source and a share above 0 and at most 1.
  assert.throws(
    () => coopWith({}, { params: { nativeShareMin: 0.9 } }),
    /where the minimum native share comes from/,
  );
  assert.throws(
    () => coopWith({}, { params: { ...policy, nativeShareMin: 1.5 } }),
    /minimum native share must be more than 0 and at most 1/,
  );
});

await test('NO3 a corridor is never replanted with introduced species', () => {
  // A restoration planting drawn across the main stem, marked corridor-permitted.
  const planting = (extra) => ({
    ...UNITS['cut-main'],
    properties: {
      dfm_id: 'cut-main',
      period: '2028',
      intensity: PLANTING_INTENSITY,
      corridor_permitted: true,
      reason: 'Underplanting the main stem',
      ...extra,
    },
  });
  const submit = (extra, params = {}) => {
    const { f } = coopWith({}, { params });
    const id = f.run(
      'submit_treatment_plan',
      {
        projectId: f.project,
        name: 'Main stem planting',
        period: '2028',
        treatments: [planting(extra)],
      },
      member,
      NOW,
    );
    return f.s.treatmentPlans.find((p) => p.id === id);
  };
  const native = [
    { name: 'Acer saccharum', native: true },
    { name: 'Tsuga canadensis', native: true },
  ];
  const source = { native_status_source: 'Synthetic state flora' };
  const blockedFor = (plan, why) => {
    assert.equal(plan.status, 'blocked');
    assert.equal(plan.check.status, 'fail');
    assert.ok(
      plan.check.lostLinks.every((l) => l.causes.includes('cut-main')),
      'the planting is checked like a harvest',
    );
    assert.ok(plan.check.lostLinks.length > 0);
    assert.ok(
      plan.check.warnings.some((w) => w.includes('cut-main') && why.test(w)),
      plan.check.warnings.join(' | '),
    );
  };

  // All native, with a native-status source: permitted, and stored as recorded.
  const ok = submit({ species: native, ...source });
  assert.equal(ok.status, 'submitted');
  assert.equal(ok.check.status, 'pass');
  assert.deepEqual(ok.treatments[0].properties.species, native);
  assert.equal(
    ok.treatments[0].properties.native_status_source,
    source.native_status_source,
  );
  // One introduced species: not permitted, named, and the plan is blocked.
  blockedFor(
    submit({
      species: [...native, { name: 'Picea abies', native: false }],
      ...source,
    }),
    /species recorded as not native \(Picea abies\)/,
  );
  // A list without a native-status source proves nothing.
  blockedFor(submit({ species: native }), /without a native-status source/);
  // Once the layers record a native-status source, every corridor planting lists its species.
  const policy = { nativeStatusSource: 'Synthetic state flora' };
  blockedFor(submit({}, policy), /lists no species/);
  assert.equal(submit({ species: native }, policy).status, 'submitted');
  blockedFor(
    submit({ species: [{ name: 'Picea abies', native: false }] }, policy),
    /species recorded as not native/,
  );
  // NO5: without a list and without the setting, a planting is checked as 0.2.0 checked it.
  assert.equal(submit({}).status, 'submitted');

  // Stored units keep only each species' name and native flag; an over-long list is refused by
  // the engine, never cut short into a valid one.
  const [unit] = cleanFeatures(
    [
      planting({
        species: [{ name: 'x'.repeat(400), native: true, note: 'dropped' }],
        secret: 'dropped',
      }),
    ],
    'treatments',
    50,
  );
  assert.deepEqual(unit.properties.species, [
    { name: 'x'.repeat(300), native: true },
  ]);
  assert.equal(unit.properties.secret, undefined);
  const long = Array.from({ length: MAX_SPECIES + 40 }, (_, i) => ({
    name: `Species ${i}`,
    native: true,
  }));
  const [many] = cleanFeatures([planting({ species: long })], 'treatments', 50);
  assert.equal(many.properties.species.length, MAX_SPECIES + 1);
  const tooMany = submit({ species: long, ...source });
  assert.equal(tooMany.status, 'blocked');
  assert.equal(tooMany.check.status, 'incomplete');
  // The editor names the same problems before a plan is sent.
  const draft = (species, extra = {}) =>
    featureProblems(
      'treatments',
      planting({
        dfm_id: '6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f',
        species,
        ...extra,
      }),
      LIGHT_INTENSITIES,
    ).join(' ');
  assert.equal(draft(native, source), '');
  assert.match(draft([]), /List each planted species by name/);
  assert.match(
    draft([{ name: ' ', native: true }]),
    /List each planted species/,
  );
  assert.match(draft([{ name: 'Acer' }]), /List each planted species/);
  assert.match(draft([native[0], native[0]]), /List each planted species once/);
  assert.match(
    draft(native, { native_status_source: ' ' }),
    /where the native status of the planted species comes from/,
  );
});

await test('NO5 (c) a 0.2.0-style package without the new records gives the same results as before', async () => {
  const before = JSON.parse(
    await readFile(
      new URL('./dfm-results-0.2.0-watershed.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(before.engine, 'dfm-connectivity-0.2.0');
  const f = spineCoop();
  const id = reviewWatershedLayers(f);
  const version = f.s.woodlandLayers.find((v) => v.id === id);
  // Nothing new is stored: no native record on any feature, no native setting.
  for (const list of Object.values(version.layers))
    for (const feature of list)
      for (const k of [...NATIVE_PROPERTIES, ...PLANTING_PROPERTIES])
        assert.equal(feature.properties[k], undefined, k);
  for (const k of ['nativeShareMin', 'nativeShareSource', 'nativeStatusSource'])
    assert.equal(version.params[k], undefined, k);
  // Every analysis and the corridor check: identical apart from the engine version names.
  const same = (now, then, kind) => {
    assert.match(then.engine, /^dfm-(connectivity|spine|outlook)-0\.2\.0$/);
    assert.equal(now.engine, then.engine.replace('0.2.0', '0.3.0'), kind);
    assert.deepEqual({ ...now, engine: null }, { ...then, engine: null }, kind);
  };
  for (const kind of SPINE_ANALYSES)
    same(analyse(f, kind), before.results[kind], kind);
  const { geometry: _geometry, ...check } = checkConnectivitySync(
    woodlandCheckInput(
      version.layers,
      [],
      consentParcels(f.s, f.project),
      version.params,
    ),
  );
  same(check, before.results.check, 'check');
  // The outlook reports the new figures only when something is recorded (O5).
  for (const m of analyse(f, 'outlook').milestones) {
    assert.equal('plantationM2' in m, false);
    assert.equal('belowNativeShareM2' in m, false);
  }
});

await test('NO1-NO3 records and settings are kept only when recorded, and survive a redraft', () => {
  const props = {
    dfm_id: 'x',
    remnant: true,
    remnant_source: 'Land record',
    stand_origin: 'natural',
    origin_source: 'Inventory',
    native_share: 0.92,
    composition_source: 'Survey',
    species: [{ name: 'Acer', native: true }],
    native_status_source: 'Flora',
  };
  const feature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [0, 0] },
    properties: props,
  };
  // Layer features keep the stand records, not planting records; units the reverse.
  const layer = cleanLayers({ retained: [feature] }).retained[0].properties;
  for (const k of NATIVE_PROPERTIES) assert.equal(layer[k], props[k], k);
  for (const k of PLANTING_PROPERTIES) assert.equal(layer[k], undefined, k);
  const unit = cleanFeatures([feature], 'treatments', 50)[0].properties;
  assert.deepEqual(unit, {
    dfm_id: 'x',
    species: [{ name: 'Acer', native: true }],
    native_status_source: 'Flora',
  });
  // Settings: kept only when set (WS4), and known to the uploader.
  assert.deepEqual(
    spineParams({
      nativeShareMin: '0.9',
      nativeShareSource: ' Policy ',
      nativeStatusSource: '',
    }),
    { nativeShareMin: 0.9, nativeShareSource: 'Policy' },
  );
  for (const k of ['nativeShareMin', 'nativeShareSource', 'nativeStatusSource'])
    assert.ok(SUPPORTED_PARAMS.includes(k), k);
  assert.deepEqual(
    spineProblems({ retained: [feature] }, { minWidthM: 100 }, 2026),
    [],
  );
  // A package from the DFM workspace that carries them uploads with nothing left out.
  const pkg = {
    dfm_package: '1.0',
    crs: 'EPSG:4326',
    params: { nativeShareMin: 0.9, nativeShareSource: 'Policy' },
    layers: { retained: [feature], treatments: [feature] },
  };
  assert.deepEqual(
    importNotes(pkg, 'layers').filter((n) => /properties|Settings/.test(n)),
    [
      'Feature properties VergeCommon does not keep: species, native_status_source.',
    ],
  );
  assert.deepEqual(importNotes(pkg, 'plan'), [
    'Feature properties VergeCommon does not keep: remnant, remnant_source, stand_origin, origin_source, native_share, composition_source.',
  ]);
  // Drafting the spine again keeps what a steward recorded on a corridor (WS6).
  const { layers, input } = watershedLayers();
  const recorded = layers.retained.map((r) =>
    r.properties.dfm_id === MAIN
      ? {
          ...r,
          properties: {
            ...r.properties,
            stand_origin: 'plantation',
            origin_source: SOURCE,
            native_share: 0.2,
            composition_source: SOURCE,
          },
        }
      : r,
  );
  const again = mergeSpineDraft(recorded, deriveSpine(input).features).find(
    (r) => r.properties.dfm_id === MAIN,
  ).properties;
  assert.equal(again.stand_origin, 'plantation');
  assert.equal(again.origin_source, SOURCE);
  assert.equal(again.native_share, 0.2);
  assert.equal(again.remnant, undefined);
});

await test('the editor and the spine panel show native old growth and keep the structural caveat', async () => {
  const read = (name) =>
    readFile(new URL(`../components/${name}`, import.meta.url), 'utf8');
  const editor = await read('woodland-map-editor.tsx');
  for (const key of [
    'stand_origin',
    'origin_source',
    'remnant_source',
    'native_share',
    'composition_source',
    'nativeShareMin',
    'nativeShareSource',
    'nativeStatusSource',
    'native_status_source',
    'data-planting-species',
  ])
    assert.ok(editor.includes(key), `editor offers ${key}`);
  assert.match(editor, /Age and origin are\s+reported, never condition/);
  const panel = await read('woodland-spine-panel.tsx');
  for (const key of [
    'plantationM2',
    'belowNativeShareM2',
    'nativeShareMin',
    'nativeStatusSource',
    'data-native-summary',
  ])
    assert.ok(panel.includes(key), `panel shows ${key}`);
  const flat = panel.replace(/\s+/g, ' ');
  assert.ok(
    flat.includes(
      'They are structural only: they do not establish species movement, genetics, regulatory compliance or old-growth condition.',
    ),
  );
  assert.ok(
    flat.includes('Age and origin are reported as recorded, never condition.'),
  );
  // The mapping service is never described as certification.
  for (const source of [editor, panel]) assert.doesNotMatch(source, /certif/i);
  assert.doesNotMatch(editor + panel, /dfm-core 0\.2\.0/);
});
