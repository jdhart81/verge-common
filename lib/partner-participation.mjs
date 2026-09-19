// Participation confirms a named person's involvement in this co-op. It never
// grants an organization account, signs a contract or certifies legal authority.
export class PartnerParticipationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status) => {
  throw new PartnerParticipationError(message, status);
};
const active = (state, userId) =>
  state.members.find((m) => m.userId === userId && m.status === 'active');
const text = (value, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail(`Enter text between 1 and ${max} characters.`);
  return value.trim();
};
const snapshot = (partner) => ({
  projectId: partner.projectId,
  name: partner.name,
  website: partner.website,
  role: partner.role,
  evidenceId: partner.evidenceId,
});
const unchanged = (partner, invitation) =>
  JSON.stringify(snapshot(partner)) === JSON.stringify(invitation.snapshot);
const current = (partner) => (partner.participation ?? []).at(-1);

export function applyPartnerParticipation(
  state,
  userId,
  op,
  payload,
  now,
  requestId,
) {
  const member = active(state, userId);
  if (!member) fail('Active co-op membership is required.', 403);
  const steward = member.role === 'steward';
  const partner = (state.partnerships ?? []).find((p) => p.id === payload.id);
  if (!partner) fail('Partner record not found.', 404);
  if (op === 'invite_partner_representative') {
    if (!steward) fail('A co-op steward must invite the representative.', 403);
    if (partner.status !== 'reviewed')
      fail('Review the partnership agreement first.');
    const representative = state.members.find(
      (m) => m.id === payload.memberId && m.status === 'active',
    );
    if (
      !representative ||
      representative.userId === userId ||
      representative.userId === partner.createdBy
    )
      fail(
        'Choose another active member who represents the partner organization.',
      );
    if (
      (state.blocks ?? []).some(
        (b) =>
          (b.userId === userId && b.blockedUserId === representative.userId) ||
          (b.userId === representative.userId && b.blockedUserId === userId),
      )
    )
      fail('This invitation is unavailable for these accounts.', 403);
    const previous = current(partner);
    if (
      previous &&
      !['declined', 'ended', 'rejected'].includes(previous.status) &&
      !(previous.status === 'invited' && previous.expiresAt <= now)
    )
      fail('End the current participation invitation before replacing it.');
    partner.participation ??= [];
    if (partner.participation.length >= 20)
      fail(
        'This partnership needs operator archival before another invitation.',
      );
    partner.participation.push({
      id: requestId,
      memberId: representative.id,
      invitedBy: userId,
      createdAt: now,
      expiresAt: now + 7 * 86400000,
      status: 'invited',
      snapshot: snapshot(partner),
    });
    return;
  }
  const invitation = current(partner);
  if (!invitation || invitation.id !== payload.invitationId)
    fail('This invitation changed. Refresh before continuing.', 409);
  const representative = state.members.find(
    (m) => m.id === invitation.memberId && m.status === 'active',
  );
  const isRepresentative = representative?.userId === userId;
  if (op === 'end_partner_participation') {
    if (!steward && !isRepresentative)
      fail(
        'Only the representative or a steward can end this participation.',
        403,
      );
    if (['ended', 'declined', 'rejected'].includes(invitation.status))
      fail('This participation is already closed.');
    invitation.status = 'ended';
    invitation.endedBy = userId;
    invitation.endedAt = now;
    invitation.endReason = text(payload.reason, 1000);
    return;
  }
  if (partner.status !== 'reviewed' || !unchanged(partner, invitation))
    fail('The partnership changed. Ask a steward for a new invitation.', 409);
  if (!representative)
    fail('The designated representative is no longer an active member.', 403);
  if (op === 'respond_partner_invitation') {
    if (!isRepresentative) fail('Only the invited member can respond.', 403);
    if (invitation.status !== 'invited' || invitation.expiresAt <= now)
      fail('This invitation is unavailable or expired.', 409);
    if (!['accept', 'decline'].includes(payload.decision))
      fail('Choose accept or decline.');
    invitation.status = payload.decision === 'accept' ? 'accepted' : 'declined';
    invitation.respondedBy = userId;
    invitation.respondedAt = now;
    if (payload.decision === 'accept') {
      invitation.roleTitle = text(payload.roleTitle, 120);
      invitation.authorityReference = text(payload.authorityReference, 500);
    }
    return;
  }
  if (op === 'review_partner_representative') {
    if (!steward || isRepresentative || invitation.invitedBy === userId)
      fail('A different steward must review this representative.', 403);
    if (invitation.status !== 'accepted')
      fail('The representative must accept before review.');
    if (!['approve', 'reject'].includes(payload.decision))
      fail('Choose approve or reject.');
    if (payload.decision === 'approve') {
      const evidence = (state.evidence ?? []).find(
        (e) => e.id === payload.evidenceId,
      );
      if (
        !evidence ||
        evidence.projectId !== partner.projectId ||
        evidence.status !== 'reviewed' ||
        evidence.createdBy !== representative.userId
      )
        fail(
          'Choose reviewed authority evidence submitted by this representative for this project.',
        );
      invitation.authorityEvidenceId = evidence.id;
    }
    invitation.status =
      payload.decision === 'approve' ? 'reviewed' : 'rejected';
    invitation.reviewedBy = userId;
    invitation.reviewedAt = now;
    invitation.reviewNote = text(payload.note, 1000);
    return;
  }
  fail('Unknown participation action.');
}

export function partnerParticipationStatus(state, partner, now = Date.now()) {
  const invitation = current(partner);
  if (!invitation) return 'not_invited';
  if (['ended', 'declined', 'rejected'].includes(invitation.status))
    return invitation.status;
  if (partner.status !== 'reviewed' || !unchanged(partner, invitation))
    return 'needs_new_invitation';
  const representative = state.members.find(
    (m) => m.id === invitation.memberId && m.status === 'active',
  );
  if (!representative) return 'member_inactive';
  if (invitation.status === 'invited' && invitation.expiresAt <= now)
    return 'expired';
  if (
    invitation.status === 'reviewed' &&
    !(state.evidence ?? []).some(
      (e) =>
        e.id === invitation.authorityEvidenceId &&
        e.status === 'reviewed' &&
        e.projectId === partner.projectId &&
        e.createdBy === representative.userId,
    )
  )
    return 'evidence_needed';
  return invitation.status;
}

export function partnerParticipationView(
  state,
  partner,
  userId,
  now = Date.now(),
) {
  const viewer = active(state, userId),
    steward = viewer?.role === 'steward';
  if (!viewer) return null;
  const invitation = current(partner);
  if (!steward && invitation?.memberId !== viewer?.id) return null;
  const projected = invitation
    ? {
        id: invitation.id,
        memberId: invitation.memberId,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        status: invitation.status,
        roleTitle: invitation.roleTitle,
        authorityReference: invitation.authorityReference,
        authorityEvidenceId: invitation.authorityEvidenceId,
        reviewNote: invitation.reviewNote,
        endReason: invitation.endReason,
        isRepresentative: invitation.memberId === viewer?.id,
        canReview:
          steward &&
          invitation.memberId !== viewer?.id &&
          invitation.invitedBy !== userId,
      }
    : null;
  // Non-stewards see the offered public identity/role, not the private agreement,
  // another member's evidence metadata, account IDs or older representatives.
  const result = steward
    ? { ...partner }
    : {
        id: partner.id,
        projectId: partner.projectId,
        name: partner.name,
        website: partner.website,
        role: partner.role,
        status: partner.status,
      };
  delete result.participation;
  const representative = state.members.find(
    (m) => m.id === invitation?.memberId && m.status === 'active',
  );
  return {
    ...result,
    representative: projected,
    participationStatus: partnerParticipationStatus(state, partner, now),
    authorityEvidence:
      steward && representative
        ? (state.evidence ?? [])
            .filter(
              (e) =>
                e.projectId === partner.projectId &&
                e.createdBy === representative.userId &&
                e.status === 'reviewed',
            )
            .map((e) => ({ id: e.id, title: e.title }))
        : [],
    eligibleRepresentatives: steward
      ? state.members
          .filter(
            (m) =>
              m.status === 'active' &&
              m.userId !== userId &&
              m.userId !== partner.createdBy,
          )
          .map((m) => ({ id: m.id, name: m.name }))
      : [],
  };
}
