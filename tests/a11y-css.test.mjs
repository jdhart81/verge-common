import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const rule = (selector) => {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `missing rule for ${selector}`);
  return css.slice(at, css.indexOf('}', at));
};

await test('every kind of keyboard stop shows where focus is (WCAG 2.4.7)', () => {
  const shared = css.slice(css.indexOf('a:focus-visible,'), css.indexOf('}', css.indexOf('a:focus-visible,')));
  for (const el of ['a', 'button', 'input', 'select', 'summary', 'textarea'])
    assert.ok(shared.includes(`${el}:focus-visible`), el);
  assert.match(shared, /outline: 3px solid/);
  const panel = rule("[role='tabpanel']:focus-visible");
  assert.match(panel, /outline: 3px solid/);
  assert.match(panel, /outline-offset: -\d+px/, 'drawn inside, so the page edge cannot clip it');
});

await test('a select never forces sideways scrolling (WCAG 1.4.10)', () => {
  assert.match(rule('\nselect {'), /max-width: 100%/);
});
