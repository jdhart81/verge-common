import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createNodeServer, request } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHttpHandler, mcpDiscovery } from '../mcp/http.mjs';

const aliceCoop = 'eeaa247d-7e59-45d4-a0ce-68a5ae582bc0';
const bobCoop = '881f895d-441c-45a4-b84b-797ae7dd1774';
const projectId = '07b82539-8a73-44a1-a888-2ae685c2ee9b';
const requestId = '26685a5e-7bc8-4085-af18-07220fd6a8dd';

async function fixture(t) {
  const tokens = new Map([
    [
      'alice-write',
      { id: 'alice', kind: 'token', scopes: ['mcp:read', 'mcp:write'] },
    ],
    ['bob-read', { id: 'bob', kind: 'token', scopes: ['mcp:read'] }],
    [
      'app-only',
      { id: 'alice', kind: 'token', scopes: ['app:read', 'app:write'] },
    ],
    [
      'cookie-session',
      { id: 'alice', kind: 'session', scopes: ['mcp:read', 'mcp:write'] },
    ],
  ]);
  const commands = [];
  const coops = new Map([
    ['alice', aliceCoop],
    ['bob', bobCoop],
  ]);
  const handle = createHttpHandler({
    origin: 'https://vergecommon.com',
    authenticate: async (req) => tokens.get(req.headers.authorization.slice(7)),
    listWorkspaces: async (principal) => ({
      workspaces: [{ id: coops.get(principal.id) }],
    }),
    readWorkspace: async (principal, id) => {
      if (id !== coops.get(principal.id))
        throw Object.assign(new Error('Membership is required.'), {
          status: 403,
        });
      return { id, version: 4, owner: principal.id };
    },
    executeCommand: async (principal, id, input) => {
      if (id !== coops.get(principal.id))
        throw Object.assign(new Error('Membership is required.'), {
          status: 403,
        });
      if (input.version !== 4)
        throw Object.assign(new Error('Refresh before saving your change.'), {
          status: 409,
        });
      commands.push({ principal, id, input });
      return { saved: true, version: 5, requestId: input.requestId };
    },
    fetcher: async () => Response.json({ coops: [] }),
  });
  const server = createNodeServer(handle);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = new URL(`http://127.0.0.1:${server.address().port}/mcp`);
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const connect = async (token) => {
    const client = new Client({ name: 'http-test', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    t.after(() => client.close());
    return client;
  };
  const post = (message, headers = {}) =>
    fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: 'Bearer alice-write',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        ...headers,
      },
      body: typeof message === 'string' ? message : JSON.stringify(message),
    });
  return { tokens, commands, endpoint, connect, post };
}

await test('hosted MCP performs a real handshake and forwards bounded commands with identity, version and request ID', async (t) => {
  const f = await fixture(t);
  const client = await f.connect('alice-write');
  assert.equal((await client.listTools()).tools.length, 8);
  const capability = await client.callTool({
    name: 'vergecommon_capabilities',
    arguments: {},
  });
  assert.equal(capability.structuredContent.origin, 'https://vergecommon.com');
  const listing = await client.callTool({
    name: 'list_my_workspaces',
    arguments: {},
  });
  assert.equal(listing.structuredContent.data.workspaces[0].id, aliceCoop);
  const workspace = await client.callTool({
    name: 'get_private_workspace',
    arguments: { id: aliceCoop },
  });
  assert.equal(workspace.structuredContent.data.owner, 'alice');
  const command = {
    op: 'create_task',
    payload: { projectId, title: 'Plant survey' },
  };
  const saved = await client.callTool({
    name: 'apply_coop_command',
    arguments: { id: aliceCoop, version: 4, requestId, command },
  });
  assert.equal(saved.structuredContent.data.version, 5);
  assert.deepEqual(f.commands[0].input, { ...command, version: 4, requestId });
  assert.equal(f.commands[0].principal.id, 'alice');
  const stale = await client.callTool({
    name: 'apply_coop_command',
    arguments: { id: aliceCoop, version: 3, requestId, command },
  });
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /Refresh/);
  assert.equal(f.commands.length, 1);
});

await test('read-only tokens cannot discover or invoke writes; privilege, public publishing and financial inputs are rejected', async (t) => {
  const f = await fixture(t);
  const reader = await f.connect('bob-read');
  const writer = await f.connect('alice-write');
  assert.equal((await reader.listTools()).tools.length, 7);
  const args = { id: aliceCoop, version: 4, requestId };
  const readWrite = await reader.callTool({
    name: 'apply_coop_command',
    arguments: args,
  });
  assert.equal(readWrite.isError, true);
  for (const command of [
    { op: 'member_role', payload: { id: bobCoop, role: 'steward' } },
    { op: 'approve_allocation', payload: { id: bobCoop } },
    { op: 'record_payment', payload: { id: bobCoop } },
    { op: 'review_agreement', payload: { id: bobCoop, decision: 'approve' } },
    {
      op: 'post_update',
      payload: { projectId, text: 'Private note', visibility: 'public' },
    },
    { op: 'create_task', payload: { projectId, title: 'Task', userId: 'bob' } },
  ]) {
    const result = await writer.callTool({
      name: 'apply_coop_command',
      arguments: { ...args, command },
    });
    assert.equal(result.isError, true, command.op);
  }
  assert.equal(f.commands.length, 0);
});

await test('stateless requests isolate principals even with identical message IDs and enforce token revocation', async (t) => {
  const f = await fixture(t);
  const read = (id) => ({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: { name: 'get_private_workspace', arguments: { id } },
  });
  const [aliceResponse, bobResponse] = await Promise.all([
    f.post(read(aliceCoop)),
    f.post(read(bobCoop), { authorization: 'Bearer bob-read' }),
  ]);
  assert.equal(aliceResponse.headers.get('mcp-session-id'), null);
  assert.equal(
    (await aliceResponse.json()).result.structuredContent.data.owner,
    'alice',
  );
  assert.equal(
    (await bobResponse.json()).result.structuredContent.data.owner,
    'bob',
  );
  const denied = await f.post(read(aliceCoop), {
    authorization: 'Bearer bob-read',
  });
  assert.equal((await denied.json()).result.isError, true);
  const client = await f.connect('bob-read');
  f.tokens.delete('bob-read');
  await assert.rejects(client.listTools(), /401|Unauthorized|token/i);
});

await test('hosted MCP rejects browser cookies, wrong scope/origin, invalid JSON, sessions and oversized requests', async (t) => {
  const f = await fixture(t);
  const message = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
  for (const [headers, status] of [
    [{ origin: 'https://evil.example' }, 403],
    [{ origin: 'null' }, 403],
    [{ authorization: '', cookie: 'session=valid' }, 401],
    [{ authorization: 'Bearer missing' }, 401],
    [{ authorization: 'Bearer cookie-session' }, 401],
    [{ authorization: 'Bearer app-only' }, 403],
    [{ 'mcp-session-id': 'another-user-session' }, 400],
    [{ 'content-type': 'text/plain' }, 415],
  ]) {
    const response = await f.post(message, headers);
    assert.equal(response.status, status, JSON.stringify(headers));
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    await response.text();
  }
  assert.equal(
    (await f.post(message, { origin: 'https://vergecommon.com' })).status,
    200,
  );
  assert.equal((await f.post('{')).status, 400);
  assert.equal((await f.post([message])).status, 400);
  assert.equal((await f.post(' '.repeat(100_001))).status, 413);
  const get = await fetch(f.endpoint);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  const metadata = mcpDiscovery();
  assert.equal(metadata.endpoint, 'https://vergecommon.com/mcp');
  assert.equal(metadata.authentication.oauthSupported, false);
});

await test('streamed bodies are bounded without trusting content length and duplicate bearer headers are rejected', async (t) => {
  const f = await fixture(t);
  const streamed = await fetch(f.endpoint, {
    method: 'POST',
    headers: {
      authorization: 'Bearer alice-write',
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(' '.repeat(60_000)));
        controller.enqueue(new TextEncoder().encode(' '.repeat(60_000)));
        controller.close();
      },
    }),
    duplex: 'half',
  });
  assert.equal(streamed.status, 413);
  await streamed.text();
  const status = await new Promise((resolve, reject) => {
    const req = request(
      f.endpoint,
      {
        method: 'POST',
        headers: [
          'Host',
          f.endpoint.host,
          'Authorization',
          'Bearer alice-write',
          'Authorization',
          'Bearer bob-read',
          'Content-Type',
          'application/json',
        ],
      },
      (res) => {
        res.resume();
        res.once('end', () => resolve(res.statusCode));
      },
    );
    req.once('error', reject);
    req.end('{}');
  });
  assert.equal(status, 401);
});
