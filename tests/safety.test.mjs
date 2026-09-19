import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSafety } from '../self-hosted/safety.mjs';
import { newWorkspace, applyCommand, publicWorkspace } from '../lib/network.mjs';

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users (id TEXT PRIMARY KEY);');
  db.exec(readFileSync(new URL('../drizzle/0000_famous_nighthawk.sql', import.meta.url), 'utf8'));
  const user = { id: randomUUID() }; db.prepare('INSERT INTO users VALUES (?)').run(user.id);
  const id = randomUUID();
  const state = newWorkspace({ name: 'Test common', summary: 'Synthetic community', region: 'Test', displayName: 'Test steward' }, user, Date.now(), id);
  state.visibility = 'public';
  const project = { id: randomUUID(), name: 'Habitat', summary: 'Care together', region: 'Test', kind: 'ecohedge', status: 'active', visibility: 'public' };
  state.projects.push(project);
  const update = { id: randomUUID(), projectId: project.id, text: 'Synthetic reported content', visibility: 'public', createdBy: user.id, createdAt: Date.now() };
  state.updates.push(update);
  db.prepare('INSERT INTO workspaces (id,owner_id,name,region,summary,state_json,version,visibility,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?,?)')
    .run(id, user.id, state.name, state.region, state.summary, JSON.stringify(state), state.visibility, Date.now(), Date.now());
  const safety = createSafety(db);
  const input = { requestId: randomUUID(), receipt: randomBytes(32).toString('hex'), kind: 'update', coopId: id, targetId: update.id, category: 'abuse', reason: 'Please review this synthetic example of a conduct concern.' };
  t.after(() => db.close());
  return { db, user, id, state, safety, input };
}

await test('public reporting returns a private status receipt, never public complaint contents', t => {
  const { db, safety, input } = fixture(t);
  const saved = safety.submit(input);
  assert.equal(saved.id, input.requestId);
  assert.equal(saved.status, 'received');
  const status = safety.status({ id: saved.id, receipt: saved.receipt });
  assert.deepEqual(Object.keys(status).sort(), ['id', 'status', 'updatedAt']);
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM safety_reports').get()).includes(input.receipt), false);
  assert.throws(() => safety.status({ id: saved.id, receipt: randomBytes(32).toString('hex') }), /not found/);
  assert.equal(safety.summary().openReports, 1);
});
await test('report retries are exact and cannot overwrite the first report', t => {
  const { safety, input } = fixture(t);
  safety.submit(input);
  assert.equal(safety.submit(input).repeated, true);
  assert.throws(() => safety.submit({ ...input, reason: 'Changed report must use a different receipt and request identifier.' }), /earlier report/);
  assert.equal(safety.list().reports.length, 1);
});
await test('anonymous reporters cannot discover private co-op records', t => {
  const { db, safety, input, id, user } = fixture(t);
  db.prepare("UPDATE workspaces SET visibility='private' WHERE id=?").run(id);
  assert.throws(() => safety.submit(input), /unavailable/);
  assert.equal(safety.submit(input, user).status, 'received');
  assert.throws(() => safety.submit({ ...input, requestId: randomUUID(), targetId: randomUUID() }, user), /unavailable/);
});
await test('operator can hide a sole founding steward post without granting another user access', t => {
  const { db, safety, input, user, id } = fixture(t);
  safety.submit(input);
  safety.resolve({ id: input.requestId, action: 'hide', operator: 'Test operator', note: 'Synthetic moderation decision.' });
  const state = JSON.parse(db.prepare('SELECT state_json FROM workspaces WHERE id=?').get(id).state_json);
  assert.equal(publicWorkspace(state).updates.length, 0);
  assert.equal(state.members.length, 1);
  assert.equal(state.ownerId, user.id);
  assert.equal(db.prepare('SELECT version FROM workspaces WHERE id=?').get(id).version, 1);
  assert.equal(safety.status({ id: input.requestId, receipt: input.receipt }).status, 'action_taken');
  assert.throws(() => safety.resolve({ id: input.requestId, action: 'dismiss', operator: 'Test', note: 'Cannot overwrite completed review.' }), /already resolved/);
});
await test('operator restrictions survive owner edits and release leaves republishing with steward', t => {
  const { db, safety, input, user, id } = fixture(t);
  safety.submit({ ...input, kind: 'coop' });
  safety.resolve({ id: input.requestId, action: 'restrict', operator: 'Test operator', note: 'Synthetic public-listing restriction.' });
  let state = JSON.parse(db.prepare('SELECT state_json FROM workspaces WHERE id=?').get(id).state_json);
  assert.throws(() => applyCommand(state, user, { op: 'update_coop', payload: { name: state.name, region: state.region, summary: state.summary, visibility: 'public' } }, Date.now(), randomUUID()), /restricted/);
  assert.equal(state.visibility, 'private');
  safety.release({ coopId: id, operator: 'Test operator', note: 'Synthetic issue resolved after review.' });
  state = JSON.parse(db.prepare('SELECT state_json FROM workspaces WHERE id=?').get(id).state_json);
  assert.equal(state.operatorRestriction, undefined);
  assert.equal(state.visibility, 'private');
  assert.equal(db.prepare('SELECT count(*) AS n FROM safety_actions').get().n, 2);
});
await test('signed-in complaints are erased with the account and stale identities cannot recreate them', t => {
  const { db, safety, input, user } = fixture(t);
  safety.submit(input, user);
  db.prepare('DELETE FROM users WHERE id=?').run(user.id);
  assert.equal(safety.list().reports.length, 0);
  assert.throws(() => safety.status({ id: input.requestId, receipt: input.receipt }), /not found/);
  assert.throws(() => safety.submit({ ...input, kind: 'general' }, user), /no longer available/);
});
