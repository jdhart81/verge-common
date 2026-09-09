export function validateBoundary(input) {
  const g = input?.type === 'Feature' ? input.geometry : input;
  if (
    g?.type !== 'Polygon' ||
    !Array.isArray(g.coordinates) ||
    g.coordinates.length !== 1
  )
    throw new Error('Use one GeoJSON Polygon without holes.');
  const ring = g.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 201)
    throw new Error('Use 3–200 corners and a closing point.');
  if (
    ring.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        !p.every(Number.isFinite) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 90,
    )
  )
    throw new Error('Coordinates must be longitude, latitude in WGS84.');
  if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])
    throw new Error('Close the polygon by repeating its first point.');
  if (
    new Set(ring.slice(0, -1).map((p) => p.join(','))).size !==
    ring.length - 1
  )
    throw new Error('Do not repeat corners.');
  const bbox = [
    Math.min(...ring.map((p) => p[0])),
    Math.min(...ring.map((p) => p[1])),
    Math.max(...ring.map((p) => p[0])),
    Math.max(...ring.map((p) => p[1])),
  ];
  if (bbox[2] - bbox[0] > 10 || bbox[3] - bbox[1] > 10)
    throw new Error(
      'Split very large or antimeridian-crossing areas into separate parcels.',
    );
  const cross = (a, b, c) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const on = (a, b, c) =>
    Math.abs(cross(a, b, c)) < 1e-12 &&
    c[0] >= Math.min(a[0], b[0]) &&
    c[0] <= Math.max(a[0], b[0]) &&
    c[1] >= Math.min(a[1], b[1]) &&
    c[1] <= Math.max(a[1], b[1]);
  for (let i = 0; i < ring.length - 1; i++)
    for (let j = i + 2; j < ring.length - 1; j++) {
      if (i === 0 && j === ring.length - 2) continue;
      const [a, b, c, d] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
      if (
        (cross(a, b, c) * cross(a, b, d) < 0 &&
          cross(c, d, a) * cross(c, d, b) < 0) ||
        on(a, b, c) ||
        on(a, b, d) ||
        on(c, d, a) ||
        on(c, d, b)
      )
        throw new Error('Polygon edges must not cross or touch.');
    }
  const area = Math.abs(
    ring
      .slice(0, -1)
      .reduce(
        (n, p, i) => n + p[0] * ring[i + 1][1] - ring[i + 1][0] * p[1],
        0,
      ),
  );
  if (area < 1e-12) throw new Error('Boundary must enclose an area.');
  return {
    geometry: { type: 'Polygon', coordinates: [ring.map((p) => [...p])] },
    bbox,
  };
}
export function searchWindow(start, end) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start ?? '') ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end ?? '')
  )
    throw new Error('Choose a start and end date.');
  const a = Date.parse(start + 'T00:00:00Z'),
    b = Date.parse(end + 'T23:59:59Z');
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    new Date(a).toISOString().slice(0, 10) !== start ||
    new Date(b).toISOString().slice(0, 10) !== end ||
    b < a ||
    b - a > 366 * 86400000
  )
    throw new Error('Choose a valid date range of at most 366 days.');
  return `${start}T00:00:00Z/${end}T23:59:59Z`;
}
export function sceneSummaries(value) {
  if (value?.type !== 'FeatureCollection' || !Array.isArray(value.features))
    throw new Error('The catalogue returned an unexpected response.');
  return value.features.slice(0, 20).map((f) => {
    if (
      typeof f.id !== 'string' ||
      !/^[a-zA-Z0-9_.-]{1,200}$/.test(f.id) ||
      f.collection !== 'sentinel-2-l2a' ||
      !Number.isFinite(Date.parse(f.properties?.datetime))
    )
      throw new Error('Invalid satellite scene metadata.');
    const cloud = f.properties['eo:cloud_cover'];
    return {
      id: f.id,
      acquiredAt: f.properties.datetime,
      cloudCover:
        typeof cloud === 'number' && cloud >= 0 && cloud <= 100 ? cloud : null,
      reference: `https://stac.dataspace.copernicus.eu/v1/collections/sentinel-2-l2a/items/${encodeURIComponent(f.id)}`,
    };
  });
}
