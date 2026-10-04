import { segmentsTouch } from './geometry.mjs';
import { validateBoundary } from './monitoring.mjs';
import { coordinate, MAX_CORNERS } from './boundary-editor.mjs';
import {
  LINK_KINDS,
  MAX_STREAM_ORDER,
  SUPPORTED_PARAMS,
} from './woodland-spine.mjs';
import { FEATURE_PROPERTIES, LAYER_PROPERTIES } from './woodland-input.mjs';
export const LAYER_TYPES = Object.freeze({
  coreAreas: 'Polygon',
  retained: 'Polygon',
  roads: 'LineString',
  water: 'Polygon',
  crossings: 'Point',
  // Optional old-growth spine lines: streams set its branches; ridge, valley and saddle
  // links close loops. Saved only when they hold features.
  streams: 'LineString',
  connectors: 'LineString',
  treatments: 'Polygon',
});
export { LINK_KINDS };
/**
 * Spine lines from GIS and corridors drafted by the engine carry more vertices than a drawn
 * feature; they may have up to this many (drawn features and roads keep the 200 limit).
 */
export const MAX_SPINE_VERTICES = 1000;
export const CORE_CHOICES = [
  'old-growth-candidate',
  'riparian-core',
  'reserve',
];
export const PASSAGE_CHOICES = ['verified', 'assumed', 'none'];
export const emptyLayers = () =>
  Object.fromEntries(
    Object.keys(LAYER_TYPES)
      .filter((k) => k !== 'treatments')
      .map((k) => [k, []]),
  );
export const jsonBytes = (value) =>
  new TextEncoder().encode(JSON.stringify(value)).length;
export const isUUID = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
/** A drafted spine corridor keeps the engine's `spine-<line id>` name for its line's UUID. */
export const isSpineId = (value) =>
  typeof value === 'string' &&
  value.startsWith('spine-') &&
  isUUID(value.slice(6));
const validId = (layer, properties) =>
  isUUID(properties?.dfm_id) ||
  (layer === 'retained' &&
    properties?.spine === true &&
    isSpineId(properties.dfm_id));
export function editorFeature(layer, feature) {
  const defaults = newFeature(layer);
  return {
    ...feature,
    properties: {
      ...defaults.properties,
      ...feature.properties,
      dfm_id: validId(layer, feature.properties)
        ? feature.properties.dfm_id
        : defaults.properties.dfm_id,
    },
  };
}
export function newFeature(layer, id = crypto.randomUUID()) {
  if (!LAYER_TYPES[layer]) throw new Error('Choose a woodland layer.');
  return {
    type: 'Feature',
    geometry: {
      type: LAYER_TYPES[layer],
      coordinates: layer === 'crossings' ? [] : layer === 'roads' ? [] : [[]],
    },
    properties: {
      dfm_id: id,
      name: '',
      ...(layer === 'coreAreas' ? { core_class: 'old-growth-candidate' } : {}),
      ...(layer === 'crossings' ? { passage: 'assumed' } : {}),
      ...(layer === 'streams' ? { stream_order: 1 } : {}),
      ...(layer === 'connectors' ? { kind: 'ridge' } : {}),
      ...(layer === 'treatments'
        ? { intensity: '', corridor_permitted: false, reason: '' }
        : {}),
    },
  };
}
export function featurePoints(f) {
  if (!Array.isArray(f?.geometry?.coordinates)) return [];
  if (f.geometry.type === 'Point')
    return f.geometry.coordinates.length ? [f.geometry.coordinates] : [];
  if (f.geometry.type === 'LineString') return f.geometry.coordinates;
  const ring = Array.isArray(f.geometry.coordinates[0])
    ? f.geometry.coordinates[0]
    : [];
  return ring.length > 1 &&
    JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1))
    ? ring.slice(0, -1)
    : ring;
}
export function withPoints(f, points) {
  const coordinates =
    f.geometry.type === 'Point'
      ? (points.at(-1) ?? [])
      : f.geometry.type === 'LineString'
        ? points
        : [points.length ? [...points, points[0]] : []];
  return { ...f, geometry: { ...f.geometry, coordinates } };
}
function lineCrosses(points) {
  for (let i = 2; i < points.length; i++) {
    const [a, b, c] = [points[i - 2], points[i - 1], points[i]];
    if (
      Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) <
        1e-12 &&
      (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0
    )
      return true;
  }

  for (let i = 0; i < points.length - 1; i++)
    for (let j = i + 2; j < points.length - 1; j++) {
      const [a, b, c, d] = [points[i], points[i + 1], points[j], points[j + 1]];
      if (segmentsTouch(a, b, c, d)) return true;
    }
  return false;
}
export function featureProblems(layer, f, lightIntensities = []) {
  const problems = [];
  try {
    if (f?.type !== 'Feature' || f.geometry?.type !== LAYER_TYPES[layer])
      throw new Error(`Use ${LAYER_TYPES[layer]} geometry for ${layer}.`);
    if (f.geometry.type === 'Polygon')
      validateBoundary(f.geometry, {
        maxCorners:
          layer === 'retained' && f.properties?.spine === true
            ? MAX_SPINE_VERTICES
            : MAX_CORNERS,
      });
    else {
      const points = featurePoints(f);
      if (f.geometry.type === 'Point' && points.length !== 1)
        throw new Error('Add one crossing point.');
      const maxVertices = ['streams', 'connectors'].includes(layer)
        ? MAX_SPINE_VERTICES
        : MAX_CORNERS;
      if (
        f.geometry.type === 'LineString' &&
        (points.length < 2 || points.length > maxVertices)
      )
        throw new Error(
          `Use 2–${maxVertices} ${layer === 'roads' ? 'road' : 'line'} vertices.`,
        );
      for (const point of points) {
        if (
          !Array.isArray(point) ||
          point.length !== 2 ||
          !point.every(Number.isFinite)
        )
          throw new Error('Coordinates must be longitude, latitude in WGS84.');
        coordinate(...point);
      }
      if (new Set(points.map((p) => p.join(','))).size !== points.length)
        throw new Error('Do not repeat vertices.');
      if (
        points.length > 1 &&
        (Math.max(...points.map((p) => p[0])) -
          Math.min(...points.map((p) => p[0])) >
          10 ||
          Math.max(...points.map((p) => p[1])) -
            Math.min(...points.map((p) => p[1])) >
            10)
      )
        throw new Error(
          `Split very large or antimeridian-crossing ${layer === 'roads' ? 'roads' : 'lines'}.`,
        );
      if (lineCrosses(points))
        throw new Error(
          `${layer === 'roads' ? 'Road' : 'Line'} edges must not cross or touch.`,
        );
    }
  } catch (e) {
    problems.push(e.message);
  }
  const p = f?.properties ?? {};
  if (!validId(layer, p)) problems.push('A stable UUID dfm_id is required.');
  if (layer === 'coreAreas' && !CORE_CHOICES.includes(p.core_class))
    problems.push(
      'Choose a candidate, riparian core or reserve class. Verified old growth requires evidence elsewhere.',
    );
  if (layer === 'crossings' && !PASSAGE_CHOICES.includes(p.passage))
    problems.push('Choose verified, assumed or none for passage.');
  if (
    layer === 'streams' &&
    !(
      Number.isInteger(p.stream_order) &&
      p.stream_order >= 1 &&
      p.stream_order <= MAX_STREAM_ORDER
    )
  )
    problems.push(
      `Stream order must be a whole number from 1 to ${MAX_STREAM_ORDER} (Strahler order).`,
    );
  if (layer === 'connectors' && !LINK_KINDS.includes(p.kind))
    problems.push('Choose ridge, valley or saddle for the link.');
  if (
    ['coreAreas', 'retained'].includes(layer) &&
    p.stand_age !== undefined &&
    !(Number.isFinite(p.stand_age) && p.stand_age >= 0 && p.stand_age <= 3000)
  )
    problems.push('Stand age must be in years from 0 to 3,000.');
  if (
    layer === 'coreAreas' &&
    p.temp_c !== undefined &&
    !(Number.isFinite(p.temp_c) && p.temp_c >= -60 && p.temp_c <= 60)
  )
    problems.push('Temperature must be between −60 and 60 °C.');
  if (layer === 'treatments') {
    if (typeof p.intensity !== 'string' || !p.intensity.trim())
      problems.push('Intensity is required.');
    if (
      p.corridor_permitted &&
      (!lightIntensities.includes(p.intensity) ||
        typeof p.reason !== 'string' ||
        !p.reason.trim())
    )
      problems.push(
        'Corridor-permitted units require a light intensity and a reason.',
      );
  }
  return problems;
}
export function draftProblems(layers, treatments, lightIntensities) {
  const problems = [];
  const ids = new Set();
  for (const [layer, features] of Object.entries({ ...layers, treatments })) {
    for (const [index, f] of features.entries()) {
      const label = `${layer}: ${f.properties?.name || f.properties?.dfm_id || `feature ${index + 1}`}`;
      for (const message of featureProblems(layer, f, lightIntensities))
        problems.push(`${label}: ${message}`);
      if (ids.has(f.properties?.dfm_id))
        problems.push(`${label}: dfm_id must be unique.`);
      ids.add(f.properties?.dfm_id);
    }
  }
  return problems;
}
export function sizeReport(mode, layers, treatments, payload, envelope = {}) {
  const limit = mode === 'layers' ? 90000 : 40000;
  const bytes = jsonBytes(mode === 'layers' ? layers : treatments);
  // Full request envelope is supplied by the panel. Reserve a UUID request id exactly.
  const requestBytes = jsonBytes({
    ...envelope,
    payload,
    requestId: '00000000-0000-4000-8000-000000000000',
  });
  const problems = [];
  if (bytes > limit)
    problems.push(
      `Draft is ${bytes} bytes; limit is ${limit}. Simplify features or corners.`,
    );
  if (requestBytes >= 100000)
    problems.push(`Request is ${requestBytes} bytes; it must be under 100000.`);
  for (const [layer, list] of Object.entries(layers))
    if (list.length > 400)
      problems.push(`${layer} has ${list.length} features; limit is 400.`);
  if (treatments.length > 50)
    problems.push(`Plan has ${treatments.length} units; limit is 50.`);
  return { bytes, limit, requestBytes, problems };
}
export function importDraft(json, mode) {
  if (!json || typeof json !== 'object')
    throw new Error('Use a Landscape Package or GeoJSON features.');
  if (
    json.dfm_package &&
    (json.dfm_package !== '1.0' || json.crs !== 'EPSG:4326')
  )
    throw new Error('Use Landscape Package v1 in WGS84.');
  // An imported ID that is not a UUID is replaced; it becomes the feature's name when the
  // feature has none, so labels from the source tool (core-n, h1) survive the import.
  const named = (feature, originalId) =>
    !feature.properties.name &&
    typeof originalId === 'string' &&
    originalId &&
    originalId !== feature.properties.dfm_id
      ? {
          ...feature,
          properties: { ...feature.properties, name: originalId.slice(0, 300) },
        }
      : feature;
  const read = (layer, list) => {
    if (!Array.isArray(list))
      throw new Error(`${layer} must be a list of features.`);
    return list.map((f) => {
      if (f?.type !== 'Feature' || f.geometry?.type !== LAYER_TYPES[layer])
        throw new Error(`Use ${LAYER_TYPES[layer]} geometry for ${layer}.`);
      return named(editorFeature(layer, f), f.properties?.dfm_id);
    });
  };
  if (mode === 'plan')
    return {
      treatments: read(
        'treatments',
        Array.isArray(json)
          ? json
          : json.type === 'FeatureCollection'
            ? json.features
            : (json.layers?.treatments ?? []),
      ),
    };
  // Lines with non-UUID IDs (common in packages from other tools) get UUIDs; drafted spine
  // corridors that name those lines follow them, so a later redraft still matches.
  const lineIds = new Map();
  for (const k of ['streams', 'connectors'])
    for (const f of json.layers?.[k] ?? []) {
      const id = f?.properties?.dfm_id;
      if (typeof id === 'string' && !isUUID(id))
        lineIds.set(id, crypto.randomUUID());
    }
  const relabel = (k, f) => {
    if (!f || typeof f !== 'object') return f;
    const p = f.properties ?? {};
    if (['streams', 'connectors'].includes(k) && lineIds.has(p.dfm_id))
      return {
        ...f,
        properties: {
          ...p,
          name: p.name || p.dfm_id,
          dfm_id: lineIds.get(p.dfm_id),
        },
      };
    if (k === 'retained' && p.spine === true && lineIds.has(p.source_id)) {
      const line = lineIds.get(p.source_id);
      return {
        ...f,
        properties: { ...p, source_id: line, dfm_id: `spine-${line}` },
      };
    }
    return f;
  };
  return {
    layers: Object.fromEntries(
      Object.keys(emptyLayers()).map((k) => {
        const list = json.layers?.[k] ?? [];
        return [k, read(k, Array.isArray(list) ? list.map((f) => relabel(k, f)) : list)];
      }),
    ),
    params: json.params ?? {},
  };
}

const KEPT_ELSEWHERE = {
  boundary: 'the planning boundary (the co-op’s woodlots stand in for it)',
  parcels: 'woodlots (record each one, with its holder’s consent, in Land & parcels)',
  treatments: 'treatment units (draw or upload them as a treatment plan)',
};
/**
 * What an upload leaves out (WS12), in plain words, so nothing a package holds is dropped
 * silently: layers this editor does not take, settings and feature properties VergeCommon does
 * not use yet. A package from a newer DFM tool can hold such content, and the check here can
 * then differ from the one in that tool.
 */
export function importNotes(json, mode) {
  if (!json || typeof json !== 'object' || !json.dfm_package) return [];
  const layers =
    json.layers && typeof json.layers === 'object' ? json.layers : {};
  const kept = mode === 'plan' ? ['treatments'] : Object.keys(emptyLayers());
  const notes = [];
  // A plan upload takes only the units; the co-op's reviewed layers stay as they are.
  const skipped =
    mode === 'plan'
      ? []
      : Object.keys(layers).filter(
          (k) =>
            !kept.includes(k) && Array.isArray(layers[k]) && layers[k].length,
        );
  if (skipped.length)
    notes.push(
      `Not imported: ${skipped
        .map(
          (k) =>
            KEPT_ELSEWHERE[k] ??
            `the ${k} layer, which VergeCommon does not use yet`,
        )
        .join('; ')}.`,
    );
  if (mode !== 'plan') {
    const params = Object.keys(
      json.params && typeof json.params === 'object' ? json.params : {},
    ).filter((k) => !SUPPORTED_PARAMS.includes(k));
    if (params.length)
      notes.push(
        `Settings VergeCommon does not use yet: ${params.join(', ')}. The check here can differ from the tool that wrote the package.`,
      );
  }
  const allowed = mode === 'plan' ? FEATURE_PROPERTIES : LAYER_PROPERTIES;
  const properties = new Set();
  for (const k of kept)
    for (const f of Array.isArray(layers[k]) ? layers[k] : [])
      for (const key of Object.keys(f?.properties ?? {}))
        if (!allowed.includes(key)) properties.add(key);
  if (properties.size)
    notes.push(
      `Feature properties VergeCommon does not keep: ${[...properties].join(', ')}.`,
    );
  return notes;
}

const round7 = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, v) =>
      typeof v === 'number' ? Math.round(v * 1e7) / 1e7 : v,
    ),
  );
/**
 * Merge an engine spine draft (deriveSpine features) into the retained layer (WS6): drafted
 * corridors replace earlier ones marked spine, other retained features are kept, and a corridor
 * keeps the name and stand age a steward gave it under the same ID. Coordinates are rounded to
 * 1e-7 degrees as stored. Derivation never assigns a core class.
 */
export function mergeSpineDraft(retained, derived, lines = []) {
  const previous = new Map(
    retained
      .filter((f) => f.properties?.spine === true)
      .map((f) => [f.properties.dfm_id, f.properties]),
  );
  const lineName = new Map(
    lines.map((f) => [f.properties?.dfm_id, f.properties?.name]),
  );
  const drafted = derived.map((f) => {
    const before = previous.get(f.properties.dfm_id) ?? {};
    const name =
      before.name ||
      `Spine: ${lineName.get(f.properties.source_id) || f.properties.origin}`;
    return {
      type: 'Feature',
      geometry: round7(f.geometry),
      properties: {
        ...f.properties,
        name,
        ...(Number.isFinite(before.stand_age)
          ? { stand_age: before.stand_age }
          : {}),
      },
    };
  });
  return [
    ...retained.filter((f) => f.properties?.spine !== true),
    ...drafted,
  ];
}
