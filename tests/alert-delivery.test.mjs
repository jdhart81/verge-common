import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../.github/workflows/uptime.yml', import.meta.url), 'utf8');

await test('AL1/AL2: every alert issue is opened assigned to the owner, and still opened if assigning fails', () => {
  assert.match(yml, /OWNER: \$\{\{ github\.repository_owner \}\}/);
  assert.match(yml, /gh issue create --assignee "\$OWNER" "\$@" \|\| gh issue create "\$@"/);
  // No alert path opens an issue except through open().
  const creates = yml.split('\n').filter((line) => line.includes('gh issue create') && !line.trim().startsWith('#'));
  assert.equal(creates.length, 1, creates.join('\n'));
  for (const label of ['alert-health', 'alert-mcp', 'alert-launch-gate'])
    assert.match(yml, new RegExp(`alert ${label} "`), label);
});

await test('AL3: the test alert is opt-in, separately labelled, closed in the same run and cannot fail it', () => {
  assert.match(yml, /test_alert:\n\s+description: [^\n]+\n\s+type: boolean\n\s+default: false/);
  assert.match(yml, /TEST_ALERT: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.test_alert \}\}/);
  const block = yml.slice(yml.indexOf('if [ "$TEST_ALERT" = true ]'), yml.indexOf('failed=0'));
  assert.ok(block.includes('--label alert-test') && block.includes('gh issue close "$url"'));
  assert.ok(block.includes('|| echo'), 'a failed test alert must not fail the run');
  assert.ok(!/alert-(health|mcp|launch-gate)/.test(block), 'the test touches no real alert label');
  assert.ok(block.includes('Nothing is wrong with vergecommon.com'));
});

await test('the schedule is described honestly', () => {
  assert.match(yml, /slow backstop, not a pager/);
});
