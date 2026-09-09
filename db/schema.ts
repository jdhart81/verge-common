import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
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
