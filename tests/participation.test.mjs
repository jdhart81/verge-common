import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newWorkspace,
  applyCommand,
  memberView,
  publicWorkspace,
} from '../lib/network.mjs';
import { publicActivity } from '../lib/activity.mjs';
import {
  participationReport,
  participationNotices,
} from '../lib/participation.mjs';
import { eraseWorkspaceState } from '../self-hosted/erasure.mjs';
function fixture() {
  const owner = { id: 'owner' },
    peer = { id: 'peer' },
    member = { id: 'member' },
    outsider = { id: 'outsider' };
  let s = newWorkspace(
    {
      name: 'Test conservation',
      region: 'General area',
      summary: 'Synthetic only',
      displayName: 'Founder',
    },
    owner,
    1,
    'coop',
  );
  s.visibility = 'public';
  s.members.push(
    {
      id: 'peer-member',
      userId: peer.id,
      name: 'Second steward',
      role: 'steward',
      status: 'active',
      joinedAt: 1,
    },
    {
      id: 'member-member',
      userId: member.id,
      name: 'Participant',
      role: 'member',
      status: 'active',
      joinedAt: 1,
    },
  );
  s.projects.push({
    id: 'project',
    name: 'Habitat care',
    summary: 'Care for habitat',
    visibility: 'public',
    status: 'active',
  });
  s.events.push({
    id: 'event',
    projectId: 'project',
    title: 'Habitat day',
    summary: 'Public purpose',
    meetingDetails: 'PRIVATE LOCATION',
    visibility: 'public',
    status: 'scheduled',
    endsAt: 100,
    startsAt: 50,
    rsvps: [{ userId: member.id, response: 'going' }],
    createdBy: owner.id,
    createdAt: 1,
    hidden: false,
  });
  s.evidence.push({
    id: 'evidence',
    projectId: 'project',
    status: 'reviewed',
    createdBy: owner.id,
    notes: 'PRIVATE EVIDENCE',
  });
  let n = 0;
  const run = (op, payload, user = owner, now = 1000) =>
    (s = applyCommand(s, user, { op, payload }, now, `command-${++n}`));
  return {
    owner,
    peer,
    member,
    outsider,
    run,
    get s() {
      return s;
    },
  };
}
await test('completed activity requires authorization, actual roster, independent review and explicit public consent', () => {
  const f = fixture(),
    result = {
      id: 'event',
      summary: 'Restored planting beds',
      attendeeIds: ['member-member'],
    };
  assert.throws(() => f.run('complete_event', result, f.outsider));
  assert.throws(() => f.run('complete_event', result, f.member));
  assert.throws(() => f.run('complete_event', result, f.owner, 99));
  assert.throws(() =>
    f.run('complete_event', { ...result, attendeeIds: ['unknown'] }),
  );
  f.run('complete_event', result);
  assert.equal(publicWorkspace(f.s).events[0].result, undefined);
  assert.throws(() =>
    f.run('review_event_result', {
      id: 'event',
      decision: 'approve',
      note: 'Checked',
    }),
  );
  f.run(
    'review_event_result',
    { id: 'event', decision: 'approve', note: 'Checked independently' },
    f.peer,
  );
  assert.throws(() => f.run('publish_event_result', { id: 'event' }));
  f.run('publish_event_result', { id: 'event', confirm: true });
  const a = publicActivity(f.s, 'event', 'event');
  assert.equal(a.record.result.attendeeCount, 1);
  assert.doesNotMatch(
    JSON.stringify(a),
    /PRIVATE|member-member|Participant|reviewedBy|createdBy/,
  );
  assert.deepEqual(
    memberView(f.s, f.member.id).state.events[0].result.attendeeIds,
    [],
  );
  f.run('revoke_event_result', { id: 'event' });
  assert.equal(publicWorkspace(f.s).events[0].result, undefined);
  f.s.events[0].hidden = true;
  assert.equal(publicActivity(f.s, 'event', 'event'), null);
  f.s.events[0].hidden = false;
  f.s.visibility = 'private';
  assert.equal(publicActivity(f.s, 'event', 'event'), null);
});
await test('care uses reviewed evidence, independent closure, recurrence, private assignment and immutable history', () => {
  const f = fixture();
  const payload = {
    projectId: 'project',
    title: 'Check habitat',
    instructions: 'Inspect after disturbance',
    due: '1970-01-01',
    repeatDays: 7,
    memberId: 'member-member',
    kind: 'disturbance',
  };
  assert.throws(() => f.run('create_care_action', payload, f.member));
  assert.throws(() =>
    f.run('create_care_action', { ...payload, due: '2026-02-30' }),
  );
  f.run('create_care_action', payload);
  const id = f.s.careActions[0].id;
  assert.equal(memberView(f.s, f.peer.id).state.careActions.length, 1);
  assert.equal(publicWorkspace(f.s).careActions, undefined);
  f.run(
    'submit_care_action',
    { id, summary: 'Inspected planting beds', evidenceId: 'evidence' },
    f.member,
  );
  f.s.evidence[0].status = 'submitted';
  assert.throws(() =>
    f.run('review_care_action', { id, decision: 'approve', note: 'Checked' }),
  );
  f.s.evidence[0].status = 'reviewed';
  f.run(
    'review_care_action',
    { id, decision: 'approve', note: 'Confirmed against evidence' },
    f.peer,
  );
  assert.equal(f.s.careActions[0].status, 'open');
  assert.equal(f.s.careActions[0].due, '1970-01-08');
  assert.equal(f.s.careActions[0].history.length, 1);
  assert.equal(f.s.careActions[0].submission, undefined);
  const erased = eraseWorkspaceState(f.s, f.member.id, 2000).state;
  assert.equal(erased.careActions.length, 0);
});
await test('classification excludes founder and test activity; attendance and later-week contribution are distinct', () => {
  const f = fixture();
  f.run(
    'post_update',
    { projectId: 'project', text: 'First contribution', visibility: 'members' },
    f.member,
    1000,
  );
  assert.equal(participationReport(f.s).contributed, 0);
  f.run('classify_participant', { id: 'member-member', cohort: 'participant' });
  f.run(
    'post_update',
    { projectId: 'project', text: 'Later contribution', visibility: 'members' },
    f.member,
    1000 + 7 * 86400000,
  );
  assert.equal(participationReport(f.s).contributed, 1);
  assert.equal(participationReport(f.s).returnedLaterWeek, 1);
  assert.equal(participationReport(f.s).visitorCount, null);
  f.run('classify_participant', { id: 'member-member', cohort: 'test' });
  assert.equal(participationReport(f.s).contributed, 0);
  assert.equal(participationReport(f.s).confirmedAttendance, 0);
});
await test('notices respect membership and blocked replies; erasure withdraws public work and attendance identities', () => {
  const f = fixture();
  f.run('post_update', {
    projectId: 'project',
    text: 'A discussion',
    visibility: 'members',
  });
  f.run(
    'post_comment',
    { updateId: f.s.updates[0].id, text: 'A reply' },
    f.member,
  );
  assert.equal(
    participationNotices(f.s, f.owner.id).filter((n) => n.kind === 'reply')
      .length,
    1,
  );
  f.s.blocks.push({ userId: f.owner.id, blockedUserId: f.member.id });
  assert.equal(
    participationNotices(f.s, f.owner.id).filter((n) => n.kind === 'reply')
      .length,
    0,
  );
  f.run('complete_event', {
    id: 'event',
    summary: 'Completed work',
    attendeeIds: ['member-member'],
  });
  f.run(
    'review_event_result',
    { id: 'event', decision: 'approve', note: 'Reviewed' },
    f.peer,
  );
  f.run('publish_event_result', { id: 'event', confirm: true });
  const erasedReviewer = eraseWorkspaceState(f.s, f.peer.id, 2000).state;
  assert.equal(erasedReviewer.events[0].result, undefined);
  const erasedAttendee = eraseWorkspaceState(f.s, f.member.id, 2000).state;
  assert.deepEqual(erasedAttendee.events[0].result.attendeeIds, []);
  f.s.members.find((m) => m.userId === f.member.id).status = 'removed';
  assert.deepEqual(participationNotices(f.s, f.member.id), []);
});

await test('shared-link contribution is attributed only to classified participants and erased with its source', () => {
  const f = fixture();
  const source = f.s.members.find(m => m.userId === f.peer.id);
  source.id = crypto.randomUUID(); source.participationCohort = 'participant';
  f.run('request_membership', { name: 'New participant', referral: source.id }, f.outsider);
  const target = f.s.members.find(m => m.userId === f.outsider.id);
  assert.equal(target.referralId, source.id);
  f.run('member_status', { id: target.id, status: 'active' });
  f.run('classify_participant', { id: target.id, cohort: 'participant' });
  assert.equal(participationReport(f.s).referredContributors, 0);
  f.run('post_update', { projectId: 'project', text: 'Useful field contribution', visibility: 'members' }, f.outsider, 1100);
  assert.equal(participationReport(f.s).referredContributors, 1);
  assert.doesNotMatch(JSON.stringify(publicWorkspace(f.s)), new RegExp(source.id));
  const erased = eraseWorkspaceState(f.s, f.peer.id, 2000).state;
  assert.equal(erased.members.find(m => m.userId === f.outsider.id).referralId, undefined);
  assert.equal(participationReport(erased).referredContributors, 0);
});
