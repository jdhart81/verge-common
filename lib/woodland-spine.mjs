// The old-growth spine in woodland projects: dfm-core 0.2.0 drafts the spine from stream and
// ridge/valley/saddle lines, tests it as a network, projects it forward in time, finds climate
// routes and the next woodlots to join. This module holds the pure, engine-free parts shared by
// the server, the analysis worker and the browser: parameter cleaning and validation, the
// analysis input built from co-op records, and what each viewer may see of a result.
//
// Invariants (tests in tests/woodland-spine.test.mjs):
//   WS4 Spine and outlook parameters are optional and kept only when set, so a layers version
//       without them stores its parameters exactly as before. Values are validated on save with
//       the engine's ranges, and every width, age and temperature that changes a result needs a
//       recorded source.
//   WS8 Analyses read only the current reviewed layers. Network and climate results hold only
//       reviewed-layer data, which every member already sees. Stewards see every woodlot in
//       outlook and build-out results. Any other member's projection uses planned join years
//       only for woodlots that member recorded; their outlook names only those woodlots, plus
//       counts; and their build-out result is the co-op total only, without per-woodlot rows,
//       because a row's place reveals where neighbours have consented. Messages naming
//       another member's woodlot are reworded. No parcel geometry is ever part of a result.
//   WS9 Time. A woodlot counts as committed from the UTC year its current consent was reviewed.
//       Stand ages recorded as of params.ageAsOfYear (default: the year the layers were saved)
//       are rolled forward to the analysis year, so consent years are never after the engine's
//       ageAsOfYear and milestones never run backwards. A planned join year counts only for a
//       woodlot without current consent and only when it is after the analysis year.
//   WS11 Every analysis records the layers version, the analysis year and the age shift, beside
//       the engine version and input checksum the engine records itself.
import { consentParcels, checkLayers } from './woodland-input.mjs';

export const SPINE_ANALYSES = Object.freeze([
  'network',
  'outlook',
  'climate',
  'frontier',
]);
/** dfm-core SPINE_LINK_KINDS; a test keeps them equal. */
export const LINK_KINDS = Object.freeze(['ridge', 'valley', 'saddle']);
export const SPINE_ORIGINS = Object.freeze(['stream', ...LINK_KINDS]);
export const MAX_STREAM_ORDER = 12;
export const DEFAULT_MILESTONE_OFFSETS = Object.freeze([0, 10, 25, 50, 100]);

const NUMBER_PARAMS = [
  'pinchFraction',
  'connectorWidthM',
  'junctionSnapM',
  'disturbanceWidthM',
  'ageAsOfYear',
  'oldGrowthAgeYears',
  'climateWarmingC',
];
const TEXT_PARAMS = [
  'spineWidthSource',
  'connectorWidthSource',
  'oldGrowthAgeSource',
  'coreTempSource',
  'climateSource',
];
const blank = (v) =>
  v === undefined || v === null || (typeof v === 'string' && !v.trim());

/** Every layer parameter VergeCommon keeps: the corridor check's and the optional spine ones. */
export const SUPPORTED_PARAMS = Object.freeze([
  'minWidthM',
  'minWidthSource',
  'roadWidthM',
  ...NUMBER_PARAMS,
  ...TEXT_PARAMS,
  'spineWidthByOrderM',
  'milestoneYears',
]);

/** Optional spine and outlook parameters, kept only when set (WS4). */
export function spineParams(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  for (const k of NUMBER_PARAMS) if (!blank(p[k])) out[k] = Number(p[k]);
  for (const k of TEXT_PARAMS)
    if (typeof p[k] === 'string' && p[k].trim())
      out[k] = p[k].trim().slice(0, 300);
  const table = p.spineWidthByOrderM;
  if (table && typeof table === 'object' && !Array.isArray(table)) {
    const widths = {};
    for (const [order, width] of Object.entries(table).slice(0, 24))
      if (!blank(width)) widths[String(order).slice(0, 8)] = Number(width);
    if (Object.keys(widths).length) out.spineWidthByOrderM = widths;
  }
  if (Array.isArray(p.milestoneYears) && p.milestoneYears.length)
    out.milestoneYears = p.milestoneYears.slice(0, 24).map(Number);
  return out;
}

const label = (f, fallback) =>
  String(f?.properties?.name || f?.properties?.dfm_id || fallback);
const inRange = (v, lo, hi, { integer = false, above = false } = {}) =>
  Number.isFinite(v) &&
  (!integer || Number.isInteger(v)) &&
  (above ? v > lo : v >= lo) &&
  v <= hi;

/**
 * Problems with spine lines, spine properties and the spine/outlook parameters (WS4), in
 * plain words. `year` is the current UTC year: stand ages cannot be recorded in the future.
 * The engine checks the same rules again when it runs.
 */
export function spineProblems(layers, params, year) {
  const problems = [];
  const p = params ?? {};
  const min = p.minWidthM;
  const set = (k) => p[k] !== undefined;
  const check = (k, ok, message) => {
    if (set(k) && !ok(p[k])) problems.push(message);
  };
  check(
    'pinchFraction',
    (v) => inRange(v, 0, 1),
    'The pinch margin must be a share between 0 and 1.',
  );
  check(
    'junctionSnapM',
    (v) => inRange(v, 0.1, 10),
    'The junction distance must be between 0.1 and 10 m.',
  );
  check(
    'disturbanceWidthM',
    (v) => inRange(v, 1, 2000),
    'The disturbance width must be between 1 and 2,000 m.',
  );
  check(
    'connectorWidthM',
    (v) => inRange(v, 0, 2000, { above: true }) && !(v < min),
    'The ridge, valley and saddle link width must be at least the minimum width and at most 2,000 m.',
  );
  if (set('connectorWidthM') && !p.connectorWidthSource)
    problems.push('Record where the link width comes from.');
  if (set('spineWidthByOrderM')) {
    const entries = Object.entries(p.spineWidthByOrderM);
    const rows = [];
    for (const [order, width] of entries) {
      if (!/^(?:[1-9]|1[0-2])$/.test(order)) {
        problems.push(
          `Spine widths are by stream order 1 to ${MAX_STREAM_ORDER}; “${order}” is not one.`,
        );
        continue;
      }
      if (!inRange(width, 0, 2000, { above: true }) || width < min)
        problems.push(
          `The spine width for order ${order} must be at least the minimum width and at most 2,000 m.`,
        );
      else rows.push([Number(order), width]);
    }
    rows.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < rows.length; i++)
      if (rows[i][1] < rows[i - 1][1])
        problems.push(
          `A larger stream never gets a narrower corridor: order ${rows[i][0]} (${rows[i][1]} m) is narrower than order ${rows[i - 1][0]} (${rows[i - 1][1]} m).`,
        );
    if (!p.spineWidthSource)
      problems.push('Record where the spine widths come from.');
  }
  check(
    'ageAsOfYear',
    (v) => inRange(v, 1800, year, { integer: true }),
    `The stand-age year must be a year from 1800 to ${year}.`,
  );
  check(
    'oldGrowthAgeYears',
    (v) => inRange(v, 0, 2000, { above: true }),
    'The old-growth age must be between 0 and 2,000 years.',
  );
  if (set('oldGrowthAgeYears') && !p.oldGrowthAgeSource)
    problems.push('Record where the old-growth age comes from.');
  if (set('milestoneYears')) {
    const ys = p.milestoneYears;
    if (ys.length > 12) problems.push('Use at most 12 milestone years.');
    if (!ys.every((y) => inRange(y, 1800, 3000, { integer: true })))
      problems.push('Milestone years must be years between 1800 and 3000.');
    else if (ys.some((y, i) => i > 0 && y <= ys[i - 1]))
      problems.push('Milestone years must increase.');
  }
  check(
    'climateWarmingC',
    (v) => inRange(v, 0, 10, { above: true }),
    'The warming target must be more than 0 and at most 10 °C.',
  );
  if (set('climateWarmingC') && !p.climateSource)
    problems.push('Record where the warming target comes from.');

  const age = (f, i, layer) => {
    const a = f?.properties?.stand_age;
    if (a !== undefined && !inRange(a, 0, 3000))
      problems.push(
        `${layer} ${label(f, i + 1)}: stand age must be in years from 0 to 3,000.`,
      );
  };
  let temps = 0;
  for (const [i, f] of (layers?.coreAreas ?? []).entries()) {
    age(f, i, 'Core area');
    const t = f?.properties?.temp_c;
    if (t !== undefined) {
      temps += 1;
      if (!inRange(t, -60, 60))
        problems.push(
          `Core area ${label(f, i + 1)}: temperature must be between −60 and 60 °C.`,
        );
    }
  }
  if (temps && !p.coreTempSource)
    problems.push('Record where the core temperatures come from.');
  for (const [i, f] of (layers?.retained ?? []).entries()) {
    age(f, i, 'Retained corridor');
    const pr = f?.properties ?? {};
    if (pr.spine !== undefined && typeof pr.spine !== 'boolean')
      problems.push(
        `Retained corridor ${label(f, i + 1)}: spine must be true or false.`,
      );
    if (pr.origin !== undefined && !SPINE_ORIGINS.includes(pr.origin))
      problems.push(
        `Retained corridor ${label(f, i + 1)}: origin must be ${SPINE_ORIGINS.join(', ')}.`,
      );
  }
  for (const [i, f] of (layers?.streams ?? []).entries())
    if (
      !inRange(f?.properties?.stream_order, 1, MAX_STREAM_ORDER, {
        integer: true,
      })
    )
      problems.push(
        `Stream ${label(f, i + 1)}: stream order must be a whole number from 1 to ${MAX_STREAM_ORDER} (Strahler order).`,
      );
  for (const [i, f] of (layers?.connectors ?? []).entries())
    if (!LINK_KINDS.includes(f?.properties?.kind))
      problems.push(
        `Link ${label(f, i + 1)}: choose ridge, valley or saddle.`,
      );
  return problems;
}

/** True when the layers hold spine lines (streams or connectors). */
export const hasSpineLines = (layers) =>
  !!(layers?.streams?.length || layers?.connectors?.length);

const utcYear = (ms) => new Date(ms).getUTCFullYear();
const shiftAge = (shift) => (f) =>
  Number.isFinite(f?.properties?.stand_age)
    ? {
        ...f,
        properties: {
          ...f.properties,
          stand_age: f.properties.stand_age + shift,
        },
      }
    : f;

/**
 * Build the engine input for a spine analysis from the co-op's records (WS8, WS9).
 * Throws an Error with a status for a missing project or unreviewed layers.
 * @returns {{input: object, context: {layersVersionId, analysisYear, ageAsOfYear, ageShiftYears, planId, warnings}}}
 */
export function spineAnalysisInput(
  s,
  projectId,
  { now, planId = null, viewer = null } = {},
) {
  const fail = (message, status = 400) => {
    throw Object.assign(new Error(message), { status });
  };
  const project = (s.projects ?? []).find((x) => x.id === projectId);
  if (!project) fail('Project not found.', 404);
  if (project.kind !== 'woodland')
    fail('Spine analyses belong to woodland projects.');
  // The same version the corridor check uses for plans (currentLayers in woodland.mjs).
  const version = (s.woodlandLayers ?? [])
    .filter((v) => v.projectId === projectId && v.status === 'reviewed')
    .at(-1);
  if (!version?.layers)
    fail(
      'A steward must save and another steward review the woodland layers first.',
      409,
    );
  let treatments = [];
  if (planId != null) {
    const plan = (s.treatmentPlans ?? []).find(
      (x) => x.id === planId && x.projectId === projectId,
    );
    if (!plan) fail('Treatment plan not found.', 404);
    // E1 (lib/woodland.mjs): a plan redacted by account erasure has no units left to apply.
    if (plan.erasureRedacted)
      fail(
        'This plan was removed when its author deleted their account.',
        409,
      );
    treatments = structuredClone(plan.treatments);
  }
  const year = utcYear(now);
  const warnings = [];
  const params = version.params ?? {};
  const asOf = Number.isInteger(params.ageAsOfYear)
    ? params.ageAsOfYear
    : utcYear(version.createdAt);
  const shift = year - asOf;
  if (shift < 0)
    fail(
      `Stand ages are recorded for ${asOf}, after this year. Correct the stand-age year.`,
    );
  let milestones = (params.milestoneYears ?? []).filter((y) => y >= year);
  if (params.milestoneYears?.length && !milestones.length)
    warnings.push(
      `Every recorded milestone year is before ${year}; default milestones are used.`,
    );
  if (!milestones.length)
    milestones = DEFAULT_MILESTONE_OFFSETS.map((d) => year + d);
  const byId = new Map((s.parcels ?? []).map((x) => [x.id, x]));
  const parcels = consentParcels(s, projectId).map((f) => {
    const parcel = byId.get(f.properties.dfm_id);
    if (f.properties.consent === 'covered') {
      const reviewedAt = parcel?.consents?.at(-1)?.reviewedAt;
      return {
        ...f,
        properties: {
          ...f.properties,
          consent_year: Math.min(
            Number.isFinite(reviewedAt) ? utcYear(reviewedAt) : year,
            year,
          ),
        },
      };
    }
    const planned = parcel?.plannedJoinYear;
    // WS8: a non-steward's projection uses only the planned years of woodlots they recorded.
    const visible =
      !viewer || viewer.steward || parcel?.createdBy === viewer.userId;
    return visible && Number.isInteger(planned) && planned > year
      ? { ...f, properties: { ...f.properties, planned_year: planned } }
      : f;
  });
  const layers = checkLayers(version.layers);
  const age = shiftAge(shift);
  const input = {
    ...layers,
    retained: (layers.retained ?? []).map(age),
    coreAreas: (layers.coreAreas ?? []).map(age),
    treatments,
    parcels,
    params: { ...params, ageAsOfYear: year, milestoneYears: milestones },
  };
  return {
    input,
    context: {
      layersVersionId: version.id,
      analysisYear: year,
      ageAsOfYear: asOf,
      ageShiftYears: shift,
      planId,
      warnings,
    },
  };
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * What one viewer may see of a spine result (WS8). Stewards see everything; any other member
 * sees parcels they recorded and counts, and the build-out total without per-woodlot rows.
 * Messages that name another member's woodlot are reworded so its identifier does not leak;
 * core, line and unit names are left alone.
 */
export function spineResultForViewer(
  kind,
  result,
  { steward, ownParcelIds, parcelIds = [] },
) {
  if (steward || !result) return result;
  const own = new Set(ownParcelIds ?? []);
  const mine = (id) => own.has(id);
  const others = [...new Set(parcelIds)].filter((id) => id && !mine(id));
  const pattern = others.length
    ? new RegExp(others.map((id) => escape(String(id))).join('|'), 'g')
    : null;
  const scrub = (list) =>
    (list ?? []).map((m) =>
      pattern ? String(m).replace(pattern, 'another woodlot') : String(m),
    );
  const out = {
    ...result,
    reasons: scrub(result.reasons),
    warnings: scrub(result.warnings),
  };
  if (kind === 'outlook' && Array.isArray(result.milestones))
    out.milestones = result.milestones.map((m) => ({
      ...m,
      committedParcels: m.committedParcels.filter(mine),
      committedParcelCount: m.committedParcels.length,
    }));
  if (kind === 'frontier' && result.status === 'ok') {
    out.committed = {
      ...result.committed,
      parcels: result.committed.parcels.filter(mine),
      parcelCount: result.committed.parcels.length,
    };
    out.frontier = [];
    out.laterParcels = [];
    out.frontierForStewards = true;
  }
  return out;
}
