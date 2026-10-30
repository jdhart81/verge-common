import test from 'node:test';
import assert from 'node:assert/strict';
import { runChecks, PUBLIC_ROUTES, CONTACT } from '../scripts/launch-gate.mjs';

const origin = 'https://vergecommon.test';
const commit = 'a'.repeat(40);
const signIn = `<form><input type="hidden" name="provider" value="google"><button>Continue with Google</button></form>`;
const register = `<label><input type="checkbox" name="acceptTerms" value="yes" required> Terms</label>`;

function site(overrides = {}) {
  const pages = Object.fromEntries(
    PUBLIC_ROUTES.map((p) => [
      p,
      `<p>Contact ${CONTACT}. The platform does not issue credits.</p>`,
    ]),
  );
  pages['/account'] = signIn;
  pages['/account?mode=register'] = register;
  Object.assign(pages, overrides.pages ?? {});
  return async (url, init = {}) => {
    const u = new URL(url);
    const path = u.pathname + u.search;
    const headers = new Headers({
      'strict-transport-security': 'max-age=31536000',
    });
    if (path === '/healthz')
      return new Response(
        JSON.stringify({
          status: 'ok',
          commit: overrides.commit ?? commit,
        }),
        { status: 200, headers },
      );
    if (path === '/auth/social/start' && init.method === 'POST') {
      headers.set(
        'location',
        overrides.redirect ??
          'https://project.supabase.co/auth/v1/authorize?provider=google',
      );
      return new Response('', { status: 303, headers });
    }
    if (path in pages)
      return new Response(pages[path], { status: 200, headers });
    return new Response('missing', { status: 404, headers });
  };
}
const run = (fetchImpl, extra = {}) =>
  runChecks({
    origin,
    expectCommit: commit,
    fetchImpl,
    now: Date.parse('2026-09-28T00:00:00Z'),
    tlsExpiry: '2026-12-18T00:00:00Z',
    securityPolicy: `Report to ${CONTACT}`,
    ...extra,
  });
const failures = (results) =>
  results.filter((r) => r.status === 'FAIL').map((r) => `${r.gate} ${r.name}`);

await test('a healthy soft-launch site passes every automated gate', async () => {
  const results = await run(site());
  assert.deepEqual(failures(results), []);
  assert.equal(results.filter((r) => r.status === 'MANUAL').length, 9);
});

await test('each broken invariant is reported as a failure', async () => {
  const results = await run(
    site({
      commit: 'unknown',
      redirect: 'https://evil.example/',
      pages: {
        '/account':
          signIn + '<button disabled>Apple <small>Coming soon</small></button>',
        '/terms/': 'Contact other@example.com',
        '/': 'Get paid for your land! Download on the App Store.',
        '/account?mode=register': '<form></form>',
      },
    }),
    {
      tlsExpiry: '2026-10-01T00:00:00Z',
      appleSecretExpiry: '2026-10-05T00:00:00Z',
    },
  );
  const f = failures(results).join('\n');
  for (const expected of [
    'BL-01 build commit',
    'BL-02 no placeholder sign-in buttons',
    'BL-02 google sign-in redirect',
    'BL-08 TLS certificate',
    'BL-08 Apple client secret',
    'BL-11 single contact address',
    'BL-15 no unbuilt promises in public copy',
    'BL-09 terms required at sign-up',
  ])
    assert.match(f, new RegExp(expected), expected);
});

await test('a missing public route fails BL-17', async () => {
  const fetchImpl = site();
  const results = await run(async (url, init) =>
    new URL(url).pathname === '/demo/'
      ? new Response('x', { status: 500 })
      : fetchImpl(url, init),
  );
  assert.deepEqual(failures(results), ['BL-17 route /demo/']);
});

await test('BL-01 rejects absent, short, malformed and wrong expected/live revisions', async () => {
  for (const expected of [
    null,
    undefined,
    '',
    'unknown',
    commit.slice(0, 7),
    123,
    'g'.repeat(40),
    'b'.repeat(40),
  ]) {
    const results = await run(site(), { expectCommit: expected });
    assert.deepEqual(failures(results), ['BL-01 build commit']);
    assert.equal(results.filter((r) => r.status === 'MANUAL').length, 9);
  }
  // A matching prefix is insufficient: altered suffixes and abbreviated
  // health revisions must fail just as unknown/malformed revisions do.
  for (const live of [
    '',
    'unknown',
    commit.slice(0, 7),
    commit.slice(0, 7) + 'b'.repeat(33),
    123,
    'g'.repeat(40),
  ]) {
    const results = await run(site({ commit: live }));
    assert.deepEqual(failures(results), ['BL-01 build commit']);
    assert.equal(results.filter((r) => r.status === 'MANUAL').length, 9);
  }
});
