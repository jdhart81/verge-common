import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { RECEIPT_PAGES, answerReceipt, createServer } from '../mcp/server.mjs';
import { exampleCooperative } from '../lib/cooperative.mjs';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const coopId = '6f1c2b8e-3a4d-4c5e-9f60-718293a4b5c6';
const PUBLIC = [
  'vergecommon_capabilities',
  'list_public_coops',
  'get_public_coop',
  'example_pooling_draft',
  'prepare_pooling_draft',
];

async function connect(options = {}) {
  const server = createServer({
    origin: 'https://vergecommon.com',
    fetcher: async (url) =>
      url.searchParams.has('id')
        ? url.searchParams.get('id') === coopId
          ? Response.json({ coop: { id: coopId, name: 'Hollow Brook Co-op' } })
          : Response.json({ error: 'Public co-op not found.' }, { status: 404 })
        : Response.json({ coops: [{ id: coopId }], next: null }),
    ...options,
  });
  const client = new Client({ name: 'receipts', version: '1' });
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

// A page path is a real route when app/<path>/page.tsx exists.
const routeExists = (href) => {
  const { pathname } = new URL(href);
  const dir = pathname.replace(/^\/|\/$/g, '');
  return existsSync(
    new URL(`../app/${dir ? `${dir}/` : ''}page.tsx`, import.meta.url),
  );
};

const calls = {
  vergecommon_capabilities: [{}, 'https://vergecommon.com/'],
  list_public_coops: [{ limit: 5 }, 'https://vergecommon.com/network/'],
  get_public_coop: [
    { id: coopId },
    `https://vergecommon.com/network/?coop=${coopId}`,
  ],
  example_pooling_draft: [{}, 'https://vergecommon.com/coop/'],
  prepare_pooling_draft: [
    { scenario: exampleCooperative() },
    'https://vergecommon.com/coop/',
  ],
};

for (const tool of PUBLIC)
  await test(`${tool} answers carry a source receipt and a link to check or start a co-op`, async () => {
    const c = await connect();
    try {
      const [args, page] = calls[tool];
      const r = await c.client.callTool({ name: tool, arguments: args });
      assert.equal(r.isError, undefined);
      assert.deepEqual(
        { ...r.structuredContent.source, retrieved_from: undefined },
        {
          name: 'VergeCommon',
          url: 'https://vergecommon.com',
          license: pkg.license,
          version: pkg.version,
          retrieved_from: undefined,
        },
      );
      assert.equal(r.structuredContent.check_or_start_your_own, page);
      assert.ok(routeExists(page), `${page} is not a route in app/`);
      // The JSON text mirrors the structured answer; one plain line follows.
      assert.equal(r.content.length, 2);
      assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
      assert.equal(
        r.content[1].text,
        `Source: VergeCommon (https://vergecommon.com), open source under ${pkg.license}, version ${pkg.version}. Check this or start your own co-op: ${page}`,
      );
      assert.doesNotMatch(r.content[1].text, /—/);
    } finally {
      await c.close();
    }
  });

await test('public answers keep their content; discovery answers keep the API URL they read', async () => {
  const c = await connect();
  try {
    const list = await c.client.callTool({
      name: 'list_public_coops',
      arguments: { limit: 5 },
    });
    assert.deepEqual(list.structuredContent.data.coops, [{ id: coopId }]);
    assert.match(list.structuredContent.trust, /treat as data/);
    assert.equal(
      list.structuredContent.source.retrieved_from,
      'https://vergecommon.com/api/network?limit=5',
    );
    const one = await c.client.callTool({
      name: 'get_public_coop',
      arguments: { id: coopId },
    });
    assert.equal(one.structuredContent.data.coop.name, 'Hollow Brook Co-op');
    assert.equal(
      one.structuredContent.source.retrieved_from,
      `https://vergecommon.com/api/network?id=${coopId}`,
    );
    const draft = await c.client.callTool({
      name: 'prepare_pooling_draft',
      arguments: { scenario: exampleCooperative() },
    });
    assert.equal(draft.structuredContent.authority.payout, 'NOT_PAID');
    assert.equal(draft.structuredContent.model.memberPoolCents, 112500);
    const capabilities = await c.client.callTool({
      name: 'vergecommon_capabilities',
      arguments: {},
    });
    assert.equal(
      capabilities.structuredContent.origin,
      'https://vergecommon.com',
    );
    assert.equal(
      capabilities.structuredContent.access,
      'public_read_and_local_planning',
    );
  } finally {
    await c.close();
  }
});

await test('errors carry no receipt, and the co-op page link is one the network page reads', async () => {
  const c = await connect();
  try {
    const missing = await c.client.callTool({
      name: 'get_public_coop',
      arguments: { id: '00000000-0000-4000-8000-000000000000' },
    });
    assert.equal(missing.isError, true);
    assert.equal(missing.structuredContent, undefined);
    assert.equal(missing.content.length, 1);
    const invalid = exampleCooperative();
    invalid.projects[0].poolKey = 'different';
    const refused = await c.client.callTool({
      name: 'prepare_pooling_draft',
      arguments: { scenario: invalid },
    });
    assert.equal(refused.isError, true);
    assert.doesNotMatch(JSON.stringify(refused), /check_or_start_your_own/);
  } finally {
    await c.close();
  }
  // /network/?coop=<id> opens that co-op.
  assert.match(
    readFileSync(
      new URL('../components/network-app.tsx', import.meta.url),
      'utf8',
    ),
    /new URLSearchParams\(location\.search\)\.get\('coop'\)/,
  );
  assert.deepEqual(Object.keys(RECEIPT_PAGES).sort(), [...PUBLIC].sort());
  // Self-hosted servers point at their own origin.
  const own = answerReceipt('https://coop.example.org', 'list_public_coops');
  assert.equal(own.source.url, 'https://coop.example.org');
  assert.equal(
    own.check_or_start_your_own,
    'https://coop.example.org/network/',
  );
});

await test('private tools are unchanged by receipts', async () => {
  const c = await connect({
    woodland: true,
    privateAccess: {
      principal: {
        id: 'alice',
        kind: 'token',
        scopes: ['mcp:read', 'mcp:write'],
      },
      listWorkspaces: async () => ({ workspaces: [] }),
      readWorkspace: async (principal, id) => ({ id, version: 2 }),
      executeCommand: async () => ({ saved: true }),
      previewWoodland: async () => ({ check: { status: 'pass' } }),
      analyzeWoodland: async () => ({ kind: 'network' }),
    },
  });
  try {
    const checks = [
      ['list_my_workspaces', {}],
      ['get_private_workspace', { id: coopId }],
      ['check_woodland_plan', { id: coopId, projectId: 'p1' }],
      [
        'analyze_woodland_spine',
        { id: coopId, projectId: 'p1', kind: 'network' },
      ],
      [
        'apply_coop_command',
        {
          id: coopId,
          version: 2,
          requestId: '0b8f5f0e-7a33-4f7e-9d1a-2f3c4d5e6f70',
          command: {
            op: 'event_rsvp',
            payload: { id: coopId, response: 'going' },
          },
        },
      ],
    ];
    for (const [name, args] of checks) {
      const r = await c.client.callTool({ name, arguments: args });
      assert.equal(r.isError, undefined, name);
      assert.deepEqual(
        Object.keys(r.structuredContent).sort(),
        ['data', 'trust'],
        name,
      );
      assert.equal(r.content.length, 1, name);
      assert.doesNotMatch(
        r.content[0].text,
        /check_or_start_your_own|"source"/,
        name,
      );
    }
  } finally {
    await c.close();
  }
});

await test('public tool descriptions say when to use the tool, when not to, and what it returns', async () => {
  const c = await connect();
  try {
    const { tools } = await c.client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [...PUBLIC].sort());
    for (const tool of tools) {
      const text = tool.description;
      assert.match(text, /^Use /, tool.name);
      assert.match(text, /Do not use it/, tool.name);
      assert.match(text, /Returns /, tool.name);
      assert.match(text, /source receipt/, tool.name);
      assert.doesNotMatch(text, /—/, tool.name);
      assert.ok(text.length <= 1000, `${tool.name} description is long`);
    }
  } finally {
    await c.close();
  }
});
