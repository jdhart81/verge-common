/** Public directory query shared by hosted and self-hosted deployments. */
export function directoryQuery(params, now = Date.now()) {
  const limit = Number(params.get('limit') ?? 30);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 30)
    throw new Error('Page size must be between 1 and 30.');
  const before = Number(params.get('before') ?? now + 1);
  if (!Number.isSafeInteger(before) || before < 0)
    throw new Error('Invalid page cursor.');
  const beforeId = params.get('beforeId');
  if (beforeId !== null && (!params.has('before') || !/^[\x21-\x7e]{1,128}$/.test(beforeId)))
    throw new Error('Invalid page cursor.');
  const q = (params.get('q') ?? '').trim();
  if (q.length > 160 || [...q].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    throw new Error('Use a search of up to 160 characters.');
  // Timestamp-only cursors retain their previous strict-before behavior.
  let sql = "SELECT id, state_json, updated_at FROM workspaces WHERE visibility = 'public' AND ";
  const values = [];
  if (beforeId !== null) {
    sql += '(updated_at < ? OR (updated_at = ? AND id < ?))';
    values.push(before, before, beforeId);
  } else {
    sql += 'updated_at < ?';
    values.push(before);
  }
  // Search only the safe public projection below. Filtering raw profile columns
  // would let a query infer redacted legacy text through a matching ID/cursor.
  sql += ' ORDER BY updated_at DESC, id DESC LIMIT ?';
  values.push(limit + 1);
  return { sql, values, limit, search: q };
}

export function directoryPage(rows, limit, project, search = '') {
  const visible = rows.slice(0, limit);
  const last = rows.length > limit ? visible.at(-1) : null;
  const query = search.toLowerCase();
  return {
    coops: visible.map((row) => project(JSON.parse(row.state_json))).filter((coop) =>
      !query || [coop.name, coop.region, coop.country, coop.summary].join(' ').toLowerCase().includes(query)),
    // This cursor describes scanned public rows, independent of the query text.
    // Empty search pages can still have more public rows to scan.
    next: last?.updated_at ?? null,
    nextId: last?.id ?? null,
  };
}
