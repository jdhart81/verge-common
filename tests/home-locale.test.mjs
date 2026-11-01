import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveHomeLocale } from '../lib/i18n/locale.mjs';

test('Hindi is selected for a Hindi-first Accept-Language header', () => {
  assert.equal(resolveHomeLocale('hi-IN,hi;q=0.9,en;q=0.8'), 'hi');
  assert.equal(resolveHomeLocale('hi'), 'hi');
});

test('English is selected when it has higher preference', () => {
  assert.equal(resolveHomeLocale('en-US,en;q=0.9,hi;q=0.8'), 'en');
  assert.equal(resolveHomeLocale('hi;q=0.4,en;q=0.9'), 'en');
});

test('quality zero disables a locale, including Hindi', () => {
  assert.equal(resolveHomeLocale('hi;q=0,en;q=0.4'), 'en');
  assert.equal(resolveHomeLocale('hi;q=0'), 'en');
});

test('unsupported, empty, and invalid preferences fall back to English', () => {
  for (const value of ['fr-FR', '', undefined, null, 'hindi', 'hi;q=bad']) {
    assert.equal(resolveHomeLocale(value), 'en');
  }
});

test('browser language lists respect their order and locale subtags', () => {
  assert.equal(resolveHomeLocale(['hi-IN', 'en-US']), 'hi');
  assert.equal(resolveHomeLocale(['en-US', 'hi-IN']), 'en');
  assert.equal(resolveHomeLocale(['ur-PK', 'hi-IN']), 'hi');
});

test('equal preferences preserve the first supported language', () => {
  assert.equal(resolveHomeLocale('hi;q=0.8,en;q=0.8'), 'hi');
  assert.equal(resolveHomeLocale('en;q=0.8,hi;q=0.8'), 'en');
});

test('the Hindi dictionary has every English key and home content uses only defined keys', async () => {
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const enSource = await read('lib/i18n/en.ts');
  const hiSource = await read('lib/i18n/hi.ts');
  const homeSource = await read('components/home-content.tsx');
  const landscapeSource = await read('components/conservation-landscape.tsx');
  const getKeys = (source) => [...source.matchAll(/^  (\w+):/gm)].map((match) => match[1]);
  const enKeys = getKeys(enSource);
  const hiKeys = getKeys(hiSource);
  assert.ok(enKeys.length > 90, 'homepage and landscape translation keys must be present');
  assert.equal(new Set(enKeys).size, enKeys.length, 'no duplicate English keys');
  assert.equal(new Set(hiKeys).size, hiKeys.length, 'no duplicate Hindi keys');
  assert.deepEqual(hiKeys, enKeys, 'same keys in the same order');
  const usedKeys = [homeSource, landscapeSource]
    .flatMap((source) => [...source.matchAll(/\bt\.(\w+)/g)].map((match) => match[1]));
  for (const key of usedKeys) {
    assert.ok(enKeys.includes(key), `missing translated key: ${key}`);
  }
});

test('hosted and static entry points keep existing URLs and English-first hydration', async () => {
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const home = await read('components/home-content.tsx');
  const route = await read('app/page.tsx');
  const staticClient = await read('public-site/main.tsx');
  const staticRenderer = await read('public-site/render.tsx');
  assert.match(home, /returnTo=%2Fworkspace%2F/);
  assert.match(home, /href=\{startLink\}/);
  assert.match(home, /<UpdatesLink label=\{t\.getUpdates\}/);
  assert.match(route, /resolveHomeLocale\(requestHeaders\.get\('accept-language'\)\)/);
  assert.match(staticClient, /useState<HomeLocale>\('en'\)/);
  assert.match(staticRenderer, /publicPreview locale="en"/);
  assert.match(staticClient, /window\.location\.pathname === '\/demo\/'/);
});
