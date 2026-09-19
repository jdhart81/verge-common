CREATE TABLE `evidence_file_deletions` (
  `object_key` text PRIMARY KEY NOT NULL,
  `requested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER `evidence_asset_deleted` AFTER DELETE ON `assets`
BEGIN
  INSERT OR IGNORE INTO evidence_file_deletions (object_key, requested_at)
  VALUES (OLD.object_key, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
END;
