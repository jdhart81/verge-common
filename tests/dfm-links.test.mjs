// VergeCommon and the DFM site link to each other, and the proxy serves the
// same address VergeCommon links to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DFM_SITE_URL } from '../lib/dfm-site.mjs';

const read = (f) => readFile(new URL('../' + f, import.meta.url), 'utf8');

await test('the DFM site address is a bare https origin on dendriticforest.com', () => {
  const u = new URL(DFM_SITE_URL);
  assert.equal(u.protocol, 'https:');
  assert.equal(u.hostname, 'dendriticforest.com');
  assert.equal(u.pathname, '/');
});

await test('the public footers and the woodland panel link to the DFM site', async () => {
  for (const f of ['app/page.tsx', 'components/information-page.tsx']) {
    const s = await read(f);
    assert.match(s, /href=\{DFM_SITE_URL\}/, f);
    assert.match(s, /from '@\/lib\/dfm-site\.mjs'/, f);
  }
  const panel = await read('components/woodland-panel.tsx');
  assert.equal(
    panel.match(/href=\{DFM_SITE_URL\}/g)?.length,
    2,
    'both panel states credit DFM',
  );
});

await test('the Caddyfile serves the linked host and redirects www to it', async () => {
  const caddy = await read('self-hosted/Caddyfile');
  const host = new URL(DFM_SITE_URL).hostname;
  assert.match(
    caddy,
    new RegExp(
      `^${host.replace(/\./g, '\\.')} \\{[\\s\\S]*?reverse_proxy dendriticforest-site:8080`,
      'm',
    ),
  );
  assert.match(
    caddy,
    new RegExp(
      `^www\\.${host.replace(/\./g, '\\.')} \\{\\s*redir https://${host.replace(/\./g, '\\.')}\\{uri\\} permanent`,
      'm',
    ),
  );
  assert.doesNotMatch(
    caddy,
    /dendriticforest\.org|unbrokenwoods/,
    'unregistered names must not be in the proxy config',
  );
});
