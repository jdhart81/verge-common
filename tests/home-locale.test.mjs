import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveHomeLocale } from '../lib/i18n/locale.mjs';

void test('Hindi is selected for a Hindi-first Accept-Language header', () => {
  assert.equal(resolveHomeLocale('hi-IN,hi;q=0.9,en;q=0.8'), 'hi');
  assert.equal(resolveHomeLocale('hi'), 'hi');
});

void test('English is selected when it has higher preference', () => {
  assert.equal(resolveHomeLocale('en-US,en;q=0.9,hi;q=0.8'), 'en');
  assert.equal(resolveHomeLocale('hi;q=0.4,en;q=0.9'), 'en');
});

void test('quality zero disables a locale, including Hindi', () => {
  assert.equal(resolveHomeLocale('hi;q=0,en;q=0.4'), 'en');
  assert.equal(resolveHomeLocale('hi;q=0'), 'en');
});

void test('unsupported, empty, and invalid preferences fall back to English', () => {
  for (const value of ['fr-FR', '', undefined, null, 'hindi', 'hi;q=bad']) {
    assert.equal(resolveHomeLocale(value), 'en');
  }
});

void test('browser language lists respect their order and locale subtags', () => {
  assert.equal(resolveHomeLocale(['hi-IN', 'en-US']), 'hi');
  assert.equal(resolveHomeLocale(['en-US', 'hi-IN']), 'en');
  assert.equal(resolveHomeLocale(['ur-PK', 'hi-IN']), 'hi');
});

void test('equal preferences preserve the first supported language', () => {
  assert.equal(resolveHomeLocale('hi;q=0.8,en;q=0.8'), 'hi');
  assert.equal(resolveHomeLocale('en;q=0.8,hi;q=0.8'), 'en');
});

void test('the Hindi dictionary has every English key and home content uses only defined keys', async () => {
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

void test('hosted and static entry points keep existing URLs and English-first hydration', async () => {
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const home = await read('components/home-content.tsx');
  const route = await read('app/page.tsx');
  const staticClient = await read('public-site/main.tsx');
  const staticRenderer = await read('public-site/render.tsx');
  assert.match(home, /returnTo=%2Fworkspace%2F/);
  assert.match(home, /href=\{startLink\}/);
  assert.match(home, /<UpdatesLink label=\{t\.getUpdates\}/);
  assert.match(route, /resolveHomeLocale\(requestHeaders\.get\('accept-language'\)\)/);
  assert.match(staticClient, /useSyncExternalStore\(/);
  assert.match(staticClient, /getServerLocale\(\): HomeLocale \{\s*return 'en';/);
  assert.match(staticRenderer, /publicPreview locale="en"/);
  assert.match(staticClient, /window\.location\.pathname === '\/demo\/'/);
});

void test('the corridor story has a caption per scene, a pause control and a still final state', async () => {
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const landscape = await read('components/conservation-landscape.tsx');
  const css = await read('components/conservation-landscape.css');
  const en = await read('lib/i18n/en.ts');
  // Six scenes, each with its caption, plus a summary read once by screen readers.
  for (const key of ['Valley', 'Plan', 'Join', 'Age', 'Edge', 'Next'])
    assert.ok(landscape.includes(`t.landscapeStory${key}`), key);
  assert.match(landscape, /vc-landscape-story-summary[\s\S]*t\.landscapeStorySummary/);
  assert.match(landscape, /aria-hidden="true"\s+className=\{`vc-landscape-story-caption /);
  for (let scene = 1; scene <= 6; scene++)
    assert.ok(css.includes(`@keyframes vc-story-caption-${scene}`), `caption ${scene}`);
  // The loop runs longer than five seconds, so it can be paused; without motion it is still.
  assert.match(landscape, /aria-pressed=\{userPaused\}/);
  assert.match(landscape, /userPaused \? t\.landscapePlay : t\.landscapePause/);
  assert.match(landscape, /\{!reducedMotion && \(/);
  assert.match(css, /\[data-motion='paused'\] \[class\*='vc-landscape-'\]\s*\{\s*animation-play-state: paused/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
  // Every story animation is switched off in the static view, which shows the final state.
  const storyRules = [...css.matchAll(/([^{}]*)\{\s*animation: vc-story-/g)].map((m) => m[1]);
  assert.ok(storyRules.length >= 15, `${storyRules.length} story animations`);
  for (const selector of storyRules)
    assert.ok(selector.includes(":not([data-motion='static'])"), selector);
  // The junction scene is the aim, not a feature on offer, and nothing claims a real place.
  assert.match(en, /landscapeStoryNext: 'The aim: /);
  assert.match(en, /landscapeCaptionDisclaimer: 'Illustration only/);
  assert.doesNotMatch(en.match(/landscapeStory\w+: '[^']*'/g).join(' '), /certif|guarantee|carbon credit/i);
});
