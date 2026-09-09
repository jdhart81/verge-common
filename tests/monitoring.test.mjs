import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBoundary,
  searchWindow,
  sceneSummaries,
} from '../lib/monitoring.mjs';
const polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [36.8, -1.3],
      [36.81, -1.3],
      [36.81, -1.29],
      [36.8, -1.29],
      [36.8, -1.3],
    ],
  ],
};
test('boundaries accept closed WGS84 polygons and reject ambiguous geometry', () => {
  assert.deepEqual(validateBoundary(polygon).bbox, [36.8, -1.3, 36.81, -1.29]);
  assert.throws(
    () =>
      validateBoundary({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [0, 1],
            [1, 0],
            [0, 0],
          ],
        ],
      }),
    /cross/,
  );
  assert.throws(
    () =>
      validateBoundary({
        type: 'Polygon',
        coordinates: [
          [
            [179, 0],
            [-179, 0],
            [-179, 1],
            [179, 0],
          ],
        ],
      }),
    /antimeridian/,
  );
  assert.throws(
    () =>
      validateBoundary({
        ...polygon,
        coordinates: [...polygon.coordinates, polygon.coordinates[0]],
      }),
    /holes/,
  );
  assert.throws(
    () =>
      validateBoundary({
        ...polygon,
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [2, 0],
            [0, 0],
          ],
        ],
      }),
    /area/,
  );
});
test('catalogue requests and metadata are bounded and normalized', () => {
  assert.equal(
    searchWindow('2026-08-01', '2026-08-31'),
    '2026-08-01T00:00:00Z/2026-08-31T23:59:59Z',
  );
  assert.throws(() => searchWindow('2026-02-30', '2026-03-01'));
  assert.throws(() => searchWindow('2020-01-01', '2026-01-01'));
  const scenes = sceneSummaries({
    type: 'FeatureCollection',
    features: [
      {
        id: 'S2_TEST',
        collection: 'sentinel-2-l2a',
        properties: { datetime: '2026-08-01T00:00:00Z', 'eo:cloud_cover': 0 },
      },
    ],
  });
  assert.equal(scenes[0].cloudCover, 0);
  assert.match(scenes[0].reference, /^https:\/\/stac.dataspace.copernicus.eu/);
  assert.throws(() =>
    sceneSummaries({
      type: 'FeatureCollection',
      features: [{ id: '../../secret' }],
    }),
  );
});
