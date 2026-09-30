import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import webpush from 'web-push';
import { createPush, validateSubscription } from '../self-hosted/push.mjs';
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-token',
  keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
};
function fixture(send = async () => {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('user'); CREATE TABLE workspaces(state_json TEXT,visibility TEXT);",
  );
  let time = 1728000000;
  const push = createPush(db, {
    origin: 'https://vergecommon.com',
    now: () => time,
    send,
  });
  const handle = async (
    method,
    input,
    path = '/api/push',
    principal = { id: 'user', kind: 'session' },
  ) => {
    let response;
    await push.handle({
      req: { method },
      url: new URL(path, 'https://vergecommon.com'),
      principal,
      readBody: async () => Buffer.from(JSON.stringify(input)),
      json: (status, value) => (response = { status, value }),
    });
    return response;
  };
  const state = {
    id: 'coop',
    visibility: 'private',
    members: [
      {
        id: 'member',
        userId: 'user',
        role: 'member',
        status: 'active',
        joinedAt: time,
      },
    ],
    updates: [],
    events: [],
    comments: [],
    blocks: [],
    careActions: [],
  };
  const persist = () => {
    db.exec('DELETE FROM workspaces');
    db.prepare('INSERT INTO workspaces VALUES (?,?)').run(
      JSON.stringify(state),
      state.visibility,
    );
  };
  persist();
  return { db, push, state, persist, handle, advance: (n) => (time += n) };
}
await test('push denies arbitrary destinations and malformed subscriptions before sending', () => {
  for (const endpoint of [
    'http://fcm.googleapis.com/a',
    'https://127.0.0.1/x',
    'https://fcm.googleapis.com.evil.example/x',
    'https://fcm.googleapis.com:444/x',
    'https://a:b@web.push.apple.com/x',
  ])
    assert.throws(() => validateSubscription({ ...subscription, endpoint }));
  assert.throws(() =>
    validateSubscription({ ...subscription, keys: { auth: 'short' } }),
  );
  assert.equal(
    validateSubscription(subscription).endpoint,
    subscription.endpoint,
  );
});
await test('push is opt-in, generic, rate bounded, revocation aware and deleted with the account', async () => {
  const sent = [],
    f = fixture(async (...args) => sent.push(args));
  await f.push.tick();
  assert.equal(sent.length, 0);
  assert.equal((await f.handle('GET', null, '/api/push', null)).status, 401);
  assert.equal(
    (await f.handle('GET', null, '/api/push', { id: 'user', kind: 'token' }))
      .status,
    401,
  );
  assert.equal(
    (await f.handle('POST', { subscription, mode: 'updates' })).status,
    200,
  );
  f.advance(1);
  f.state.careActions.push({
    id: 'action',
    memberId: 'member',
    status: 'open',
    createdAt: 1728000001,
    due: '1970-01-20',
    title: 'PRIVATE TITLE',
  });
  f.persist();
  await f.push.tick();
  assert.equal(sent.length, 1);
  assert.doesNotMatch(sent[0][1], /PRIVATE TITLE|member-member/);
  assert.equal(sent[0][2].TTL, 3600);
  assert.ok(sent[0][2].vapidDetails.privateKey);
  f.state.careActions[0].due = '1970-01-19';
  f.persist();
  await f.push.tick();
  assert.equal(sent.length, 1);
  f.advance(8 * 3600000);
  await f.push.tick();
  assert.equal(sent.length, 2);
  f.state.members[0].status = 'removed';
  f.persist();
  f.advance(8 * 3600000);
  await f.push.tick();
  assert.equal(sent.length, 2);
  f.db.prepare('DELETE FROM users WHERE id=?').run('user');
  assert.equal(
    f.db.prepare('SELECT count(*) n FROM push_subscriptions').get().n,
    0,
  );
});
await test('weekly digest waits a week and retry failures retain unseen updates', async () => {
  let fail = true,
    calls = 0;
  const f = fixture(async () => {
    calls++;
    if (fail) throw { statusCode: 503 };
  });
  await f.handle('POST', { subscription, mode: 'digest' });
  f.advance(1);
  f.state.careActions.push({
    id: 'action',
    memberId: 'member',
    status: 'open',
    createdAt: 1728000001,
    due: '1970-01-20',
  });
  f.persist();
  await f.push.tick();
  assert.equal(calls, 0);
  f.advance(7 * 86400000);
  await f.push.tick();
  assert.equal(calls, 1);
  assert.equal(
    f.db.prepare('SELECT accepted FROM push_subscriptions').get().accepted,
    0,
  );
  f.advance(15 * 60000);
  fail = false;
  await f.push.tick();
  assert.equal(calls, 2);
  assert.equal(
    f.db.prepare('SELECT accepted FROM push_subscriptions').get().accepted,
    1,
  );
});
await test('test delivery labels acceptance separately; expired endpoints are removed and cannot rebind accounts', async () => {
  const f = fixture(async () => {
    throw { statusCode: 410 };
  });
  await f.handle('POST', { subscription, mode: 'updates' });
  f.db.exec("INSERT INTO users VALUES ('other')");
  assert.equal(
    (
      await f.handle('POST', { subscription, mode: 'updates' }, '/api/push', {
        id: 'other',
        kind: 'session',
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.handle('POST', { subscription }, '/api/push/test')).status,
    503,
  );
  assert.equal(
    f.db.prepare('SELECT count(*) n FROM push_subscriptions').get().n,
    0,
  );
});
await test('real VAPID request construction produces encrypted generic payload without a provider connection', () => {
  const key = webpush.generateVAPIDKeys();
  const details = webpush.generateRequestDetails(
    {
      ...subscription,
      keys: { p256dh: key.publicKey, auth: subscription.keys.auth },
    },
    'Synthetic private payload',
    { vapidDetails: { ...key, subject: 'https://vergecommon.com' }, TTL: 60 },
  );
  assert.equal(details.endpoint, subscription.endpoint);
  assert.equal(details.headers['Content-Encoding'], 'aes128gcm');
  assert.doesNotMatch(details.body.toString(), /Synthetic/);
});

await test('batch rotation reaches subscribed accounts beyond the first twenty', async () => {
  const f = fixture();
  const insert = f.db.prepare('INSERT INTO push_subscriptions (endpoint,user_id,subscription,mode,since) VALUES (?,?,?,?,?)');
  for (let n = 0; n < 25; n++) insert.run(`https://fcm.googleapis.com/${n}`, 'user', JSON.stringify(subscription), 'updates', 1);
  await f.push.tick();
  assert.equal(f.db.prepare('SELECT count(*) n FROM push_subscriptions WHERE checked_at>0').get().n, 20);
  f.advance(60000); await f.push.tick();
  assert.equal(f.db.prepare('SELECT count(*) n FROM push_subscriptions WHERE checked_at>0').get().n, 25);
});
