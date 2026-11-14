// Woodland drafts and checked plans can be downloaded as a Land Package, the open exchange
// format (https://github.com/viridisconservation/land-package). Invariants:
//  LPX1 the vendored converter is the published file, unchanged;
//  LPX2 conversion is lossless: the Land Package converts back to the identical Landscape Package;
//  LPX3 a package with woodlot parcels declares personal data, and consent is 'covered' only
//       when every parcel is covered, so it is never shareable;
//  LPX4 the conversion runs in the browser and sends nothing anywhere;
//  LPX5 the page says the file is private.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fromLandscapePackage, toLandscapePackage } from '@viridis/dfm-core';
import {
  dumps,
  fromDfm,
  shareable,
  toDfm,
  validate,
} from '../lib/land-package.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const workspacePackage = JSON.parse(
  await read('tests/dfm-workspace-package.json'),
);

await test('LPX1 the vendored converter is the published open-source file', async () => {
  const text = await read('lib/land-package.mjs');
  assert.equal(
    createHash('sha256').update(text).digest('hex'),
    '6ff1d6e30ce7f77270d8be2c81b228f7dfdfb30b0fb3cbae5b61ed653fd62928',
    'lib/land-package.mjs must match js/land_package.mjs in viridisconservation/land-package; change it there',
  );
});

await test('LPX2 a Landscape Package becomes a valid Land Package and converts back unchanged', async () => {
  const exported = toLandscapePackage(fromLandscapePackage(workspacePackage), {
    name: 'Brook woodlot',
    generator: 'VergeCommon',
  });
  for (const pkg of [workspacePackage, exported]) {
    const before = JSON.stringify(pkg);
    const landPackage = await fromDfm(pkg);
    const { errors, warnings } = await validate(landPackage);
    assert.deepEqual(errors, []);
    assert.equal(JSON.stringify(pkg), before, 'the input is not changed');
    assert.equal(JSON.stringify(await toDfm(landPackage)), before);
    assert.equal(landPackage.generator.tool, pkg.generator);
    assert.equal(landPackage.subject.kind, 'landscape');
    assert.deepEqual(landPackage.claims, []);
    // VergeCommon records no data sources, and the file says so rather than inventing one.
    if (Object.keys(pkg.sources ?? {}).length === 0)
      assert.ok(
        warnings.length > 0 &&
          warnings.every((w) => w.includes('not recorded')),
      );
    // The written text reads back as the same valid package.
    const reread = JSON.parse(dumps(landPackage));
    assert.deepEqual((await validate(reread)).errors, []);
    assert.equal(
      reread.integrity.content_sha256,
      landPackage.integrity.content_sha256,
    );
  }
});

await test('LPX3 parcels make the package personal data; consent follows the parcels', async () => {
  const parcel = (id, consent) => ({
    type: 'Feature',
    properties: { dfm_id: id, consent },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-72.5, 44.2],
          [-72.499, 44.2],
          [-72.499, 44.201],
          [-72.5, 44.2],
        ],
      ],
    },
  });
  const base = fromLandscapePackage(workspacePackage);
  const pack = (parcels) =>
    toLandscapePackage(
      { ...base, parcels },
      { name: 'Consent', generator: 'VergeCommon' },
    );
  const covered = await fromDfm(
    pack([parcel('a', 'covered'), parcel('b', 'covered')]),
  );
  const mixed = await fromDfm(
    pack([parcel('a', 'covered'), parcel('b', 'none')]),
  );
  const none = await fromDfm(pack([]));
  assert.deepEqual(covered.privacy, {
    location: 'exact',
    personal_data: true,
    consent: 'covered',
  });
  assert.deepEqual(mixed.privacy, {
    location: 'exact',
    personal_data: true,
    consent: 'none',
  });
  assert.deepEqual(none.privacy, {
    location: 'exact',
    personal_data: false,
    consent: 'not_applicable',
  });
  assert.equal(shareable(covered), false);
  assert.equal(shareable(mixed), false);
  assert.ok(
    !('shareable' in covered.privacy),
    'shareable is never written into the file',
  );
});

await test('LPX4 and LPX5 the downloads convert in the browser and say the file is private', async () => {
  const converter = await read('lib/land-package.mjs');
  assert.ok(
    !/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|import\(/.test(converter),
    'the converter makes no request',
  );
  const panel = await read('components/woodland-panel.tsx');
  const editor = await read('components/woodland-map-editor.tsx');
  for (const [name, source] of [
    ['panel', panel],
    ['editor', editor],
  ]) {
    assert.ok(
      source.includes("await import('@/lib/land-package.mjs')"),
      `${name}: loads the converter on demand`,
    );
    assert.ok(
      source.includes('await fromDfm(') &&
        source.includes('dumps(landPackage)'),
      `${name}: converts and writes`,
    );
    assert.ok(
      source.includes('.land-package.json'),
      `${name}: the file name says what it is`,
    );
  }
  assert.ok(
    panel.includes('Download as Land Package') &&
      editor.includes('Download Land Package'),
  );
  assert.match(
    panel,
    /marked as personal data because it contains\s+woodlot boundaries; keep it within your co-op/,
  );
  const doc = await read('docs/WOODLAND.md');
  assert.ok(
    doc.includes('nothing is sent to a server') &&
      doc.includes('must treat it as not shareable'),
  );
  assert.ok(
    doc.includes('https://github.com/viridisconservation/land-package'),
  );
});
