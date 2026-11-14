// VergeCommon names the related open projects on every public footer, and points to
// Viridis's own services once, without selling anything itself (R1-R4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  RELATED_PROJECTS,
  VIRIDIS_SERVICES_HREF,
} from '../lib/related-projects.mjs';
import { DFM_SITE_URL } from '../lib/dfm-site.mjs';

const read = (f) => readFile(new URL('../' + f, import.meta.url), 'utf8');

await test('the related projects are the DFM site, GSIP and the Viridis ecosystem page', () => {
  assert.deepEqual(
    RELATED_PROJECTS.map((p) => p.href),
    [
      DFM_SITE_URL,
      'https://globalsoilintelligence.com/',
      'https://viridisconservation.com/ecosystem',
    ],
  );
  for (const p of RELATED_PROJECTS) assert.ok(p.name.length > 5, p.href);
});

await test('R3: every link is a plain https address with nothing about the visitor', () => {
  for (const href of [
    ...RELATED_PROJECTS.map((p) => p.href),
    VIRIDIS_SERVICES_HREF,
  ]) {
    const u = new URL(href);
    assert.equal(u.protocol, 'https:', href);
    assert.equal(u.search, '', `${href}: no query string`);
    assert.equal(u.hash, '', href);
    assert.equal(u.username + u.password, '', href);
  }
});

await test('R2: one services link, on Viridis, labelled as a separate service', async () => {
  assert.equal(
    new URL(VIRIDIS_SERVICES_HREF).hostname,
    'viridisconservation.com',
  );
  const component = await read('components/related-projects.tsx');
  assert.equal(component.match(/href=\{VIRIDIS_SERVICES_HREF\}/g)?.length, 1);
  assert.match(component, /Land plans from Viridis \(separate service\)/);
  const en = await read('lib/i18n/en.ts');
  assert.match(
    en,
    /viridisServices: 'Land plans from Viridis \(separate service\)'/,
  );
  const hi = await read('lib/i18n/hi.ts');
  assert.match(
    hi,
    /viridisServices: 'Viridis /,
    'the Hindi label keeps the company name',
  );
  assert.match(hi, /relatedProjects: '/);
});

await test('R1: nothing here states a price or offers a purchase', async () => {
  for (const f of [
    'components/related-projects.tsx',
    'lib/related-projects.mjs',
  ]) {
    const text = (await read(f)).replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(
      text,
      /[$€£₹]\s?\d|per month|subscribe|buy now|checkout|<form|<button/i,
      f,
    );
  }
});

await test('both public footers render the related projects from the one module', async () => {
  const home = await read('components/home-content.tsx');
  assert.match(
    home,
    /<RelatedProjects\s+label=\{t\.relatedProjects\}\s+servicesLabel=\{t\.viridisServices\}/,
  );
  const info = await read('components/information-page.tsx');
  assert.match(info, /<RelatedProjects \/>/);
  for (const [name, text] of [
    ['home', home],
    ['information', info],
  ]) {
    assert.doesNotMatch(
      text,
      /globalsoilintelligence\.com|viridisconservation\.com\/(ecosystem|land-plans)/,
      `${name} hard-codes an address`,
    );
  }
});
