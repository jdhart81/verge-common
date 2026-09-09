import test from 'node:test';
import assert from 'node:assert/strict';
import { eventCalendar } from '../lib/calendar.mjs';
test('calendar escapes injected lines and preserves worldwide UTC times and Unicode', () => {
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
