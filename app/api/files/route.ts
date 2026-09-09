import { env } from 'cloudflare:workers';
import { getD1 } from '@/db/d1';
import {
  authenticated,
  DomainError,
  failure,
  guardOrigin,
  json,
  load,
} from '@/server/workspaces';
import { requireMember, isSteward } from '@/lib/network.mjs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const user = await authenticated();
    const id = new URL(request.url).searchParams.get('workspace') ?? '';
    const { state } = await load(id);
    requireMember(state, user.id);
    if (state.visibility === 'archived')
      throw new DomainError('Co-op is archived.');
    if (Number(request.headers.get('content-length') ?? 0) > 5 * 1024 * 1024)
      throw new DomainError('File must be no larger than 4 MB.', 413);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size < 1 || file.size > 4 * 1024 * 1024)
      throw new DomainError('Choose a file no larger than 4 MB.');
    const allowed = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'text/plain',
    ];
    if (!allowed.includes(file.type))
      throw new DomainError('Use PDF, PNG, JPEG, WebP, or plain text.');
    const count = await getD1()
      .prepare('SELECT count(*) AS n FROM assets WHERE workspace_id = ?')
      .bind(id)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 200)
      throw new DomainError('This pilot co-op has reached its 200-file limit.');
    const bytes = await file.arrayBuffer();
    const sha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    const assetId = crypto.randomUUID(),
      key = `private/${id}/${assetId}`,
      filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    await env.EVIDENCE.put(key, bytes);
    try {
      await getD1()
        .prepare(
          'INSERT INTO assets (id,workspace_id,uploader_id,object_key,filename,content_type,sha256,size,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          assetId,
          id,
          user.id,
          key,
          filename,
          file.type,
          sha256,
          file.size,
          Date.now(),
        )
        .run();
    } catch (e) {
      await env.EVIDENCE.delete(key);
      throw e;
    }
    return json({ id: assetId, filename, sha256 }, 201);
  } catch (e) {
    return failure(e);
  }
}
export async function GET(request: Request) {
  try {
    const user = await authenticated();
    const id = new URL(request.url).searchParams.get('id');
    const asset = await getD1()
      .prepare('SELECT * FROM assets WHERE id = ?')
      .bind(id)
      .first<{
        workspace_id: string;
        uploader_id: string;
        object_key: string;
        filename: string;
        content_type: string;
      }>();
    if (!asset) throw new DomainError('File not found.', 404);
    const { state } = await load(asset.workspace_id);
    requireMember(state, user.id);
    if (asset.uploader_id !== user.id && !isSteward(state, user.id))
      throw new DomainError('File not found.', 404);
    const object = await env.EVIDENCE.get(asset.object_key);
    if (!object) throw new DomainError('File not found.', 404);
    return new Response(object.body, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${asset.filename}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
