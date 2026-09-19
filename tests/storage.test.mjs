import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  readdir,
  stat,
  symlink,
  copyFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import {
  openDatabase,
  d1Adapter,
  objectStore,
  backupDatabase,
} from '../self-hosted/storage.mjs';
import { checkBackup } from '../self-hosted/restore-check.mjs';
import { newWorkspace } from '../lib/network.mjs';
import { createAuth } from '../self-hosted/auth.mjs';

const execute = promisify(execFile);
const repository = resolve(import.meta.dirname, '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), 'vergecommon-storage-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
function insertWorkspace(db, id = 'coop', name = 'Synthetic co-op') {
  const state = newWorkspace(
    {
      name,
      region: 'Test',
      summary: 'Synthetic storage fixture',
      displayName: 'Fixture',
    },
    { id: 'user' },
    1,
    id,
  );
  db.prepare(
    'INSERT INTO workspaces (id,owner_id,name,region,summary,visibility,state_json,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(
    id,
    'user',
    name,
    'Test',
    state.summary,
    'private',
    JSON.stringify(state),
    0,
    1,
    1,
  );
  return state;
}
async function fixtureBackup(t) {
  const dir = await temporary(t),
    data = join(dir, 'data'),
    destination = join(dir, 'backups');
  const db = openDatabase(join(data, 'vergecommon.sqlite'));
  t.after(() => db.close());
  insertWorkspace(db);
  createAuth(db);
  const bytes = Buffer.from('Synthetic conservation evidence\n');
  await objectStore(join(data, 'evidence')).put('private/coop/asset', bytes);
  db.prepare('INSERT INTO assets VALUES (?,?,?,?,?,?,?,?,?)').run(
    'asset',
    'coop',
    'user',
    'private/coop/asset',
    'fixture.txt',
    'text/plain',
    hash(bytes),
    bytes.length,
    1,
  );
  const { stdout } = await execute(
    process.execPath,
    ['self-hosted/backup.mjs'],
    {
      cwd: repository,
      env: {
        ...process.env,
        VERGE_DATA_DIR: data,
        VERGE_BACKUP_DIR: destination,
      },
    },
  );
  const receipt = JSON.parse(stdout.trim());
  return {
    dir,
    data,
    destination,
    db,
    bytes,
    receipt,
    backup: receipt.directory,
  };
}

await test('SQLite migration runs once, enables safety settings, and survives close and reopen', async (t) => {
  const dir = await temporary(t),
    path = join(dir, 'private', 'vergecommon.sqlite');
  let db = openDatabase(path);
  insertWorkspace(db);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(db.prepare('PRAGMA synchronous').get().synchronous, 2);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  db.close();
  db = openDatabase(path);
  try {
    assert.equal(
      db.prepare('SELECT count(*) AS n FROM schema_migrations').get().n,
      1,
    );
    assert.equal(
      db.prepare('SELECT name FROM workspaces').get().name,
      'Synthetic co-op',
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM sqlite_schema WHERE type='index' AND name='assets_workspace'",
        )
        .get().n,
      1,
    );
  } finally {
    db.close();
  }
});

await test('D1 adapter preserves bind isolation, JSON membership and compare-and-swap across connections', async (t) => {
  const dir = await temporary(t),
    path = join(dir, 'vergecommon.sqlite');
  const first = openDatabase(path),
    second = openDatabase(path);
  t.after(() => {
    first.close();
    second.close();
  });
  insertWorkspace(first);
  const one = d1Adapter(first),
    two = d1Adapter(second);
  const query = one.prepare('SELECT id FROM workspaces WHERE id=?');
  assert.equal(await query.bind('coop').first('id'), 'coop');
  assert.equal(await query.bind('missing').first(), null);
  const members = await one
    .prepare(
      "SELECT id FROM workspaces WHERE EXISTS (SELECT 1 FROM json_each(state_json,'$.members') m WHERE json_extract(m.value,'$.userId')=?)",
    )
    .bind('user')
    .all();
  assert.equal(members.results.length, 1);
  const sql =
    'UPDATE workspaces SET name=?, version=version+1 WHERE id=? AND version=? RETURNING version';
  const results = await Promise.all([
    one.prepare(sql).bind('First writer', 'coop', 0).first(),
    two.prepare(sql).bind('Stale writer', 'coop', 0).first(),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await query.bind('coop').first('id'), 'coop');
  assert.equal(
    first.prepare('SELECT name,version FROM workspaces').get().name,
    'First writer',
  );
  assert.equal(
    first.prepare('SELECT version FROM workspaces').get().version,
    1,
  );
  const changes = await two
    .prepare('UPDATE workspaces SET name=? WHERE id=? AND version=?')
    .bind('Still stale', 'coop', 0)
    .run();
  assert.equal(changes.meta.changes, 0);
  await assert.rejects(
    one.prepare('INSERT INTO absent_table VALUES (?)').bind('fixture').run(),
  );
});

await test('private object bytes are durable, immutable, private, and temporary files are cleaned', async (t) => {
  const dir = await temporary(t),
    store = objectStore(dir),
    key = 'private/coop/asset';
  const bytes = new Uint8Array([0, 1, 255, 127]);
  await store.put(key, bytes.buffer);
  assert.deepEqual((await objectStore(dir).get(key)).body, bytes);
  assert.equal((await stat(join(dir, key))).mode & 0o777, 0o600);
  await assert.rejects(store.put(key, Buffer.from('replacement')), /EEXIST/);
  assert.deepEqual((await store.get(key)).body, bytes);
  assert.deepEqual(await readdir(join(dir, 'private', 'coop')), ['asset']);
  const writes = await Promise.allSettled([
    store.put('private/coop/race', Buffer.from('a')),
    store.put('private/coop/race', Buffer.from('b')),
  ]);
  assert.equal(writes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(writes.filter((r) => r.status === 'rejected').length, 1);
  await store.delete(key);
  assert.equal(await store.get(key), null);
  await store.delete(key);
});

await test('object operations reject traversal, absolute paths and symlinked objects or directories', async (t) => {
  const dir = await temporary(t),
    root = join(dir, 'objects'),
    outside = join(dir, 'outside');
  const store = objectStore(root);
  for (const key of [
    '../outside',
    '/private/coop/asset',
    'private/coop/../asset',
    'private/coop/a/b',
    'private/coop/%2e%2e',
    '',
    null,
  ]) {
    await assert.rejects(
      store.put(key, Buffer.from('test')),
      /Invalid object key/,
    );
    await assert.rejects(store.get(key), /Invalid object key/);
    await assert.rejects(store.delete(key), /Invalid object key/);
  }
  await mkdir(join(root, 'private'), { recursive: true });
  await mkdir(outside);
  await writeFile(join(outside, 'asset'), 'must remain');
  await symlink(outside, join(root, 'private', 'coop'));
  await assert.rejects(
    store.put('private/coop/another', Buffer.from('test')),
    /symbolic links|real directories/,
  );
  await assert.rejects(
    store.get('private/coop/asset'),
    /symbolic links|real directories/,
  );
  await assert.rejects(
    store.delete('private/coop/asset'),
    /symbolic links|real directories/,
  );
  assert.equal(await readFile(join(outside, 'asset'), 'utf8'), 'must remain');
  await rm(join(root, 'private', 'coop'));
  await mkdir(join(root, 'private', 'coop'));
  await symlink(join(outside, 'asset'), join(root, 'private', 'coop', 'asset'));
  await assert.rejects(
    store.get('private/coop/asset'),
    /symbolic links|real directories/,
  );
});

await test('SQLite online snapshot includes committed WAL data and excludes later mutations', async (t) => {
  const dir = await temporary(t),
    live = openDatabase(join(dir, 'live.sqlite')),
    destination = join(dir, 'backup.sqlite');
  t.after(() => live.close());
  insertWorkspace(live);
  await backupDatabase(destination, live);
  insertWorkspace(live, 'later');
  const copy = new DatabaseSync(destination, { readOnly: true });
  try {
    assert.equal(
      copy.prepare('PRAGMA integrity_check').get().integrity_check,
      'ok',
    );
    assert.equal(
      copy.prepare('SELECT count(*) AS n FROM workspaces').get().n,
      1,
    );
    assert.equal(
      live.prepare('SELECT count(*) AS n FROM workspaces').get().n,
      2,
    );
  } finally {
    copy.close();
  }
});

await test('backup receipt and disposable restore check verify database and evidence hashes without changing source', async (t) => {
  const f = await fixtureBackup(t);
  const databasePath = join(f.backup, 'vergecommon.sqlite'),
    before = hash(await readFile(databasePath));
  assert.equal(f.receipt.databaseSha256, before);
  assert.deepEqual(f.receipt.schemaMigrations, ['0000_famous_nighthawk']);
  const filesBefore = await readdir(f.dir);
  const report = await checkBackup(f.backup, { temporaryRoot: f.dir });
  assert.equal(report.status, 'passed');
  assert.equal(report.verifiedEvidenceFiles, 1);
  assert.equal(report.workspaces, 1);
  assert.equal(report.databaseHashRecorded, true);
  assert.equal(report.productionChanged, false);
  assert.equal(hash(await readFile(databasePath)), before);
  assert.deepEqual(await readdir(f.dir), filesBefore);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM workspaces').get().n, 1);
  const { stdout } = await execute(
    process.execPath,
    ['self-hosted/restore-check.mjs', f.backup],
    { cwd: repository },
  );
  assert.equal(JSON.parse(stdout).status, 'passed');
});

await test('restore check detects changed bytes, missing files, bad receipts and unsafe object metadata', async (t) => {
  const f = await fixtureBackup(t),
    assetPath = join(f.backup, 'evidence/private/coop/asset');
  await writeFile(assetPath, Buffer.alloc(f.bytes.length, 0));
  await assert.rejects(
    checkBackup(f.backup, { temporaryRoot: f.dir }),
    /checksum mismatch/,
  );
  await rm(assetPath);
  await assert.rejects(
    checkBackup(f.backup, { temporaryRoot: f.dir }),
    /ENOENT/,
  );
  await writeFile(assetPath, f.bytes);
  const manifestPath = join(f.backup, 'receipt.json');
  const receipt = JSON.parse(await readFile(manifestPath, 'utf8'));
  await writeFile(
    manifestPath,
    JSON.stringify({ ...receipt, verifiedEvidenceFiles: 2 }),
  );
  await assert.rejects(
    checkBackup(f.backup, { temporaryRoot: f.dir }),
    /count does not match/,
  );
  await writeFile(
    manifestPath,
    JSON.stringify({ ...receipt, databaseSha256: '0'.repeat(64) }),
  );
  await assert.rejects(
    checkBackup(f.backup, { temporaryRoot: f.dir }),
    /database checksum/,
  );
  const db = new DatabaseSync(join(f.backup, 'vergecommon.sqlite'));
  db.prepare('UPDATE assets SET object_key=?').run('../private-secret');
  db.close();
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...receipt,
      databaseSha256: hash(
        await readFile(join(f.backup, 'vergecommon.sqlite')),
      ),
    }),
  );
  await assert.rejects(
    checkBackup(f.backup, { temporaryRoot: f.dir }),
    /unsafe evidence object key/,
  );
  assert.equal(
    (await readdir(f.dir)).some((name) =>
      name.startsWith('vergecommon-restore-check-'),
    ),
    false,
  );
});

await test('restore check rejects symlinks and corrupt SQLite, and fails before changing production data', async (t) => {
  const f = await fixtureBackup(t);
  const outside = join(f.dir, 'outside-secret');
  await writeFile(outside, 'do not read or overwrite');
  await symlink(outside, join(f.backup, 'surprise'));
  await assert.rejects(checkBackup(f.backup), /symbolic link/);
  assert.equal(await readFile(outside, 'utf8'), 'do not read or overwrite');
  await rm(join(f.backup, 'surprise'));
  const database = join(f.backup, 'vergecommon.sqlite');
  await copyFile(database, join(f.dir, 'preserved-snapshot'));
  const original = await readFile(database);
  original.fill(0, 0, 100);
  await writeFile(database, original);
  const receipt = JSON.parse(
    await readFile(join(f.backup, 'receipt.json'), 'utf8'),
  );
  await writeFile(
    join(f.backup, 'receipt.json'),
    JSON.stringify({ ...receipt, databaseSha256: hash(original) }),
  );
  await assert.rejects(checkBackup(f.backup), /database|file is not/i);
  assert.equal(
    f.db.prepare('PRAGMA integrity_check').get().integrity_check,
    'ok',
  );
});

await test('backup refuses corrupt evidence instead of producing a success receipt', async (t) => {
  const f = await fixtureBackup(t);
  await writeFile(
    join(f.data, 'evidence/private/coop/asset'),
    'corrupted evidence',
  );
  await assert.rejects(
    execute(process.execPath, ['self-hosted/backup.mjs'], {
      cwd: repository,
      env: {
        ...process.env,
        VERGE_DATA_DIR: f.data,
        VERGE_BACKUP_DIR: f.destination,
      },
    }),
    /checksum mismatch/,
  );
  const dirs = await readdir(f.destination);
  assert.equal(dirs.length, 2);
  let complete = 0;
  for (const dir of dirs) {
    if ((await readdir(join(f.destination, dir))).includes('receipt.json'))
      complete++;
  }
  assert.equal(complete, 1);
});

await test('empty new deployment can be backed up and checked before any evidence exists', async (t) => {
  const dir = await temporary(t),
    data = join(dir, 'data');
  const db = openDatabase(join(data, 'vergecommon.sqlite'));
  db.close();
  const { stdout } = await execute(
    process.execPath,
    ['self-hosted/backup.mjs'],
    {
      cwd: repository,
      env: {
        ...process.env,
        VERGE_DATA_DIR: data,
        VERGE_BACKUP_DIR: join(dir, 'backups'),
      },
    },
  );
  const report = await checkBackup(JSON.parse(stdout).directory, {
    temporaryRoot: dir,
  });
  assert.equal(report.verifiedEvidenceFiles, 0);
  assert.equal(report.workspaces, 0);
});

await test('backup rejects an unreferenced symlink rather than copying an unsafe recovery tree', async (t) => {
  const f = await fixtureBackup(t);
  const outside = join(f.dir, 'outside');
  await writeFile(outside, 'private external bytes');
  await symlink(outside, join(f.data, 'evidence', 'unexpected-link'));
  await assert.rejects(
    execute(process.execPath, ['self-hosted/backup.mjs'], {
      cwd: repository,
      env: {
        ...process.env,
        VERGE_DATA_DIR: f.data,
        VERGE_BACKUP_DIR: f.destination,
      },
    }),
    /Unsupported evidence object/,
  );
  assert.equal(await readFile(outside, 'utf8'), 'private external bytes');
});
