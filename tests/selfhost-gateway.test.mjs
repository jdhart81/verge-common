import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createAuth } from '../self-hosted/auth.mjs';
import { createGateway } from '../self-hosted/server.mjs';
import { invitationSignInPath } from '../lib/invitation-handoff.mjs';

const origin = 'https://vergecommon.test';
const password = 'A careful gateway password 123!';
const aliceCoop = 'cc68d32f-3a8c-4bcb-8f3b-18928d840397';
const bobCoop = 'f9cacbc9-ae4a-4f40-9385-32e11d01b471';
const projectId = '98329113-e8a1-49a3-8d68-50a73e425fd0';
const cookieFor = (registration) => `vc_session=${registration.session}`;

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}
const close = (server) =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  });

// Unlike Node's Fetch implementation, the raw HTTP client preserves the Host
// header, which is needed to simulate a TLS reverse proxy on loopback here.
const nodeFetch = (url, options = {}) =>
  new Promise((resolve, reject) => {
    const headers = Object.fromEntries(new Headers(options.headers));
    const req = http.request(
      url,
      {
        method: options.method ?? 'GET',
        headers,
        signal: options.signal,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.once('error', reject);
        res.once('end', () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (Array.isArray(value))
              value.forEach((item) => headers.append(key, item));
            else if (value !== undefined) headers.set(key, value);
          }
          resolve(
            new Response(
              [204, 304].includes(res.statusCode)
                ? null
                : Buffer.concat(chunks),
              {
                status: res.statusCode,
                headers,
              },
            ),
          );
        });
      },
    );
    req.once('error', reject);
    req.end(
      options.body instanceof URLSearchParams
        ? options.body.toString()
        : options.body,
    );
  });

async function fixture(t, lifecycle = {}, gatewayOptions = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  const auth = createAuth(db, Date.now, lifecycle);
  const register = (username) =>
    auth.register({ username, displayName: `${username} display`, password });
  const alice = await register('alice');
  const bob = await register('bob');
  const owners = new Map([
    [aliceCoop, alice.user.id],
    [bobCoop, bob.user.id],
  ]);
  const seen = [];
  const upstream = http.createServer(async (req, res) => {
    const url = new URL(req.url, origin);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : undefined;
    const actor = req.headers['oai-authenticated-user-id'];
    seen.push({ actor, headers: req.headers, input, path: url.pathname });
    const send = (status, data) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === '/public-echo')
      return send(200, { headers: req.headers });
    if (url.pathname === '/api/network') return send(200, { coops: [] });
    if (url.pathname !== '/api/workspaces')
      return send(404, { error: 'Not found.' });
    if (!actor) return send(401, { error: 'Sign in first.' });
    const id = input?.id ?? url.searchParams.get('id');
    if (id && owners.get(id) !== actor)
      return send(403, { error: 'Membership is required.' });
    if (!id)
      return send(200, {
        workspaces: [...owners]
          .filter(([, owner]) => owner === actor)
          .map(([id]) => ({ id })),
      });
    return send(200, { id, version: input ? 5 : 4, actor, input });
  });
  const upstreamPort = await listen(upstream);
  const { server } = createGateway({
    origin,
    upstreamPort,
    auth,
    ...gatewayOptions,
  });
  const port = await listen(server);
  t.after(async () => {
    await close(server);
    await close(upstream);
    db.close();
  });
  const url = `http://127.0.0.1:${port}`;
  const request = (path, options = {}) =>
    nodeFetch(`${url}${path}`, {
      ...options,
      redirect: 'manual',
      headers: { host: new URL(origin).host, ...options.headers },
    });
  const form = (path, data, cookie, extra = {}) =>
    request(path, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/x-www-form-urlencoded',
        ...(cookie ? { cookie } : {}),
        ...extra,
      },
      body: new URLSearchParams(data),
    });
  return { auth, db, alice, bob, seen, request, form, url };
}

await test('native identity is token-bound, private and revocation-aware', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/auth/native/me')).status, 401);
  assert.equal(
    (
      await f.request('/auth/native/me', {
        headers: { cookie: cookieFor(f.alice) },
      })
    ).status,
    401,
  );
  const token = f.auth.createToken(
    f.alice.user.id,
    'Identity fixture',
    'app:read',
  );
  const headers = {
    authorization: `Bearer ${token}`,
    cookie: cookieFor(f.bob),
  };
  const response = await f.request('/auth/native/me', { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await response.json(), { user: f.alice.user });
  const mcp = f.auth.createToken(f.alice.user.id, 'Agent fixture', 'mcp:read');
  assert.equal(
    (
      await f.request('/auth/native/me', {
        headers: { authorization: `Bearer ${mcp}` },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/auth/native/me', {
        method: 'POST',
        headers: { ...headers, origin },
      })
    ).status,
    403,
  );
  const stored = f.auth
    .tokens(f.alice.user.id)
    .find((t) => t.label === 'Identity fixture');
  f.auth.revokeToken(f.alice.user.id, stored.id);
  assert.equal((await f.request('/auth/native/me', { headers })).status, 401);
  assert.equal(f.seen.length, 0);
});

await test('router-generated account URLs preserve the gateway destination', async (t) => {
  const f = await fixture(t);
  for (const [path, location] of [
    [
      '/account/?mode=register&returnTo=%2Fworkspace%2F',
      '/account?mode=register&returnTo=%2Fworkspace%2F',
    ],
    ['/account/export/', '/account/export'],
  ]) {
    const response = await f.request(path);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), location);
  }
  const account = await f.request('/account');
  assert.equal(account.status, 200);
  const policy = account.headers.get('content-security-policy');
  assert.ok(policy.includes("default-src 'none'"));
  assert.equal(
    policy
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('img-src ')),
    `img-src ${origin}/brand/shared-canopy-logo-v1.png ${origin}/icons/`,
  );
  assert.match(await account.text(), /Welcome back/);
});

await test('router-normalized authentication aliases preserve the private join handoff and reject unsafe return destinations', async (t) => {
  const f = await fixture(t);
  const joinQuery = new URL(invitationSignInPath, origin).search;
  const privateInvitation = `${aliceCoop}.${'b'.repeat(72)}`;
  assert.equal(
    new URL(invitationSignInPath, origin).searchParams.get('return_to'),
    '/join/',
  );
  for (const alias of [
    'signin-with-chatgpt',
    'signout-with-chatgpt',
    'callback',
  ]) {
    for (const slash of ['', '/']) {
      const path = `/${alias}${slash}`;
      const joined = await f.request(path + joinQuery);
      assert.equal(joined.status, 303);
      assert.equal(
        joined.headers.get('location'),
        '/account?returnTo=%2Fjoin%2F',
      );
      assert.ok(!joined.headers.get('location').includes(privateInvitation));
      for (const unsafe of [
        'https://evil.example/steal',
        '//evil.example/steal',
        '/account?mode=login',
        '/auth/login',
      ]) {
        const denied = await f.request(
          `${path}?return_to=${encodeURIComponent(unsafe)}`,
        );
        assert.equal(denied.status, 303);
        assert.equal(
          denied.headers.get('location'),
          '/account?returnTo=%2Fworkspace%2F',
        );
      }
    }
  }
  // Fragments stay browser-side and never become part of an HTTP auth query.
  const fragment = await f.request(
    `/signin-with-chatgpt/${joinQuery}#${privateInvitation}`,
  );
  assert.equal(
    fragment.headers.get('location'),
    '/account?returnTo=%2Fjoin%2F',
  );
  assert.equal(
    f.seen.length,
    0,
    'Aliases are handled by the account gateway, not forwarded to the page router',
  );
});

await test('gateway strips spoofed trusted identity/proxy headers and injects only verified session identity', async (t) => {
  const f = await fixture(t);
  const spoof = {
    'oai-authenticated-user-id': f.bob.user.id,
    'oai-authenticated-user-email': 'spoof@example.test',
    'x-forwarded-host': 'evil.example',
    'x-forwarded-proto': 'http',
    'x-real-ip': '1.2.3.4',
  };
  const anonymous = await f.request('/public-echo', { headers: spoof });
  const empty = (await anonymous.json()).headers;
  assert.equal(empty['oai-authenticated-user-id'], undefined);
  assert.equal(empty['oai-authenticated-user-email'], undefined);
  assert.equal(empty['x-real-ip'], undefined);
  assert.equal(empty['x-forwarded-proto'], 'https');
  assert.equal(empty['x-forwarded-host'], 'vergecommon.test');
  const verified = await f.request('/public-echo', {
    headers: { ...spoof, cookie: cookieFor(f.alice) },
  });
  const headers = (await verified.json()).headers;
  assert.equal(headers['oai-authenticated-user-id'], f.alice.user.id);
  assert.equal(headers['oai-authenticated-user-email'], 'alice');
  assert.equal(headers.cookie, undefined);
  assert.equal(headers.authorization, undefined);
  assert.equal(verified.headers.get('cache-control'), 'private, no-store');
});

await test('gateway enforces canonical host, same-origin browser mutations, and separate app token scopes', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.request('/healthz', { headers: { host: 'evil.example' } })).status,
    400,
  );
  const headers = {
    cookie: cookieFor(f.alice),
    'content-type': 'application/json',
  };
  const body = JSON.stringify({
    id: aliceCoop,
    op: 'create_task',
    payload: {},
  });
  assert.equal(
    (await f.request('/api/workspaces', { method: 'POST', headers, body }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.request('/api/workspaces', {
        method: 'POST',
        headers: { ...headers, origin: 'https://evil.example' },
        body,
      })
    ).status,
    403,
  );
  const success = await f.request('/api/workspaces', {
    method: 'POST',
    headers: { ...headers, origin },
    body,
  });
  assert.equal(success.status, 200);
  const read = f.auth.createToken(f.alice.user.id, 'Read device', 'app:read');
  const write = f.auth.createToken(
    f.alice.user.id,
    'Write device',
    'app:write',
  );
  const mcp = f.auth.createToken(f.alice.user.id, 'Agent', 'mcp:write');
  assert.equal(
    (
      await f.request(`/api/workspaces?id=${aliceCoop}`, {
        headers: { authorization: `Bearer ${read}` },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.request('/api/workspaces', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${read}`,
          'content-type': 'application/json',
        },
        body,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/api/workspaces', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${write}`,
          'content-type': 'application/json',
        },
        body,
      })
    ).status,
    200,
  );
  assert.equal(f.seen.at(-1).headers.origin, origin);
  assert.equal(f.seen.at(-1).headers.authorization, undefined);
  const forwardedBeforeAliases = f.seen.length;
  for (const path of [
    '/a%70i/workspaces',
    '/%61pi/workspaces',
    '/work%73pace/',
  ]) {
    const deniedAlias = await f.request(path, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${mcp}`,
        'content-type': 'application/json',
      },
      body,
    });
    assert.equal(deniedAlias.status, 403, path);
    await deniedAlias.text();
  }
  const deniedReadAlias = await f.request('/a%70i/workspaces', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${read}`,
      'content-type': 'application/json',
    },
    body,
  });
  assert.equal(deniedReadAlias.status, 403);
  await deniedReadAlias.text();
  assert.equal(f.seen.length, forwardedBeforeAliases);
  assert.equal(
    (
      await f.request(`/api/workspaces?id=${aliceCoop}`, {
        headers: { authorization: `Bearer ${mcp}` },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/account', {
        headers: { authorization: `Bearer ${write}` },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/api/workspaces', {
        headers: {
          authorization: 'Bearer invalid',
          cookie: cookieFor(f.alice),
        },
      })
    ).status,
    401,
  );
});

await test('account registration and login set protected cookies and reject external return destinations', async (t) => {
  const f = await fixture(t);
  const registered = await f.form('/auth/register', {
    username: 'carol',
    displayName: '<script>name</script>',
    password,
  });
  assert.equal(registered.status, 201);
  const sessionCookie = registered.headers.get('set-cookie');
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /SameSite=Lax/);
  assert.match(sessionCookie, /; Secure/);
  assert.equal(registered.headers.get('cache-control'), 'no-store');
  assert.match(
    registered.headers.get('content-security-policy'),
    /form-action 'self'/,
  );
  const page = await registered.text();
  assert.ok(page.includes('&lt;script&gt;name&lt;/script&gt;'));
  assert.ok(!page.includes('<script>name</script>'));
  assert.match(page, /Save your recovery code now/);
  const login = await f.form('/auth/login', {
    username: 'carol',
    password,
    returnTo: 'https://evil.example/steal',
  });
  assert.equal(login.status, 303);
  assert.equal(login.headers.get('location'), '/workspace/');
  const local = await f.form('/auth/login', {
    username: 'carol',
    password,
    returnTo: '/workspace/?id=safe',
  });
  assert.equal(local.headers.get('location'), '/workspace/?id=safe');
  const cookie = local.headers.get('set-cookie').split(';')[0];
  const logout = await f.form('/auth/logout', {}, cookie);
  assert.equal(logout.status, 303);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(
    (await f.request('/api/workspaces', { headers: { cookie } })).status,
    401,
  );
});

await test('account mode links, registration, and recovery preserve the intended co-op destination', async (t) => {
  const f = await fixture(t);
  const returnTo = `/network/?coop=${aliceCoop}&from=invitation`;
  const escapedReturnTo = returnTo.replaceAll('&', '&amp;');
  const modeLink = (html, mode) => {
    const href = [...html.matchAll(/href="([^"]+)"/g)]
      .map((match) => match[1].replaceAll('&amp;', '&'))
      .find((href) => new URL(href, origin).searchParams.get('mode') === mode);
    assert.ok(href, `The ${mode} link is available`);
    assert.equal(new URL(href, origin).searchParams.get('returnTo'), returnTo);
    return href;
  };
  const assertDestination = (html) => {
    assert.ok(html.includes(`name="returnTo" value="${escapedReturnTo}"`));
  };
  const login = await f.request(
    `/account?returnTo=${encodeURIComponent(returnTo)}`,
  );
  const loginHtml = await login.text();
  assertDestination(loginHtml);
  const register = await f.request(modeLink(loginHtml, 'register'));
  const registerHtml = await register.text();
  assertDestination(registerHtml);
  modeLink(registerHtml, 'login');
  const registered = await f.form('/auth/register', {
    username: 'invited_neighbor',
    displayName: 'Invited neighbor',
    password,
    returnTo,
  });
  assert.equal(registered.status, 201);
  assert.ok((await registered.text()).includes(`href="${escapedReturnTo}"`));

  const recover = await f.request(modeLink(loginHtml, 'recover'));
  const recoverHtml = await recover.text();
  assertDestination(recoverHtml);
  modeLink(recoverHtml, 'login');
  const failedRecovery = await f.form('/auth/recover', {
    username: 'alice',
    recoveryCode: 'invalid',
    password,
    returnTo,
  });
  assert.equal(failedRecovery.status, 400);
  const failedHtml = await failedRecovery.text();
  assertDestination(failedHtml);
  modeLink(failedHtml, 'login');
  const recovered = await f.form('/auth/recover', {
    username: 'alice',
    recoveryCode: f.alice.recoveryCode,
    password,
    returnTo,
  });
  assert.equal(recovered.status, 200);
  assert.ok((await recovered.text()).includes(`href="${escapedReturnTo}"`));

  const external = await f.form('/auth/recover', {
    username: 'bob',
    recoveryCode: f.bob.recoveryCode,
    password,
    returnTo: 'https://evil.example/steal',
  });
  const externalHtml = await external.text();
  assert.equal(external.status, 200);
  assert.ok(externalHtml.includes('href="/workspace/"'));
  assert.ok(!externalHtml.includes('https://evil.example'));
});

await test('account token management requires a browser session and never lists stored token secrets', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.form('/auth/token', { label: 'Agent', scope: 'mcp:read' })).status,
    401,
  );
  assert.equal(
    (
      await f.form(
        '/auth/token',
        { label: 'Agent', scope: 'mcp:read' },
        cookieFor(f.alice),
        { origin: 'https://evil.example' },
      )
    ).status,
    403,
  );
  const created = await f.form(
    '/auth/token',
    { label: 'Agent', scope: 'mcp:read' },
    cookieFor(f.alice),
  );
  assert.equal(created.status, 200);
  const html = await created.text();
  const token = html.match(/<code>(vc_[A-Za-z0-9_-]{43})<\/code>/)?.[1];
  assert.ok(token);
  const account = await f.request('/account', {
    headers: { cookie: cookieFor(f.alice) },
  });
  assert.ok(!(await account.text()).includes(token));
  const tokenRow = f.auth.tokens(f.alice.user.id)[0];
  await f.form('/auth/revoke', { id: tokenRow.id }, cookieFor(f.bob));
  assert.ok(f.auth.authenticate({ authorization: `Bearer ${token}` }));
  await f.form('/auth/revoke', { id: tokenRow.id }, cookieFor(f.alice));
  assert.equal(f.auth.authenticate({ authorization: `Bearer ${token}` }), null);
});

await test('gateway MCP integrates tokens with the same backend membership and audited-command contract', async (t) => {
  const f = await fixture(t);
  const writer = f.auth.createToken(
    f.alice.user.id,
    'Alice agent',
    'mcp:write',
  );
  const reader = f.auth.createToken(f.bob.user.id, 'Bob agent', 'mcp:read');
  const connect = async (token) => {
    const client = new Client({ name: 'gateway-integration', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${f.url}/mcp`), {
        fetch: nodeFetch,
        requestInit: {
          headers: {
            host: new URL(origin).host,
            authorization: `Bearer ${token}`,
          },
        },
      }),
    );
    t.after(() => client.close());
    return client;
  };
  const aliceClient = await connect(writer);
  const bobClient = await connect(reader);
  const [alice, bob] = await Promise.all([
    aliceClient.callTool({
      name: 'get_private_workspace',
      arguments: { id: aliceCoop },
    }),
    bobClient.callTool({
      name: 'get_private_workspace',
      arguments: { id: bobCoop },
    }),
  ]);
  assert.equal(alice.structuredContent.data.actor, f.alice.user.id);
  assert.equal(bob.structuredContent.data.actor, f.bob.user.id);
  const denied = await bobClient.callTool({
    name: 'get_private_workspace',
    arguments: { id: aliceCoop },
  });
  assert.equal(denied.isError, true);
  assert.match(denied.content[0].text, /Membership/);
  const requestId = 'c73d4ac0-d486-450c-a4fd-bde451273766';
  const command = {
    op: 'create_task',
    payload: { projectId, title: 'Survey the habitat' },
  };
  const result = await aliceClient.callTool({
    name: 'apply_coop_command',
    arguments: { id: aliceCoop, version: 4, requestId, command },
  });
  assert.equal(result.structuredContent.data.input.requestId, requestId);
  assert.equal(f.seen.at(-1).actor, f.alice.user.id);
  assert.equal(f.seen.at(-1).input.op, command.op);
  assert.equal(f.seen.at(-1).input.version, 4);
  assert.equal(f.seen.at(-1).headers.origin, origin);
  assert.equal(f.seen.at(-1).headers.authorization, undefined);
  const tokenRow = f.auth.tokens(f.bob.user.id)[0];
  f.auth.revokeToken(f.bob.user.id, tokenRow.id);
  await assert.rejects(bobClient.listTools());
  const discovery = await f.request('/.well-known/mcp.json');
  assert.equal((await discovery.json()).endpoint, `${origin}/mcp`);
  const missingBearer = await f.request('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(missingBearer.status, 401);
  assert.match(missingBearer.headers.get('www-authenticate'), /Bearer/);
});

await test('native account lifecycle issues scoped tokens, rotates recovery, revokes devices and deletes credentials', async (t) => {
  let erased;
  const f = await fixture(t, {
    eraseAccountData: (id) => {
      erased = id;
    },
  });
  const native = (action, data = {}, token) =>
    f.request(`/auth/native/${action}`, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });
  const registered = await native('register', {
    username: 'native',
    displayName: 'Native user',
    password,
    scope: 'mcp:write',
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.headers.get('set-cookie'), null);
  assert.equal(registered.headers.get('cache-control'), 'no-store');
  const initial = await registered.json();
  assert.ok(initial.expiresAt > Date.now());
  assert.equal(initial.session, undefined);
  assert.match(initial.recoveryCode, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(
    f.auth.authenticate({ authorization: `Bearer ${initial.token}` }).scopes,
    ['app:read', 'app:write'],
  );
  assert.equal(
    f.db
      .prepare('SELECT count(*) AS n FROM sessions WHERE user_id=?')
      .get(initial.user.id).n,
    0,
  );
  const signedIn = await native('login', { username: 'NATIVE', password });
  const second = await signedIn.json();
  assert.equal(signedIn.status, 200);
  assert.equal(second.recoveryCode, undefined);
  assert.equal((await native('logout', {}, second.token)).status, 200);
  assert.equal(
    f.auth.authenticate({ authorization: `Bearer ${second.token}` }),
    null,
  );
  assert.ok(f.auth.authenticate({ authorization: `Bearer ${initial.token}` }));
  const recovered = await native('recover', {
    username: 'native',
    recoveryCode: initial.recoveryCode,
    password: password + ' replacement',
  });
  const fresh = await recovered.json();
  assert.equal(recovered.status, 200);
  assert.equal(fresh.user.id, initial.user.id);
  assert.notEqual(fresh.recoveryCode, initial.recoveryCode);
  assert.equal(
    f.auth.authenticate({ authorization: `Bearer ${initial.token}` }),
    null,
  );
  assert.equal(
    (
      await native('recover', {
        username: 'native',
        recoveryCode: initial.recoveryCode,
        password,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await native(
        'delete',
        { password: password + ' replacement', confirmation: 'CLOSE' },
        fresh.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await native(
        'delete',
        { password: 'incorrect password', confirmation: 'DELETE' },
        fresh.token,
      )
    ).status,
    400,
  );
  assert.equal(erased, undefined);
  const removed = await native(
    'delete',
    { password: password + ' replacement', confirmation: 'DELETE' },
    fresh.token,
  );
  assert.deepEqual(await removed.json(), { ok: true, deleted: true });
  assert.equal(erased, initial.user.id);
  assert.equal(
    f.db.prepare('SELECT id FROM users WHERE id=?').get(initial.user.id),
    undefined,
  );
  assert.equal(
    f.auth.authenticate({ authorization: `Bearer ${fresh.token}` }),
    null,
  );
  assert.equal(
    f.db
      .prepare('SELECT count(*) AS n FROM auth_audit WHERE user_id=?')
      .get(initial.user.id).n,
    0,
  );
});

await test('native auth rejects cross-origin, cookie identity, agent/read tokens and malformed payloads', async (t) => {
  const f = await fixture(t);
  const request = (headers, body = '{}', method = 'POST') =>
    f.request('/auth/native/login', {
      method,
      headers,
      ...(method === 'POST' ? { body } : {}),
    });
  assert.equal(
    (await request({ 'content-type': 'application/json' })).status,
    403,
  );
  assert.equal(
    (
      await request({
        origin: 'https://evil.test',
        'content-type': 'application/json',
      })
    ).status,
    403,
  );
  assert.equal(
    (await request({ origin, 'content-type': 'text/plain' })).status,
    403,
  );
  assert.equal(
    (await request({ origin, 'content-type': 'application/json' }, '[')).status,
    400,
  );
  assert.equal(
    (await request({ origin, 'content-type': 'application/json' }, '[]'))
      .status,
    400,
  );
  assert.equal(
    (
      await request(
        { origin, 'content-type': 'application/json' },
        'x'.repeat(12001),
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await request({
        origin,
        'content-type': 'application/json',
        cookie: cookieFor(f.alice),
      })
    ).status,
    400,
  );
  assert.equal((await request({}, undefined, 'GET')).status, 405);
  for (const scope of ['mcp:write', 'app:read']) {
    const token = f.auth.createToken(f.alice.user.id, scope, scope);
    const response = await f.request('/auth/native/delete', {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password, confirmation: 'DELETE' }),
    });
    assert.equal(response.status, 403);
    if (scope === 'app:read') {
      const logout = await f.request('/auth/native/logout', {
        method: 'POST',
        headers: {
          origin,
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: '{}',
      });
      assert.equal(logout.status, 200);
      assert.equal(
        f.auth.authenticate({ authorization: `Bearer ${token}` }),
        null,
      );
    }
  }
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 2);
});

await test('erasure blockers roll back changes and preserve login until stewardship is resolved', async (t) => {
  const f = await fixture(t, {
    eraseAccountData: (id) => {
      f.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      throw Object.assign(new Error('Transfer founder responsibility first.'), {
        status: 409,
      });
    },
  });
  const response = await f.form(
    '/auth/close',
    { password, confirmation: 'DELETE' },
    cookieFor(f.alice),
  );
  assert.equal(response.status, 409);
  assert.ok(f.auth.authenticate({ cookie: cookieFor(f.alice) }));
  assert.ok(
    f.db.prepare('SELECT id FROM users WHERE id=?').get(f.alice.user.id),
  );
});

await test('provider preview keeps ordinary login unchanged and reveals only configured providers on the preview link', async (t) => {
  const f = await fixture(
    t,
    {},
    {
      socialPreview: true,
      social: {
        available: () => [{ id: 'apple', name: 'Apple', linked: false }],
      },
    },
  );
  assert.doesNotMatch(
    await (await f.request('/account')).text(),
    /Continue with Apple/,
  );
  assert.doesNotMatch(
    await (await f.request('/account?socialPreview=0')).text(),
    /Continue with Apple/,
  );
  const signedIn = await f.request('/account', {
    headers: { cookie: `vc_session=${f.alice.session}` },
  });
  assert.match(await signedIn.text(), /Link Apple/);
  const preview = await f.request('/account?socialPreview=1');
  assert.match(await preview.text(), /Continue with Apple/);
  assert.match(
    preview.headers.get('content-security-policy'),
    /https:\/\/appleid.apple.com/,
  );
});
