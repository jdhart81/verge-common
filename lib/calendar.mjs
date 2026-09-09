const escapeText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
const stamp = (value) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
function fold(line) {
  const result = [];
  let chunk = '';
  for (const character of line) {
    if (new TextEncoder().encode(chunk + character).length > 73) {
      result.push(chunk);
      chunk = '';
    }
    chunk += character;
  }
  result.push(chunk);
  return result.join('\r\n ');
}
export function eventCalendar(event) {
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Verge Common//Community Events//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${String(event.id).replace(/[^a-zA-Z0-9-]/g, '')}@verge-common`,
      `DTSTAMP:${stamp(event.createdAt ?? event.startsAt)}`,
      `DTSTART:${stamp(event.startsAt)}`,
      `DTEND:${stamp(event.endsAt)}`,
      `SUMMARY:${escapeText(event.title)}`,
      `DESCRIPTION:${escapeText(event.summary)}`,
      `LOCATION:${escapeText(event.meetingDetails)}`,
      `STATUS:${event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      'CLASS:PRIVATE',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .map(fold)
      .join('\r\n') + '\r\n'
  );
}
