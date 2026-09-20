import { createHash } from 'node:crypto';
import { decodeJwt } from 'jose';

export function normalizeLoginEmail(value) {
  if (typeof value !== 'string')
    throw new Error('Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))
    throw new Error('Enter a valid email address.');
  return email;
}
export const emailDigest = (email) =>
  createHash('sha256').update(normalizeLoginEmail(email)).digest('hex');

const fail = () => new Error('Supabase authentication could not be completed.');
const validToken = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 32000;
const validId = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// Supabase brokers authentication only. Co-op permissions, account ownership,
// browser sessions and explicit identity linking remain in VergeCommon.
export function createSupabaseProviderAdapter({
  env,
  direct,
  isReferenced,
  fetchImplementation = fetch,
}) {
  const url = new URL(env.VERGE_SUPABASE_URL || 'https://invalid.invalid');
  if (
    url.protocol !== 'https:' ||
    !/^[a-z]{20}\.supabase\.co$/.test(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Configure the dedicated HTTPS VERGE_SUPABASE_URL.');
  const publicKey = env.VERGE_SUPABASE_PUBLISHABLE_KEY;
  const adminKey = env.VERGE_SUPABASE_SECRET_KEY;
  if (
    !publicKey?.startsWith('sb_publishable_') ||
    !adminKey?.startsWith('sb_secret_')
  )
    throw new Error(
      'Supabase publishable and server-only secret keys are required.',
    );
  if (typeof isReferenced !== 'function')
    throw new Error('Account cleanup reference check is required.');
  const request = async (
    path,
    { method = 'GET', token, body, admin = false, missingOk = false } = {},
  ) => {
    const response = await fetchImplementation(`${url.origin}/auth/v1${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        apikey: admin ? adminKey : publicKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (missingOk && response.status === 404) return null;
    if (!response.ok) throw fail(); // Never include provider responses or credentials in errors.
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
  return {
    supportsSupabase: true,
    async sendEmail(flow, state, redirectUri, address) {
      const callback = new URL(redirectUri);
      callback.searchParams.set('state', state);
      await request(`/otp?redirect_to=${encodeURIComponent(callback.href)}`, {
        method: 'POST',
        body: {
          email: normalizeLoginEmail(address),
          create_user: true,
          code_challenge: createHash('sha256')
            .update(flow.verifier)
            .digest('base64url'),
          code_challenge_method: 's256',
        },
      });
    },
    async authorize(provider, flow, state, redirectUri) {
      if (!['google', 'apple'].includes(provider)) throw fail();
      const callback = new URL(redirectUri);
      callback.searchParams.set('state', state);
      const target = new URL('/auth/v1/authorize', url);
      target.search = new URLSearchParams({
        provider,
        redirect_to: callback.href,
        code_challenge: createHash('sha256')
          .update(flow.verifier)
          .digest('base64url'),
        code_challenge_method: 's256',
        ...(provider === 'google' ? { prompt: 'select_account' } : {}),
      }).toString();
      return target.href;
    },
    async exchange(provider, flow, callback) {
      if (
        !['google', 'apple', 'email'].includes(provider) ||
        callback.searchParams.get('state') !== flow.state ||
        callback.searchParams.has('error') ||
        !validToken(callback.searchParams.get('code'))
      )
        throw fail();
      const tokens = await request('/token?grant_type=pkce', {
        method: 'POST',
        body: {
          auth_code: callback.searchParams.get('code'),
          code_verifier: flow.verifier,
        },
      });
      if (!validToken(tokens?.access_token)) throw fail();
      try {
        const user = await request('/user', { token: tokens.access_token });
        if (
          !validId(user?.id) ||
          user.is_anonymous ||
          !Array.isArray(user.identities)
        )
          throw fail();
        if (provider === 'email') {
          // /user has already validated this exact token with Supabase. Never
          // authorize using a decoded token without that server validation.
          const claims = decodeJwt(tokens.access_token);
          const identity = user.identities.filter(
            (item) => item.provider === 'email' && item.user_id === user.id,
          );
          if (
            claims.sub !== user.id ||
            claims.iss !== `${url.origin}/auth/v1` ||
            !Array.isArray(claims.amr) ||
            !claims.amr.some((item) =>
              ['otp', 'magiclink', 'signup'].includes(item.method),
            ) ||
            !user.email_confirmed_at ||
            emailDigest(user.email) !== flow.nonce ||
            identity.length !== 1 ||
            identity[0].id !== user.id
          )
            throw fail();
          return {
            provider,
            subject: user.id,
            name: '',
            credential: { broker: { userId: user.id, project: url.origin } },
          };
        }
        const token =
          provider === 'apple'
            ? tokens.provider_refresh_token
            : tokens.provider_token;
        if (!validToken(token)) throw fail();
        // Automatic email linking in a broker must not let a different provider
        // stand in for the identity being linked or used to authorize deletion.
        const providerIdentities = user.identities.filter(
          (item) => item.provider === provider && item.user_id === user.id,
        );
        if (providerIdentities.length !== 1 || !providerIdentities[0].id)
          throw fail();
        const subject = await direct.verifyBrokerIdentity(
          provider,
          tokens,
          providerIdentities[0].id,
        );
        const identity = user.identities.find(
          (item) =>
            item.provider === provider &&
            item.id === subject &&
            item.user_id === user.id,
        );
        if (
          !identity ||
          typeof subject !== 'string' ||
          !subject ||
          subject.length > 255
        )
          throw fail();
        return {
          provider,
          subject,
          name:
            typeof user.user_metadata?.full_name === 'string'
              ? user.user_metadata.full_name.slice(0, 200)
              : '',
          credential: {
            token,
            hint: provider === 'apple' ? 'refresh_token' : 'access_token',
            broker: { userId: user.id, project: url.origin },
          },
        };
      } finally {
        // The broker session never becomes an app session or reaches the browser.
        await request('/logout?scope=local', {
          method: 'POST',
          token: tokens.access_token,
        });
      }
    },
    async revoke(provider, credential) {
      if (
        credential.broker &&
        (credential.broker.project !== url.origin ||
          !validId(credential.broker.userId))
      )
        throw new Error(
          'Original Supabase project required for account cleanup.',
        );
      if (provider === 'email') {
        if (!credential.broker) throw fail();
      } else await direct.revoke(provider, credential);
      if (credential.broker && !isReferenced(credential.broker.userId)) {
        await request(`/admin/users/${credential.broker.userId}`, {
          method: 'DELETE',
          admin: true,
          missingOk: true,
        });
      }
    },
  };
}
