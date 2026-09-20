import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createSupabaseProviderAdapter,
  emailDigest,
  normalizeLoginEmail,
} from '../self-hosted/supabase-auth.mjs';
import { welcomePage } from '../self-hosted/account-welcome.mjs';
import { accountPage } from '../self-hosted/account.mjs';
const id = 'ab000000-0000-4000-8000-000000000001';
const origin = 'https://tizcemlockjetjaqnnlt.supabase.co';
const email = 'member@example.com';
const flow = {
  state: 'state',
  verifier: 'verifier',
  nonce: emailDigest(email),
};
const callback = new URL(
  'https://vergecommon.com/auth/social/email/supabase-callback?state=state&code=code',
);
function fixture(options = {}) {
  const calls = [];
  // Synthetic token accepted only by this fixture's /user. Production always
  // asks Supabase to validate the token before interpreting its AMR claims.
  const jwt = [
    'eyJhbGciOiJIUzI1NiJ9',
    Buffer.from(
      JSON.stringify({
        sub: options.wrongSub ? 'wrong' : id,
        iss: origin + '/auth/v1',
        amr: [{ method: options.method || 'otp' }],
      }),
    ).toString('base64url'),
    'synthetic',
  ].join('.');
  const adapter = createSupabaseProviderAdapter({
    env: {
      VERGE_SUPABASE_URL: origin,
      VERGE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      VERGE_SUPABASE_SECRET_KEY: 'sb_secret_test',
    },
    isReferenced: () => Boolean(options.referenced),
    direct: {
      revoke() {
        throw new Error('Email must not revoke another provider');
      },
      verifyBrokerIdentity() {
        throw new Error('Email cannot use social provider verification');
      },
    },
    fetchImplementation: async (url, init) => {
      calls.push({ url, init });
      const path = new URL(url).pathname;
      if (path.endsWith('/otp'))
        return Response.json({}, { status: options.sendFails ? 429 : 200 });
      if (path.endsWith('/token')) return Response.json({ access_token: jwt });
      if (path.endsWith('/user'))
        return Response.json(
          {
            id,
            email: options.wrongEmail ? 'other@example.com' : email,
            email_confirmed_at: options.unconfirmed
              ? null
              : '2026-09-20T00:00:00Z',
            identities: [
              {
                id: options.wrongIdentity ? 'other' : id,
                user_id: id,
                provider: 'email',
              },
            ],
            user_metadata: { email, role: 'admin', provider: 'email' },
          },
          { status: options.invalidToken ? 401 : 200 },
        );
      if (path.endsWith('/logout'))
        return new Response(null, { status: options.logoutFails ? 503 : 204 });
      if (path.includes('/admin/users/')) {
        assert.equal(init.method, 'DELETE');
        assert.equal(init.headers.apikey, 'sb_secret_test');
        return new Response(null, { status: 204 });
      }
      throw new Error('Unexpected request');
    },
  });
  return { adapter, calls };
}
await test('email request is PKCE-bound and sends no admin credential', async () => {
  const { adapter, calls } = fixture();
  await adapter.sendEmail(
    flow,
    'state',
    callback.origin + callback.pathname,
    ' MEMBER@example.com ',
  );
  const { url, init } = calls[0];
  assert.equal(
    new URL(url).searchParams.get('redirect_to'),
    callback.origin + callback.pathname + '?state=state',
  );
  assert.deepEqual(JSON.parse(init.body), {
    email,
    create_user: true,
    code_challenge: createHash('sha256')
      .update(flow.verifier)
      .digest('base64url'),
    code_challenge_method: 's256',
  });
  assert.equal(init.headers.apikey, 'sb_publishable_test');
  for (const value of [
    '',
    'no-address',
    'a@b',
    'x\r\n@example.com',
    '<x>@example.com',
    'a'.repeat(255) + '@example.com',
  ])
    assert.throws(() => normalizeLoginEmail(value));
});
await test('verified email returns only a stable identifier and closes the temporary session', async () => {
  for (const method of ['otp', 'magiclink', 'signup']) {
    const { adapter, calls } = fixture({ method });
    const result = await adapter.exchange('email', flow, callback);
    assert.equal(result.subject, id);
    assert.equal(result.provider, 'email');
    assert.deepEqual(result.credential, {
      broker: { userId: id, project: origin },
    });
    assert.ok(!JSON.stringify(result).includes(email));
    assert.match(calls.at(-1).url, /logout\?scope=local/);
  }
});
await test('email proof rejects unverified, substituted, non-email and invalid token responses', async () => {
  for (const options of [
    { wrongEmail: true },
    { unconfirmed: true },
    { wrongIdentity: true },
    { wrongSub: true },
    { method: 'oauth' },
    { invalidToken: true },
    { logoutFails: true },
  ]) {
    const { adapter, calls } = fixture(options);
    await assert.rejects(adapter.exchange('email', flow, callback));
    assert.match(calls.at(-1).url, /logout/);
  }
});
await test('email cleanup deletes only unreferenced Supabase profiles', async () => {
  for (const referenced of [false, true]) {
    const { adapter, calls } = fixture({ referenced });
    await adapter.revoke('email', { broker: { userId: id, project: origin } });
    assert.equal(calls.length, referenced ? 0 : 1);
  }
  await assert.rejects(fixture().adapter.revoke('email', {}));
});
await test('email UI is opt-in and keeps username access, linking and deletion verification', () => {
  const disabled = welcomePage({});
  assert.ok(!disabled.includes('Continue with email'));
  const enabled = welcomePage({
    socialProviders: [{ id: 'email', name: 'Email' }],
  });
  assert.match(enabled, /Continue with email/);
  assert.match(enabled, /Use a VergeCommon username and password/);
  assert.match(enabled, /same step creates your account/);
  assert.ok(
    !welcomePage({
      mode: 'recover',
      socialProviders: [{ id: 'email' }],
    }).includes('Continue with email'),
  );
  const account = accountPage({
    user: { id, username: 'member', displayName: 'Member' },
    socialProviders: [{ id: 'email', name: 'Email', linked: true }],
  });
  assert.match(account, /Verify with Email/);
  assert.match(account, /name="email" type="email"/);
});
