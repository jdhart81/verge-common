import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { directoryQuery, directoryPage } from '../lib/network-directory.mjs';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE workspaces (id TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at INTEGER NOT NULL, visibility TEXT NOT NULL, name TEXT NOT NULL, region TEXT NOT NULL, summary TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO workspaces VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const [id, name, region, summary, visibility, timestamp] of [
    ['c', 'River co-op', 'Vermont', 'Restore woodland', 'public', 20],
    ['b', 'River neighbors', 'Ohio', 'Protect 100% of edge_habitat', 'public', 20],
    ['a', 'Meadow co-op', 'Vermont', 'Restore woodland', 'public', 20],
    ['older', 'Woodland', 'Ohio', 'Restore habitat', 'public', 10],
    ['private', 'River private', 'Vermont', 'Hidden co-op', 'private', 25],
  ]) insert.run(id, JSON.stringify({ id, name, region, summary, country: 'US' }), timestamp, visibility, name, region, summary);
  return db;
}
function page(db, search = '', project = (state) => state) {
  const query = directoryQuery(new URLSearchParams(search), 30);
  return directoryPage(db.prepare(query.sql).all(...query.values), query.limit, project, query.search);
}
await test('directory pagination includes each equal-timestamp community exactly once and excludes private co-ops', () => {
  const db = fixture();
  try {
    const first = page(db, 'limit=2');
    assert.deepEqual(first.coops.map((c) => c.id), ['c', 'b']);
    assert.equal(first.next, 20); assert.equal(first.nextId, 'b');
    const second = page(db, `limit=2&before=${first.next}&beforeId=${first.nextId}`);
    assert.deepEqual(second.coops.map((c) => c.id), ['a', 'older']);
    assert.equal(second.next, null); assert.equal(second.nextId, null);
    assert.deepEqual(page(db, 'before=20').coops.map((c) => c.id), ['older']);
  } finally { db.close(); }
});
await test('search uses projected public fields and treats wildcard punctuation and SQL syntax literally', () => {
  const db = fixture();
  try {
    for (const query of ['100%', 'edge_', 'Ohio', 'river', 'US']) {
      const result = page(db, new URLSearchParams({ q: query }).toString()).coops;
      assert.ok(result.length > 0, query);
      assert.ok(!result.some((c) => c.id === 'private'));
      if (query === '100%' || query === 'edge_') assert.deepEqual(result.map((c) => c.id), ['b']);
    }
    for (const query of ["' OR 1=1 --", '\\', 'missing']) assert.equal(page(db, new URLSearchParams({ q: query }).toString()).coops.length, 0);
    const first = page(db, 'q=woodland&limit=1');
    assert.equal(first.coops[0].id, 'c');
    const second = page(db, `q=woodland&limit=1&before=${first.next}&beforeId=${first.nextId}`);
    assert.deepEqual(second.coops, []);
    assert.equal(second.nextId, 'b', 'An empty matching page still advances through the directory');
    assert.equal(page(db, `q=woodland&limit=1&before=${second.next}&beforeId=${second.nextId}`).coops[0].id, 'a');
  } finally { db.close(); }
});
await test('redacted legacy profile text cannot be inferred from search results or matching cursors', () => {
  const db = fixture();
  try {
    db.prepare('UPDATE workspaces SET name=?,state_json=? WHERE id=?').run('Private name', JSON.stringify({ id: 'c', name: 'Private name', region: 'Private region', summary: 'Private details', country: 'US' }), 'c');
    const project = (state) => state.id === 'c' ? { id: 'c', name: 'Community co-op', region: '', summary: 'Profile under review', country: '' } : state;
    assert.deepEqual(page(db, 'q=Private&limit=1', project), page(db, 'q=nonexistent&limit=1', project));
    assert.equal(page(db, 'q=Community&limit=1', project).coops[0].id, 'c');
  } finally { db.close(); }
});
await test('invalid cursors and unbounded searches fail before database access', () => {
  for (const query of ['limit=0', 'limit=31', 'limit=1.5', 'before=-1', 'before=NaN', 'beforeId=x', 'before=20&beforeId=', 'before=20&beforeId=with+space', 'q=a%0Ab', `q=${'x'.repeat(161)}`])
    assert.throws(() => directoryQuery(new URLSearchParams(query), 30), query);
});
