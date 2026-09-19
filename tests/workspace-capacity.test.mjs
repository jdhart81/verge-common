import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { applyCommand, newWorkspace, memberView, publicWorkspace } from '../lib/network.mjs';
import { WORKSPACE_CAPACITY as limits, workspaceBytes, workspaceCapacity, workspaceCapacityIssue, isWorkspaceSafetyCommand } from '../lib/workspace-capacity.mjs';
import { createSafety } from '../self-hosted/safety.mjs';

const owner = { id: randomUUID() };
const participant = { id: randomUUID() };
function fixture() {
  const state = newWorkspace({ name: 'Capacity test', summary: 'Synthetic fixture only', region: 'Test', displayName: 'Test steward' }, owner, 1, randomUUID());
  state.members.push({ id: randomUUID(), userId: participant.id, name: 'Test participant', role: 'member', status: 'active' });
  state.projects.push({ id: randomUUID(), name: 'Habitat', summary: 'Synthetic fixture', region: 'Test', kind: 'ecohedge', status: 'active', visibility: 'members' });
  state.updates.push({ id: randomUUID(), projectId: state.projects[0].id, text: 'Synthetic update', createdBy: participant.id, author: 'Test participant', visibility: 'members', hidden: false });
  return state;
}
function fillBytes(state, target) {
  state.retainedFixture = '';
  state.retainedFixture = 'x'.repeat(target - workspaceBytes(state));
  assert.equal(workspaceBytes(state), target);
  return state;
}
function fillAudit(state, count) {
  // Isolate the audit-count guard from the independent byte guard.
  state.audit = Array.from({ length: count }, (_, i) => ({ sequence: i + 1 }));
  return state;
}
function run(state, op, payload = {}, user = owner) {
  return applyCommand(state, user, { op, payload }, 100, randomUUID());
}
function appendReceipt(state) {
  Object.assign(state.audit.at(-1), {
    requestHash: 'a'.repeat(64), previousHash: 'b'.repeat(64),
    stateHash: 'c'.repeat(64), commitmentNonce: randomUUID(), hash: 'd'.repeat(64),
  });
  return state;
}

await test('ordinary activity stops before either hard cap while bounded safety actions retain every prior record', () => {
  for (const state of [fillAudit(fixture(), limits.growthAuditEntries), fillBytes(fixture(), limits.growthBytes)]) {
    const before = structuredClone(state);
    assert.throws(() => run(state, 'create_task', { projectId: state.projects[0].id, title: 'New work', detail: 'Synthetic', dueAt: 0 }), /New co-op activity is paused/);
    assert.deepEqual(state, before);
    const next = run(state, 'hide_update', { id: state.updates[0].id });
    assert.equal(next.updates[0].hidden, true);
    assert.deepEqual(next.audit.slice(0, -1), before.audit);
    assert.equal(next.audit.at(-1).action, 'hide_update');
    assert.deepEqual(state, before, 'the supplied snapshot remains untouched');
    assert.equal(workspaceCapacity(next).level, 'safety_only');
  }
});

await test('soft boundaries account for the full persisted receipt and UTF-8 bytes', () => {
  const state = fillBytes(fixture(), limits.growthBytes - 200);
  const input = { op: 'create_task', payload: { projectId: state.projects[0].id, title: 'New work', detail: '', dueAt: 0 } };
  assert.throws(() => applyCommand(state, owner, input, 100, randomUUID()), /New co-op activity is paused/);
  const safetyState = fillBytes(fixture(), limits.hardBytes - 1000);
  const reserved = run(safetyState, 'hide_update', { id: safetyState.updates[0].id });
  const preReceipt = workspaceBytes(reserved, { pendingReceipt: true });
  appendReceipt(reserved);
  assert.equal(workspaceBytes(reserved), preReceipt);
  assert.ok(preReceipt <= limits.hardBytes);
  const unicode = fixture();
  unicode.summary = '🌳'.repeat(50);
  assert.equal(workspaceBytes(unicode) - JSON.stringify(unicode).length, 100);
  const metadataGrowth = { ...reserved.audit.at(-1), futureMetadata: 'x'.repeat(1000) };
  reserved.audit[reserved.audit.length - 1] = metadataGrowth;
  assert.match(workspaceCapacityIssue(state, reserved, owner, { op: 'hide_update' }), /safety storage limit/);
});

await test('the audit reserve is bounded and exhausted writes leave the original history unchanged', () => {
  const state = fillAudit(fixture(), limits.hardAuditEntries - 1);
  const final = run(state, 'hide_update', { id: state.updates[0].id });
  assert.equal(final.audit.length, limits.hardAuditEntries);
  assert.equal(workspaceCapacity(final).level, 'full');
  const snapshot = structuredClone(final);
  assert.throws(() => run(final, 'archive'), /safety storage limit/);
  assert.deepEqual(final, snapshot);
  const bytesFull = fillBytes(fixture(), limits.hardBytes - 100);
  assert.throws(() => run(bytesFull, 'hide_update', { id: bytesFull.updates[0].id }), /safety storage limit/);
  assert.equal(workspaceBytes(bytesFull), limits.hardBytes - 100);
});

await test('reserve classification cannot approve members, grant roles, expose records or insert profile text', () => {
  const state = fillAudit(fixture(), limits.growthAuditEntries);
  const target = state.members[1];
  for (const input of [
    { op: 'member_status', payload: { id: target.id, status: 'active' } },
    { op: 'member_role', payload: { id: target.id, role: 'steward' } },
    { op: 'project_status', payload: { id: state.projects[0].id, status: 'active', visibility: 'public' } },
    { op: 'update_coop', payload: { ...state, visibility: 'private', summary: 'Changed profile' } },
    { op: 'respond_partner_invitation', payload: { decision: 'accept' } },
  ]) assert.equal(isWorkspaceSafetyCommand(state, owner, input), false);
  const privateInput = { op: 'update_coop', payload: { name: state.name, region: state.region, summary: state.summary, visibility: 'private' } };
  assert.equal(isWorkspaceSafetyCommand(state, owner, privateInput), true);
  assert.equal(isWorkspaceSafetyCommand(state, owner, { op: 'end_partner_participation' }), true);
  assert.equal(isWorkspaceSafetyCommand(state, owner, { op: 'respond_partner_invitation', payload: { decision: 'decline' } }), true);
  assert.throws(() => run(state, 'member_status', { id: target.id, status: 'removed' }, participant), /steward/);
  assert.equal(run(state, 'member_status', { id: target.id, status: 'removed' }).members[1].status, 'removed');
  assert.throws(() => run(state, 'member_role', { id: target.id, role: 'steward' }), /New co-op activity is paused/);
});

await test('archived co-ops retain authorized reporting, personal blocking, revocation and membership exit', () => {
  const state = fillAudit(fixture(), limits.growthAuditEntries);
  state.visibility = 'archived';
  state.invitations.push({ id: randomUUID(), revoked: false });
  assert.throws(() => run(state, 'create_project', { name: 'New', summary: 'New', region: 'Test', kind: 'ecohedge' }), /archived/);
  assert.throws(() => run(state, 'update_coop', { name: state.name, region: state.region, summary: state.summary, visibility: 'private' }), /archived/);
  assert.equal(run(state, 'revoke_invitation', { id: state.invitations[0].id }).invitations[0].revoked, true);
  assert.equal(run(state, 'block_member', { id: state.members[0].id }, participant).blocks.length, 1);
  assert.equal(run(state, 'report_content', { kind: 'update', targetId: state.updates[0].id, reason: 'Synthetic review request' }, owner).reports.length, 1);
  assert.equal(run(state, 'leave', {}, participant).members[1].status, 'removed');
});

await test('capacity status is coarse, membership-gated and excluded from the public directory', () => {
  const state = fillBytes(fixture(), limits.growthBytes);
  const view = memberView(state, participant.id);
  assert.deepEqual(view.capacity, { level: 'safety_only', growthPaused: true, safetyReserveAvailable: true });
  assert.equal(view.state.capacity, undefined);
  assert.equal(publicWorkspace(state).capacity, undefined);
  assert.throws(() => memberView(state, 'outsider'), /membership/);
  const normal = fixture();
  assert.equal(workspaceCapacity(normal).level, 'normal');
  fillBytes(normal, Math.ceil(limits.growthBytes * limits.warningFraction));
  assert.equal(workspaceCapacity(normal).level, 'near_limit');
});

await test('operator reporting and moderation remain independent of an exhausted workspace audit', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users (id TEXT PRIMARY KEY);');
  db.exec(readFileSync(new URL('../drizzle/0000_famous_nighthawk.sql', import.meta.url), 'utf8'));
  const state = fillAudit(fixture(), limits.hardAuditEntries);
  db.prepare('INSERT INTO users VALUES (?)').run(owner.id);
  db.prepare('INSERT INTO workspaces (id,owner_id,name,region,summary,state_json,version,visibility,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?,?)')
    .run(state.id, owner.id, state.name, state.region, state.summary, JSON.stringify(state), state.visibility, 1, 1);
  const safety = createSafety(db);
  const input = { requestId: randomUUID(), receipt: randomBytes(32).toString('hex'), kind: 'update', coopId: state.id, targetId: state.updates[0].id, category: 'abuse', reason: 'Synthetic exhausted workspace report for independent moderation.' };
  assert.equal(safety.submit(input, owner).status, 'received');
  safety.resolve({ id: input.requestId, action: 'hide', operator: 'Test operator', note: 'Synthetic independent review outcome.' });
  const saved = JSON.parse(db.prepare('SELECT state_json FROM workspaces WHERE id=?').get(state.id).state_json);
  assert.equal(saved.updates[0].hidden, true);
  assert.deepEqual(saved.audit, state.audit);
  assert.equal(db.prepare('SELECT count(*) AS n FROM safety_actions').get().n, 1);
  assert.equal(safety.status({ id: input.requestId, receipt: input.receipt }).status, 'action_taken');
});
