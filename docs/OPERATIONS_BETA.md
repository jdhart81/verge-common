# Beta recovery and monitoring

The dedicated VergeCommon server remains a single-server deployment. The repository includes encrypted backup/recovery tooling, aggregate health checks and optional redacted webhook delivery. **Recurring encrypted backup transfer remains paused; no webhook destination is configured or active.** This update changes source code and isolated tests, not the installed Mac scheduler, recovery key, production data or external accounts.

## Verified starting point

Read-only inspection on 19 September 2026 found the dedicated `codex-keen-forge-bf65` app container healthy, the daily `vergecommon-backup.timer` active, and server disk usage at 65%. Its backup timer runs at 03:15 UTC plus up to five minutes of jitter. The approved Mac destination had approximately 352 GiB free. These figures are observations at inspection time, not continuing guarantees.

## Encrypted recurring pull

`self-hosted/operations.py` can run hourly through a user LaunchAgent; the existing installed agent is currently unloaded pending the production-transfer authorization described below. It uses the existing SSH alias and requires the previously verified host key. The remote helper is sent over SSH and reads only completed backup directories, the live erasure ledger, container health, file-size totals and database aggregate counts. Operator-report bodies, member identities and private evidence contents never enter the inspection response. It installs no remote agent and does not modify production data.

New archives use the already installed GnuPG with AES-256 symmetric encryption and a machine-generated 384-bit random recovery secret. The secret is read from its restricted file by GnuPG, never written into a command, log, repository or production server. See the official [GnuPG passphrase/input options](https://www.gnupg.org/documentation/manuals/gnupg/GPG-Input-and-Output.html) and [encryption options](https://www.gnupg.org/documentation/manuals/gnupg/GPG-Esoteric-Options.html). Real tests verify round-trip decryption and rejection of corrupted ciphertext or a wrong key.

Installation locations:

| Item | Path |
| --- | --- |
| Existing approved backup destination | `/Users/justinhart/Desktop/Cowork /Vergecommon/private-backups/encrypted` |
| Recovery secret, separate from archives | `/Users/justinhart/.config/vergecommon/recovery/backup.key` |
| Scripts, configuration and private receipts | `/Users/justinhart/Library/Application Support/VergeCommon/Operations` |
| User LaunchAgent | `/Users/justinhart/Library/LaunchAgents/com.vergecommon.operations.plist` |

Directories are mode 0700 and key, archive, receipt and configuration files are mode 0600. Installation preserves an existing recovery key. Reinstallation must not generate a replacement key while old archives still depend on it.

Each newly available server snapshot is copied once. The latest committed erasure ledger is copied independently, even when the snapshot has not changed. Every check decrypts the selected snapshot and latest ledger into a restricted temporary directory, verifies the original snapshot with `restore-check.mjs`, then applies the latest ledger with `erasure.mjs --replay` to that disposable copy. Unsafe paths, links, special files and oversized extraction are refused. Decryption must finish successfully before a recovery receipt can pass. Temporary plaintext is removed after rehearsal; a following run also cleans up this tool's private temporary directories left by a killed run. This is normal file deletion, not a claim of forensic erasure from an SSD.

## Deletion must survive recovery

Only committed `<account UUID>.json` ledger entries are recovery-authoritative. A `.pending` intent means deletion is still being reconciled and the exporter refuses to qualify a recovery point. It must never infer that an unfinished intent authorizes deletion on restore. The exporter also checks the live SQLite tombstones through a read-only connection; an existing but incomplete ledger fails qualification instead of silently treating missing markers as no erasures.

The authoritative server directory is `/opt/vergecommon/data/deletion-ledger` (`/data/deletion-ledger` in the app container). Startup reconciles pending intents against committed database tombstones, replays committed erasures and drains deleted evidence before listening. Backup generation copies only a committed ledger and refuses a pending one. For an isolated recovered directory, the replay helper is `node self-hosted/erasure.mjs --replay --data /isolated/restored-data --ledger /latest/committed-ledger`; its receipt contains counts and status, not account identities. The offhost transport names its independently captured copy `erasure-ledger` within the encrypted archive, without changing the server path.

An old snapshot is restored only with the **latest independently retained committed ledger**, not merely the ledger bundled at snapshot creation. After validating the original snapshot, the rehearsal installs the separately refreshed ledger as the disposable runtime's `deletion-ledger`, replays it and repeats the remote metadata check afterward. If it changes during verification, the check fails and must be rerun. Before any real production recovery, reconcile the live server's ledger or the latest trusted surviving copy, record any time window that cannot be recovered, install that committed ledger beside the recovered database and replay it before opening access. Never reconcile a pending live intent against an older restored database; recover its commit decision from the original live database first or hold for operator resolution. A lost or stale ledger is an unresolved recovery condition.

The backup process never switches production data or reopens the website. The actual recovery instructions in [the self-hosted operator guide](../self-hosted/README.md) still apply.

## Health and freshness

Each check records canonical HTTPS gateway health, Docker application health, server disk use, backup age, encrypted archive checksums, ledger state and isolated recovery results in `status.json`. The last completed recovery receipt is also retained in `last-success.json`. No credentials, archive contents, member names or raw tombstones are logged.

The check requires a completed server backup no older than **30 hours**, warns at **85% server disk usage**, and requires **5 GB local free space** for a rehearsal. The local `--status` command changes the result to stale when the last operational check is more than **two hours** old. These are explicit monitoring targets, not an availability promise. A healthy `/healthz` only proves the gateway is reachable; authenticated acceptance and data mutation checks are separate release work.

The scheduler runs only while this Mac is available in the user's login session. Sleep, logout, loss of Internet, unavailable SSH credentials, denied macOS filesystem access or a removed runtime can delay it. It does not wake the Mac. Local receipts alone cannot alert someone while the Mac is asleep or offline. A staffed response process and a verified notification destination remain owner decisions. Optional webhook delivery is implemented below but disabled; no external message is sent by this source update. An always-on independent monitor is still needed to notice a sleeping or disconnected Mac.

## Aggregate inspection without backup transfer

The new read-only mode checks the canonical public health endpoint and obtains remote operational metadata. It does not read the recovery key, copy a snapshot or deletion ledger, run a restore, or overwrite the last recovery receipt. Its separate result is `inspection-status.json` in the private state directory. This does not qualify offsite recovery.

```sh
python3 self-hosted/operations.py --config /private/operator/config.json --check-only
```

The remote helper opens SQLite in read-only/query-only mode with a bounded aggregate-query deadline. It reports co-op and asset counts, the largest member/file counts, database/WAL byte sizes, evidence/backup byte totals, pending file cleanup counts, open operator-report count and oldest open report age. Filesystem inventory does not read file contents or follow symbolic links; incomplete inventory becomes an unavailable condition, not a false zero.

Default configurable warning thresholds are:

| Configuration key inside `thresholds` | Default |
| --- | --- |
| `diskUsedFraction` | 0.85 |
| `databaseBytes` | 1,000,000,000 bytes, including WAL |
| `evidenceBytes` | 5,000,000,000 bytes |
| `backupBytes` | 10,000,000,000 bytes |
| `workspaceFiles` | 180 of the 200-file pilot limit |
| `workspaceMembers` | 450 of the 500-member-record limit |
| `openSafetyReports` | 50 open reports |
| `safetyReportAgeHours` | 24 hours for the oldest open report |

These are initial attention thresholds, not tested capacity guarantees or moderation response promises. A nonempty private-file cleanup queue also requires attention. Review real usage before changing the values.

## Optional failure and recovery delivery — disabled

After the owner approves a destination, an operator can add a private `notifications` object to the source-compatible config. It remains disabled when the object is absent or `enabled` is not exactly `true`:

```json
{
  "notifications": {
    "enabled": false,
    "webhookUrl": "https://approved-operator-endpoint.example/your-webhook",
    "timeoutSeconds": 10
  }
}
```

The destination must use HTTPS, with no user-info credentials, fragment or whitespace. Normal TLS verification remains enabled. Delivery refuses redirects and accepts only a 2xx status within a configured 1–30 second timeout. Keep a webhook token embedded in the URL within the existing mode-0600 config; the URL and provider error text are never copied into notification receipts.

The payload contains only `schema`, the fixed service name `vergecommon`, `event` (`failure` or `recovery`), a bounded operational `status` and allowlisted `problemCodes`. It excludes report contents, account identifiers, email addresses, coordinates, evidence, archive paths, hashes, configuration and credentials. Example failure codes include `BACKUP_STALE`, `SAFETY_REPORT_OVERDUE` and `DISK_HIGH`.

The first healthy observation establishes a quiet baseline. Changed failure conditions produce one event; unchanged successfully delivered conditions stay quiet. A healthy observation after a delivered or attempted failure produces one recovery event, since a timed-out request may already have reached the receiver. Failed delivery retains a private pending event identity for retry on the next run. The receiver should honor the `Idempotency-Key` header because a timeout after acceptance can otherwise duplicate a delivery. A new incident after recovery receives a new identity.

Both full recovery checks and `--check-only` support these optional notifications. `--status` and `--retention-plan` never send them. The isolated tests use mocked transports only; a real destination, responder ownership and a confirmed failure/recovery delivery rehearsal are still required before calling alerting active. The current Mac scheduler remains paused. To monitor while the Mac is unavailable, later place read-only checking on an approved always-on independent host without copying the recovery key or enabling a new backup transfer implicitly.

## Install, inspect and stop

Use a tested release and the approved paths. Installation creates a recovery secret if needed and loads the hourly LaunchAgent; it requires filesystem/LaunchAgent authorization on this Mac.

```sh
python3 self-hosted/install-mac-operations.py \
  --node /Users/justinhart/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  --gpg /opt/homebrew/bin/gpg \
  --destination '/Users/justinhart/Desktop/Cowork /Vergecommon/private-backups/encrypted'
```

Inspect locally without a remote request:

```sh
python3 '/Users/justinhart/Library/Application Support/VergeCommon/Operations/operations.py' \
  --config '/Users/justinhart/Library/Application Support/VergeCommon/Operations/config.json' --status
launchctl print "gui/$(id -u)/com.vergecommon.operations"
```

Run the same command without `--status` for a manual check. A nonzero exit requires operator review. To stop scheduling reversibly while preserving all archives and keys:

```sh
launchctl bootout "gui/$(id -u)/com.vergecommon.operations"
```

The plist remains available for a later `launchctl bootstrap` or installer rerun. Do not delete the recovery key when removing a scheduler.

## Retention and owner requirements

The implementation does not silently delete historical Mac archives or the only recovery copy. The earlier plaintext archives remain unchanged; new archive encryption does not retroactively protect them. Choose their disposition explicitly, together with retention for server and encrypted offhost copies and any valid preservation requirement.

A read-only retention preview is available for the local encrypted archive directory. It requires an explicit hypothetical policy, always preserves at least two newest snapshots, and holds every ledger archive, symbolic link and unrecognized entry. This example only previews 30 days plus seven newest snapshots; it does not adopt that policy:

```sh
python3 self-hosted/operations.py --config /private/operator/config.json \
  --retention-plan --keep-days 30 --keep-at-least 7
```

The report lists potential reclaimable bytes and candidates. **There is no apply or delete mode.** Candidate recognition uses names and timestamps, not proof of successful decryption or independent recovery. Before any separately authorized deletion, verify an independent recoverable copy, latest independently retained committed deletion ledger, the chosen retention policy and any preservation requirements. Server backup deletion is also outside this preview.

Before relying on this arrangement, the owner must keep a second independently secured copy of the recovery secret in an approved password manager or offline custody location and rehearse access to it. The key and current archives reside on the same Mac in separate directories; losing both the droplet and this Mac would defeat recovery without that independent copy. No second key copy has been transmitted or invented. FileVault/device access policy, responder coverage and any future always-on offsite destination remain owner decisions.

## Tests and installation receipt

The 15-case isolated operations suite additionally checks redacted notification transitions, timeout/status handling, delivery retry identity, disabled-by-default behavior, aggregate-only read queries, capacity/backlog thresholds, transfer-free inspection and retention previews. It also checks actual GnuPG encryption/decryption, corruption and wrong-key rejection; path traversal, links, duplicate writes and extraction limits; key permissions; committed-versus-pending ledgers; freshness thresholds; and reversible installer configuration without loading a real scheduler. It runs through `tests/operations.test.mjs` in the normal JavaScript suite and requires Python 3 and GnuPG in the test environment.

The LaunchAgent was installed and loaded on 19 September 2026. Its first launch at 18:40 UTC completed with exit code 1 and an explicit missing-live-ledger condition, as expected before the erasure-enabled release was deployed. That result is not a completed offsite recovery point.

The oldest existing local backup, `2026-09-19T16-20-21-783Z-9q2lhu`, separately passed actual encryption/decryption, the original database/evidence checks and the current erasure replay CLI in a disposable directory. A second rehearsal added one newer synthetic committed deletion for a synthetic account present in that historical snapshot. The current ledger was installed beside the recovered database; replay removed one account and one evidence file with zero pending files. This caught a nonempty-ledger regression that was fixed before the successful repeat. Production and the original backup were unchanged. A production-backed encrypted pull and current-ledger rehearsal must be recorded after deployment; source code, installation and this historical rehearsal alone do not establish current offsite protection.

### Deployment check and transfer hold — 19 September 2026

After release `5aa1a5f` was deployed, a read-only server inspection confirmed completed backup `2026-09-19T18-59-57-832Z-kdUxHj`, created at `2026-09-19T18:59:57.876Z`. Its database integrity was `ok`, database SHA-256 was `c4c9798ea8211b34f54bf2dce28168edc84ef9fa162da60c31632038aab4cf2e`, and the receipt recorded three verified evidence files and four committed deletions. The live ledger had four entries and passed completeness checking against the live database. Its transport digest was `5ff42800fa5b59953c1d22f6b793fa0ef1608bcae3b9070116d5ad797757cb3a`. The app container was healthy and server disk usage was approximately 65%.

Automatic approval review rejected the manual production backup transfer before execution because trusted user authorization had not explicitly specified the private database/evidence/deletion-ledger payload, local destination and recurring copy. No equivalent copy was attempted through another route. The owner has been asked to authorize the encrypted production copy to the existing `/Users/justinhart/Desktop/Cowork /Vergecommon/private-backups/encrypted` directory, including hourly updates.

The LaunchAgent was reversibly unloaded while that authorization is pending; a subsequent status query confirmed it was no longer loaded. Its plist, configuration, recovery key and archive directory remain intact. The last operational receipt is still the pre-deployment missing-ledger failure at `2026-09-19T18:46:05.308993+00:00`. There is **no qualified production-backed encrypted offhost recovery receipt yet**. After approval, reload the existing agent, run the installed manual pull, verify the isolated replay and record the resulting fresh receipt before describing recurring offhost protection as active.
