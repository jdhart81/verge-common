// Spine analysis endpoint and worker runner. WS7, WS8 and WS10 in server/woodland-analysis.mjs
// and self-hosted/woodland-analysis.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../lib/domain-error.mjs';
import {
  woodlandAnalysis,
  clearAnalysisCache,
  WOODLAND_ANALYSIS_RUNNER,
} from '../server/woodland-analysis.mjs';
import {
  createWoodlandAnalysisPool,
  WOODLAND_ANALYSIS_RUNNER as GATEWAY_SYMBOL,
} from '../self-hosted/woodland-analysis.mjs';
import { runSpineAnalysis } from '../lib/woodland-spine-run.mjs';
import {
  owner,
  reviewer,
  member,
  outsider,
  NOW,
  spineCoop,
  reviewWatershedLayers,
} from './woodland-spine-fixture.mjs';

const testWorker = new URL('./woodland-analysis-test-worker.mjs', import.meta.url);
const status = (e, code) => e instanceof DomainError && e.status === code;
// A runner that records calls and answers with a canned frontier result.
function fakeRunner() {
  const calls = [];
  return {
    calls,
    async run(kind, input) {
      calls.push(kind);
      return {
        status: 'ok',
        engine: 'fake',
        inputChecksum: 'x',
        reasons: [],
        warnings: [],
        committed: { parcels: ['woodlot-1'], spineM2: 1, mappedSpineM2: 2, share: 0.5, links: [] },
        frontier: input.parcels
          .filter((p) => p.properties.consent === 'none')
          .map((p) => ({ parcel: p.properties.dfm_id, spineM2: 1, completesLinks: [] })),
        laterParcels: [],
      };
    },
  };
}
const coop = (() => {
  const f = spineCoop();
  reviewWatershedLayers(f);
  return f;
})();

await test('WS8 membership and the flag are checked before project inputs are read', async () => {
  clearAnalysisCache();
  const runner = fakeRunner();
  const data = { projectId: coop.project, kind: 'frontier' };
  await assert.rejects(
    woodlandAnalysis(coop.s, outsider.id, data, { enabled: true, runner }),
    (e) => status(e, 403),
  );
  await assert.rejects(
    woodlandAnalysis(coop.s, member.id, data, { enabled: false, runner }),
    (e) => status(e, 404),
  );
  await assert.rejects(
    woodlandAnalysis(coop.s, member.id, { ...data, kind: 'all' }, { enabled: true, runner }),
    (e) => status(e, 400),
  );
  await assert.rejects(
    woodlandAnalysis(coop.s, member.id, { ...data, projectId: 'nope' }, { enabled: true, runner }),
    (e) => status(e, 404),
  );
  assert.deepEqual(runner.calls, []);
});

await test('WS7 production refuses to run analyses without the worker runner', async () => {
  clearAnalysisCache();
  await assert.rejects(
    woodlandAnalysis(
      coop.s,
      owner.id,
      { projectId: coop.project, kind: 'climate' },
      { enabled: true, runner: null, production: true, now: NOW },
    ),
    (e) => status(e, 503),
  );
});

await test('WS10 results are cached by exact input and reduced per viewer after the cache', async () => {
  clearAnalysisCache();
  const runner = fakeRunner();
  const data = { projectId: coop.project, kind: 'frontier' };
  const options = { enabled: true, runner, now: NOW };
  const stewardView = await woodlandAnalysis(coop.s, owner.id, data, options);
  // Another steward asks for the same analysis of the same input: served from the cache.
  const secondSteward = await woodlandAnalysis(coop.s, reviewer.id, data, options);
  assert.deepEqual(runner.calls, ['frontier']);
  assert.deepEqual(secondSteward.result, stewardView.result);
  // The member's input leaves out planned years on woodlots others recorded (WS8), so it is a
  // different input with its own cache entry; asking again is a hit.
  const memberView = await woodlandAnalysis(coop.s, member.id, data, options);
  await woodlandAnalysis(coop.s, member.id, data, options);
  assert.deepEqual(runner.calls, ['frontier', 'frontier']);
  assert.equal(stewardView.viewer, 'steward');
  assert.equal(stewardView.result.frontier.length, 6);
  assert.equal(memberView.viewer, 'member');
  // WS8: a member gets the build-out total only; per-woodlot rows stay with stewards.
  assert.deepEqual(memberView.result.frontier, []);
  assert.deepEqual(memberView.result.laterParcels, []);
  assert.equal(memberView.result.frontierForStewards, true);
  assert.equal(memberView.result.committed.parcelCount, 1);
  assert.equal(stewardView.result.frontierForStewards, undefined);
  // WS11: provenance travels with every result.
  for (const key of ['layersVersionId', 'analysisYear', 'ageShiftYears', 'ageAsOfYear'])
    assert.ok(key in memberView, key);
  // A different analysis year changes the input, so the cache misses.
  await woodlandAnalysis(coop.s, owner.id, data, { ...options, now: Date.UTC(2027, 0, 2) });
  assert.deepEqual(runner.calls, ['frontier', 'frontier', 'frontier']);
});

await test('WS7 runner errors keep their status; unexpected failures stay generic', async () => {
  clearAnalysisCache();
  const data = { projectId: coop.project, kind: 'network' };
  const failing = (error) => ({ run: async () => { throw error; } });
  await assert.rejects(
    woodlandAnalysis(coop.s, owner.id, data, {
      enabled: true,
      now: NOW,
      runner: failing(Object.assign(new Error('The analysis took too long.'), { status: 504 })),
    }),
    (e) => status(e, 504) && /too long/.test(e.message),
  );
  await assert.rejects(
    woodlandAnalysis(coop.s, owner.id, data, {
      enabled: true,
      now: NOW,
      runner: failing(new Error('internal detail')),
    }),
    (e) => !(e instanceof DomainError),
  );
});

await test('WS7 the gateway and the app agree on where the runner is registered', () => {
  assert.equal(GATEWAY_SYMBOL, WOODLAND_ANALYSIS_RUNNER);
});

await test('WS7 the runner answers in order, times out a stuck job and recovers on a fresh worker', async () => {
  const pool = createWoodlandAnalysisPool({ timeoutMs: 1500, maxWaiting: 2, workerUrl: testWorker });
  try {
    const first = await pool.run('echo', { n: 1 });
    assert.deepEqual(first.echo, { n: 1 });
    const started = Date.now();
    await assert.rejects(pool.run('hang', {}), (e) => e.status === 504);
    assert.ok(Date.now() - started < 3000, 'the deadline bounds the wait');
    assert.equal(pool.stats().timedOut, 1);
    assert.deepEqual((await pool.run('echo', { n: 2 })).echo, { n: 2 });
    await assert.rejects(pool.run('throw', {}), (e) => e.status === 400);
    await assert.rejects(pool.run('crash', {}), (e) => e.status === 500);
    assert.deepEqual((await pool.run('echo', { n: 3 })).echo, { n: 3 });
  } finally {
    await pool.close();
  }
});

await test('WS7 a full queue answers 503 at once; the deadline includes waiting time', async () => {
  const pool = createWoodlandAnalysisPool({ timeoutMs: 1200, maxWaiting: 1, workerUrl: testWorker });
  try {
    const running = pool.run('hang', {});
    const queued = pool.run('echo', { queued: true });
    await assert.rejects(pool.run('echo', {}), (e) => e.status === 503 && /busy/.test(e.message));
    await assert.rejects(running, (e) => e.status === 504);
    // The queued job's deadline passed while it waited, so it never starts.
    await assert.rejects(queued, (e) => e.status === 503);
    await pool.close();
    await assert.rejects(pool.run('echo', {}), (e) => e.status === 503);
  } finally {
    await pool.close();
  }
});

await test('WS7 one job per account at a time: a second concurrent request from it answers 429', async () => {
  const pool = createWoodlandAnalysisPool({ timeoutMs: 10000, maxWaiting: 2, workerUrl: testWorker });
  try {
    const first = pool.run('slow', { ms: 400 }, { key: 'alice' });
    await assert.rejects(
      pool.run('echo', { n: 1 }, { key: 'alice' }),
      (e) => e.status === 429 && /still running/.test(e.message),
    );
    // Another account queues behind it; jobs without a key never conflict.
    const other = pool.run('echo', { n: 2 }, { key: 'bob' });
    const anonymous = pool.run('echo', { n: 3 });
    assert.equal((await first).status, 'ok');
    assert.deepEqual((await other).echo, { n: 2 });
    assert.deepEqual((await anonymous).echo, { n: 3 });
    // Once its job is done the account can run again.
    assert.deepEqual((await pool.run('echo', { n: 4 }, { key: 'alice' })).echo, { n: 4 });
    // A queued (not yet running) job holds its account's place too.
    const running = pool.run('slow', { ms: 300 }, { key: 'bob' });
    const queued = pool.run('echo', { n: 5 }, { key: 'carol' });
    await assert.rejects(pool.run('echo', {}, { key: 'carol' }), (e) => e.status === 429);
    await Promise.all([running, queued]);
  } finally {
    await pool.close();
  }
});

await test('WS7 a worker that cannot start, or a job it cannot receive, answers 503 and the pool recovers', async () => {
  // The Worker constructor throws (here: a path it refuses; in production: thread exhaustion).
  const broken = createWoodlandAnalysisPool({ timeoutMs: 2000, workerUrl: 'not-a-module-path.mjs' });
  try {
    for (let i = 0; i < 2; i += 1)
      await assert.rejects(
        broken.run('echo', {}, { key: 'alice' }),
        (e) => e.status === 503 && /could not start/.test(e.message),
      );
    assert.deepEqual(
      { busy: broken.stats().busy, waiting: broken.stats().waiting, worker: broken.stats().worker },
      { busy: false, waiting: 0, worker: false },
      'a failed start leaves nothing behind',
    );
  } finally {
    await broken.close();
  }
  const pool = createWoodlandAnalysisPool({ timeoutMs: 2000, workerUrl: testWorker });
  try {
    // An input that cannot be sent to the worker fails its own job only.
    await assert.rejects(
      pool.run('echo', { fn: () => 1 }),
      (e) => e.status === 503,
    );
    assert.deepEqual((await pool.run('echo', { n: 1 })).echo, { n: 1 });
  } finally {
    await pool.close();
  }
});

await test('WS7 job deadlines stay inside the gateway proxy limit', async () => {
  const { deadlineMs, MAX_DEADLINE_MS } = await import('../self-hosted/woodland-analysis.mjs');
  assert.equal(MAX_DEADLINE_MS, 25000);
  assert.equal(deadlineMs(undefined), 25000);
  assert.equal(deadlineMs('60000'), 25000, 'never past the 30 s proxy abort');
  assert.equal(deadlineMs('10'), 1000);
  assert.equal(deadlineMs('12000'), 12000);
  assert.equal(deadlineMs('nonsense'), 25000);
});

await test('WS7 the real worker runs the engine off the main thread with the same result', async () => {
  const pool = createWoodlandAnalysisPool({ timeoutMs: 60000 });
  try {
    const { spineAnalysisInput } = await import('../lib/woodland-spine.mjs');
    const { input } = spineAnalysisInput(coop.s, coop.project, { now: NOW });
    let ticks = 0;
    const timer = setInterval(() => (ticks += 1), 20);
    const result = await pool.run('climate', input);
    clearInterval(timer);
    assert.equal(result.status, 'ok');
    assert.ok(ticks > 5, 'the main thread kept running while the worker computed');
    assert.deepEqual(result, runSpineAnalysis('climate', input));
  } finally {
    await pool.close();
  }
});

await test('WS7 registration exposes the pool to the app', async () => {
  const { registerWoodlandAnalysis } = await import('../self-hosted/woodland-analysis.mjs');
  const previous = globalThis[WOODLAND_ANALYSIS_RUNNER];
  const runner = { run: async () => ({ status: 'ok' }) };
  try {
    registerWoodlandAnalysis(runner);
    const { registeredRunner } = await import('../server/woodland-analysis.mjs');
    assert.equal(registeredRunner(), runner);
  } finally {
    globalThis[WOODLAND_ANALYSIS_RUNNER] = previous;
  }
});
