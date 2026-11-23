import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';

// Google asks a site owner to prove ownership by serving one file at the site root. Ownership
// of https://vergecommon.com/ lets Google show "VergeCommon" on its sign-in screen in place of
// the sign-in service's own address. Google's rule: the file must stay in place.
await test('the Google ownership file is present, exact, and the only one', () => {
  const files = readdirSync(new URL('../public/', import.meta.url)).filter((f) => /^google[0-9a-f]+\.html$/.test(f));
  assert.deepEqual(files, ['googleaf96b525bb3d46d2.html']);
  const body = readFileSync(new URL(`../public/${files[0]}`, import.meta.url), 'utf8');
  // Exactly Google's one line: no markup, no script, nothing a visitor could be shown.
  assert.equal(body, `google-site-verification: ${files[0]}`);
});
