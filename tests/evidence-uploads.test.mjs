import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import {
  openDatabase,
  d1Adapter,
  objectStore,
} from '../self-hosted/storage.mjs';
import { createAuth } from '../self-hosted/auth.mjs';
import {
  initializeErasure,
  eraseAccountData,
  commitErasureIntent,
  drainErasureFiles,
  replayErasureLedger,
} from '../self-hosted/erasure.mjs';
import { checkBackup } from '../self-hosted/restore-check.mjs';
import { newWorkspace } from '../lib/network.mjs';
import {
  attachmentExistsGuard,
  cleanupExpiredUploads,
  discardUpload,
  drainUploadDeletions,
  saveUploadMetadata,
  persistUpload,
  validateUploadId,
  UPLOAD_RETENTION_MS,
} from '../server/evidence-uploads.mjs';

const now = 1_800_000_000_000;
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'verge-uploads-'));
  const db = openDatabase(join(directory, 'vergecommon.sqlite'));
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
    async put(key) {
      objects.add(key);
    },
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
    path: join(directory, 'vergecommon.sqlite'),
    directory,
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

function upload(f, overrides = {}) {
  return {
    workspaceId: f.workspaceId,
    uploaderId: f.userId,
    filename: 'sample.txt',
    originalFilename: 'sample.txt',
    contentType: 'text/plain',
    sha256: 'a'.repeat(64),
    size: 10,
    createdAt: now,
    ...overrides,
  };
}

await test('idempotent retries reuse a saved asset even when attached and at the file quota', async (t) => {
  const f = fixture(t),
    id = randomUUID(),
    data = upload(f);
  const first = await persistUpload(f.adapter, f.store, data, 'bytes', id);
  assert.equal(first.repeated, false);
  assert.equal(f.attach(first), 1);
  for (let n = 1; n < 200; n++) await f.add();
  const repeat = await persistUpload(f.adapter, f.store, data, 'bytes', id);
  assert.deepEqual(repeat, { ...first, repeated: true });
  assert.equal(f.objects.size, 200);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM assets').get().n, 200);
});

await test('an attempt is bound to exact bytes, MIME, size and original unsanitized filename', async (t) => {
  const f = fixture(t),
    id = randomUUID(),
    data = upload(f, { originalFilename: 'sample?.txt' });
  await persistUpload(f.adapter, f.store, data, 'bytes', id);
  for (const changed of [
    { sha256: 'b'.repeat(64) },
    { contentType: 'application/pdf' },
    { size: 11 },
    { originalFilename: 'sample*.txt' },
  ]) {
    await assert.rejects(
      persistUpload(f.adapter, f.store, { ...data, ...changed }, 'bytes', id),
      { status: 409 },
    );
  }
  assert.equal(f.objects.size, 1);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM assets').get().n, 1);
});

await test('concurrent duplicate uploads return one asset and delete only the losing attempt object', async (t) => {
  const f = fixture(t),
    id = randomUUID(),
    data = upload(f);
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  let puts = 0;
  const store = {
    ...f.store,
    async put(key, bytes) {
      await f.store.put(key, bytes);
      if (++puts === 2) release();
      await barrier;
    },
  };
  const results = await Promise.all([
    persistUpload(f.adapter, store, data, 'bytes', id),
    persistUpload(f.adapter, store, data, 'bytes', id),
  ]);
  assert.equal(results[0].id, results[1].id);
  assert.deepEqual(
    results.map((r) => r.repeated).sort((a, b) => Number(a) - Number(b)),
    [false, true],
  );
  const asset = f.db.prepare('SELECT * FROM assets').get();
  assert.equal(f.objects.size, 1);
  assert.equal(f.objects.has(asset.object_key), true);
});

await test('discard and expiry leave irreversible hash-only request tombstones', async (t) => {
  const f = fixture(t),
    discardedId = randomUUID(),
    expiredId = randomUUID();
  const discarded = await persistUpload(
    f.adapter,
    f.store,
    upload(f),
    'bytes',
    discardedId,
  );
  await discardUpload(f.adapter, f.store, {
    assetId: discarded.id,
    userId: f.userId,
  });
  await persistUpload(
    f.adapter,
    f.store,
    upload(f, { createdAt: now - UPLOAD_RETENTION_MS - 1 }),
    'bytes',
    expiredId,
  );
  await cleanupExpiredUploads(f.adapter, f.store, { now });
  for (const id of [discardedId, expiredId]) {
    await assert.rejects(
      persistUpload(f.adapter, f.store, upload(f), 'bytes', id),
      { status: 409 },
    );
    await assert.rejects(
      persistUpload(
        f.adapter,
        f.store,
        upload(f, { sha256: 'b'.repeat(64) }),
        'different',
        id,
      ),
      { status: 409 },
    );
  }
  const receipts = f.db.prepare('SELECT * FROM evidence_upload_receipts').all();
  assert.equal(receipts.length, 2);
  for (const receipt of receipts) {
    assert.equal(receipt.status, 'deleted');
    assert.equal(receipt.asset_id, null);
    assert.equal(receipt.fingerprint, null);
    assert.match(receipt.request_key, /^[0-9a-f]{64}$/);
  }
  assert.equal(f.objects.size, 0);
});

await test('failed storage retains an exact retry reservation which eventually expires', async (t) => {
  const f = fixture(t),
    id = randomUUID(),
    data = upload(f);
  const failing = {
    ...f.store,
    async put(key) {
      await f.store.put(key);
      throw new Error('Unknown storage outcome');
    },
  };
  await assert.rejects(
    persistUpload(f.adapter, failing, data, 'bytes', id),
    /Unknown storage outcome/,
  );
  assert.equal(f.objects.size, 0);
  await assert.rejects(
    persistUpload(
      f.adapter,
      f.store,
      { ...data, filename: 'changed.txt', originalFilename: 'changed.txt' },
      'bytes',
      id,
    ),
    { status: 409 },
  );
  const completed = await persistUpload(f.adapter, f.store, data, 'bytes', id);
  assert.equal(completed.repeated, false);
  const expiredId = randomUUID();
  await assert.rejects(
    persistUpload(f.adapter, failing, data, 'bytes', expiredId),
  );
  await cleanupExpiredUploads(f.adapter, f.store, {
    now: now + UPLOAD_RETENTION_MS + 1,
  });
  await assert.rejects(
    persistUpload(f.adapter, f.store, data, 'bytes', expiredId),
    { status: 409 },
  );
});

await test('scoped attempt IDs do not reveal another account asset and revoked members cannot replay', async (t) => {
  const f = fixture(t),
    id = randomUUID();
  const own = await persistUpload(f.adapter, f.store, upload(f), 'bytes', id);
  const other = await persistUpload(
    f.adapter,
    f.store,
    upload(f, { uploaderId: f.otherId }),
    'bytes',
    id,
  );
  assert.notEqual(own.id, other.id);
  const state = JSON.parse(
    f.db.prepare('SELECT state_json FROM workspaces').get().state_json,
  );
  state.members.find((m) => m.userId === f.userId).status = 'removed';
  f.db
    .prepare('UPDATE workspaces SET state_json = ?')
    .run(JSON.stringify(state));
  await assert.rejects(
    persistUpload(f.adapter, f.store, upload(f), 'bytes', id),
    { status: 403 },
  );
  await assert.rejects(
    persistUpload(f.adapter, f.store, upload(f), 'bytes', randomUUID()),
    { status: 403 },
  );
  assert.equal(f.objects.size, 2);
});

await test('membership removal during storage prevents completion and deletes transient private bytes', async (t) => {
  const f = fixture(t),
    id = randomUUID();
  const store = {
    ...f.store,
    async put(key) {
      await f.store.put(key);
      f.db
        .prepare('UPDATE workspaces SET state_json = \'{"members":[]}\'')
        .run();
    },
  };
  await assert.rejects(
    persistUpload(f.adapter, store, upload(f), 'bytes', id),
    { status: 403 },
  );
  assert.equal(f.objects.size, 0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM assets').get().n, 0);
});

await test('quota rejection reserves the same immutable attempt for a safe later retry', async (t) => {
  const f = fixture(t),
    id = randomUUID();
  const files = [];
  for (let n = 0; n < 200; n++) files.push(await f.add());
  await assert.rejects(
    persistUpload(f.adapter, f.store, upload(f), 'bytes', id),
    { status: 429 },
  );
  assert.equal(f.objects.size, 200);
  await discardUpload(f.adapter, f.store, {
    assetId: files[0].id,
    userId: f.userId,
  });
  const completed = await persistUpload(
    f.adapter,
    f.store,
    upload(f),
    'bytes',
    id,
  );
  assert.equal(completed.repeated, false);
  assert.equal(f.objects.size, 200);
});

await test('upload IDs accept only canonical lowercase UUIDs', () => {
  validateUploadId(null);
  validateUploadId(randomUUID());
  for (const value of [
    '',
    'a'.repeat(36),
    randomUUID().toUpperCase(),
    '../private',
  ])
    assert.throws(() => validateUploadId(value), { status: 400 });
});

await test('a lost successful response is recovered from durable receipt on a new database connection', async (t) => {
  const f = fixture(t),
    id = randomUUID();
  const first = await persistUpload(f.adapter, f.store, upload(f), 'bytes', id);
  const reopened = openDatabase(f.path);
  try {
    const repeated = await persistUpload(
      d1Adapter(reopened),
      f.store,
      upload(f),
      'bytes',
      id,
    );
    assert.deepEqual(repeated, { ...first, repeated: true });
    assert.equal(f.objects.size, 1);
  } finally {
    reopened.close();
  }
});

await test('account erasure retires committed attempts and an in-flight retry cannot resurrect bytes', async (t) => {
  const f = fixture(t),
    completedId = randomUUID(),
    pendingId = randomUUID();
  await persistUpload(f.adapter, f.store, upload(f), 'bytes', completedId);
  const store = {
    ...f.store,
    async put(key) {
      await f.store.put(key);
      f.db.exec('BEGIN IMMEDIATE');
      f.db.prepare('DELETE FROM assets WHERE uploader_id = ?').run(f.userId);
      f.db
        .prepare('UPDATE workspaces SET state_json = \'{"members":[]}\'')
        .run();
      f.db
        .prepare('INSERT INTO erasure_tombstones VALUES (?,?,?)')
        .run(f.userId, now, now);
      f.db.prepare('DELETE FROM users WHERE id = ?').run(f.userId);
      f.db.exec('COMMIT');
    },
  };
  await assert.rejects(
    persistUpload(f.adapter, store, upload(f), 'bytes', pendingId),
    { status: 403 },
  );
  await assert.rejects(
    persistUpload(f.adapter, f.store, upload(f), 'bytes', completedId),
    { status: 403 },
  );
  await assert.rejects(
    persistUpload(f.adapter, f.store, upload(f), 'bytes', pendingId),
    { status: 403 },
  );
  assert.equal(f.objects.size, 0);
  const retired = f.db
    .prepare("SELECT * FROM evidence_upload_receipts WHERE status = 'deleted'")
    .get();
  assert.equal(retired.fingerprint, null);
  assert.equal(retired.asset_id, null);
});

await test('a pending reservation expiring during storage prevents late completion', async (t) => {
  const f = fixture(t),
    id = randomUUID();
  const store = {
    ...f.store,
    async put(key) {
      await f.store.put(key);
      await cleanupExpiredUploads(f.adapter, f.store, {
        now: now + UPLOAD_RETENTION_MS + 1,
      });
    },
  };
  await assert.rejects(
    persistUpload(f.adapter, store, upload(f), 'bytes', id),
    { status: 409 },
  );
  assert.equal(f.objects.size, 0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM assets').get().n, 0);
  await assert.rejects(
    persistUpload(f.adapter, f.store, upload(f), 'bytes', id),
    { status: 409 },
  );
});

await test('concurrent idempotent uploads retain canonical keys through backup, restore and real account erasure', async (t) => {
  const f = fixture(t);
  const state = newWorkspace(
    {
      name: 'Synthetic backup co-op',
      region: 'Test',
      summary: 'Synthetic retry fixture',
      displayName: 'Synthetic user',
    },
    { id: f.userId },
    now,
    f.workspaceId,
  );
  f.db
    .prepare('UPDATE workspaces SET state_json = ? WHERE id = ?')
    .run(JSON.stringify(state), f.workspaceId);
  const ledgerDirectory = join(f.directory, 'deletion-ledger');
  mkdirSync(ledgerDirectory);
  const realStore = objectStore(join(f.directory, 'evidence'), {
    database: () => f.db,
  });
  const keys = [];
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const store = {
    ...realStore,
    async put(key, bytes) {
      await realStore.put(key, bytes);
      keys.push(key);
      if (keys.length === 2) release();
      await barrier;
    },
  };
  const bytes = Buffer.from(
    'Synthetic canonical evidence for retry, restore and erasure.',
  );
  const data = upload(f, {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
  });
  const uploadId = randomUUID();
  const [first, duplicate] = await Promise.all([
    persistUpload(f.adapter, store, data, bytes, uploadId),
    persistUpload(f.adapter, store, data, bytes, uploadId),
  ]);
  assert.equal(first.id, duplicate.id);
  const asset = f.db.prepare('SELECT * FROM assets').get();
  assert.equal(asset.object_key, `private/${f.workspaceId}/${String(asset.id)}`);
  assert.equal(
    f.db.prepare('SELECT count(*) AS n FROM evidence_upload_attempts').get().n,
    0,
  );
  assert.deepEqual(
    Buffer.from((await realStore.get(asset.object_key)).body),
    bytes,
  );
  assert.equal(
    await realStore.get(keys.find((key) => key !== asset.object_key)),
    null,
  );
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['self-hosted/backup.mjs'],
    {
      cwd: resolve(import.meta.dirname, '..'),
      env: {
        ...process.env,
        VERGE_DATA_DIR: f.directory,
        VERGE_BACKUP_DIR: join(f.directory, 'backups'),
      },
    },
  );
  const backup = JSON.parse(stdout.trim());
  assert.equal((await checkBackup(backup.directory)).verifiedEvidenceFiles, 1);
  f.db.exec('BEGIN IMMEDIATE');
  const erased = eraseAccountData(f.db, f.userId, now + 1, { ledgerDirectory });
  f.db.prepare('DELETE FROM users WHERE id = ?').run(f.userId);
  f.db.exec('COMMIT');
  commitErasureIntent(ledgerDirectory, f.userId);
  assert.equal(erased.removedAssets, 1);
  await drainErasureFiles(f.db, realStore);
  await drainUploadDeletions(f.adapter, realStore);
  assert.equal(await realStore.get(asset.object_key), null);
  assert.equal(
    f.db.prepare('SELECT status FROM evidence_upload_receipts').get().status,
    'deleted',
  );
  const restoredPath = join(f.directory, 'restored.sqlite');
  copyFileSync(join(backup.directory, 'vergecommon.sqlite'), restoredPath);
  const restoredEvidence = join(f.directory, 'restored-evidence');
  cpSync(join(backup.directory, 'evidence'), restoredEvidence, {
    recursive: true,
  });
  const restored = openDatabase(restoredPath);
  try {
    replayErasureLedger(restored, { ledgerDirectory, now: now + 2 });
    const restoredStore = objectStore(restoredEvidence, {
      database: () => restored,
    });
    await drainErasureFiles(restored, restoredStore);
    await drainUploadDeletions(d1Adapter(restored), restoredStore);
    assert.equal(
      restored.prepare('SELECT count(*) AS n FROM assets').get().n,
      0,
    );
    assert.equal(
      restored.prepare('SELECT status FROM evidence_upload_receipts').get()
        .status,
      'deleted',
    );
    assert.equal(await restoredStore.get(asset.object_key), null);
    await assert.rejects(
      persistUpload(d1Adapter(restored), restoredStore, data, bytes, uploadId),
      { status: 403 },
    );
  } finally {
    restored.close();
  }
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
