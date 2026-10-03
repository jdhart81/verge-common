import {
  authenticated,
  body,
  failure,
  guardOrigin,
  json,
  load,
  DomainError,
} from '@/server/workspaces';
import { woodlandEnabled } from '@/lib/woodland-config.mjs';
import { woodlandServerPreview } from '@/server/woodland-preview.mjs';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const user = await authenticated();
    // Enforce the byte limit even when UTF-8 expands beyond the character count.
    if (Number(request.headers.get('content-length') ?? 0) >= 100000)
      throw new DomainError('Request too large.', 413);
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength >= 100000)
      throw new DomainError('Request too large.', 413);
    const data = await body(
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: text,
      }),
    );
    const { state, row } = await load(data.id);
    return json({
      check: woodlandServerPreview(
        state,
        user.id,
        data.projectId,
        data.treatments,
        woodlandEnabled(),
      ),
      version: row.version,
    });
  } catch (e) {
    return failure(e);
  }
}
