import { getD1 } from '@/db/d1';
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
export async function body(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > 100000)
    throw new DomainError('Request too large.', 413);
  const text = await request.text();
  if (text.length > 100000) throw new DomainError('Request too large.', 413);
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new DomainError('A JSON object is required.');
    return value;
  } catch {
    throw new DomainError('Invalid JSON.');
  }
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
export async function command(
  id: string,
  user: { id: string },
  input: { op: string; payload: Record<string, unknown>; requestId: string },
  expectedVersion: number,
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
  if (expectedVersion !== row.version)
    throw new DomainError(
      'Someone updated this co-op. Refresh before saving your change.',
      409,
    );
  const next = applyCommand(state, user, input, Date.now(), input.requestId);
  const event = next.audit.at(-1)!;
  const { audit, ...data } = next;
  event.requestHash = requestHash;
  event.previousHash = state.audit.at(-1)?.hash ?? '';
  event.stateHash = await hash(JSON.stringify(data));
  event.hash = await hash(JSON.stringify(event));
  const result = await getD1()
    .prepare(
      'UPDATE workspaces SET state_json = ?, name = ?, region = ?, summary = ?, visibility = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ? RETURNING version',
    )
    .bind(
      JSON.stringify(next),
      next.name,
      next.region,
      next.summary,
      next.visibility,
      next.updatedAt,
      id,
      row.version,
    )
    .first<{ version: number }>();
  if (!result)
    throw new DomainError(
      'Someone updated this co-op. Refresh before saving your change.',
      409,
    );
  return { state: next, version: result.version };
}
export { membership, memberView, newWorkspace, publicWorkspace, DomainError };
