// Run after build:selfhost: node --test tests/updates-built.mjs
// No server socket, DNS or external fetch is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../dist/server/index.js';
import { updatesVariables } from '../lib/updates-config.mjs';
globalThis.fetch = () => {
  throw new Error('Network forbidden in built-page tests');
};
const fixture = {
  VERGE_UPDATES_ENABLED: '1',
  RESEND_API_KEY: 'fixture-api-secret',
  VERGE_UPDATES_SIGNING_SECRET: 'fixture-signing-secret-at-least-32-bytes',
  VERGE_UPDATES_SEGMENT_ID: 'segment-fixture',
  VERGE_UPDATES_FROM: 'VergeCommon <updates@vergecommon.com>',
  VERGE_UPDATES_REPLY_TO: 'justin@vergecommon.com',
  VERGE_UPDATES_POSTAL_ADDRESS: 'Fixture postal address',
};
const original = Object.fromEntries(
  ['VERGE_UPDATES_ENABLED', ...updatesVariables].map((key) => [
    key,
    process.env[key],
  ]),
);
function restore() {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
await test('I1 built home, support and information footer hide links for every missing variable', async () => {
  try {
    for (const key of Object.keys(fixture)) {
      Object.assign(process.env, fixture);
      delete process.env[key];
      for (const path of ['/', '/support-project/', '/privacy/']) {
        const response = await handler(new Request(`http://localhost${path}`));
        assert.equal(response.status, 200);
        assert.equal(
          (await response.text()).includes('href="/updates/"'),
          false,
        );
      }
    }
    for (const key of Object.keys(fixture)) delete process.env[key];
    assert.equal(
      (await handler(new Request('http://localhost/updates/'))).status,
      404,
    );
  } finally {
    restore();
  }
});
await test('I1 I11 enabled built pages show links at runtime without rendering either secret', async () => {
  try {
    Object.assign(process.env, fixture);
    for (const path of ['/', '/support-project/', '/privacy/']) {
      const response = await handler(new Request(`http://localhost${path}`));
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.ok(html.includes('href="/updates/"'));
      for (const key of ['RESEND_API_KEY', 'VERGE_UPDATES_SIGNING_SECRET'])
        assert.equal(html.includes(fixture[key]), false);
    }
  } finally {
    restore();
  }
});
