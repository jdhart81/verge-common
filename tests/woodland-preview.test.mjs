import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConnectivitySync } from '@viridis/dfm-core';
import { DomainError } from '../lib/domain-error.mjs';
import { memberView } from '../lib/network.mjs';
import { woodlandCheckInput, consentParcels } from '../lib/woodland.mjs';
import { woodlandServerPreview } from '../server/woodland-preview.mjs';
import {
  setup,
  reviewedLayers,
  cut,
  away,
  plan,
  byId,
  rect,
  params,
  reviewer,
} from './woodland-editor-fixture.mjs';

function fixture(width) {
  const f = setup();
  reviewedLayers(f, width);
  const id = f.run('record_parcel', {
    projectId: f.project,
    name: 'Private owner land',
    landReference: 'Private deed',
    areaSquareMetres: 1e6,
    consentReference: 'Private consent',
  });
  f.run('review_parcel', { id, decision: 'approve' }, reviewer);
  const boundary = f.run('save_boundary', {
    parcelId: id,
    geometry: rect(0, 0, 1000, 1000),
    consentReference: 'Private boundary',
  });
  f.run(
    'review_boundary',
    { parcelId: id, id: boundary, decision: 'approve' },
    reviewer,
  );
  const consent = f.run('record_parcel_consent', {
    parcelId: id,
    holder: 'Private holder',
    authority: 'Private authority',
    reference: 'Private reference',
    scope: 'Private scope',
    attested: true,
  });
  f.run(
    'review_parcel_consent',
    { parcelId: id, id: consent, decision: 'approve', note: 'Private review' },
    reviewer,
  );
  return f;
}
// Tests run the engine inline (no registered runner outside production).
const preview = (f, units, user = 'member', enabled = true) =>
  woodlandServerPreview(f.s, user, f.project, units, enabled);

await test('Server preview requires active membership and the woodland flag', async () => {
  const f = fixture();
  for (const [user, enabled, status] of [
    ['outsider', true, 403],
    ['member', false, 404],
  ])
    await assert.rejects(
      preview(f, [cut], user, enabled),
      (e) => e instanceof DomainError && e.status === status,
    );
  const member = f.s.members.find((m) => m.userId === 'member');
  member.status = 'suspended';
  await assert.rejects(
    preview(f, [cut]),
    (e) => e instanceof DomainError && e.status === 403,
  );
});
await test('Server preview enforces the same unit count and cleaned payload size limits as submission', async () => {
  const f = fixture();
  await assert.rejects(
    preview(
      f,
      Array.from({ length: 51 }, () => cut),
    ),
    (e) => e instanceof DomainError && e.status === 400,
  );
  await assert.rejects(
    preview(f, null),
    (e) => e instanceof DomainError && e.status === 400,
  );
  const huge = structuredClone(cut);
  huge.geometry.coordinates[0] = Array.from({ length: 3000 }, () => [
    0.00123456789012345, 0.00987654321098765,
  ]);
  await assert.rejects(
    preview(f, [huge]),
    (e) => e instanceof DomainError && e.status === 413,
  );
  await assert.rejects(
    woodlandServerPreview(f.s, 'member', 'missing', [cut], true),
    (e) => e instanceof DomainError && e.status === 404,
  );
});
await test('Server preview without units checks the current state, as agents use it', async () => {
  const f = fixture();
  const check = await preview(f, []);
  assert.equal(check.status, 'pass');
  assert.deepEqual(check.lostLinks, []);
  assert.equal(check.layersVersionId, f.s.woodlandLayers.at(-1).id);
  assert.equal(check.geometry, undefined);
});
await test('Server preview runs the check in the registered runner, keyed by account (WS7)', async () => {
  const f = fixture();
  const calls = [];
  const runner = {
    run: async (kind, input, options) => {
      calls.push({ kind, options, consent: input.parcels.length });
      return checkConnectivitySync(input);
    },
  };
  const check = await woodlandServerPreview(
    f.s,
    'member',
    f.project,
    [cut],
    true,
    { runner, production: true },
  );
  assert.deepEqual(calls, [
    { kind: 'check', options: { key: 'member' }, consent: 1 },
  ]);
  assert.equal(check.status, 'fail');
  await assert.rejects(
    woodlandServerPreview(f.s, 'member', f.project, [cut], true, {
      runner: null,
      production: true,
    }),
    (e) => e instanceof DomainError && e.status === 503,
    'production never runs the engine on the request thread',
  );
  const busy = {
    run: async () => {
      throw Object.assign(new Error('Your previous landscape analysis is still running.'), {
        status: 429,
      });
    },
  };
  await assert.rejects(
    woodlandServerPreview(f.s, 'member', f.project, [cut], true, {
      runner: busy,
    }),
    (e) => e instanceof DomainError && e.status === 429,
  );
});
await test('Server preview is non-mutating and returns no geometry or private parcel details', async () => {
  const f = fixture();
  const before = JSON.stringify(f.s);
  const check = await preview(f, [cut]);
  assert.equal(JSON.stringify(f.s), before, 'including audit and plan records');
  assert.equal(check.geometry, undefined);
  assert.doesNotMatch(
    JSON.stringify(check),
    /coordinates|Private|parcels|landSnapshot/,
  );
  assert.deepEqual(memberView(f.s, 'member').state.parcels, []);
  assert.ok(
    check.consent.committedM2 > 0,
    'full private consent state participates',
  );
});
await test('Local parcel-free preview and full-state server preview agree on structural results', async () => {
  for (const width of [120, 80]) {
    const f = fixture(width);
    for (const units of [[cut], [away], [cut, away]]) {
      const local = checkConnectivitySync(
        woodlandCheckInput(f.s.woodlandLayers.at(-1).layers, units, [], params),
      );
      const server = await preview(f, units);
      for (const key of ['status', 'lostLinks', 'pinchedLinks', 'reasons'])
        assert.deepEqual(local[key], server[key], key);
      assert.notEqual(
        local.inputChecksum,
        server.inputChecksum,
        'private consent inputs change checksum, not structural results',
      );
    }
  }
  const f = fixture();
  // Both engine paths report incomplete input for a missing width source.
  f.s.woodlandLayers.at(-1).params.minWidthSource = '';
  const version = f.s.woodlandLayers.at(-1);
  const local = checkConnectivitySync(
    woodlandCheckInput(version.layers, [cut], [], version.params),
  );
  const server = await preview(f, [cut]);
  assert.equal(local.status, 'incomplete');
  for (const key of ['status', 'lostLinks', 'pinchedLinks', 'reasons'])
    assert.deepEqual(local[key], server[key]);
});
await test('Full-state server preview checksum equals the stored plan checksum including private consents', async () => {
  const f = fixture();
  assert.equal(consentParcels(f.s, f.project).length, 1);
  for (const units of [[cut], [away], [cut, away]]) {
    const check = await preview(f, units);
    const stored = byId(f, plan(f, units));
    assert.equal(check.inputChecksum, stored.check.inputChecksum);
    for (const key of ['status', 'lostLinks', 'pinchedLinks', 'reasons'])
      assert.deepEqual(check[key], stored.check[key]);
    assert.deepEqual(memberView(f.s, 'member').state.parcels, []);
  }
});
