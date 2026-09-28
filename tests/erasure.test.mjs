import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAuth } from '../self-hosted/auth.mjs';
import { newWorkspace, applyCommand } from '../lib/network.mjs';
import { objectStore } from '../self-hosted/storage.mjs';
import {
  eraseAccountData,
  eraseWorkspaceState,
  commitErasureIntent,
  abortErasureIntent,
  recoverErasureIntents,
  replayErasureLedger,
  drainErasureFiles,
  initializeErasure,
} from '../self-hosted/erasure.mjs';

const now = 1_800_000_000_000;
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'verge-erasure-'));
  const ledgerDirectory = join(directory, 'ledger');
  mkdirSync(ledgerDirectory);
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(
    readFileSync(
      new URL('../drizzle/0000_famous_nighthawk.sql', import.meta.url),
      'utf8',
    ),
  );
  createAuth(db);
  initializeErasure(db);
  const user = { id: randomUUID() },
    other = { id: randomUUID() };
  for (const u of [user, other])
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(
      u.id,
      u.id,
      u.id === user.id ? 'Person Erased' : 'Neighbor Retained',
      'hash',
      'recovery',
      now,
    );
  const workspace = (owner = user) =>
    newWorkspace(
      {
        name: 'Cooperative test',
        region: 'Region',
        summary: 'Public mission',
        displayName:
          owner.id === user.id ? 'Person Erased' : 'Neighbor Retained',
      },
      owner,
      now,
      randomUUID(),
    );
  const save = (s) =>
    db
      .prepare('INSERT INTO workspaces VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(
        s.id,
        s.ownerId,
        s.name,
        s.region,
        s.summary,
        s.visibility,
        JSON.stringify(s),
        2,
        now,
        now,
      );
  const close = (id = user.id) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = eraseAccountData(db, id, now + 1, { ledgerDirectory });
      db.prepare('DELETE FROM users WHERE id=?').run(id);
      db.exec('COMMIT');
      commitErasureIntent(ledgerDirectory, id);
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      abortErasureIntent(ledgerDirectory, id);
      throw e;
    }
  };
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    db,
    directory,
    ledgerDirectory,
    user,
    other,
    workspace,
    save,
    close,
  };
}
function addMember(s, user, name) {
  const member = {
    id: randomUUID(),
    userId: user.id,
    name,
    role: 'member',
    status: 'active',
    joinedAt: now,
  };
  s.members.push(member);
  return member;
}
function asset(f, s, uploader = f.user) {
  const id = randomUUID(),
    key = `private/${s.id}/${id}`;
  f.db
    .prepare('INSERT INTO assets VALUES (?,?,?,?,?,?,?,?,?)')
    .run(
      id,
      s.id,
      uploader.id,
      key,
      'person-private-address.pdf',
      'application/pdf',
      'a'.repeat(64),
      4,
      now,
    );
  return { id, key };
}

await test('deletion refuses a founder handover before ledger or data writes, including when another workspace is erasable', (t) => {
  const f = fixture(t),
    alone = f.workspace(),
    shared = f.workspace();
  f.save(alone);
  addMember(shared, f.other, 'Neighbor Retained');
  f.save(shared);
  const before = f.db.prepare('SELECT * FROM workspaces').all();
  assert.throws(
    () => f.close(),
    (e) => e.status === 409 && /Transfer founding stewardship/.test(e.message),
  );
  assert.deepEqual(f.db.prepare('SELECT * FROM workspaces').all(), before);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 2);
  assert.deepEqual(readdirSync(f.ledgerDirectory), []);
  assert.equal(
    f.db.prepare('SELECT count(*) AS n FROM erasure_tombstones').get().n,
    0,
  );
});

await test('sole-member deletion removes the workspace and metadata then retries private bytes safely', async (t) => {
  const f = fixture(t),
    s = f.workspace();
  f.save(s);
  const a = asset(f, s),
    store = objectStore(join(f.directory, 'evidence'));
  await store.put(a.key, Buffer.from('data'));
  f.db
    .prepare('INSERT INTO auth_audit VALUES (?,?,?,?)')
    .run(randomUUID(), f.user.id, 'register', now);
  f.db
    .prepare('INSERT INTO sessions VALUES (?,?,?)')
    .run('sessionhash', f.user.id, now + 1000);
  const result = f.close();
  assert.equal(result.removedWorkspaces, 1);
  assert.equal(result.removedAssets, 1);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM workspaces').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM assets').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM auth_audit').get().n, 0);
  await assert.rejects(
    drainErasureFiles(f.db, {
      delete() {
        throw new Error('temporary storage error');
      },
    }),
    /storage/,
  );
  assert.equal(
    f.db.prepare('SELECT count(*) AS n FROM erasure_file_queue').get().n,
    1,
  );
  assert.deepEqual(await drainErasureFiles(f.db, store), {
    deletedFiles: 1,
    pendingFiles: 0,
  });
  assert.equal(await store.get(a.key), null);
  assert.equal((await drainErasureFiles(f.db, store)).deletedFiles, 0);
  const intent = JSON.parse(
    readFileSync(join(f.ledgerDirectory, `${f.user.id}.json`), 'utf8'),
  );
  assert.deepEqual(intent, {
    schema: 1,
    userId: f.user.id,
    requestedAt: now + 1,
  });
});

await test('shared co-op deletion strips own UGC, land, evidence, copied snapshots, reviews and names while preserving neighbor records', (t) => {
  const f = fixture(t),
    s = f.workspace(f.other),
    member = addMember(s, f.user, 'Person Erased');
  const own = { createdBy: f.user.id, createdAt: now },
    neighbor = { createdBy: f.other.id, createdAt: now };
  const parcel = randomUUID(),
    boundary = randomUUID(),
    project = randomUUID(),
    post = randomUUID(),
    evidence = randomUUID();
  // Store the initial workspace before uploading, as the real upload contract requires.
  f.save(s);
  const a = asset(f, s);
  s.projects.push({
    id: project,
    ...neighbor,
    name: 'Neighbor project',
    summary: 'Keep this',
    region: 'Neighbor area',
    kind: 'landscape',
    status: 'active',
  });
  s.updates.push({
    id: post,
    projectId: project,
    ...own,
    author: 'Person Erased',
    text: 'PRIVATE post address',
    hidden: false,
    visibility: 'public',
  });
  s.updates.push({
    id: randomUUID(),
    projectId: project,
    ...neighbor,
    author: 'Neighbor Retained',
    text: 'Keep neighbor post',
    hidden: false,
    visibility: 'members',
  });
  s.comments.push({
    id: randomUUID(),
    updateId: post,
    ...own,
    author: 'Person Erased',
    text: 'PRIVATE comment',
  });
  s.comments.push({
    id: randomUUID(),
    updateId: post,
    ...neighbor,
    author: 'Neighbor Retained',
    text: 'Keep neighbor reply',
  });
  s.events.push({
    id: randomUUID(),
    projectId: project,
    ...own,
    title: 'PRIVATE event',
    meetingDetails: 'PRIVATE address',
    summary: 'PRIVATE summary',
    startsAt: now,
    endsAt: now + 10,
    capacity: 4,
    rsvps: [{ userId: f.user.id }, { userId: f.other.id }],
  });
  s.parcels.push({
    id: parcel,
    projectId: project,
    ...own,
    landReference: 'PRIVATE land',
    notes: 'PRIVATE notes',
    boundaries: [
      {
        id: boundary,
        ...neighbor,
        geometry: { coordinates: ['PRIVATE geometry'] },
      },
    ],
    consents: [
      { ...neighbor, landSnapshot: { landReference: 'PRIVATE land' } },
    ],
  });
  s.analysisJobs.push({
    id: randomUUID(),
    parcelId: parcel,
    boundaryId: boundary,
    ...neighbor,
    geometry: { coordinates: ['PRIVATE geometry'] },
  });
  s.observations.push({
    id: randomUUID(),
    parcelId: parcel,
    ...neighbor,
    reference: 'PRIVATE coordinates',
  });
  s.assessments.push({
    id: randomUUID(),
    ...neighbor,
    parcelIds: [parcel],
    parcelSnapshot: [{ parcelId: parcel, geometry: 'PRIVATE copy' }],
  });
  s.agreements.push({
    id: randomUUID(),
    ...neighbor,
    parcelIds: [parcel],
    holder: 'PRIVATE holder',
    parcelSnapshot: [{ parcelId: parcel }],
  });
  s.evidence.push({
    id: evidence,
    projectId: project,
    ...own,
    notes: 'PRIVATE evidence',
    asset: { id: a.id, uploaderId: f.user.id, filename: 'PRIVATE file' },
  });
  s.authority = {
    ...neighbor,
    evidenceId: evidence,
    legalName: 'PRIVATE private attachment reference',
  };
  s.tasks.push({
    id: randomUUID(),
    ...neighbor,
    title: 'Keep neighbor task',
    assignee: f.user.id,
    status: 'claimed',
  });
  s.partnerships.push({
    id: randomUUID(),
    ...neighbor,
    name: 'Keep partner',
    reviewedBy: f.user.id,
    reviewNote: 'PRIVATE review',
  });
  s.blocks.push({ userId: f.user.id, blockedUserId: f.other.id });
  s.invitations.push(
    { id: 'own-invitation', label: 'PRIVATE invite' },
    { id: 'neighbor-invitation', label: 'Keep invite' },
  );
  s.audit.push({
    id: 'own-invitation',
    sequence: 1,
    action: 'create_invitation',
    actorId: f.user.id,
    requestHash: 'PRIVATE hash',
    hash: 'PRIVATE commit',
    stateHash: 'PRIVATE state',
    at: now,
  });
  s.audit.push({
    id: 'neighbor-command',
    sequence: 2,
    action: 'create_project',
    actorId: f.other.id,
    requestHash: 'keep-retry-hash',
    hash: 'PRIVATE prior-chain',
    at: now,
  });
  s.proposals.push({
    id: 'proposal',
    ...neighbor,
    title: 'Keep vote',
    shares: [
      { id: member.id, name: 'Person Erased', shareBps: 5000 },
      { id: s.members[0].id, name: 'Neighbor Retained', shareBps: 5000 },
    ],
    electorate: [member.id, s.members[0].id],
    votes: [{ memberId: member.id, choice: 'approve' }],
    status: 'adopted',
  });
  f.db
    .prepare('UPDATE workspaces SET state_json=? WHERE id=?')
    .run(JSON.stringify(s), s.id);
  const result = f.close();
  const saved = JSON.parse(
    f.db.prepare('SELECT state_json FROM workspaces WHERE id=?').get(s.id)
      .state_json,
  );
  const text = JSON.stringify(saved);
  assert.doesNotMatch(text, /PRIVATE|Person Erased/);
  assert.ok(!text.includes(f.user.id));
  assert.equal(saved.ownerId, f.other.id);
  assert.equal(saved.visibility, 'private');
  assert.equal(saved.members[0].name, 'Neighbor Retained');
  assert.equal(saved.members[1].name, 'Deleted member');
  assert.equal(saved.members[1].status, 'removed');
  assert.equal(saved.updates[1].text, 'Keep neighbor post');
  assert.equal(saved.updates[0].hidden, true);
  assert.equal(saved.comments[0].text, 'Keep neighbor reply');
  assert.equal(saved.comments.length, 1);
  assert.equal(saved.projects[0].name, 'Neighbor project');
  assert.equal(saved.tasks[0].title, 'Keep neighbor task');
  assert.equal(saved.tasks[0].assignee, null);
  for (const key of [
    'parcels',
    'analysisJobs',
    'observations',
    'assessments',
    'agreements',
    'evidence',
    'blocks',
  ])
    assert.equal(saved[key].length, 0, key);
  assert.equal(saved.authority, null);
  assert.equal(saved.invitations[0].label, 'Keep invite');
  assert.equal(saved.events[0].rsvps.length, 1);
  assert.equal(saved.events[0].rsvps[0].userId, f.other.id);
  assert.equal(saved.audit[1].requestHash, 'keep-retry-hash');
  assert.equal(saved.erasure.auditCommitmentsReset, true);
  assert.equal(
    saved.proposals[0].shares.reduce((n, m) => n + m.shareBps, 0),
    10000,
  );
  assert.equal(saved.proposals[0].votes[0].memberId, saved.members[1].id);
  assert.equal(saved.proposals[0].electorate[0], saved.members[1].id);
  assert.equal(result.sanitizedWorkspaces, 1);
});

await test('financial erasure keeps conserved numbers but blocks further issuance, settlement, allocation and payment mutations', (t) => {
  const f = fixture(t),
    s = f.workspace(f.other),
    member = addMember(s, f.user, 'Person Erased');
  const own = { createdBy: f.user.id, createdAt: now };
  s.lots.push({
    id: 'lot',
    ...own,
    units: 12,
    serialStart: 10,
    serialEnd: 21,
    unit: 'tCO2e',
    registry: 'PRIVATE registry',
    program: 'PRIVATE program',
    serialPrefix: 'PRIVATE prefix',
    status: 'reviewed',
  });
  s.settlements.push({
    id: 'settlement',
    ...own,
    lotId: 'lot',
    units: 10,
    cents: 1001,
    currency: 'USD',
    reference: 'PRIVATE receipt',
    status: 'reviewed',
  });
  s.allocations.push({
    id: 'allocation',
    ...own,
    settlementId: 'settlement',
    status: 'approved',
    amounts: {
      grossCents: 1001,
      stewardshipCents: 100,
      treasuryCents: 100,
      memberPoolCents: 801,
      platformCutCents: 0,
      members: [
        { id: member.id, name: 'Person Erased', cents: 401 },
        { id: s.members[0].id, name: 'Neighbor Retained', cents: 400 },
      ],
    },
    payments: [
      {
        id: 'payment',
        memberId: member.id,
        createdBy: f.other.id,
        cents: 401,
        reference: 'PRIVATE bank details',
        status: 'reviewed',
      },
    ],
  });
  s.retirements.push({
    id: 'retirement',
    ...own,
    settlementId: 'settlement',
    units: 2,
    beneficiary: 'PRIVATE beneficiary',
    status: 'reviewed',
  });
  const { state } = eraseWorkspaceState(s, f.user.id, now + 1);
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE|Person Erased/);
  assert.equal(state.lots[0].units, 12);
  assert.equal(state.settlements[0].cents, 1001);
  assert.equal(state.retirements[0].units, 2);
  const amounts = state.allocations[0].amounts;
  assert.equal(
    amounts.members.reduce((n, m) => n + m.cents, 0) +
      amounts.stewardshipCents +
      amounts.treasuryCents,
    amounts.grossCents,
  );
  assert.equal(amounts.members[1].name, 'Neighbor Retained');
  assert.equal(state.allocations[0].payments[0].cents, 401);
  for (const op of [
    'record_lot',
    'review_lot',
    'record_settlement',
    'review_settlement',
    'create_allocation',
    'approve_allocation',
    'record_payment',
    'review_payment',
    'record_retirement',
    'review_retirement',
  ])
    assert.throws(
      () => applyCommand(state, f.other, { op }),
      (e) => e.status === 409 && /paused/.test(e.message),
      op,
    );
  const usable = applyCommand(state, f.other, {
    op: 'create_project',
    payload: {
      name: 'Still usable',
      summary: 'Community work',
      region: 'Local',
      kind: 'restoration',
    },
  });
  assert.equal(usable.projects.at(-1).name, 'Still usable');
});

await test('archived shared workspace is anonymized; unrelated workspace is byte-for-byte preserved', (t) => {
  const f = fixture(t),
    archived = f.workspace(),
    unrelated = f.workspace(f.other);
  addMember(archived, f.other, 'Neighbor Retained');
  archived.visibility = 'archived';
  f.save(archived);
  f.save(unrelated);
  const before = f.db
    .prepare('SELECT * FROM workspaces WHERE id=?')
    .get(unrelated.id);
  f.close();
  const after = JSON.parse(
    f.db
      .prepare('SELECT state_json FROM workspaces WHERE id=?')
      .get(archived.id).state_json,
  );
  assert.equal(after.visibility, 'archived');
  assert.match(after.ownerId, /^erased-/);
  assert.equal(after.members[1].name, 'Neighbor Retained');
  assert.deepEqual(
    f.db.prepare('SELECT * FROM workspaces WHERE id=?').get(unrelated.id),
    before,
  );
});

await test('rolled-back deletion intent cannot erase an account on later replay', (t) => {
  const f = fixture(t),
    s = f.workspace();
  f.save(s);
  f.db.exec('BEGIN IMMEDIATE');
  eraseAccountData(f.db, f.user.id, now, {
    ledgerDirectory: f.ledgerDirectory,
  });
  f.db.exec('ROLLBACK');
  assert.deepEqual(readdirSync(f.ledgerDirectory), [`${f.user.id}.pending`]);
  assert.throws(
    () => replayErasureLedger(f.db, { ledgerDirectory: f.ledgerDirectory }),
    /Unexpected deletion ledger entry/,
  );
  assert.deepEqual(recoverErasureIntents(f.db, f.ledgerDirectory), {
    committed: 0,
    discarded: 1,
  });
  assert.equal(
    replayErasureLedger(f.db, { ledgerDirectory: f.ledgerDirectory })
      .replayedAccounts,
    0,
  );
  assert.ok(f.db.prepare('SELECT id FROM users WHERE id=?').get(f.user.id));
  assert.ok(f.db.prepare('SELECT id FROM workspaces WHERE id=?').get(s.id));
});

await test('startup finalizes committed database erasure after crash before ledger rename', (t) => {
  const f = fixture(t),
    s = f.workspace();
  f.save(s);
  f.db.exec('BEGIN IMMEDIATE');
  eraseAccountData(f.db, f.user.id, now, {
    ledgerDirectory: f.ledgerDirectory,
  });
  f.db.prepare('DELETE FROM users WHERE id=?').run(f.user.id);
  f.db.exec('COMMIT');
  assert.deepEqual(recoverErasureIntents(f.db, f.ledgerDirectory), {
    committed: 1,
    discarded: 0,
  });
  assert.deepEqual(readdirSync(f.ledgerDirectory), [`${f.user.id}.json`]);
  assert.equal(
    replayErasureLedger(f.db, { ledgerDirectory: f.ledgerDirectory })
      .replayedAccounts,
    0,
  );
});

await test('newest committed ledger removes an account, tokens and shared contributions resurrected by an older snapshot', (t) => {
  const f = fixture(t),
    s = f.workspace();
  addMember(s, f.other, 'Neighbor Retained');
  f.save(s);
  f.db
    .prepare('INSERT INTO sessions VALUES (?,?,?)')
    .run('old-session', f.user.id, now + 1000);
  f.db
    .prepare('INSERT INTO api_tokens VALUES (?,?,?,?,?,?,?)')
    .run(
      'old-token',
      'old-hash',
      f.user.id,
      'PRIVATE device',
      '[]',
      now + 1000,
      now,
    );
  writeFileSync(
    join(f.ledgerDirectory, `${f.user.id}.json`),
    JSON.stringify({ schema: 1, userId: f.user.id, requestedAt: now + 1 }),
  );
  assert.deepEqual(
    replayErasureLedger(f.db, {
      ledgerDirectory: f.ledgerDirectory,
      now: now + 2,
    }),
    { ledgerEntries: 1, replayedAccounts: 1 },
  );
  assert.equal(
    f.db.prepare('SELECT count(*) AS n FROM users WHERE id=?').get(f.user.id).n,
    0,
  );
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM api_tokens').get().n, 0);
  const restored = JSON.parse(
    f.db.prepare('SELECT state_json FROM workspaces WHERE id=?').get(s.id)
      .state_json,
  );
  assert.equal(restored.visibility, 'archived');
  assert.equal(restored.members[1].name, 'Neighbor Retained');
  assert.ok(!JSON.stringify(restored).includes(f.user.id));
  assert.equal(
    replayErasureLedger(f.db, { ledgerDirectory: f.ledgerDirectory })
      .replayedAccounts,
    0,
  );
});

await test('bad JSON, path traversal, unexpected ledger fields and symlinks fail closed', (t) => {
  const f = fixture(t),
    s = f.workspace();
  f.save(s);
  const a = asset(f, s);
  f.db
    .prepare('UPDATE assets SET object_key=? WHERE id=?')
    .run('../../outside', a.id);
  assert.throws(() => f.close(), /Unsafe evidence object key/);
  assert.deepEqual(readdirSync(f.ledgerDirectory), []);
  f.db.prepare('DELETE FROM assets').run();
  f.db
    .prepare('UPDATE workspaces SET state_json=? WHERE id=?')
    .run('{bad', s.id);
  assert.throws(() => f.close(), SyntaxError);
  assert.deepEqual(readdirSync(f.ledgerDirectory), []);
  assert.throws(
    () =>
      eraseAccountData(f.db, '../../outside', now, {
        ledgerDirectory: f.ledgerDirectory,
      }),
    /identity/,
  );
  const path = join(f.ledgerDirectory, `${f.user.id}.json`);
  writeFileSync(
    path,
    JSON.stringify({
      schema: 1,
      userId: f.user.id,
      requestedAt: now,
      password: 'must not be stored',
    }),
  );
  assert.throws(
    () => replayErasureLedger(f.db, { ledgerDirectory: f.ledgerDirectory }),
    /Invalid deletion ledger/,
  );
  rmSync(path);
  const outside = join(f.directory, 'outside');
  writeFileSync(
    outside,
    JSON.stringify({ schema: 1, userId: f.user.id, requestedAt: now }),
  );
  symlinkSync(outside, path);
  assert.throws(
    () => replayErasureLedger(f.db, { ledgerDirectory: f.ledgerDirectory }),
    /Unsafe deletion ledger/,
  );
});

await test('database guards reject late workspace creation, membership acceptance and uploads after account closure', (t) => {
  const f = fixture(t),
    surviving = f.workspace(f.other);
  f.save(surviving);
  const staleJoined = structuredClone(surviving);
  addMember(staleJoined, f.user, 'Person Erased');
  f.close();
  assert.throws(
    () => f.save(f.workspace()),
    /Account is no longer available|Deleted account cannot rejoin/,
  );
  assert.throws(
    () =>
      f.db
        .prepare('UPDATE workspaces SET state_json=? WHERE id=?')
        .run(JSON.stringify(staleJoined), surviving.id),
    /Deleted account cannot rejoin/,
  );
  assert.throws(() => asset(f, surviving), /Active membership is required/);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM assets').get().n, 0);
  assert.equal(
    JSON.parse(
      f.db
        .prepare('SELECT state_json FROM workspaces WHERE id=?')
        .get(surviving.id).state_json,
    ).members.length,
    1,
  );
});

await test('initial co-op fields follow the original founder after handover without erasing a successor edit', (t) => {
  const f = fixture(t),
    s = f.workspace();
  s.name = 'PRIVATE founder home';
  s.region = 'PRIVATE address';
  s.summary = 'PRIVATE notes';
  s.country = 'PRIVATE original setting';
  addMember(s, f.other, 'Neighbor Retained');
  s.ownerId = f.other.id;
  s.audit.push({
    id: randomUUID(),
    sequence: 1,
    action: 'transfer_stewardship',
    actorId: f.user.id,
    at: now,
  });
  const first = eraseWorkspaceState(s, f.user.id, now + 1).state;
  assert.doesNotMatch(JSON.stringify(first), /PRIVATE/);
  s.name = 'Keep successor name';
  s.region = 'Keep successor region';
  s.summary = 'Keep successor summary';
  s.audit.push({
    id: randomUUID(),
    sequence: 2,
    action: 'update_coop',
    actorId: f.other.id,
    at: now + 1,
  });
  const next = eraseWorkspaceState(s, f.user.id, now + 2).state;
  assert.equal(next.name, 'Keep successor name');
  assert.equal(next.region, 'Keep successor region');
});

await test('missing or incomplete committed ledger stops startup and replay rather than silently losing deletion protection', (t) => {
  const f = fixture(t);
  f.save(f.workspace());
  f.close();
  rmSync(join(f.ledgerDirectory, `${f.user.id}.json`));
  assert.throws(
    () => recoverErasureIntents(f.db, f.ledgerDirectory),
    /incomplete/,
  );
  assert.throws(
    () => replayErasureLedger(f.db, { ledgerDirectory: f.ledgerDirectory }),
    /incomplete/,
  );
  rmSync(f.ledgerDirectory, { recursive: true });
  assert.throws(
    () => recoverErasureIntents(f.db, f.ledgerDirectory),
    /missing/,
  );
});

await test('deletion removes authored and ambiguous legacy cancellation reasons but preserves attributed neighbor cancellation notes', (t) => {
  const f = fixture(t),
    s = f.workspace(f.other);
  addMember(s, f.user, 'Person Erased');
  s.events = [
    {
      id: 'authored',
      createdBy: f.other.id,
      cancelledBy: f.user.id,
      cancelReason: 'PRIVATE cancellation',
      rsvps: [],
    },
    {
      id: 'legacy',
      createdBy: f.other.id,
      cancelReason: 'PRIVATE untracked old cancellation',
      rsvps: [],
    },
    {
      id: 'neighbor',
      createdBy: f.other.id,
      cancelledBy: f.other.id,
      cancelReason: 'Keep neighbor cancellation',
      rsvps: [],
    },
  ];
  s.audit.push({
    id: 'cancel-op',
    actorId: f.user.id,
    action: 'cancel_event',
    at: now,
  });
  const { state } = eraseWorkspaceState(s, f.user.id, now + 1);
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE/);
  assert.equal(state.events[2].cancelReason, 'Keep neighbor cancellation');
});

await test('deletion-ledger replay removes restored provider links and queues authorization revocation', (t) => {
  const f = fixture(t);
  f.db
    .prepare('INSERT INTO social_identities VALUES (?,?,?,?,?)')
    .run(
      'apple',
      'provider-subject',
      f.user.id,
      'encrypted-revocation-token',
      'hashed-subject',
    );
  writeFileSync(
    join(f.ledgerDirectory, `${f.user.id}.json`),
    JSON.stringify({ schema: 1, userId: f.user.id, requestedAt: now }),
  );
  replayErasureLedger(f.db, { ledgerDirectory: f.ledgerDirectory });
  assert.equal(
    f.db.prepare('SELECT count(*) n FROM social_identities').get().n,
    0,
  );
  assert.equal(
    f.db.prepare('SELECT count(*) n FROM social_revocations').get().n,
    1,
  );
  assert.equal(
    f.db.prepare('SELECT count(*) n FROM social_identity_tombstones').get().n,
    1,
  );
  replayErasureLedger(f.db, { ledgerDirectory: f.ledgerDirectory });
  assert.equal(
    f.db.prepare('SELECT count(*) n FROM social_revocations').get().n,
    1,
  );
});
