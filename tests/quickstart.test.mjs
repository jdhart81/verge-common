import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Locks the expected output printed in docs/QUICKSTART.md. If a change moves these numbers,
// update the quickstart with it.
const run = (script) =>
  promisify(execFile)(process.execPath, [script], { encoding: 'utf8' });

await test('QUICKSTART woodland plan check reproduces with dfm-core alone', async () => {
  const { stdout } = await run('scripts/quickstart-example.mjs');
  assert.equal(
    stdout,
    [
      'Plan: Synthetic winter harvest, one consented 100 ha woodlot, two units',
      'ok   engine                 dfm-connectivity-0.2.0',
      'ok   input checksum         sha256:af1aae770551cf36ebd9ed3309991108ba0cd6d7ae9fef303e52ca702baba21b',
      'ok   status                 fail',
      'ok   lost links             core-A-core-B (harvest-3)',
      'ok   pinched links          0',
      'ok   committed corridor m2  72000.79',
      'ok   proposed corridor m2   72000.69',
      'VergeCommon and dfm-core agree. Matches docs/QUICKSTART.md',
      '',
    ].join('\n'),
  );
});

await test('QUICKSTART co-op rehearsal prints the documented summary', async () => {
  // Writes its records to the ignored outputs/coop-simulation/ directory, as `npm run
  // simulate:coop` does.
  const { stdout } = await run('scripts/simulate-coop-journey.mjs');
  const summary = JSON.parse(stdout);
  assert.equal(summary.classification, 'FICTIONAL_OFFLINE_DOMAIN_SIMULATION');
  assert.equal(summary.successfulCommands, 110);
  assert.equal(summary.expectedDenials, 26);
  assert.equal(summary.areaHectares.toFixed(3), '33.384');
  assert.deepEqual(summary.memberAmountsCents, {
    Maya: 56000,
    Theo: 49000,
    Nadia: 35000,
    Lena: 0,
  });
  assert.equal(summary.actualRevenueCents, 0);
});
