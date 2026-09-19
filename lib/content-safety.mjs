// A narrow English-language baseline, not comprehensive moderation. Reports
// deliberately bypass this filter so a member can quote what happened.
export function normalizeCommunityText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\p{M}\p{Cf}]/gu, '')
    .replace(/[’‘`]/gu, "'")
    .toLowerCase()
    .replace(/[\p{Pd}_]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function contentSafetyIssue(value) {
  const text = normalizeCommunityText(value);
  // Compact matching catches punctuation or letter spacing inside these exact
  // abusive phrases without banning ecology vocabulary or the word “kill”.
  const compact = text.replace(/[^\p{L}\p{N}]/gu, '');
  const threatText = text.replace(
    /\bshoot you (?:a|an) (?:message|email|note|text)\b/gu,
    'send a message',
  );
  const threatCompact = threatText.replace(/[^\p{L}\p{N}]/gu, '');
  const threat =
    /\b(?:i|we)\s+(?:will|shall|am going to|are going to|am gonna|are gonna)\s+(?:kill|murder|shoot|stab|rape)\s+(?:you\b|your (?:family|children|kids)\b)/u.test(
      threatText,
    ) ||
    /(?:iwill|ishall|imgoingto|iamgoingto|imgonna|iamgonna|wewill|wearegoingto|weregoingto|weregonna)(?:kill|murder|shoot|stab|rape)(?:you(?!r)|yourfamily|yourchildren|yourkids)/u.test(
      threatCompact,
    );
  const harassment =
    /\b(?:go\s+)?kill yourself\b|\b(?:i hope|we hope|you should)\s+(?:you\s+)?(?:die|commit suicide)\b|\b(?:you are|you're|youre|ur)\s+(?:a\s+)?(?:worthless|subhuman|fucking idiot|piece of shit)\b/u.test(
      text,
    ) ||
    /(?:gokillyourself|youshouldkillyourself|ihopeyoudie)/u.test(compact) ||
    /(?:youare|youre)(?:worthless|subhuman|afuckingidiot|apieceofshit)/u.test(
      compact,
    );
  if (threat || harassment)
    return 'Remove threats or personal attacks before posting. To report abuse, use Report on the content instead.';
  const sexualPromotion =
    /\b(?:buy|sell|selling|purchase)\s+(?:my\s+)?(?:nudes|nude photos|porn|pornography|sex videos)\b|\b(?:nudes|nude photos|porn|pornography|sex videos)\s+(?:for sale|subscriptions?|on sale)\b|\b(?:subscribe|pay|dm me)\s+(?:to|for)\s+(?:my\s+)?(?:nudes|porn|pornography|sex videos)\b/u.test(
      text,
    ) ||
    /(?:buymynudes|sellingnudes|nudeforsale|nudesforsale|subscribetomyporn|payformynudes|dmmeformynudes)/u.test(
      compact,
    );
  if (sexualPromotion)
    return 'Remove explicit sexual promotion before posting. Keep shared content focused on the conservation community.';
  return null;
}

export const containsUnsafeCommunityText = (value) =>
  contentSafetyIssue(value) !== null;

// Only social content fields are inspected. Evidence, private documents,
// moderation reasons and legal references are intentionally not keyword-scanned.
const fieldsByOperation = {
  create_workspace: ['name', 'region', 'summary', 'displayName', 'country'],
  request_membership: ['name'],
  accept_invitation: ['name'],
  post_update: ['text'],
  post_comment: ['text'],
  create_event: ['title', 'summary', 'meetingDetails'],
  cancel_event: ['reason'],
  update_coop: ['name', 'region', 'summary'],
  create_project: ['name', 'summary', 'region'],
  update_project: ['name', 'summary', 'region'],
  update_organization: ['name', 'region', 'services'],
  create_task: ['title'],
};
export function communityContentIssue(operation, payload = {}) {
  for (const field of fieldsByOperation[operation] ?? []) {
    const issue = contentSafetyIssue(payload[field]);
    if (issue) return issue;
  }
  return null;
}
