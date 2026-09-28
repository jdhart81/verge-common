// Soft-launch abuse controls (security review 27 Sep 2026, findings H1, M1–M6,
// L1, L4). Each test names the invariant it proves.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createAuth } from '../self-hosted/auth.mjs';
import {
  createGateway,
  userMessage,
  UPLOAD_DISK_FLOOR_BYTES,
} from '../self-hosted/server.mjs';
import { clientKey, isSafeRelativePath } from '../self-hosted/client-key.mjs';
import {
  newWorkspace,
  applyCommand,
  PENDING_REQUEST_LIMIT,
  PER_MEMBER_CREATION_LIMITS,
} from '../lib/network.mjs';

const origin = 'https://vergecommon.test';
const password = 'A careful gateway password 123!';

await test('M1: all addresses in one IPv6 /64 share one rate-limit key', () => {
  const a = clientKey('2001:db8:1:2:aaaa::1');
  const b = clientKey('2001:db8:1:2:ffff:ffff:ffff:ffff');
  assert.equal(a, b);
  assert.notEqual(a, clientKey('2001:db8:1:3::1'));
  assert.equal(clientKey('::ffff:203.0.113.9'), clientKey('203.0.113.9'));
  assert.equal(clientKey('203.0.113.9'), 'v4:203.0.113.9');
  assert.equal(clientKey('[2001:db8::1]'), clientKey('2001:db8:0:0:1::'));
  assert.match(clientKey(''), /^other:/);
});

await test('L1: protocol-relative return paths are never accepted', () => {
  assert.equal(isSafeRelativePath('/workspace/'), true);
  assert.equal(isSafeRelativePath('//evil.example/phish'), false);
  assert.equal(isSafeRelativePath('/\\evil.example'), false);
  assert.equal(isSafeRelativePath('https://evil.example'), false);
});

await test('L4: internal database errors are replaced by a generic message', () => {
  const sqlite = Object.assign(new Error('database is locked'), {
    code: 'ERR_SQLITE_ERROR',
  });
  assert.equal(
    userMessage(sqlite),
    'The service could not complete this request.',
  );
  assert.equal(
    userMessage(new Error('That username is unavailable.')),
    'That username is unavailable.',
  );
});

function coop() {
  const owner = { id: 'owner' };
  let s = newWorkspace(
    {
      name: 'Abuse test co-op',
      region: 'Synthetic region',
      summary: 'Synthetic test only',
      displayName: 'Founding steward',
    },
    owner,
    1,
    'coop',
  );
  let n = 1;
  const run = (op, payload, actor = owner) => {
    const id = `record-${n++}`;
    s = applyCommand(s, actor, { op, payload }, 100 + n, id);
    return id;
  };
  run('update_coop', {
    name: s.name,
    region: s.region,
    summary: s.summary,
    visibility: 'public',
  });
  return {
    run,
    get s() {
      return s;
    },
  };
}

await test('M3: rejected requests do not consume the member cap; pending requests are capped', () => {
  const f = coop();
  for (let i = 0; i < PENDING_REQUEST_LIMIT + 5; i += 1) {
    const id = f.run(
      'request_membership',
      { name: `Spam ${i}` },
      { id: `spam-${i}` },
    );
    f.run('member_status', { id, status: 'rejected' });
  }
  // A real person can still ask to join after many rejected requests.
  f.run('request_membership', { name: 'Real neighbour' }, { id: 'real' });
  for (let i = 1; i < PENDING_REQUEST_LIMIT; i += 1)
    f.run(
      'request_membership',
      { name: `Pending ${i}` },
      { id: `pending-${i}` },
    );
  assert.throws(
    () =>
      f.run('request_membership', { name: 'One too many' }, { id: 'extra' }),
    /too many open membership requests/,
  );
});

await test('M4: an ordinary member cannot exceed per-member creation caps; stewards can', () => {
  const f = coop();
  const memberId = f.run(
    'request_membership',
    { name: 'Member' },
    { id: 'member' },
  );
  f.run('member_status', { id: memberId, status: 'active' });
  const projectId = f.run('create_project', {
    name: 'Hedge',
    summary: 'Synthetic',
    region: 'Synthetic',
    kind: 'ecohedge',
  });
  const limit = PER_MEMBER_CREATION_LIMITS.tasks;
  for (let i = 0; i < limit; i += 1)
    f.run('create_task', { projectId, title: `Task ${i}` }, { id: 'member' });
  assert.throws(
    () => f.run('create_task', { projectId, title: 'Over' }, { id: 'member' }),
    /reached the limit of 150 tasks/,
  );
  f.run('create_task', { projectId, title: 'Steward task' });
});

const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(server.address().port)),
  );
const closeServer = (server) =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  });
const raw = (port, path, { method = 'GET', headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: { host: 'vergecommon.test', ...headers },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });

async function gateway(t, options = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  const auth = createAuth(db, Date.now);
  const alice = await auth.register({
    username: 'alice',
    displayName: 'Alice',
    password,
  });
  let upstreamHits = 0;
  const upstream = http.createServer(async (req, res) => {
    upstreamHits += 1;
    for await (const _ of req);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  const upstreamPort = await listen(upstream);
  const { server } = createGateway({ origin, upstreamPort, auth, ...options });
  const port = await listen(server);
  t.after(async () => {
    await closeServer(server);
    await closeServer(upstream);
    db.close();
  });
  return {
    port,
    cookie: `vc_session=${alice.session}`,
    hits: () => upstreamHits,
  };
}

await test('H1: anonymous API writes are refused before any body is buffered', async (t) => {
  const g = await gateway(t);
  const res = await raw(g.port, '/api/files?workspace=x', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/octet-stream',
      'content-length': '4000000',
    },
    body: Buffer.alloc(16),
  });
  assert.equal(res.status, 401);
  assert.equal(g.hits(), 0);
});

await test('M4: signed-in members are rate limited per minute on co-op commands', async (t) => {
  const g = await gateway(t);
  const send = () =>
    raw(g.port, '/api/workspaces', {
      method: 'POST',
      headers: { origin, cookie: g.cookie, 'content-type': 'application/json' },
      body: '{}',
    });
  for (let i = 0; i < 40; i += 1) assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 429);
});

await test('M6: uploads are refused when free disk falls below the floor', async (t) => {
  const g = await gateway(t, {
    freeDiskBytes: async () => UPLOAD_DISK_FLOOR_BYTES - 1,
  });
  const res = await raw(g.port, '/api/files?workspace=x', {
    method: 'POST',
    headers: {
      origin,
      cookie: g.cookie,
      'content-type': 'application/octet-stream',
    },
    body: Buffer.alloc(16),
  });
  assert.equal(res.status, 507);
  assert.equal(g.hits(), 0);
});

await test('BL-01: health reports the deployed build commit', async (t) => {
  const g = await gateway(t, { buildCommit: 'abc1234' });
  const res = await raw(g.port, '/healthz');
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).commit, 'abc1234');
});

await test('M2: repeated failures from one network do not lock the account for others', async (t) => {
  const g = await gateway(t);
  const attempt = (ip) =>
    raw(g.port, '/auth/native/login', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', 'x-real-ip': ip },
      body: JSON.stringify({
        username: 'alice',
        password: 'wrong password value',
      }),
    });
  process.env.VERGE_TRUST_CADDY = '1';
  t.after(() => delete process.env.VERGE_TRUST_CADDY);
  let last;
  for (let i = 0; i < 13; i += 1) last = await attempt('198.51.100.7');
  assert.equal(last.status, 429);
  const other = await attempt('203.0.113.50');
  assert.equal(other.status, 401);
});

await test('BL-09: password and native sign-up require accepting the Terms of Use', async (t) => {
  const g = await gateway(t);
  const form = (fields) =>
    raw(g.port, '/auth/register', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    });
  const base = { username: 'carol', displayName: 'Carol', password };
  const refused = await form(base);
  assert.equal(refused.status, 400);
  assert.match(refused.body, /Agree to the Terms of Use/);
  assert.equal((await form({ ...base, acceptTerms: 'yes' })).status, 201);
  const native = (data) =>
    raw(g.port, '/auth/native/register', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
  const nativeBase = { username: 'dana', displayName: 'Dana', password };
  assert.equal((await native(nativeBase)).status, 400);
  assert.equal(
    (await native({ ...nativeBase, acceptTerms: true })).status,
    201,
  );
});

await test('BL-09: the sign-up form shows the Terms of Use checkbox', async (t) => {
  const g = await gateway(t);
  const page = await raw(g.port, '/account?mode=register');
  assert.match(page.body, /name="acceptTerms"[^>]*required/);
  assert.match(page.body, /href="\/terms\/"/);
});

await test('static build assets never consume the per-network page limit', async (t) => {
  const g = await gateway(t);
  for (let i = 0; i < 1300; i += 1)
    assert.equal(
      (await raw(g.port, `/_next/static/chunk-${i}.js`)).status,
      200,
    );
  let last;
  for (let i = 0; i < 1201; i += 1) last = await raw(g.port, '/network/');
  assert.equal(last.status, 429);
});
