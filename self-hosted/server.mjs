import http from 'node:http';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { createAuth } from './auth.mjs';
import { getDatabase } from './storage.mjs';
import { accountPage } from './account.mjs';
import { createHttpHandler, mcpDiscovery } from '../mcp/http.mjs';
const safeReturn = (value) => {
  try {
    const u = new URL(value || '/workspace/', 'https://return.local');
    return u.origin === 'https://return.local' &&
      !/^\/(auth|account|signin|signout|callback)/.test(u.pathname)
      ? u.pathname + u.search + u.hash
      : '/workspace/';
  } catch {
    return '/workspace/';
  }
};
async function readBody(req, maximum) {
  if (Number(req.headers['content-length'] ?? 0) > maximum)
    throw Object.assign(new Error('Request too large.'), { status: 413 });
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maximum)
      throw Object.assign(new Error('Request too large.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export function createGateway({
  origin,
  upstreamPort,
  auth,
  host = '127.0.0.1',
}) {
  const base = new URL(origin);
  if (
    base.origin !== origin ||
    (base.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(base.hostname))
  )
    throw new Error('Set a canonical HTTPS VERGE_ORIGIN.');
  const cookie = (value) =>
    `vc_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${value ? 604800 : 0}${base.protocol === 'https:' ? '; Secure' : ''}`;
  const verifiedHeaders = (principal, supplied = {}) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(supplied)) {
      if (
        !value ||
        /^(oai-|x-|authorization$|cookie$|host$|connection$|transfer-encoding$|content-length$|accept-encoding$|forwarded$)/i.test(
          key,
        )
      )
        continue;
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    headers.set('host', base.host);
    headers.set('x-forwarded-proto', base.protocol.slice(0, -1));
    headers.set('x-forwarded-host', base.host);
    if (principal) {
      headers.set('oai-authenticated-user-id', principal.id);
      headers.set('oai-authenticated-user-email', principal.username);
      headers.set(
        'oai-authenticated-user-full-name',
        encodeURIComponent(principal.displayName),
      );
      headers.set(
        'oai-authenticated-user-full-name-encoding',
        'percent-encoded-utf-8',
      );
      if (principal.kind === 'token') headers.set('origin', origin);
    }
    return headers;
  };
  const internal = async (principal, path, payload) => {
    const headers = verifiedHeaders(principal, {
      'content-type': 'application/json',
      origin,
    });
    const r = await fetch(`http://127.0.0.1:${upstreamPort}${path}`, {
      method: payload ? 'POST' : 'GET',
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    });
    const result = await r.json();
    if (!r.ok)
      throw Object.assign(new Error(result.error || 'Operation unavailable.'), {
        status: r.status,
      });
    return result;
  };
  const mcp = createHttpHandler({
    origin,
    authenticate: (req) => auth.authenticate(req.headers),
    readWorkspace: (p, id) =>
      internal(p, `/api/workspaces?id=${encodeURIComponent(id)}`),
    listWorkspaces: (p) => internal(p, '/api/workspaces'),
    executeCommand: (p, id, input) =>
      internal(p, '/api/workspaces', { id, ...input }),
  });
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    const json = (status, data) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(data));
    };
    const page = (status, options) => {
      res.writeHead(status, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy':
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      });
      res.end(accountPage(options));
    };
    const redirect = (path) => {
      res.writeHead(303, { location: path, 'cache-control': 'no-store' });
      res.end();
    };
    try {
      if (req.headers.host !== base.host)
        return json(400, { error: 'Unrecognized host.' });
      const url = new URL(req.url, origin);
      if (url.origin !== origin)
        return json(400, { error: 'Invalid request URL.' });
      // The published gateway is behind Caddy on a private Docker network. Caddy
      // overwrites X-Real-IP. Direct deployments use the socket address.
      const client =
        process.env.VERGE_TRUST_CADDY === '1'
          ? String(req.headers['x-real-ip'] || req.socket.remoteAddress)
          : req.socket.remoteAddress;
      if (!auth.rateLimit(`request:${client}`, 600, 60000))
        return json(429, { error: 'Too many requests. Try again shortly.' });
      const principal = auth.authenticate(req.headers);
      if (req.headers.authorization && !principal)
        return json(401, { error: 'Token expired, revoked or invalid.' });
      const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (isWrite && req.headers.origin && req.headers.origin !== origin)
        return json(403, { error: 'Cross-origin requests are not allowed.' });
      if (
        isWrite &&
        url.pathname !== '/mcp' &&
        principal?.kind !== 'token' &&
        req.headers.origin !== origin
      )
        return json(403, { error: 'A same-origin request is required.' });
      if (url.pathname === '/healthz')
        return json(200, {
          status: 'ok',
          service: 'vergecommon',
          version: '0.8.0',
        });
      if (url.pathname === '/.well-known/mcp.json')
        return json(200, mcpDiscovery(origin));
      if (url.pathname === '/mcp') return await mcp(req, res);
      if (principal?.kind === 'token') {
        if (!principal.scopes.includes(isWrite ? 'app:write' : 'app:read'))
          return json(403, {
            error: 'This token does not grant the required app permission.',
          });
      }
      if (
        url.pathname === '/signin-with-chatgpt' ||
        url.pathname === '/signout-with-chatgpt' ||
        url.pathname === '/callback'
      )
        return redirect(
          '/account?returnTo=' +
            encodeURIComponent(safeReturn(url.searchParams.get('return_to'))),
        );
      if (
        url.pathname.startsWith('/account') ||
        url.pathname.startsWith('/auth/')
      ) {
        if (principal?.kind === 'token')
          return json(403, {
            error: 'Use browser sign-in to manage your account.',
          });
        if (url.pathname === '/account/export' && req.method === 'GET') {
          if (!principal) return json(401, { error: 'Sign in first.' });
          const list = await internal(principal, '/api/workspaces');
          const workspaces = [];
          for (const w of list.workspaces) {
            try {
              workspaces.push(
                await internal(
                  principal,
                  `/api/workspaces?id=${encodeURIComponent(w.id)}`,
                ),
              );
            } catch {
              /* Non-active membership has no private export. */
            }
          }
          res.setHeader(
            'content-disposition',
            'attachment; filename="vergecommon-account.json"',
          );
          return json(200, {
            user: {
              id: principal.id,
              username: principal.username,
              displayName: principal.displayName,
            },
            workspaces,
          });
        }
        if (url.pathname === '/account' && ['GET', 'HEAD'].includes(req.method))
          return page(200, {
            user: principal,
            tokens: principal ? auth.tokens(principal.id) : [],
            mode: url.searchParams.get('mode'),
            returnTo: safeReturn(url.searchParams.get('returnTo')),
          });
        if (req.method !== 'POST')
          return json(405, { error: 'Method not allowed.' });
        if (
          req.headers.origin !== origin ||
          !String(req.headers['content-type']).startsWith(
            'application/x-www-form-urlencoded',
          )
        )
          return json(403, { error: 'Submit this form from VergeCommon.' });
        const data = Object.fromEntries(
          new URLSearchParams((await readBody(req, 12000)).toString()),
        );
        if (
          !auth.rateLimit(`auth:${client}`, 20, 15 * 60000) ||
          !auth.rateLimit(`auth:global`, 200, 60000)
        )
          return json(429, {
            error: 'Too many account attempts. Wait 15 minutes.',
          });
        if (
          data.username &&
          !auth.rateLimit(
            `auth:user:${data.username.toLowerCase()}`,
            12,
            15 * 60000,
          )
        )
          return json(429, {
            error: 'Too many sign-in attempts. Wait 15 minutes.',
          });
        const action = url.pathname.slice(6);
        const recoveryCode = '';
        let token = '',
          message = '';
        try {
          if (action === 'register') {
            const result = await auth.register(data);
            res.setHeader('set-cookie', cookie(result.session));
            return page(201, {
              user: result.user,
              recoveryCode: result.recoveryCode,
              returnTo: safeReturn(data.returnTo),
            });
          }
          if (action === 'login') {
            const result = await auth.login(data);
            res.setHeader('set-cookie', cookie(result.session));
            return redirect(safeReturn(data.returnTo));
          }
          if (action === 'recover') {
            const result = await auth.recover(data);
            res.setHeader('set-cookie', cookie(result.session));
            const p = auth.authenticate({
              cookie: `vc_session=${result.session}`,
            });
            return page(200, {
              user: p,
              recoveryCode: result.recoveryCode,
              returnTo: safeReturn(data.returnTo),
            });
          }
          if (!principal) return json(401, { error: 'Sign in first.' });
          if (action === 'logout') {
            auth.logout(req.headers);
            res.setHeader('set-cookie', cookie(''));
            return redirect('/account');
          }
          if (action === 'token') {
            token = auth.createToken(principal.id, data.label, data.scope);
            message = 'Token created.';
          } else if (action === 'revoke') {
            auth.revokeToken(principal.id, data.id);
            message = 'Token revoked.';
          } else if (action === 'password') {
            const s = await auth.changePassword(
              principal.id,
              data.currentPassword,
              data.newPassword,
            );
            res.setHeader('set-cookie', cookie(s));
            message =
              'Password changed. Other sessions and device tokens were revoked.';
          } else if (action === 'close') {
            if (data.confirmation !== 'CLOSE')
              throw new Error('Type CLOSE to confirm.');
            await auth.closeAccount(principal.id, data.password);
            res.setHeader('set-cookie', cookie(''));
            return page(200, {
              message:
                'Account closed. Shared co-op records remain with the co-op.',
            });
          } else return json(404, { error: 'Unknown account action.' });
          return page(200, {
            user: principal,
            tokens: auth.tokens(principal.id),
            message,
            recoveryCode,
            token,
          });
        } catch (e) {
          return page(400, {
            user: principal,
            tokens: principal ? auth.tokens(principal.id) : [],
            message: e.message,
            mode: ['register', 'recover'].includes(action) ? action : 'login',
            returnTo: safeReturn(data.returnTo),
          });
        }
      }
      const body = isWrite
        ? await readBody(
            req,
            url.pathname.startsWith('/api/files') ? 5 * 1024 * 1024 : 100000,
          )
        : undefined;
      const upstream = await fetch(
        `http://127.0.0.1:${upstreamPort}${url.pathname}${url.search}`,
        {
          method: req.method,
          headers: verifiedHeaders(principal, req.headers),
          body,
          redirect: 'manual',
          signal: AbortSignal.timeout(30000),
        },
      );
      for (const [key, value] of upstream.headers)
        if (
          ![
            'connection',
            'transfer-encoding',
            'content-encoding',
            'content-length',
            'set-cookie',
          ].includes(key)
        )
          res.setHeader(key, value);
      if (principal || url.pathname.startsWith('/api/'))
        res.setHeader('cache-control', 'private, no-store');
      res.statusCode = upstream.status;
      if (upstream.body && req.method !== 'HEAD') {
        const stream = Readable.fromWeb(upstream.body);
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        stream.pipe(res);
      } else res.end();
    } catch (e) {
      console.error('Request failed', e.name, e.status || 500);
      if (!res.headersSent)
        json(e.status || 500, {
          error: e.status
            ? e.message
            : 'The service could not complete this request.',
        });
      else res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 80;
  return { server, host };
}
export async function start() {
  process.umask(0o077);
  const origin = process.env.VERGE_ORIGIN || 'http://127.0.0.1:3100';
  process.env.VINEXT_TRUST_PROXY = '1';
  process.env.VINEXT_TRUSTED_HOSTS = new URL(origin).host;
  const { startProdServer } = await import('vinext/server/prod-server');
  const internal = await startProdServer({
    port: 0,
    host: '127.0.0.1',
    outDir: 'dist',
    silent: true,
  });
  const auth = createAuth(getDatabase());
  const { server } = createGateway({
    origin,
    upstreamPort: internal.port,
    auth,
  });
  await new Promise((resolve) =>
    server.listen(
      Number(process.env.PORT || 3100),
      process.env.VERGE_BIND || '127.0.0.1',
      resolve,
    ),
  );
  console.log(`VergeCommon ready at ${origin}`);
  const close = () => {
    server.close();
    internal.server.close();
  };
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
  return { server, internal: internal.server };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await start();
