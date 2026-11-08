import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateProductionBaseline,
  verifyBaselineReceipt,
  loadProductionBaseline,
} from '../scripts/production-baseline.mjs';

const baseline = JSON.parse(
  await readFile(
    new URL('../.github/production-baseline.json', import.meta.url),
    'utf8',
  ),
);

await test('reviewed production baseline resolves its exact historical receipt and known commit offline', async () => {
  assert.deepEqual(await loadProductionBaseline(), baseline);
});

await test('a known predecessor mentioned in the receipt cannot replace its reviewed deployed source', async () => {
  // The current receipt names the build it replaced; that build must not pass.
  const receiptPath = baseline.deploymentReceipt.replace(
    /^.*\/blob\/[a-f0-9]{40}\//,
    '',
  );
  const receipt = await readFile(
    new URL(`../${receiptPath}`, import.meta.url),
    'utf8',
  );
  const predecessor = '5d1a276490f50d019234f2515049b21889ad981f';
  assert.ok(receipt.includes(predecessor));
  assert.deepEqual(verifyBaselineReceipt(baseline, receipt), baseline);
  assert.throws(
    () =>
      verifyBaselineReceipt(
        { ...baseline, sourceCommit: predecessor },
        receipt,
      ),
    /INVALID_PRODUCTION_BASELINE/,
  );
});

await test('missing, malformed, mutable, unbound and unknown baselines fail closed', async () => {
  const invalid = [null, [], {}, { ...baseline, extra: true }];
  for (const sourceCommit of [
    '',
    'unknown',
    baseline.sourceCommit.slice(0, 7),
    'g'.repeat(40),
    123,
  ])
    invalid.push({ ...baseline, sourceCommit });
  for (const deploymentReceipt of [
    '',
    baseline.deploymentReceipt.replace(/blob\/[a-f0-9]{40}/, 'blob/main'),
    baseline.deploymentReceipt.replace('jdhart81', 'other-owner'),
    baseline.deploymentReceipt + '?download=1',
  ])
    invalid.push({ ...baseline, deploymentReceipt });
  for (const qualifiedAt of ['', 'yesterday', '2026-02-30T00:33:11.880182Z'])
    invalid.push({ ...baseline, qualifiedAt });
  for (const value of invalid)
    assert.throws(
      () => validateProductionBaseline(value),
      /INVALID_PRODUCTION_BASELINE/,
    );
  for (const value of [
    { ...baseline, sourceCommit: 'b'.repeat(40) },
    { ...baseline, qualifiedAt: '2026-10-06T00:33:11.880182Z' },
  ])
    assert.throws(
      () =>
        verifyBaselineReceipt(
          value,
          baseline.sourceCommit + ' ' + baseline.qualifiedAt,
        ),
      /INVALID_PRODUCTION_BASELINE/,
    );
  const dir = await mkdtemp(join(tmpdir(), 'verge-baseline-'));
  try {
    await assert.rejects(
      loadProductionBaseline(join(dir, 'missing.json')),
      /INVALID_PRODUCTION_BASELINE/,
    );
    await writeFile(join(dir, 'bad.json'), '{');
    await assert.rejects(
      loadProductionBaseline(join(dir, 'bad.json')),
      /INVALID_PRODUCTION_BASELINE/,
    );
    await writeFile(
      join(dir, 'unknown.json'),
      JSON.stringify({ ...baseline, sourceCommit: 'b'.repeat(40) }),
    );
    await assert.rejects(
      loadProductionBaseline(join(dir, 'unknown.json')),
      /INVALID_PRODUCTION_BASELINE/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
