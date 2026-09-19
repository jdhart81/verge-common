import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createAuth, digest, passwordHash } from '../self-hosted/auth.mjs';

const password = 'A careful password 123!';
const replacement = 'A different password 456!';
const cookie = (session) => ({ cookie: `vc_session=${session}` });
const bearer = (token) => ({ authorization: `Bearer ${token}` });

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  t.after(() => db.close());
  let now = 1_800_000_000_000;
  const auth = createAuth(db, () => now);
  return {
    db,
    auth,
    advance: (ms) => {
      now += ms;
    },
    register: (username) =>
      auth.register({ username, displayName: username, password }),
  };
}

await test('self-hosted registration normalizes usernames, hashes credentials and returns only public identity', async (t) => {
  const f = fixture(t);
  const result = await f.register(' Alice ');
  assert.equal(result.user.username, 'alice');
  const stored = f.db
    .prepare('SELECT * FROM users WHERE id=?')
    .get(result.user.id);
  assert.notEqual(stored.password_hash, password);
  assert.match(stored.password_hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(stored.recovery_hash, digest(result.recoveryCode));
  const session = f.db
    .prepare('SELECT * FROM sessions WHERE user_id=?')
    .get(result.user.id);
  assert.equal(session.hash, digest(result.session));
  assert.equal(Object.hasOwn(result.user, 'password_hash'), false);
  await assert.rejects(f.register('ALICE'), /unavailable/);
  await assert.rejects(f.register('a!'), /username/);
  await assert.rejects(
    f.auth.register({
      username: 'short',
      displayName: 'Short',
      password: 'short',
    }),
    /12/,
  );
  assert.equal(f.auth.authenticate(cookie(result.session)).id, result.user.id);
  await assert.rejects(
    f.auth.login({ username: 'absent', password }),
    /incorrect/,
  );
  await assert.rejects(
    f.auth.login({ username: 'alice', password: replacement }),
    /incorrect/,
  );
  const login = await f.auth.login({ username: 'ALICE', password });
  assert.notEqual(login.session, result.session);
  f.auth.logout(cookie(login.session));
  assert.equal(f.auth.authenticate(cookie(login.session)), null);
  assert.equal(f.auth.authenticate(cookie(result.session)).kind, 'session');
});

await test('personal tokens enforce selected scopes, owner-specific revocation and absolute expiry', async (t) => {
  const f = fixture(t);
  const alice = await f.register('alice');
  const bob = await f.register('bob');
  const token = f.auth.createToken(alice.user.id, 'Survey agent', 'mcp:write');
  assert.deepEqual(f.auth.authenticate(bearer(token)).scopes, [
    'mcp:read',
    'mcp:write',
  ]);
  assert.equal(f.auth.authenticate(bearer(token)).kind, 'token');
  const listed = f.auth.tokens(alice.user.id)[0];
  assert.equal(Object.hasOwn(listed, 'hash'), false);
  assert.equal(Object.hasOwn(listed, 'token'), false);
  f.auth.revokeToken(bob.user.id, listed.id);
  assert.ok(f.auth.authenticate(bearer(token)));
  f.auth.revokeToken(alice.user.id, listed.id);
  assert.equal(f.auth.authenticate(bearer(token)), null);
  const readToken = f.auth.createToken(
    alice.user.id,
    'Read-only device',
    'app:read',
  );
  assert.deepEqual(f.auth.authenticate(bearer(readToken)).scopes, ['app:read']);
  assert.equal(
    f.auth.authenticate({
      ...cookie(alice.session),
      authorization: 'Bearer invalid',
    }),
    null,
  );
  assert.throws(
    () => f.auth.createToken(alice.user.id, 'No scope', 'admin'),
    /permissions/,
  );
  f.advance(7 * 86400000);
  assert.equal(f.auth.authenticate(cookie(alice.session)), null);
  assert.ok(f.auth.authenticate(bearer(readToken)));
  f.advance(83 * 86400000);
  assert.equal(f.auth.authenticate(bearer(readToken)), null);
});

await test('password change invalidates old sessions and tokens while keeping a fresh replacement session', async (t) => {
  const f = fixture(t);
  const alice = await f.register('alice');
  const login = await f.auth.login({ username: 'alice', password });
  const token = f.auth.createToken(alice.user.id, 'Device', 'app:write');
  await assert.rejects(
    f.auth.changePassword(alice.user.id, 'wrong', replacement),
    /incorrect/,
  );
  assert.ok(f.auth.authenticate(cookie(alice.session)));
  const session = await f.auth.changePassword(
    alice.user.id,
    password,
    replacement,
  );
  assert.equal(f.auth.authenticate(cookie(alice.session)), null);
  assert.equal(f.auth.authenticate(cookie(login.session)), null);
  assert.equal(f.auth.authenticate(bearer(token)), null);
  assert.equal(f.auth.authenticate(cookie(session)).id, alice.user.id);
  await assert.rejects(
    f.auth.login({ username: 'alice', password }),
    /incorrect/,
  );
  assert.ok(
    (await f.auth.login({ username: 'alice', password: replacement })).session,
  );
});

await test('recovery rotates the one-time code and revokes every old session and token', async (t) => {
  const f = fixture(t);
  const alice = await f.register('alice');
  const token = f.auth.createToken(alice.user.id, 'Agent', 'mcp:read');
  await assert.rejects(
    f.auth.recover({
      username: 'alice',
      recoveryCode: 'wrong',
      password: replacement,
    }),
    /incorrect/,
  );
  const recovered = await f.auth.recover({
    username: 'alice',
    recoveryCode: alice.recoveryCode,
    password: replacement,
  });
  assert.notEqual(recovered.recoveryCode, alice.recoveryCode);
  assert.equal(f.auth.authenticate(cookie(alice.session)), null);
  assert.equal(f.auth.authenticate(bearer(token)), null);
  assert.ok(f.auth.authenticate(cookie(recovered.session)));
  await assert.rejects(
    f.auth.recover({
      username: 'alice',
      recoveryCode: alice.recoveryCode,
      password,
    }),
    /incorrect|used|changed/,
  );
});

await test('concurrent reuse of one recovery code succeeds only once', async (t) => {
  const f = fixture(t);
  const alice = await f.register('alice');
  const attempts = await Promise.allSettled([
    f.auth.recover({
      username: 'alice',
      recoveryCode: alice.recoveryCode,
      password: replacement,
    }),
    f.auth.recover({
      username: 'alice',
      recoveryCode: alice.recoveryCode,
      password: 'Another different password 789!',
    }),
  ]);
  assert.equal(attempts.filter((a) => a.status === 'fulfilled').length, 1);
  const success = attempts.find((a) => a.status === 'fulfilled').value;
  assert.ok(f.auth.authenticate(cookie(success.session)));
});

await test('an old-password login cannot mint a session after the stored credential changes during verification', async (t) => {
  const f = fixture(t);
  const alice = await f.register('alice');
  const replacementHash = await passwordHash(replacement);
  const pending = f.auth.login({ username: 'alice', password });
  // This represents an account recovery completing while scrypt is in flight.
  f.db
    .prepare('UPDATE users SET password_hash=? WHERE id=?')
    .run(replacementHash, alice.user.id);
  f.db.prepare('DELETE FROM sessions WHERE user_id=?').run(alice.user.id);
  await assert.rejects(pending);
  assert.equal(
    f.db
      .prepare('SELECT count(*) AS n FROM sessions WHERE user_id=?')
      .get(alice.user.id).n,
    0,
  );
});

await test('account closure removes credentials and tokens without permitting a stale login', async (t) => {
  const f = fixture(t);
  const alice = await f.register('alice');
  const token = f.auth.createToken(alice.user.id, 'Agent', 'mcp:read');
  await assert.rejects(
    f.auth.closeAccount(alice.user.id, 'wrong'),
    /incorrect/,
  );
  await f.auth.closeAccount(alice.user.id, password);
  assert.equal(f.auth.authenticate(cookie(alice.session)), null);
  assert.equal(f.auth.authenticate(bearer(token)), null);
  assert.equal(f.auth.tokens(alice.user.id).length, 0);
  await assert.rejects(
    f.auth.login({ username: 'alice', password }),
    /incorrect/,
  );
});

await test('rate limiting persists counts and permits requests after the window expires', (t) => {
  const f = fixture(t);
  assert.equal(f.auth.rateLimit('address:one', 2, 1000), true);
  assert.equal(f.auth.rateLimit('address:one', 2, 1000), true);
  assert.equal(f.auth.rateLimit('address:one', 2, 1000), false);
  assert.equal(f.auth.rateLimit('address:two', 2, 1000), true);
  f.advance(1001);
  assert.equal(f.auth.rateLimit('address:one', 2, 1000), true);
  assert.equal(
    f.db.prepare('SELECT key FROM rate_limits LIMIT 1').get().key,
    digest('address:one'),
  );
});
