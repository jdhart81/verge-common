# Service update deployment — 20 September 2026 UTC

The website and shared app service at **https://vergecommon.com** were updated at approximately **00:26 UTC on 20 September 2026** (8:26 PM on 19 September in New York). The user explicitly requested “push and deploy.” This deploys the service candidate, not an Apple binary, a broader public announcement or external carbon/payment execution.

## Exact release

| Item | Receipt |
| --- | --- |
| Implementation source | `750f7f3c5fc3fdd78aa56244f5c0ddef9a2a1b43` |
| Repository | [PR #3](https://github.com/jdhart81/verge-common/pull/3), branch `build/conversation-actions`; still open, not merged |
| Source checks | [PR run 35478214095](https://github.com/jdhart81/verge-common/actions/runs/35478214095): web, actual container, imagery and iOS all passed; the push run passed too |
| Dedicated host | `codex-keen-forge-bf65`, DigitalOcean droplet `601953476`, separate from Viridis Conservation |
| Release source | `/opt/vergecommon/releases/20260920-service-750f7f3` |
| Source archive SHA-256 | `e15c67e12a183bcfad0b3e807fa6df12d2df341ca798a29687d4663c5e61e773` |
| Built image tag | `vergecommon:20260920-service-750f7f3` |
| Deployed immutable image | `sha256:e41ad5ddc68ff47e0acbb9867577570af61e887f3a4f993a012477130511e8a4` |
| Runtime | `vergecommon-app`, healthy; one writer on private `vergecommon` network, no published app port |
| Durable mounts | `/opt/vergecommon/data:/data`, `/opt/vergecommon/backups:/backups` retained |
| Restrictions | Unprivileged user, read-only image, bounded temporary scratch, dropped capabilities, no-new-privileges, 1 GiB memory and 256-process limit |
| Retained previous executable | Stopped `vergecommon-pre-service-df05631`; diagnostic retention, **not a compatible automatic rollback** |

The deployment includes automatic foreground web refresh, Discussion actions, native reply API compatibility, project-bound receipts, stewardship/treasury reconciliation, expanded review reminders, upload migration `0002`, partner participation and capacity protections. See [service build](SERVICE_BUILD_2026-09-19.md) and [coverage audit](SERVICE_COVERAGE.md). Subsequent documentation-only commits do not change deployed executable bytes.

## Migration and acceptance

- The pre-migration backup ran through the **old running container**. Its isolated restore passed before the live switch.
- The exact candidate image first started against a private on-server copy of that backup plus the current deletion ledger. Startup applied `0002_idempotent_evidence_uploads` and reconciled erasure/evidence before listening. All three migrations were present; database integrity was `ok`; no existing workspace was capacity-paused.
- Same-image four-account HTTP acceptance and native account lifecycle checks passed on that isolated copy. The fixture workspace was `e5b280cc-d5c6-4401-89fe-be6248791e25`; all five synthetic login accounts were closed. Backup/restore retained the three historical evidence objects.
- The default Docker health probe uses the canonical hostname, so it is incompatible with the localhost-origin test configuration. Its canonical-hostname check was separately verified with the same image/data in a **network-isolated, unpublished container**, then stopped. Production uses the canonical hostname and reports healthy.
- The previous production process was stopped before the candidate attached to live data. Production was launched by immutable image ID. No database or deletion ledger was restored over live data.
- **Canonical HTTPS acceptance passed** after the switch: accounts, invitations, private membership and posts, request replay/conflicts, origin/identity denial, upload identity/hash/download/discard, native tokens and revocation, MCP reads/bounded writes/financial denial, blocking, partner acceptance/authority review/privacy, founder transfer, archival and account erasure. The separate native registration/login/logout/recovery/deletion checks also passed.
- Live synthetic workspace `5bd5ed5a-a1b6-434a-b3bb-e88f3d5827b1` was archived; all five synthetic login accounts were deleted. The final backup contained **zero accounts**, six historical workspaces and three retained historical evidence files. No real co-op or environmental/financial outcome was created.
- The live browser rendered the homepage and updated native-reply privacy disclosures, with no captured console errors. Temporary browser tabs were closed.

## Recovery receipts

All private snapshots stayed on the dedicated server. No offhost transfer or scheduler activation was performed.

| Check | Before switch | After live acceptance |
| --- | --- | --- |
| Backup directory under `/backups` | `2026-09-20T00-26-05-652Z-zbuyR4` | `2026-09-20T00-27-23-069Z-PomEsR` |
| Database SHA-256 | `8dc607ba30f83d24ee6d75b219a85a632103be922282cf10e80135d734b3e5d9` | `b2c552eae224da80fe511127ac0e5ef28cf91855e00224566f1a50e58f35d8ae` |
| Database bytes | 200704 | 258048 |
| Verified evidence files | 3 | 3 |
| Committed deletion receipts | 8 | 13 |
| Isolated restore verification | Passed | Passed at 00:27:23 UTC |
| Migrations | `0000`, `0001` | `0000`, `0001`, `0002` |

The daily on-server backup timer remains active. Metadata and acceptance logs are retained at `/opt/vergecommon/deployments/20260920-service-750f7f3`. The separate encrypted offsite recovery/alerting work remains unqualified as described in [operations](OPERATIONS_BETA.md).

## Failure and rollback boundary

The old executable predates current upload tombstones, cleanup, capacity and partner/disbursement erasure safeguards. Its ability to open an additive schema does not make it safe for current records. If a failure appears, close public writes and deploy a compatible forward fix using the current database and latest committed deletion ledger. Never automatically restart the old executable, restore a stale snapshot/ledger, or run two application processes against the live directory.

Apple signing/device qualification/distribution, optional Stripe contributions, continuing conservation obligations, real participant/operational qualification and selected registry/payment integrations remain separate unfinished work. This receipt establishes a working deployed technical beta, not completion of those services.
