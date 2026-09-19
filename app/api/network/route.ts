import { getD1 } from '@/db/d1';
import { json, failure, publicWorkspace } from '@/server/workspaces';
import { directoryQuery, directoryPage } from '@/lib/network-directory.mjs';
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
    let query;
    try { query = directoryQuery(url.searchParams); }
    catch (e) { return json({ error: e instanceof Error ? e.message : 'Invalid directory query.' }, 400); }
    const rows = await getD1()
      .prepare(query.sql)
      .bind(...query.values)
      .all<{ id: string; state_json: string; updated_at: number }>();
    return json(directoryPage(rows.results, query.limit, publicWorkspace, query.search));
  } catch (e) {
    return failure(e);
  }
}
