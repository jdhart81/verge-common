// Pure input preparation shared by the authoritative command and lazy browser preview.
// Keep cleaning identical to the original woodland command, including property truncation.
import { parcelConsentIsCurrent } from './readiness.mjs';

/** Corridor layers every woodland version has. */
export const LAYER_KEYS = Object.freeze([
  'coreAreas',
  'retained',
  'roads',
  'water',
  'crossings',
]);
/**
 * Optional old-growth spine layers (since dfm-core 0.2.0). Like a Landscape Package, a version or
 * check input carries them only when they hold features (WS2), so inputs without them, and
 * their checksums, are unchanged.
 */
export const SPINE_LAYERS = Object.freeze(['streams', 'connectors']);
/** Properties kept on treatment units and, before the spine, on every layer feature. */
export const FEATURE_PROPERTIES = Object.freeze([
  'dfm_id',
  'core_class',
  'evidence_id',
  'passage',
  'width_m',
  'period',
  'intensity',
  'corridor_permitted',
  'reason',
  'name',
]);
/** Spine properties the engine reads on layer features (WS3); never kept on treatment units. */
export const SPINE_PROPERTIES = Object.freeze([
  'stream_order',
  'kind',
  'spine',
  'origin',
  'source_id',
  'width_source',
  'stand_age',
  'temp_c',
]);
/**
 * Native old-growth records the engine reads on retained corridors and core areas (dfm-core
 * 0.3.0, NO1): never plowed or clear-cut (remnant), how the stand was established
 * (stand_origin) and the share of it in native species (native_share), each with its source.
 * Kept only when recorded, so layers without them store, check and checksum as before (NO5).
 */
export const NATIVE_PROPERTIES = Object.freeze([
  'remnant',
  'remnant_source',
  'stand_origin',
  'origin_source',
  'native_share',
  'composition_source',
]);
export const LAYER_PROPERTIES = Object.freeze([
  ...FEATURE_PROPERTIES,
  ...SPINE_PROPERTIES,
  ...NATIVE_PROPERTIES,
]);
/**
 * What a restoration planting inside a corridor plants (dfm-core 0.3.0, NO3): the species,
 * each recorded native or not, and where native status comes from. Kept on treatment units
 * only, and only when recorded, so a unit without them is stored and checked as before.
 */
export const PLANTING_PROPERTIES = Object.freeze([
  'species',
  'native_status_source',
]);
/** Properties kept on treatment units. */
export const UNIT_PROPERTIES = Object.freeze([
  ...FEATURE_PROPERTIES,
  ...PLANTING_PROPERTIES,
]);
/** The engine takes 1 to 200 species; one more is kept so an over-long list is refused, not cut. */
const MAX_SPECIES_KEPT = 201;
/**
 * A species list as stored: only `name` and `native` of each entry, names cut to 300
 * characters. Anything that is not a list is left for the engine to refuse by name (N3).
 */
function cleanSpecies(list) {
  if (!Array.isArray(list)) return list;
  return list.slice(0, MAX_SPECIES_KEPT).map((s) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return s;
    const entry = {};
    if (s.name !== undefined)
      entry.name = typeof s.name === 'string' ? s.name.slice(0, 300) : s.name;
    if (s.native !== undefined) entry.native = s.native;
    return entry;
  });
}

export function consentParcels(s, projectId) {
  return (s.parcels ?? [])
    .filter((p) => p.projectId === projectId && p.status !== 'withdrawn')
    .map((parcel) => {
      const boundary = parcel.boundaries?.at(-1);
      if (!boundary || boundary.status !== 'reviewed') return null;
      return {
        type: 'Feature',
        geometry: boundary.geometry,
        properties: {
          dfm_id: parcel.id,
          consent: parcelConsentIsCurrent(parcel) ? 'covered' : 'none',
        },
      };
    })
    .filter(Boolean);
}
export function cleanFeatures(list, label, max, keys = UNIT_PROPERTIES) {
  const fail = (message) => {
    throw Object.assign(new Error(message), { status: 400 });
  };
  if (!Array.isArray(list))
    fail(`${label} must be a list of GeoJSON features.`);
  if (list.length > max) fail(`Use at most ${max} ${label}.`);
  return list.map((f) => {
    if (f?.type !== 'Feature' || !f.geometry)
      fail(`Every item in ${label} must be a GeoJSON Feature.`);
    const props =
      f.properties && typeof f.properties === 'object' ? f.properties : {};
    const keep = {};
    for (const k of keys)
      if (props[k] !== undefined)
        keep[k] =
          k === 'species'
            ? cleanSpecies(props[k])
            : typeof props[k] === 'string'
              ? props[k].slice(0, 300)
              : props[k];
    return { type: 'Feature', geometry: f.geometry, properties: keep };
  });
}
/**
 * Clean one version's layers: the five corridor layers always, spine layers only when they
 * hold features (WS2), each with the layer property list (WS3).
 */
export function cleanLayers(layers, max = 400) {
  const out = {};
  for (const k of LAYER_KEYS)
    out[k] = cleanFeatures(layers?.[k] ?? [], k, max, LAYER_PROPERTIES);
  for (const k of SPINE_LAYERS) {
    const list = cleanFeatures(layers?.[k] ?? [], k, max, LAYER_PROPERTIES);
    if (list.length) out[k] = list;
  }
  return out;
}
/** Layers as the check sees them: empty spine layers are omitted (WS2). */
export function checkLayers(layers) {
  const out = {};
  for (const [k, v] of Object.entries(layers ?? {}))
    if (!SPINE_LAYERS.includes(k) || (Array.isArray(v) && v.length))
      out[k] = v;
  return out;
}
/**
 * Stored checks made with the Landscape Package's canonical input (WS12) carry this marker
 * (check.inputForm). Only those can be reproduced exactly from a downloaded package; checks
 * stored before v0.10.0 used an input without the empty boundary layer.
 */
export const CHECK_INPUT_FORM = 'landscape-package-1.0';
/** Numbers rounded to 1e-7 (about 1 cm in degrees), as woodland records are stored. */
export const round7 = (value) =>
  JSON.parse(
    JSON.stringify(value, (key, v) =>
      typeof v === 'number' && key !== 'version' ? Math.round(v * 1e7) / 1e7 : v,
    ),
  );
/**
 * The exact input a stored plan was checked against, from the records a steward sees: the
 * plan's layers version and units and the co-op's woodlot consents (WS12). It reproduces the
 * stored result and checksum while those consents are unchanged. Null when it cannot: the
 * version's geometry has been dropped (W7), the plan was redacted by account erasure (E1), or
 * the check predates the package-canonical input (no CHECK_INPUT_FORM marker).
 */
export function planCheckInput(versions, plan, parcels) {
  if (plan?.erasureRedacted || plan?.check?.inputForm !== CHECK_INPUT_FORM)
    return null;
  const version = (versions ?? []).find((v) => v.id === plan.layersVersionId);
  if (!version?.layers) return null;
  return woodlandCheckInput(
    version.layers,
    plan.treatments,
    parcels,
    version.params,
  );
}
/**
 * The corridor check input, in the Landscape Package's canonical form (WS12): every package
 * layer is present (boundary is empty: co-op parcels stand in for it), spine layers only when
 * they hold features, and treatment units rounded as they are stored. So
 * fromLandscapePackage(toLandscapePackage(input)) is the same input, and anyone with the
 * downloaded package and the open-source engine reproduces a stored result and its checksum.
 */
export function woodlandCheckInput(layers, treatments, parcels, params) {
  return {
    boundary: [],
    ...checkLayers(layers),
    treatments: round7(cleanFeatures(treatments, 'treatments', 50)),
    parcels,
    params,
  };
}
