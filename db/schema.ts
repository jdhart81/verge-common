import {
  integer,
  sqliteTable,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    region: text('region').notNull(),
    summary: text('summary').notNull(),
    visibility: text('visibility').notNull().default('private'),
    state: text('state_json').notNull(),
    version: integer('version').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('workspaces_visibility_updated').on(t.visibility, t.updatedAt),
    index('workspaces_owner').on(t.ownerId),
  ],
);
export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    uploaderId: text('uploader_id').notNull(),
    objectKey: text('object_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sha256: text('sha256').notNull(),
    size: integer('size').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('assets_workspace').on(t.workspaceId)],
);

// Retains failed object deletions until the storage provider confirms removal.
export const evidenceFileDeletions = sqliteTable('evidence_file_deletions', {
  objectKey: text('object_key').primaryKey(),
  requestedAt: integer('requested_at').notNull(),
});

// Retired requests retain only a scoped hash, status and time, never file data.
export const evidenceUploadReceipts = sqliteTable(
  'evidence_upload_receipts',
  {
    requestKey: text('request_key').primaryKey(),
    fingerprint: text('fingerprint'),
    assetId: text('asset_id'),
    status: text('status').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('evidence_upload_receipts_asset').on(t.assetId),
    index('evidence_upload_receipts_expiry').on(t.status, t.createdAt),
  ],
);

// Each simultaneous attempt uses its own canonical private object key. Commit
// selects one asset and trigger-backed cleanup retires unsuccessful attempts.
export const evidenceUploadAttempts = sqliteTable('evidence_upload_attempts', {
  assetId: text('asset_id').primaryKey(),
  requestKey: text('request_key').notNull(),
  objectKey: text('object_key').notNull(),
  createdAt: integer('created_at').notNull(),
});
