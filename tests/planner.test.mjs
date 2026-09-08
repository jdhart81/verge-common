import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlan, addTask, parsePlan, invitation } from '../lib/planner.mjs';
test('saved plans round-trip with actions and notes', () => {
  const plan = addTask(
    { ...emptyPlan(), name: 'Garden', notes: 'Private reflection' },
    'Plant native seeds',
    'a',
  );
  plan.tasks[0].done = true;
  const loaded = parsePlan(JSON.parse(JSON.stringify(plan)));
  assert.equal(loaded.tasks[0].done, true);
  assert.equal(loaded.notes, 'Private reflection');
});
test('invitation excludes private notes and completed actions', () => {
  let plan = { ...emptyPlan(), name: 'Garden', notes: 'Do not share this' };
  plan = addTask(plan, 'Finished', 'a');
  plan.tasks[0].done = true;
  plan = addTask(plan, 'Next action', 'b');
  const text = invitation(plan, 'https://example.com');
  assert.ok(text.includes('Next action'));
  assert.ok(!text.includes('Do not share this'));
  assert.ok(!text.includes('Finished'));
});
test('invalid and oversized saved data are handled deliberately', () => {
  assert.throws(() => parsePlan({ version: 2, tasks: [] }));
  assert.throws(() => parsePlan({ version: 1, tasks: [null] }));
  assert.equal(
    parsePlan({ ...emptyPlan(), name: 'x'.repeat(1000) }).name.length,
    100,
  );
  assert.throws(() => addTask(emptyPlan(), '  ', 'a'));
});
test('adding an action does not mutate the previous plan', () => {
  const plan = emptyPlan();
  const next = addTask(plan, 'Survey', 'id');
  assert.equal(plan.tasks.length, 0);
  assert.equal(next.tasks.length, 1);
});
