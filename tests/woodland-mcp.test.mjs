// MCP: the woodland check tool is registered only when enabled, is read-only, and
// returns the same connectivity result the co-op uses to block plans.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../mcp/server.mjs';
import { newWorkspace, applyCommand, memberView } from '../lib/network.mjs';

const coop = 'eeaa247d-7e59-45d4-a0ce-68a5ae582bc0';
const M = 111195.0802335329, pt = (x, y) => [x / M, y / M];
const rect = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)]] });
const F = (geometry, properties = {}) => ({ type: 'Feature', geometry, properties });

function woodlandState() {
  let s = newWorkspace({ name: 'Woodland co-op', region: 'Synthetic', summary: 'Synthetic', displayName: 'Steward' }, { id: 'owner' }, 1, 'coop');
  let n = 1;
  const run = (op, payload, actor = { id: 'owner' }) => { s = applyCommand(s, actor, { op, payload }, 100, `r-${n++}`); return `r-${n - 1}`; };
  run('update_coop', { name: s.name, region: s.region, summary: s.summary, visibility: 'public' });
  const r = run('request_membership', { name: 'Reviewer' }, { id: 'reviewer' });
  run('member_status', { id: r, status: 'active' });
  run('member_role', { id: r, role: 'steward' });
  const projectId = run('create_project', { name: 'North woodlot', summary: 'Corridors', region: 'Synthetic', kind: 'woodland' });
  const layersId = run('save_woodland_layers', {
    projectId,
    layers: {
      coreAreas: [F(rect(100, 300, 400, 700), { dfm_id: 'core-A', core_class: 'reserve' }), F(rect(1600, 300, 1900, 700), { dfm_id: 'core-B', core_class: 'reserve' })],
      retained: [F(rect(400, 440, 1600, 560))], roads: [], water: [], crossings: [],
    },
    params: { minWidthM: 100, minWidthSource: 'Fixture policy' },
  });
  run('review_woodland_layers', { id: layersId, decision: 'approve', note: 'Independent' }, { id: 'reviewer' });
  return { state: s, projectId };
}

async function connect(woodland) {
  const { state, projectId } = woodlandState();
  const principal = { id: 'owner', kind: 'token', scopes: ['mcp:read'] };
  const server = createServer({
    woodland,
    privateAccess: { principal, readWorkspace: async () => ({ ...memberView(state, 'owner'), version: 3 }) },
  });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, projectId };
}

await test('check_woodland_plan is absent unless woodland is enabled', async () => {
  const { client } = await connect(false);
  const names = (await client.listTools()).tools.map((t) => t.name);
  assert.ok(!names.includes('check_woodland_plan'));
  await client.close();
});

await test('check_woodland_plan is read-only and reports a cut corridor as fail with its cause', async () => {
  const { client, projectId } = await connect(true);
  const tool = (await client.listTools()).tools.find((t) => t.name === 'check_woodland_plan');
  assert.equal(tool.annotations.readOnlyHint, true);
  const clean = await client.callTool({ name: 'check_woodland_plan', arguments: { id: coop, projectId } });
  assert.equal(clean.structuredContent.data.status, 'pass');
  const cut = await client.callTool({
    name: 'check_woodland_plan',
    arguments: { id: coop, projectId, treatments: [F(rect(700, 300, 800, 800), { dfm_id: 'harvest-3', intensity: 'clearcut' })] },
  });
  assert.equal(cut.structuredContent.data.status, 'fail');
  assert.deepEqual(cut.structuredContent.data.lostLinks[0].causes, ['harvest-3']);
  const missing = await client.callTool({ name: 'check_woodland_plan', arguments: { id: coop, projectId: 'nope' } });
  assert.equal(missing.isError, true);
  await client.close();
});

await test('analyze_woodland_spine is registered only with woodland and the analysis callback, read-only, and passes the request through', async () => {
  const calls = [];
  const principal = { id: 'owner', kind: 'token', scopes: ['mcp:read'] };
  const make = async (options) => {
    const server = createServer({
      woodland: true,
      privateAccess: { principal, readWorkspace: async () => ({}), ...options },
    });
    const client = new Client({ name: 'test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
  };
  const without = await make({});
  assert.ok(!(await without.listTools()).tools.some((t) => t.name === 'analyze_woodland_spine'));
  await without.close();
  const client = await make({
    analyzeWoodland: async (p, id, input) => {
      calls.push([p.id, id, input]);
      return { analysis: { kind: input.kind, result: { status: 'ok' } } };
    },
  });
  const tool = (await client.listTools()).tools.find((t) => t.name === 'analyze_woodland_spine');
  assert.equal(tool.annotations.readOnlyHint, true);
  const r = await client.callTool({
    name: 'analyze_woodland_spine',
    arguments: { id: coop, projectId: 'p1', kind: 'frontier' },
  });
  assert.equal(r.structuredContent.data.analysis.kind, 'frontier');
  assert.deepEqual(calls, [['owner', coop, { projectId: 'p1', kind: 'frontier' }]]);
  const bad = await client.callTool({
    name: 'analyze_woodland_spine',
    arguments: { id: coop, projectId: 'p1', kind: 'everything' },
  });
  assert.equal(bad.isError, true);
  const caps = await client.callTool({ name: 'vergecommon_capabilities', arguments: {} });
  assert.ok(
    caps.structuredContent.available.some((a) => /spine analyses/.test(a)),
  );
  await client.close();
});

await test('hosted check_woodland_plan is the co-op preview: it passes the request through and reports busy answers', async () => {
  const calls = [];
  const principal = { id: 'owner', kind: 'token', scopes: ['mcp:read'] };
  const server = createServer({
    woodland: true,
    privateAccess: {
      principal,
      previewWoodland: async (p, id, input) => {
        calls.push([p.id, id, input]);
        if (input.projectId === 'limited')
          throw Object.assign(new Error('You have checked many woodland plans. Wait a few minutes.'), { status: 429 });
        if (input.projectId === 'busy')
          throw Object.assign(new Error('Landscape analysis is busy. Try again in a minute.'), { status: 503 });
        if (input.projectId === 'broken')
          throw Object.assign(new Error('SQLITE internal detail'), { status: 500 });
        return { check: { status: 'pass', lostLinks: [], layersVersionId: 'v1' } };
      },
    },
  });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const tool = (await client.listTools()).tools.find((t) => t.name === 'check_woodland_plan');
  assert.equal(tool.annotations.readOnlyHint, true);
  const r = await client.callTool({ name: 'check_woodland_plan', arguments: { id: coop, projectId: 'p1' } });
  assert.deepEqual(r.structuredContent.data, { status: 'pass', lostLinks: [], layersVersionId: 'v1' });
  const unit = F(rect(700, 300, 800, 800), { dfm_id: 'harvest-3' });
  await client.callTool({ name: 'check_woodland_plan', arguments: { id: coop, projectId: 'p1', treatments: [unit] } });
  assert.deepEqual(calls, [
    ['owner', coop, { projectId: 'p1', treatments: [] }],
    ['owner', coop, { projectId: 'p1', treatments: [unit] }],
  ]);
  for (const [projectId, message] of [
    ['limited', /Wait a few minutes/],
    ['busy', /busy/],
    ['broken', /could not be completed/],
  ]) {
    const failed = await client.callTool({ name: 'check_woodland_plan', arguments: { id: coop, projectId } });
    assert.equal(failed.isError, true);
    assert.match(failed.content[0].text, message);
    assert.doesNotMatch(failed.content[0].text, /SQLITE/);
  }
  await client.close();
});
