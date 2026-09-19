import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createAuth } from '../self-hosted/auth.mjs';
import { createGateway } from '../self-hosted/server.mjs';
import { createSafety } from '../self-hosted/safety.mjs';
import { newWorkspace } from '../lib/network.mjs';

const origin = 'https://vergecommon.test';
const password = 'Synthetic gateway safety password 123!';
async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}
const close = (server) =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  });
function input(extra = {}) {
  return {
    requestId: randomUUID(),
    receipt: randomBytes(32).toString('hex'),
    kind: 'general',
    category: 'privacy',
    reason:
      'Please review this synthetic example of a community safety concern.',
    ...extra,
  };
}
async function fixture(t) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(
    readFileSync(
      new URL('../drizzle/0000_famous_nighthawk.sql', import.meta.url),
      'utf8',
    ),
  );
  const auth = createAuth(db);
  const registration = await auth.register({
    username: 'fixture',
    displayName: 'Fixture',
    password,
  });
  const safety = createSafety(db);
  const upstream = http.createServer((req, res) => {
    if (req.url === '/api/workspaces') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"workspaces":[]}');
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"error":"Not found"}');
  });
  const { server } = createGateway({
    origin,
    upstreamPort: await listen(upstream),
    auth,
    safety,
  });
  const port = await listen(server);
  t.after(async () => {
    await close(server);
    await close(upstream);
    db.close();
  });
  const request = (path, { method = 'POST', data, headers = {} } = {}) =>
    new Promise((resolve, reject) => {
      const body = typeof data === 'string' ? data : JSON.stringify(data);
      const req = http.request(
        `http://127.0.0.1:${port}${path}`,
        {
          method,
          headers: {
            host: 'vergecommon.test',
            origin,
            'content-type': 'application/json',
            ...headers,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.once('error', reject);
          res.once('end', () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: JSON.parse(Buffer.concat(chunks).toString()),
            }),
          );
        },
      );
      req.once('error', reject);
      req.end(body);
    });
  return {
    db,
    auth,
    safety,
    registration,
    request,
    cookie: `vc_session=${registration.session}`,
  };
}

await test('anonymous and browser reports require same-origin JSON and never expose report contents through status or GET', async (t) => {
  const f = await fixture(t);
  for (const cookie of ['', f.cookie]) {
    for (const headers of [
      { origin: '' },
      { origin: 'https://evil.test' },
      { 'content-type': 'application/x-www-form-urlencoded' },
    ]) {
      const denied = await f.request('/api/safety-reports', {
        data: input(),
        headers: { cookie, ...headers },
      });
      assert.equal(denied.status, 403);
    }
  }
  assert.equal(f.safety.summary().openReports, 0);
  const payload = input();
  const saved = await f.request('/api/safety-reports', { data: payload });
  assert.equal(saved.status, 201);
  assert.equal(saved.headers['cache-control'], 'no-store');
  assert.equal(saved.body.status, 'received');
  assert.equal(saved.body.reason, undefined);
  const repeated = await f.request('/api/safety-reports', { data: payload });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.repeated, true);
  const changed = await f.request('/api/safety-reports', {
    data: {
      ...payload,
      reason: 'Changed complaint text must be submitted as a new report.',
    },
  });
  assert.equal(changed.status, 409);
  const status = await f.request('/api/safety-reports/status', {
    data: { id: payload.requestId, receipt: payload.receipt },
  });
  assert.deepEqual(Object.keys(status.body).sort(), [
    'id',
    'status',
    'updatedAt',
  ]);
  assert.equal(status.headers['cache-control'], 'no-store');
  const missing = await f.request('/api/safety-reports/status', {
    data: { id: payload.requestId, receipt: randomBytes(32).toString('hex') },
  });
  assert.equal(missing.status, 404);
  for (const path of ['/api/safety-reports', '/api/safety-reports/status']) {
    assert.equal((await f.request(path, { method: 'GET' })).status, 405);
  }
  const stored = f.db.prepare('SELECT * FROM safety_reports').get();
  assert.equal(stored.reporter_id, null);
  assert.ok(!JSON.stringify(stored).includes(payload.receipt));
});

await test('MCP and read-only app tokens cannot file reports; app writes still require an explicit same-origin request', async (t) => {
  const f = await fixture(t);
  for (const scope of ['mcp:read', 'mcp:write', 'app:read']) {
    const token = f.auth.createToken(
      f.registration.user.id,
      `Synthetic ${scope}`,
      scope,
    );
    const headers = { authorization: `Bearer ${token}` };
    assert.equal(
      (await f.request('/api/safety-reports', { data: input(), headers }))
        .status,
      403,
    );
    assert.equal(
      (
        await f.request('/api/safety-reports/status', {
          data: { id: randomUUID(), receipt: randomBytes(32).toString('hex') },
          headers,
        })
      ).status,
      403,
    );
  }
  const token = f.auth.createToken(
    f.registration.user.id,
    'Synthetic write device',
    'app:write',
  );
  assert.equal(
    (
      await f.request('/api/safety-reports', {
        data: input(),
        headers: { authorization: `Bearer ${token}`, origin: '' },
      })
    ).status,
    403,
  );
  const payload = input();
  assert.equal(
    (
      await f.request('/api/safety-reports', {
        data: payload,
        headers: { authorization: `Bearer ${token}` },
      })
    ).status,
    201,
  );
  assert.equal(
    f.db.prepare('SELECT reporter_id FROM safety_reports').get().reporter_id,
    f.registration.user.id,
  );
  f.safety.submit(
    input({
      reason:
        'Separate anonymous report must never enter another account export.',
    }),
  );
  const exported = await f.request('/account/export', {
    method: 'GET',
    headers: { cookie: f.cookie },
  });
  assert.equal(exported.status, 200);
  assert.equal(exported.body.operatorReports.length, 1);
  assert.equal(exported.body.operatorReports[0].reason, payload.reason);
  assert.equal(exported.body.operatorReports[0].receipt_hash, undefined);
  assert.equal(exported.body.operatorReports[0].payload_hash, undefined);
  assert.equal(
    (
      await f.request('/api/safety-reports', {
        data: input(),
        headers: { authorization: 'Bearer invalid', cookie: f.cookie },
      })
    ).status,
    401,
  );
});

await test('the report body bound accepts 4,000 CJK characters and rejects bodies over 20 KB', async (t) => {
  const f = await fixture(t);
  const payload = input({ reason: '森'.repeat(4000) });
  assert.equal(payload.reason.length, 4000);
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) > 12000);
  const accepted = await f.request('/api/safety-reports', { data: payload });
  assert.equal(accepted.status, 201);
  assert.equal(f.safety.read(payload.requestId).reason, payload.reason);
  const excessive = input({ padding: 'x'.repeat(20 * 1024) });
  const rejected = await f.request('/api/safety-reports', { data: excessive });
  assert.equal(rejected.status, 413);
  assert.equal(f.safety.summary().openReports, 1);
});

await test('private co-op targets require actual membership, forged identity headers do not grant it, and signed-in complaints erase on closure', async (t) => {
  const f = await fixture(t);
  const coopId = randomUUID();
  const state = newWorkspace(
    {
      name: 'Private test',
      summary: 'Synthetic co-op',
      region: 'Synthetic',
      displayName: 'Test member',
    },
    f.registration.user,
    1,
    coopId,
  );
  f.db
    .prepare(
      'INSERT INTO workspaces (id,owner_id,name,region,summary,state_json,version,visibility,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,1,1)',
    )
    .run(
      coopId,
      f.registration.user.id,
      state.name,
      state.region,
      state.summary,
      JSON.stringify(state),
      'private',
    );
  const payload = input({ kind: 'coop', coopId });
  assert.equal(
    (
      await f.request('/api/safety-reports', {
        data: payload,
        headers: { 'oai-authenticated-user-id': f.registration.user.id },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request('/api/safety-reports', {
        data: payload,
        headers: { cookie: f.cookie },
      })
    ).status,
    201,
  );
  assert.equal(
    f.db.prepare('SELECT reporter_id FROM safety_reports').get().reporter_id,
    f.registration.user.id,
  );
  // This fixture uses credential closure directly; production additionally runs
  // associated-data erasure before the same user-delete/cascade transaction.
  await f.auth.closeAccount(f.registration.user.id, password);
  assert.equal(
    f.db.prepare('SELECT count(*) AS count FROM safety_reports').get().count,
    0,
  );
  assert.equal(
    (
      await f.request('/api/safety-reports/status', {
        data: { id: payload.requestId, receipt: payload.receipt },
      })
    ).status,
    404,
  );
});

await test('operator resolution is not an HTTP capability and failed resolution rolls back workspace, report and audit together', async (t) => {
  const f = await fixture(t);
  const payload = input();
  f.safety.submit(payload);
  for (const path of [
    '/api/safety-reports/list',
    '/api/safety-reports/resolve',
    '/api/safety-reports/release',
    '/api/safety-reports/summary',
  ]) {
    const result = await f.request(path, {
      data: {
        id: payload.requestId,
        action: 'dismiss',
        operator: 'Forged operator',
        note: 'Cannot resolve using HTTP.',
      },
      headers: { cookie: f.cookie },
    });
    assert.equal(result.status, 404);
  }
  const coopId = randomUUID(),
    targetId = randomUUID();
  const state = newWorkspace(
    {
      name: 'Operator test',
      summary: 'Synthetic',
      region: 'Synthetic',
      displayName: 'Test',
    },
    f.registration.user,
    1,
    coopId,
  );
  state.visibility = 'public';
  state.projects.push({
    id: randomUUID(),
    status: 'active',
    visibility: 'public',
  });
  state.updates.push({
    id: targetId,
    projectId: state.projects[0].id,
    text: 'Synthetic',
    visibility: 'public',
    createdBy: f.registration.user.id,
  });
  f.db
    .prepare(
      'INSERT INTO workspaces (id,owner_id,name,region,summary,state_json,version,visibility,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,1,1)',
    )
    .run(
      coopId,
      f.registration.user.id,
      state.name,
      state.region,
      state.summary,
      JSON.stringify(state),
      'public',
    );
  const report = input({ kind: 'update', coopId, targetId });
  f.safety.submit(report);
  const before = f.db
    .prepare('SELECT state_json,version FROM workspaces WHERE id=?')
    .get(coopId);
  f.db.exec(
    "CREATE TRIGGER reject_test_decision BEFORE INSERT ON safety_actions BEGIN SELECT RAISE(ABORT, 'Synthetic failure'); END;",
  );
  assert.throws(
    () =>
      f.safety.resolve({
        id: report.requestId,
        action: 'hide',
        operator: 'Test operator',
        note: 'Synthetic test decision only.',
      }),
    /Synthetic failure/,
  );
  assert.deepEqual(
    f.db
      .prepare('SELECT state_json,version FROM workspaces WHERE id=?')
      .get(coopId),
    before,
  );
  assert.equal(
    f.safety.status({ id: report.requestId, receipt: report.receipt }).status,
    'received',
  );
  assert.equal(
    f.db.prepare('SELECT count(*) AS count FROM safety_actions').get().count,
    0,
  );
});

await test('operator queue keeps open reports reachable beyond 200 resolved rows and paginates equal timestamps without gaps', (t) => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
  t.after(() => db.close());
  const safety = createSafety(db, () => 100);
  for (let i = 0; i < 225; i++) safety.submit(input());
  db.exec("UPDATE safety_reports SET status='closed'");
  const ids = [];
  for (let i = 0; i < 237; i++) {
    const payload = input();
    ids.push(payload.requestId);
    safety.submit(payload);
  }
  let cursor = { limit: 31 };
  const seen = [];
  do {
    const page = safety.list(cursor);
    assert.ok(page.reports.every((report) => report.status === 'received'));
    assert.ok(
      page.reports.every(
        (report) =>
          report.reason === undefined && report.receipt_hash === undefined,
      ),
    );
    seen.push(...page.reports.map((report) => report.id));
    cursor = page.next;
  } while (cursor);
  assert.deepEqual(seen, ids.sort());
  assert.equal(new Set(seen).size, 237);
  assert.equal(safety.summary().openReports, 237);
  const all = safety.list({ status: 'all', limit: 200 });
  assert.equal(all.reports.length, 200);
  assert.equal(all.next.status, 'all');
  for (const invalid of [
    { limit: 201 },
    { after: -1 },
    { afterId: "' OR 1=1 --" },
    { status: 'resolved' },
  ]) {
    assert.throws(() => safety.list(invalid), /cursor/);
  }
});
