// Operational records, not ecological certification or anonymous visitor tracking.
import { communityContentIssue } from './content-safety.mjs';
const text = (v, max, fail) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max)
    fail(`Enter text between 1 and ${max} characters.`);
  return v.trim();
};
const date = (v, fail) => {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    fail('Choose a valid due date.');
  return v;
};
export function applyParticipation(
  s,
  user,
  op,
  p,
  now,
  id,
  { fail, find, requireSteward, membership },
) {
  const member = membership(s, user.id);
  if (op === 'classify_participant') {
    requireSteward(s, user.id);
    const target = find(s.members, p.id);
    if (!['unclassified', 'participant', 'test'].includes(p.cohort))
      fail('Choose a participation classification.');
    target.participationCohort = p.cohort;
    return true;
  }
  const organizer = (e) => {
    if (e.createdBy !== user.id) requireSteward(s, user.id);
  };
  if (op === 'complete_event') {
    const e = find(s.events ?? [], p.id);
    organizer(e);
    if (e.status !== 'scheduled' || e.hidden || e.endsAt > now)
      fail('Complete a visible event after it has ended.');
    if (
      !Array.isArray(p.attendeeIds) ||
      p.attendeeIds.length > 500 ||
      new Set(p.attendeeIds).size !== p.attendeeIds.length
    )
      fail('Choose the members who actually attended.');
    const attendees = p.attendeeIds.map((mid) => find(s.members, mid));
    if (attendees.some((m) => m.status !== 'active'))
      fail('Choose active members.');
    e.status = 'completed';
    e.completedAt = now;
    e.result = {
      summary: text(p.summary, 2000, fail),
      attendeeIds: attendees.map((m) => m.id),
      createdBy: user.id,
      createdAt: now,
      status: 'submitted',
      published: false,
    };
    e.calendarSequence = (e.calendarSequence ?? 0) + 1;
    return true;
  }
  if (op === 'review_event_result') {
    requireSteward(s, user.id);
    const e = find(s.events ?? [], p.id),
      r = e.result;
    if (!r || r.status !== 'submitted')
      fail('Choose a result awaiting review.');
    if (r.createdBy === user.id)
      fail('Another steward must review this activity result.', 403);
    if (!['approve', 'reject'].includes(p.decision))
      fail('Choose approve or reject.');
    r.status = p.decision === 'approve' ? 'reviewed' : 'rejected';
    r.reviewedBy = user.id;
    r.reviewedAt = now;
    r.reviewNote = text(p.note, 1000, fail);
    return true;
  }
  if (op === 'publish_event_result' || op === 'revoke_event_result') {
    requireSteward(s, user.id);
    const e = find(s.events ?? [], p.id);
    if (!e.result) fail('Record the completed activity first.');
    if (op === 'publish_event_result') {
      if (
        e.result.status !== 'reviewed' ||
        e.visibility !== 'public' ||
        e.hidden ||
        s.visibility !== 'public' ||
        find(s.projects, e.projectId).visibility !== 'public'
      )
        fail(
          'Publication requires a reviewed result and a public activity, project and co-op.',
        );
      const issue = communityContentIssue('complete_event', e.result);
      if (issue) fail(issue);
      if (p.confirm !== true) fail('Preview and confirm publication.');
    }
    e.result.published = op === 'publish_event_result';
    return true;
  }
  if (op === 'create_care_action') {
    requireSteward(s, user.id);
    if (find(s.projects, p.projectId).status === 'cancelled')
      fail('Choose a current project.');
    if (p.parcelId) {
      const parcel = find(s.parcels, p.parcelId);
      if (parcel.projectId !== p.projectId || parcel.status === 'withdrawn')
        fail('Choose a current parcel in this project.');
    }
    const responsible = find(s.members, p.memberId);
    if (responsible.status !== 'active')
      fail('Choose an active responsible member.');
    if (
      !Number.isInteger(p.repeatDays) ||
      p.repeatDays < 0 ||
      p.repeatDays > 366
    )
      fail('Repeat every 0 to 366 days.');
    s.careActions ??= [];
    if (s.careActions.length >= 500) fail('Care action limit reached.');
    s.careActions.push({
      id,
      projectId: p.projectId,
      parcelId: p.parcelId || '',
      title: text(p.title, 200, fail),
      instructions: text(p.instructions, 2000, fail),
      due: date(p.due, fail),
      repeatDays: p.repeatDays,
      memberId: responsible.id,
      status: 'open',
      kind: p.kind === 'disturbance' ? 'disturbance' : 'care',
      createdBy: user.id,
      createdAt: now,
      history: [],
    });
    return true;
  }
  if (op === 'submit_care_action') {
    const a = find(s.careActions ?? [], p.id);
    if (a.memberId !== member.id) requireSteward(s, user.id);
    if (a.status !== 'open') fail('Choose an open care action.');
    const evidence = find(s.evidence, p.evidenceId);
    if (evidence.projectId !== a.projectId || evidence.status === 'rejected')
      fail('Choose evidence from this project.');
    a.submission = {
      summary: text(p.summary, 2000, fail),
      evidenceId: evidence.id,
      createdBy: user.id,
      at: now,
    };
    a.status = 'submitted';
    return true;
  }
  if (op === 'review_care_action') {
    requireSteward(s, user.id);
    const a = find(s.careActions ?? [], p.id);
    if (a.status !== 'submitted' || !a.submission)
      fail('Choose care work awaiting review.');
    if (a.submission.createdBy === user.id)
      fail('Another steward must review the completed care work.', 403);
    if (!['approve', 'reject'].includes(p.decision))
      fail('Choose approve or reject.');
    if (
      p.decision === 'approve' &&
      find(s.evidence, a.submission.evidenceId).status !== 'reviewed'
    )
      fail('Review the supporting evidence independently first.');
    if (a.history.length >= 100)
      fail('Care history limit reached. Create a successor action.');
    a.history.push({
      ...a.submission,
      due: a.due,
      reviewedBy: user.id,
      reviewedAt: now,
      decision: p.decision,
      note: text(p.note, 1000, fail),
    });
    if (p.decision === 'approve') {
      a.status = a.repeatDays ? 'open' : 'closed';
      if (a.repeatDays)
        a.due = new Date(
          Math.max(Date.parse(a.due), Math.floor(now / 86400000) * 86400000) +
            a.repeatDays * 86400000,
        )
          .toISOString()
          .slice(0, 10);
    } else a.status = 'open';
    delete a.submission;
    return true;
  }
  if (op === 'withdraw_care_action') {
    requireSteward(s, user.id);
    const a = find(s.careActions ?? [], p.id);
    a.status = 'withdrawn';
    a.withdrawalReason = text(p.reason, 500, fail);
    a.withdrawnAt = now;
    return true;
  }
  return false;
}

export function publicResult(e, members) {
  const r = e.result;
  return e.status === 'completed' &&
    r?.published &&
    r.status === 'reviewed' &&
    !communityContentIssue('complete_event', r)
    ? {
        summary: r.summary,
        completedAt: e.completedAt,
        attendeeCount: r.attendeeIds.filter((id) =>
          members.some((m) => m.id === id && m.status === 'active'),
        ).length,
        review: 'Independently reviewed community record',
      }
    : null;
}

export function participationReport(s, now = Date.now()) {
  // Founder activity is separated; absent visitor/referral measurements are unavailable.
  const candidates = s.members.filter(
    (m) => m.userId !== s.ownerId && !String(m.userId).startsWith('erased-'),
  );
  const participants = candidates.filter(
    (m) => m.participationCohort === 'participant',
  );
  const actions = new Set([
    'post_update',
    'post_comment',
    'submit_evidence',
    'record_observation',
    'submit_care_action',
  ]);
  const contribution = (m) =>
    [
      ...s.audit.filter((a) => a.actorId === m.userId && actions.has(a.action)),
      ...(s.tasks ?? [])
        .filter((t) => t.assignee === m.userId && t.status === 'completed')
        .map((t) => ({ at: t.completedAt })),
      ...(s.events ?? [])
        .filter(
          (e) =>
            e.status === 'completed' && e.result?.attendeeIds.includes(m.id),
        )
        .map((e) => ({ at: e.endsAt })),
    ]
      .filter((a) => Number.isFinite(a.at) && a.at >= m.joinedAt)
      .sort((a, b) => a.at - b.at);
  const contributed = participants.filter((m) => contribution(m).length);
  return {
    unclassified: candidates.filter(
      (m) => !m.participationCohort || m.participationCohort === 'unclassified',
    ).length,
    requested: participants.length,
    approved: participants.filter((m) => m.status === 'active').length,
    contributed: contributed.length,
    returnedLaterWeek: contributed.filter((m) => {
      const records = contribution(m);
      return records.some((a) => a.at >= records[0].at + 7 * 86400000);
    }).length,
    confirmedAttendance: new Set(
      (s.events ?? [])
        .flatMap((e) => e.result?.attendeeIds ?? [])
        .filter((id) => participants.some((m) => m.id === id)),
    ).size,
    completedActivities: (s.events ?? []).filter(
      (e) =>
        e.status === 'completed' &&
        e.result?.attendeeIds.some((id) =>
          participants.some((m) => m.id === id),
        ),
    ).length,
    referredContributors: contributed.filter((m) =>
      participants.some((other) => other.id === m.referralId),
    ).length,
    visitorCount: null,
    externalReferralCount: null,
    measuredAt: now,
  };
}

export function participationNotices(s, userId, now = Date.now()) {
  const m = s.members.find((m) => m.userId === userId);
  if (
    !m ||
    !['active', 'pending'].includes(m.status) ||
    s.visibility === 'archived'
  )
    return [];
  if (m.status === 'pending') return [];
  const blocks = (other) =>
    (s.blocks ?? []).some(
      (b) =>
        (b.userId === userId && b.blockedUserId === other) ||
        (b.userId === other && b.blockedUserId === userId),
    );
  const notices = [
    {
      id: `approved:${m.id}`,
      at: m.approvedAt ?? m.joinedAt,
      kind: 'approval',
      text: 'Your membership is active.',
    },
  ];
  if (m.role === 'steward')
    for (const pending of s.members.filter((m) => m.status === 'pending'))
      notices.push({
        id: `request:${pending.id}`,
        at: pending.joinedAt,
        kind: 'approval',
        text: 'A membership request is waiting for review.',
      });
  for (const c of s.comments ?? []) {
    const u = s.updates.find((u) => u.id === c.updateId);
    if (
      !c.hidden &&
      u &&
      !u.hidden &&
      u.createdBy === userId &&
      c.createdBy !== userId &&
      !blocks(c.createdBy)
    )
      notices.push({
        id: `reply:${c.id}`,
        at: c.createdAt,
        kind: 'reply',
        text: 'A member replied to your discussion.',
      });
  }
  for (const e of s.events ?? [])
    if (
      !e.hidden &&
      !blocks(e.createdBy) &&
      e.rsvps?.some((r) => r.userId === userId && r.response !== 'not_going')
    ) {
      const changedAt = Math.max(
        e.updatedAt ?? 0,
        e.cancelledAt ?? 0,
        e.completedAt ?? 0,
      );
      if (changedAt)
        notices.push({
          id: `event:${e.id}:${e.calendarSequence}`,
          at: changedAt,
          kind: 'event',
          text:
            e.status === 'cancelled'
              ? 'An activity you responded to was cancelled.'
              : 'An activity you responded to has an update.',
        });
      if (
        e.status === 'scheduled' &&
        e.startsAt >= now &&
        e.startsAt <= now + 86400000
      )
        notices.push({
          id: `soon:${e.id}:${e.startsAt}`,
          at: Math.max(
            e.startsAt - 86400000,
            e.rsvps.find((r) => r.userId === userId)?.at ?? 0,
          ),
          kind: 'event',
          text: 'An activity you responded to starts within a day.',
        });
    }
  for (const a of s.careActions ?? [])
    if (a.memberId === m.id && a.status === 'open' && Date.parse(a.due) <= now)
      notices.push({
        id: `due:${a.id}:${a.due}`,
        at: Math.max(Date.parse(a.due), a.createdAt ?? 0),
        kind: 'care',
        text: 'A care action assigned to you is due.',
      });
  return notices.sort((a, b) => b.at - a.at).slice(0, 30);
}
