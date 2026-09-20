import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSupabaseProviderAdapter } from '../self-hosted/supabase-auth.mjs';

const userId = 'ab000000-0000-4000-8000-000000000001';
const env = {
  VERGE_SUPABASE_URL: 'https://tizcemlockjetjaqnnlt.supabase.co',
  VERGE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  VERGE_SUPABASE_SECRET_KEY: 'sb_secret_test',
};
const flow = { state: 'browser-state', verifier: 'private-pkce-verifier' };
const callback = new URL(
  'https://vergecommon.com/auth/social/google/supabase-callback?state=browser-state&code=one-use-code',
);
function fixture(options = {}) {
  const calls = [];
  const adapter = createSupabaseProviderAdapter({
    env: { ...env, ...options.env },
    isReferenced: () => Boolean(options.referenced),
    direct: {
      verifyBrokerIdentity: async (provider, tokens) => {
        calls.push({ verify: provider });
        assert.equal(tokens.provider_token, 'provider-access');
        if (options.verificationFails)
          throw new Error('Invalid provider token');
        return 'verified-provider-subject';
      },
      revoke: async (provider, credential) => {
        calls.push({ revoke: provider });
        assert.equal(credential.token, 'provider-access');
        if (options.revokeFails) throw new Error('Revocation unavailable');
      },
    },
    fetchImplementation: async (url, init) => {
      calls.push({ url, init });
      assert.equal(init.redirect, 'error');
      assert.ok(init.signal);
      const path = new URL(url).pathname;
      if (path.endsWith('/token')) {
        assert.deepEqual(JSON.parse(init.body), {
          auth_code: 'one-use-code',
          code_verifier: flow.verifier,
        });
        assert.equal(init.headers.apikey, env.VERGE_SUPABASE_PUBLISHABLE_KEY);
        if (options.exchangeFails)
          return Response.json(
            { error: 'PRIVATE_PROVIDER_ERROR' },
            { status: 400 },
          );
        return Response.json({
          access_token: 'broker-access',
          provider_token: 'provider-access',
          provider_refresh_token: options.noRefresh
            ? undefined
            : 'apple-refresh',
        });
      }
      if (path.endsWith('/user')) {
        assert.equal(init.headers.Authorization, 'Bearer broker-access');
        return Response.json({
          id: userId,
          is_anonymous: Boolean(options.anonymous),
          user_metadata: {
            full_name: 'A member',
            sub: 'FORGED',
            provider: 'apple',
            role: 'admin',
          },
          identities: [
            {
              id: options.wrongSubject
                ? 'different-subject'
                : 'verified-provider-subject',
              provider: options.provider || 'google',
              user_id: userId,
            },
          ],
        });
      }
      if (path.endsWith('/logout')) {
        assert.equal(new URL(url).search, '?scope=local');
        return new Response(null, { status: options.logoutFails ? 503 : 204 });
      }
      if (path.includes('/admin/users/')) {
        assert.equal(init.headers.apikey, env.VERGE_SUPABASE_SECRET_KEY);
        assert.equal(init.method, 'DELETE');
        assert.equal(path, `/auth/v1/admin/users/${userId}`);
        return new Response(null, {
          status: options.deleteFails
            ? 503
            : options.alreadyDeleted
              ? 404
              : 204,
        });
      }
      throw new Error('Unexpected endpoint');
    },
  });
  return { adapter, calls };
}
await test('Supabase configuration rejects wrong origins and exposed/legacy admin keys', () => {
  for (const url of [
    'http://tizcemlockjetjaqnnlt.supabase.co',
    'https://evil.invalid',
    'https://tizcemlockjetjaqnnlt.supabase.co/path',
    'https://x:y@tizcemlockjetjaqnnlt.supabase.co',
  ]) {
    assert.throws(() => fixture({ env: { VERGE_SUPABASE_URL: url } }));
  }
  assert.throws(() => fixture({ env: { VERGE_SUPABASE_SECRET_KEY: '' } }));
  assert.throws(() =>
    fixture({ env: { VERGE_SUPABASE_SECRET_KEY: 'sb_publishable_wrong' } }),
  );
});
await test('OAuth redirect contains S256 challenge and exact callback but no secrets', async () => {
  const { adapter } = fixture();
  const target = new URL(
    await adapter.authorize(
      'apple',
      flow,
      flow.state,
      callback.origin + '/auth/social/apple/supabase-callback',
    ),
  );
  assert.equal(target.origin, env.VERGE_SUPABASE_URL);
  assert.equal(adapter.authorizationOrigin, target.origin);
  assert.equal(target.searchParams.get('provider'), 'apple');
  assert.equal(
    target.searchParams.get('code_challenge'),
    createHash('sha256').update(flow.verifier).digest('base64url'),
  );
  assert.equal(target.searchParams.get('code_challenge_method'), 's256');
  assert.equal(
    target.searchParams.get('redirect_to'),
    callback.origin +
      '/auth/social/apple/supabase-callback?state=browser-state',
  );
  assert.ok(
    !target.href.includes('sb_secret') && !target.href.includes(flow.verifier),
  );
});
await test('PKCE exchange keeps stable provider subject, ignores editable metadata, and ends broker session', async () => {
  const { adapter, calls } = fixture();
  const result = await adapter.exchange('google', flow, callback);
  assert.equal(result.subject, 'verified-provider-subject');
  assert.equal(result.credential.broker.userId, userId);
  assert.equal(result.credential.token, 'provider-access');
  assert.ok(!JSON.stringify(result).includes('broker-access'));
  assert.ok(calls.at(-1).url.includes('/logout'));
});
await test('wrong browser state and cancelled sign-ins never exchange a code', async () => {
  const { adapter, calls } = fixture();
  await assert.rejects(
    adapter.exchange('google', { ...flow, state: 'other' }, callback),
  );
  const cancelled = new URL(callback);
  cancelled.searchParams.set('error', 'access_denied');
  await assert.rejects(adapter.exchange('google', flow, cancelled));
  assert.equal(calls.length, 0);
});
await test('cross-provider, forged subject, anonymous and unverifiable identities cannot authenticate', async () => {
  for (const options of [
    { provider: 'apple' },
    { wrongSubject: true },
    { anonymous: true },
    { verificationFails: true },
  ]) {
    const { adapter, calls } = fixture(options);
    await assert.rejects(adapter.exchange('google', flow, callback));
    assert.ok(calls.at(-1).url.includes('/logout'));
  }
});
await test('Apple requires a revocable credential; upstream and session-cleanup failures stay closed', async () => {
  await assert.rejects(
    fixture({ noRefresh: true }).adapter.exchange('apple', flow, callback),
  );
  await assert.rejects(
    fixture({ logoutFails: true }).adapter.exchange('google', flow, callback),
  );
  await assert.rejects(
    fixture({ exchangeFails: true }).adapter.exchange('google', flow, callback),
    (error) => !error.message.includes('PRIVATE_PROVIDER_ERROR'),
  );
});
const credential = {
  token: 'provider-access',
  hint: 'access_token',
  broker: { userId, project: env.VERGE_SUPABASE_URL },
};
await test('deletion revokes provider and removes an unreferenced broker profile; retry of missing profile succeeds', async () => {
  for (const options of [{}, { alreadyDeleted: true }]) {
    const { adapter, calls } = fixture(options);
    await adapter.revoke('google', credential);
    assert.equal(calls[0].revoke, 'google');
    assert.ok(calls[1].url.includes('/admin/users/'));
  }
});
await test('cleanup preserves broker profiles referenced by other local identities and handles old direct credentials', async () => {
  const { adapter, calls } = fixture({ referenced: true });
  await adapter.revoke('google', credential);
  await adapter.revoke('google', {
    token: 'provider-access',
    hint: 'access_token',
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.revoke));
});
await test('cleanup failures remain retryable and credentials cannot target a different project', async () => {
  await assert.rejects(
    fixture({ deleteFails: true }).adapter.revoke('google', credential),
  );
  const { adapter, calls } = fixture({ revokeFails: true });
  await assert.rejects(adapter.revoke('google', credential));
  assert.equal(calls.length, 1);
  const other = fixture();
  await assert.rejects(
    other.adapter.revoke('google', {
      ...credential,
      broker: { ...credential.broker, project: 'https://other.supabase.co' },
    }),
  );
  assert.equal(other.calls.length, 0);
});
