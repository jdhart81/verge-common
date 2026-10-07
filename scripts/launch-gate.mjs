#!/usr/bin/env node
// Soft-launch gate checks against a running VergeCommon service.
//
// Each check proves one machine-checkable invariant from the Beta Launch Spec
// (BL-xx). Gates that need people (reviews, custody, pilot) are listed as
// MANUAL so the report is complete. Exit code 1 when any check FAILS.
//
//   node scripts/production-baseline.mjs               # reviewed production SHA
//   node scripts/launch-gate.mjs --origin http://... --expect-commit <full-sha>
//   node scripts/launch-gate.mjs --expect-commit <sha> # BL-01 exact match
//   node scripts/launch-gate.mjs --json
import tls from 'node:tls';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const CONTACT = 'justin@viridisconservation.com';
export const PUBLIC_ROUTES = [
  '/',
  '/network/',
  '/demo/',
  '/coop/',
  '/app/',
  '/privacy/',
  '/terms/',
  '/support/',
  '/support-project/',
  '/woodland/',
  '/report/',
  '/account',
  '/account?mode=register',
  '/manifest.webmanifest',
  '/.well-known/mcp.json',
];
// Pages people read before signing up: scanned for contact and promises.
export const COPY_ROUTES = [
  '/',
  '/privacy/',
  '/terms/',
  '/support/',
  '/support-project/',
  '/woodland/',
  '/app/',
];
// Promises the service must never make (BL-15). Negated explanations such as
// "does not issue credits" are allowed; these phrases are affirmative claims.
export const BANNED_PROMISES = [
  /\bguaranteed (?:income|payouts?|credits?|returns?)\b/i,
  /\bget paid for (?:your )?(?:land|trees|carbon)\b/i,
  /\bearn (?:money|cash|income) (?:from|with) (?:carbon|your land)\b/i,
  /\b(?:download|available) on the App Store\b/i,
  /\bget it on Google Play\b/i,
  /\bcertified carbon credits\b/i,
];
export const SECRET_EXPIRY_WARNING_DAYS = 14;
const DAY = 86400000;
const SHA = /^[a-f0-9]{40}$/;

const stripTags = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

export async function runChecks({
  origin,
  fetchImpl = fetch,
  now = Date.now(),
  expectCommit = null,
  tlsExpiry = null,
  appleSecretExpiry = '2026-12-19T18:12:51Z',
  securityPolicy = '',
}) {
  const results = [];
  const record = (gate, name, status, detail) =>
    results.push({ gate, name, status, detail });
  const get = async (path, init = {}) => {
    const res = await fetchImpl(new URL(path, origin), {
      redirect: 'manual',
      ...init,
    });
    return { status: res.status, headers: res.headers, text: await res.text() };
  };

  // BL-17 (smoke): every public route answers without an error.
  const pages = {};
  for (const path of PUBLIC_ROUTES) {
    try {
      const res = await get(path);
      pages[path] = res;
      const ok = res.status >= 200 && res.status < 400;
      record(
        'BL-17',
        `route ${path}`,
        ok ? 'PASS' : 'FAIL',
        `HTTP ${res.status}`,
      );
    } catch (error) {
      record('BL-17', `route ${path}`, 'FAIL', String(error.message));
    }
  }

  // BL-01: the running build identifies its commit (and matches if asked).
  try {
    const health = await get('/healthz');
    const body = JSON.parse(health.text);
    const commit = body.commit;
    if (health.status !== 200 || body.status !== 'ok')
      record('BL-01', 'health', 'FAIL', `HTTP ${health.status} ${body.status}`);
    else if (typeof expectCommit !== 'string' || !SHA.test(expectCommit))
      record(
        'BL-01',
        'build commit',
        'FAIL',
        'a complete 40-hex expected commit is required',
      );
    else if (typeof commit !== 'string' || !SHA.test(commit))
      record(
        'BL-01',
        'build commit',
        'FAIL',
        'health does not report a complete 40-hex commit',
      );
    else if (commit !== expectCommit)
      record(
        'BL-01',
        'build commit',
        'FAIL',
        `running ${commit}, expected ${String(expectCommit)}`,
      );
    else record('BL-01', 'build commit', 'PASS', commit);
  } catch (error) {
    record('BL-01', 'health', 'FAIL', String(error.message));
  }

  // BL-02: every sign-in button shown starts a real provider redirect; no
  // disabled "coming soon" placeholders on the public sign-in page.
  const signIn = pages['/account']?.text ?? '';
  if (/Coming soon/i.test(signIn))
    record(
      'BL-02',
      'no placeholder sign-in buttons',
      'FAIL',
      'a provider shows "Coming soon"',
    );
  else record('BL-02', 'no placeholder sign-in buttons', 'PASS', '');
  const providers = [
    ...signIn.matchAll(/name="provider" value="(google|apple)"/g),
  ].map((m) => m[1]);
  for (const provider of new Set(providers)) {
    try {
      const res = await get('/auth/social/start', {
        method: 'POST',
        headers: {
          origin,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: `action=login&provider=${provider}`,
      });
      const location = res.headers.get('location') ?? '';
      const host = location ? new URL(location, origin).host : '';
      const ok =
        res.status === 303 &&
        /(accounts\.google\.com|appleid\.apple\.com|\.supabase\.co)$/.test(
          host,
        );
      record(
        'BL-02',
        `${provider} sign-in redirect`,
        ok ? 'PASS' : 'FAIL',
        `HTTP ${res.status} → ${host || 'no redirect'}`,
      );
    } catch (error) {
      record(
        'BL-02',
        `${provider} sign-in redirect`,
        'FAIL',
        String(error.message),
      );
    }
  }
  record(
    'BL-02',
    'Google consent screen published (not Testing)',
    'MANUAL',
    'Check Google Cloud → Google Auth Platform → Audience',
  );

  // BL-08: nothing expires silently.
  if (tlsExpiry) {
    const days = Math.floor((Date.parse(tlsExpiry) - now) / DAY);
    record(
      'BL-08',
      'TLS certificate',
      days > SECRET_EXPIRY_WARNING_DAYS ? 'PASS' : 'FAIL',
      `${days} days left (${String(tlsExpiry)})`,
    );
  } else record('BL-08', 'TLS certificate', 'SKIP', 'not an HTTPS origin');
  const appleDays = Math.floor((Date.parse(appleSecretExpiry) - now) / DAY);
  record(
    'BL-08',
    'Apple client secret',
    appleDays > SECRET_EXPIRY_WARNING_DAYS ? 'PASS' : 'FAIL',
    `${appleDays} days left (${appleSecretExpiry}); update --apple-secret-expiry after rotation`,
  );

  // BL-11: one monitored contact address across the public pages + policy.
  const found = new Set();
  for (const path of COPY_ROUTES)
    for (const m of (pages[path]?.text ?? '').matchAll(
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g,
    ))
      found.add(m[0].toLowerCase());
  for (const m of securityPolicy.matchAll(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g,
  ))
    found.add(m[0].toLowerCase());
  const others = [...found].filter((e) => e !== CONTACT);
  record(
    'BL-11',
    'single contact address',
    found.has(CONTACT) && !others.length ? 'PASS' : 'FAIL',
    others.length ? `also found: ${others.join(', ')}` : CONTACT,
  );

  // BL-15: no promises of things that are not built.
  const hits = [];
  for (const path of COPY_ROUTES) {
    const text = stripTags(pages[path]?.text ?? '');
    for (const pattern of BANNED_PROMISES)
      if (pattern.test(text)) hits.push(`${path}: ${pattern.source}`);
  }
  record(
    'BL-15',
    'no unbuilt promises in public copy',
    hits.length ? 'FAIL' : 'PASS',
    hits.join('; '),
  );

  // BL-09: terms are published and required at sign-up.
  const register = pages['/account?mode=register']?.text ?? '';
  record(
    'BL-09',
    'terms required at sign-up',
    /name="acceptTerms"[^>]*required/.test(register) &&
      pages['/terms/']?.status === 200
      ? 'PASS'
      : 'FAIL',
    '',
  );

  // HSTS (security review L3).
  const hsts = pages['/']?.headers?.get('strict-transport-security');
  if (String(origin).startsWith('https:'))
    record('BL-04', 'HSTS header', hsts ? 'PASS' : 'FAIL', hsts ?? 'missing');

  for (const [gate, name] of [
    ['BL-03', 'provider revocation on deletion (controlled account)'],
    ['BL-05', 'key custody note: Apple key, token-vault key, backup key'],
    [
      'BL-06',
      'off-server backup < 24 h and restore < 30 days (operations.py --status)',
    ],
    ['BL-07', 'external uptime monitor + test alert received'],
    ['BL-10', 'two named operators; report rehearsal logged'],
    ['BL-13', 'pilot group completed PILOT.md'],
    ['BL-14', 'phone, keyboard, VoiceOver, 200% text log'],
    ['BL-16', 'announcement approved'],
  ])
    record(gate, name, 'MANUAL', 'sign off with evidence in the spec');
  return results;
}

export function certificateExpiry(origin) {
  const url = new URL(origin);
  if (url.protocol !== 'https:') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: url.hostname,
        port: Number(url.port || 443),
        servername: url.hostname,
      },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        resolve(cert?.valid_to ? new Date(cert.valid_to).toISOString() : null);
      },
    );
    socket.setTimeout(10000, () => socket.destroy(new Error('TLS timeout')));
    socket.once('error', reject);
  });
}

async function main(argv) {
  const arg = (name, fallback = null) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const origin = arg('--origin', 'https://vergecommon.com');
  let tlsExpiry = null;
  try {
    tlsExpiry = await certificateExpiry(origin);
  } catch {
    tlsExpiry = '1970-01-01T00:00:00Z';
  }
  let securityPolicy = '';
  try {
    securityPolicy = await readFile(
      new URL('../SECURITY.md', import.meta.url),
      'utf8',
    );
  } catch {
    /* running outside the repository */
  }
  const results = await runChecks({
    origin,
    expectCommit: arg('--expect-commit'),
    appleSecretExpiry: arg('--apple-secret-expiry', '2026-12-19T18:12:51Z'),
    tlsExpiry,
    securityPolicy,
  });
  if (argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
  else {
    for (const r of results)
      console.log(
        `${r.status.padEnd(6)} ${r.gate}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`,
      );
    const count = (s) => results.filter((r) => r.status === s).length;
    console.log(
      `\n${count('PASS')} pass · ${count('FAIL')} fail · ${count('MANUAL')} manual · ${count('SKIP')} skipped`,
    );
  }
  return results.some((r) => r.status === 'FAIL') ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  void main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
