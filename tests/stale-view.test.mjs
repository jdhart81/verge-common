// Saving from a page that is behind: CR1-CR3 in server/workspaces.ts. The behaviour itself is
// exercised over HTTP in tests/selfhost_acceptance.py; this pins the list and the guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (f) => readFile(new URL('../' + f, import.meta.url), 'utf8');

await test('CR1 only commands that add the sender’s own new record skip the version check', async () => {
  const server = await read('server/workspaces.ts');
  const list = server
    .slice(server.indexOf('STALE_VIEW_SAFE_OPS = new Set(['), server.indexOf(']);', server.indexOf('STALE_VIEW_SAFE_OPS = new Set([')))
    .match(/'([a-z_]+)'/g)
    .map((s) => s.slice(1, -1));
  assert.deepEqual(list, [
    'post_update',
    'post_comment',
    'event_rsvp',
    'report_content',
    'record_parcel',
    'vote',
  ]);
  // Nothing that reviews, approves, grants, consents, removes or moves money is on the list.
  for (const op of list)
    assert.doesNotMatch(op, /review|approve|status|role|consent|revoke|remove|hide|close|transfer|payment|allocation|layers|plan/);
  // Every listed command exists in the reducer.
  const reducer = (await read('lib/network.mjs')) + (await read('lib/woodland.mjs'));
  for (const op of list) assert.ok(reducer.includes(`case '${op}'`), op);
});

await test('CR3 the save is still a compare-and-swap, retries are bounded, and a request is answered once', async () => {
  const server = await read('server/workspaces.ts');
  assert.match(server, /WHERE id = \? AND version = \?/);
  assert.match(server, /attempt < 6 &&/);
  assert.match(server, /if \(expectedVersion !== null && expectedVersion !== row\.version\)/);
  // The receipt lookup comes before the version check, so a repeated request ID is answered
  // from its receipt whether or not the page was behind.
  assert.ok(server.indexOf('a.id === input.requestId') < server.indexOf('expectedVersion !== null'));
  // CR4: saves to one co-op are queued in this process; the queue entry is removed when idle.
  assert.match(server, /return inTurn\(id, \(\) =>\s*commandInTurn\(id, user, input, expectedVersion, context\),/);
  assert.match(server, /if \(saving\.get\(id\) === settled\) saving\.delete\(id\);/);
  const acceptance = await read('tests/selfhost_acceptance.py');
  assert.match(acceptance, /Posted from a page that was behind/);
  assert.match(acceptance, /command\(a,'member_role',\{'id':member\['id'\],'role':'steward'\},stale\)\[0\]==409/);
});
