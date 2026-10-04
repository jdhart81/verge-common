// WS7 for submitted plans (lib/woodland.mjs, server/woodland-analysis.mjs): on the server the
// corridor check runs in the analysis worker, never on the request thread. The command is
// first applied with the check deferred, so a submission it refuses costs no engine time; the
// worker's result is used only for exactly the input the command builds, and server context
// never comes from the request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHashSync, checkConnectivitySync } from '@viridis/dfm-core';
import { applyCommand } from '../lib/network.mjs';
import { DomainError } from '../lib/domain-error.mjs';
import {
  CHECK_DEFERRED,
  CHECK_INPUT_FORM,
  deferredCheckInput,
} from '../lib/woodland.mjs';
import { submitCheckContext } from '../server/woodland-analysis.mjs';
import {
  setup,
  reviewedLayers,
  cut,
  away,
  member,
  owner,
} from './woodland-editor-fixture.mjs';

const payload = (f, treatments, extra = {}) => ({
  projectId: f.project,
  name: 'Winter 2027 harvest',
  period: '2027',
  treatments,
  ...extra,
});
const request = (p) => ({
  op: 'submit_treatment_plan',
  payload: p,
  requestId: crypto.randomUUID(),
});
// The exact input the command checks, from the command itself.
function deferredInput(f, p, actor = member) {
  try {
    applyCommand(f.s, actor, request(p), 100, 'deferred', {
      woodlandCheck: CHECK_DEFERRED,
    });
  } catch (error) {
    const input = deferredCheckInput(error);
    if (input) return input;
    throw error;
  }
  throw new Error('The command did not defer its check.');
}
// Apply submit_treatment_plan with server context, as app/api/workspaces does.
const submit = (f, p, context) => {
  const id = crypto.randomUUID();
  const next = applyCommand(
    f.s,
    member,
    { op: 'submit_treatment_plan', payload: p },
    100,
    id,
    context,
  );
  return next.treatmentPlans.find((x) => x.id === id);
};
// A runner that records each job and runs the real check.
function recordingRunner() {
  const calls = [];
  return {
    calls,
    async run(kind, input, options) {
      calls.push({ kind, key: options?.key ?? null });
      return checkConnectivitySync(input);
    },
  };
}
const inline = { production: false, runner: null };

await test('WS7 the deferred input is the input the command checks, and nothing is stored', () => {
  const f = setup();
  reviewedLayers(f);
  const before = JSON.stringify(f.s);
  for (const units of [[cut], [away], [cut, away]]) {
    const p = payload(f, units);
    const input = deferredInput(f, p);
    assert.equal(JSON.stringify(f.s), before, 'deferral applies nothing');
    const plan = submit(f, p);
    assert.equal(canonicalHashSync(input), plan.check.inputChecksum);
    assert.equal(plan.check.inputForm, CHECK_INPUT_FORM);
  }
});

await test('WS7 the server checks in the worker, keyed by account, and stores that result', async () => {
  const f = setup();
  reviewedLayers(f);
  const runner = recordingRunner();
  const p = payload(f, [cut]);
  const context = await submitCheckContext(f.s, member, request(p), {
    runner,
    production: true,
  });
  assert.deepEqual(runner.calls, [{ kind: 'check', key: member.id }]);
  context.woodlandCheck.computedIn = 'worker';
  const plan = submit(f, p, context);
  assert.equal(plan.check.computedIn, 'worker', 'the command did not recompute');
  assert.equal(plan.check.status, 'fail');
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.check.inputForm, CHECK_INPUT_FORM);
});

await test('WS7 a submission the command refuses costs no engine time', async () => {
  const f = setup();
  reviewedLayers(f);
  const runner = recordingRunner();
  const refused = async (p, pattern, actor = member, state = f.s) =>
    assert.rejects(
      submitCheckContext(state, actor, request(p), { runner, production: true }),
      (e) => pattern.test(e.message),
    );
  await refused(payload(f, [cut], { name: '' }), /plan name/i);
  await refused(payload(f, [cut], { period: '' }), /period/i);
  await refused(payload(f, []), /Add at least one treatment unit/);
  await refused(payload(f, [cut], { projectId: 'nope' }), /not found|project/i);
  await refused(payload(f, [cut]), /membership/i, { id: 'outsider' });
  const huge = structuredClone(cut);
  huge.geometry.coordinates[0] = Array.from({ length: 3000 }, () => [
    0.00123456789012345, 0.00987654321098765,
  ]);
  await refused(payload(f, [huge]), /Simplify/);
  // An archived co-op refuses every ordinary command before any check.
  const archived = { ...structuredClone(f.s), visibility: 'archived' };
  await refused(payload(f, [cut]), /archived/, member, archived);
  // The plan limit is checked first too.
  const full = structuredClone(f.s);
  const plan = submit(f, payload(f, [away]));
  full.treatmentPlans = Array.from({ length: 40 }, (_, i) => ({
    ...plan,
    id: `plan-${i}`,
  }));
  await refused(payload(f, [away]), /40 treatment plans/, member, full);
  assert.deepEqual(runner.calls, [], 'the worker never ran');
});

await test('WS7 production never checks on the request thread', async () => {
  const f = setup();
  reviewedLayers(f);
  const p = payload(f, [cut]);
  await assert.rejects(
    submitCheckContext(f.s, member, request(p), { runner: null, production: true }),
    (e) => e instanceof DomainError && e.status === 503,
  );
  for (const status of [429, 503, 504])
    await assert.rejects(
      submitCheckContext(f.s, member, request(p), {
        runner: {
          run: async () => {
            throw Object.assign(new Error(`Worker answered ${status}`), { status });
          },
        },
        production: true,
      }),
      (e) => e instanceof DomainError && e.status === status,
    );
  // Development runs the engine inline (no runner outside production).
  const dev = await submitCheckContext(f.s, member, request(p), inline);
  assert.equal(dev.woodlandCheck.status, 'fail');
});

await test('WS7 a result for any other input is refused, never rechecked on the request thread', () => {
  const f = setup();
  reviewedLayers(f);
  const p = payload(f, [cut]);
  // A passing result computed for different units (for example, before the state changed).
  const stale = checkConnectivitySync(deferredInput(f, payload(f, [away])));
  assert.equal(stale.status, 'pass');
  for (const woodlandCheck of [stale, { ...stale, inputChecksum: null }, {}])
    assert.throws(
      () => submit(f, p, { woodlandCheck }),
      (e) => e.status === 409 && /changed while this plan was being checked/.test(e.message),
    );
  // Without server context (tests, scripts) the command checks the plan itself.
  assert.equal(submit(f, p).status, 'blocked');
});

await test('WS7 the request cannot supply a check result', async () => {
  const f = setup();
  reviewedLayers(f);
  const forged = {
    ...checkConnectivitySync(deferredInput(f, payload(f, [away]))),
    status: 'pass',
  };
  const p = payload(f, [cut], {
    woodlandCheck: forged,
    precomputedCheck: forged,
    check: forged,
  });
  // Neither inside the payload nor beside it in the request body.
  const data = { ...request(p), woodlandCheck: forged, context: { woodlandCheck: forged } };
  const runner = recordingRunner();
  const context = await submitCheckContext(f.s, member, data, {
    runner,
    production: true,
  });
  assert.equal(context.woodlandCheck.status, 'fail', 'the worker’s own result');
  const plan = submit(f, p, context);
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.check.status, 'fail');
  assert.equal(submit(f, p).status, 'blocked');
  // Only a plan submission is ever deferred.
  await assert.rejects(
    submitCheckContext(
      f.s,
      owner,
      { op: 'create_task', payload: { projectId: f.project, title: 'Survey' }, requestId: crypto.randomUUID() },
      { runner, production: true },
    ),
    (e) => e instanceof DomainError && e.status === 400,
  );
});
