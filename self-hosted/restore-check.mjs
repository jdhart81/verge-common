import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, lstat, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const sha256Pattern = /^[a-f0-9]{64}$/;
const objectKeyPattern = /^private\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/;
async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function checkTree(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink())
    throw new Error('Backup contains a symbolic link; restore check refused.');
  if (info.isDirectory()) {
    for (const name of await readdir(path)) await checkTree(join(path, name));
  } else if (!info.isFile()) {
    throw new Error(
      'Backup contains a non-regular file; restore check refused.',
    );
  }
}

// A restore rehearsal uses a disposable copy. It never opens the source database,
// modifies VERGE_DATA_DIR, starts a server, or installs a replacement database.
export async function checkBackup(source, { temporaryRoot = tmpdir() } = {}) {
  const directory = resolve(source);
  if (!(await lstat(directory)).isDirectory())
    throw new Error('Choose a backup directory.');
  await checkTree(directory);
  const receipt = JSON.parse(
    await readFile(join(directory, 'receipt.json'), 'utf8'),
  );
  if (
    receipt.databaseIntegrity !== 'ok' ||
    !Number.isSafeInteger(receipt.verifiedEvidenceFiles) ||
    receipt.verifiedEvidenceFiles < 0 ||
    !Number.isFinite(Date.parse(receipt.createdAt))
  ) {
    throw new Error('Backup receipt is missing required integrity metadata.');
  }
  const temporary = await mkdtemp(
    join(resolve(temporaryRoot), 'vergecommon-restore-check-'),
  );
  let db;
  try {
    const copy = join(temporary, 'backup');
    await cp(directory, copy, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
    });
    await checkTree(copy);
    const databasePath = join(copy, 'vergecommon.sqlite');
    const databaseHash = await hashFile(databasePath);
    if (
      receipt.databaseSha256 &&
      (!sha256Pattern.test(receipt.databaseSha256) ||
        receipt.databaseSha256 !== databaseHash)
    ) {
      throw new Error('Backup database checksum mismatch.');
    }
    if ((await lstat(databasePath)).size !== receipt.databaseBytes)
      throw new Error('Backup database size mismatch.');
    db = new DatabaseSync(databasePath, {
      readOnly: true,
      allowExtension: false,
    });
    db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok')
      throw new Error('Backup database integrity check failed.');
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Backup contains broken foreign keys.');
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_schema WHERE type='table'")
        .all()
        .map((row) => row.name),
    );
    for (const table of ['schema_migrations', 'workspaces', 'assets']) {
      if (!tables.has(table))
        throw new Error(`Backup is missing the ${table} table.`);
    }
    const migrations = db
      .prepare('SELECT name FROM schema_migrations ORDER BY name')
      .all()
      .map((row) => row.name);
    if (
      receipt.schemaMigrations &&
      JSON.stringify(receipt.schemaMigrations) !== JSON.stringify(migrations)
    )
      throw new Error('Backup migration receipt does not match the database.');
    const workspaces = db
      .prepare('SELECT id,owner_id,state_json,version FROM workspaces')
      .all();
    for (const workspace of workspaces) {
      let state;
      try {
        state = JSON.parse(workspace.state_json);
      } catch {
        throw new Error('Backup contains invalid workspace JSON.');
      }
      if (
        state?.id !== workspace.id ||
        state.ownerId !== workspace.owner_id ||
        !Array.isArray(state.members) ||
        !Array.isArray(state.audit) ||
        !Number.isSafeInteger(workspace.version) ||
        workspace.version < 0
      ) {
        throw new Error('Backup contains an inconsistent workspace record.');
      }
    }
    const workspaceIds = new Set(workspaces.map((w) => w.id));
    const assets = db
      .prepare('SELECT id,workspace_id,object_key,sha256,size FROM assets')
      .all();
    for (const asset of assets) {
      if (
        !objectKeyPattern.test(asset.object_key) ||
        asset.object_key !==
          `private/${String(asset.workspace_id)}/${String(asset.id)}`
      ) {
        throw new Error('Backup contains an unsafe evidence object key.');
      }
      if (!workspaceIds.has(asset.workspace_id))
        throw new Error('Backup evidence refers to a missing workspace.');
      if (
        !sha256Pattern.test(asset.sha256) ||
        !Number.isSafeInteger(asset.size) ||
        asset.size < 1
      ) {
        throw new Error('Backup contains invalid evidence metadata.');
      }
      const path = join(copy, 'evidence', asset.object_key);
      const info = await lstat(path);
      if (!info.isFile() || info.size !== asset.size)
        throw new Error('Backup evidence size mismatch.');
      if ((await hashFile(path)) !== asset.sha256)
        throw new Error('Backup evidence checksum mismatch.');
    }
    if (assets.length !== receipt.verifiedEvidenceFiles)
      throw new Error('Backup evidence count does not match its receipt.');
    return {
      status: 'passed',
      source: directory,
      checkedAt: new Date().toISOString(),
      databaseIntegrity: 'ok',
      databaseSha256: databaseHash,
      databaseHashRecorded: !!receipt.databaseSha256,
      workspaces: workspaces.length,
      verifiedEvidenceFiles: assets.length,
      users: tables.has('users')
        ? db.prepare('SELECT count(*) AS n FROM users').get().n
        : 0,
      migrations,
      productionChanged: false,
    };
  } finally {
    db?.close();
    await rm(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.length !== 3) {
    console.error(
      'Usage: node self-hosted/restore-check.mjs /absolute/path/to/backup-directory',
    );
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(await checkBackup(process.argv[2]), null, 2));
    } catch (error) {
      console.error(`Restore check failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
