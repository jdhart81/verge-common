import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, readFileSync, chmodSync } from 'node:fs';
import {
  mkdir,
  readFile,
  writeFile,
  link,
  unlink,
  lstat,
  readdir,
} from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export const dataDir = resolve(process.env.VERGE_DATA_DIR || '.verge-data');
export function openDatabase(path = resolve(dataDir, 'vergecommon.sqlite')) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec(
    'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;',
  );
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY);`,
  );
  for (const name of [
    '0000_famous_nighthawk',
    '0001_evidence_upload_lifecycle',
    '0002_idempotent_evidence_uploads',
  ]) {
    if (db.prepare('SELECT name FROM schema_migrations WHERE name=?').get(name))
      continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(resolve(`drizzle/${name}.sql`), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES (?)').run(name);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}
let database;
export function getDatabase() {
  return (database ??= openDatabase());
}
export function d1Adapter(db) {
  return {
    prepare(sql) {
      const make = (values = []) => ({
        bind: (...args) => make(args),
        async first(column) {
          const row = db.prepare(sql).get(...values) ?? null;
          return column && row ? row[column] : row;
        },
        async all() {
          return { results: db.prepare(sql).all(...values), success: true };
        },
        async run() {
          const r = db.prepare(sql).run(...values);
          return {
            success: true,
            meta: {
              changes: Number(r.changes),
              last_row_id: Number(r.lastInsertRowid),
            },
          };
        },
      });
      return make();
    },
  };
}
export function objectStore(
  root = resolve(dataDir, 'evidence'),
  { deleteFile = unlink, database = getDatabase } = {},
) {
  const pathFor = (key) => {
    if (
      typeof key !== 'string' ||
      !/^private\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(key)
    )
      throw new Error('Invalid object key');
    return resolve(root, key);
  };
  return {
    async put(key, bytes) {
      const path = pathFor(key);
      for (const [index, part] of [
        root,
        resolve(root, 'private'),
        dirname(path),
      ].entries()) {
        await mkdir(part, { recursive: index === 0, mode: 0o700 }).catch(
          (e) => {
            if (e.code !== 'EEXIST') throw e;
          },
        );
        const info = await lstat(part);
        if (info.isSymbolicLink() || !info.isDirectory())
          throw new Error('Object paths must be real directories');
      }
      const temp = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, Buffer.from(bytes), { mode: 0o600, flag: 'wx' });
        await link(temp, path);
      } finally {
        await unlink(temp).catch((e) => {
          if (e.code !== 'ENOENT') throw e;
        });
      }
    },
    async get(key) {
      try {
        const path = pathFor(key);
        for (const part of [
          root,
          resolve(root, 'private'),
          dirname(path),
          path,
        ]) {
          if ((await lstat(part)).isSymbolicLink())
            throw new Error('Object paths must not be symbolic links');
        }
        return { body: new Uint8Array(await readFile(path)) };
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    async delete(key) {
      const path = pathFor(key);
      try {
        for (const part of [
          root,
          resolve(root, 'private'),
          dirname(path),
          path,
        ]) {
          if ((await lstat(part)).isSymbolicLink())
            throw new Error('Object paths must not be symbolic links');
        }
        await deleteFile(path);
      } catch (e) {
        if (e.code !== 'ENOENT') {
          // Also covers an upload rejected after its account was deleted.
          // Persist cleanup before reporting failure so restart can retry it.
          const db = database();
          db.exec(
            'CREATE TABLE IF NOT EXISTS erasure_file_queue (object_key TEXT PRIMARY KEY, requested_at INTEGER NOT NULL)',
          );
          db.prepare(
            'INSERT OR IGNORE INTO erasure_file_queue VALUES (?,?)',
          ).run(key, Date.now());
          throw e;
        }
      }
    },
  };
}
// Startup only, before serving requests. A crash between object creation and
// metadata insertion can leave an unreferenced file even without a deletion.
export async function reconcileEvidence(
  db,
  root = resolve(dataDir, 'evidence'),
) {
  let removed = 0;
  const walk = async (directory) => {
    const info = await lstat(directory);
    if (info.isSymbolicLink())
      throw new Error('Evidence path cannot be a symbolic link');
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!entry.isFile() || entry.isSymbolicLink())
        throw new Error('Unsupported evidence object');
      const key = path.slice(resolve(root).length + 1);
      if (
        !/^private\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+\.tmp)?$/.test(
          key,
        )
      )
        throw new Error('Unsafe evidence object');
      if (!db.prepare('SELECT id FROM assets WHERE object_key=?').get(key)) {
        await unlink(path);
        removed++;
      }
    }
  };
  try {
    await walk(root);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { removedOrphanFiles: removed };
}
export async function backupDatabase(destination, db = getDatabase()) {
  await backup(db, destination);
}
