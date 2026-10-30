// Called only from server components and the hosting gateway. Never serialize env.
export const updatesVariables = [
  'RESEND_API_KEY',
  'VERGE_UPDATES_SIGNING_SECRET',
  'VERGE_UPDATES_SEGMENT_ID',
  'VERGE_UPDATES_FROM',
  'VERGE_UPDATES_REPLY_TO',
  'VERGE_UPDATES_POSTAL_ADDRESS',
];
export function updatesEnabled(env = process.env) {
  return (
    env.VERGE_UPDATES_ENABLED === '1' &&
    updatesVariables.every(
      (key) => typeof env[key] === 'string' && env[key].trim(),
    ) &&
    Buffer.byteLength(env.VERGE_UPDATES_SIGNING_SECRET ?? '') >= 32
  );
}
export function normalizeEmail(value) {
  if (
    typeof value !== 'string' ||
    Array.from(value).some(
      (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    )
  )
    return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)
    ? email
    : null;
}
export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
