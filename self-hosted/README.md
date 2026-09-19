# Running VergeCommon on one server

The self-hosted build runs the shared web application, its APIs, private evidence storage, browser accounts, native device access, and the authenticated agent MCP on one host. It replaces Cloudflare D1/R2 bindings with SQLite and private disk files; the original Cloudflare build remains available separately.

This is cooperative preparation and recordkeeping software. Land instruments, verification, registry issuance, custody, sales, cleared proceeds, and payment execution still require the relevant people and institutions. See [pooled-land safeguards](../docs/POOLING_SAFEGUARDS.md).

## Runtime and configuration

Use **Node 24.19.0**, matching the production Dockerfile, and run commands from the repository root. The self-hosted runtime uses the built-in `node:sqlite` API and its online backup facility. [Node SQLite reference](https://nodejs.org/api/sqlite.html).

| Setting             | Meaning                                                                                               | Default                 |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------- |
| `VERGE_ORIGIN`      | Exact public origin, no trailing slash; HTTPS required except localhost                               | `http://127.0.0.1:3100` |
| `VERGE_DATA_DIR`    | Private durable directory for SQLite and evidence; use an absolute path                               | `.verge-data`           |
| `VERGE_BACKUP_DIR`  | Private backup destination; mount separately from application files                                   | `self-hosted/backups`   |
| `VERGE_BIND`        | Gateway listening interface                                                                           | `127.0.0.1`             |
| `PORT`              | Gateway port                                                                                          | `3100`                  |
| `VERGE_TRUST_CADDY` | Set to `1` only when requests arrive through the private Caddy connection that overwrites `X-Real-IP` | Unset                   |
| `VERGE_SELF_HOSTED` | Selects the Node storage build; set by `build:selfhost`                                               | Unset                   |

The Dockerfile sets `/data`, `/backups`, `0.0.0.0:3000`, `https://vergecommon.com`, and trusted Caddy forwarding. Its process runs as the unprivileged `node` user. Mount durable directories writable by that user. Neither data directory belongs in source control or a container image.

Only the reverse proxy should publish ports 80 and 443. The gateway lives on the private Docker network. Vinext itself listens on a randomly assigned loopback port inside the app container. Never publish that internal application listener: the gateway verifies sessions/tokens, removes caller-supplied identity headers, and supplies trusted identity to the app. For direct local testing, leave `VERGE_TRUST_CADDY` unset.

The bundled Caddyfile redirects `www.vergecommon.com` to the canonical HTTPS domain and proxies to `vergecommon-app:3000`. Its domain names must match DNS and `VERGE_ORIGIN`. A `/healthz` response proves the gateway is reachable; it does not prove a successful database mutation, file retrieval, or authenticated workflow.

## Dedicated VergeCommon deployment layout

The dedicated droplet uses Docker container `vergecommon-app` on private bridge network `vergecommon`. Its `/data` mount is `/opt/vergecommon/data` on the host; `/backups` is `/opt/vergecommon/backups`. Release source/image inputs are retained under `/opt/vergecommon/releases/<UTC>-app`. Caddy keeps its existing certificate volumes and reaches the app only through the private network. Do not publish the app's port directly on the host.

The deployment includes `vergecommon-backup.service` and `vergecommon-backup.timer`, scheduled daily at **03:15 UTC**. Confirm installation and the last successful receipt on the actual host before relying on this schedule. The owner’s Mac has hourly encrypted-pull and isolated-restore tooling, but recurring production transfer remains paused pending explicit approval; see [operations](../docs/OPERATIONS_BETA.md) for its actual status, sleep/offline limits, approved paths and remaining independent key-custody requirement.

## Build and isolated acceptance

```sh
npm ci
npm run typecheck
npm test
npm run build:selfhost
VERGE_DATA_DIR=/tmp/vergecommon-staging-data \
VERGE_ORIGIN=http://127.0.0.1:3100 \
npm run start:selfhost
```

In a second terminal, with the staging listener running:

```sh
VERGE_TEST_ORIGIN=http://127.0.0.1:3100 python3 tests/selfhost_acceptance.py
```

Use an empty dedicated staging directory and the same release image intended for production. The acceptance runner creates synthetic accounts and a private co-op, exercises invitations, membership, posts, request replay/conflicts, uploads and private downloads, token permissions/revocation, hosted MCP and origin/identity rejection. It archives the fixture and closes the synthetic login accounts.

The runner permits loopback targets by default. A specifically authorized canonical production check requires both `VERGE_TEST_ORIGIN=https://vergecommon.com` and `VERGE_ALLOW_PRODUCTION_FIXTURES=1`. Use only synthetic identities and evidence, keep the fixture private, and confirm workspace archival and closure of all synthetic test login accounts. If a run fails before cleanup, complete that cleanup before treating acceptance as complete. Do not point it at a real co-op or weaken its target guard. The September 19 deployment used this explicit opt-in after isolated staging acceptance passed.

Also perform a browser check with **two separate accounts or browser profiles**:

1. Account A creates a private co-op and invites B. B cannot see private records before approval.
2. A approves B and appoints B as a steward. A records synthetic land, boundary, consent, evidence and an agreement. A cannot independently approve its own record; B can review it.
3. Compare an adjacent boundary with an overlapping boundary. Resolve an area mismatch. Confirm missing or stale parcel-specific rights prevent readiness.
4. Have B post an update, comment, respond to an event, and report content. A resolves the report; a steward cannot review a report about their own content.
5. Download an evidence file with authorized access. A third unrelated account must be denied. Sign out and verify private access ends.
6. Create a separate read-only device token and agent token. Verify reads, refused writes, and revocation. Confirm account recovery signs out old sessions and tokens.
7. Restart the same app image against the same staging data and confirm the co-op and evidence bytes survive. Run the backup and restore check below.

The native client uses the deployed API and a device token. Building its source does not distribute an iOS release: Apple signing, packaging, and delivery remain separate release steps.

## Accounts and agent access

Accounts use a **username**, not email verification or a social-login provider. Usernames contain 3–40 letters/numbers/underscores/hyphens, start with a letter or number, and normalize to lowercase. Passwords contain 12–128 characters and are stored as salted scrypt hashes.

A random recovery code is shown once at registration, and once again after successful recovery. Store it in a password manager. Recovery requires the username and code, replaces the code, and revokes existing sessions/device tokens. There is no email reset service. Operators should never ask users to paste passwords, recovery codes, or bearer tokens into support tickets or logs. Users without either a working login or recovery code need an operator-reviewed identity/recovery process; there is no unattended bypass.

Browser sessions expire after seven days. Device/agent tokens expire after 90 days, are shown once, and can be revoked from `/account`. Give each client a separate token with the smallest suitable scope:

| Scope       | Use                                                                |
| ----------- | ------------------------------------------------------------------ |
| `app:read`  | Read co-ops available to the account through the API/native client |
| `app:write` | Read and participate through the API/native client                 |
| `mcp:read`  | Agent reads through `/mcp`                                         |
| `mcp:write` | Agent reads and the explicitly allowed participation tools         |

The remote MCP endpoint is `/mcp`; discovery is `/.well-known/mcp.json`. Send the token in the Authorization bearer header, never in a URL. Co-op membership and steward permissions still apply. Agent access does not authorize legal/financial approvals or membership escalation. See [MCP documentation](../mcp/README.md) for the exact allowed tools.

Changing a password revokes previous sessions and tokens. Native `/auth/native/me` requires an app-scoped bearer token and returns its account identity without using browser cookies. Evidence requests may include a lowercase UUID `uploadId`; identical retries return the original asset, changed bytes/metadata or a retired attempt return 409, and a recoverable quota rejection returns 429. Migration `0002_idempotent_evidence_uploads` preserves canonical private file paths, receipt tombstones and concurrent-attempt cleanup. Native login, registration and recovery use origin-bound JSON endpoints under `/auth/native/`; the app receives a 90-day participation token, never a cookie. Logout revokes that device token. Account deletion on the web or native app verifies the password and `DELETE`, removes associated personal records and credentials atomically, and drains private file deletions before reporting success. Transfer active shared stewardship first. De-identified governance/numeric structures and other members’ independently authored content may remain; see [privacy](../PRIVACY.md). The account export includes records the user is authorized to see, not every member's private evidence.

## Capacity and monitoring

This implementation supports **one application process on one server with one local SQLite database and private local evidence directory**. SQLite uses WAL, a busy timeout, full synchronous writes, and compare-and-swap workspace versions. Concurrent saves to the same workspace return a conflict for the stale writer rather than silently overwriting a newer update. Refresh before retrying a conflicted change.

Do not place the database on a network filesystem, start replicas that independently write the same data, or treat the droplet as highly available. No benchmarked user-count or throughput guarantee is claimed. Existing pilot limits include 20 created co-ops per account, 500 members per co-op, 200 evidence files of at most 4 MB per co-op, and bounded workspace history/storage. Monitor actual response latency, conflict/error rates, CPU/memory, disk free space, database growth, backup age and restore-test success before expanding use. Move to a deliberately designed shared database/object store architecture before adding application replicas.

At minimum, alert on repeated failed health checks, 5xx responses, disk usage above the operator's chosen threshold, a missing or failed daily backup, and failed restore checks. Gateway request/auth rate limits protect ordinary use; they are not a substitute for incident response or upstream abuse controls. Never log authorization headers, cookies, passwords, recovery codes, uploaded content, or private workspace responses.

## Backup and restore rehearsal

Run the backup command under the same OS user and data settings as the application:

```sh
VERGE_DATA_DIR=/absolute/private/data \
VERGE_BACKUP_DIR=/absolute/private/backups \
npm run backup:selfhost
```

The command creates a uniquely named directory, uses SQLite's online snapshot API, copies evidence and the committed deletion ledger, verifies referenced evidence SHA-256 hashes, and emits a receipt containing the database hash, migration names, evidence count, deletion count and database size. A pending deletion intent or missing referenced file refuses the snapshot; retry after reconciliation. A failed command is a failed backup even if a partial directory remains. Do not retain or transfer it as a successful recovery point.

Then pass the exact completed directory to:

```sh
node self-hosted/restore-check.mjs /absolute/private/backups/COMPLETED_DIRECTORY
```

The checker copies the backup to an automatically created temporary directory, rejects symbolic links and unsafe paths, checks SQLite integrity/foreign keys/workspace JSON, verifies the receipt's database hash and every referenced evidence hash/size, and removes the temporary copy. It does **not** start a server, replace production files, or change `VERGE_DATA_DIR`. Historical receipts without a database hash are explicitly marked `databaseHashRecorded: false`; new backups should always have it recorded. Keep the result with the deployment/backup receipt.

Schedule local backup generation and verification at least daily and before releases. A local backup on the same droplet does not protect against host loss. Confirm the actual scheduler, encryption key custody and offsite destination separately; the source code alone does not provision them.

### Encrypted offsite copy

Use an operator-approved destination and recipient key. The example below uses [age's documented recipient encryption](https://github.com/FiloSottile/age#usage). Generate and secure the private identity **off the production server**; provision only its public recipient string on the server. Keep a second independently secured recovery copy of the identity.

With `age`, `tar`, and an authenticated offsite transfer path available, run in Bash with these operator-provided variables:

```sh
set -euo pipefail
umask 077
: "${VERGE_COMPLETED_BACKUP:?Set the completed backup directory}"
: "${VERGE_BACKUP_RECIPIENT:?Set the age public recipient}"
: "${VERGE_ENCRYPTED_ARCHIVE:?Set a new encrypted output filename}"
: "${VERGE_OFFSITE_DESTINATION:?Set the approved SSH destination directory}"
test ! -e "$VERGE_ENCRYPTED_ARCHIVE"
node self-hosted/restore-check.mjs "$VERGE_COMPLETED_BACKUP"
tar -C "$VERGE_COMPLETED_BACKUP" -czf - . |
  age --encrypt -r "$VERGE_BACKUP_RECIPIENT" -o "$VERGE_ENCRYPTED_ARCHIVE"
sha256sum "$VERGE_ENCRYPTED_ARCHIVE" > "$VERGE_ENCRYPTED_ARCHIVE.sha256"
scp "$VERGE_ENCRYPTED_ARCHIVE" "$VERGE_ENCRYPTED_ARCHIVE.sha256" "$VERGE_OFFSITE_DESTINATION"
```

Verify the encrypted checksum at the destination. Periodically fetch an offsite copy onto an isolated recovery host, decrypt with the separately held identity, unpack into a new private directory, and run `restore-check.mjs` there. Never extract an untrusted archive into a live data path. A checksum verifies bytes; the authenticated transfer and encryption keys establish which backup you are trusting.

### Actual recovery after an incident

1. Stop public writes and preserve the failed deployment/data for diagnosis. Record the recovery point time and expected data loss window.
2. Retrieve and decrypt a trusted offsite archive into an isolated private directory. Run the restore checker. Independently retrieve the **latest committed deletion ledger**, verify its freshness and replace the restored directory’s `deletion-ledger` with that trusted copy. Run `node self-hosted/erasure.mjs --replay --data /isolated/restored-data --ledger /isolated/restored-data/deletion-ledger` before starting a listener. A missing or stale deletion ledger blocks reopening: the ledger bundled in an old snapshot is insufficient. Then launch a release with the erasure safeguards against the recovered directory on a local-only staging listener.
3. Repeat the two-account, file-download, restart and permission checks. If compromise is suspected, revoke restored sessions/device tokens and complete credential recovery before reopening.
4. Stop the production application before switching its data mount. Install the verified recovery directory with the correct unprivileged ownership. Keep the previous directory and image available for rollback; do not overwrite it in place or merge SQLite/WAL files from different snapshots.
5. Start the approved release, verify canonical HTTPS and authenticated behavior, then reopen writes. Record the result, gaps and recovery duration. Take a new verified backup.

The checker is a rehearsal tool; the final production data switch is an explicit operational action. Never restore old auth/session data blindly after a security incident. After enabling account deletion, do not roll back to an older executable lacking startup replay and erasure triggers; use a compatible forward fix or keep service closed while repairing.

## Incident, moderation and retention runbook

**Availability/data incident:** stop writes if integrity is uncertain; preserve sanitized logs, timestamps, image identifier and backup receipts; confirm disk and database health; reproduce with an isolated copy; restore using the procedure above. Do not keep retrying a failing migration against the only production copy.

**Account/device incident:** revoke the affected token or use password change/recovery to revoke account access. For a service-wide compromise, isolate the gateway, preserve evidence, revoke sessions/tokens through a reviewed operator procedure, rotate affected infrastructure credentials, and rebuild from trusted source. Inform affected users through the operator's approved communication process; this repository does not send incident notifications automatically.

**Community reports:** members report an update, comment or event. A steward reviews the report and records hide/dismiss plus a reason. Another steward handles reports about the reviewing steward's own content. Use membership restrictions and archived workspaces when appropriate; do not expose private evidence in a public moderation response. Export relevant records before a sanctioned removal. Legal disputes and urgent threats require the appropriate external process.

**Retention:** account deletion now removes attributable personal records, with minimal private tombstones and file-cleanup queues preventing resurrection. It is not a blanket purge of other members’ content or shared numeric structures. Existing backups have no automatic expiry, and older plaintext Mac copies remain unchanged. The operator must choose retention periods and handle requests involving other members’ independent text. Every restore must replay the current committed deletion ledger before access opens. Do not purge the only known-good recovery point or records subject to an active preservation requirement. Private account, safety and privacy contact: **justin@viridisconservation.com**.
