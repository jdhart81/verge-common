import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  newWorkspace,
  applyCommand,
  memberView,
  publicWorkspace,
} from '../lib/network.mjs';
import {
  partnerParticipationStatus,
  partnerParticipationView,
} from '../lib/partner-participation.mjs';
import { eraseWorkspaceState } from '../self-hosted/erasure.mjs';
import { pendingWork } from '../lib/pending-work.mjs';

const now = Date.now();
function fixture() {
  const owner = { id: randomUUID() },
    reviewer = { id: randomUUID() },
    rep = { id: randomUUID() },
    neighbor = { id: randomUUID() };
  let state = newWorkspace(
    {
      name: 'Synthetic partner co-op',
      region: 'Test',
      summary: 'Synthetic conservation',
      displayName: 'Organizer',
    },
    owner,
    now,
    randomUUID(),
  );
  for (const [user, role] of [
    [reviewer, 'steward'],
    [rep, 'member'],
    [neighbor, 'member'],
  ])
    state.members.push({
      id: randomUUID(),
      userId: user.id,
      name: role === 'steward' ? 'Reviewer' : 'Test member',
      role,
      status: 'active',
      joinedAt: now,
    });
  const projectId = randomUUID(),
    evidenceId = randomUUID(),
    partnerId = randomUUID();
  state.projects.push({
    id: projectId,
    name: 'Meadow',
    status: 'active',
    visibility: 'members',
  });
  state.evidence.push({
    id: evidenceId,
    projectId,
    status: 'reviewed',
    title: 'Private partner agreement',
    createdBy: owner.id,
  });
  state.partnerships.push({
    id: partnerId,
    projectId,
    name: 'Example conservation group',
    website: 'https://example.org',
    role: 'Field review and mentoring',
    evidenceId,
    agreementReference: 'Private contract reference',
    createdBy: owner.id,
    status: 'reviewed',
  });
  const call = (user, op, payload, time = now) =>
    (state = applyCommand(state, user, { op, payload }, time, randomUUID()));
  const memberId = state.members.find((m) => m.userId === rep.id).id;
  const invite = () => {
    call(owner, 'invite_partner_representative', { id: partnerId, memberId });
    return state.partnerships[0].participation.at(-1).id;
  };
  const accept = (invitationId) =>
    call(rep, 'respond_partner_invitation', {
      id: partnerId,
      invitationId,
      decision: 'accept',
      roleTitle: 'Program coordinator',
      authorityReference: 'Board authorization, synthetic fixture',
    });
  return {
    owner,
    reviewer,
    rep,
    neighbor,
    memberId,
    projectId,
    partnerId,
    call,
    invite,
    accept,
    get state() {
      return state;
    },
  };
}
await test('named representative accepts a frozen role and a second steward reviews their own authority evidence', () => {
  const f = fixture(),
    invitationId = f.invite();
  f.accept(invitationId);
  const proofId = randomUUID();
  f.state.evidence.push({
    id: proofId,
    projectId: f.projectId,
    title: 'Authority letter',
    status: 'reviewed',
    createdBy: f.rep.id,
  });
  f.call(f.reviewer, 'review_partner_representative', {
    id: f.partnerId,
    invitationId,
    decision: 'approve',
    evidenceId: proofId,
    note: 'Independent co-op review of the supplied authorization.',
  });
  assert.equal(
    partnerParticipationStatus(f.state, f.state.partnerships[0], now),
    'reviewed',
  );
  assert.equal(f.state.partnerships[0].status, 'reviewed');
  assert.equal(f.state.members.find((m) => m.id === f.memberId).role, 'member');
  assert.equal(f.state.organization, null);
});
await test('self-invitation, wrong recipient and self review are denied without mutating state', () => {
  const f = fixture();
  assert.throws(
    () =>
      f.call(f.owner, 'invite_partner_representative', {
        id: f.partnerId,
        memberId: f.state.members[0].id,
      }),
    /another active/,
  );
  const invitationId = f.invite();
  assert.throws(
    () =>
      f.call(f.neighbor, 'respond_partner_invitation', {
        id: f.partnerId,
        invitationId,
        decision: 'accept',
      }),
    /invited member/,
  );
  f.accept(invitationId);
  for (const user of [f.owner, f.rep])
    assert.throws(
      () =>
        f.call(user, 'review_partner_representative', {
          id: f.partnerId,
          invitationId,
          decision: 'approve',
        }),
      /different steward/,
    );
  assert.equal(f.state.partnerships[0].participation[0].status, 'accepted');
});
await test('expired, changed, superseded and closed invitations cannot be accepted', () => {
  const f = fixture(),
    invitationId = f.invite();
  assert.throws(
    () =>
      f.call(
        f.rep,
        'respond_partner_invitation',
        { id: f.partnerId, invitationId, decision: 'decline' },
        now + 8 * 86400000,
      ),
    /expired/,
  );
  f.state.partnerships[0].role = 'Changed responsibility';
  assert.throws(() => f.accept(invitationId), /partnership changed/);
  f.call(f.owner, 'end_partner_participation', {
    id: f.partnerId,
    invitationId,
    reason: 'Replaced role needs a fresh invitation.',
  });
  const next = f.invite();
  assert.notEqual(next, invitationId);
  assert.throws(() => f.accept(invitationId), /invitation changed/);
  f.call(f.rep, 'respond_partner_invitation', {
    id: f.partnerId,
    invitationId: next,
    decision: 'decline',
  });
  assert.equal(
    partnerParticipationStatus(f.state, f.state.partnerships[0], now),
    'declined',
  );
});
await test('only the representative own reviewed project evidence can qualify the co-op review', () => {
  const f = fixture(),
    invitationId = f.invite();
  f.accept(invitationId);
  const base = {
    id: f.partnerId,
    invitationId,
    decision: 'approve',
    note: 'Review with a real independent authority reference.',
  };
  for (const evidenceId of [f.state.evidence[0].id, 'missing'])
    assert.throws(
      () =>
        f.call(f.reviewer, 'review_partner_representative', {
          ...base,
          evidenceId,
        }),
      /reviewed authority evidence/,
    );
  f.call(f.reviewer, 'review_partner_representative', {
    ...base,
    decision: 'reject',
  });
  assert.equal(
    partnerParticipationStatus(f.state, f.state.partnerships[0], now),
    'rejected',
  );
});
await test('private representative projection does not leak agreement references, other representatives or user IDs', () => {
  const f = fixture(),
    invitationId = f.invite();
  f.accept(invitationId);
  const projected = memberView(f.state, f.rep.id).state.partnerships[0];
  assert.equal(projected.representative.isRepresentative, true);
  assert.equal(projected.agreementReference, undefined);
  assert.equal(projected.evidenceId, undefined);
  assert.equal(projected.participation, undefined);
  assert.ok(!JSON.stringify(projected).includes(f.owner.id));
  assert.deepEqual(memberView(f.state, f.neighbor.id).state.partnerships, []);
  assert.equal(
    partnerParticipationView(f.state, f.state.partnerships[0], 'outsider'),
    null,
  );
  assert.equal(publicWorkspace(f.state).partnerships, undefined);
});
await test('participation notices are targeted to the invited person and independent reviewer', () => {
  const f = fixture(),
    invitationId = f.invite();
  assert.ok(
    pendingWork(memberView(f.state, f.rep.id).state, { now }).some(
      (n) => n.id === 'partner-invitations',
    ),
  );
  assert.ok(
    !pendingWork(memberView(f.state, f.neighbor.id).state, { now }).some(
      (n) => n.id === 'partner-invitations',
    ),
  );
  f.accept(invitationId);
  assert.ok(
    pendingWork(memberView(f.state, f.reviewer.id).state, {
      now,
      steward: true,
    }).some((n) => n.id === 'partner-authority'),
  );
  assert.ok(
    !pendingWork(memberView(f.state, f.owner.id).state, {
      now,
      steward: true,
    }).some((n) => n.id === 'partner-authority'),
  );
});
await test('withdrawal, loss of membership and loss of supporting evidence cannot appear currently reviewed', () => {
  const f = fixture(),
    invitationId = f.invite();
  f.accept(invitationId);
  const proof = {
    id: randomUUID(),
    projectId: f.projectId,
    title: 'Proof',
    createdBy: f.rep.id,
    status: 'reviewed',
  };
  f.state.evidence.push(proof);
  f.call(f.reviewer, 'review_partner_representative', {
    id: f.partnerId,
    invitationId,
    decision: 'approve',
    evidenceId: proof.id,
    note: 'Reviewed supplied authority evidence.',
  });
  f.state.evidence.pop();
  assert.equal(
    partnerParticipationStatus(f.state, f.state.partnerships[0], now),
    'evidence_needed',
  );
  f.state.members.find((m) => m.id === f.memberId).status = 'removed';
  assert.equal(
    partnerParticipationStatus(f.state, f.state.partnerships[0], now),
    'member_inactive',
  );
  f.call(f.reviewer, 'end_partner_participation', {
    id: f.partnerId,
    invitationId,
    reason: 'Representative access ended.',
  });
  assert.equal(
    partnerParticipationStatus(f.state, f.state.partnerships[0], now),
    'ended',
  );
});
await test('account erasure removes participation declarations and resets erased independent reviews', () => {
  const f = fixture(),
    invitationId = f.invite();
  f.accept(invitationId);
  const proof = {
    id: randomUUID(),
    projectId: f.projectId,
    title: 'Authority',
    createdBy: f.rep.id,
    status: 'reviewed',
  };
  f.state.evidence.push(proof);
  f.call(f.reviewer, 'review_partner_representative', {
    id: f.partnerId,
    invitationId,
    decision: 'approve',
    evidenceId: proof.id,
    note: 'Private reviewer note for synthetic authority.',
  });
  const erasedRep = eraseWorkspaceState(f.state, f.rep.id, now + 1).state;
  assert.equal(erasedRep.partnerships[0].participation.length, 0);
  assert.ok(!JSON.stringify(erasedRep).includes('Program coordinator'));
  const erasedReviewer = eraseWorkspaceState(
    f.state,
    f.reviewer.id,
    now + 1,
  ).state;
  assert.equal(
    erasedReviewer.partnerships[0].participation[0].status,
    'accepted',
  );
  assert.ok(!JSON.stringify(erasedReviewer).includes('Private reviewer note'));
});
