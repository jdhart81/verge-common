/** Preserve a field observation's calendar date across client time zones. */
export function observationDateMetadata(input) {
  if (input.observedDate === undefined && input.observedTimeZone === undefined) return {};
  if (typeof input.observedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.observedDate) ||
    typeof input.observedTimeZone !== 'string' || input.observedTimeZone.length > 100)
    throw new Error('Choose a valid observation date and time zone.');
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: input.observedTimeZone, calendar: 'gregory', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(input.observedAt));
  } catch { throw new Error('Choose a valid observation date and time zone.'); }
  const field = type => parts.find(part => part.type === type)?.value;
  if (`${field('year')}-${field('month')}-${field('day')}` !== input.observedDate)
    throw new Error('The observation date does not match its time zone.');
  return { observedDate: input.observedDate, observedTimeZone: input.observedTimeZone };
}

export function localObservationDate(value) {
  const observedAt = new Date(`${value}T00:00:00`).getTime();
  const observedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { observedAt, ...observationDateMetadata({ observedAt, observedDate: value, observedTimeZone }) };
}
