// Standalone offline audit using already-installed operator tooling, not npm dependencies.
// Set VERGE_PLAYWRIGHT_MODULE and VERGE_AXE_SOURCE to local paths; use installed Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { updatesPage } from '../self-hosted/updates.mjs';
const { chromium } = await import(
  pathToFileURL(process.env.VERGE_PLAYWRIGHT_MODULE).href
);
const axe = await readFile(process.env.VERGE_AXE_SOURCE, 'utf8');
await test('Updates signup, confirmation, success and failure have zero WCAG 2.1 A/AA axe violations offline', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    for (const [message, token] of [
      ['', null],
      ['', 'v1.encrypted-test-token'],
      ['Your subscription is confirmed. You can unsubscribe anytime.', null],
      ['Link expired or invalid — sign up again.', null],
    ]) {
      await page.setContent(updatesPage(message, token));
      await page.addScriptTag({ content: axe });
      const result = await page.evaluate(async () =>
        window.axe.run(document, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
          },
        }),
      );
      assert.deepEqual(
        result.violations.map((v) => v.id),
        [],
      );
    }
    await page.setViewportSize({ width: 320, height: 640 });
    await page.setContent(updatesPage());
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'email');
  } finally {
    await browser.close();
  }
});
