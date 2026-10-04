// WS7 for submitted plans (lib/woodland.mjs): the corridor check normally runs in the analysis
// worker before the command, and the command uses that result only for exactly the input it
// builds from the state it is applied to. Server-computed context never comes from the request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHashSync, checkConnectivitySync } from '@viridis/dfm-core';
import { applyCommand } from '../lib/network.mjs';
import { submitCheckInput, CHECK_INPUT_FORM } from '../lib/woodland.mjs';
import {
  setup,
  reviewedLayers,
  cut,
  away,
  member,
} from './woodland-editor-fixture.mjs';

const payload = (f, treatments) => ({
  projectId: f.project,
  name: 'Winter 2027 harvest',
  period: '2027',
  treatments,
});
// Apply submit_treatment_plan with server context, as app/api/workspaces does.
const submit = (f, p, context) => {
  const id = `submit-${Math.random().toString(16).slice(2)}`;
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

await test('WS7 the precomputed input is the input the command checks', () => {
  const f = setup();
  reviewedLayers(f);
  for (const units of [[cut], [away], [cut, away]]) {
    const p = payload(f, units);
    const input = submitCheckInput(f.s, p);
    const plan = submit(f, p);
    assert.equal(canonicalHashSync(input), plan.check.inputChecksum);
    assert.equal(plan.check.inputForm, CHECK_INPUT_FORM);
  }
});

await test('WS7 a result computed for exactly this input is stored as is', () => {
  const f = setup();
  reviewedLayers(f);
  const p = payload(f, [cut]);
  const precomputed = {
    ...checkConnectivitySync(submitCheckInput(f.s, p)),
    computedIn: 'worker',
  };
  const plan = submit(f, p, { woodlandCheck: precomputed });
  assert.equal(plan.check.computedIn, 'worker', 'the command did not recompute');
  assert.equal(plan.check.status, 'fail');
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.check.inputForm, CHECK_INPUT_FORM);
});

await test('WS7 a result for any other input is ignored and the command checks again', () => {
  const f = setup();
  reviewedLayers(f);
  const p = payload(f, [cut]);
  // A passing result computed for different units (for example, before the state changed).
  const stale = {
    ...checkConnectivitySync(submitCheckInput(f.s, payload(f, [away]))),
    computedIn: 'worker',
  };
  assert.equal(stale.status, 'pass');
  const plan = submit(f, p, { woodlandCheck: stale });
  assert.equal(plan.check.computedIn, undefined);
  assert.equal(plan.check.status, 'fail', 'the cut is still caught');
  assert.equal(plan.status, 'blocked');
  assert.equal(
    plan.check.inputChecksum,
    canonicalHashSync(submitCheckInput(f.s, p)),
  );
  // A result without a checksum is never trusted either.
  const unsigned = { ...stale, inputChecksum: null };
  assert.equal(submit(f, p, { woodlandCheck: unsigned }).status, 'blocked');
});

await test('WS7 the request body cannot supply a check result', () => {
  const f = setup();
  reviewedLayers(f);
  const forged = {
    ...checkConnectivitySync(submitCheckInput(f.s, payload(f, [away]))),
    status: 'pass',
  };
  const p = {
    ...payload(f, [cut]),
    woodlandCheck: forged,
    precomputedCheck: forged,
    check: forged,
  };
  const plan = submit(f, p);
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.check.status, 'fail');
});

await test('WS7 no precomputed input for a submission the command refuses anyway', () => {
  const f = setup();
  assert.equal(
    submitCheckInput(f.s, payload(f, [cut])),
    null,
    'no reviewed layers yet',
  );
  reviewedLayers(f);
  assert.equal(submitCheckInput(f.s, payload(f, [])), null, 'no units');
  assert.equal(submitCheckInput(f.s, { ...payload(f, [cut]), projectId: 'nope' }), null);
  assert.equal(submitCheckInput(f.s, { ...payload(f, null) }), null);
  assert.equal(submitCheckInput(f.s, null), null);
  const huge = structuredClone(cut);
  huge.geometry.coordinates[0] = Array.from({ length: 3000 }, () => [
    0.00123456789012345, 0.00987654321098765,
  ]);
  assert.equal(submitCheckInput(f.s, payload(f, [huge])), null, 'too large');
  // The command then reports the reason itself.
  assert.throws(() => submit(f, payload(f, [])), /Add at least one treatment unit/);
});
