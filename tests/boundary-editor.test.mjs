import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coordinate,
  draftPoints,
  draftText,
  importBoundary,
  boundaryFeatures,
} from '../lib/boundary-editor.mjs';
import { validateBoundary } from '../lib/monitoring.mjs';

const square = [
  [-73.2, 44.4],
  [-73.19, 44.4],
  [-73.19, 44.41],
  [-73.2, 44.41],
];

test('drawing drafts round trip before and after the third corner', () => {
  for (let i = 0; i <= square.length; i++) {
    const points = square.slice(0, i);
    assert.deepEqual(draftPoints(draftText(points)), points);
    if (i && i < 3)
      assert.throws(() => validateBoundary(JSON.parse(draftText(points))));
    if (i >= 3)
      assert.equal(
        validateBoundary(JSON.parse(draftText(points))).geometry.coordinates[0]
          .length,
        i + 1,
      );
  }
});

test('import strips feature metadata without rounding original coordinates', () => {
  const precise = [
    [36.8123456789, -1.300000001],
    [36.82, -1.3],
    [36.82, -1.29],
  ];
  const input = {
    type: 'Feature',
    properties: { owner: 'private metadata' },
    geometry: JSON.parse(draftText(precise)),
  };
  const imported = importBoundary(JSON.stringify(input));
  assert.equal(JSON.parse(imported).type, 'Polygon');
  assert.deepEqual(draftPoints(imported), precise);
  assert.ok(!imported.includes('owner'));
});

test('bad imports cannot replace a draft with oversized or unsupported geometry', () => {
  assert.throws(() => importBoundary(' '.repeat(30001) + '{}'), /30 KB/);
  assert.throws(() => importBoundary('{bad json'));
  assert.throws(
    () =>
      importBoundary(JSON.stringify({ type: 'MultiPolygon', coordinates: [] })),
    /Polygon/,
  );
  assert.throws(
    () =>
      importBoundary(
        JSON.stringify({ type: 'Polygon', coordinates: [square, square] }),
      ),
    /holes/,
  );
  assert.throws(
    () =>
      draftPoints(
        JSON.stringify({ type: 'Polygon', coordinates: [[[181, 0]]] }),
      ),
    /WGS84/,
  );
  assert.throws(
    () =>
      importBoundary(
        JSON.stringify({ type: 'Polygon', coordinates: [square] }),
      ),
    /Close/,
  );
  assert.throws(
    () =>
      draftPoints(
        draftText(Array.from({ length: 201 }, (_, i) => [i / 10000, 1])),
      ),
    /200/,
  );
});

test('crossing drafts remain editable and are never filled or admitted for review', () => {
  const points = [
    [0, 0],
    [1, 1],
    [0, 1],
    [1, 0],
  ];
  assert.deepEqual(draftPoints(draftText(points)), points);
  assert.throws(() => importBoundary(draftText(points)), /cross/);
  assert.deepEqual(
    boundaryFeatures(points).features.map((f) => f.geometry.type),
    ['LineString'],
  );
  assert.deepEqual(
    boundaryFeatures(square).features.map((f) => f.geometry.type),
    ['LineString', 'Polygon'],
  );
  assert.deepEqual(boundaryFeatures([]).features, []);
});

test('coordinate entry rejects empty, nonfinite and out-of-range values', () => {
  assert.deepEqual(coordinate('-73.123456789', '44.5'), [-73.1234568, 44.5]);
  assert.deepEqual(coordinate('0', '0'), [0, 0]);
  for (const point of [
    ['', '1'],
    ['1', ' '],
    ['oops', '1'],
    ['Infinity', '0'],
    ['180.01', '0'],
    ['0', '-90.01'],
  ])
    assert.throws(() => coordinate(...point));
});
