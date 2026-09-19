import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingWork } from '../lib/pending-work.mjs';
import { newWorkspace, memberView } from '../lib/network.mjs';

function fixture() {
  const state = newWorkspace(
    {
      name: 'Fixture',
      region: 'Synthetic',
      summary: 'Only tests',
      displayName: 'Steward',
    },
    { id: 'steward' },
    1,
    'coop',
  );
  state.members.push(
    {
      id: 'neighbor-member',
      userId: 'neighbor',
      role: 'member',
      status: 'active',
      name: 'Neighbor',
    },
    {
      id: 'pending-member',
      userId: 'pending',
      role: 'member',
      status: 'pending',
      name: 'Pending',
    },
  );
  state.evidence = [
    { id: 'own', status: 'submitted', createdBy: 'neighbor' },
    { id: 'other', status: 'submitted', createdBy: 'steward' },
    { id: 'reviewed', status: 'reviewed', createdBy: 'neighbor' },
  ];
  state.reports = [
    { id: 'own-report', status: 'open', createdBy: 'neighbor' },
    { id: 'other-report', status: 'open', createdBy: 'steward' },
  ];
  state.proposals = [
    {
      id: 'eligible',
      status: 'open',
      closesAt: 200,
      electorate: ['neighbor-member'],
      votes: [],
    },
    {
      id: 'not-eligible',
      status: 'open',
      closesAt: 200,
      electorate: ['other-member'],
      votes: [],
    },
    {
      id: 'voted',
      status: 'open',
      closesAt: 200,
      electorate: ['neighbor-member'],
      votes: [{ memberId: 'neighbor-member' }],
    },
    {
      id: 'closed',
      status: 'open',
      closesAt: 100,
      electorate: ['neighbor-member'],
      votes: [],
    },
  ];
  return state;
}
const counts = (items) =>
  Object.fromEntries(items.map((item) => [item.id, item.count]));
await test('notices use the authorized member projection and do not reveal another member’s records', () => {
  const state = fixture();
  const view = memberView(state, 'neighbor');
  const result = pendingWork(view.state, { memberId: view.memberId, now: 100 });
  assert.deepEqual(counts(result), { evidence: 1, reports: 1, votes: 1 });
  assert.ok(!JSON.stringify(result).includes('other'));
  const steward = memberView(state, 'steward');
  const stewardResult = counts(
    pendingWork(steward.state, {
      memberId: steward.memberId,
      steward: true,
      now: 100,
    }),
  );
  assert.deepEqual(stewardResult, {
    membership: 1,
    evidence: 2,
    reports: 2,
    tally: 2,
  });
  assert.deepEqual(
    pendingWork(
      { ...view.state, visibility: 'archived' },
      { memberId: view.memberId, now: 100 },
    ),
    [],
  );
  assert.deepEqual(
    pendingWork(view.state, { memberId: view.memberId, now: 0 }),
    [],
  );
});
await test('notices clear after a vote or completed review and count only the latest active land records', () => {
  const state = fixture();
  state.proposals[0].votes.push({ memberId: 'neighbor-member' });
  state.evidence[0].status = 'reviewed';
  state.reports[0].status = 'dismissed';
  state.parcels = [
    {
      id: 'land',
      createdBy: 'neighbor',
      status: 'reviewed',
      boundaries: [{ status: 'submitted' }, { status: 'reviewed' }],
      consents: [{ status: 'submitted' }],
    },
    {
      id: 'withdrawn',
      createdBy: 'neighbor',
      status: 'withdrawn',
      boundaries: [{ status: 'submitted' }],
      consents: [{ status: 'submitted' }],
    },
  ];
  const view = memberView(state, 'neighbor');
  assert.deepEqual(
    counts(pendingWork(view.state, { memberId: view.memberId, now: 100 })),
    { land: 1 },
  );
  view.state.parcels[0].boundaries.push({ status: 'submitted' });
  const result = pendingWork(view.state, { memberId: view.memberId, now: 100 });
  assert.equal(
    result.find((notice) => notice.id === 'boundaries').tab,
    'monitoring',
  );
});
