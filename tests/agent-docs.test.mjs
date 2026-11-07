// The agent-facing index (public/llms.txt) and guide (AGENTS.md): llms.txt shape, every
// repository link resolves, every MCP tool named is registered, and the boundaries are stated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mcpDiscovery } from '../mcp/http.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const llms = read('public/llms.txt');
const agents = read('AGENTS.md');
const BLOB = 'https://github.com/jdhart81/verge-common/blob/main/';

await test('llms.txt follows the llms.txt layout: one H1, a summary quote, then H2 sections of links', () => {
  const lines = llms.split('\n');
  assert.equal(lines[0], '# VergeCommon');
  assert.equal(lines.filter((line) => line.startsWith('# ')).length, 1);
  assert.match(lines.find((line) => line.trim()) ?? '', /^# /);
  assert.ok(
    lines.some((line) => line.startsWith('> ')),
    'summary blockquote',
  );
  assert.ok(
    lines.indexOf(lines.find((line) => line.startsWith('> '))) <
      lines.indexOf(lines.find((line) => line.startsWith('## '))),
  );
  for (const line of lines.filter((l) => l.startsWith('- ')))
    assert.match(line, /^- \[[^\]]+\]\(https:\/\/[^)\s]+\)/, line);
});

await test('every link into this repository names a file that exists on this branch', () => {
  const paths = [
    ...[
      ...llms.matchAll(
        /\]\((https:\/\/github\.com\/jdhart81\/verge-common\/blob\/main\/[^)#\s]+)/g,
      ),
    ].map((m) => m[1].slice(BLOB.length)),
    ...[...agents.matchAll(/\]\((?!https?:)([^)#\s]+)\)/g)].map((m) => m[1]),
  ];
  assert.ok(paths.length >= 10);
  for (const path of paths)
    assert.ok(existsSync(new URL(path, root)), `missing ${path}`);
});

await test('every MCP tool the index names is registered by the server', () => {
  const source = read('mcp/server.mjs');
  const named = llms
    .match(/Tools: ([^\n]+)/)[1]
    .match(/\b[a-z]+(?:_[a-z]+)+\b/g);
  assert.ok(named.length >= 10);
  for (const tool of named)
    assert.ok(source.includes(`'${tool}'`), `${tool} is not registered`);
});

await test('the index and guide state what VergeCommon does not do', () => {
  for (const [name, text] of [
    ['llms.txt', llms],
    ['AGENTS.md', agents],
  ]) {
    assert.match(text, /does not certify carbon credits/, name);
    assert.match(text, /move money/, name);
    assert.match(text, /steward/, name);
    assert.doesNotMatch(
      text,
      /\b(?:guarantee|certified|verified credits)\b/i,
      name,
    );
  }
});

await test('MCP discovery points agents at current documentation on main', () => {
  assert.equal(mcpDiscovery().documentation, `${BLOB}mcp/README.md`);
});

// The "Try it from your agent" blocks in README.md and llms.txt: a working
// command and config for the anonymous endpoint, prompts that need only the
// public tools, and limits that match the server.
const readme = read('README.md');
const tryBlocks = [
  [
    'llms.txt',
    llms.slice(
      llms.indexOf('**Try it from your agent.**'),
      llms.indexOf('\n## Start a co-op'),
    ),
  ],
  [
    'README.md',
    readme.slice(
      readme.indexOf('### Try it from your agent'),
      readme.indexOf('\n## What is implemented'),
    ),
  ],
];
const PUBLIC_TOOLS = [
  'vergecommon_capabilities',
  'list_public_coops',
  'get_public_coop',
  'example_pooling_draft',
  'prepare_pooling_draft',
];

await test('"Try it from your agent" gives a working command, config, prompts and limits', async () => {
  const { exampleCooperative, calculateCooperative } =
    await import('../lib/cooperative.mjs');
  const endpoint = mcpDiscovery().endpoint;
  const server = read('mcp/server.mjs');
  const publicPart = server.slice(
    0,
    server.indexOf('registerPrivateTools(server'),
  );
  const gateway = read('self-hosted/server.mjs');
  assert.match(gateway, /rateLimit\(`mcp-anon:\$\{client\}`, 60, 60000\)/);
  assert.match(gateway, /rateLimit\('mcp-anon:global', 600, 60000\)/);
  for (const tool of PUBLIC_TOOLS)
    assert.ok(publicPart.includes(`'${tool}'`), `${tool} is not a public tool`);
  for (const [name, block] of tryBlocks) {
    assert.ok(block.length > 200, `${name} has no Try it block`);
    assert.ok(
      block.includes(
        `claude mcp add --transport http vergecommon ${endpoint}\n`,
      ),
      name,
    );
    const config = JSON.parse(block.match(/```json\n([\s\S]+?)```/)[1]);
    assert.deepEqual(config.mcpServers.vergecommon, {
      type: 'http',
      url: endpoint,
    });
    const prompts = [...block.matchAll(/^\d\. (.+)$/gm)].map((m) => m[1]);
    assert.equal(prompts.length, 3, name);
    for (const prompt of prompts)
      assert.doesNotMatch(prompt, /token|private|workspace|my co-op/i, name);
    assert.match(prompts[0], /without an account.*public conservation co-ops/);
    assert.match(prompts[1], /example of how a conservation co-op pools/);
    assert.match(prompts[2], /example pooling draft/);
    assert.match(
      block,
      /only the five public tools.*60 requests a minute per client and 600 a minute in total/s,
      name,
    );
    assert.match(block, /https:\/\/vergecommon\.com\/account/, name);
    assert.match(block, /Authorization: Bearer/, name);
    assert.doesNotMatch(block, /[–—]/, `${name} uses a long dash`);
  }
  for (const tool of PUBLIC_TOOLS) assert.ok(tryBlocks[1][1].includes(tool));
  // The recalculation prompt asks for a scenario prepare_pooling_draft accepts.
  const scenario = exampleCooperative();
  scenario.policy.ecologicalReserveBps = 3000;
  scenario.members.forEach((member, i) => {
    member.shareBps = [5000, 3000, 2000][i];
  });
  assert.equal(calculateCooperative(scenario).checks.cashCloses, true);
});
