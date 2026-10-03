// Disposable self-hosted, local-only fixture. Three synthetic identities, no hosted writes.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  pt,
  rect,
  layers as fixtureLayers,
  params,
} from './woodland-editor-fixture.mjs';
const { chromium } = await import(
  process.env.VERGE_PLAYWRIGHT_MODULE || 'playwright'
);
const base = process.env.VERGE_TEST_ORIGIN || 'http://localhost:3001';
assert.ok(
  ['http://localhost:3000', 'http://localhost:3001'].includes(base),
  'Local origins only.',
);
const out = resolve('outputs/woodland-editor-review');
await mkdir(out, { recursive: true });
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
let optIn = false,
  created = false;
const coop = crypto.randomUUID();
for (const page of pages) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('request', (r) => {
    if (
      !r.url().startsWith(base) &&
      !r.url().startsWith('data:') &&
      !r.url().startsWith('blob:')
    )
      external.push({ url: r.url(), optIn });
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
  const s = await state();
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
}
async function coordinate(editor, lng, lat, keyboard = false) {
  if (keyboard) {
    await editor.getByLabel('Longitude', { exact: true }).focus();
    await editor.page().keyboard.press('ControlOrMeta+A');
    await editor.page().keyboard.type(String(lng));
    await editor.getByLabel('Latitude', { exact: true }).focus();
    await editor.page().keyboard.press('ControlOrMeta+A');
    await editor.page().keyboard.type(String(lat));
    await editor
      .getByRole('button', { name: 'Add coordinate', exact: true })
      .focus();
    await editor
      .getByRole('button', { name: 'Add coordinate', exact: true })
      .press('Space');
    await editor
      .getByLabel('Select vertex', { exact: true })
      .getByRole('option', { name: 'Vertex 1', exact: true })
      .waitFor({ state: 'attached' });
  } else {
    await editor.getByLabel('Longitude', { exact: true }).fill(String(lng));
    await editor.getByLabel('Latitude', { exact: true }).fill(String(lat));
    await editor
      .getByRole('button', { name: 'Add coordinate', exact: true })
      .click();
  }
}
async function feature(editor, layer, name, points) {
  await editor.getByLabel('Drawing layer', { exact: true }).selectOption(layer);
  await editor
    .getByRole('button', { name: 'New feature', exact: true })
    .click();
  await editor.getByLabel('Feature name', { exact: true }).fill(name);
  for (const p of points) await coordinate(editor, ...p);
}
try {
  const suffix = Date.now().toString(36);
  for (const [i, page] of pages.entries()) {
    const r = await page.request.post(base + '/auth/register', {
      headers: { Origin: base },
      form: {
        acceptTerms: 'yes',
        username: `woodland_${suffix}_${i}`,
        displayName: ['Drawing steward', 'Review steward', 'Woodland member'][
          i
        ],
        password: 'Synthetic browser fixture password 2026!',
      },
    });
    assert.equal(r.status(), 201);
  }
  await call(steward, {
    op: 'create',
    requestId: coop,
    payload: {
      name: 'Woodland editor browser fixture',
      region: 'Synthetic',
      summary: 'Disposable local acceptance fixture',
      displayName: 'Drawing steward',
    },
  });
  created = true;
  await command(steward, 'update_coop', {
    name: 'Woodland editor browser fixture',
    region: 'Synthetic',
    summary: 'Disposable local acceptance fixture',
    visibility: 'public',
  });
  for (const [page, name] of [
    [reviewer, 'Review steward'],
    [member, 'Woodland member'],
  ]) {
    const r = await call(page, {
      id: coop,
      op: 'request_membership',
      requestId: crypto.randomUUID(),
      payload: { name },
    });
    assert.ok(r);
    const pending = (await state()).state.members.find((m) => m.name === name);
    assert.ok(pending);
    await command(steward, 'member_status', {
      id: pending.id,
      status: 'active',
    });
    if (page === reviewer)
      await command(steward, 'member_role', {
        id: pending.id,
        role: 'steward',
      });
  }
  const result = await command(steward, 'create_project', {
    name: 'Synthetic North woodlot',
    summary: 'Keep fixture cores linked',
    region: 'Synthetic',
    kind: 'woodland',
  });
  const projectId = result.state.projects[0].id;
  // Reviewed parcel reference and current consent: browser preview receives the same private snapshot.
  const pr = await command(steward, 'record_parcel', {
    projectId,
    name: 'Synthetic reference parcel',
    landReference: 'Fixture only',
    areaSquareMetres: 1e6,
    consentReference: 'Synthetic consent',
  });
  const parcelId = pr.state.parcels[0].id;
  await command(reviewer, 'review_parcel', {
    id: parcelId,
    decision: 'approve',
  });
  await command(steward, 'save_boundary', {
    parcelId,
    geometry: rect(0, 0, 1000, 1000),
    consentReference: 'Synthetic reviewed boundary',
  });
  const boundaryId = (await state()).state.parcels[0].boundaries.at(-1).id;
  await command(reviewer, 'review_boundary', {
    parcelId,
    id: boundaryId,
    decision: 'approve',
  });
  await command(steward, 'record_parcel_consent', {
    parcelId,
    holder: 'Synthetic holder',
    authority: 'Synthetic authority',
    reference: 'Synthetic consent',
    scope: 'Fixture only',
    attested: true,
  });
  const consentId = (await state()).state.parcels[0].consents.at(-1).id;
  await command(reviewer, 'review_parcel_consent', {
    parcelId,
    id: consentId,
    decision: 'approve',
    note: 'Synthetic independent review',
  });
  // Exercise the exact client flag boundary using a flag-off server projection.
  const manifest = JSON.parse(
    await readFile(resolve('dist/client/.vite/manifest.json'), 'utf8'),
  );
  const engineKey = 'node_modules/@viridis/dfm-core/src/index.mjs';
  const panelKey = 'components/woodland-panel.tsx';
  const staticClosure = (key, seen = new Set()) => {
    if (seen.has(key)) return seen;
    seen.add(key);
    for (const child of manifest[key]?.imports ?? [])
      staticClosure(child, seen);
    return seen;
  };
  assert.ok(manifest[engineKey].isDynamicEntry);
  assert.ok(!staticClosure('components/network-app.tsx').has(engineKey));
  assert.ok(!staticClosure('components/network-app.tsx').has(panelKey));
  const offContext = await browser.newContext({
    storageState: await contexts[2].storageState(),
  });
  const offPage = await offContext.newPage();
  const offRequests = [];
  offPage.on('request', (r) => offRequests.push(r.url()));
  await offPage.route('**/api/workspaces*', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      response,
      json: { ...data, features: { ...data.features, woodland: false } },
    });
  });
  await offPage.goto(base + '/workspace/?coop=' + coop);
  await offPage.getByRole('tab', { name: 'Projects', exact: true }).waitFor();
  assert.equal(
    await offPage
      .getByRole('tab', { name: 'Woodland corridors', exact: true })
      .count(),
    0,
  );
  assert.equal(await offPage.locator('[data-woodland-editor]').count(), 0);
  assert.ok(
    !offRequests.some(
      (url) =>
        url.endsWith(manifest[engineKey].file) ||
        url.endsWith(manifest[panelKey].file),
    ),
  );
  await offContext.close();
  mark(
    'M7/M8 flag-off projection renders no woodland controls and fetches no editor/engine chunks; production manifest confirms lazy engine',
  );
  await open(steward);
  const editor = steward.locator('[data-woodland-editor="layers"]');
  await editor
    .getByLabel('Minimum width source', { exact: true })
    .fill(params.minWidthSource);
  const fixture = fixtureLayers();
  for (const [layer, items] of Object.entries(fixture))
    for (const [i, f] of items.entries()) {
      if (layer === 'crossings') continue;
      const points =
        f.geometry.type === 'Polygon'
          ? f.geometry.coordinates[0].slice(0, -1)
          : f.geometry.coordinates;
      await feature(editor, layer, `${layer} ${i + 1}`, points);
    }
  assert.ok(
    await editor
      .getByRole('button', { name: 'Submit layers for review', exact: true })
      .isEnabled(),
  );
  // Entire crossing path uses focus, keys and Tab, including feature creation and passage selection.
  await editor.getByLabel('Drawing layer', { exact: true }).focus();
  await steward.keyboard.press('c');
  assert.equal(
    await editor.getByLabel('Drawing layer', { exact: true }).inputValue(),
    'crossings',
  );
  await editor
    .getByRole('button', { name: 'New feature', exact: true })
    .focus();
  await steward.keyboard.press('Enter');
  await editor.getByLabel('Feature name', { exact: true }).focus();
  await steward.keyboard.type('Verified crossing');
  await editor.getByLabel('Crossing passage', { exact: true }).focus();
  await steward.keyboard.press('v');
  await coordinate(editor, ...pt(1000, 500), true);
  const dl = steward.waitForEvent('download');
  await editor
    .getByRole('button', { name: 'Download Landscape Package', exact: true })
    .click();
  const pkg = JSON.parse(await readFile(await (await dl).path(), 'utf8'));
  assert.equal(pkg.layers.crossings.length, 1);
  assert.deepEqual(
    pkg.layers.crossings[0].geometry.coordinates,
    pt(1000, 500).map((n) => Number(n.toFixed(7))),
  );
  assert.equal(pkg.layers.crossings[0].properties.passage, 'verified');
  assert.match(pkg.layers.crossings[0].properties.dfm_id, /^[0-9a-f-]{36}$/);
  mark(
    'M2/M3/M9 steward draws typed layers and adds verified crossing entirely by keyboard',
  );
  assert.equal(external.length, 0);
  mark('M6 no third-party requests before explicit basemap opt-in');
  optIn = true;
  await editor
    .getByRole('button', { name: 'Load background map', exact: true })
    .click();
  await editor
    .getByRole('button', { name: 'Fit to features', exact: true })
    .click({ timeout: 30000 });
  await steward.waitForTimeout(2500);
  assert.ok(
    external.some((r) => r.url.includes('openfreemap.org/planet/')),
    'Map must load actual geographic tiles',
  );
  await editor.screenshot({ path: out + '/desktop-layers.png' });
  // Actual click and drag drawing, plus undo, while preserving the acceptance geometry.
  await editor
    .getByLabel('Drawing layer', { exact: true })
    .selectOption('water');
  await editor
    .getByRole('button', { name: 'New feature', exact: true })
    .click();
  const canvas = await editor.locator('.maplibregl-canvas').boundingBox();
  assert.ok(canvas);
  await steward.mouse.click(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
  );
  await editor
    .getByRole('button', { name: 'Select corner 1', exact: true })
    .waitFor();
  const marker = await editor
    .getByRole('button', { name: 'Select corner 1', exact: true })
    .boundingBox();
  await steward.mouse.move(
    marker.x + marker.width / 2,
    marker.y + marker.height / 2,
  );
  await steward.mouse.down();
  await steward.mouse.move(
    marker.x + marker.width / 2 + 15,
    marker.y + marker.height / 2 + 10,
    { steps: 8 },
  );
  await steward.mouse.up();
  await editor.getByRole('button', { name: 'Undo', exact: true }).click();
  await editor.getByRole('button', { name: 'Redo', exact: true }).click();
  assert.ok(
    await editor
      .getByRole('button', { name: 'Submit layers for review', exact: true })
      .isDisabled(),
  );
  await editor
    .getByRole('button', { name: 'Delete feature', exact: true })
    .click();
  mark(
    'M4/M9 map click, draggable vertices, undo/redo, deletion and invalid-save guard',
  );
  await editor
    .getByRole('button', { name: 'Preview corridor check', exact: true })
    .click();
  await editor
    .getByText('Local corridor preview: pass', { exact: true })
    .waitFor();
  await editor
    .getByRole('button', { name: 'Submit layers for review', exact: true })
    .click();
  await steward.getByText(/Layers submitted/).waitFor();
  await open(reviewer);
  await reviewer
    .getByRole('button', { name: 'Approve layers', exact: true })
    .click();
  await reviewer.getByText(/Current reviewed layers:/).waitFor();
  mark('M1 two independent stewards save and review drawn layers');
  await open(member);
  assert.equal(
    await member.locator('[data-woodland-editor="layers"]').count(),
    0,
  );
  const plan = member.locator('[data-woodland-editor="plan"]');
  await plan.waitFor();
  assert.equal(
    await plan
      .getByLabel('Drawing layer', { exact: true })
      .locator('option')
      .count(),
    1,
  );
  await plan
    .getByLabel('Plan name', { exact: true })
    .fill('Winter corridor cut');
  await plan.getByLabel('Period', { exact: true }).fill('Winter 2027');
  await feature(
    plan,
    'treatments',
    'North harvest unit',
    rect(700, 300, 800, 800).coordinates[0].slice(0, -1),
  );
  await plan
    .getByLabel('Treatment intensity', { exact: true })
    .fill('clearcut');
  await plan
    .getByRole('button', { name: 'Preview corridor check', exact: true })
    .click();
  await plan
    .getByText('Local corridor preview: fail', { exact: true })
    .waitFor();
  await plan.getByText(/Responsible units: North harvest unit/).waitFor();
  const checksum = await plan
    .locator('[data-preview-checksum]')
    .getAttribute('data-preview-checksum');
  assert.match(checksum, /^sha256:[0-9a-f]{64}$/);
  await plan
    .getByRole('button', { name: 'Load background map', exact: true })
    .click();
  await plan
    .getByRole('button', { name: 'Fit to features', exact: true })
    .click({ timeout: 30000 });
  await member.waitForTimeout(2500);
  assert.ok(Number(await plan.getByLabel('Private woodland map',{exact:true}).getAttribute('data-loss-feature-count'))>0);
  await plan.screenshot({ path: out + '/desktop-preview.png' });
  mark(
    'M8 failed local preview names responsible unit and maps loss against reviewed parcel/layers',
  );
  // The 51-unit import remains editable but can never be sent.
  const invalid = Array.from({ length: 51 }, () => ({
    type: 'Feature',
    geometry: rect(700, 300, 800, 800),
    properties: { intensity: 'clearcut' },
  }));
  await plan.getByLabel('GeoJSON plan upload', { exact: true }).setInputFiles({
    name: 'over-limit.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(
      JSON.stringify({ type: 'FeatureCollection', features: invalid }),
    ),
  });
  assert.ok(
    await plan
      .getByRole('button', { name: 'Check and submit plan', exact: true })
      .isDisabled(),
  );
  await plan.getByText(/Plan has 51 units; limit is 50/).waitFor();
  await plan.getByRole('button', { name: 'Undo', exact: true }).click();
  await plan
    .getByRole('button', { name: 'Preview corridor check', exact: true })
    .click();
  await plan
    .getByText('Local corridor preview: fail', { exact: true })
    .waitFor();
  mark(
    'M5 over-limit draft is diagnosed and cannot be submitted; undo restores the valid plan',
  );
  await member.setViewportSize({ width: 390, height: 844 });
  await plan.scrollIntoViewIfNeeded();
  assert.ok(
    await member.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await member.screenshot({ path: out + '/mobile-editor.png', fullPage: true });
  mark('M9 390px mobile has no horizontal overflow');
  await plan
    .getByRole('button', { name: 'Check and submit plan', exact: true })
    .click();
  await member
    .getByText(/Winter corridor cut · Winter 2027 · blocked/)
    .waitFor();
  const stored = (await state(member)).state.treatmentPlans.at(-1);
  assert.equal(stored.status, 'blocked');
  assert.equal(stored.check.status, 'fail');
  assert.equal(stored.check.inputChecksum, checksum);
  assert.equal(
    stored.check.lostLinks[0].causes[0],
    stored.treatments[0].properties.dfm_id,
  );
  mark(
    'M1/M8 authoritative server blocks drawn plan with identical preview checksum and cause',
  );
  await member.reload();
  await member
    .getByRole('tab', { name: 'Woodland corridors', exact: true })
    .click();
  assert.equal(
    await member
      .locator('[data-woodland-editor="plan"]')
      .getByLabel('Plan name', { exact: true })
      .inputValue(),
    '',
  );
  assert.ok(
    await member.evaluate(
      () =>
        ![...Object.keys(localStorage), ...Object.keys(sessionStorage)].some(
          (k) => /woodland|draft/i.test(k),
        ),
    ),
  );
  mark('M6 unsaved draft is not persisted across reload');
  assert.ok(
    external.every(
      (r) => r.optIn && new URL(r.url).hostname.endsWith('openfreemap.org'),
    ),
    JSON.stringify(external),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  mark(
    'No browser runtime or console errors; external requests limited to opted-in basemap',
  );
} finally {
  await writeFile(
    out + '/browser-results.json',
    JSON.stringify(
      {
        passed,
        errors,
        consoleErrors,
        externalRequests: external.length,
        fixtureId: coop,
      },
      null,
      2,
    ),
  );
  for (const [i, p] of pages.entries()) {
    await writeFile(
      out + `/last-page-${i}.txt`,
      await p.locator('body').innerText(),
    );
    await p.screenshot({ path: out + `/last-page-${i}.png`, fullPage: true });
  }
  if (created) await command(steward, 'archive', {});
  await browser.close();
}
