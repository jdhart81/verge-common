import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contentSafetyIssue,
  communityContentIssue,
} from '../lib/content-safety.mjs';
import {
  newWorkspace,
  applyCommand,
  publicWorkspace,
  memberView,
} from '../lib/network.mjs';

const owner = { id: 'owner' };
const now = 1_800_000_000_000;
const workspace = () =>
  newWorkspace(
    {
      name: 'Willow neighbors',
      region: 'Local watershed',
      summary: 'Conservation together',
      displayName: 'River neighbor',
    },
    owner,
    now,
    'workspace',
  );

await test('baseline rejects direct threats, personal attacks and explicit solicitation through Unicode and spacing variants', () => {
  for (const text of [
    'I will kill you.',
    'I WILL KILL YOU',
    'Ｉ ｗｉｌｌ ｋｉｌｌ ｙｏｕ',
    'I will k\u200bi\u200bl\u200bl you',
    'i.will.k.i.l.l.you',
    'i w i l l k i l l y o u',
    "I'm going to murder your family",
    'Go kill yourself',
    'You are subhuman',
    "You're a fucking idiot",
    'Buy my nudes',
    'DM me for my nudes',
    'porn subscriptions',
  ])
    assert.ok(contentSafetyIssue(text), text);
});

await test('ecology vocabulary, ordinary discussion and quoted abuse in reports remain usable', () => {
  for (const text of [
    'Study sexual reproduction in native plants.',
    'Measure diameter at breast-height.',
    'We will kill the invasive knotweed.',
    'I will kill your invasive plants with your consent.',
    'I will shoot you a message about the nursery.',
    'Bird sex ratios and breeding habitat',
    'Tree mortality increased during drought.',
    'Our worthless first experiment taught us what to change.',
  ])
    assert.equal(contentSafetyIssue(text), null, text);
  assert.equal(
    communityContentIssue('report_content', {
      reason: 'The post said “I will kill you”.',
    }),
    null,
  );
  assert.equal(
    communityContentIssue('resolve_report', {
      note: 'Removed “buy my nudes”.',
    }),
    null,
  );
});

await test('shared command path enforces social text safety before persistence, while reports can quote abuse', () => {
  assert.throws(
    () =>
      newWorkspace(
        {
          name: 'I will kill you',
          region: 'Region',
          summary: 'Summary',
          displayName: 'Name',
        },
        owner,
        now,
        'id',
      ),
    (e) => e.status === 400 && /Remove threats/.test(e.message),
  );
  const s = workspace();
  s.projects.push({
    id: 'project',
    name: 'Willows',
    summary: 'Habitat',
    kind: 'ecohedge',
    status: 'active',
    visibility: 'public',
    createdBy: owner.id,
  });
  s.updates.push({
    id: 'legacy-post',
    projectId: 'project',
    createdBy: 'member',
    text: 'I will kill you',
    visibility: 'public',
    hidden: false,
  });
  for (const [op, payload] of [
    ['post_update', { text: 'I will kill you' }],
    ['post_comment', { text: 'Buy my nudes' }],
    ['create_event', { title: 'I will kill you' }],
    ['update_coop', { summary: 'I will kill you' }],
    ['create_project', { name: 'I will kill you' }],
    ['update_organization', { services: 'Buy my nudes' }],
    ['accept_invitation', { name: 'I will kill you' }],
    ['request_membership', { name: 'I will kill you' }],
  ])
    assert.throws(
      () => applyCommand(s, owner, { op, payload }),
      (e) => e.status === 400 && /Remove/.test(e.message),
      op,
    );
  const reported = applyCommand(s, owner, {
    op: 'report_content',
    payload: {
      kind: 'update',
      targetId: 'legacy-post',
      reason: 'It says “I will kill you”.',
    },
  });
  assert.equal(reported.reports[0].reason, 'It says “I will kill you”.');
  assert.equal(s.reports.length, 0);
});

await test('public projections hide legacy abusive social content without exposing private identity fields', () => {
  const s = workspace();
  s.projects.push({
    id: 'project',
    name: 'Willows',
    summary: 'Habitat',
    kind: 'ecohedge',
    status: 'active',
    visibility: 'public',
  });
  s.updates.push({
    id: 'bad',
    projectId: 'project',
    createdBy: 'PRIVATE-user',
    text: 'I will kill you',
    visibility: 'public',
    hidden: false,
  });
  s.updates.push({
    id: 'good',
    projectId: 'project',
    createdBy: 'PRIVATE-user',
    text: 'Breast-height measurements are ready',
    visibility: 'public',
    hidden: false,
  });
  s.events.push({
    id: 'bad-event',
    projectId: 'project',
    createdBy: 'PRIVATE-user',
    title: 'Buy my nudes',
    summary: 'Unwanted promotion',
    meetingDetails: 'PRIVATE-address',
    visibility: 'public',
    hidden: false,
  });
  const view = publicWorkspace(s);
  assert.deepEqual(
    view.updates.map((p) => p.id),
    ['good'],
  );
  assert.equal(view.events.length, 0);
  assert.doesNotMatch(JSON.stringify(view), /PRIVATE/);
  s.name = 'I will kill you';
  s.region = 'PRIVATE legacy location';
  const moderated = publicWorkspace(s);
  assert.equal(moderated.name, 'Community co-op');
  assert.equal(moderated.region, '');
  assert.equal(moderated.summary, 'This co-op profile is awaiting moderation.');
  assert.doesNotMatch(JSON.stringify(moderated), /I will kill you|PRIVATE/);
});

await test('cancellation reasons keep author attribution internally without exposing that identity to members', () => {
  const s = workspace();
  s.events.push({
    id: 'event',
    createdBy: 'neighbor',
    status: 'scheduled',
    rsvps: [],
  });
  const next = applyCommand(s, owner, {
    op: 'cancel_event',
    payload: { id: 'event', reason: 'Storm warning' },
  });
  assert.equal(next.events[0].cancelledBy, owner.id);
  const view = memberView(next, owner.id);
  assert.equal(view.state.events[0].cancelledBy, undefined);
});
