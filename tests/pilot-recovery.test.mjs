import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, cp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { openDatabase, objectStore } from '../self-hosted/storage.mjs';
import { createAuth } from '../self-hosted/auth.mjs';
import { createSafety } from '../self-hosted/safety.mjs';
import { newWorkspace, memberView, publicWorkspace } from '../lib/network.mjs';
import {
  initializeErasure,
  eraseAccountData,
  commitErasureIntent,
  drainErasureFiles,
} from '../self-hosted/erasure.mjs';
import { checkBackup } from '../self-hosted/restore-check.mjs';
const execute = promisify(execFile),
  repository = resolve(import.meta.dirname, '..');
const password = 'Synthetic isolated recovery password 123!';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

// The private Python bridge uses the existing encryption/rehearsal functions.
// It writes only synthetic ciphertext/key material into the disposable fixture.
const rehearsal = `
import importlib.util, pathlib, json, sys, tarfile, shutil, os
root, source, latest, node, repository = sys.argv[1:]
os.umask(0o077)
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); return mod
ops = load('ops', pathlib.Path(repository)/'self-hosted/operations.py')
remote = load('remote', pathlib.Path(repository)/'self-hosted/operations_remote.py')
root = pathlib.Path(root); state = root/'rehearsal'; state.mkdir(mode=0o700)
key = state/'synthetic.key'; key.write_text('synthetic-test-only-'*5)
home = state/'gpg'; home.mkdir(mode=0o700)
config = {'gpg':shutil.which('gpg'), 'gpgHome':str(home), 'keyFile':str(key), 'node':node, 'repository':repository, 'stateDirectory':str(state), 'restoreChecker':str(pathlib.Path(repository)/'self-hosted/restore-check.mjs'), 'erasureReplay':str(pathlib.Path(repository)/'self-hosted/erasure.mjs')}
def ledger(directory):
    entries = [(p.name,p.read_bytes()) for p in sorted(pathlib.Path(directory).iterdir())]
    return {'schema':1,'entries':len(entries),'sha256':remote.ledger_digest(entries)}
for label, directory in [('snapshot',str(pathlib.Path(source)/'deletion-ledger')), ('latest',latest)]:
    receipt = state/(label+'-receipt.json'); receipt.write_text(json.dumps(ledger(directory)))
    archive = state/(label+'.tar.gz')
    with tarfile.open(archive,'w:gz') as out:
        if label == 'snapshot': out.add(source, arcname='snapshot')
        out.add(directory, arcname='erasure-ledger'); out.add(receipt, arcname='ledger-receipt.json')
    with archive.open('rb') as inp: ops.encrypt_stream(config, inp, state/(label+'.gpg'))
result = ops.rehearse(config, state/'snapshot.gpg', state/'latest.gpg', ledger(latest)['sha256'])
assert result['currentLedgerInstalled'] and not result['productionChanged']
assert result['erasureReplay']['replayedAccounts'] == 1 and result['erasureReplay']['deletedFiles'] == 1
assert not list(state.glob('restore-*'))
print(json.dumps({'status':'passed','replayedAccounts':1,'deletedFiles':1,'temporaryPlaintextRemoved':True,'productionChanged':False}))
`;

await test('encrypted older snapshot with evidence plus later committed ledger restores without resurrecting account/files', async (t) => {
  const root = await mkdtemp('/tmp/verge-pilot-recovery-');
  t.after(() => rm(root, { recursive: true, force: true }));
  const data = join(root, 'synthetic-live'),
    ledger = join(data, 'deletion-ledger');
  await mkdir(ledger, { recursive: true, mode: 0o700 });
  const db = openDatabase(join(data, 'vergecommon.sqlite'));
  let closed = false;
  t.after(() => {
    if (!closed) db.close();
  });
  const auth = createAuth(db),
    user = (
      await auth.register({
        username: 'erasedfixture',
        displayName: 'Synthetic erased',
        password,
      })
    ).user;
  const retained = (
    await auth.register({
      username: 'retainedfixture',
      displayName: 'Synthetic retained',
      password,
    })
  ).user;
  const workspace = newWorkspace(
    {
      name: 'Private synthetic drill',
      region: 'Synthetic',
      summary: 'Synthetic only',
      displayName: 'Synthetic retained',
    },
    retained,
    Date.now(),
    randomUUID(),
  );
  workspace.members.push({
    id: randomUUID(),
    userId: user.id,
    name: 'Synthetic erased',
    role: 'member',
    status: 'active',
    joinedAt: Date.now(),
  });
  db.prepare('INSERT INTO workspaces VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    workspace.id,
    retained.id,
    workspace.name,
    workspace.region,
    workspace.summary,
    'private',
    JSON.stringify(workspace),
    0,
    Date.now(),
    Date.now(),
  );
  initializeErasure(db);
  const store = objectStore(join(data, 'evidence')),
    asset = randomUUID(),
    key = `private/${workspace.id}/${asset}`,
    bytes = Buffer.from('Synthetic erased evidence');
  await store.put(key, bytes);
  db.prepare('INSERT INTO assets VALUES (?,?,?,?,?,?,?,?,?)').run(
    asset,
    workspace.id,
    user.id,
    key,
    'synthetic.txt',
    'text/plain',
    hash(bytes),
    bytes.length,
    Date.now(),
  );
  const { stdout } = await execute(
    process.execPath,
    ['self-hosted/backup.mjs'],
    {
      cwd: repository,
      env: {
        ...process.env,
        VERGE_DATA_DIR: data,
        VERGE_BACKUP_DIR: join(root, 'snapshots'),
      },
    },
  );
  const snapshot = JSON.parse(stdout).directory;
  assert.equal((await checkBackup(snapshot)).verifiedEvidenceFiles, 1);
  const originalHash = hash(
    await readFile(join(snapshot, 'vergecommon.sqlite')),
  );
  db.exec('BEGIN IMMEDIATE');
  eraseAccountData(db, user.id, Date.now(), { ledgerDirectory: ledger });
  db.prepare('DELETE FROM users WHERE id=?').run(user.id);
  db.exec('COMMIT');
  commitErasureIntent(ledger, user.id);
  assert.equal((await drainErasureFiles(db, store)).deletedFiles, 1);
  const result = await execute(
    'python3',
    ['-c', rehearsal, root, snapshot, ledger, process.execPath, repository],
    { timeout: 60000 },
  );
  assert.deepEqual(JSON.parse(result.stdout), {
    status: 'passed',
    replayedAccounts: 1,
    deletedFiles: 1,
    temporaryPlaintextRemoved: true,
    productionChanged: false,
  });
  assert.equal(
    hash(await readFile(join(snapshot, 'vergecommon.sqlite'))),
    originalHash,
  );
  // Independently exercise the same supported auth/storage on restored state.
  const restored = join(root, 'synthetic-restored');
  await cp(snapshot, restored, { recursive: true });
  await rm(join(restored, 'deletion-ledger'), { recursive: true });
  await cp(ledger, join(restored, 'deletion-ledger'), { recursive: true });
  const replayArgs = [
    'self-hosted/erasure.mjs',
    '--replay',
    '--data',
    restored,
    '--ledger',
    join(restored, 'deletion-ledger'),
  ];
  assert.equal(
    JSON.parse((await execute(process.execPath, replayArgs)).stdout)
      .replayedAccounts,
    1,
  );
  assert.equal(
    JSON.parse((await execute(process.execPath, replayArgs)).stdout)
      .replayedAccounts,
    0,
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    const recovered = openDatabase(join(restored, 'vergecommon.sqlite'));
    try {
      const recoveredAuth = createAuth(recovered);
      await assert.rejects(
        recoveredAuth.login({ username: 'erasedfixture', password }),
      );
      assert.equal(
        (await recoveredAuth.login({ username: 'retainedfixture', password }))
          .user.id,
        retained.id,
      );
      assert.equal(
        await objectStore(join(restored, 'evidence')).get(key),
        null,
      );
      assert.equal(
        recovered.prepare('SELECT count(*) n FROM assets').get().n,
        0,
      );
      const saved = JSON.parse(
        recovered.prepare('SELECT state_json FROM workspaces').get().state_json,
      );
      assert.ok(memberView(saved, retained.id));
      assert.doesNotMatch(
        JSON.stringify(publicWorkspace(saved)),
        /Synthetic erased|Synthetic retained/,
      );
      assert.ok(!JSON.stringify(saved).includes(user.id));
    } finally {
      recovered.close();
    }
  }
  db.close();
  closed = true;
  assert.equal(
    (await readdir(root)).some((name) =>
      name.startsWith('vergecommon-restore-check-'),
    ),
    false,
  );
});

await test('existing rollback guard refuses participation and operator safety state without modifying data', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'verge-pilot-rollback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const db = openDatabase(join(root, 'vergecommon.sqlite'));
  db.prepare('INSERT INTO workspaces VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    'fixture',
    'user',
    'Synthetic',
    'Synthetic',
    '',
    'private',
    '{}',
    0,
    1,
    1,
  );
  for (const state of [
    { careActions: [{}] },
    { events: [{ result: {} }] },
    { members: [{ referralId: 'synthetic' }] },
    { operatorRestriction: {} },
    { updates: [{ operatorHidden: true }] },
    { comments: [{ operatorHidden: true }] },
    { events: [{ operatorHidden: true }] },
  ]) {
    db.prepare('UPDATE workspaces SET state_json=?').run(JSON.stringify(state));
    const before = db.prepare('SELECT * FROM workspaces').all();
    await assert.rejects(
      execute(process.execPath, ['self-hosted/rollback-check.mjs', root]),
      (error) => error.code === 1 && /forward repair/.test(error.stderr),
    );
    assert.deepEqual(db.prepare('SELECT * FROM workspaces').all(), before);
  }
  db.close();
});

await test('synthetic founding-steward complaint has independent operator triage and private visible result', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'verge-pilot-report-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const db = openDatabase(join(root, 'vergecommon.sqlite'));
  t.after(() => db.close());
  createAuth(db);
  const safety = createSafety(db);
  const requestId = randomUUID(),
    receipt = 'b'.repeat(64);
  const report = safety.submit({
    requestId,
    receipt,
    kind: 'general',
    category: 'other',
    reason:
      'Synthetic complaint about founding steward; independent operator review requested.',
  });
  assert.equal(report.status, 'received');
  const result = safety.resolve({
    id: requestId,
    action: 'review',
    operator: 'synthetic-second-operator',
    note: 'Independent synthetic triage; escalating founding-steward conflict.',
  });
  assert.equal(result.status, 'reviewing');
  const visible = safety.status({ id: requestId, receipt });
  assert.deepEqual(Object.keys(visible).sort(), ['id', 'status', 'updatedAt']);
  assert.equal(visible.status, 'reviewing');
  assert.doesNotMatch(
    JSON.stringify(visible),
    /complaint|founding|operator|reason|note/,
  );
});
