import { segmentsTouch } from './geometry.mjs';
import { validateBoundary } from './monitoring.mjs';
import { coordinate, MAX_CORNERS } from './boundary-editor.mjs';
export const LAYER_TYPES = Object.freeze({
  coreAreas: 'Polygon',
  retained: 'Polygon',
  roads: 'LineString',
  water: 'Polygon',
  crossings: 'Point',
  treatments: 'Polygon',
});
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
export function editorFeature(layer, feature) {
  const defaults = newFeature(layer);
  return {
    ...feature,
    properties: {
      ...defaults.properties,
      ...feature.properties,
      dfm_id: isUUID(feature.properties?.dfm_id)
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
    if (f.geometry.type === 'Polygon') validateBoundary(f.geometry);
    else {
      const points = featurePoints(f);
      if (f.geometry.type === 'Point' && points.length !== 1)
        throw new Error('Add one crossing point.');
      if (
        f.geometry.type === 'LineString' &&
        (points.length < 2 || points.length > MAX_CORNERS)
      )
        throw new Error('Use 2–200 road vertices.');
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
        throw new Error('Split very large or antimeridian-crossing roads.');
      if (lineCrosses(points))
        throw new Error('Road edges must not cross or touch.');
    }
  } catch (e) {
    problems.push(e.message);
  }
  const p = f?.properties ?? {};
  if (!isUUID(p.dfm_id)) problems.push('A stable UUID dfm_id is required.');
  if (layer === 'coreAreas' && !CORE_CHOICES.includes(p.core_class))
    problems.push(
      'Choose a candidate, riparian core or reserve class. Verified old growth requires evidence elsewhere.',
    );
  if (layer === 'crossings' && !PASSAGE_CHOICES.includes(p.passage))
    problems.push('Choose verified, assumed or none for passage.');
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
  const read = (layer, list) => {
    if (!Array.isArray(list))
      throw new Error(`${layer} must be a list of features.`);
    return list.map((f) => {
      if (f?.type !== 'Feature' || f.geometry?.type !== LAYER_TYPES[layer])
        throw new Error(`Use ${LAYER_TYPES[layer]} geometry for ${layer}.`);
      return editorFeature(layer, f);
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
  return {
    layers: Object.fromEntries(
      Object.keys(emptyLayers()).map((k) => [
        k,
        read(k, json.layers?.[k] ?? []),
      ]),
    ),
    params: json.params ?? {},
  };
}
