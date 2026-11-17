// The reserve is finite: no record or audit entry is discarded to make room.
//
// Two budgets (tests in tests/workspace-capacity.test.mjs):
//   SC1 Everything except corridor records counts against the general budget, as before:
//       650 KB before growth pauses, 750 KB hard.
//   SC2 Corridor records (woodland layers, treatment plans and corridor uses, facts and bands)
//       are mostly map geometry and count against their own budget: 2 MB before growth
//       pauses, 2.5 MB hard. They no longer consume the general budget, and the general
//       records no longer consume theirs.
//   SC3 Either budget pausing pauses growth; either reaching its hard limit makes the co-op
//       full. Safety commands keep working in the reserve exactly as before.
//   SC4 A co-op without corridor records is measured exactly as it was.
export const WORKSPACE_CAPACITY = Object.freeze({
  growthAuditEntries: 4500,
  hardAuditEntries: 5000,
  growthBytes: 650000,
  hardBytes: 750000,
  corridorGrowthBytes: 2_000_000,
  corridorHardBytes: 2_500_000,
  warningFraction: 0.9,
});
const CORRIDOR_KEYS = ['woodlandLayers', 'treatmentPlans', 'corridorUses'];

const encoder = new TextEncoder();
const bytes = (value) => encoder.encode(JSON.stringify(value)).length;
const receiptFields = {
  requestHash: '0'.repeat(64),
  previousHash: '0'.repeat(64),
  stateHash: '0'.repeat(64),
  commitmentNonce: '0'.repeat(36),
  hash: '0'.repeat(64),
};

/** Bytes of the corridor records alone (SC2); 0 when the co-op has none (SC4). */
export function corridorBytes(state) {
  let size = 0;
  for (const key of CORRIDOR_KEYS)
    if (state[key]?.length) size += bytes(state[key]);
  return size;
}

/** General bytes: the whole record minus its corridor records (SC1). Include the receipt
 * which server/workspaces adds before persistence. */
export function workspaceBytes(state, { pendingReceipt = false } = {}) {
  let size = bytes(state) - corridorBytes(state);
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
  const corridor = corridorBytes(state);
  const limits = WORKSPACE_CAPACITY;
  const full =
    count >= limits.hardAuditEntries ||
    size >= limits.hardBytes ||
    corridor >= limits.corridorHardBytes;
  const growthPaused =
    full ||
    count >= limits.growthAuditEntries ||
    size >= limits.growthBytes ||
    corridor >= limits.corridorGrowthBytes;
  const near =
    count >= limits.growthAuditEntries * limits.warningFraction ||
    size >= limits.growthBytes * limits.warningFraction ||
    corridor >= limits.corridorGrowthBytes * limits.warningFraction;
  return {
    level: full
      ? 'full'
      : growthPaused
        ? 'safety_only'
        : near
          ? 'near_limit'
          : 'normal',
    growthPaused,
    safetyReserveAvailable: !full,
  };
}

const safetyOperations = new Set([
  'block_member',
  'unblock_member',
  'report_content',
  'resolve_report',
  'remove_comment',
  'hide_update',
  'revoke_invitation',
  'revoke_partnership',
  'revoke_satellite_consent',
  'revoke_parcel_consent',
  'withdraw_parcel',
  'revoke_agreement',
  'leave',
  'archive',
  'cancel_event',
  'transfer_stewardship',
  'end_partner_participation',
  'revoke_event_result',
  'withdraw_care_action',
]);

/** Classification never grants permission: normal domain authorization still runs. */
export function isWorkspaceSafetyCommand(state, user, input) {
  const op = input.op;
  const p = input.payload ?? {};
  if (safetyOperations.has(op)) return true;
  if (op === 'member_status') return ['removed', 'rejected'].includes(p.status);
  if (op === 'member_role') return p.role === 'member';
  if (op === 'respond_partner_invitation') return p.decision === 'decline';
  if (op === 'project_status')
    return p.status === 'cancelled' && p.visibility === 'members';
  if (op === 'update_coop') {
    // Withdrawal cannot smuggle new profile text into the reserve or unarchive.
    return (
      state.visibility !== 'archived' &&
      p.visibility === 'private' &&
      p.name === state.name &&
      p.region === state.region &&
      p.summary === state.summary
    );
  }
  if (op === 'event_rsvp' && p.response === 'not_going') {
    return !!state.events
      ?.find((event) => event.id === p.id)
      ?.rsvps?.some((response) => response.userId === user.id);
  }
  return false;
}

/** Return an actionable error without exposing the size of private records. */
export function workspaceCapacityIssue(
  previous,
  next,
  user,
  input,
  { pendingReceipt = false } = {},
) {
  const limits = WORKSPACE_CAPACITY;
  const count = next.audit?.length ?? 0;
  const size = workspaceBytes(next, { pendingReceipt });
  const corridor = corridorBytes(next);
  if (
    count > limits.hardAuditEntries ||
    size > limits.hardBytes ||
    corridor > limits.corridorHardBytes
  ) {
    return 'This co-op has reached its safety storage limit. Existing records are preserved. Send a private operator report at /report/ for help; account deletion remains available in Your account.';
  }
  if (
    !isWorkspaceSafetyCommand(previous, user, input) &&
    (workspaceCapacity(previous).growthPaused ||
      count > limits.growthAuditEntries ||
      size > limits.growthBytes ||
      corridor > limits.corridorGrowthBytes)
  ) {
    return 'New co-op activity is paused to preserve room for safety changes. You can still use the remaining reserve to report, block, remove, revoke or archive. Contact the operator at /report/ to plan an archival migration.';
  }
  return null;
}
