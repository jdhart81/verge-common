import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openDatabase, d1Adapter } from '../self-hosted/storage.mjs';
import { createAuth } from '../self-hosted/auth.mjs';
import { initializeErasure } from '../self-hosted/erasure.mjs';
import {
  attachmentExistsGuard,
  cleanupExpiredUploads,
  discardUpload,
  drainUploadDeletions,
  saveUploadMetadata,
  UPLOAD_RETENTION_MS,
} from '../server/evidence-uploads.mjs';

const now = 1_800_000_000_000;
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'verge-uploads-'));
  const db = openDatabase(join(directory, 'uploads.sqlite'));
  createAuth(db);
  initializeErasure(db);
  const userId = randomUUID(),
    otherId = randomUUID(),
    workspaceId = randomUUID();
  for (const id of [userId, otherId])
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(
      id,
      id,
      'Synthetic user',
      'hash',
      'recovery',
      now,
    );
  const state = {
    members: [
      { userId, status: 'active' },
      { userId: otherId, status: 'active' },
    ],
    evidence: [],
  };
  db.prepare('INSERT INTO workspaces VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    workspaceId,
    userId,
    'Synthetic co-op',
    'Region',
    'Test',
    'private',
    JSON.stringify(state),
    0,
    now,
    now,
  );
  const objects = new Set();
  const store = {
    async delete(key) {
      objects.delete(key);
    },
  };
  const adapter = d1Adapter(db);
  const add = async (createdAt = now) => {
    const id = randomUUID(),
      objectKey = `private/${workspaceId}/${id}`;
    const asset = {
      id,
      workspaceId,
      uploaderId: userId,
      objectKey,
      filename: 'sample.txt',
      contentType: 'text/plain',
      sha256: 'hash',
      size: 10,
      createdAt,
    };
    await saveUploadMetadata(adapter, asset);
    objects.add(objectKey);
    return asset;
  };
  const attach = (asset, snapshot = false) => {
    const next = {
      ...state,
      ...(snapshot
        ? { approvedSnapshot: { asset: { id: asset.id } } }
        : { evidence: [{ asset: { id: asset.id } }] }),
    };
    return db
      .prepare(
        `UPDATE workspaces SET state_json = ?, version = version + 1 WHERE id = ? ${attachmentExistsGuard}`,
      )
      .run(JSON.stringify(next), workspaceId, asset.id, asset.id, userId)
      .changes;
  };
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    db,
    adapter,
    userId,
    otherId,
    workspaceId,
    objects,
    store,
    add,
    attach,
  };
}

await test('only the uploader can discard; a repeated discard is safe and frees the file', async (t) => {
  const f = fixture(t),
    a = await f.add();
  await assert.rejects(
    discardUpload(f.adapter, f.store, { assetId: a.id, userId: f.otherId }),
    { status: 404 },
  );
  assert.equal(f.objects.size, 1);
  await discardUpload(f.adapter, f.store, { assetId: a.id, userId: f.userId });
  await discardUpload(f.adapter, f.store, { assetId: a.id, userId: f.userId });
  assert.equal(f.objects.size, 0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM assets').get().n, 0);
});

await test('attachment winning a discard race preserves the file; discard winning prevents stale attachment', async (t) => {
  const f = fixture(t),
    attached = await f.add();
  assert.equal(f.attach(attached), 1);
  await assert.rejects(
    discardUpload(f.adapter, f.store, {
      assetId: attached.id,
      userId: f.userId,
    }),
    { status: 409 },
  );
  assert.equal(f.objects.has(attached.objectKey), true);
  const discarded = await f.add();
  // Simulates an already-read asset response reaching its final CAS after DELETE.
  await discardUpload(f.adapter, f.store, {
    assetId: discarded.id,
    userId: f.userId,
  });
  assert.equal(f.attach(discarded), 0);
  const persisted = JSON.parse(
    f.db.prepare('SELECT state_json FROM workspaces').get().state_json,
  );
  assert.equal(persisted.evidence[0].asset.id, attached.id);
});

await test('expiry removes only old unattached files and retains fresh files and copied snapshots', async (t) => {
  const f = fixture(t),
    old = now - UPLOAD_RETENTION_MS - 1;
  const expired = await f.add(old),
    fresh = await f.add(),
    snapshot = await f.add(old);
  assert.equal(f.attach(snapshot, true), 1);
  const result = await cleanupExpiredUploads(f.adapter, f.store, { now });
  assert.equal(result.expired, 1);
  assert.equal(f.objects.has(expired.objectKey), false);
  assert.equal(f.objects.has(fresh.objectKey), true);
  assert.equal(f.objects.has(snapshot.objectKey), true);
  await assert.rejects(
    discardUpload(f.adapter, f.store, {
      assetId: snapshot.id,
      userId: f.userId,
    }),
    { status: 409 },
  );
});

await test('failed object deletion remains durably queued and succeeds on retry', async (t) => {
  const f = fixture(t),
    a = await f.add();
  await assert.rejects(
    discardUpload(
      f.adapter,
      {
        async delete() {
          throw new Error('Storage unavailable');
        },
      },
      { assetId: a.id, userId: f.userId },
    ),
    /Storage unavailable/,
  );
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM assets').get().n, 0);
  assert.equal(
    f.db.prepare('SELECT object_key FROM evidence_file_deletions').get()
      .object_key,
    a.objectKey,
  );
  assert.equal(f.objects.has(a.objectKey), true);
  assert.equal(await drainUploadDeletions(f.adapter, f.store), 1);
  assert.equal(f.objects.size, 0);
  assert.equal(
    f.db.prepare('SELECT count(*) AS n FROM evidence_file_deletions').get().n,
    0,
  );
});

await test('a rolled-back asset deletion never queues or deletes private bytes', async (t) => {
  const f = fixture(t),
    a = await f.add();
  f.db.exec('BEGIN IMMEDIATE');
  f.db.prepare('DELETE FROM assets WHERE id = ?').run(a.id);
  f.db.exec('ROLLBACK');
  assert.equal(await drainUploadDeletions(f.adapter, f.store), 0);
  assert.equal(f.objects.has(a.objectKey), true);
  assert.equal(f.db.prepare('SELECT id FROM assets').get().id, a.id);
});

await test('atomic quota rejects overflow and expired unsubmitted files release capacity', async (t) => {
  const f = fixture(t);
  for (let n = 0; n < 200; n++) await f.add(now - UPLOAD_RETENTION_MS - 1);
  await assert.rejects(f.add(), { status: 409 });
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM assets').get().n, 200);
  assert.equal(
    (
      await cleanupExpiredUploads(f.adapter, f.store, {
        now,
        workspaceId: f.workspaceId,
      })
    ).expired,
    200,
  );
  await f.add();
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM assets').get().n, 1);
});

await test('revoked membership and erased accounts cannot finish an upload begun earlier', async (t) => {
  const f = fixture(t);
  f.db.prepare("UPDATE workspaces SET visibility = 'archived'").run();
  await assert.rejects(f.add(), { status: 409 });
  f.db.prepare("UPDATE workspaces SET visibility = 'private'").run();
  f.db
    .prepare('INSERT INTO erasure_tombstones VALUES (?,?,?)')
    .run(f.userId, now, now);
  await assert.rejects(f.add(), /Active membership is required/);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM assets').get().n, 0);
});
