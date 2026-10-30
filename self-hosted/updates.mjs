import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  updatesEnabled,
  normalizeEmail,
  escapeHtml as esc,
} from '../lib/updates-config.mjs';
import { createResendClient } from './resend.mjs';
export const TTL = 48 * 60 * 60 * 1000;
const consent =
  'Occasional updates about VergeCommon. Unsubscribe anytime. We store your address only with our email provider, Resend.';
const mac = (secret, value) =>
  createHmac('sha256', secret).update(value).digest();
const tokenVersion = 'v1';
const tokenContext = Buffer.from('vergecommon:updates:confirmation:v1');
const tokenKey = (secret) =>
  hkdfSync(
    'sha256',
    Buffer.from(secret),
    Buffer.from('VergeCommon updates'),
    tokenContext,
    32,
  );
export function encryptConfirmation(email, segment, secret, now = Date.now()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenKey(secret), iv);
  cipher.setAAD(tokenContext);
  const plaintext = Buffer.from(
    JSON.stringify({ email, expiry: now + TTL, segment }),
  );
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return `${tokenVersion}.${Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64url')}`;
}
export function verifyConfirmation(token, segment, secret, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const [version, encoded, extra] = token.split('.');
    if (
      version !== tokenVersion ||
      extra !== undefined ||
      !/^[\w-]+$/.test(encoded)
    )
      return null;
    const packed = Buffer.from(encoded, 'base64url');
    if (packed.length <= 28 || packed.toString('base64url') !== encoded)
      return null;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      tokenKey(secret),
      packed.subarray(0, 12),
    );
    decipher.setAAD(tokenContext);
    decipher.setAuthTag(packed.subarray(-16));
    // Native GCM authentication must succeed before parsing or using any plaintext.
    const plaintext = Buffer.concat([
      decipher.update(packed.subarray(12, -16)),
      decipher.final(),
    ]);
    const data = JSON.parse(plaintext.toString());
    if (
      data.segment !== segment ||
      !Number.isSafeInteger(data.expiry) ||
      data.expiry <= now ||
      data.expiry > now + TTL ||
      normalizeEmail(data.email) !== data.email
    )
      return null;
    return data.email;
  } catch {
    return null;
  }
}
async function readInput(request) {
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 4096) return {};
    return request.headers.get('content-type')?.includes('application/json')
      ? JSON.parse(raw)
      : Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return {};
  }
}
export function updatesPage(message = '', confirmationToken = null) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Get updates · VergeCommon</title><style>body{margin:0;background:#f5f6ef;color:#16382a;font:18px/1.6 system-ui}main,header,footer{max-width:48rem;margin:auto;padding:2rem}a{color:#165a3c}input,button{font:inherit;padding:.7rem}input{max-width:100%;box-sizing:border-box}button{background:#16382a;color:white;border:0}label{display:block}*:focus-visible{outline:3px solid #985d00;outline-offset:4px}.trap{display:none}</style></head><body><a href="#main">Skip to content</a><header><a href="/">VergeCommon</a></header><main id="main"><h1>Get updates</h1>${confirmationToken ? `<p>Confirm that you want to receive occasional VergeCommon updates.</p><form method="post" action="/updates/confirm"><input type="hidden" name="t" value="${esc(confirmationToken)}"><button type="submit">Confirm subscription</button></form>` : message ? `<p role="status">${esc(message)}</p>` : `<p>${consent}</p><form method="post" action="/api/updates/subscribe"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" maxlength="254" required><div class="trap" aria-hidden="true"><label for="website">Leave this empty</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div><p><button type="submit">Send confirmation link</button></p></form>`}<p><a href="/privacy/">Privacy policy</a> · <a href="/updates/">Sign up again</a></p></main><footer>A Viridis LLC project. Open code. Cooperative conservation.</footer></body></html>`;
}
const htmlResponse = (status, message, confirmationToken = null) =>
  new Response(updatesPage(message, confirmationToken), {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
export function createUpdates({
  env = process.env,
  origin,
  auth,
  client: injectedClient,
  now = Date.now,
  wait = sleep,
}) {
  const enabled = updatesEnabled(env);
  const client = enabled
    ? (injectedClient ?? createResendClient({ apiKey: env.RESEND_API_KEY }))
    : null;
  const cooldowns = new Map();
  const background = new Set();
  function enqueue(job) {
    const promise = job()
      .catch(() => {})
      .finally(() => background.delete(promise));
    background.add(promise);
  }
  return {
    enabled,
    // For lifecycle/tests only. No address, token or provider error is returned.
    settled: () => Promise.all(background),
    async handle(request, clientKey) {
      const url = new URL(request.url);
      if (!enabled) return new Response('Not found', { status: 404 });
      if (url.pathname === '/updates' && request.method === 'GET')
        return new Response(null, {
          status: 308,
          headers: { Location: '/updates/', 'Cache-Control': 'no-store' },
        });
      if (url.pathname === '/updates/' && request.method === 'GET')
        return htmlResponse(200, '');
      if (url.pathname === '/api/updates/subscribe') {
        if (request.method !== 'POST')
          return new Response('Method not allowed', { status: 405 });
        if (request.headers.get('origin') !== origin)
          return new Response('A same-origin request is required.', {
            status: 403,
          });
        const start = now();
        const input = await readInput(request);
        const perClient = auth.rateLimit(
          `updates:client:${clientKey}`,
          5,
          15 * 60000,
        );
        const global = auth.rateLimit('updates:global', 100, 3600000);
        const email = normalizeEmail(input?.email);
        for (const [key, expiry] of cooldowns)
          if (expiry <= start) cooldowns.delete(key);
        if (perClient && global && email && !input.website) {
          const key = mac(
            env.VERGE_UPDATES_SIGNING_SECRET,
            `address:${email}`,
          ).toString('hex');
          if (!cooldowns.has(key)) {
            cooldowns.set(key, start + 10 * 60000);
            const token = encryptConfirmation(
              email,
              env.VERGE_UPDATES_SEGMENT_ID,
              env.VERGE_UPDATES_SIGNING_SECRET,
              start,
            );
            const link = `${origin}/updates/confirm?t=${token}`;
            enqueue(() =>
              client.sendEmail({
                from: env.VERGE_UPDATES_FROM,
                to: email,
                reply_to: env.VERGE_UPDATES_REPLY_TO,
                subject: 'Confirm your VergeCommon updates',
                text: `Confirm your subscription: ${link}\nThis link expires in 48 hours. Ignore this email if you did not request it.\n${consent}`,
                html: `<p><a href="${esc(link)}">Confirm your subscription</a></p><p>This link expires in 48 hours. Ignore this email if you did not request it.</p><p>${consent}</p>`,
              }),
            );
          }
        }
        // Delivery is detached: neither provider latency nor contact existence affects the response.
        await wait(Math.max(0, 250 - (now() - start)));
        return htmlResponse(
          202,
          'If this address can receive updates, check your inbox for a confirmation link.',
        );
      }
      if (url.pathname === '/updates/confirm') {
        if (!['GET', 'POST'].includes(request.method))
          return new Response('Method not allowed', { status: 405 });
        if (
          request.method === 'POST' &&
          request.headers.get('origin') !== origin
        )
          return new Response('A same-origin request is required.', {
            status: 403,
          });
        const token =
          request.method === 'GET'
            ? url.searchParams.get('t')
            : (await readInput(request))?.t;
        const email = verifyConfirmation(
          token,
          env.VERGE_UPDATES_SEGMENT_ID,
          env.VERGE_UPDATES_SIGNING_SECRET,
          now(),
        );
        if (email) {
          // Email scanners and link previews may GET this page; only a deliberate POST subscribes.
          if (request.method === 'GET') return htmlResponse(200, '', token);
          try {
            await client.upsertContact(email, env.VERGE_UPDATES_SEGMENT_ID);
            return htmlResponse(
              200,
              'Your subscription is confirmed. You can unsubscribe anytime.',
            );
          } catch {
            /* Generic failure; never expose provider bodies. */
          }
        }
        return htmlResponse(400, 'Link expired or invalid — sign up again.');
      }
      return new Response('Not found', { status: 404 });
    },
  };
}
