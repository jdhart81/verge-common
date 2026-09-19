import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newWorkspace,
  applyCommand,
  memberView,
  publicWorkspace,
} from '../lib/network.mjs';
import { eventCalendar } from '../lib/calendar.mjs';
import { eraseWorkspaceState } from '../self-hosted/erasure.mjs';
const steward = { id: 'steward' },
  organizer = { id: 'organizer' },
  neighbor = { id: 'neighbor' };
function fixture() {
  let state = newWorkspace(
    {
      name: 'Test co-op',
      region: 'Synthetic',
      summary: 'Test only',
      displayName: 'Steward',
    },
    steward,
    1,
    'coop',
  );
  state.members.push(
    {
      id: 'organizer-member',
      userId: organizer.id,
      role: 'member',
      status: 'active',
      name: 'Organizer',
    },
    {
      id: 'neighbor-member',
      userId: neighbor.id,
      role: 'member',
      status: 'active',
      name: 'Neighbor',
    },
  );
  state.projects.push({
    id: 'project',
    status: 'active',
    visibility: 'public',
  });
  let next = 0;
  const f = {
    get state() {
      return state;
    },
    run(op, payload, actor = organizer, now = 1000) {
      state = applyCommand(
        state,
        actor,
        { op, payload },
        now,
        `command-${++next}`,
      );
    },
  };
  f.details = {
    projectId: 'project',
    title: 'Field day',
    summary: 'Synthetic event',
    meetingDetails: 'Private fixture instructions',
    startsAt: 86400000,
    endsAt: 90000000,
    timeZone: 'UTC',
    visibility: 'members',
    capacity: 3,
  };
  f.run('create_event', f.details, organizer, 10);
  f.id = state.events[0].id;
  f.edit = (payload = {}, actor = organizer, now = 2000) =>
    f.run('update_event', { ...f.details, id: f.id, ...payload }, actor, now);
  return f;
}

await test('event updates preserve organizer and responses while calendar UID stays stable and sequence advances', () => {
  const f = fixture();
  f.run('event_rsvp', { id: f.id, response: 'going' }, neighbor);
  const before = structuredClone(f.state.events[0]);
  const oldCalendar = eventCalendar(before);
  f.edit({ startsAt: 172800000, endsAt: 176400000, title: 'Moved field day' });
  const event = f.state.events[0];
  assert.equal(event.createdBy, organizer.id);
  assert.deepEqual(event.rsvps, before.rsvps);
  assert.equal(event.id, before.id);
  assert.equal(event.createdAt, before.createdAt);
  assert.equal(event.calendarSequence, 1);
  assert.equal(event.updatedBy, organizer.id);
  const calendar = eventCalendar(event);
  assert.equal(calendar.match(/UID:.+/)[0], oldCalendar.match(/UID:.+/)[0]);
  assert.match(calendar, /SEQUENCE:1\r\n/);
  assert.match(calendar, /LAST-MODIFIED:19700101T000002Z/);
  assert.match(calendar, /DTSTART:19700103T000000Z/);
  const view = memberView(f.state, neighbor.id).state.events[0];
  assert.equal(view.updatedBy, undefined);
  assert.equal(view.calendarSequence, 1);
  assert.equal(view.yourResponse, 'going');
  assert.equal(view.attendees.length, 0);
  f.run('cancel_event', { id: f.id, reason: 'Weather' }, steward, 3000);
  const cancellation = eventCalendar(f.state.events[0]);
  assert.match(cancellation, /SEQUENCE:2\r\n/);
  assert.match(cancellation, /STATUS:CANCELLED/);
  assert.equal(cancellation.match(/UID:.+/)[0], oldCalendar.match(/UID:.+/)[0]);
  assert.throws(() => f.edit(), /upcoming/);
  assert.throws(
    () => f.run('cancel_event', { id: f.id, reason: 'Again' }),
    /already cancelled/,
  );
});

await test('event edits enforce ownership, active membership, blocks, moderation and visibility', () => {
  const f = fixture();
  assert.throws(() => f.edit({}, neighbor), /steward/);
  assert.throws(() => f.edit({}, { id: 'outsider' }), /membership/);
  assert.throws(() => f.edit({ visibility: 'public' }), /steward/);
  f.edit({ visibility: 'public' }, steward);
  f.state.visibility = 'public';
  assert.equal(publicWorkspace(f.state).events[0].meetingDetails, undefined);
  assert.throws(() => f.edit({ title: 'I will kill you' }, steward), /threats/);
  f.run('block_member', { id: 'organizer-member' }, steward);
  assert.throws(() => f.edit({}, steward), /unavailable/);
  f.state.events[0].hidden = true;
  assert.throws(() => f.edit(), /upcoming/);
  f.state.events[0].hidden = false;
  f.state.members.find((m) => m.userId === organizer.id).status = 'removed';
  assert.throws(() => f.edit(), /membership/);
});

await test('rescheduling validates dates, zone and project and cannot evict existing going responses by lowering capacity', () => {
  const f = fixture();
  f.run('event_rsvp', { id: f.id, response: 'going' }, organizer);
  f.run('event_rsvp', { id: f.id, response: 'going' }, neighbor);
  for (const payload of [
    { startsAt: 1000 },
    { endsAt: f.details.startsAt },
    { endsAt: f.details.startsAt + 8 * 86400000 },
    { timeZone: 'Invalid/Zone' },
    { capacity: 1 },
    { projectId: 'another-project' },
  ])
    assert.throws(() => f.edit(payload));
  f.edit({ capacity: 2 });
  assert.equal(f.state.events[0].capacity, 2);
  f.edit({ capacity: 0 });
  assert.equal(f.state.events[0].rsvps.length, 2);
  f.state.members.find((m) => m.userId === neighbor.id).status = 'removed';
  f.edit({ capacity: 1 });
  assert.equal(f.state.events[0].capacity, 1);
  assert.throws(() => f.edit({}, organizer, f.details.startsAt), /upcoming/);
  f.state.projects[0].status = 'cancelled';
  assert.throws(() => f.edit(), /active project/);
});

await test('deleting an editing steward erases their replacement event text without restoring earlier content', () => {
  const f = fixture();
  f.edit(
    {
      title: 'PRIVATE edit',
      summary: 'PRIVATE summary',
      meetingDetails: 'PRIVATE location',
    },
    steward,
  );
  const { state } = eraseWorkspaceState(f.state, steward.id, 3000);
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE/);
  assert.equal(state.events[0].hidden, true);
  assert.equal(state.events[0].status, 'cancelled');
  assert.equal(state.events[0].calendarSequence, 2);
});
