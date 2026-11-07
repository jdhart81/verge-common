import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createHttpHandler } from '../mcp/http.mjs';
import { createServer } from '../mcp/server.mjs';
import {
  KNOWN_TOOLS,
  STATS_FILE,
  createMcpStats,
  mcpStatsFromEnv,
} from '../mcp/stats.mjs';
import { createAuth } from '../self-hosted/auth.mjs';
import { createGateway } from '../self-hosted/server.mjs';

const DAY_MS = 86_400_000;
const start = Date.parse('2026-11-07T10:00:00Z');
const temporary = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-stats-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const until = async (check) => {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('condition not reached');
};
const listen = async (server) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
};
const closeServer = (server) =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  });

// One hosted handler with a token for "agent-token" and a client key taken from
// a test header, so distinct clients can be simulated on loopback.
async function hosted(t, stats, options = {}) {
  const handle = createHttpHandler({
    origin: 'https://vergecommon.com',
    authenticate: async (req) =>
      req.headers.authorization === 'Bearer agent-token'
        ? { id: 'alice', kind: 'token', scopes: ['mcp:read'] }
        : null,
    listWorkspaces: async () => ({ workspaces: [] }),
    readWorkspace: async (principal, id) => ({ id, version: 1 }),
    fetcher: async () => Response.json({ coops: [] }),
    allowAnonymous: true,
    limitAnonymous: async (req) => req.headers['x-test-limit'] !== 'over',
    stats,
    statsClient: (req) => String(req.headers['x-test-client'] ?? 'unknown'),
    ...options,
  });
  const server = http.createServer(handle);
  const port = await listen(server);
  t.after(() => closeServer(server));
  const endpoint = `http://127.0.0.1:${port}/mcp`;
  let id = 0;
  const rpc = (method, params, headers = {}) =>
    fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: (id += 1),
        method,
        ...(params ? { params } : {}),
      }),
    });
  const initialize = (headers) =>
    rpc(
      'initialize',
      {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'stats-test', version: '1' },
      },
      headers,
    );
  return { endpoint, rpc, initialize };
}

await test('counts per UTC day: requests, initialize, tools/list, each tool call, errors and the anonymous/token split', async (t) => {
  let now = start;
  const stats = createMcpStats({ now: () => now });
  const h = await hosted(t, stats);
  const a = { 'x-test-client': 'v4:203.0.113.7' };
  const tok = {
    'x-test-client': 'v4:198.51.100.9',
    authorization: 'Bearer agent-token',
  };
  assert.equal((await h.initialize(a)).status, 200);
  assert.equal((await h.rpc('tools/list', undefined, a)).status, 200);
  await h.rpc(
    'tools/call',
    { name: 'example_pooling_draft', arguments: {} },
    a,
  );
  await h.rpc(
    'tools/call',
    { name: 'example_pooling_draft', arguments: {} },
    a,
  );
  await h.rpc(
    'tools/call',
    { name: 'vergecommon_capabilities', arguments: {} },
    tok,
  );
  await h.rpc('tools/list', undefined, tok);
  // Tool-level error (bad arguments) and JSON-RPC error (unknown method).
  await h.rpc(
    'tools/call',
    { name: 'list_public_coops', arguments: { limit: 99 } },
    a,
  );
  await h.rpc('no/such/method', undefined, a);
  // HTTP-level errors: rate limited, and a bad credential.
  assert.equal(
    (await h.rpc('tools/list', undefined, { ...a, 'x-test-limit': 'over' }))
      .status,
    429,
  );
  assert.equal(
    (
      await h.rpc('tools/list', undefined, {
        ...a,
        authorization: 'Bearer wrong',
      })
    ).status,
    401,
  );
  await until(() => stats.snapshot().days[0]?.requests === 10);
  const [day] = stats.snapshot().days;
  assert.equal(day.date, '2026-11-07');
  assert.equal(day.requests, 10);
  assert.equal(day.initialize, 1);
  // Requests refused before their body is read (429, 401) have no method.
  assert.equal(day.tools_list, 2);
  assert.deepEqual(day.tool_calls, {
    example_pooling_draft: 2,
    vergecommon_capabilities: 1,
    list_public_coops: 1,
  });
  assert.equal(day.other_methods, 3);
  assert.equal(day.errors, 4);
  assert.equal(day.rate_limited, 1);
  assert.equal(day.anonymous, 7);
  assert.equal(day.token, 3);
  assert.equal(day.distinct_clients, 2);
  // The next UTC day is a separate row.
  now = start + DAY_MS;
  await h.initialize(a);
  await until(() => stats.snapshot().days.length === 2);
  assert.deepEqual(
    stats.snapshot().days.map((d) => [d.date, d.requests, d.initialize]),
    [
      ['2026-11-07', 10, 1],
      ['2026-11-08', 1, 1],
    ],
  );
});

await test('distinct clients use a daily in-memory salt; keys, hashes, tokens, arguments and results never leave memory', async (t) => {
  const dir = temporary(t);
  const file = join(dir, STATS_FILE);
  let now = start;
  const salts = [];
  const stats = createMcpStats({
    file,
    now: () => now,
    salt: () => {
      const value = Buffer.alloc(32, salts.length + 1);
      salts.push(value);
      return value;
    },
  });
  const h = await hosted(t, stats);
  const secretArgument = 'Hidden Hollow private meadow';
  for (const client of [
    'v4:203.0.113.7',
    'v4:203.0.113.7',
    'v6:2001:0db8:0000:0001::/64',
  ])
    await h.rpc(
      'tools/call',
      {
        name: 'get_public_coop',
        arguments: { id: 'not-a-uuid', note: secretArgument },
      },
      { 'x-test-client': client, authorization: 'Bearer agent-token' },
    );
  // A client-chosen tool name is bucketed, never stored.
  await h.rpc(
    'tools/call',
    { name: 'drop_tables_please', arguments: {} },
    { 'x-test-client': 'v4:192.0.2.1' },
  );
  await until(() => stats.snapshot().days[0]?.requests === 4);
  assert.equal(stats.snapshot().days[0].distinct_clients, 3);
  assert.equal(stats.snapshot().days[0].tool_calls.other, 1);
  assert.equal(salts.length, 1);
  // The same client the next day is counted again under a new salt.
  now = start + DAY_MS;
  await h.initialize({ 'x-test-client': 'v4:203.0.113.7' });
  await until(() => stats.snapshot().days.length === 2);
  assert.equal(salts.length, 2);
  assert.equal(stats.snapshot().days[1].distinct_clients, 1);
  assert.ok(stats.flush());
  const saved = readFileSync(file, 'utf8');
  const shown = JSON.stringify(stats.snapshot());
  for (const forbidden of [
    '203.0.113.7',
    '2001',
    '192.0.2.1',
    'agent-token',
    secretArgument,
    'not-a-uuid',
    'drop_tables_please',
    salts[0].toString('hex'),
    salts[0].toString('base64'),
  ]) {
    assert.ok(!saved.includes(forbidden), `file contains ${forbidden}`);
    assert.ok(!shown.includes(forbidden), `snapshot contains ${forbidden}`);
  }
  // No base64url hash-like strings either: only dates, known names and numbers.
  const strings = [];
  JSON.parse(saved, (key, value) => {
    strings.push(key);
    if (typeof value === 'string') strings.push(value);
    return value;
  });
  const allowed = new Set([
    '',
    'version',
    'note',
    'days',
    'requests',
    'methods',
    'initialize',
    'tools/list',
    'tools/call',
    'other',
    'tools',
    'errors',
    'rate_limited',
    'anonymous',
    'token',
    'distinct_clients',
    ...KNOWN_TOOLS,
  ]);
  for (const s of strings)
    assert.ok(
      allowed.has(s) ||
        /^\d{4}-\d{2}-\d{2}$/.test(s) ||
        s.startsWith('Aggregate MCP request counts'),
      `unexpected string in file: ${s}`,
    );
});

await test('persists only aggregates atomically under the data directory, reloads them and keeps 90 days', async (t) => {
  const dir = temporary(t);
  let now = start;
  const stats = mcpStatsFromEnv({ env: {}, dataDir: dir, now: () => now });
  assert.equal(stats.persisted, true);
  for (let day = 0; day < 95; day += 1) {
    now = start + day * DAY_MS;
    stats.record({
      client: 'v4:203.0.113.7',
      anonymous: true,
      method: 'tools/list',
    });
  }
  assert.ok(stats.flush());
  // Atomic write: only the final file remains, never a temporary.
  assert.deepEqual(readdirSync(dir), [STATS_FILE]);
  const saved = JSON.parse(readFileSync(join(dir, STATS_FILE), 'utf8'));
  const dates = Object.keys(saved.days);
  assert.equal(dates.length, 90);
  assert.equal(
    dates[0],
    new Date(start + 5 * DAY_MS).toISOString().slice(0, 10),
  );
  assert.equal(
    dates.at(-1),
    new Date(start + 94 * DAY_MS).toISOString().slice(0, 10),
  );
  // The endpoint view is the last 30 days.
  assert.equal(stats.snapshot().days.length, 30);
  assert.equal(stats.snapshot().window_days, 30);
  // A restart reads the counts back; the distinct count is carried as a floor.
  const again = createMcpStats({ file: join(dir, STATS_FILE), now: () => now });
  const last = again.snapshot().days.at(-1);
  assert.equal(last.tools_list, 1);
  assert.equal(last.distinct_clients, 1);
  again.record({ client: 'v4:198.51.100.9', method: 'initialize' });
  assert.equal(again.snapshot().days.at(-1).distinct_clients, 2);
  // A corrupt or hostile file is cleaned on load, never trusted.
  writeFileSync(
    join(dir, STATS_FILE),
    JSON.stringify({
      version: 1,
      days: {
        '2026-11-07': {
          requests: -5,
          tools: { evil_name: 9, get_public_coop: 2 },
          ip: '203.0.113.7',
        },
        'not-a-date': { requests: 1 },
      },
    }),
  );
  const cleaned = createMcpStats({
    file: join(dir, STATS_FILE),
    now: () => start,
  });
  const [row] = cleaned.snapshot().days;
  assert.equal(row.requests, 0);
  assert.deepEqual(row.tool_calls, { get_public_coop: 2 });
  assert.ok(!readFileSync(join(dir, STATS_FILE), 'utf8').includes('evil_name'));
});

await test('a missing or unwritable data directory falls back to memory without failing', async (t) => {
  const dir = temporary(t);
  const messages = [];
  // Missing directory.
  const missing = createMcpStats({
    file: join(dir, 'does-not-exist', STATS_FILE),
    now: () => start,
    log: (m) => messages.push(m),
  });
  assert.equal(missing.persisted, false);
  missing.record({ client: 'a', method: 'initialize', anonymous: true });
  assert.equal(missing.flush(), false);
  assert.equal(missing.snapshot().days[0].initialize, 1);
  assert.equal(messages.length, 1);
  assert.doesNotMatch(messages[0], /does-not-exist|\//);
  // A path that cannot be written even as root (its parent is a file), as on
  // a read-only root filesystem.
  writeFileSync(join(dir, 'plain-file'), '');
  const blocked = createMcpStats({
    file: join(dir, 'plain-file', STATS_FILE),
    now: () => start,
    log: () => {},
  });
  blocked.record({ client: 'a', method: 'tools/list' });
  assert.equal(blocked.persisted, false);
  assert.equal(blocked.snapshot().days[0].tools_list, 1);
  assert.equal(blocked.snapshot().persisted, false);
  // Memory-only when the server has no data directory at all.
  const memory = mcpStatsFromEnv({ env: {}, now: () => start });
  memory.record({ method: 'initialize' });
  assert.equal(memory.flush(), false);
  assert.equal(memory.snapshot().days[0].requests, 1);
});

await test('counting never changes a response or fails a request, even when the counter throws', async (t) => {
  const plain = await hosted(t, null);
  const counted = await hosted(t, createMcpStats({ now: () => start }));
  const broken = await hosted(
    t,
    {
      record() {
        throw new Error('counter broke');
      },
    },
    {
      statsClient() {
        throw new Error('client key broke');
      },
    },
  );
  const calls = [
    ['initialize', undefined],
    ['tools/list', undefined],
    ['tools/call', { name: 'example_pooling_draft', arguments: {} }],
    ['tools/call', { name: 'list_public_coops', arguments: { limit: 99 } }],
    ['no/such/method', undefined],
  ];
  for (const [method, params] of calls) {
    const bodies = [];
    for (const h of [plain, counted, broken]) {
      const response = await h.rpc(method, params);
      bodies.push([
        response.status,
        response.headers.get('content-type'),
        await response.text(),
      ]);
    }
    assert.deepEqual(
      bodies[1],
      bodies[0],
      `${JSON.stringify(method)} changed with counting`,
    );
    assert.deepEqual(
      bodies[2],
      bodies[0],
      `${JSON.stringify(method)} changed with a failing counter`,
    );
  }
  const rejected = [];
  for (const h of [plain, counted, broken]) {
    const response = await fetch(h.endpoint, { method: 'GET' });
    rejected.push([response.status, await response.text()]);
  }
  assert.deepEqual(rejected[1], rejected[0]);
  assert.deepEqual(rejected[2], rejected[0]);
});

await test('the tool allowlist matches every tool the hosted server can register', async () => {
  const server = createServer({
    woodland: true,
    privateAccess: {
      principal: { id: 'x', kind: 'token', scopes: ['mcp:read', 'mcp:write'] },
      readWorkspace: async () => ({}),
      listWorkspaces: async () => ({}),
      executeCommand: async () => ({}),
      analyzeWoodland: async () => ({}),
      previewWoodland: async () => ({}),
    },
  });
  const client = new Client({ name: 'allowlist', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  try {
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    assert.deepEqual([...names].sort(), [...KNOWN_TOOLS].sort());
  } finally {
    await client.close();
    await server.close();
  }
});

// Raw HTTP keeps the Host header, which the gateway checks.
const origin = 'https://vergecommon.test';
const gatewayRequest = (port, path, options = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:${port}${path}`,
      {
        method: options.method ?? 'GET',
        headers: { host: new URL(origin).host, ...options.headers },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.once('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.once('error', reject);
    req.end(options.body);
  });

async function gateway(t, env) {
  const db = new DatabaseSync(':memory:');
  const auth = createAuth(db, Date.now);
  const dir = temporary(t);
  const mcpStats = mcpStatsFromEnv({ env, dataDir: dir });
  const upstream = http.createServer((req, res) => {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"error":"upstream"}');
  });
  const upstreamPort = await listen(upstream);
  const { server } = createGateway({ origin, upstreamPort, auth, mcpStats });
  const port = await listen(server);
  t.after(async () => {
    await closeServer(server);
    await closeServer(upstream);
    db.close();
  });
  const anonymousList = () =>
    gatewayRequest(port, '/mcp', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
  return { port, dir, mcpStats, anonymousList };
}

await test('GET /mcp/stats serves read-only aggregate counts; VERGE_MCP_STATS=0 turns counting and the endpoint off', async (t) => {
  const on = await gateway(t, {});
  const listed = await on.anonymousList();
  assert.equal(listed.status, 200);
  assert.equal(JSON.parse(listed.text).result.tools.length, 5);
  await until(() => on.mcpStats.snapshot().days[0]?.tools_list === 1);
  const response = await gatewayRequest(on.port, '/mcp/stats');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /application\/json/);
  assert.equal(response.headers['cache-control'], 'no-store');
  const body = JSON.parse(response.text);
  assert.equal(body.window_days, 30);
  assert.equal(body.persisted, true);
  assert.equal(body.days.length, 1);
  assert.deepEqual(Object.keys(body.days[0]).sort(), [
    'anonymous',
    'date',
    'distinct_clients',
    'errors',
    'initialize',
    'other_methods',
    'rate_limited',
    'requests',
    'token',
    'tool_calls',
    'tools_list',
  ]);
  assert.equal(body.days[0].anonymous, 1);
  assert.ok(!response.text.includes('127.0.0.1'));
  assert.equal((await gatewayRequest(on.port, '/mcp/stats/')).status, 200);
  // Read-only: no writes, and it is not the MCP endpoint.
  const post = await gatewayRequest(on.port, '/mcp/stats', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(post.status, 405);
  // Counts were persisted under the data directory.
  on.mcpStats.flush();
  assert.equal(
    JSON.parse(readFileSync(join(on.dir, STATS_FILE), 'utf8')).version,
    1,
  );

  assert.equal(
    mcpStatsFromEnv({ env: { VERGE_MCP_STATS: '0' }, dataDir: on.dir }),
    null,
  );
  const off = await gateway(t, { VERGE_MCP_STATS: '0' });
  assert.equal(off.mcpStats, null);
  assert.equal((await off.anonymousList()).status, 200);
  const hidden = await gatewayRequest(off.port, '/mcp/stats');
  assert.equal(hidden.status, 404);
  assert.deepEqual(readdirSync(off.dir), []);
});
