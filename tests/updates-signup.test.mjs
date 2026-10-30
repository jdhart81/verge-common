import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { createAuth } from '../self-hosted/auth.mjs';
import { createResendClient } from '../self-hosted/resend.mjs';
import { createGateway } from '../self-hosted/server.mjs';
import {
  createUpdates,
  encryptConfirmation,
  verifyConfirmation,
  TTL,
} from '../self-hosted/updates.mjs';
import { updatesEnabled, updatesVariables } from '../lib/updates-config.mjs';
// All routes exercised in-process; no listening socket or real fetch.
globalThis.fetch = () => {
  throw new Error('Network forbidden in updates tests');
};
export const fixtureEnv = {
  VERGE_UPDATES_ENABLED: '1',
  RESEND_API_KEY: 'fixture-private-api-key',
  VERGE_UPDATES_SIGNING_SECRET: 'test-only-'.repeat(4),
  VERGE_UPDATES_SEGMENT_ID: 'segment-fixture',
  VERGE_UPDATES_FROM: 'VergeCommon <updates@vergecommon.com>',
  VERGE_UPDATES_REPLY_TO: 'justin@vergecommon.com',
  VERGE_UPDATES_POSTAL_ADDRESS: 'Fixture postal address',
};
const origin = 'https://vergecommon.test';
function fixture(t, options = {}) {
  let time = 1000000;
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const auth = createAuth(db, () => time);
  const emails = [],
    contacts = new Set(),
    delays = [];
  const client = {
    async sendEmail(message) {
      emails.push(message);
    },
    async upsertContact(email) {
      contacts.add(email);
    },
  };
  const flow = createUpdates({
    env: fixtureEnv,
    origin,
    auth,
    client,
    now: () => time,
    wait: async (ms) => {
      delays.push(ms);
    },
    ...options,
  });
  const request = (
    path,
    body,
    clientKey = 'fixture-client',
    requestOrigin = origin,
  ) =>
    flow.handle(
      new Request(`${origin}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { origin: requestOrigin, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      clientKey,
    );
  return {
    flow,
    request,
    emails,
    contacts,
    delays,
    db,
    auth,
    advance: (ms) => {
      time += ms;
    },
    now: () => time,
  };
}
async function gatewayRequest(gateway, path, body, requestOrigin = origin) {
  const req = Readable.from(
    body === undefined ? [] : [Buffer.from(JSON.stringify(body))],
  );
  Object.assign(req, {
    url: path,
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      host: 'vergecommon.test',
      origin: requestOrigin,
      'content-type': 'application/json',
    },
  });
  req.socket = { remoteAddress: '127.0.0.1' };
  const headers = {};
  return new Promise((resolve) => {
    gateway.emit('request', req, {
      setHeader: (key, value) => {
        headers[key] = value;
      },
      writeHead: (status, values) => {
        headers.status = status;
        Object.assign(headers, values);
      },
      end: (value) =>
        resolve({ status: headers.status, body: String(value), headers }),
    });
  });
}
await test('I1 every missing configuration disables pages, API and link predicate', async (t) => {
  for (const key of ['VERGE_UPDATES_ENABLED', ...updatesVariables]) {
    const env = { ...fixtureEnv };
    delete env[key];
    const f = fixture(t, { env });
    assert.equal(updatesEnabled(env), false);
    assert.equal((await f.request('/updates/')).status, 404);
    assert.equal((await f.request('/updates')).status, 404);
    assert.equal(
      (
        await f.request('/api/updates/subscribe', {
          email: 'fixture@example.test',
        })
      ).status,
      404,
    );
    const { server } = createGateway({
      origin,
      auth: f.auth,
      upstreamPort: 1,
      updatesEnv: env,
    });
    assert.equal((await gatewayRequest(server, '/updates/')).status, 404);
    assert.equal((await gatewayRequest(server, '/updates')).status, 404);
    assert.equal(
      (await gatewayRequest(server, '/api/updates/subscribe', {})).status,
      404,
    );
  }
  assert.equal(
    updatesEnabled({ ...fixtureEnv, VERGE_UPDATES_SIGNING_SECRET: 'short' }),
    false,
  );
  assert.match(
    await readFile(
      new URL('../components/updates-link.tsx', import.meta.url),
      'utf8',
    ),
    /if \(!updatesEnabled\(\)\) return null/,
  );
  for (const file of [
    'app/page.tsx',
    'components/information-page.tsx',
    'app/support-project/page.tsx',
  ]) {
    assert.match(
      await readFile(new URL(`../${file}`, import.meta.url), 'utf8'),
      /<UpdatesLink/,
    );
  }
});
await test('I3 I4 I5 full gateway form journey, GET does not subscribe, same POST success twice', async (t) => {
  const f = fixture(t);
  const { server } = createGateway({
    origin,
    auth: f.auth,
    upstreamPort: 1,
    updatesEnv: fixtureEnv,
    updatesClient: {
      sendEmail: async (m) => {
        f.emails.push(m);
      },
      upsertContact: async (e) => {
        f.contacts.add(e);
      },
    },
    updatesWait: async () => {},
  });
  const page = await gatewayRequest(server, '/updates/');
  assert.equal(page.status, 200);
  assert.match(page.body, /<label for="email">/);
  assert.match(page.body, /aria-hidden="true"/);
  const signup = await gatewayRequest(server, '/api/updates/subscribe', {
    email: ' Fixture@Example.test ',
  });
  assert.equal(signup.status, 202);
  assert.equal(f.emails.length, 1);
  assert.equal(f.contacts.size, 0);
  const token = f.emails[0].text.match(/confirm\?t=([\w.-]+)/)[1];
  const landing = await gatewayRequest(server, `/updates/confirm?t=${token}`);
  assert.equal(landing.status, 200);
  assert.equal(f.contacts.size, 0);
  assert.match(
    landing.body,
    /<form method="post" action="\/updates\/confirm">/,
  );
  assert.ok(landing.body.includes(`name="t" value="${token}"`));
  assert.match(landing.body, /Confirm subscription/);
  assert.match(
    landing.headers['content-security-policy'],
    /form-action 'self'/,
  );
  const first = await gatewayRequest(server, '/updates/confirm', { t: token });
  const second = await gatewayRequest(server, '/updates/confirm', { t: token });
  assert.equal(first.status, 200);
  assert.deepEqual(first, second);
  assert.equal(f.contacts.size, 1);
  assert.equal(first.headers['referrer-policy'], 'no-referrer');
});
await test('I4 AES-GCM rejects tampering, expiry, wrong segment, malformed tokens and future lifetime', async (t) => {
  const f = fixture(t);
  const secret = fixtureEnv.VERGE_UPDATES_SIGNING_SECRET;
  const token = encryptConfirmation(
    'fixture@example.test',
    fixtureEnv.VERGE_UPDATES_SEGMENT_ID,
    secret,
    f.now(),
  );
  assert.equal(
    verifyConfirmation(
      token,
      fixtureEnv.VERGE_UPDATES_SEGMENT_ID,
      secret,
      f.now(),
    ),
    'fixture@example.test',
  );
  const cases = [
    token.replace(/^./, token[0] === 'a' ? 'b' : 'a'),
    `${token}x`,
    `${token}.extra`,
    'bad',
    encryptConfirmation(
      'fixture@example.test',
      'wrong-segment',
      secret,
      f.now(),
    ),
    encryptConfirmation(
      'fixture@example.test',
      fixtureEnv.VERGE_UPDATES_SEGMENT_ID,
      secret,
      f.now() - TTL,
    ),
    encryptConfirmation(
      'fixture@example.test',
      fixtureEnv.VERGE_UPDATES_SEGMENT_ID,
      secret,
      f.now() + 1,
    ),
  ];
  for (const candidate of cases) {
    const result = await f.request('/updates/confirm', { t: candidate });
    assert.equal(result.status, 400);
  }
  assert.equal(f.contacts.size, 0);
});
await test('I6 identical response and fixed delay for new, subscribed, rejected and limited addresses', async (t) => {
  const f = fixture(t);
  f.contacts.add('existing@example.test');
  const responses = [];
  for (const email of [
    'new@example.test',
    'existing@example.test',
    'invalid-but-shaped@example.test',
    'new@example.test',
    'other@example.test',
    'limited@example.test',
  ]) {
    const r = await f.request('/api/updates/subscribe', { email });
    responses.push([r.status, await r.text()]);
  }
  for (const response of responses) assert.deepEqual(response, responses[0]);
  assert.deepEqual(f.delays, [250, 250, 250, 250, 250, 250]);
});
await test('I6 provider failure and malformed input never enumerate or surface errors', async (t) => {
  const f = fixture(t, {
    client: {
      sendEmail: async () => {
        throw new Error('invalid-but-shaped@example.test');
      },
    },
  });
  const good = await f.request('/api/updates/subscribe', {
    email: 'invalid-but-shaped@example.test',
  });
  for (const email of [
    'a@@b.test',
    'a\nb@example.test',
    'x'.repeat(255) + '@b.test',
    null,
  ]) {
    const r = await f.request('/api/updates/subscribe', { email });
    assert.equal(r.status, good.status);
    assert.equal(await r.text(), await good.clone().text());
  }
  await f.flow.settled();
});
await test('I7 five per client, cooldown, restart and honeypot; rate keys contain no address', async (t) => {
  const f = fixture(t);
  await f.request('/api/updates/subscribe', {
    email: 'trap@example.test',
    website: 'bot',
  });
  assert.equal(f.emails.length, 0);
  for (let n = 0; n < 6; n++)
    await f.request(
      '/api/updates/subscribe',
      { email: `person${n}@example.test` },
      'client-a',
    );
  assert.equal(f.emails.length, 5);
  await f.request(
    '/api/updates/subscribe',
    { email: 'person0@example.test' },
    'client-b',
  );
  assert.equal(f.emails.length, 5);
  f.advance(10 * 60000 + 1);
  await f.request(
    '/api/updates/subscribe',
    { email: 'person0@example.test' },
    'client-b',
  );
  assert.equal(f.emails.length, 6);
  f.advance(5 * 60000 + 1);
  await f.request(
    '/api/updates/subscribe',
    { email: 'fresh@example.test' },
    'client-a',
  );
  assert.equal(f.emails.length, 7);
  assert.ok(
    f.db
      .prepare('SELECT * FROM rate_limits')
      .all()
      .every((r) => !r.key.includes('@')),
  );
});
await test('I7 global 100/hour limit across distinct clients', async (t) => {
  const f = fixture(t);
  for (let n = 0; n < 101; n++)
    await f.request(
      '/api/updates/subscribe',
      { email: `person${n}@example.test` },
      `client-${n}`,
    );
  assert.equal(f.emails.length, 100);
  f.advance(3600001);
  await f.request(
    '/api/updates/subscribe',
    { email: 'fresh@example.test' },
    'fresh',
  );
  assert.equal(f.emails.length, 101);
});
await test('I2 I11 actual DB, captured logs, failures and responses omit subscriber and secrets', async (t) => {
  const logs = [];
  const old = console.error;
  console.error = (...args) => logs.push(args);
  t.after(() => {
    console.error = old;
  });
  const address = 'private-fixture@example.test';
  const f = fixture(t, {
    client: {
      sendEmail: async () => {
        throw new Error(`${address} ${fixtureEnv.RESEND_API_KEY}`);
      },
      upsertContact: async () => {
        throw new Error(address);
      },
    },
  });
  const responses = [
    await (await f.request('/updates/')).text(),
    await (
      await f.request('/api/updates/subscribe', { email: address })
    ).text(),
  ];
  const token = encryptConfirmation(
    address,
    fixtureEnv.VERGE_UPDATES_SEGMENT_ID,
    fixtureEnv.VERGE_UPDATES_SIGNING_SECRET,
    f.now(),
  );
  responses.push(
    await (await f.request('/updates/confirm', { t: token })).text(),
  );
  await f.flow.settled();
  const tables = f.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all();
  const snapshot =
    JSON.stringify(
      tables.map(({ name }) =>
        f.db.prepare(`SELECT * FROM "${String(name)}"`).all(),
      ),
    ) +
    JSON.stringify(logs) +
    responses.join('');
  for (const secret of [
    address,
    fixtureEnv.RESEND_API_KEY,
    fixtureEnv.VERGE_UPDATES_SIGNING_SECRET,
    token,
  ])
    assert.equal(snapshot.includes(secret), false);
});
await test('I3 same-origin protection rejects cross-origin before sending', async (t) => {
  const f = fixture(t);
  assert.equal(
    (
      await f.request(
        '/api/updates/subscribe',
        { email: 'fixture@example.test' },
        'client',
        'https://evil.test',
      )
    ).status,
    403,
  );
  assert.equal(f.emails.length, 0);
});
await test('I6 slow provider has no effect on response timing; I7 cooldown resets on restart', async (t) => {
  let deliver;
  const pending = new Promise((resolve) => {
    deliver = resolve;
  });
  const f = fixture(t, { client: { sendEmail: () => pending } });
  const r = await f.request('/api/updates/subscribe', {
    email: 'fixture@example.test',
  });
  assert.equal(r.status, 202);
  assert.deepEqual(f.delays, [250]);
  deliver();
  await f.flow.settled();
  const restarted = createUpdates({
    env: fixtureEnv,
    origin,
    auth: f.auth,
    now: f.now,
    wait: async () => {},
    client: {
      sendEmail: async (m) => {
        f.emails.push(m);
      },
    },
  });
  await restarted.handle(
    new Request(`${origin}/api/updates/subscribe`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'fixture@example.test' }),
    }),
    'client-after-restart',
  );
  await restarted.settled();
  assert.equal(f.emails.length, 1);
});
await test('I3 GET confirmation with valid encrypted token makes zero provider calls; same-origin POST upserts once', async (t) => {
  const calls = [];
  const f = fixture(t, {
    client: {
      sendEmail: async () => {
        calls.push('send');
      },
      upsertContact: async (email) => {
        calls.push('upsert');
        f.contacts.add(email);
      },
    },
  });
  const token = encryptConfirmation(
    'fixture@example.test',
    fixtureEnv.VERGE_UPDATES_SEGMENT_ID,
    fixtureEnv.VERGE_UPDATES_SIGNING_SECRET,
    f.now(),
  );
  const get = await f.request(`/updates/confirm?t=${token}`);
  assert.equal(get.status, 200);
  assert.deepEqual(calls, []);
  assert.match(await get.text(), /Confirm subscription/);
  assert.match(
    get.headers.get('content-security-policy'),
    /form-action 'self'/,
  );
  const post = await f.flow.handle(
    new Request(`${origin}/updates/confirm`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ t: token }),
    }),
    'client',
  );
  assert.equal(post.status, 200);
  assert.deepEqual(calls, ['upsert']);
  assert.equal(f.contacts.size, 1);
  const again = await f.request('/updates/confirm', { t: token });
  assert.equal(again.status, 200);
  assert.equal(await again.text(), await post.text());
  assert.equal(f.contacts.size, 1);
});
await test('I3 confirmation cross-origin or missing-origin POST is 403 and makes zero provider calls', async (t) => {
  const f = fixture(t, {
    client: {
      upsertContact: async () => assert.fail('No provider calls allowed'),
    },
  });
  const token = encryptConfirmation(
    'fixture@example.test',
    fixtureEnv.VERGE_UPDATES_SEGMENT_ID,
    fixtureEnv.VERGE_UPDATES_SIGNING_SECRET,
    f.now(),
  );
  for (const source of ['https://evil.test', ''])
    assert.equal(
      (await f.request('/updates/confirm', { t: token }, 'client', source))
        .status,
      403,
    );
  const { server } = createGateway({
    origin,
    auth: f.auth,
    upstreamPort: 1,
    updatesEnv: fixtureEnv,
    updatesClient: {
      upsertContact: async () => assert.fail('No provider calls allowed'),
    },
  });
  assert.equal(
    (
      await gatewayRequest(
        server,
        '/updates/confirm',
        { t: token },
        'https://evil.test',
      )
    ).status,
    403,
  );
});
await test('I4 encrypted URLs hide raw/base64/base64url address and use independent random 12-byte IVs', async (t) => {
  const f = fixture(t);
  const email = 'private-fixture@example.test';
  await f.request('/api/updates/subscribe', { email });
  const url = f.emails[0].text.match(/https:\/\/\S+/)[0];
  const token = new URL(url).searchParams.get('t');
  for (const value of [
    email,
    Buffer.from(email).toString('base64'),
    Buffer.from(email).toString('base64url'),
  ])
    assert.equal(url.includes(value), false);
  const other = encryptConfirmation(
    email,
    fixtureEnv.VERGE_UPDATES_SEGMENT_ID,
    fixtureEnv.VERGE_UPDATES_SIGNING_SECRET,
    f.now(),
  );
  assert.notEqual(other, token);
  const packed = Buffer.from(token.split('.')[1], 'base64url');
  assert.equal(packed.subarray(0, 12).length, 12);
  assert.notDeepEqual(
    packed.subarray(0, 12),
    Buffer.from(other.split('.')[1], 'base64url').subarray(0, 12),
  );
  for (const offset of [0, 12, packed.length - 1]) {
    const modified = Buffer.from(packed);
    modified[offset] ^= 1;
    assert.equal(
      verifyConfirmation(
        `v1.${modified.toString('base64url')}`,
        fixtureEnv.VERGE_UPDATES_SEGMENT_ID,
        fixtureEnv.VERGE_UPDATES_SIGNING_SECRET,
        f.now(),
      ),
      null,
    );
  }
  assert.equal(
    verifyConfirmation(
      token,
      fixtureEnv.VERGE_UPDATES_SEGMENT_ID,
      'different-test-secret'.repeat(2),
      f.now(),
    ),
    null,
  );
});
await test('I1 enabled GET /updates redirects permanently to /updates/ with 308', async (t) => {
  const f = fixture(t);
  const result = await f.request('/updates');
  assert.equal(result.status, 308);
  assert.equal(result.headers.get('location'), '/updates/');
  const { server } = createGateway({
    origin,
    auth: f.auth,
    upstreamPort: 1,
    updatesEnv: fixtureEnv,
  });
  const gateway = await gatewayRequest(server, '/updates');
  assert.equal(gateway.status, 308);
  assert.equal(gateway.headers.location, '/updates/');
});
await test('I5 repeated confirmation POSTs through real adapter create exactly one contact; GET makes zero fetch calls', async (t) => {
  const calls = [];
  let contact;
  const client = createResendClient({
    apiKey: fixtureEnv.RESEND_API_KEY,
    fetchImpl: async (url, options) => {
      const path = new URL(url).pathname;
      calls.push([path, options.method]);
      if (path === '/contacts' && options.method === 'POST') {
        assert.equal(contact, undefined);
        contact = JSON.parse(options.body);
        return new Response(JSON.stringify({ id: 'contact-fixture' }));
      }
      if (path === '/contacts/contact-fixture/segments')
        return new Response(
          JSON.stringify({ data: contact.segments, has_more: false }),
        );
      if (options.method === 'GET' && path.startsWith('/contacts/'))
        return new Response(
          JSON.stringify(contact ? { id: 'contact-fixture' } : {}),
          { status: contact ? 200 : 404 },
        );
      assert.fail('Unexpected provider request');
    },
  });
  const f = fixture(t, { client });
  const token = encryptConfirmation(
    'fixture@example.test',
    fixtureEnv.VERGE_UPDATES_SEGMENT_ID,
    fixtureEnv.VERGE_UPDATES_SIGNING_SECRET,
    f.now(),
  );
  assert.equal((await f.request(`/updates/confirm?t=${token}`)).status, 200);
  assert.deepEqual(calls, []);
  const first = await f.request('/updates/confirm', { t: token });
  assert.equal(first.status, 200);
  assert.equal(
    calls.filter(([path, method]) => path === '/contacts' && method === 'POST')
      .length,
    1,
  );
  const second = await f.request('/updates/confirm', { t: token });
  assert.equal(second.status, 200);
  assert.equal(await first.text(), await second.text());
  assert.equal(calls.filter(([, method]) => method === 'POST').length, 1);
  assert.deepEqual(contact.segments, [
    { id: fixtureEnv.VERGE_UPDATES_SEGMENT_ID },
  ]);
  f.advance(TTL);
  assert.equal((await f.request('/updates/confirm', { t: token })).status, 400);
  assert.equal(calls.length, 4);
});
