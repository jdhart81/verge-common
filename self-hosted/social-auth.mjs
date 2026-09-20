import * as oidc from 'openid-client';
import { importPKCS8, SignJWT } from 'jose';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { digest } from './auth.mjs';
import { escape } from './account.mjs';
import {
  createSupabaseProviderAdapter,
  normalizeLoginEmail,
  emailDigest,
} from './supabase-auth.mjs';

const labels = { google: 'Google', apple: 'Apple', email: 'Email' };
const issuers = {
  google: 'https://accounts.google.com',
  apple: 'https://appleid.apple.com',
};
const secret = () => randomBytes(32).toString('base64url');
const safeReturn = (value) => {
  try {
    const u = new URL(value || '/workspace/', 'https://local.invalid');
    return u.origin === 'https://local.invalid' &&
      !/^\/(auth|account|signin|signout)/.test(u.pathname)
      ? u.pathname + u.search + u.hash
      : '/workspace/';
  } catch {
    return '/workspace/';
  }
};
export function tokenVault(hex) {
  if (!/^[a-f0-9]{64}$/i.test(hex || ''))
    throw new Error(
      'Configure a 32-byte VERGE_OAUTH_TOKEN_KEY before enabling social sign-in.',
    );
  const key = Buffer.from(hex, 'hex');
  return {
    seal(value) {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
      return Buffer.concat([
        iv,
        cipher.update(JSON.stringify(value)),
        cipher.final(),
        cipher.getAuthTag(),
      ]).toString('base64url');
    },
    open(value) {
      const bytes = Buffer.from(value, 'base64url');
      if (bytes.length < 29) throw new Error('Invalid encrypted credential.');
      const cipher = createDecipheriv(
        'aes-256-gcm',
        key,
        bytes.subarray(0, 12),
      );
      cipher.setAuthTag(bytes.subarray(-16));
      return JSON.parse(
        Buffer.concat([
          cipher.update(bytes.subarray(12, -16)),
          cipher.final(),
        ]).toString(),
      );
    },
  };
}
export function configuredProviders(env = process.env) {
  const providers = {};
  for (const id of Object.keys(labels)) {
    const prefix = `VERGE_${id.toUpperCase()}_`;
    if (env[prefix + 'ENABLED'] !== '1') continue;
    if (id === 'email') {
      if (env.VERGE_SOCIAL_BACKEND !== 'supabase')
        throw new Error(
          'Email links require the Supabase authentication backend.',
        );
      providers.email = {};
      continue;
    }
    const keys =
      id === 'google'
        ? ['CLIENT_ID', 'CLIENT_SECRET']
        : ['CLIENT_ID', 'TEAM_ID', 'KEY_ID', 'PRIVATE_KEY_FILE'];
    for (const key of keys)
      if (!env[prefix + key]) throw new Error(`Missing ${prefix + key}.`);
    providers[id] = Object.fromEntries(
      keys.map((key) => [key, env[prefix + key]]),
    );
  }
  return providers;
}
export async function createProviderAdapter(settings, fetchImplementation) {
  const configuration = async (provider) => {
    const s = settings[provider];
    if (!s) throw new Error('Provider is unavailable.');
    let clientSecret = s.CLIENT_SECRET;
    if (provider === 'apple') {
      const key = await importPKCS8(
        await readFile(s.PRIVATE_KEY_FILE, 'utf8'),
        'ES256',
      );
      clientSecret = await new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: s.KEY_ID })
        .setIssuer(s.TEAM_ID)
        .setSubject(s.CLIENT_ID)
        .setAudience(issuers.apple)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(key);
    }
    const metadata =
      provider === 'google'
        ? {
            issuer: issuers.google,
            authorization_endpoint:
              'https://accounts.google.com/o/oauth2/v2/auth',
            token_endpoint: 'https://oauth2.googleapis.com/token',
            jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
            userinfo_endpoint:
              'https://openidconnect.googleapis.com/v1/userinfo',
            revocation_endpoint: 'https://oauth2.googleapis.com/revoke',
          }
        : {
            issuer: issuers.apple,
            authorization_endpoint: issuers.apple + '/auth/authorize',
            token_endpoint: issuers.apple + '/auth/token',
            jwks_uri: issuers.apple + '/auth/keys',
            revocation_endpoint: issuers.apple + '/auth/revoke',
          };
    const config = new oidc.Configuration(
      metadata,
      s.CLIENT_ID,
      { client_secret: clientSecret, id_token_signed_response_alg: 'RS256' },
      oidc.ClientSecretPost(clientSecret),
    );
    config.timeout = 10;
    if (fetchImplementation) config[oidc.customFetch] = fetchImplementation;
    oidc.enableNonRepudiationChecks(config);
    return config;
  };
  for (const provider of Object.keys(settings)) await configuration(provider);
  return {
    async authorize(provider, flow, state, redirectUri) {
      const parameters = {
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: provider === 'apple' ? 'email name' : 'openid email profile',
        state,
        nonce: flow.nonce,
      };
      if (provider === 'google') {
        parameters.code_challenge = await oidc.calculatePKCECodeChallenge(
          flow.verifier,
        );
        parameters.code_challenge_method = 'S256';
        parameters.prompt = 'select_account';
      } else parameters.response_mode = 'form_post';
      return oidc.buildAuthorizationUrl(
        await configuration(provider),
        parameters,
      ).href;
    },
    async exchange(provider, flow, callback) {
      const tokens = await oidc.authorizationCodeGrant(
        await configuration(provider),
        callback,
        {
          expectedState: flow.state,
          expectedNonce: flow.nonce,
          idTokenExpected: true,
          ...(provider === 'google' ? { pkceCodeVerifier: flow.verifier } : {}),
        },
      );
      const claims = tokens.claims();
      if (
        !claims?.sub ||
        typeof claims.sub !== 'string' ||
        claims.sub.length > 255
      )
        throw new Error('Invalid provider identity.');
      const token =
        provider === 'apple' ? tokens.refresh_token : tokens.access_token;
      if (typeof token !== 'string' || !token || token.length > 16000)
        throw new Error('Provider did not supply a revocable credential.');
      return {
        provider,
        subject: claims.sub,
        name: typeof claims.name === 'string' ? claims.name : '',
        token,
        hint: provider === 'apple' ? 'refresh_token' : 'access_token',
      };
    },
    async revoke(provider, credential) {
      const config = await configuration(provider);
      try {
        await oidc.tokenRevocation(config, credential.token, {
          token_type_hint: credential.hint,
        });
      } catch (error) {
        if (error.error !== 'invalid_token') throw error;
      }
    },
    async verifyBrokerIdentity(provider, tokens, expectedSubject) {
      const config = await configuration(provider);
      const claims =
        provider === 'google'
          ? await oidc.fetchUserInfo(
              config,
              tokens.provider_token,
              expectedSubject,
            )
          : (
              await oidc.refreshTokenGrant(
                config,
                tokens.provider_refresh_token,
              )
            ).claims();
      if (
        !claims?.sub ||
        typeof claims.sub !== 'string' ||
        claims.sub.length > 255
      )
        throw new Error('Invalid provider identity.');
      return claims.sub;
    },
  };
}

export async function createSocialAuth({
  db,
  auth,
  origin,
  env = process.env,
  adapter,
  now = Date.now,
}) {
  const settings = configuredProviders(env),
    enabled = Object.keys(settings);
  if (!enabled.length) return null;
  if (
    !origin.startsWith('https://') &&
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
  )
    throw new Error('Social login requires HTTPS.');
  const vault = tokenVault(env.VERGE_OAUTH_TOKEN_KEY);
  if (!adapter) {
    const direct = await createProviderAdapter(
      Object.fromEntries(
        Object.entries(settings).filter(([id]) => id !== 'email'),
      ),
    );
    const backend = env.VERGE_SOCIAL_BACKEND || 'direct';
    if (!['direct', 'supabase'].includes(backend))
      throw new Error('Unknown social sign-in backend.');
    adapter =
      backend === 'supabase'
        ? createSupabaseProviderAdapter({
            env,
            direct,
            isReferenced: (userId) =>
              db
                .prepare('SELECT encrypted_token FROM social_identities')
                .all()
                .some(
                  (row) =>
                    vault.open(row.encrypted_token).broker?.userId === userId,
                ),
          })
        : direct;
  }
  db.exec(
    `CREATE TABLE IF NOT EXISTS social_flows (hash TEXT PRIMARY KEY, proof_hash TEXT NOT NULL, provider TEXT NOT NULL, action TEXT NOT NULL, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, session_hash TEXT, return_to TEXT NOT NULL, nonce TEXT NOT NULL, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL, phase TEXT NOT NULL, result TEXT);`,
  );
  const cookieName = 'vc_social_flow';
  const flowCookie = (value, age = 600) =>
    `${cookieName}=${value}; HttpOnly; Path=/auth/social/; Max-Age=${age}; ${origin.startsWith('https:') ? 'Secure; SameSite=None' : 'SameSite=Lax'}`;
  const cookieValue = (headers, name) =>
    (headers.cookie || '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + '='))
      ?.slice(name.length + 1) || '';
  const getFlow = (state, headers, phase) => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(state || ''))
      throw new Error('Sign-in expired. Please start again.');
    const flow = db
      .prepare(
        'SELECT * FROM social_flows WHERE hash=? AND expires_at>? AND phase=?',
      )
      .get(digest(state), now(), phase);
    if (!flow || digest(cookieValue(headers, cookieName)) !== flow.proof_hash)
      throw new Error(
        'Sign-in expired or belongs to another browser. Please start again.',
      );
    return flow;
  };
  const sameAccount = (flow, headers, principal) => {
    if (flow.action === 'login') {
      if (principal)
        throw new Error('Sign out before signing in to another account.');
      return;
    }
    if (
      principal?.kind !== 'session' ||
      principal.id !== flow.user_id ||
      digest(cookieValue(headers, 'vc_session')) !== flow.session_hash
    )
      throw new Error(
        'Your account session changed. Start again from Your account.',
      );
  };
  const api = {
    formActionOrigins: [
      'https://accounts.google.com',
      'https://appleid.apple.com',
      ...(adapter.authorizationOrigin ? [adapter.authorizationOrigin] : []),
    ],
    available(id) {
      const linked = id ? auth.identities(id) : [];
      return enabled.map((provider) => ({
        id: provider,
        name: labels[provider],
        linked: linked.includes(provider),
      }));
    },
    async drainRevocations() {
      db.prepare('DELETE FROM social_flows WHERE expires_at<=?').run(now());
      for (const row of db
        .prepare('SELECT * FROM social_revocations ORDER BY id LIMIT 20')
        .all()) {
        if (!settings[row.provider])
          throw new Error('Provider revocation configuration is required.');
        const credential = vault.open(row.encrypted_token);
        if (credential.broker && !adapter.supportsSupabase)
          throw new Error(
            'Supabase configuration required for pending account cleanup.',
          );
        await adapter.revoke(row.provider, credential);
        db.prepare('DELETE FROM social_revocations WHERE id=?').run(row.id);
      }
      if (db.prepare('SELECT id FROM social_revocations LIMIT 1').get())
        throw new Error('Provider revocations remain pending.');
    },
    async handle({
      req,
      res,
      url,
      principal,
      readBody,
      page,
      json,
      redirect,
      cookie,
      client,
    }) {
      if (!url.pathname.startsWith('/auth/social/')) return false;
      res.setHeader('cache-control', 'no-store');
      res.setHeader('referrer-policy', 'no-referrer');
      try {
        if (req.headers.authorization)
          throw new Error('Use a signed-in browser for account changes.');
        if (
          !auth.rateLimit(`social:${client}`, 20, 15 * 60000) ||
          !auth.rateLimit('social:global', 100, 60000)
        )
          return json(429, {
            error: 'Too many sign-in attempts. Try again later.',
          });
        db.prepare('DELETE FROM social_flows WHERE expires_at<=?').run(now());
        const callbackMatch =
          /^\/auth\/social\/(google|apple|email)\/(callback|supabase-callback)$/.exec(
            url.pathname,
          );
        if (callbackMatch) {
          const provider = callbackMatch[1];
          const brokerCallback = callbackMatch[2] === 'supabase-callback';
          const postCallback = provider === 'apple' && !brokerCallback;
          if (
            !settings[provider] ||
            brokerCallback !== Boolean(adapter.supportsSupabase) ||
            req.method !== (postCallback ? 'POST' : 'GET')
          )
            throw new Error('Invalid sign-in callback.');
          if (
            postCallback &&
            String(req.headers['content-type']).split(';')[0] !==
              'application/x-www-form-urlencoded'
          )
            throw new Error('Invalid callback format.');
          const raw = postCallback
            ? (await readBody(req, 16000)).toString()
            : url.search.slice(1);
          const params = new URLSearchParams(raw),
            state = params.get('state'),
            flow = getFlow(state, req.headers, 'pending');
          if (
            flow.provider !== provider ||
            [...params.keys()].some((k) => params.getAll(k).length !== 1)
          )
            throw new Error('Invalid sign-in response.');
          // Consume before the network exchange. A timeout must restart OAuth, never replay a code.
          if (
            !db
              .prepare(
                "UPDATE social_flows SET phase='exchanging' WHERE hash=? AND phase='pending'",
              )
              .run(flow.hash).changes
          )
            throw new Error('Sign-in already used.');
          const callback = postCallback
            ? new Request(url, {
                method: 'POST',
                headers: {
                  'content-type': 'application/x-www-form-urlencoded',
                },
                body: raw,
              })
            : url;
          const result = await adapter.exchange(
            provider,
            { ...flow, state },
            callback,
          );
          if (
            result.provider !== provider ||
            typeof result.subject !== 'string' ||
            !result.subject ||
            result.subject.length > 255
          )
            throw new Error('Invalid provider identity.');
          const identity = {
            provider,
            subject: result.subject,
            name: result.name,
            startedAt: flow.expires_at - 600000,
            encryptedToken: vault.seal(
              result.credential || {
                token: result.token,
                hint: result.hint,
              },
            ),
          };
          db.prepare(
            "UPDATE social_flows SET phase='verified',result=?,nonce='',verifier='' WHERE hash=? AND expires_at>?",
          ).run(JSON.stringify(identity), flow.hash, now());
          return redirect(
            `/auth/social/finish?state=${encodeURIComponent(state)}`,
          );
        }
        if (url.pathname === '/auth/social/finish' && req.method === 'GET') {
          const state = url.searchParams.get('state'),
            flow = getFlow(state, req.headers, 'verified');
          sameAccount(flow, req.headers, principal);
          const verb =
            flow.action === 'delete'
              ? 'Permanently delete my account'
              : flow.action === 'link'
                ? 'Link this sign-in method'
                : 'Continue to VergeCommon';
          return page(200, {
            user: principal,
            socialContent: `<h1>${flow.action === 'delete' ? 'Confirm account deletion' : 'Account verified'}</h1><p>Your ${escape(labels[flow.provider])} account was verified.</p>${flow.action === 'delete' ? '<p>This permanently removes your VergeCommon account and authored personal records. Shared de-identified governance records may remain. This does not delete your Google or Apple account.</p>' : ''}<form method="post" action="/auth/social/finish"><input type="hidden" name="state" value="${escape(state)}">${flow.action === 'link' ? '<label><input type="checkbox" name="consent" value="yes" required> I agree to link this provider identity to my VergeCommon account and records.</label>' : ''}<button>${verb}</button></form><p><a href="/account">Cancel and return to account</a></p>`,
          });
        }
        if (
          req.method !== 'POST' ||
          req.headers.origin !== origin ||
          String(req.headers['content-type']).split(';')[0] !==
            'application/x-www-form-urlencoded'
        )
          return json(403, { error: 'Submit this form from VergeCommon.' });
        const data = Object.fromEntries(
          new URLSearchParams((await readBody(req, 16000)).toString()),
        );
        if (url.pathname === '/auth/social/finish') {
          const flow = getFlow(data.state, req.headers, 'verified');
          sameAccount(flow, req.headers, principal);
          if (flow.action === 'link' && data.consent !== 'yes')
            throw new Error('Confirm that you want to link these accounts.');
          db.prepare('DELETE FROM social_flows WHERE hash=?').run(flow.hash);
          const identity = JSON.parse(flow.result);
          res.setHeader('set-cookie', flowCookie('', 0));
          if (flow.action === 'login') {
            const result = await auth.socialLogin(identity);
            res.setHeader('set-cookie', [
              flowCookie('', 0),
              cookie(result.session),
            ]);
            if (result.recoveryCode)
              return page(201, {
                user: result.user,
                recoveryCode: result.recoveryCode,
                returnTo: flow.return_to,
              });
            return redirect(flow.return_to);
          }
          if (flow.action === 'link') {
            auth.linkSocial(principal.id, identity);
            return redirect('/account');
          }
          await auth.closeSocial(principal.id, identity);
          res.setHeader('set-cookie', [flowCookie('', 0), cookie('')]);
          return page(200, {
            message:
              'Your VergeCommon account was deleted and its provider authorization was revoked.',
          });
        }
        if (
          !settings[data.provider] ||
          !['login', 'link', 'delete', 'unlink'].includes(data.action)
        )
          throw new Error('Choose an available sign-in method.');
        if (data.action !== 'login' && principal?.kind !== 'session')
          throw new Error('Sign in to your existing account first.');
        if (data.action === 'login' && principal)
          throw new Error(
            'Use Link from Your account to connect an existing account.',
          );
        if (
          ['link', 'unlink'].includes(data.action) &&
          !(await auth.checkPassword(principal.id, data.password))
        )
          throw new Error(
            'Enter your current VergeCommon password. For a social-only account, use your recovery code to set a backup password first.',
          );
        if (url.pathname !== '/auth/social/start')
          return json(404, { error: 'Unknown sign-in action.' });
        if (principal && auth.authenticate(req.headers)?.id !== principal.id)
          throw new Error('Your session changed. Sign in again.');
        if (data.action === 'unlink') {
          auth.unlinkSocial(principal.id, data.provider);
          await api.drainRevocations();
          return redirect('/account');
        }
        if (
          data.action === 'delete' &&
          !auth.identities(principal.id).includes(data.provider)
        )
          throw new Error('Choose a linked provider to verify deletion.');
        if (url.pathname !== '/auth/social/start')
          return json(404, { error: 'Unknown sign-in action.' });
        const state = secret(),
          proof = secret(),
          flow = { nonce: secret(), verifier: oidc.randomPKCECodeVerifier() };
        let email;
        if (data.provider === 'email') {
          email = normalizeLoginEmail(data.email);
          flow.nonce = emailDigest(email);
          if (
            !auth.rateLimit(`email:${flow.nonce}`, 1, 60000) ||
            !auth.rateLimit(`email-client:${client}`, 5, 15 * 60000) ||
            !auth.rateLimit('email:global', 30, 60 * 60000)
          )
            return json(429, {
              error:
                'Too many email requests. Wait a minute before trying again.',
            });
        }
        db.prepare(
          'INSERT INTO social_flows VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)',
        ).run(
          digest(state),
          digest(proof),
          data.provider,
          data.action,
          principal?.id || null,
          principal ? digest(cookieValue(req.headers, 'vc_session')) : null,
          safeReturn(data.returnTo),
          flow.nonce,
          flow.verifier,
          now() + 600000,
          'pending',
        );
        res.setHeader('set-cookie', flowCookie(proof));
        if (data.provider === 'email') {
          try {
            await adapter.sendEmail(
              flow,
              state,
              `${origin}/auth/social/email/supabase-callback`,
              email,
            );
          } catch {
            db.prepare('DELETE FROM social_flows WHERE hash=?').run(
              digest(state),
            );
            res.setHeader('set-cookie', flowCookie('', 0));
            return page(503, {
              user: principal,
              message:
                'We could not send the sign-in link. Wait a minute and try again, or use another sign-in method.',
            });
          }
          return page(200, {
            user: principal,
            socialContent:
              '<h1>Check your email</h1><p role="status">If this address can receive sign-in emails, a one-time link is on its way. Open it in this same browser within 10 minutes to continue.</p><p>Your first verified sign-in can create an account. Existing members should link email from Your account to keep their co-ops.</p><p><a href="/account">Use another sign-in method or request a new link</a></p>',
          });
        }
        return redirect(
          await adapter.authorize(
            data.provider,
            flow,
            state,
            `${origin}/auth/social/${data.provider}/${adapter.supportsSupabase ? 'supabase-callback' : 'callback'}`,
          ),
        );
      } catch (error) {
        return page(error.status === 503 ? 503 : 400, {
          user: auth.authenticate(req.headers),
          message:
            error.status === 503
              ? error.message
              : 'Sign-in or account change could not be completed. It may have expired, been cancelled, used a different account, or need your current password. Start again from Your account. If deletion was requested, check your account status before retrying.',
        });
      }
    },
  };
  return api;
}
