import {
  mkdir,
  mkdtemp,
  cp,
  writeFile,
  readFile,
  stat,
  lstat,
} from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { dataDir, getDatabase, backupDatabase } from './storage.mjs';
process.umask(0o077);
const backupRoot = resolve(
  process.env.VERGE_BACKUP_DIR || 'self-hosted/backups',
);
await mkdir(backupRoot, { recursive: true, mode: 0o700 });
const target = await mkdtemp(
  join(backupRoot, new Date().toISOString().replace(/[:.]/g, '-') + '-'),
);
await backupDatabase(join(target, 'vergecommon.sqlite'));
// Evidence keys are immutable after creation; copy after the database snapshot.
// Extra objects from concurrent uploads are harmless; referenced objects must exist.
await cp(join(dataDir, 'evidence'), join(target, 'evidence'), {
  recursive: true,
  force: false,
  filter: async (source) => {
    const info = await lstat(source);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
      throw new Error('Unsupported evidence object in backup');
    return true;
  },
}).catch((e) => {
  if (e.code !== 'ENOENT') throw e;
});
const db = new DatabaseSync(join(target, 'vergecommon.sqlite'), {
  readOnly: true,
});
if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
  throw new Error('Backup database integrity check failed');
let files = 0;
for (const asset of db.prepare('SELECT object_key,sha256 FROM assets').all()) {
  if (!/^private\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(asset.object_key))
    throw new Error('Invalid backup object key');
  const parts = asset.object_key.split('/');
  for (let i = 1; i <= parts.length; i++)
    if (
      (
        await lstat(join(target, 'evidence', ...parts.slice(0, i)))
      ).isSymbolicLink()
    )
      throw new Error('Symlink in evidence backup');
  const bytes = await readFile(join(target, 'evidence', asset.object_key));
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
    throw new Error('Backup evidence checksum mismatch');
  files++;
}
const manifest = {
  createdAt: new Date().toISOString(),
  databaseIntegrity: 'ok',
  databaseSha256: createHash('sha256')
    .update(await readFile(join(target, 'vergecommon.sqlite')))
    .digest('hex'),
  schemaMigrations: db
    .prepare('SELECT name FROM schema_migrations ORDER BY name')
    .all()
    .map((r) => r.name),
  verifiedEvidenceFiles: files,
  databaseBytes: (await stat(join(target, 'vergecommon.sqlite'))).size,
};
await writeFile(
  join(target, 'receipt.json'),
  JSON.stringify(manifest, null, 2) + '\n',
  { mode: 0o600 },
);
db.close();
getDatabase().close();
console.log(JSON.stringify({ directory: target, ...manifest }));
