import test from 'node:test';
import assert from 'node:assert/strict';
import { observationDateMetadata, localObservationDate } from '../lib/observation-date.mjs';

await test('calendar date remains correct east and west of UTC and around daylight saving', () => {
  for (const [observedDate, observedTimeZone, instant] of [
    ['2026-09-20', 'Pacific/Auckland', '2026-09-19T12:00:00Z'],
    ['2026-09-19', 'America/New_York', '2026-09-19T04:00:00Z'],
    ['2026-11-01', 'America/New_York', '2026-11-01T04:00:00Z'],
    ['2026-03-08', 'America/New_York', '2026-03-08T05:00:00Z'],
  ]) assert.deepEqual(observationDateMetadata({ observedDate, observedTimeZone, observedAt: Date.parse(instant) }), { observedDate, observedTimeZone });
});
await test('invalid dates, partial metadata and inconsistent zones cannot silently change the observation date', () => {
  assert.deepEqual(observationDateMetadata({ observedAt: 1 }), {});
  assert.throws(() => observationDateMetadata({ observedDate: '2026-02-30', observedTimeZone: 'UTC', observedAt: Date.parse('2026-03-02') }), /does not match/);
  assert.throws(() => observationDateMetadata({ observedDate: '2026-09-19' }), /valid/);
  assert.throws(() => observationDateMetadata({ observedDate: '2026-09-19', observedTimeZone: 'Unknown/Unknown', observedAt: Date.now() }), /valid/);
  assert.throws(() => localObservationDate('not-a-date'), /valid/);
});
