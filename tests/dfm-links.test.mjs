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

await test('the public footers lead to the woodland page, which links the DFM site; the panel credits DFM', async () => {
  for (const f of ['app/page.tsx', 'components/information-page.tsx'])
    assert.match(await read(f), /\/woodland\//, f);
  const page = await read('app/woodland/page.tsx');
  assert.match(page, /href=\{DFM_SITE_URL\}/);
  assert.match(page, /from '@\/lib\/dfm-site\.mjs'/);
  assert.match(page, /dfm\('unbroken\/'\)/, 'the campaign is linked');
  assert.match(page, /dfm\('data-format\/'\)/, 'the exchange format is linked');
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
