/**
 * Invite card for a public co-op: a "Join our co-op" link plus "Start your own".
 *
 * Built only from the public co-op projection (publicWorkspace), and only from its
 * id, name, region and summary, so a card never carries more than the public page
 * already shows. A steward or member pastes it into their own site or a town post.
 */
const SUMMARY_LIMIT = 200;

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );

const oneLine = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

function shorten(value, limit) {
  const text = oneLine(value);
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

function siteOrigin(origin) {
  const url = new URL(origin);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    throw new Error('Invite cards need an https site address.');
  return url.origin;
}

export function coopInviteCard(coop, origin) {
  if (!coop?.id) throw new Error('Choose a public co-op first.');
  const base = siteOrigin(origin);
  const name = shorten(coop.name, 120) || 'Our co-op';
  const region = shorten(coop.region, 80);
  const summary = shorten(coop.summary, SUMMARY_LIMIT);
  const joinUrl = `${base}/network/?coop=${encodeURIComponent(coop.id)}`;
  const startUrl = `${base}/`;
  const where = region ? ` in ${region}` : '';
  const text = [
    `${name} is a neighborhood conservation co-op${where} on VergeCommon.`,
    summary,
    `Join us: ${joinUrl}`,
    `Want one for your own neighborhood? Start your own co-op: ${startUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
  const e = escapeHtml;
  const html =
    `<div style="max-width:420px;border:1px solid #cbd5cc;border-radius:12px;padding:16px;font:15px/1.45 system-ui,sans-serif;color:#183b2c;background:#fff">` +
    `<strong style="font-size:17px">${e(name)}</strong>` +
    (region ? `<div style="color:#4b6355">${e(region)}</div>` : '') +
    (summary ? `<p style="margin:8px 0">${e(summary)}</p>` : '') +
    `<a href="${e(joinUrl)}" style="display:inline-block;margin:4px 8px 4px 0;padding:8px 14px;border-radius:8px;background:#1f5f3b;color:#fff;text-decoration:none">Join our co-op</a>` +
    `<a href="${e(startUrl)}" style="color:#1f5f3b">Start your own co-op</a>` +
    `<div style="margin-top:8px;font-size:12px;color:#4b6355">Open source conservation co-ops on VergeCommon</div>` +
    `</div>`;
  return { text, html, joinUrl, startUrl };
}
