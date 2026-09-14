const { chromium } = await import(
  process.env.VERGE_PLAYWRIGHT_MODULE || 'playwright'
);
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const base = process.env.VERGE_TEST_ORIGIN || 'http://localhost:3000';
assert.ok(
  ['http://localhost:3000', 'http://localhost:3001'].includes(base),
  'Browser fixtures are restricted to local development.',
);
const out = resolve('outputs/map-editor-review');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [],
  mapRequests = [],
  passed = [];
const tileResponses = [];
page.on('response', (r) => {
  if (r.url().includes('openfreemap.org/planet/') && r.ok())
    tileResponses.push(r.url());
});

page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (req) => {
  if (req.url().includes('openfreemap.org')) mapRequests.push(req.url());
});
const mark = (name) => {
  passed.push(name);
  console.log('PASS', name);
};
const id = crypto.randomUUID();
let created = false;
async function call(data) {
  const response = await page.request.post(base + '/api/workspaces', {
    headers: { Origin: base },
    data,
  });
  const result = await response.json();
  assert.ok(response.ok(), JSON.stringify(result));
  return result;
}
async function state() {
  const r = await page.request.get(base + '/api/workspaces?id=' + id);
  assert.ok(r.ok());
  return r.json();
}
async function command(op, payload) {
  const current = await state();
  return call({
    id,
    version: current.version,
    op,
    requestId: crypto.randomUUID(),
    payload,
  });
}
const geo = page.getByLabel('GeoJSON Polygon or Feature', { exact: true });
async function corner(lng, lat) {
  await page.getByLabel('Longitude', { exact: true }).fill(String(lng));
  await page.getByLabel('Latitude', { exact: true }).fill(String(lat));
  await page.getByRole('button', { name: 'Add corner', exact: true }).click();
}
try {
  await page.goto(base + '/signin-with-chatgpt?return_to=/workspace/');
  await page
    .getByRole('heading', { name: 'Your co-ops', exact: true })
    .waitFor();
  await call({
    op: 'create',
    requestId: id,
    payload: {
      name: 'Map editor browser fixture',
      region: 'Synthetic test region',
      summary: 'Local editor acceptance fixture',
      displayName: 'Map test steward',
    },
  });
  created = true;
  let result = await command('create_project', {
    name: 'Synthetic map project',
    region: 'Synthetic',
    summary: 'Local test',
    kind: 'ecohedge',
  });
  const projectId = result.state.projects[0].id;
  await command('record_parcel', {
    projectId,
    name: 'Map fixture A',
    landReference: 'Synthetic boundary only',
    areaSquareMetres: 1000,
    consentReference: 'Synthetic consent',
  });
  result = await command('record_parcel', {
    projectId,
    name: 'Map fixture B',
    landReference: 'Synthetic boundary only',
    areaSquareMetres: 1000,
    consentReference: 'Synthetic consent',
  });
  const [a, b] = result.state.parcels;
  await page.goto(base + '/workspace/?coop=' + id);
  await page.getByRole('tab', { name: 'monitoring', exact: true }).click();
  await page.getByLabel('Private parcel').selectOption(a.id);
  const save = page.getByRole('button', {
    name: 'Save boundary for review',
    exact: true,
  });
  assert.ok(await save.isDisabled());
  await corner(-73.2, 44.4);
  await corner(-73.19, 44.4);
  assert.ok(await save.isDisabled());
  await corner(-73.19, 44.41);
  await corner(-73.2, 44.41);
  assert.ok(await save.isEnabled());
  await page.getByText('Edit GeoJSON directly', { exact: true }).click();
  const original = await geo.inputValue();
  assert.equal(JSON.parse(original).coordinates[0].length, 5);
  assert.equal(mapRequests.length, 0);
  mark(
    'coordinate drawing validates saves and makes no map requests before opt-in',
  );
  await page
    .getByRole('button', { name: 'Remove corner', exact: true })
    .click();
  assert.equal(JSON.parse(await geo.inputValue()).coordinates[0].length, 4);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await geo.inputValue(), original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  assert.equal(JSON.parse(await geo.inputValue()).coordinates[0].length, 4);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  mark('corner removal, undo and redo');
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download GeoJSON', exact: true })
    .click();
  const download = await downloadPromise;
  assert.deepEqual(
    JSON.parse(await readFile(await download.path(), 'utf8')),
    JSON.parse(original),
  );
  mark('download preserves the valid geometry');
  await page.getByLabel('Import GeoJSON', { exact: true }).setInputFiles({
    name: 'broken.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from('{broken'),
  });
  await page.getByRole('alert').waitFor();
  assert.equal(await geo.inputValue(), original);
  mark('invalid import preserves the existing draft');
  await page.getByRole('button', { name: 'Clear draft', exact: true }).click();
  assert.ok(await save.isDisabled());
  await page.getByLabel('Import GeoJSON', { exact: true }).setInputFiles({
    name: 'valid.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(original),
  });
  await page
    .getByText('Boundary imported. Check its shape before saving for review.', {
      exact: true,
    })
    .waitFor();
  assert.equal(await geo.inputValue(), original);
  mark('valid import restores an editable boundary');
  await page
    .getByRole('button', { name: 'Load background map', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Fit boundary', exact: true })
    .waitFor();
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('button')).some(
        (b) => b.textContent === 'Fit boundary' && !b.disabled,
      ),
    {},
    { timeout: 30000 },
  );
  assert.ok(mapRequests.length > 0);
  await page.getByRole('button', { name: 'Fit boundary', exact: true }).click();
  await page.waitForTimeout(7000);
  assert.ok(
    tileResponses.length > 0,
    'Map must successfully fetch geographic tiles, not only its style',
  );
  await page
    .getByRole('button', { name: 'Select corner 1', exact: true })
    .waitFor();
  await page
    .getByRole('button', { name: 'Load background map', exact: true })
    .count()
    .then((n) => assert.equal(n, 0));
  await page
    .locator('aside.panel')
    .filter({
      has: page.getByRole('heading', {
        name: 'Add a boundary version',
        exact: true,
      }),
    })
    .screenshot({ path: out + '/desktop-editor.png' });
  await page
    .getByLabel('Private parcel boundary map', { exact: true })
    .screenshot({ path: out + '/parcel-map.png' });
  mark('live OpenFreeMap tiles load with visible editable corners');
  const marker = page.getByRole('button', {
    name: 'Select corner 1',
    exact: true,
  });
  const box = await marker.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 10,
    box.y + box.height / 2 - 10,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForTimeout(200);
  assert.notEqual(await geo.inputValue(), original);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await geo.inputValue(), original);
  mark('dragging corners updates draft and supports undo');
  await page
    .getByRole('button', { name: 'Draw boundary corners', exact: true })
    .click();
  const canvas = await page.locator('.maplibregl-canvas').boundingBox();
  await page.mouse.click(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
  );
  await page.waitForTimeout(150);
  assert.equal(JSON.parse(await geo.inputValue()).coordinates[0].length, 6);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await geo.inputValue(), original);
  await page
    .getByRole('button', { name: 'Finish adding corners', exact: true })
    .click();
  mark('map clicks add corners only in drawing mode');
  await page
    .getByRole('button', { name: 'Turn off background map', exact: true })
    .click();
  assert.equal(await page.locator('.maplibregl-canvas').count(), 0);
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.abort(),
  );
  await page
    .getByRole('button', { name: 'Load background map', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Retry map', exact: true })
    .waitFor({ timeout: 20000 });
  assert.equal(await geo.inputValue(), original);
  await page
    .getByRole('button', { name: 'Turn off background map', exact: true })
    .click();
  mark('map failure retains draft and coordinate controls');
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('heading', { name: 'Add a boundary version', exact: true })
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: out + '/mobile-editor.png' });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  mark('mobile layout has no horizontal overflow');
  await page
    .getByLabel('Landholder’s boundary and monitoring consent reference', {
      exact: true,
    })
    .fill('Synthetic browser boundary consent');
  await save.click();
  await page
    .getByText('Consent reference: Synthetic browser boundary consent', {
      exact: true,
    })
    .waitFor();
  const saved = await state();
  assert.equal(saved.state.parcels[0].boundaries.length, 1);
  assert.equal(saved.state.parcels[0].boundaries[0].status, 'submitted');
  assert.equal(
    saved.state.parcels[0].boundaries[0].externalSearchAllowed,
    false,
  );
  assert.ok(await save.isDisabled());
  mark('saving creates a private submitted version and clears draft');
  await page
    .getByRole('button', { name: 'Use as new draft', exact: true })
    .click();
  await page.getByText('Edit GeoJSON directly', { exact: true }).click();
  assert.equal(await geo.inputValue(), original);
  assert.equal(
    await page
      .getByLabel('Landholder’s boundary and monitoring consent reference', {
        exact: true,
      })
      .inputValue(),
    '',
  );
  await page.getByLabel('Private parcel').selectOption(b.id);
  assert.ok(await save.isDisabled());
  await page.getByLabel('Private parcel').selectOption(a.id);
  assert.ok(await save.isDisabled());
  mark(
    'historical reuse requires new consent and switching parcels clears editor state',
  );
  await page.reload();
  await page.getByRole('tab', { name: 'monitoring', exact: true }).click();
  await page.getByLabel('Private parcel').selectOption(a.id);
  await page
    .getByText('Consent reference: Synthetic browser boundary consent', {
      exact: true,
    })
    .waitFor();
  mark('saved boundary survives reload');
  await command('archive', {});
  created = false;
  await page.reload();
  await page.getByRole('tab', { name: 'monitoring', exact: true }).click();
  await page.getByLabel('Private parcel').selectOption(a.id);
  assert.ok(
    await page
      .getByRole('button', { name: 'Use as new draft', exact: true })
      .isDisabled(),
  );
  assert.ok(
    await page
      .getByRole('button', { name: 'Add corner', exact: true })
      .isDisabled(),
  );
  assert.ok(
    await page
      .getByRole('button', { name: 'Download boundary', exact: true })
      .isEnabled(),
  );
  mark('archived parcels keep downloads but disable editing');
  assert.deepEqual(errors, []);
  mark('no browser runtime errors');
} finally {
  await writeFile(
    out + '/last-page.txt',
    await page.locator('body').innerText(),
  );
  await page.screenshot({ path: out + '/last-page.png', fullPage: true });
  if (created) await command('archive', {});
  await writeFile(
    out + '/browser-results.json',
    JSON.stringify(
      {
        passed,
        errors,
        mapRequestCount: mapRequests.length,
        successfulTileResponses: tileResponses.length,
        fixtureId: id,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
