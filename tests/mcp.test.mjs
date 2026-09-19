import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer, fetchPublic, serviceOrigin } from '../mcp/server.mjs';
import { exampleCooperative } from '../lib/cooperative.mjs';

test('MCP initializes, discovers tools, validates schemas, and computes draft-only payouts', async () => {
  const server = createServer();
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 5);
    assert.ok(tools.every((t) => t.annotations.readOnlyHint));
    const result = await client.callTool({
      name: 'prepare_pooling_draft',
      arguments: { scenario: exampleCooperative() },
    });
    assert.equal(result.structuredContent.authority.payout, 'NOT_PAID');
    assert.equal(result.structuredContent.model.memberPoolCents, 112500);
    const invalid = await client.callTool({
      name: 'list_public_coops',
      arguments: { limit: 31 },
    });
    assert.equal(invalid.isError, true);
    const invalidScenario = exampleCooperative();
    invalidScenario.projects[0].poolKey = 'different';
    assert.equal(
      (
        await client.callTool({
          name: 'prepare_pooling_draft',
          arguments: { scenario: invalidScenario },
        })
      ).isError,
      true,
    );
  } finally {
    await client.close();
    await server.close();
  }
});

test('MCP public discovery sends no credentials and rejects unavailable, HTML and oversized responses', async () => {
  let seen;
  const result = await fetchPublic(
    'https://example.org',
    { limit: 1 },
    async (url, options) => {
      seen = { url, options };
      return Response.json({ coops: [], next: null });
    },
  );
  assert.deepEqual(result.data.coops, []);
  assert.equal(seen.url.pathname, '/api/network');
  assert.equal(seen.options.credentials, 'omit');
  assert.equal(seen.options.redirect, 'error');
  assert.deepEqual(seen.options.headers, { accept: 'application/json' });
  await assert.rejects(
    fetchPublic(
      'https://example.org',
      {},
      async () => new Response('', { status: 403 }),
    ),
    /unavailable/,
  );
  await assert.rejects(
    fetchPublic(
      'https://example.org',
      {},
      async () => new Response('<html>Sign in</html>'),
    ),
    /JSON/,
  );
  await assert.rejects(
    fetchPublic('https://example.org', {}, async () =>
      Response.json({ coops: [], pad: 'x'.repeat(1_000_001) }),
    ),
    /too large/,
  );
  await assert.rejects(
    fetchPublic('https://example.org', {}, async () =>
      Response.json({ private: true }),
    ),
    /Invalid/,
  );
  for (const url of [
    'http://example.org',
    'https://user:secret@example.org',
    'https://example.org/path',
    'https://example.org?token=secret',
  ]) {
    assert.throws(() => serviceOrigin(url));
  }
  assert.equal(serviceOrigin('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
});

test('packaged stdio entrypoint completes an actual agent handshake', async () => {
  const client = new Client({ name: 'stdio-test', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../mcp/stdio.mjs', import.meta.url))],
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const r = await client.callTool({
      name: 'vergecommon_capabilities',
      arguments: {},
    });
    assert.equal(r.structuredContent.access, 'public_read_and_local_planning');
  } finally {
    await client.close();
  }
});
