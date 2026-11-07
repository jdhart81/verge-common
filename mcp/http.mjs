import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, serviceOrigin } from './server.mjs';

const MAX_REQUEST_BYTES = 100_000;

export function mcpDiscovery(origin = 'https://vergecommon.com') {
  const base = serviceOrigin(origin);
  return {
    name: 'VergeCommon',
    endpoint: `${base}/mcp`,
    transport: 'streamable-http',
    authentication: {
      type: 'bearer-api-token',
      requiredScope: 'mcp:read',
      anonymousPublicTools: true,
      optionalScope: 'mcp:write',
      oauthSupported: false,
      instructions:
        'Public discovery and planning tools need no token. For private co-op tools, sign in to VergeCommon, create a personal agent token, and supply it in the Authorization: Bearer header. Revoke it from your account when finished.',
    },
    documentation:
      'https://github.com/jdhart81/verge-common/blob/build/coop-launch-readiness/mcp/README.md',
    boundaries:
      'Agent access follows current co-op membership. Financial/legal approvals, role changes, credit issuance and payment execution are unavailable.',
  };
}

function reject(res, status, message, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message },
      id: null,
    }),
  );
}

const MAX_COUNTED_RESPONSE_BYTES = 1_100_000;

// Watches one request for the usage counter without touching its response:
// res.end is passed exactly what it was given, and the body is only parsed
// after the response has closed. Any failure here is swallowed.
function watchRequest(stats, statsClient, req, res, anonymous) {
  const seen = {};
  let client;
  const sent = [];
  let sentBytes = 0;
  try {
    client = statsClient(req);
  } catch {
    client = undefined;
  }
  // Keep a copy of what was sent, up to a bound, for the outcome only.
  const keep = (chunk) => {
    let copy;
    if (typeof chunk === 'string') copy = Buffer.from(chunk);
    else if (chunk instanceof Uint8Array)
      copy = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    else return;
    sentBytes += copy.length;
    if (sentBytes <= MAX_COUNTED_RESPONSE_BYTES) sent.push(Buffer.from(copy));
  };
  try {
    const { write, end } = res;
    res.write = function (chunk, ...rest) {
      try {
        keep(chunk);
      } catch {
        // Copying is best effort.
      }
      return write.call(this, chunk, ...rest);
    };
    res.end = function (chunk, ...rest) {
      try {
        keep(chunk);
      } catch {
        // Copying is best effort.
      }
      return end.call(this, chunk, ...rest);
    };
  } catch {
    // Without the body, JSON-RPC and tool errors are not counted.
  }
  res.once('close', () => {
    setImmediate(() => {
      try {
        let error = res.statusCode >= 400 || !res.writableFinished;
        if (!error && sent.length && sentBytes <= MAX_COUNTED_RESPONSE_BYTES) {
          try {
            const reply = JSON.parse(Buffer.concat(sent).toString('utf8'));
            error = Boolean(reply?.error) || reply?.result?.isError === true;
          } catch {
            // Not JSON (or a stream): counted by status only.
          }
        }
        stats.record({
          client,
          anonymous,
          method: seen.method,
          tool: seen.tool,
          error,
          rateLimited: res.statusCode === 429,
        });
      } catch {
        // Counting never affects a request.
      }
    });
  });
  return seen;
}

async function readBody(req) {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (
    !Number.isSafeInteger(declared) ||
    declared < 0 ||
    declared > MAX_REQUEST_BYTES
  )
    throw Object.assign(new Error('Request too large.'), { status: 413 });
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES)
      throw Object.assign(new Error('Request too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('A JSON-RPC object is required.');
    return value;
  } catch {
    throw Object.assign(new Error('Invalid JSON.'), { status: 400 });
  }
}

/**
 * Stateless Node IncomingMessage/ServerResponse handler. Authentication runs on
 * every request, including initialize, and must check token expiry/revocation.
 * The principal comes only from the supplied verifier, never client tool input.
 * Storage callbacks must enforce membership and use the normal command audit.
 */
export function createHttpHandler({
  origin = 'https://vergecommon.com',
  authenticate,
  readWorkspace,
  listWorkspaces,
  executeCommand,
  analyzeWoodland,
  previewWoodland,
  fetcher = fetch,
  woodland = false,
  // Anonymous callers (no Authorization header at all) get only the public
  // discovery and planning tools, the same set local stdio offers. Off unless
  // the integration opts in and supplies a limiter.
  allowAnonymous = false,
  limitAnonymous,
  // Optional usage counter (mcp/stats.mjs). It sees only the JSON-RPC method,
  // the tool name, the outcome, whether a credential was sent, and the client
  // key from statsClient, which it hashes and never stores.
  stats = null,
  statsClient = (req) => req.socket?.remoteAddress,
} = {}) {
  const base = serviceOrigin(origin);
  if (typeof authenticate !== 'function')
    throw new Error('Hosted MCP requires a token verifier.');
  if (allowAnonymous && typeof limitAnonymous !== 'function')
    throw new Error('Anonymous hosted MCP requires a rate limiter.');

  return async function handleMcp(req, res) {
    let seen = {};
    if (stats)
      try {
        seen = watchRequest(
          stats,
          statsClient,
          req,
          res,
          !req.rawHeaders.some(
            (v, i) => i % 2 === 0 && v.toLowerCase() === 'authorization',
          ),
        );
      } catch {
        seen = {};
      }
    res.setHeader('cache-control', 'private, no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    if (req.headers.origin !== undefined && req.headers.origin !== base)
      return reject(res, 403, 'Origin is not allowed.');
    if (req.method !== 'POST')
      return reject(
        res,
        405,
        'This stateless MCP endpoint accepts POST requests.',
        { allow: 'POST' },
      );
    // Browser sessions do not authorize agent access. Reject duplicate or
    // malformed credentials rather than letting different parsers disagree.
    const authorization = req.headers.authorization;
    const authorizationCount = req.rawHeaders.filter(
      (v, i) => i % 2 === 0 && v.toLowerCase() === 'authorization',
    ).length;
    // Only a request with no Authorization header at all may fall back to the
    // public tools; any malformed, duplicate, invalid or revoked credential is
    // still refused, so a bad token never silently downgrades.
    const anonymous = allowAnonymous && authorizationCount === 0;
    if (
      !anonymous &&
      (authorizationCount !== 1 ||
        typeof authorization !== 'string' ||
        authorization.length > 2048 ||
        !/^Bearer [A-Za-z0-9._~+/=-]+$/i.test(authorization))
    )
      return reject(res, 401, 'A personal agent bearer token is required.', {
        'www-authenticate': 'Bearer realm="VergeCommon MCP"',
      });
    let server;
    try {
      let privateAccess;
      if (anonymous) {
        if (!(await limitAnonymous(req)))
          return reject(
            res,
            429,
            'Too many anonymous requests. Wait a minute, or use a personal agent token.',
            { 'retry-after': '60' },
          );
      } else {
        const verified = await authenticate(req);
        if (!verified?.id || verified.kind !== 'token')
          return reject(
            res,
            401,
            'Agent token is invalid, expired, or revoked.',
            {
              'www-authenticate':
                'Bearer realm="VergeCommon MCP", error="invalid_token"',
            },
          );
        if (
          !Array.isArray(verified.scopes) ||
          !verified.scopes.includes('mcp:read')
        )
          return reject(res, 403, 'The agent token requires mcp:read.', {
            'www-authenticate':
              'Bearer error="insufficient_scope", scope="mcp:read"',
          });
        const principal = Object.freeze({
          ...verified,
          scopes: Object.freeze([...verified.scopes]),
        });
        privateAccess = {
          principal,
          readWorkspace,
          listWorkspaces,
          executeCommand,
          analyzeWoodland,
          previewWoodland,
        };
      }
      if (req.headers['mcp-session-id'] !== undefined)
        return reject(res, 400, 'This endpoint does not use MCP session IDs.');
      if (
        !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')
      )
        return reject(res, 415, 'Use application/json.');
      const body = await readBody(req);
      if (typeof body.method === 'string') seen.method = body.method;
      if (body.method === 'tools/call' && typeof body.params?.name === 'string')
        seen.tool = body.params.name;
      server = createServer({
        origin: base,
        fetcher,
        woodland,
        hostedPublic: anonymous,
        privateAccess,
      });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      // Each request has its own server, transport and principal. No state can
      // survive to another token's request, even with matching JSON-RPC IDs.
      res.once('close', () => {
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      if (!res.headersSent) {
        const status = [400, 401, 403, 413].includes(error?.status)
          ? error.status
          : 500;
        reject(
          res,
          status,
          status === 500
            ? 'MCP request could not be completed.'
            : error.message,
          status === 413 ? { connection: 'close' } : {},
        );
      }
      await server?.close();
    }
  };
}
