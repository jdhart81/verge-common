import http from 'node:http';
import { PUBLIC_ROUTES } from '../scripts/launch-gate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  GATES,
  evaluateReadiness,
  validateManifest,
} from '../scripts/pilot-readiness.mjs';
const exec = promisify(execFile);
const commit = 'a'.repeat(40),
  config = 'synthetic-config-v1';
const now = Date.parse('2026-10-03T16:00:00.000Z');
const stamp = (age = 1000) => new Date(now - age).toISOString();
function fixture() {
  const manifest = {
    schema: 1,
    environment: 'staging',
    targetOrigin: 'http://127.0.0.1:3100',
    candidateCommit: commit,
    operatingConfig: config,
    scope: { providers: true, reminders: true },
    custody: Object.fromEntries(
      ['backup', 'apple', 'vault'].map((key) => [
        key,
        { credentialRef: `${key}-v1`, custodian: 'synthetic-operator-b' },
      ]),
    ),
    gates: [],
  };
  manifest.gates = Object.entries(GATES).map(([id, rule]) => ({
    id,
    result: 'PASS',
    time: stamp(),
    evidenceRef: 'synthetic-receipt',
    reviewer: 'synthetic-reviewer-a',
    operator: 'synthetic-operator-b',
    ...(rule.custody
      ? { credentialRef: manifest.custody[rule.custody].credentialRef }
      : {
          candidateCommit: commit,
          deployedCommit: commit,
          operatingConfig: config,
        }),
  }));
  return manifest;
}
const evaluate = (manifest, options = {}) =>
  evaluateReadiness(manifest, {
    candidateCommit: commit,
    environment: 'staging',
    operatingConfig: config,
    origin: 'http://127.0.0.1:3100',
    now,
    deployedCommit: commit,
    automated: [
      ...PUBLIC_ROUTES.map((path) => ({
        gate: 'BL-17',
        name: `route ${path}`,
        status: 'PASS',
      })),
      { gate: 'BL-01', name: 'build commit', status: 'PASS' },
      ...[
        'no placeholder sign-in buttons',
        'Apple client secret',
        'single contact address',
        'no unbuilt promises in public copy',
        'terms required at sign-up',
      ].map((name) => ({ gate: 'BL-02', name, status: 'PASS' })),
    ],
    ...options,
  });
const row = (report, id) => report.gates.find((gate) => gate.id === id);

await test('complete synthetic evidence qualifies review; post-pilot completion and announcement stay separate', () => {
  const report = evaluate(fixture());
  assert.equal(report.eligibleForPilotReview, true);
  assert.equal(report.postPilot.requiredForStart, false);
  assert.equal(report.postPilot.result, 'UNVERIFIED');
  assert.equal(report.broaderAnnouncement.result, 'UNVERIFIED');
  assert.doesNotMatch(
    JSON.stringify(report),
    /synthetic-receipt|synthetic-operator/,
  );
});

await test('missing human evidence blocks even with green automated checks; explicit failure remains failure', () => {
  const manifest = fixture();
  manifest.gates = [];
  assert.equal(evaluate(manifest).eligibleForPilotReview, false);
  assert.equal(row(evaluate(manifest), 'owner-go-no-go').result, 'UNVERIFIED');
  manifest.gates = [{ id: 'owner-go-no-go', result: 'FAIL' }];
  assert.equal(row(evaluate(manifest), 'owner-go-no-go').result, 'FAIL');
  for (const options of [
    { automated: [{ gate: 'BL-01', name: 'build commit', status: 'PASS' }] },
    { automated: [] },
    { automated: null },
    { automated: [{ gate: 'BL-01', status: 'FAIL' }] },
    { deployedCommit: commit.slice(0, 7) },
    { deployedCommit: 'b'.repeat(40) },
  ])
    assert.equal(evaluate(fixture(), options).eligibleForPilotReview, false);
});

await test('bounded schema rejects malformed, duplicate, unknown gates and forbidden content without echo', () => {
  const cases = [
    null,
    [],
    { ...fixture(), schema: 2 },
    { ...fixture(), privateBody: 'SECRET PRIVATE' },
  ];
  for (const field of ['time', 'evidenceRef', 'operator', 'candidateCommit']) {
    const manifest = fixture();
    manifest.gates[0][field] = 'SECRET PRIVATE https://credentials.example/';
    cases.push(manifest);
  }
  const unknown = fixture();
  unknown.gates[0].id = 'BL-13';
  cases.push(unknown);
  const duplicate = fixture();
  duplicate.gates[1] = duplicate.gates[0];
  cases.push(duplicate);
  const excess = fixture();
  excess.gates.push(excess.gates[0]);
  cases.push(excess);
  const badDate = fixture();
  badDate.gates[0].time = '2026-02-30T16:00:00.000Z';
  cases.push(badDate);
  const numeric = fixture();
  numeric.operatingConfig = 123;
  cases.push(numeric);
  for (const input of cases)
    assert.throws(() => validateManifest(input), /^Error: INVALID_INPUT$/);
});

await test('each gate requires dated evidence, opaque reference, reviewer and operator', () => {
  for (const id of Object.keys(GATES))
    for (const field of ['time', 'evidenceRef', 'reviewer', 'operator']) {
      const manifest = fixture();
      delete manifest.gates.find((gate) => gate.id === id)[field];
      assert.equal(
        row(evaluate(manifest), id).result,
        'UNVERIFIED',
        `${id} ${field}`,
      );
    }
});

await test('24h backup, 30d restore and 2h operations have independent freshness, with no future tolerance', () => {
  for (const [id, rule] of Object.entries(GATES)) {
    const manifest = fixture(),
      gate = manifest.gates.find((item) => item.id === id);
    gate.time = stamp(rule.age + 1);
    assert.equal(row(evaluate(manifest), id).result, 'UNVERIFIED', id);
    gate.time = stamp(-1);
    assert.equal(row(evaluate(manifest), id).result, 'UNVERIFIED', id);
    gate.time = stamp(rule.age);
    assert.equal(
      row(evaluate(manifest), id).result,
      rule.exclusive ? 'UNVERIFIED' : 'PASS',
      id,
    );
  }
  const manifest = fixture();
  manifest.gates.find((gate) => gate.id === 'operations-under-2h').time = stamp(
    3 * 3600000,
  );
  assert.equal(row(evaluate(manifest), 'backup-under-24h').result, 'PASS');
  assert.equal(evaluate(manifest).eligibleForPilotReview, false);
});

await test('release evidence binds exact candidate, deployed build and operating configuration', () => {
  for (const options of [
    { origin: 'http://127.0.0.1:3999' },
    { candidateCommit: 'b'.repeat(40) },
    { environment: 'production' },
    { operatingConfig: 'changed-config' },
  ])
    assert.equal(evaluate(fixture(), options).eligibleForPilotReview, false);
  for (const field of [
    'candidateCommit',
    'deployedCommit',
    'operatingConfig',
  ]) {
    const manifest = fixture();
    manifest.gates[0][field] =
      field === 'operatingConfig' ? 'new-config' : 'b'.repeat(40);
    assert.equal(
      row(evaluate(manifest), 'release-checks').result,
      'UNVERIFIED',
    );
  }
  const manifest = fixture();
  manifest.gates.find(
    (gate) => gate.id === 'alert-failure-recovery',
  ).operatingConfig = 'old-config';
  assert.equal(
    row(evaluate(manifest), 'alert-failure-recovery').result,
    'UNVERIFIED',
  );
});

await test('custody carries across code-only releases but a credential or custodian change invalidates it', () => {
  const manifest = fixture(),
    changed = 'b'.repeat(40);
  manifest.candidateCommit = changed;
  for (const gate of manifest.gates)
    if (gate.candidateCommit)
      gate.candidateCommit = gate.deployedCommit = changed;
  assert.equal(
    evaluate(manifest, { candidateCommit: changed, deployedCommit: changed })
      .eligibleForPilotReview,
    true,
  );
  for (const key of ['backup', 'apple', 'vault'])
    for (const field of ['credentialRef', 'custodian']) {
      const altered = fixture();
      altered.custody[key][field] = 'changed';
      assert.equal(
        row(evaluate(altered), `custody-${key}`).result,
        'UNVERIFIED',
      );
    }
});

await test('NOT_APPLICABLE is explicit, dated and limited to excluded provider/reminder scope', () => {
  const manifest = fixture();
  manifest.gates[0].result = 'NOT_APPLICABLE';
  assert.equal(evaluate(manifest).eligibleForPilotReview, false);
  manifest.gates[0].result = 'PASS';
  manifest.scope = { providers: false, reminders: false };
  assert.equal(evaluate(manifest).eligibleForPilotReview, false);
  for (const id of ['provider-revocation', 'reminder-device-display'])
    manifest.gates.find((gate) => gate.id === id).result = 'NOT_APPLICABLE';
  assert.equal(evaluate(manifest).eligibleForPilotReview, true);
  delete manifest.gates.find((gate) => gate.id === 'provider-revocation').time;
  assert.equal(evaluate(manifest).eligibleForPilotReview, false);
});

await test('CLI missing/malformed/oversize and unknown args exit 2 without leaking input; absent launch observation exits 1', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'verge-pilot-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'private.json');
  const args = [
    'scripts/pilot-readiness.mjs',
    '--manifest',
    path,
    '--candidate',
    commit,
    '--environment',
    'staging',
    '--config',
    config,
    '--json',
  ];
  for (const contents of [
    '{"password":"SECRET PRIVATE"}',
    '{SECRET PRIVATE',
    'SECRET PRIVATE'.repeat(3000),
  ]) {
    await writeFile(path, contents);
    await assert.rejects(
      exec(process.execPath, args),
      (error) =>
        error.code === 2 && !/SECRET|PRIVATE/.test(error.stdout + error.stderr),
    );
  }
  await rm(path);
  await assert.rejects(
    exec(process.execPath, args),
    (error) => error.code === 2 && !error.stderr.includes(path),
  );
  await writeFile(path, JSON.stringify(fixture()));
  await assert.rejects(
    exec(process.execPath, [...args, '--unknown', 'SECRET']),
    (error) => error.code === 2 && !error.stderr.includes('SECRET'),
  );
  await assert.rejects(
    exec(process.execPath, args),
    (error) =>
      error.code === 1 &&
      JSON.parse(error.stdout).eligibleForPilotReview === false,
  );
});

await test('CLI reuses all launch checks against explicit loopback target and rejects a build switch', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'verge-pilot-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let healthReads = 0,
    switchBuild = false;
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      healthReads++;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          status: 'ok',
          commit: switchBuild && healthReads >= 3 ? 'b'.repeat(40) : commit,
        }),
      );
    } else {
      res.setHeader('content-type', 'text/html');
      res.end(
        '<p>Contact justin@viridisconservation.com</p><input name="acceptTerms" required>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const origin = `http://127.0.0.1:${server.address().port}`;
  const manifest = fixture();
  manifest.targetOrigin = origin;
  for (const gate of manifest.gates)
    gate.time = new Date(Date.now() - 1000).toISOString();
  const path = join(directory, 'private.json');
  await writeFile(path, JSON.stringify(manifest));
  const args = [
    'scripts/pilot-readiness.mjs',
    '--manifest',
    path,
    '--candidate',
    commit,
    '--environment',
    'staging',
    '--config',
    config,
    '--origin',
    origin,
    '--json',
  ];
  const { stdout } = await exec(process.execPath, args);
  const report = JSON.parse(stdout);
  assert.equal(report.eligibleForPilotReview, true);
  assert.equal(report.deployedCommit, commit);
  assert.ok(
    report.automatedChecks.some(
      (row) =>
        row.name === 'terms required at sign-up' && row.result === 'PASS',
    ),
  );
  assert.doesNotMatch(stdout, /synthetic-receipt|synthetic-operator/);
  healthReads = 0;
  switchBuild = true;
  await assert.rejects(
    exec(process.execPath, args),
    (error) =>
      error.code === 1 && JSON.parse(error.stdout).deployedCommit === null,
  );
});

await test('independent privacy and second-operator rehearsal cannot be self-reviewed', () => {
  for (const id of [
    'privacy-access-review',
    'two-operators-report-rehearsal',
  ]) {
    const manifest = fixture(),
      gate = manifest.gates.find((item) => item.id === id);
    gate.reviewer = gate.operator;
    assert.equal(row(evaluate(manifest), id).result, 'UNVERIFIED');
  }
});
