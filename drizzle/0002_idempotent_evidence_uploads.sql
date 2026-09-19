CREATE TABLE `evidence_upload_receipts` (
  `request_key` text PRIMARY KEY NOT NULL,
  `fingerprint` text,
  `asset_id` text,
  `status` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_upload_receipts_asset` ON `evidence_upload_receipts` (`asset_id`);
--> statement-breakpoint
CREATE INDEX `evidence_upload_receipts_expiry` ON `evidence_upload_receipts` (`status`, `created_at`);
--> statement-breakpoint
CREATE TABLE `evidence_upload_attempts` (
  `asset_id` text PRIMARY KEY NOT NULL,
  `request_key` text NOT NULL,
  `object_key` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER `evidence_upload_committed` AFTER INSERT ON `assets`
BEGIN
  UPDATE evidence_upload_receipts SET status = 'committed', asset_id = NEW.id
  WHERE request_key = (SELECT request_key FROM evidence_upload_attempts WHERE asset_id = NEW.id)
    AND status = 'pending';
  DELETE FROM evidence_upload_attempts WHERE asset_id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER `evidence_upload_attempt_discarded` AFTER DELETE ON `evidence_upload_attempts`
WHEN NOT EXISTS (SELECT 1 FROM assets WHERE id = OLD.asset_id)
BEGIN
  INSERT OR IGNORE INTO evidence_file_deletions (object_key, requested_at)
  VALUES (OLD.object_key, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
END;
--> statement-breakpoint
CREATE TRIGGER `evidence_upload_retired` AFTER DELETE ON `assets`
BEGIN
  UPDATE evidence_upload_receipts
  SET status = 'deleted', fingerprint = NULL, asset_id = NULL
  WHERE asset_id = OLD.id;
END;
