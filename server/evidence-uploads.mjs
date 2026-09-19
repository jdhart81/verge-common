import { DomainError } from '../lib/network.mjs';

export const UPLOAD_RETENTION_MS = 24 * 60 * 60 * 1000;
export const WORKSPACE_FILE_LIMIT = 200;
const memberExists = `EXISTS (
  SELECT 1 FROM workspaces w, json_each(w.state_json,'$.members') m
  WHERE w.id = ? AND w.visibility != 'archived'
  AND json_extract(m.value,'$.userId') = ?
  AND json_extract(m.value,'$.status') = 'active'
)`;

export function validateUploadId(uploadId) {
  if (
    uploadId !== null &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      uploadId,
    )
  )
    throw new DomainError('Upload ID must be a lowercase UUID.');
}

async function digest(value) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

const retired = () =>
  new DomainError(
    'This upload attempt has expired or was discarded. Choose the file again to start a new upload.',
    409,
  );

async function uploadReceipt(db, asset, request) {
  // A receipt never grants access after membership or account removal. Scope is
  // hashed with both identities, so another account cannot probe a request ID.
  const row = await db
    .prepare(`SELECT r.*, a.filename, a.sha256 FROM evidence_upload_receipts r
    LEFT JOIN assets a ON a.id = r.asset_id
    WHERE r.request_key = ? AND ${memberExists}`)
    .bind(request.key, asset.workspaceId, asset.uploaderId)
    .first();
  if (!row)
    throw new DomainError(
      'Active membership is required to store evidence.',
      403,
    );
  if (row.status === 'deleted') throw retired();
  if (row.fingerprint !== request.fingerprint)
    throw new DomainError(
      'Upload ID conflict. Retry with the original file, filename and type.',
      409,
    );
  if (row.status === 'committed') {
    if (!row.filename || !row.sha256) throw retired();
    return {
      id: row.asset_id,
      filename: row.filename,
      sha256: row.sha256,
      repeated: true,
    };
  }
  return { id: row.asset_id, repeated: false };
}

/**
 * Storage uses a fresh immutable key for each concurrent attempt. The receipt is
 * reserved before storing bytes; the asset INSERT and trigger commit it together.
 * A losing attempt can delete only its own object, never the winner's object.
 * @param {any} db
 * @param {any} store
 * @param {any} asset
 * @param {ArrayBuffer | Uint8Array | string} bytes
 * @param {string | null} uploadId
 */
export async function persistUpload(db, store, asset, bytes, uploadId = null) {
  validateUploadId(uploadId);
  let request = null;
  if (uploadId !== null) {
    const key = await digest(
      JSON.stringify([asset.uploaderId, asset.workspaceId, uploadId]),
    );
    const fingerprint = await digest(
      JSON.stringify([
        key,
        asset.originalFilename ?? asset.filename,
        asset.contentType,
        asset.sha256,
        asset.size,
      ]),
    );
    request = { key, fingerprint };
    await db
      .prepare(`INSERT OR IGNORE INTO evidence_upload_receipts
      (request_key,fingerprint,asset_id,status,created_at)
      SELECT ?,?,NULL,'pending',? WHERE ${memberExists}`)
      .bind(
        key,
        fingerprint,
        asset.createdAt,
        asset.workspaceId,
        asset.uploaderId,
      )
      .run();
    const receipt = await uploadReceipt(db, asset, request);
    if (receipt.repeated) return receipt;
  }
  asset = { ...asset, id: crypto.randomUUID() };
  asset.objectKey = `private/${asset.workspaceId}/${asset.id}`;
  try {
    if (request)
      await db
        .prepare('INSERT INTO evidence_upload_attempts VALUES (?,?,?,?)')
        .bind(asset.id, request.key, asset.objectKey, asset.createdAt)
        .run();
    await store.put(asset.objectKey, bytes);
    const saved = await saveUploadMetadata(db, asset, request);
    if (saved)
      return {
        id: asset.id,
        filename: asset.filename,
        sha256: asset.sha256,
        repeated: false,
      };
    const receipt = await uploadReceipt(db, asset, request);
    if (!receipt.repeated)
      throw new DomainError(
        'This co-op has reached its 200-file limit. Discard an unused file, then retry this same upload attempt.',
        429,
      );
    await queueUncommittedObject(db, store, asset.objectKey);
    return receipt;
  } catch (error) {
    await queueUncommittedObject(db, store, asset.objectKey);
    throw error;
  }
}

async function queueUncommittedObject(db, store, key) {
  await db
    .prepare('DELETE FROM evidence_upload_attempts WHERE object_key = ?')
    .bind(key)
    .run();
  await db
    .prepare('INSERT OR IGNORE INTO evidence_file_deletions VALUES (?,?)')
    .bind(key, Date.now())
    .run();
  await drainUploadDeletions(db, store);
}

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
  // An incomplete request expires too. Keep its scoped hash forever so a retry
  // cannot bind fresh bytes to an old, uncertain or deleted upload attempt.
  await db
    .prepare(`UPDATE evidence_upload_receipts
    SET status = 'deleted', fingerprint = NULL, asset_id = NULL
    WHERE status = 'pending' AND created_at < ?`)
    .bind(now - UPLOAD_RETENTION_MS)
    .run();
  // Failed or interrupted attempts are never attached; their durable deletion
  // trigger also recovers objects left behind by a crashed storage request.
  await db
    .prepare('DELETE FROM evidence_upload_attempts WHERE created_at < ?')
    .bind(now - UPLOAD_RETENTION_MS)
    .run();
  // DELETE and its durable object-cleanup trigger form one SQLite transaction.
  const result = await db
    .prepare(`DELETE FROM assets WHERE created_at < ?
    AND (? IS NULL OR workspace_id = ?) AND ${unreferenced} RETURNING id`)
    .bind(now - UPLOAD_RETENTION_MS, workspaceId, workspaceId)
    .all();
  await drainUploadDeletions(db, store);
  return { expired: result.results.length };
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

export async function saveUploadMetadata(db, asset, request = null) {
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
      AND json_extract(m.value,'$.status') = 'active')
    AND (? IS NULL OR EXISTS (SELECT 1 FROM evidence_upload_receipts
      WHERE request_key = ? AND fingerprint = ? AND status = 'pending'
      AND EXISTS (SELECT 1 FROM evidence_upload_attempts t
        WHERE t.asset_id = ? AND t.request_key = evidence_upload_receipts.request_key))) RETURNING id`)
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
      request?.key ?? null,
      request?.key ?? null,
      request?.fingerprint ?? null,
      asset.id,
    )
    .first();
  if (!result && !request)
    throw new DomainError(
      'Upload could not be saved. Check your membership or discard an unused file if the co-op has reached its 200-file limit.',
      409,
    );
  return Boolean(result);
}
