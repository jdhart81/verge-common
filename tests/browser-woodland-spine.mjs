// Disposable self-hosted, local-only browser check of the old-growth spine in a woodland
// project. Three synthetic identities on the DFM watershed fixture; no hosted writes.
//   VERGE_WOODLAND_DFM=1 npm run start:selfhost   (PORT=3001, VERGE_ORIGIN=http://localhost:3001)
//   VERGE_TEST_ORIGIN=http://localhost:3001 node tests/browser-woodland-spine.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deriveSpine, toLandscapePackage } from '@viridis/dfm-core';
import { watershed, withAges, PARCELS } from './dfm-watershed-fixture.mjs';
const { chromium } = await import(
  process.env.VERGE_PLAYWRIGHT_MODULE || 'playwright'
);
const base = process.env.VERGE_TEST_ORIGIN || 'http://localhost:3001';
assert.ok(
  ['http://localhost:3000', 'http://localhost:3001'].includes(base),
  'Local origins only.',
);
const out = resolve('outputs/woodland-spine-review');
await mkdir(out, { recursive: true });
const round7 = (value) =>
  JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === 'number' ? Math.round(v * 1e7) / 1e7 : v,
    ),
  );
// The package a forester might bring from the DFM workspace: spine lines with their own IDs,
// the reviewed corridors drafted from them with stand ages, cores with temperatures.
const fixture = watershed({ treatments: [] });
const drafted = deriveSpine(fixture);
assert.equal(drafted.status, 'ok');
const pkg = round7(
  toLandscapePackage(
    {
      coreAreas: fixture.coreAreas,
      retained: withAges(drafted.features),
      roads: fixture.roads,
      water: [],
      crossings: fixture.crossings,
      streams: fixture.streams,
      connectors: fixture.connectors,
      params: fixture.params,
    },
    { name: 'Synthetic watershed', generator: 'browser fixture' },
  ),
);
const pkgText = JSON.stringify(pkg);
assert.ok(pkgText.length < 100000, `${pkgText.length} bytes`);

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const contexts = await Promise.all(
  Array.from({ length: 3 }, () =>
    browser.newContext({ viewport: { width: 1440, height: 1100 } }),
  ),
);
const pages = await Promise.all(contexts.map((c) => c.newPage()));
const [steward, reviewer, member] = pages;
const errors = [],
  consoleErrors = [],
  external = [],
  passed = [];
const coop = crypto.randomUUID();
let created = false;
for (const page of pages) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('request', (r) => {
    if (!/^(?:data|blob):/.test(r.url()) && !r.url().startsWith(base))
      external.push(r.url());
  });
}
const mark = (name) => {
  passed.push(name);
  console.log('PASS', name);
};
async function call(page, data) {
  const r = await page.request.post(base + '/api/workspaces', {
    headers: { Origin: base },
    data,
  });
  const j = await r.json();
  assert.ok(r.ok(), JSON.stringify(j));
  return j;
}
async function state(page = steward) {
  const r = await page.request.get(base + '/api/workspaces?id=' + coop);
  assert.ok(r.ok());
  return r.json();
}
async function command(page, op, payload) {
  const s = await state(page);
  return call(page, {
    id: coop,
    version: s.version,
    op,
    payload,
    requestId: crypto.randomUUID(),
  });
}
async function open(page) {
  await page.goto(base + '/workspace/?coop=' + coop);
  await page
    .getByRole('tab', { name: 'Woodland corridors', exact: true })
    .click();
  await page.locator('[data-woodland-spine], [data-woodland-editor]').first().waitFor();
}
try {
  const suffix = Date.now().toString(36);
  for (const [i, page] of pages.entries()) {
    const r = await page.request.post(base + '/auth/register', {
      headers: { Origin: base },
      form: {
        acceptTerms: 'yes',
        username: `spine_${suffix}_${i}`,
        displayName: ['Spine steward', 'Review steward', 'Woodlot member'][i],
        password: 'Synthetic browser fixture password 2026!',
      },
    });
    assert.equal(r.status(), 201);
  }
  await call(steward, {
    op: 'create',
    requestId: coop,
    payload: {
      name: 'Spine browser fixture',
      region: 'Synthetic',
      summary: 'Disposable local acceptance fixture',
      displayName: 'Spine steward',
    },
  });
  created = true;
  await command(steward, 'update_coop', {
    name: 'Spine browser fixture',
    region: 'Synthetic',
    summary: 'Disposable local acceptance fixture',
    visibility: 'public',
  });
  for (const [page, name] of [
    [reviewer, 'Review steward'],
    [member, 'Woodlot member'],
  ]) {
    await call(page, {
      id: coop,
      op: 'request_membership',
      requestId: crypto.randomUUID(),
      payload: { name },
    });
    const pending = (await state()).state.members.find((m) => m.name === name);
    await command(steward, 'member_status', { id: pending.id, status: 'active' });
    if (page === reviewer)
      await command(steward, 'member_role', { id: pending.id, role: 'steward' });
  }
  const project = (
    await command(steward, 'create_project', {
      name: 'Synthetic watershed spine',
      summary: 'Keep the spine linked',
      region: 'Synthetic',
      kind: 'woodland',
    })
  ).state.projects[0].id;
  // Nine woodlots: the member records 4 and 5; consent on 1–3; planned years on 4, 5, 7, 8.
  const ids = {};
  for (const [parcelKey, , consent, years] of PARCELS) {
    const dfmId = /** @type {string} */ (parcelKey);
    const page = ['woodlot-4', 'woodlot-5'].includes(dfmId) ? member : steward;
    const name = `Woodlot ${dfmId.split('-')[1]}`;
    const recorded = await command(page, 'record_parcel', {
      projectId: project,
      name,
      landReference: `Synthetic ${dfmId}`,
      areaSquareMetres: 1,
      consentReference: 'Synthetic holder statement',
    });
    const parcel = recorded.state.parcels.find((p) => p.name === name);
    ids[dfmId] = parcel.id;
    await command(reviewer, 'review_parcel', { id: parcel.id, decision: 'approve' });
    const geometry = fixture.parcels.find((p) => p.properties.dfm_id === dfmId).geometry;
    const withBoundary = await command(page, 'save_boundary', {
      parcelId: parcel.id,
      geometry,
      consentReference: 'Synthetic boundary statement',
    });
    const boundary = withBoundary.state.parcels.find((p) => p.id === parcel.id).boundaries.at(-1);
    await command(reviewer, 'review_boundary', {
      parcelId: parcel.id,
      id: boundary.id,
      decision: 'approve',
    });
    if (consent === 'covered') {
      const recordedConsent = await command(page, 'record_parcel_consent', {
        parcelId: parcel.id,
        holder: 'Synthetic holder',
        authority: 'Synthetic authority',
        reference: 'Synthetic consent',
        scope: 'Pooling this woodlot',
        attested: true,
      });
      const c = recordedConsent.state.parcels.find((p) => p.id === parcel.id).consents.at(-1);
      await command(reviewer, 'review_parcel_consent', {
        parcelId: parcel.id,
        id: c.id,
        decision: 'approve',
        note: 'Synthetic review',
      });
    }
    if (years.planned_year)
      await command(page, 'plan_parcel_join', { parcelId: parcel.id, year: years.planned_year });
  }
  mark('Nine synthetic woodlots recorded with reviewed boundaries, three consents and four planned years');

  // Steward imports the package, redrafts the spine and keeps the recorded ages.
  await open(steward);
  const editor = steward.locator('[data-woodland-editor="layers"]');
  await editor.getByLabel('Landscape Package upload', { exact: true }).setInputFiles({
    name: 'watershed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(pkgText),
  });
  await editor.getByText('streams: 12 / 400', { exact: false }).waitFor();
  await editor.getByRole('button', { name: 'Draft spine corridors', exact: true }).click();
  await editor.getByText('Spine draft: 14 corridors in Retained corridors', { exact: true }).waitFor();
  await editor.getByLabel('Drawing layer', { exact: true }).selectOption('retained');
  await editor.getByLabel('Select feature', { exact: true }).selectOption({ index: 1 });
  assert.match(
    await editor.getByLabel('Stand age in years (optional)', { exact: true }).inputValue(),
    /^\d+$/,
    'drafting again keeps the stand age recorded on the imported corridor',
  );
  await editor.locator('[data-spine-settings] summary').click();
  assert.equal(await editor.getByLabel('Order 3 width (m)', { exact: true }).inputValue(), '180');
  mark('WS6 imported spine lines redraft into 14 corridors and keep imported stand ages and widths');
  const problems = await editor.getByLabel('Draft problems', { exact: true }).locator('li').allInnerTexts().catch(() => []);
  assert.deepEqual(problems, [], 'the imported and redrafted layers have no problems');
  await steward.getByLabel('Layer notes', { exact: true }).fill('Synthetic watershed layers');
  const saved = steward.waitForResponse(
    (r) => r.url().endsWith('/api/workspaces') && r.request().method() === 'POST',
  );
  await editor.getByRole('button', { name: 'Submit layers for review', exact: true }).click();
  assert.ok((await saved).ok());
  await open(reviewer);
  await reviewer.getByLabel('Layer review note', { exact: true }).fill('Checked against the synthetic map');
  await reviewer.getByRole('button', { name: 'Approve layers', exact: true }).click();
  await reviewer.locator('[data-woodland-spine]').waitFor();
  const reviewed = (await state(reviewer)).state.woodlandLayers.at(-1);
  assert.equal(reviewed.status, 'reviewed');
  assert.equal(reviewed.reviewNote, 'Checked against the synthetic map');
  assert.equal(reviewed.layers.streams.length, 12);
  mark('WS5/W1 layers with spine lines saved by one steward and reviewed by another, with a written note');

  // Analyses as the steward.
  await open(steward);
  const spine = steward.locator('[data-woodland-spine]');
  const runAnalysis = async (page, button, kind) => {
    const panel = page.locator('[data-woodland-spine]');
    await panel.getByRole('button', { name: button, exact: true }).click();
    const card = panel.locator(`[data-spine-result="${kind}"]`);
    await card.waitFor({ timeout: 45000 });
    assert.equal(await card.getAttribute('data-status'), 'ok');
    return card;
  };
  const network = await runAnalysis(steward, 'Test the network', 'network');
  await network.getByText('6 of 6 core-area pairs are linked through the spine.', { exact: false }).waitFor();
  const frontier = await runAnalysis(steward, 'Find the next woodlots', 'frontier');
  const firstRow = frontier.locator('tbody tr').first();
  assert.match(await firstRow.innerText(), /Woodlot 4/);
  assert.equal(await frontier.locator('tbody tr').count(), 5);
  const outlook = await runAnalysis(steward, 'Project the years ahead', 'outlook');
  assert.equal(await outlook.locator('tbody tr').count(), 5);
  const climate = await runAnalysis(steward, 'Find climate routes', 'climate');
  assert.equal(await climate.locator('tbody tr').count(), 4);
  await spine.screenshot({ path: out + '/steward-spine.png' });
  mark('WS7 steward runs network, frontier, outlook and climate analyses in the worker; next woodlot is Woodlot 4');

  // The member sees the co-op total and their own woodlots, never the others' names or places.
  await open(member);
  const total = await runAnalysis(member, 'See the committed spine', 'frontier');
  assert.equal(await total.locator('tbody tr').count(), 0, 'no per-woodlot rows');
  await total.getByText('so members see the co-op total', { exact: false }).waitFor();
  assert.ok(!/Woodlot \d/.test(await total.innerText()), 'no woodlot names');
  const memberOutlook = await runAnalysis(member, 'Project the years ahead', 'outlook');
  const text = await memberOutlook.innerText();
  assert.ok(!/Woodlot [12356789]\b/.test(text.replace(/Woodlot 4|Woodlot 5/g, '')), 'no other woodlot names');
  await memberOutlook
    .getByText('counts planned join years only for woodlots you recorded', { exact: false })
    .waitFor();
  mark('WS8 a member sees the build-out total and only the woodlots they recorded, with counts for the rest');
  await member.setViewportSize({ width: 390, height: 844 });
  await member.locator('[data-woodland-spine]').scrollIntoViewIfNeeded();
  assert.ok(
    await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'no horizontal page overflow at 390 px',
  );
  await member.screenshot({ path: out + '/member-mobile.png', fullPage: true });
  mark('390 px mobile has no horizontal page overflow');

  // The planned-year form changes the member's own woodlot only.
  await member.setViewportSize({ width: 1440, height: 1100 });
  await member.locator('[data-planned-join] summary').click();
  await member.getByLabel(/^Woodlot 5/).fill('2031');
  await member
    .locator('[data-planned-join] form')
    .filter({ hasText: 'Woodlot 5' })
    .getByRole('button', { name: 'Save planned year', exact: true })
    .click();
  await member.getByText('Woodlot 5 · planned 2031', { exact: false }).waitFor();
  mark('WS9 a member sets a planned join year on their own woodlot from the spine panel');
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(external, []);
  mark('No browser errors and no third-party requests');
} finally {
  if (created)
    await command(steward, 'update_coop', {
      name: 'Spine browser fixture',
      region: 'Synthetic',
      summary: 'Disposable local acceptance fixture',
      visibility: 'archived',
    }).catch(() => {});
  await writeFile(out + '/results.json', JSON.stringify({ passed, errors, consoleErrors }, null, 2) + '\n');
  await browser.close();
}
