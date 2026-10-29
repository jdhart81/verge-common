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
