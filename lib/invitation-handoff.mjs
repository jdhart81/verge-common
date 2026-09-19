// A private invitation stays in the URL fragment or this tab's session storage.
// Never put its bearer secret in an auth URL, cookie, or return-path query.
export const invitationSignInPath = '/signin-with-chatgpt?return_to=%2Fjoin%2F';
export const invitationStorageKey = 'vergecommon.pending-invitation.v1';
export const invitationLifetime = 24 * 60 * 60 * 1000;
const invitationPattern = /^[0-9a-f-]{36}\.[0-9a-f-]{72}$/;

export function validInvitation(value) {
  return typeof value === 'string' && invitationPattern.test(value)
    ? value
    : '';
}

export function clearInvitation(storage) {
  try {
    storage?.removeItem(invitationStorageKey);
  } catch {
    // Storage can be denied by a browser's privacy settings.
  }
}

export function rememberInvitation(storage, invitation, now = Date.now()) {
  if (!validInvitation(invitation) || !storage) return false;
  try {
    if (pendingInvitation(storage, now) === invitation) return true;
    storage.setItem(
      invitationStorageKey,
      JSON.stringify({ invitation, savedAt: now }),
    );
    return true;
  } catch {
    return false;
  }
}

export function pendingInvitation(storage, now = Date.now()) {
  try {
    const saved = JSON.parse(storage?.getItem(invitationStorageKey) ?? 'null');
    return saved &&
      Number.isFinite(saved.savedAt) &&
      saved.savedAt <= now &&
      now - saved.savedAt < invitationLifetime
      ? validInvitation(saved.invitation)
      : '';
  } catch {
    return '';
  }
}

export function invitationForJoin(hash, storage, now = Date.now()) {
  // A new or malformed fragment must never silently select an older invitation.
  return hash
    ? validInvitation(hash.slice(1))
    : pendingInvitation(storage, now);
}
