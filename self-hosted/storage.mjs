import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, readFileSync, chmodSync } from 'node:fs';
import {
  mkdir,
  readFile,
  writeFile,
  link,
  unlink,
  lstat,
} from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export const dataDir = resolve(process.env.VERGE_DATA_DIR || '.verge-data');
export function openDatabase(path = resolve(dataDir, 'vergecommon.sqlite')) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec(
    'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;',
  );
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY);`,
  );
  const name = '0000_famous_nighthawk';
  if (
    !db.prepare('SELECT name FROM schema_migrations WHERE name=?').get(name)
  ) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(
        readFileSync(resolve('drizzle/0000_famous_nighthawk.sql'), 'utf8'),
      );
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
export function objectStore(root = resolve(dataDir, 'evidence')) {
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
        await unlink(path);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    },
  };
}
export async function backupDatabase(destination, db = getDatabase()) {
  await backup(db, destination);
}
