import { getD1 } from '@/db/d1';
import { attachmentExistsGuard } from '@/server/evidence-uploads.mjs';
import { workspaceCapacityIssue } from '@/lib/workspace-capacity.mjs';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  applyCommand,
  DomainError,
  membership,
  memberView,
  newWorkspace,
  publicWorkspace,
} from '@/lib/network.mjs';
export type Row = {
  id: string;
  owner_id: string;
  state_json: string;
  version: number;
  visibility: string;
};
export async function identity() {
  const u = await getChatGPTUser();
  return u ? { id: u.userId } : null;
}
export async function authenticated() {
  const u = await identity();
  if (!u) throw new DomainError('Sign in to continue.', 401);
  return u;
}
export function guardOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin)
    throw new DomainError('A same-origin browser request is required.', 403);
}
/** Ordinary commands stay small. Only saving corridor layers may carry map geometry. */
export const COMMAND_BODY_BYTES = 100000;
export const LAYERS_BODY_BYTES = 900000;
export async function body(request: Request) {
  if (
    Number(request.headers.get('content-length') ?? 0) > LAYERS_BODY_BYTES
  )
    throw new DomainError('Request too large.', 413);
  const text = await request.text();
  if (text.length > LAYERS_BODY_BYTES)
    throw new DomainError('Request too large.', 413);
  let value;
  try {
    value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new DomainError('A JSON object is required.');
  } catch {
    throw new DomainError('Invalid JSON.');
  }
  if (text.length > COMMAND_BODY_BYTES && value.op !== 'save_woodland_layers')
    throw new DomainError('Request too large.', 413);
  return value;
}
export async function load(id: string) {
  const row = await getD1()
    .prepare(
      'SELECT id, owner_id, state_json, version, visibility FROM workspaces WHERE id = ?',
    )
    .bind(id)
    .first<Row>();
  if (!row) throw new DomainError('Co-op not found.', 404);
  return { row, state: JSON.parse(row.state_json) };
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'cache-control': 'private, no-store' },
  });
}
export function failure(error: unknown) {
  if (error instanceof DomainError)
    return json({ error: error.message }, error.status);
  console.error(
    'Workspace operation failed',
    error instanceof Error ? error.message : 'unknown error',
  );
  return json(
    { error: 'The operation could not be completed. Refresh and try again.' },
    500,
  );
}
async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
// Commands that only add the sender's own new record: an update, a comment, an RSVP, a report,
// a parcel of their own, a vote on a frozen proposal. A stale view cannot mislead them, so they
// are applied to the co-op as it stands instead of failing because a neighbour saved first.
//   CR1 Every other command still needs the version the sender saw: reviews, approvals, roles,
//       consent, layers, plans, money and anything that changes or judges an existing record.
//   CR2 The command is validated by the same rules against the latest state, so one that no
//       longer applies is refused with its own reason.
//   CR3 Retries are bounded, each save is still a compare-and-swap on the stored version, and
//       a request ID is still answered once: no update is lost or duplicated.
export const STALE_VIEW_SAFE_OPS = new Set([
  'post_update',
  'post_comment',
  'event_rsvp',
  'report_content',
  'record_parcel',
  'vote',
]);
const CONFLICT = 'Someone updated this co-op. Refresh before saving your change.';
//   CR4 Saves to one co-op run one after another in this process. Without the queue, members
//       saving at the same moment each read, apply and hash the whole record and all but one
//       lose the compare-and-swap and start again: measured, 30 simultaneous posts took 17 s.
//       The queue only orders work; the compare-and-swap below still decides what is stored,
//       so a second server process would stay correct, only slower.
const saving = new Map<string, Promise<unknown>>();
function inTurn<T>(id: string, work: () => Promise<T>): Promise<T> {
  const before = saving.get(id) ?? Promise.resolve();
  const mine = before.then(work, work);
  const settled = mine.then(
    () => undefined,
    () => undefined,
  );
  saving.set(id, settled);
  void settled.then(() => {
    if (saving.get(id) === settled) saving.delete(id);
  });
  return mine;
}
export function command(
  id: string,
  user: { id: string },
  input: { op: string; payload: Record<string, unknown>; requestId: string },
  expectedVersion: number,
  // Server-computed inputs only (never the request body); see applyCommand.
  context: { woodlandCheck?: unknown } = {},
) {
  return inTurn(id, () =>
    commandInTurn(id, user, input, expectedVersion, context),
  );
}
async function commandInTurn(
  id: string,
  user: { id: string },
  input: { op: string; payload: Record<string, unknown>; requestId: string },
  expectedVersion: number,
  context: { woodlandCheck?: unknown } = {},
) {
  if (!STALE_VIEW_SAFE_OPS.has(input.op))
    return commandOnce(id, user, input, expectedVersion, context);
  for (let attempt = 1; ; attempt++) {
    try {
      return await commandOnce(id, user, input, null, context);
    } catch (e) {
      // Another save landed between the read and the write: read again and reapply.
      if (
        attempt < 6 &&
        e instanceof DomainError &&
        e.message === CONFLICT
      )
        continue;
      throw e;
    }
  }
}
async function commandOnce(
  id: string,
  user: { id: string },
  input: { op: string; payload: Record<string, unknown>; requestId: string },
  // null: apply to the co-op as it stands (STALE_VIEW_SAFE_OPS only).
  expectedVersion: number | null,
  context: { woodlandCheck?: unknown } = {},
) {
  const { row, state } = await load(id);
  if (!/^[0-9a-f-]{36}$/.test(input.requestId ?? ''))
    throw new DomainError('A valid request ID is required.');
  const requestHash = await hash(
    JSON.stringify({ op: input.op, payload: input.payload }),
  );
  const previous = state.audit.find(
    (a: { id: string; actorId: string }) => a.id === input.requestId,
  );
  if (previous) {
    if (previous.actorId !== user.id || previous.requestHash !== requestHash)
      throw new DomainError('Request ID conflict.', 409);
    return { state, version: row.version };
  }
  if (expectedVersion !== null && expectedVersion !== row.version)
    throw new DomainError(CONFLICT, 409);
  const next = applyCommand(
    state,
    user,
    input,
    Date.now(),
    input.requestId,
    context,
  );
  const event = next.audit.at(-1)!;
  const { audit: _audit, ...data } = next;
  event.requestHash = requestHash;
  event.previousHash = state.audit.at(-1)?.hash ?? '';
  event.stateHash = await hash(JSON.stringify(data));
  // Keep a private salt in the persisted receipt so a member cannot enumerate
  // low-entropy private payloads (for example a block target) from its hash.
  event.commitmentNonce = crypto.randomUUID();
  event.hash = await hash(JSON.stringify(event));
  // Enforce the actual persisted size, including all receipt metadata. The
  // domain check reserves its upper bound, and this also protects future fields.
  const capacityIssue = workspaceCapacityIssue(state, next, user, input);
  if (capacityIssue) throw new DomainError(capacityIssue, 409);
  const attachedAsset =
    input.op === 'submit_evidence'
      ? ((input.payload.asset as { id?: string } | undefined)?.id ?? null)
      : null;
  const result = await getD1()
    .prepare(
      `UPDATE workspaces SET state_json = ?, owner_id = ?, name = ?, region = ?, summary = ?, visibility = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ? ${attachmentExistsGuard} RETURNING version`,
    )
    .bind(
      JSON.stringify(next),
      next.ownerId,
      next.name,
      next.region,
      next.summary,
      next.visibility,
      next.updatedAt,
      id,
      row.version,
      attachedAsset,
      attachedAsset,
      user.id,
    )
    .first<{ version: number }>();
  if (!result) throw new DomainError(CONFLICT, 409);
  return { state: next, version: result.version };
}
export { membership, memberView, newWorkspace, publicWorkspace, DomainError };
