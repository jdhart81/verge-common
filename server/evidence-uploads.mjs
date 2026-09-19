import { DomainError } from '../lib/network.mjs';

export const UPLOAD_RETENTION_MS = 24 * 60 * 60 * 1000;
export const WORKSPACE_FILE_LIMIT = 200;

// Search all persisted records, including reviewed snapshots. A conservative
// match may retain a file; it must never discard an attached private object.
const unreferenced = `NOT EXISTS (
  SELECT 1 FROM workspaces w, json_tree(w.state_json) r
  WHERE r.type = 'text' AND r.atom = assets.id
)`;

// Used in the same SQL statement as the workspace version update. A preliminary
// SELECT alone cannot protect against a concurrent discard or expiry sweep.
export const attachmentExistsGuard = `AND (? IS NULL OR EXISTS (
  SELECT 1 FROM assets a WHERE a.id = ? AND a.workspace_id = workspaces.id
  AND a.uploader_id = ?
))`;

export async function drainUploadDeletions(db, store) {
  const { results } = await db
    .prepare(
      'SELECT object_key FROM evidence_file_deletions ORDER BY requested_at LIMIT 500',
    )
    .all();
  let removed = 0;
  for (const row of results) {
    // Object keys are never reused. Fail closed if legacy data breaks that rule.
    const active = await db
      .prepare('SELECT id FROM assets WHERE object_key = ?')
      .bind(row.object_key)
      .first();
    if (active) continue;
    await store.delete(row.object_key);
    await db
      .prepare('DELETE FROM evidence_file_deletions WHERE object_key = ?')
      .bind(row.object_key)
      .run();
    removed++;
  }
  return removed;
}

/** @param {any} db @param {any} store @param {{now?: number, workspaceId?: string | null}} options */
export async function cleanupExpiredUploads(
  db,
  store,
  { now = Date.now(), workspaceId = null } = {},
) {
  // DELETE and its durable object-cleanup trigger form one SQLite transaction.
  const result = await db
    .prepare(`DELETE FROM assets WHERE created_at < ?
    AND (? IS NULL OR workspace_id = ?) AND ${unreferenced}`)
    .bind(now - UPLOAD_RETENTION_MS, workspaceId, workspaceId)
    .run();
  await drainUploadDeletions(db, store);
  return { expired: result.meta.changes };
}

export async function discardUpload(db, store, { assetId, userId }) {
  const removed = await db
    .prepare(`DELETE FROM assets WHERE id = ? AND uploader_id = ?
    AND ${unreferenced} RETURNING object_key`)
    .bind(assetId, userId)
    .first();
  if (!removed) {
    const existing = await db
      .prepare('SELECT uploader_id FROM assets WHERE id = ?')
      .bind(assetId)
      .first();
    if (existing?.uploader_id === userId)
      throw new DomainError(
        'This file is attached to evidence and cannot be discarded.',
        409,
      );
    if (existing) throw new DomainError('File not found.', 404);
    // Retrying a lost successful response is safe. No private file details leak.
  }
  await drainUploadDeletions(db, store);
  return { discarded: true };
}

export async function saveUploadMetadata(db, asset) {
  // Atomic quota and membership checks also apply to the portable D1 runtime.
  // The self-hosted account-erasure triggers remain the final account safeguard.
  const result = await db
    .prepare(`INSERT INTO assets
    (id,workspace_id,uploader_id,object_key,filename,content_type,sha256,size,created_at)
    SELECT ?,?,?,?,?,?,?,?,?
    WHERE (SELECT count(*) FROM assets WHERE workspace_id = ?) < ?
    AND EXISTS (SELECT 1 FROM workspaces w, json_each(w.state_json,'$.members') m
      WHERE w.id = ? AND w.visibility != 'archived'
      AND json_extract(m.value,'$.userId') = ?
      AND json_extract(m.value,'$.status') = 'active')`)
    .bind(
      asset.id,
      asset.workspaceId,
      asset.uploaderId,
      asset.objectKey,
      asset.filename,
      asset.contentType,
      asset.sha256,
      asset.size,
      asset.createdAt,
      asset.workspaceId,
      WORKSPACE_FILE_LIMIT,
      asset.workspaceId,
      asset.uploaderId,
    )
    .run();
  if (result.meta.changes !== 1)
    throw new DomainError(
      'Upload could not be saved. Check your membership or discard an unused file if the co-op has reached its 200-file limit.',
      409,
    );
}
