import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);

await test('operational encryption, safe recovery extraction, committed erasure ledger and scheduler installation are isolated and verified', async () => {
  const result = await execute('python3', ['tests/operations_test.py'], {
    timeout: 60000,
    maxBuffer: 100000,
  });
  assert.match(result.stderr, /Ran 15 tests/);
  assert.match(result.stderr, /OK/);
});
