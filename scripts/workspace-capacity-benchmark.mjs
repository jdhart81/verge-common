// Bounded local synthetic measurement. This does not measure HTTP, storage,
// concurrency, the deployment host, recovery time or production capacity.
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { applyCommand, newWorkspace } from '../lib/network.mjs';
import { workspaceBytes, workspaceCapacityIssue } from '../lib/workspace-capacity.mjs';
const user = { id: '00000000-0000-4000-8000-000000000001' };
const hash = (value) => createHash('sha256').update(value).digest('hex');

function fixture(target) {
  const state = newWorkspace({ name: 'Synthetic capacity benchmark', region: 'Local test', summary: 'No real land, accounts or evidence', displayName: 'Synthetic steward' }, user, 1, randomUUID());
  state.projects.push({ id: randomUUID(), name: 'Test habitat', region: 'Local test', summary: 'Synthetic project', status: 'active', visibility: 'members', kind: 'ecohedge' });
  // Each real-shaped update has a full application receipt; source text is
  // within the actual post limit. Stop before the requested snapshot size.
  while (true) {
    const id = randomUUID();
    const update = { id, projectId: state.projects[0].id, text: 'Synthetic community field note. '.repeat(50), visibility: 'members', author: 'Synthetic steward', createdBy: user.id, createdAt: state.updates.length + 1, hidden: false };
    const receipt = { id, sequence: state.audit.length + 1, action: 'post_update', actorId: user.id, at: state.audit.length + 1, requestHash: 'a'.repeat(64), previousHash: 'b'.repeat(64), stateHash: 'c'.repeat(64), commitmentNonce: randomUUID(), hash: 'd'.repeat(64) };
    state.updates.push(update);
    state.audit.push(receipt);
    if (workspaceBytes(state) > target) {
      state.updates.pop();
      state.audit.pop();
      break;
    }
  }
  return state;
}

function sample(state) {
  const input = { op: 'hide_update', payload: { id: state.updates[0].id } };
  const start = performance.now();
  const next = applyCommand(state, user, input, 10000, randomUUID());
  const event = next.audit.at(-1);
  const { audit: _audit, ...data } = next;
  event.requestHash = hash(JSON.stringify({ op: input.op, payload: input.payload }));
  event.previousHash = state.audit.at(-1)?.hash ?? '';
  event.stateHash = hash(JSON.stringify(data));
  event.commitmentNonce = randomUUID();
  event.hash = hash(JSON.stringify(event));
  const issue = workspaceCapacityIssue(state, next, user, input);
  if (issue) throw new Error(issue);
  JSON.stringify(next); // Include the final state serialization for persistence.
  return performance.now() - start;
}

const cases = [];
for (const target of [25000, 300000, 640000, 740000]) {
  const state = fixture(target);
  for (let i = 0; i < 5; i++) sample(state);
  const samples = Array.from({ length: 30 }, () => sample(state)).sort((a, b) => a - b);
  cases.push({ snapshotBytes: workspaceBytes(state), auditEntries: state.audit.length, updates: state.updates.length, samples: samples.length, medianMs: Number(samples[14].toFixed(3)), p95Ms: Number(samples[28].toFixed(3)), maxMs: Number(samples[29].toFixed(3)) });
}
console.log(JSON.stringify({ schema: 1, measuredAt: new Date().toISOString(), runtime: process.version, platform: process.platform, architecture: process.arch, cpu: cpus()[0]?.model, scope: 'Local synchronous domain validation, receipt hashing and JSON serialization only; not an HTTP, storage, concurrency or production-capacity test.', cases }, null, 2));
