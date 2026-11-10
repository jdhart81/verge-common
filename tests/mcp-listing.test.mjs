import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, SERVER_ICONS } from '../mcp/server.mjs';

// Directories and MCP clients score a server on what an agent can read before
// calling it: a server icon and a description for every tool argument.

const noop = async () => ({});

async function connect(options) {
  const server = createServer(options);
  const client = new Client({ name: 'listing', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

const everyTool = {
  woodland: true,
  privateAccess: {
    principal: {
      id: 'owner',
      kind: 'token',
      scopes: ['mcp:read', 'mcp:write'],
    },
    listWorkspaces: noop,
    readWorkspace: noop,
    executeCommand: noop,
    analyzeWoodland: noop,
    previewWoodland: noop,
  },
};

// Walk a JSON Schema and return the path of every property without a description.
function undescribed(schema, path) {
  if (!schema || typeof schema !== 'object') return [];
  const missing = [];
  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    const at = `${path}.${name}`;
    if (!child.description) missing.push(at);
    missing.push(...undescribed(child, at));
  }
  if (schema.items) missing.push(...undescribed(schema.items, `${path}[]`));
  for (const key of ['anyOf', 'oneOf', 'allOf'])
    for (const [i, part] of (schema[key] ?? []).entries())
      missing.push(...undescribed(part, `${path}<${key}${i}>`));
  return missing;
}

await test('every tool argument, at every depth, has a description', async () => {
  for (const options of [{}, everyTool]) {
    const { client, close } = await connect(options);
    try {
      const { tools } = await client.listTools();
      for (const tool of tools)
        assert.deepEqual(
          undescribed(tool.inputSchema, tool.name),
          [],
          `${tool.name} has arguments without descriptions`,
        );
    } finally {
      await close();
    }
  }
});

await test('the full tool set is registered when every option is on', async () => {
  const { client, close } = await connect(everyTool);
  try {
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const name of [
      'check_woodland_plan',
      'analyze_woodland_spine',
      'apply_coop_command',
      'get_private_workspace',
    ])
      assert.ok(names.includes(name), `${name} missing`);
  } finally {
    await close();
  }
});

await test('initialize reports the server title, website and icons', async () => {
  const { client, close } = await connect({});
  try {
    const info = client.getServerVersion();
    assert.equal(info.name, 'vergecommon');
    assert.equal(info.title, 'VergeCommon');
    assert.equal(info.websiteUrl, 'https://vergecommon.com/');
    assert.deepEqual(info.icons, SERVER_ICONS);
  } finally {
    await close();
  }
});

await test('server.json lists the same icons, served from the public icons folder', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../server.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(manifest.icons, SERVER_ICONS);
  for (const icon of SERVER_ICONS) {
    assert.match(icon.src, /^https:\/\/vergecommon\.com\/icons\/app-\d+\.png$/);
    const file = new URL(
      `../public${new URL(icon.src).pathname}`,
      import.meta.url,
    );
    await readFile(file);
  }
});
