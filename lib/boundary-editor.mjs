import { validateBoundary } from './monitoring.mjs';

export const MAX_BOUNDARY_BYTES = 30000;
export const MAX_CORNERS = 200;

export function coordinate(longitude, latitude) {
  if (String(longitude).trim() === '' || String(latitude).trim() === '')
    throw new Error('Enter both longitude and latitude.');
  const point = [Number(longitude), Number(latitude)];
  if (
    !point.every(Number.isFinite) ||
    Math.abs(point[0]) > 180 ||
    Math.abs(point[1]) > 90
  )
    throw new Error(
      'Longitude must be −180 to 180; latitude must be −90 to 90.',
    );
  return point.map((n) => Number(n.toFixed(7)));
}

// Incomplete and crossing drafts stay editable; only validateBoundary can admit a save.
export function draftPoints(text) {
  if (!text.trim()) return [];
  if (new TextEncoder().encode(text).length > MAX_BOUNDARY_BYTES)
    throw new Error('Use a boundary file under 30 KB.');
  const input = JSON.parse(text);
  const g = input?.type === 'Feature' ? input.geometry : input;
  if (
    g?.type !== 'Polygon' ||
    !Array.isArray(g.coordinates) ||
    g.coordinates.length !== 1 ||
    !Array.isArray(g.coordinates[0])
  )
    throw new Error('Use one GeoJSON Polygon without holes.');
  const points = g.coordinates[0].map((p) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))
      throw new Error('Coordinates must be longitude, latitude in WGS84.');
    if (Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)
      throw new Error('Coordinates must be longitude, latitude in WGS84.');
    return [...p];
  });
  if (
    points.length > 1 &&
    points[0][0] === points.at(-1)[0] &&
    points[0][1] === points.at(-1)[1]
  )
    points.pop();
  if (points.length > MAX_CORNERS) throw new Error('Use at most 200 corners.');
  return points;
}

export function draftText(points) {
  return points.length
    ? JSON.stringify(
        { type: 'Polygon', coordinates: [[...points, points[0]]] },
        null,
        2,
      )
    : '';
}

export function importBoundary(text) {
  draftPoints(text);
  return JSON.stringify(validateBoundary(JSON.parse(text)).geometry, null, 2);
}

export function boundaryFeatures(points) {
  const features = [];
  if (points.length >= 2)
    features.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: points.length >= 3 ? [...points, points[0]] : points,
      },
    });
  if (points.length >= 3) {
    try {
      const { geometry } = validateBoundary(JSON.parse(draftText(points)));
      features.push({ type: 'Feature', properties: {}, geometry });
    } catch {
      /* Keep an invalid draft's outline visible for correction. */
    }
  }
  return { type: 'FeatureCollection', features };
}

export function downloadBoundary(value, filename = 'private-boundary.geojson') {
  const normalized = importBoundary(value);
  const url = URL.createObjectURL(
    new Blob([normalized + '\n'], { type: 'application/geo+json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
