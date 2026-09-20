import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPair, exportJWK, exportPKCS8, SignJWT } from 'jose';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
function fixture(t, now = Date.now) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  t.after(() => db.close());
  return { db, auth: createAuth(db, now) };
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
  let now = Date.now();
  const f = fixture(t, () => now);
  let exchanges = 0;
  const emailRequests = [];
  let failRevoke = false;
  const adapter = {
    supportsSupabase: options.supabase,
    sendEmail: async (flow, state, callback, email) => {
      emailRequests.push({ flow, state, callback, email });
      if (options.emailFails) throw new Error('private upstream failure');
    },
    authorize: async (provider, flow, state) =>
      `https://provider.invalid/?state=${state}`,
    exchange: async (provider) => {
      exchanges++;
      return {
        provider,
        subject: 'browser-subject',
        token: 'credential',
        hint: 'access_token',
        ...(options.supabase
          ? {
              credential: {
                token: 'credential',
                hint: 'access_token',
                broker: {
                  userId: 'ab000000-0000-4000-8000-000000000001',
                  project: 'https://tizcemlockjetjaqnnlt.supabase.co',
                },
              },
            }
          : {}),
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
    emailRequests,
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

await test('Supabase Apple callback uses browser-bound GET, rejects old callback, and preserves cleanup metadata', async (t) => {
  const f = await flowFixture(t, {
    supabase: true,
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
  const state = new URL(start.location).searchParams.get('state');
  const cookies = start.headers['set-cookie'].split(';')[0];
  const callback = `/auth/social/apple/supabase-callback?state=${state}&code=code`;
  assert.equal((await f.request(callback)).status, 400);
  assert.equal(
    (
      await f.request(`/auth/social/apple/callback?state=${state}&code=code`, {
        cookies,
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.request(callback, { cookies, method: 'POST' })).status,
    400,
  );
  assert.equal(f.exchanges(), 0);
  assert.equal((await f.request(callback, { cookies })).status, 303);
  assert.equal((await f.request(callback, { cookies })).status, 400);
  const finish = await f.request('/auth/social/finish', {
    method: 'POST',
    cookies,
    body: `state=${state}`,
  });
  assert.equal(finish.status, 201);
  const row = f.db
    .prepare('SELECT encrypted_token FROM social_identities')
    .get();
  assert.ok(!row.encrypted_token.includes('ab000000'));
  const credential = tokenVault(env.VERGE_OAUTH_TOKEN_KEY).open(
    row.encrypted_token,
  );
  assert.equal(
    credential.broker.project,
    'https://tizcemlockjetjaqnnlt.supabase.co',
  );
  await f.auth.closeSocial(finish.data.user.id, {
    ...identity('browser-subject'),
    provider: 'apple',
    encryptedToken: row.encrypted_token,
  });
  const oldBackend = await createSocialAuth({
    ...f,
    origin,
    env: {
      ...env,
      VERGE_APPLE_ENABLED: '1',
      VERGE_APPLE_CLIENT_ID: 'service',
      VERGE_APPLE_TEAM_ID: 'team',
      VERGE_APPLE_KEY_ID: 'key',
      VERGE_APPLE_PRIVATE_KEY_FILE: '/test-only/unused',
    },
    adapter: {
      revoke: async () => assert.fail('must not silently skip broker cleanup'),
    },
  });
  await assert.rejects(oldBackend.drainRevocations(), /Supabase configuration/);
  assert.equal(
    f.db.prepare('SELECT count(*) n FROM social_revocations').get().n,
    1,
  );
  await f.social.drainRevocations();
  assert.equal(
    f.db.prepare('SELECT count(*) n FROM social_revocations').get().n,
    0,
  );
});

await test('Google broker identity comes from the provider access token, not broker profile metadata', async () => {
  const adapter = await createProviderAdapter(
    { google: { CLIENT_ID: 'client', CLIENT_SECRET: 'secret' } },
    async (url, init) => {
      assert.equal(
        String(url),
        'https://openidconnect.googleapis.com/v1/userinfo',
      );
      assert.equal(
        new Headers(init.headers).get('authorization'),
        'Bearer verified-access',
      );
      return Response.json({
        sub: 'google-subject',
        email: 'not-an-account-key@example.invalid',
      });
    },
  );
  assert.equal(
    await adapter.verifyBrokerIdentity(
      'google',
      {
        provider_token: 'verified-access',
      },
      'google-subject',
    ),
    'google-subject',
  );
});

await test('Apple broker refresh verifies signed identity, issuer and audience before account binding', async (t) => {
  const signing = await generateKeyPair('ES256', { extractable: true });
  const issuerKeys = await generateKeyPair('RS256');
  const wrongKeys = await generateKeyPair('RS256');
  const directory = await mkdtemp(join(tmpdir(), 'verge-apple-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const keyPath = join(directory, 'synthetic.p8');
  await writeFile(keyPath, await exportPKCS8(signing.privateKey), {
    mode: 0o600,
  });
  const jwk = {
    ...(await exportJWK(issuerKeys.publicKey)),
    kid: 'apple-test',
    alg: 'RS256',
    use: 'sig',
  };
  let variant = 'good';
  const adapter = await createProviderAdapter(
    {
      apple: {
        CLIENT_ID: 'com.test.web',
        TEAM_ID: 'test-team',
        KEY_ID: 'test-key',
        PRIVATE_KEY_FILE: keyPath,
      },
    },
    async (url, init) => {
      if (String(url).endsWith('/auth/keys'))
        return Response.json({ keys: [jwk] });
      assert.equal(String(url), 'https://appleid.apple.com/auth/token');
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('grant_type'), 'refresh_token');
      assert.equal(body.get('refresh_token'), 'apple-refresh');
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: 'apple-test' })
        .setSubject('apple-subject')
        .setIssuer(
          variant === 'issuer'
            ? 'https://other.invalid'
            : 'https://appleid.apple.com',
        )
        .setAudience(variant === 'audience' ? 'other-client' : 'com.test.web')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(
          variant === 'signature'
            ? wrongKeys.privateKey
            : issuerKeys.privateKey,
        );
      return Response.json({
        access_token: 'fresh-apple-access',
        token_type: 'Bearer',
        id_token: token,
      });
    },
  );
  assert.equal(
    await adapter.verifyBrokerIdentity('apple', {
      provider_refresh_token: 'apple-refresh',
    }),
    'apple-subject',
  );
  for (const value of ['issuer', 'audience', 'signature']) {
    variant = value;
    await assert.rejects(
      adapter.verifyBrokerIdentity('apple', {
        provider_refresh_token: 'apple-refresh',
      }),
    );
  }
});

const emailEnv = { VERGE_SOCIAL_BACKEND: 'supabase', VERGE_EMAIL_ENABLED: '1' };
await test('email link creates and returns to one account; proof, confirmation, replay and address limits apply', async (t) => {
  const f = await flowFixture(t, { supabase: true, env: emailEnv });
  const start = await f.request('/auth/social/start', {
    method: 'POST',
    body: 'action=login&provider=email&email=member%40example.com&returnTo=%2Fworkspace%2F',
  });
  assert.equal(start.status, 200);
  assert.match(start.data.socialContent, /same browser within 10 minutes/);
  const { state, callback } = f.emailRequests[0];
  assert.equal(f.db.prepare('SELECT count(*) n FROM users').get().n, 0);
  assert.ok(
    !JSON.stringify(f.db.prepare('SELECT * FROM social_flows').all()).includes(
      'member@example.com',
    ),
  );
  const cookies = start.headers['set-cookie'].split(';')[0];
  const path = new URL(callback).pathname + `?state=${state}&code=email-code`;
  assert.equal((await f.request(path)).status, 400);
  assert.equal((await f.request(path, { cookies })).status, 303);
  assert.equal((await f.request(path, { cookies })).status, 400);
  assert.equal(
    (
      await f.request('/auth/social/finish', {
        method: 'POST',
        body: `state=${state}`,
        cookies,
        requestOrigin: 'https://wrong.invalid',
      })
    ).status,
    403,
  );
  const completed = await f.request('/auth/social/finish', {
    method: 'POST',
    body: `state=${state}`,
    cookies,
  });
  assert.equal(completed.status, 201);
  assert.deepEqual(f.auth.identities(completed.data.user.id), ['email']);
  assert.equal(
    (
      await f.request('/auth/social/start', {
        method: 'POST',
        body: 'action=login&provider=email&email=MEMBER%40example.com',
      })
    ).status,
    429,
  );
  assert.equal(f.emailRequests.length, 1);
  f.advance();
  const retry = await f.request('/auth/social/start', {
    method: 'POST',
    body: 'action=login&provider=email&email=member%40example.com',
  });
  const retryState = f.emailRequests[1].state;
  const retryCookie = retry.headers['set-cookie'].split(';')[0];
  await f.request(
    `/auth/social/email/supabase-callback?state=${retryState}&code=new-code`,
    { cookies: retryCookie },
  );
  const returning = await f.request('/auth/social/finish', {
    method: 'POST',
    body: `state=${retryState}`,
    cookies: retryCookie,
  });
  assert.equal(returning.status, 303);
  assert.equal(f.db.prepare('SELECT count(*) n FROM users').get().n, 1);
});
await test('email request failures remove pending proof, do not expose provider errors, and preserve other login paths', async (t) => {
  const f = await flowFixture(t, {
    supabase: true,
    env: emailEnv,
    emailFails: true,
  });
  const result = await f.request('/auth/social/start', {
    method: 'POST',
    body: 'action=login&provider=email&email=member%40example.com',
  });
  assert.equal(result.status, 503);
  assert.match(result.data.message, /could not send/);
  assert.ok(!JSON.stringify(result).includes('private upstream'));
  assert.equal(f.db.prepare('SELECT count(*) n FROM social_flows').get().n, 0);
  assert.match(result.headers['set-cookie'], /Max-Age=0/);
  assert.throws(
    () => configuredProviders({ VERGE_EMAIL_ENABLED: '1' }),
    /Supabase/,
  );
});
