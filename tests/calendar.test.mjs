import test from 'node:test';
import assert from 'node:assert/strict';
import { eventCalendar } from '../lib/calendar.mjs';
await test('calendar escapes injected lines and preserves worldwide UTC times and Unicode', () => {
  const event = {
    id: 'test',
    title: 'Planting\nBEGIN:VALARM',
    summary: '森林'.repeat(60),
    meetingDetails: 'Gate, field; next',
    startsAt: Date.UTC(2030, 0, 1, 10),
    endsAt: Date.UTC(2030, 0, 1, 11),
    status: 'cancelled',
  };
  const calendar = eventCalendar(event),
    unfolded = calendar.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:Planting\\nBEGIN:VALARM'));
  assert.ok(unfolded.includes('DTSTART:20300101T100000Z'));
  assert.ok(unfolded.includes('LOCATION:Gate\\, field\\; next'));
  assert.ok(unfolded.includes(event.summary));
  assert.ok(unfolded.includes('STATUS:CANCELLED'));
  for (const line of calendar.split('\r\n'))
    assert.ok(new TextEncoder().encode(line).length <= 75);
});

await test('calendar reschedule across New York autumn DST keeps absolute times, UID and sequence', () => {
  const base = {
    id: 'dst-synthetic',
    title: 'Synthetic repeat activity',
    summary: 'Synthetic only',
    meetingDetails: 'Private synthetic instructions',
    timeZone: 'America/New_York',
    startsAt: Date.parse('2026-11-01T01:30:00-04:00'),
    endsAt: Date.parse('2026-11-01T02:30:00-05:00'),
    status: 'scheduled',
    calendarSequence: 0,
  };
  const first = eventCalendar(base);
  assert.match(first, /DTSTART:20261101T053000Z/);
  assert.match(first, /DTEND:20261101T073000Z/);
  const changed = eventCalendar({
    ...base,
    startsAt: Date.parse('2026-11-01T01:30:00-05:00'),
    calendarSequence: 1,
    updatedAt: Date.parse('2026-10-31T12:00:00Z'),
  });
  assert.match(changed, /DTSTART:20261101T063000Z/);
  assert.equal(first.match(/UID:.+/)[0], changed.match(/UID:.+/)[0]);
  assert.match(changed, /SEQUENCE:1/);
  assert.match(
    eventCalendar({ ...base, status: 'cancelled', calendarSequence: 2 }),
    /STATUS:CANCELLED/,
  );
});
