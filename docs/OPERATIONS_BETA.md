# Beta recovery and monitoring

The dedicated VergeCommon server remains a single-server deployment. This runbook adds an encrypted copy on the owner's existing Mac and local monitoring receipts. It does not add a paid service, contact another person, send alerts or provide high availability.

## Verified starting point

Read-only inspection on 19 September 2026 found the dedicated `codex-keen-forge-bf65` app container healthy, the daily `vergecommon-backup.timer` active, and server disk usage at 65%. Its backup timer runs at 03:15 UTC plus up to five minutes of jitter. The approved Mac destination had approximately 352 GiB free. These figures are observations at inspection time, not continuing guarantees.

## Encrypted recurring pull

`self-hosted/operations.py` runs hourly through a user LaunchAgent. It uses the existing SSH alias and requires the previously verified host key. The remote helper is sent over SSH and reads only the completed backup directories, live erasure ledger, container health and disk totals. It installs no remote agent and does not modify production data.

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

The scheduler runs only while this Mac is available in the user's login session. Sleep, logout, loss of Internet, unavailable SSH credentials, denied macOS filesystem access or a removed runtime can delay it. It does not wake the Mac. Local receipts alone cannot alert someone while the Mac is asleep or offline. A staffed response process and externally delivered notifications remain owner decisions; no message delivery is configured by this work.

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

Before relying on this arrangement, the owner must keep a second independently secured copy of the recovery secret in an approved password manager or offline custody location and rehearse access to it. The key and current archives reside on the same Mac in separate directories; losing both the droplet and this Mac would defeat recovery without that independent copy. No second key copy has been transmitted or invented. FileVault/device access policy, responder coverage and any future always-on offsite destination remain owner decisions.

## Tests and installation receipt

The isolated operations suite checks actual GnuPG encryption/decryption, corruption and wrong-key rejection; path traversal, links, duplicate writes and extraction limits; key permissions; committed-versus-pending ledgers; freshness thresholds; and reversible installer configuration without loading a real scheduler. It runs through `tests/operations.test.mjs` in the normal JavaScript suite and requires Python 3 and GnuPG in the test environment.

The LaunchAgent was installed and loaded on 19 September 2026. Its first launch at 18:40 UTC completed with exit code 1 and an explicit missing-live-ledger condition, as expected before the erasure-enabled release was deployed. That result is not a completed offsite recovery point.

The oldest existing local backup, `2026-09-19T16-20-21-783Z-9q2lhu`, separately passed actual encryption/decryption, the original database/evidence checks and the current erasure replay CLI in a disposable directory. A second rehearsal added one newer synthetic committed deletion for a synthetic account present in that historical snapshot. The current ledger was installed beside the recovered database; replay removed one account and one evidence file with zero pending files. This caught a nonempty-ledger regression that was fixed before the successful repeat. Production and the original backup were unchanged. A production-backed encrypted pull and current-ledger rehearsal must be recorded after deployment; source code, installation and this historical rehearsal alone do not establish current offsite protection.
