import test from 'node:test';
import assert from 'node:assert/strict';
import { startWorkspaceRefresh } from '../lib/workspace-refresh.mjs';

function fixture(refresh) {
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const window = new EventTarget();
  window.navigator = { onLine: true };
  let tick;
  window.setInterval = (fn, ms) => {
    assert.equal(ms, 30_000);
    tick = fn;
    return 7;
  };
  window.clearInterval = (id) => {
    assert.equal(id, 7);
  };
  const stop = startWorkspaceRefresh({ refresh, document, window });
  return { document, window, tick: () => tick(), stop };
}
await test('refresh is bounded to visible online workspaces and resumes on visibility/connection', async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
  });
  assert.equal(calls, 0);
  await f.tick();
  assert.equal(calls, 1);
  f.document.visibilityState = 'hidden';
  await f.tick();
  assert.equal(calls, 1);
  f.document.visibilityState = 'visible';
  f.document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  assert.equal(calls, 2);
  f.window.navigator.onLine = false;
  await f.tick();
  assert.equal(calls, 2);
  f.window.navigator.onLine = true;
  f.window.dispatchEvent(new Event('online'));
  await Promise.resolve();
  assert.equal(calls, 3);
  f.stop();
});
await test('slow reads do not overlap; stopping removes all future triggers', async () => {
  let calls = 0,
    finish;
  const f = fixture(() => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const first = f.tick();
  await f.tick();
  f.window.dispatchEvent(new Event('focus'));
  assert.equal(calls, 1);
  f.stop();
  finish();
  await first;
  await f.tick();
  f.window.dispatchEvent(new Event('online'));
  f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 1);
});
await test('a failed read does not prevent a later refresh', async () => {
  let calls = 0;
  const f = fixture(async () => {
    if (++calls === 1) throw new Error('Offline');
  });
  await f.tick();
  await f.tick();
  assert.equal(calls, 2);
  f.stop();
});
