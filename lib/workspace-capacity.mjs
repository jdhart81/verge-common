// The reserve is finite: no record or audit entry is discarded to make room.
export const WORKSPACE_CAPACITY = Object.freeze({
  growthAuditEntries: 4500,
  hardAuditEntries: 5000,
  growthBytes: 650000,
  hardBytes: 750000,
  warningFraction: 0.9,
});

const encoder = new TextEncoder();
const bytes = (value) => encoder.encode(JSON.stringify(value)).length;
const receiptFields = {
  requestHash: '0'.repeat(64),
  previousHash: '0'.repeat(64),
  stateHash: '0'.repeat(64),
  commitmentNonce: '0'.repeat(36),
  hash: '0'.repeat(64),
};

/** Include the receipt which server/workspaces adds before persistence. */
export function workspaceBytes(state, { pendingReceipt = false } = {}) {
  let size = bytes(state);
  const event = state.audit?.at(-1);
  if (pendingReceipt && event) {
    size += bytes({ ...event, ...receiptFields }) - bytes(event);
  }
  return size;
}

/** This projection intentionally exposes no counts from another member's data. */
export function workspaceCapacity(state) {
  const count = state.audit?.length ?? 0;
  const size = workspaceBytes(state);
  const limits = WORKSPACE_CAPACITY;
  const full = count >= limits.hardAuditEntries || size >= limits.hardBytes;
  const growthPaused = full || count >= limits.growthAuditEntries || size >= limits.growthBytes;
  const near = count >= limits.growthAuditEntries * limits.warningFraction || size >= limits.growthBytes * limits.warningFraction;
  return {
    level: full ? 'full' : growthPaused ? 'safety_only' : near ? 'near_limit' : 'normal',
    growthPaused,
    safetyReserveAvailable: !full,
  };
}

const safetyOperations = new Set([
  'block_member', 'unblock_member', 'report_content', 'resolve_report',
  'remove_comment', 'hide_update', 'revoke_invitation', 'revoke_partnership',
  'revoke_satellite_consent', 'revoke_parcel_consent', 'withdraw_parcel',
  'revoke_agreement', 'leave', 'archive', 'cancel_event', 'transfer_stewardship',
  'end_partner_participation',
]);

/** Classification never grants permission: normal domain authorization still runs. */
export function isWorkspaceSafetyCommand(state, user, input) {
  const op = input.op;
  const p = input.payload ?? {};
  if (safetyOperations.has(op)) return true;
  if (op === 'member_status') return ['removed', 'rejected'].includes(p.status);
  if (op === 'member_role') return p.role === 'member';
  if (op === 'respond_partner_invitation') return p.decision === 'decline';
  if (op === 'project_status') return p.status === 'cancelled' && p.visibility === 'members';
  if (op === 'update_coop') {
    // Withdrawal cannot smuggle new profile text into the reserve or unarchive.
    return state.visibility !== 'archived' && p.visibility === 'private' &&
      p.name === state.name && p.region === state.region && p.summary === state.summary;
  }
  if (op === 'event_rsvp' && p.response === 'not_going') {
    return !!state.events?.find((event) => event.id === p.id)?.rsvps
      ?.some((response) => response.userId === user.id);
  }
  return false;
}

/** Return an actionable error without exposing the size of private records. */
export function workspaceCapacityIssue(previous, next, user, input, { pendingReceipt = false } = {}) {
  const limits = WORKSPACE_CAPACITY;
  const count = next.audit?.length ?? 0;
  const size = workspaceBytes(next, { pendingReceipt });
  if (count > limits.hardAuditEntries || size > limits.hardBytes) {
    return 'This co-op has reached its safety storage limit. Existing records are preserved. Send a private operator report at /report/ for help; account deletion remains available in Your account.';
  }
  if (!isWorkspaceSafetyCommand(previous, user, input) &&
      (workspaceCapacity(previous).growthPaused || count > limits.growthAuditEntries || size > limits.growthBytes)) {
    return 'New co-op activity is paused to preserve room for safety changes. You can still use the remaining reserve to report, block, remove, revoke or archive. Contact the operator at /report/ to plan an archival migration.';
  }
  return null;
}
