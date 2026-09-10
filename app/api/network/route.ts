import { getD1 } from '@/db/d1';
import { json, failure, publicWorkspace } from '@/server/workspaces';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (id) {
      const row = await getD1()
        .prepare(
          "SELECT state_json FROM workspaces WHERE id = ? AND visibility = 'public'",
        )
        .bind(id)
        .first<{ state_json: string }>();
      if (!row) return json({ error: 'Public co-op not found.' }, 404);
      return json({ coop: publicWorkspace(JSON.parse(row.state_json)) });
    }
    const limit = Number(url.searchParams.get('limit') ?? 30);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 30) return json({ error: 'Page size must be between 1 and 30.' }, 400);
    const cursor = Number(url.searchParams.get('before') ?? Date.now() + 1);
    if (!Number.isSafeInteger(cursor))
      return json({ error: 'Invalid page cursor.' }, 400);
    const rows = await getD1()
      .prepare(
        "SELECT state_json, updated_at FROM workspaces WHERE visibility = 'public' AND updated_at < ? ORDER BY updated_at DESC LIMIT ?",
      )
      .bind(cursor, limit + 1)
      .all<{ state_json: string; updated_at: number }>();
    return json({
      coops: rows.results
        .slice(0, limit)
        .map((r) => publicWorkspace(JSON.parse(r.state_json))),
      next: rows.results.length > limit ? rows.results[limit - 1].updated_at : null,
    });
  } catch (e) {
    return failure(e);
  }
}
