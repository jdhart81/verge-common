import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createAuth } from '../self-hosted/auth.mjs';
import {
  createSocialAuth,
  createProviderAdapter,
  configuredProviders,
  tokenVault,
} from '../self-hosted/social-auth.mjs';
const password = 'A careful password 123!';
const origin = 'https://vergecommon.com';
const env = {
  VERGE_GOOGLE_ENABLED: '1',
  VERGE_GOOGLE_CLIENT_ID: 'client',
  VERGE_GOOGLE_CLIENT_SECRET: 'secret',
  VERGE_OAUTH_TOKEN_KEY: 'ab'.repeat(32),
};
const identity = (subject = 'subject') => ({
  provider: 'google',
  subject,
  name: 'A member',
  encryptedToken: tokenVault(env.VERGE_OAUTH_TOKEN_KEY).seal({
    token: 'test',
    hint: 'access_token',
  }),
  startedAt: Date.now() + 100,
});
function fixture(t) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  t.after(() => db.close());
  return { db, auth: createAuth(db) };
}

await test('provider configuration is opt-in and incomplete configuration fails closed; encrypted tokens detect tampering', async (t) => {
  const f = fixture(t);
  assert.equal(await createSocialAuth({ ...f, origin, env: {} }), null);
  assert.throws(
    () => configuredProviders({ VERGE_APPLE_ENABLED: '1' }),
    /CLIENT_ID/,
  );
  assert.throws(() => tokenVault('short'));
  const vault = tokenVault(env.VERGE_OAUTH_TOKEN_KEY),
    value = vault.seal({ token: 'private' });
  assert.deepEqual(vault.open(value), { token: 'private' });
  assert.throws(() => tokenVault('cd'.repeat(32)).open(value));
  const bytes = Buffer.from(value, 'base64url');
  bytes[15] ^= 1;
  assert.throws(() => vault.open(bytes.toString('base64url')));
});

await test('stable provider subjects preserve local identity; provider linking cannot take another account', async (t) => {
  const { db, auth } = fixture(t);
  const first = await auth.socialLogin(identity());
  const again = await auth.socialLogin({ ...identity(), name: 'New name' });
  assert.equal(first.user.id, again.user.id);
  assert.equal(auth.hasPassword(first.user.id), false);
  assert.throws(
    () => auth.unlinkSocial(first.user.id, 'google'),
    /backup password/,
  );
  const local = await auth.register({
    username: 'local',
    displayName: 'A member',
    password,
  });
  assert.throws(
    () => auth.linkSocial(local.user.id, identity()),
    /another VergeCommon/,
  );
  assert.notEqual(local.user.id, first.user.id);
  auth.linkSocial(local.user.id, identity('local-provider'));
  assert.equal(
    (await auth.socialLogin(identity('local-provider'))).user.id,
    local.user.id,
  );
  assert.throws(
    () => auth.linkSocial(local.user.id, identity('replacement')),
    /Remove/,
  );
  auth.unlinkSocial(local.user.id, 'google');
  assert.equal(
    db.prepare('SELECT count(*) n FROM social_revocations').get().n,
    1,
  );
  const tombstone = db
    .prepare('SELECT deleted_at FROM social_identity_tombstones')
    .get();
  assert.throws(
    () =>
      auth.linkSocial(local.user.id, {
        ...identity('local-provider'),
        startedAt: tombstone.deleted_at - 1,
      }),
    /changed/,
  );
});

await test('social recovery enables a backup password and deletion queues revocation without allowing stale re-registration', async (t) => {
  const { db, auth } = fixture(t);
  const item = identity();
  const user = await auth.socialLogin(item);
  await auth.recover({
    username: user.user.username,
    recoveryCode: user.recoveryCode,
    password,
  });
  assert.equal(auth.hasPassword(user.user.id), true);
  assert.equal(await auth.checkPassword(user.user.id, password), true);
  await assert.rejects(
    auth.closeSocial(user.user.id, identity('someone-else')),
    /already linked/,
  );
  await auth.closeSocial(user.user.id, item);
  assert.equal(
    auth.authenticate({ cookie: `vc_session=${user.session}` }),
    null,
  );
  assert.equal(
    db.prepare('SELECT count(*) n FROM social_identities').get().n,
    0,
  );
  assert.equal(
    db.prepare('SELECT count(*) n FROM social_revocations').get().n,
    1,
  );
  const deleted = db
    .prepare('SELECT deleted_at FROM social_identity_tombstones')
    .get().deleted_at;
  await assert.rejects(
    auth.socialLogin({ ...item, startedAt: deleted }),
    /changed/,
  );
  const fresh = await auth.socialLogin({ ...item, startedAt: deleted + 1 });
  assert.notEqual(fresh.user.id, user.user.id);
});

await test('concurrent first sign-ins create only one account', async (t) => {
  const { db, auth } = fixture(t);
  const results = await Promise.all([
    auth.socialLogin(identity()),
    auth.socialLogin(identity()),
  ]);
  assert.equal(results[0].user.id, results[1].user.id);
  assert.equal(db.prepare('SELECT count(*) n FROM users').get().n, 1);
});

async function flowFixture(t, options = {}) {
  const f = fixture(t);
  let now = Date.now();
  let exchanges = 0;
  let failRevoke = false;
  const adapter = {
    authorize: async (provider, flow, state) =>
      `https://provider.invalid/?state=${state}`,
    exchange: async (provider) => {
      exchanges++;
      return {
        provider,
        subject: 'browser-subject',
        token: 'credential',
        hint: 'access_token',
      };
    },
    revoke: async () => {
      if (failRevoke) throw new Error('offline');
    },
  };
  const social = await createSocialAuth({
    ...f,
    origin,
    env: { ...env, ...options.env },
    adapter,
    now: () => now,
  });
  const request = async (
    path,
    { method = 'GET', body = '', cookies = '', requestOrigin = origin } = {},
  ) => {
    const headers = {
      cookie: cookies,
      origin: requestOrigin,
      'content-type': 'application/x-www-form-urlencoded',
    };
    const output = { headers: {} };
    await social.handle({
      req: { method, headers },
      res: { setHeader: (key, value) => (output.headers[key] = value) },
      url: new URL(path, origin),
      principal: f.auth.authenticate(headers),
      readBody: async () => Buffer.from(body),
      page: (status, data) => Object.assign(output, { status, data }),
      json: (status, data) => Object.assign(output, { status, data }),
      redirect: (location) => Object.assign(output, { status: 303, location }),
      cookie: (session) => `vc_session=${session}`,
      client: 'test',
    });
    return output;
  };
  return {
    ...f,
    social,
    request,
    advance: () => (now += 600001),
    exchanges: () => exchanges,
    failRevocation: () => (failRevoke = true),
  };
}

await test('OAuth flow binds browser proof, validates origin, consumes callbacks once, and creates sessions only on confirmed POST', async (t) => {
  const f = await flowFixture(t);
  assert.equal(
    (
      await f.request('/auth/social/start', {
        method: 'POST',
        body: 'action=login&provider=google',
        requestOrigin: 'https://evil.invalid',
      })
    ).status,
    403,
  );
  const start = await f.request('/auth/social/start', {
    method: 'POST',
    body: 'action=login&provider=google&returnTo=https://evil.invalid',
  });
  const state = new URL(start.location).searchParams.get('state'),
    cookies = start.headers['set-cookie'].split(';')[0];
  assert.match(start.headers['set-cookie'], /HttpOnly.*Secure; SameSite=None/);
  const callback = `/auth/social/google/callback?state=${state}&code=code`;
  assert.equal((await f.request(callback)).status, 400);
  assert.equal(f.exchanges(), 0);
  assert.equal((await f.request(callback, { cookies })).status, 303);
  assert.equal(f.exchanges(), 1);
  assert.equal((await f.request(callback, { cookies })).status, 400);
  assert.equal(f.exchanges(), 1);
  assert.equal(
    (await f.request(`/auth/social/finish?state=${state}`, { cookies })).status,
    200,
  );
  assert.equal(f.db.prepare('SELECT count(*) n FROM users').get().n, 0);
  const finish = await f.request('/auth/social/finish', {
    method: 'POST',
    body: `state=${state}`,
    cookies,
  });
  assert.equal(finish.status, 201);
  assert.equal(finish.data.returnTo, '/workspace/');
  assert.ok(finish.data.recoveryCode);
  assert.equal(
    (
      await f.request('/auth/social/finish', {
        method: 'POST',
        body: `state=${state}`,
        cookies,
      })
    ).status,
    400,
  );
});

await test('expired browser flows fail; queued revocation survives provider failures and retries', async (t) => {
  const f = await flowFixture(t);
  const start = await f.request('/auth/social/start', {
    method: 'POST',
    body: 'action=login&provider=google',
  });
  f.advance();
  const state = new URL(start.location).searchParams.get('state');
  assert.equal(
    (
      await f.request(`/auth/social/google/callback?state=${state}&code=code`, {
        cookies: start.headers['set-cookie'].split(';')[0],
      })
    ).status,
    400,
  );
  const user = await f.auth.socialLogin(identity());
  await f.auth.closeSocial(user.user.id, identity());
  f.failRevocation();
  await assert.rejects(f.social.drainRevocations(), /offline/);
  assert.equal(
    f.db.prepare('SELECT count(*) n FROM social_revocations').get().n,
    1,
  );
  const retry = await createSocialAuth({
    ...f,
    origin,
    env,
    adapter: { revoke: async () => {} },
  });
  await retry.drainRevocations();
  assert.equal(
    f.db.prepare('SELECT count(*) n FROM social_revocations').get().n,
    0,
  );
});

await test('real OIDC verifier checks signature, issuer, audience and nonce and sends Google PKCE verifier', async () => {
  const keys = await generateKeyPair('RS256'),
    wrong = await generateKeyPair('RS256');
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: 'test',
    alg: 'RS256',
    use: 'sig',
  };
  let variant = 'good';
  const adapter = await createProviderAdapter(
    { google: { CLIENT_ID: 'client', CLIENT_SECRET: 'secret' } },
    async (url, options) => {
      if (String(url).includes('/certs')) return Response.json({ keys: [jwk] });
      assert.equal(
        new URLSearchParams(options.body).get('code_verifier'),
        'verifier',
      );
      const jwt = await new SignJWT({
        nonce: variant === 'nonce' ? 'wrong' : 'nonce',
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setSubject('subject')
        .setIssuer(
          variant === 'issuer'
            ? 'https://evil.invalid'
            : 'https://accounts.google.com',
        )
        .setAudience(variant === 'audience' ? 'other-client' : 'client')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(variant === 'signature' ? wrong.privateKey : keys.privateKey);
      return Response.json({
        access_token: 'access',
        token_type: 'Bearer',
        id_token: jwt,
      });
    },
  );
  const flow = { state: 'state', nonce: 'nonce', verifier: 'verifier' };
  const callback = new URL(
    `${origin}/auth/social/google/callback?state=state&code=code`,
  );
  assert.equal(
    (await adapter.exchange('google', flow, callback)).subject,
    'subject',
  );
  for (const bad of ['nonce', 'issuer', 'audience', 'signature']) {
    variant = bad;
    await assert.rejects(
      adapter.exchange('google', flow, callback),
      undefined,
      bad,
    );
  }
});

await test('link confirmation requires consent and the original live browser session', async (t) => {
  const f = await flowFixture(t);
  const user = await f.auth.register({
    username: 'member',
    displayName: 'Member',
    password,
  });
  const session = `vc_session=${user.session}`;
  const start = await f.request('/auth/social/start', {
    method: 'POST',
    body: new URLSearchParams({
      action: 'link',
      provider: 'google',
      password,
    }).toString(),
    cookies: session,
  });
  assert.equal(start.status, 303);
  const state = new URL(start.location).searchParams.get('state'),
    cookies = `${session}; ${start.headers['set-cookie'].split(';')[0]}`;
  await f.request(`/auth/social/google/callback?state=${state}&code=code`, {
    cookies,
  });
  assert.equal(
    (
      await f.request('/auth/social/finish', {
        method: 'POST',
        body: `state=${state}`,
        cookies,
      })
    ).status,
    400,
  );
  assert.deepEqual(f.auth.identities(user.user.id), []);
  f.auth.logout({ cookie: session });
  assert.equal(
    (
      await f.request('/auth/social/finish', {
        method: 'POST',
        body: `state=${state}&consent=yes`,
        cookies,
      })
    ).status,
    400,
  );
  assert.deepEqual(f.auth.identities(user.user.id), []);
});

await test('Apple cross-site POST callback requires browser proof, while other cross-origin writes stay forbidden', async (t) => {
  const f = await flowFixture(t, {
    env: {
      VERGE_APPLE_ENABLED: '1',
      VERGE_APPLE_CLIENT_ID: 'service',
      VERGE_APPLE_TEAM_ID: 'team',
      VERGE_APPLE_KEY_ID: 'key',
      VERGE_APPLE_PRIVATE_KEY_FILE: '/test-only/unused',
    },
  });
  const start = await f.request('/auth/social/start', {
    method: 'POST',
    body: 'action=login&provider=apple',
  });
  assert.equal(start.status, 303);
  const state = new URL(start.location).searchParams.get('state'),
    cookies = start.headers['set-cookie'].split(';')[0];
  const callback = '/auth/social/apple/callback';
  assert.equal(
    (
      await f.request(callback, {
        method: 'POST',
        body: `state=${state}&code=code`,
        requestOrigin: 'https://appleid.apple.com',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request(callback, {
        method: 'POST',
        body: `state=${state}&code=code`,
        cookies,
        requestOrigin: 'https://appleid.apple.com',
      })
    ).status,
    303,
  );
  assert.equal(
    (
      await f.request('/auth/social/finish', {
        method: 'POST',
        body: `state=${state}`,
        cookies,
        requestOrigin: 'https://appleid.apple.com',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/auth/social/finish', {
        method: 'POST',
        body: `state=${state}`,
        cookies,
      })
    ).status,
    201,
  );
});
