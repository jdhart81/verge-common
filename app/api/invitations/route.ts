import {
  authenticated,
  guardOrigin,
  body,
  load,
  command,
  json,
  failure,
  DomainError,
} from '@/server/workspaces';
import { requireSteward } from '@/lib/network.mjs';
export const dynamic = 'force-dynamic';
async function digest(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const user = await authenticated(),
      data = await body(request);
    if (typeof data.id !== 'string' || !/^[0-9a-f-]{36}$/.test(data.id))
      throw new DomainError('Invalid invitation.');
    const { row, state } = await load(data.id);
    if (data.action === 'create') {
      requireSteward(state, user.id);
      const token = crypto.randomUUID() + crypto.randomUUID();
      await command(
        data.id,
        user,
        {
          op: 'create_invitation',
          payload: { label: data.label, tokenHash: await digest(token) },
          requestId: crypto.randomUUID(),
        },
        row.version,
      );
      return json({ link: `/join/#${data.id}.${token}` });
    }
    if (
      data.action !== 'accept' ||
      typeof data.token !== 'string' ||
      !/^[0-9a-f-]{72}$/.test(data.token)
    )
      throw new DomainError('Invalid invitation.');
    await command(
      data.id,
      user,
      {
        op: 'accept_invitation',
        payload: { name: data.name, tokenHash: await digest(data.token) },
        requestId: data.requestId,
      },
      row.version,
    );
    return json({ saved: true });
  } catch (e) {
    return failure(e);
  }
}
