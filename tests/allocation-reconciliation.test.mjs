import test from 'node:test';
import assert from 'node:assert/strict';
import { newWorkspace, applyCommand, memberView } from '../lib/network.mjs';
import { allocationReconciliation } from '../lib/allocation-reconciliation.mjs';
import { eraseWorkspaceState } from '../self-hosted/erasure.mjs';

const owner = { id: 'owner' };
const reviewer = { id: 'reviewer' };
const participant = { id: 'participant' };

// Start with reviewed historical land/issuance records. The full preparation
// chain is covered by network.test.mjs; every receipt below uses applyCommand.
function fixture({ approved = true } = {}) {
  let state = newWorkspace({
    name: 'Fictional receipt co-op', region: 'Test region',
    summary: 'Synthetic ledger rehearsal', displayName: 'Owner',
  }, owner, 1, 'coop');
  state.members[0].id = 'owner-member';
  state.members.push(
    { id: 'reviewer-member', userId: reviewer.id, name: 'Reviewer', role: 'steward', status: 'active' },
    { id: 'participant-member', userId: participant.id, name: 'Participant', role: 'member', status: 'active' },
  );
  state.projects = ['project', 'other-project'].map((id) => ({ id, name: id, visibility: 'members' }));
  state.evidence = [
    { id: 'evidence', projectId: 'project', status: 'reviewed', createdBy: owner.id },
    { id: 'other-evidence', projectId: 'other-project', status: 'reviewed', createdBy: reviewer.id },
    { id: 'pending-evidence', projectId: 'project', status: 'submitted', createdBy: owner.id },
  ];
  state.lots = [{ id: 'lot', projectId: 'project', status: 'reviewed', units: 100, createdBy: owner.id }];
  state.charters = [{
    id: 'charter', version: 1, stewardshipBps: 2000, treasuryBps: 1000,
    shares: state.members.map((member, i) => ({ id: member.id, name: member.name, shareBps: [4000, 3500, 2500][i] })),
  }];
  let sequence = 0;
  const f = {
    get state() { return state; },
    run(op, payload = {}, user = owner) {
      const id = `command-${++sequence}`;
      state = applyCommand(state, user, { op, payload }, 1000 + sequence, id);
      return id;
    },
    reject(op, payload, pattern, user = owner) {
      const before = structuredClone(state);
      assert.throws(() => f.run(op, payload, user), pattern);
      assert.deepEqual(state, before, 'denied command leaves all records and audit unchanged');
    },
  };
  f.settlementId = f.run('record_settlement', { lotId: 'lot', units: 80, cents: 200000, reference: 'settlement', evidenceId: 'evidence' });
  f.run('review_settlement', { id: f.settlementId, decision: 'approve' }, reviewer);
  f.allocationId = f.run('create_allocation', { settlementId: f.settlementId, charterId: 'charter' });
  if (approved) f.run('approve_allocation', { id: f.allocationId }, reviewer);
  f.disbursement = (overrides = {}) => ({
    id: f.allocationId, budget: 'stewardship', cents: 10000,
    recipientLabel: 'Fictional conservation partner', purpose: 'Completed habitat work',
    reference: 'stewardship-receipt', evidenceId: 'evidence', ...overrides,
  });
  return f;
}

await test('all allocation buckets reconcile only independently reviewed external receipts', () => {
  const f = fixture();
  const allocation = () => f.state.allocations[0];
  for (const member of allocation().amounts.members) {
    const paymentId = f.run('record_payment', { id: f.allocationId, memberId: member.id, reference: `payment-${member.id}`, evidenceId: 'evidence' });
    f.run('review_payment', { id: f.allocationId, paymentId, decision: 'approve' }, reviewer);
  }
  const stewardship = f.run('record_disbursement', f.disbursement({ cents: 40000 }));
  const treasury = f.run('record_disbursement', f.disbursement({ budget: 'treasury', cents: 20000, reference: 'treasury-receipt', purpose: 'Transfer to co-op reserve' }));
  const pending = allocationReconciliation(allocation());
  assert.deepEqual(pending.total, { allocatedCents: 200000, reviewedReceiptCents: 140000, pendingReceiptCents: 60000, remainingUnrecordedCents: 0 });
  assert.equal(pending.stewardship.reviewedReceiptCents, 0);
  for (const disbursementId of [stewardship, treasury])
    f.run('review_disbursement', { id: f.allocationId, disbursementId, decision: 'approve' }, reviewer);
  const reconciled = allocationReconciliation(allocation());
  assert.deepEqual(reconciled.total, { allocatedCents: 200000, reviewedReceiptCents: 200000, pendingReceiptCents: 0, remainingUnrecordedCents: 0 });
  assert.equal(reconciled.stewardship.reviewedReceiptCents, 40000);
  assert.equal(reconciled.treasury.reviewedReceiptCents, 20000);
  assert.equal(reconciled.memberPool.reviewedReceiptCents, 140000);
  assert.equal(f.state.audit.at(-1).action, 'review_disbursement');
});

await test('partial receipts reserve only their bucket, rejected receipts release capacity without losing history', () => {
  const f = fixture();
  const first = f.run('record_disbursement', f.disbursement({ cents: 15000 }));
  f.run('record_disbursement', f.disbursement({ cents: 25000, reference: 'second' }));
  f.reject('record_disbursement', f.disbursement({ cents: 1, reference: 'excess' }), /exceeds/);
  f.run('record_disbursement', f.disbursement({ budget: 'treasury', cents: 20000, reference: 'treasury' }));
  f.run('review_disbursement', { id: f.allocationId, disbursementId: first, decision: 'reject' }, reviewer);
  assert.deepEqual(allocationReconciliation(f.state.allocations[0]).stewardship, {
    allocatedCents: 40000, reviewedReceiptCents: 0, pendingReceiptCents: 25000, remainingUnrecordedCents: 15000,
  });
  f.reject('record_disbursement', f.disbursement({ cents: 15000 }), /reference is already/);
  f.run('record_disbursement', f.disbursement({ cents: 15000, reference: 'replacement' }));
  assert.equal(f.state.allocations[0].disbursements.length, 4);
  assert.equal(f.state.allocations[0].disbursements[0].status, 'rejected');
  f.reject('record_disbursement', f.disbursement({ budget: 'treasury', cents: 1, reference: 'over-treasury' }), /exceeds/);
});

await test('disbursements require approved allocation, valid amounts, complete references and steward authority', () => {
  const draft = fixture({ approved: false });
  draft.reject('record_disbursement', draft.disbursement(), /Approve the allocation/);
  const f = fixture();
  f.reject('record_disbursement', f.disbursement(), (error) => error.status === 403, participant);
  for (const cents of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER, '100'])
    f.reject('record_disbursement', f.disbursement({ cents }), /positive|whole number/);
  for (const overrides of [{ budget: 'members' }, { recipientLabel: '' }, { purpose: '' }, { reference: '' }])
    f.reject('record_disbursement', f.disbursement(overrides), /Unsupported option|Enter text/);
  f.state.allocations[0].amounts.stewardshipCents = 0;
  f.reject('record_disbursement', f.disbursement({ cents: 1 }), /exceeds/);
});

await test('independent receipt review cannot be self-approved, repeated, or performed by a member', () => {
  const f = fixture();
  const disbursementId = f.run('record_disbursement', f.disbursement());
  const payload = { id: f.allocationId, disbursementId, decision: 'approve' };
  f.reject('review_disbursement', payload, (error) => error.status === 403 && /Another steward/.test(error.message));
  f.reject('review_disbursement', payload, (error) => error.status === 403, participant);
  f.reject('review_disbursement', { ...payload, decision: 'maybe' }, /Unsupported option/, reviewer);
  f.run('review_disbursement', payload, reviewer);
  f.reject('review_disbursement', payload, /already been reviewed/, reviewer);
  const receipt = f.state.allocations[0].disbursements[0];
  assert.equal(receipt.reviewedBy, reviewer.id);
  assert.ok(receipt.reviewedAt > receipt.createdAt);
});

await test('payment references are unique across member and budget receipts in every allocation, including rejected history', () => {
  const f = fixture();
  const paymentPayload = { id: f.allocationId, memberId: 'owner-member', reference: 'shared-reference', evidenceId: 'evidence' };
  f.run('record_payment', paymentPayload);
  f.reject('record_disbursement', f.disbursement({ reference: 'shared-reference' }), /reference is already/);
  const id = f.run('record_disbursement', f.disbursement());
  f.reject('record_payment', { ...paymentPayload, memberId: 'reviewer-member', reference: 'stewardship-receipt' }, /reference is already/);
  f.run('review_disbursement', { id: f.allocationId, disbursementId: id, decision: 'reject' }, reviewer);
  f.reject('record_payment', { ...paymentPayload, memberId: 'reviewer-member', reference: 'stewardship-receipt' }, /reference is already/);
  const settlementId = f.run('record_settlement', { lotId: 'lot', units: 10, cents: 10000, reference: 'second-settlement', evidenceId: 'evidence' });
  f.run('review_settlement', { id: settlementId, decision: 'approve' }, reviewer);
  const allocationId = f.run('create_allocation', { settlementId, charterId: 'charter' });
  f.run('approve_allocation', { id: allocationId }, reviewer);
  f.reject('record_disbursement', f.disbursement({ id: allocationId, cents: 100, reference: 'shared-reference' }), /reference is already/);
  f.reject('record_payment', { ...paymentPayload, id: allocationId, reference: 'stewardship-receipt' }, /reference is already/);
});

await test('member, budget and retirement receipts require independently reviewed evidence from the originating project', () => {
  const f = fixture();
  const actions = [
    ['record_payment', { id: f.allocationId, memberId: 'owner-member', reference: 'member-receipt' }],
    ['record_disbursement', f.disbursement()],
    ['record_retirement', { settlementId: f.settlementId, units: 10, beneficiary: 'Fictional buyer', reference: 'registry-reference' }],
  ];
  for (const [op, payload] of actions) {
    f.reject(op, { ...payload, evidenceId: 'other-evidence' }, /belong to this project/);
    f.reject(op, { ...payload, evidenceId: 'pending-evidence' }, /independently reviewed evidence/);
    f.reject(op, { ...payload, evidenceId: 'unknown-evidence' }, /Record not found/);
  }
  for (const [op, payload] of actions) f.run(op, { ...payload, evidenceId: 'evidence' });
});

await test('legacy allocations without disbursements retain exact totals and accept the new receipt form', () => {
  const f = fixture();
  delete f.state.allocations[0].disbursements;
  const before = structuredClone(f.state.allocations[0]);
  const reconciliation = allocationReconciliation(f.state.allocations[0]);
  assert.deepEqual(f.state.allocations[0], before, 'projection does not migrate or mutate legacy records');
  assert.deepEqual(reconciliation.total, { allocatedCents: 200000, reviewedReceiptCents: 0, pendingReceiptCents: 0, remainingUnrecordedCents: 200000 });
  f.run('record_disbursement', f.disbursement({ cents: 1 }));
  assert.deepEqual(f.state.allocations[0].amounts, before.amounts);
  assert.equal(allocationReconciliation(f.state.allocations[0]).stewardship.remainingUnrecordedCents, 39999);
});

await test('deleted receipt authors or supporting evidence erase private disbursement fields while retaining reconciliation', () => {
  for (const cause of ['author', 'evidence']) {
    const f = fixture();
    // Preserve the source ledger; only this receipt or its evidence is affected.
    f.state.evidence.push({ id: 'participant-evidence', projectId: 'project', status: 'reviewed', createdBy: participant.id });
    const receiptId = f.run('record_disbursement', f.disbursement({ recipientLabel: 'PRIVATE recipient', purpose: 'PRIVATE purpose', reference: 'PRIVATE reference', evidenceId: cause === 'evidence' ? 'participant-evidence' : 'evidence' }));
    const receipt = f.state.allocations[0].disbursements[0];
    if (cause === 'author') receipt.createdBy = participant.id;
    f.run('review_disbursement', { id: f.allocationId, disbursementId: receiptId, decision: 'approve' }, reviewer);
    const original = allocationReconciliation(f.state.allocations[0]);
    const erased = eraseWorkspaceState(f.state, participant.id, 2000).state;
    const redacted = erased.allocations[0].disbursements[0];
    assert.doesNotMatch(JSON.stringify(erased), /PRIVATE/);
    assert.equal(redacted.budget, 'stewardship');
    assert.equal(redacted.cents, 10000);
    assert.equal(redacted.status, 'reviewed');
    assert.equal(redacted.evidenceId, null);
    assert.equal(redacted.erasureRedacted, true);
    assert.deepEqual(allocationReconciliation(erased.allocations[0]), original);
    assert.equal(erased.financialRecordsRedactedAt, 2000);
    for (const op of ['record_disbursement', 'review_disbursement'])
      assert.throws(() => applyCommand(erased, owner, { op }), (error) => error.status === 409 && /paused/.test(error.message));
  }
});

await test('server review flags reflect independent stewardship and fail closed for unavailable financial recording', () => {
  const f = fixture({ approved: false });
  f.state.parcels.push({ id: 'parcel', createdBy: owner.id });
  f.state.observations.push({ id: 'observation', parcelId: 'parcel', createdBy: owner.id, status: 'submitted' });
  f.state.analysisResults.push({ id: 'analysis', parcelId: 'parcel', createdBy: owner.id, status: 'submitted' });
  f.state.lots[0].status = 'submitted';
  f.state.settlements[0].status = 'submitted';
  f.state.retirements.push({ id: 'retirement', createdBy: owner.id, status: 'submitted' });
  f.state.allocations[0].payments.push({ id: 'payment', createdBy: owner.id, status: 'submitted', memberId: 'owner-member', cents: 100 });
  f.state.allocations[0].disbursements.push({ id: 'disbursement', createdBy: owner.id, status: 'submitted', budget: 'stewardship', cents: 100 });
  const financeFlags = (state) => [state.lots[0], state.settlements[0], state.retirements[0], state.allocations[0], state.allocations[0].payments[0], state.allocations[0].disbursements[0]].map((record) => record.canReview);
  const original = structuredClone(f.state);
  const eligible = memberView(f.state, reviewer.id).state;
  assert.deepEqual(financeFlags(eligible), Array(6).fill(true));
  assert.equal(eligible.observations[0].canReview, true);
  assert.equal(eligible.analysisResults[0].canReview, true);
  assert.deepEqual(financeFlags(memberView(f.state, owner.id).state), Array(6).fill(false));
  assert.deepEqual(financeFlags(memberView(f.state, participant.id).state), Array(6).fill(false));
  assert.deepEqual(f.state, original, 'projection flags are not persisted');
  f.state.financialRecordsRedactedAt = 2000;
  const pausedFinance = memberView(f.state, reviewer.id).state;
  assert.deepEqual(financeFlags(pausedFinance), Array(6).fill(false));
  assert.equal(pausedFinance.observations[0].canReview, true);
  for (const unavailable of ['archived', 'capacity']) {
    if (unavailable === 'archived') f.state.visibility = 'archived';
    else { f.state.visibility = 'private'; f.state.audit = Array.from({ length: 4500 }, (_, sequence) => ({ sequence })); }
    const paused = memberView(f.state, reviewer.id).state;
    assert.equal(paused.observations[0].canReview, false);
    assert.equal(paused.analysisResults[0].canReview, false);
    assert.deepEqual(financeFlags(paused), Array(6).fill(false));
  }
});

await test('completed or authorless records never advertise review availability', () => {
  const f = fixture();
  const projected = memberView(f.state, reviewer.id).state;
  assert.equal(projected.lots[0].canReview, false);
  assert.equal(projected.settlements[0].canReview, false);
  assert.equal(projected.allocations[0].canReview, false);
  f.state.retirements.push({ id: 'legacy', status: 'submitted' });
  assert.equal(memberView(f.state, reviewer.id).state.retirements[0].canReview, false);
});
