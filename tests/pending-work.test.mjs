import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingWork } from '../lib/pending-work.mjs';
import { applyCommand, newWorkspace, memberView } from '../lib/network.mjs';

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

const reviewNoticeIds = new Set([
  'observations',
  'imagery',
  'holdings',
  'settlements',
  'allocations',
  'payments',
  'disbursements',
  'retirements',
]);
const reviewNotices = (state, userId = 'steward') => {
  const view = memberView(state, userId);
  return pendingWork(view.state, {
    memberId: view.memberId,
    steward: view.role === 'steward',
    now: 100,
  }).filter((item) => reviewNoticeIds.has(item.id));
};

function reviewFixture() {
  const state = fixture();
  const records = (kind, status = 'submitted') =>
    [
      { id: `${kind}-other`, status, createdBy: 'neighbor' },
      { id: `${kind}-self`, status, createdBy: 'steward' },
      { id: `${kind}-done`, status: 'reviewed', createdBy: 'neighbor' },
      { id: `${kind}-rejected`, status: 'rejected', createdBy: 'neighbor' },
    ].map((r) => ({
      ...r,
      reference: 'PRIVATE-RECEIPT',
      note: 'PRIVATE-NOTE',
    }));
  state.parcels = [
    { id: 'private-parcel', createdBy: 'neighbor', status: 'reviewed' },
  ];
  state.observations = records('observation').map((r) => ({
    ...r,
    parcelId: 'private-parcel',
  }));
  state.analysisResults = records('imagery').map((r) => ({
    ...r,
    parcelId: 'private-parcel',
  }));
  state.lots = records('holding');
  state.settlements = records('settlement');
  state.retirements = records('retirement');
  state.allocations = records('allocation', 'draft').map((r) => ({
    ...r,
    payments: [],
    disbursements: [],
  }));
  state.allocations.push({
    id: 'approved-allocation',
    status: 'approved',
    createdBy: 'neighbor',
    payments: records('payment'),
    disbursements: records('disbursement').map((r) => ({
      ...r,
      budget: 'stewardship',
    })),
  });
  return state;
}

await test('monitoring and financial notices include only the viewer’s independent reviews', () => {
  const state = reviewFixture();
  const result = reviewNotices(state);
  assert.deepEqual(counts(result), {
    observations: 1,
    imagery: 1,
    holdings: 1,
    settlements: 1,
    allocations: 1,
    payments: 1,
    disbursements: 1,
    retirements: 1,
  });
  assert.ok(
    result.every(
      (item) =>
        item.tab ===
        (['observations', 'imagery'].includes(item.id)
          ? 'monitoring'
          : 'ledger'),
    ),
  );
  assert.ok(
    result.every(
      (item) => Object.keys(item).sort().join() === 'count,id,label,tab',
    ),
  );
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.ok(!JSON.stringify(result).includes('private-parcel'));
  assert.deepEqual(reviewNotices(state, 'neighbor'), []);
  // The caller's presentation flag cannot turn a member projection into a
  // steward review list, even though financial records are member-visible.
  const neighbor = memberView(state, 'neighbor');
  assert.deepEqual(
    pendingWork(neighbor.state, {
      memberId: neighbor.memberId,
      steward: true,
      now: 100,
    }).filter((item) => reviewNoticeIds.has(item.id)),
    [],
  );
});

await test('review notices clear after the actual independent domain transition', () => {
  /** @type {Array<[string, string, Record<string, string>]>} */
  const cases = [
    [
      'observations',
      'review_observation',
      { id: 'observation-other', decision: 'approve' },
    ],
    [
      'imagery',
      'review_analysis',
      {
        id: 'imagery-other',
        decision: 'approve',
        note: 'Synthetic field checks and limitations reviewed.',
      },
    ],
    ['holdings', 'review_lot', { id: 'holding-other', decision: 'approve' }],
    [
      'settlements',
      'review_settlement',
      { id: 'settlement-other', decision: 'approve' },
    ],
    ['allocations', 'approve_allocation', { id: 'allocation-other' }],
    [
      'payments',
      'review_payment',
      {
        id: 'approved-allocation',
        paymentId: 'payment-other',
        decision: 'approve',
      },
    ],
    [
      'disbursements',
      'review_disbursement',
      {
        id: 'approved-allocation',
        disbursementId: 'disbursement-other',
        decision: 'approve',
      },
    ],
    [
      'retirements',
      'review_retirement',
      { id: 'retirement-other', decision: 'approve' },
    ],
  ];
  for (const [noticeId, op, payload] of cases) {
    const state = reviewFixture();
    assert.equal(counts(reviewNotices(state))[noticeId], 1, op);
    const next = applyCommand(
      state,
      { id: 'steward' },
      { op, payload },
      100,
      `review-${noticeId}`,
    );
    assert.equal(counts(reviewNotices(next))[noticeId], undefined, op);
    assert.equal(
      counts(reviewNotices(state))[noticeId],
      1,
      'The input was not mutated.',
    );
  }
});

await test('new review notices fail closed for missing flags, paused finance and paused growth', () => {
  const state = reviewFixture();
  // A legacy raw state has author IDs but no authenticated review flags. It is
  // not safe to infer authorship from a membership ID or a name.
  assert.deepEqual(
    pendingWork(state, {
      steward: true,
      memberId: state.members[0].id,
      now: 100,
    }).filter((item) => reviewNoticeIds.has(item.id)),
    [],
  );
  const redacted = { ...state, financialRecordsRedactedAt: 99 };
  assert.deepEqual(counts(reviewNotices(redacted)), {
    observations: 1,
    imagery: 1,
  });
  const capacityPaused = structuredClone(state);
  capacityPaused.audit = Array.from({ length: 4500 }, () => ({}));
  assert.deepEqual(reviewNotices(capacityPaused), []);
  assert.deepEqual(reviewNotices({ ...state, visibility: 'archived' }), []);
});
