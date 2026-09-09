import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAnalysis } from '../lib/analysis.mjs';
const job = {
  id: 'job',
  boundaryId: 'boundary',
  geometryCanonical: '{}',
  scenes: [{ id: 'a' }, { id: 'b' }],
};
const receipt = {
  algorithm: 'paired-ndvi-v1',
  jobId: 'job',
  boundaryId: 'boundary',
  geometryCanonical: '{}',
  sceneIds: ['a', 'b'],
  processorSha256: 'a'.repeat(64),
  inputSha256: Array.from({ length: 2 }, () => ({
    red: 'b'.repeat(64),
    nir: 'c'.repeat(64),
    scl: 'd'.repeat(64),
  })),
  radiometry: Array.from({ length: 2 }, () => ({
    red: { scale: 0.0001, offset: -0.1 },
    nir: { scale: 0.0001, offset: -0.1 },
  })),
  runtime: { numpy: '2.4.3', rasterio: '1.4.4' },
  totalPixels: 100,
  pairedPixels: 80,
  beforeValidPixels: 90,
  afterValidPixels: 90,
  beforeMean: 0.6,
  afterMean: 0.2,
  meanChange: -0.4,
  quality: 'sufficient_for_screening',
  signal: 'decrease_for_review',
  maskClasses: [4, 5, 6],
};
test('imagery imports bind geometry, scene order and internally consistent metrics', () => {
  assert.equal(validateAnalysis(receipt, job).signal, 'decrease_for_review');
  for (const change of [
    { geometryCanonical: 'changed' },
    { sceneIds: ['b', 'a'] },
    { pairedPixels: 79 },
    { meanChange: 0.4 },
    { quality: 'certified' },
    { beforeMean: 2 },
    { processorSha256: 'fake' },
  ])
    assert.throws(() => validateAnalysis({ ...receipt, ...change }, job));
});
test('insufficient coverage cannot retain a numerical conclusion', () => {
  const sparse = {
    ...receipt,
    pairedPixels: 0,
    beforeValidPixels: 0,
    afterValidPixels: 0,
    beforeMean: null,
    afterMean: null,
    meanChange: null,
    quality: 'insufficient_coverage',
    signal: 'unavailable',
  };
  assert.equal(validateAnalysis(sparse, job).meanChange, null);
  assert.throws(() => validateAnalysis({ ...sparse, meanChange: 0 }, job));
});
