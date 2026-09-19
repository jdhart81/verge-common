# Launch acceptance — September 19, 2026

This is a historical feature inventory, not the latest candidate verdict. See [current beta readiness](BETA_READINESS_2026-09-19.md) and [last deployed build](LAUNCH_BUILD_2026-09-19.md). See [the current beta release receipt](BETA_RELEASE_2026-09-19.md) for newer native account/deletion controls, support, moderation and encrypted operations evidence.

## Target

A conservation social network where neighbors organize a co-op, document distinct land contributions, work with a consenting conservation nonprofit, prepare a compatible carbon pathway for external review, and maintain transparent records of externally issued holdings, proceeds, and member allocations. No claim of being the first such project is established.

The shared web application is live at [vergecommon.com](https://vergecommon.com). This document records the implementation and automated acceptance evidence for the early cooperative pilot. The pushed candidate is `2b73c2d` on `build/coop-launch-readiness`; [PR #2](https://github.com/jdhart81/verge-common/pull/2) remains under review. Keep the final source revision, deployed image, public checks and recovery results with the [deployment receipt](DEPLOYMENT_2026-09-19.md). Deployment does not establish real community adoption or qualification for carbon credits or payouts.

## Current implementation

| Flow | Implemented and checked | Remaining acceptance or external requirement |
| --- | --- | --- |
| Accounts and access | Self-hosted username/password gateway; salted password hashes, secure browser sessions, recovery codes, account export/closure, expiring revocable device/agent tokens; independent-account acceptance through live canonical HTTPS | Operator recovery/incident rehearsal with the real pilot team; email verification/reset, OAuth and MFA are not included |
| Neighborhood community | Membership/roles, private invitations, project updates, events/RSVP capacity, discussions and moderation; domain tests and live multi-account private participation | Real activity, accessibility/device acceptance and sustained return participation |
| Nonprofit involvement | Self-reported organizer profiles, private project-specific partnership/evidence records, separate steward review and revocation | Actual nonprofit consent and qualified review of its role; a software review is not independently verified affiliation |
| Land pooling | Reviewed parcels/boundaries, geodesic area estimates, area-mismatch and overlap checks, parcel-specific consent, explicit agreement coverage, revocation/withdrawal history and stale snapshots | Ownership/title and competing claims outside this co-op, surveyed area where required, valid executed instruments and qualified program/methodology review |
| Monitoring | Boundary review and explicit search consent, Copernicus catalogue discovery, field observations, exportable imagery jobs and validated NDVI result import | Authorized real imagery processing, field validation and a monitoring method accepted by the chosen program; screening is not carbon verification |
| Preparation checklist | Record-based partner, parcel, geometry, current consent/rights, assessment, authority and charter checks | Completing preparation records is not carbon eligibility, registry approval or payout authorization |
| Cooperative finance | Frozen electorate, charter voting, integer allocations, holding/settlement/payment/retirement records and separate reviews | Registry/verifier approval, genuine issued holdings, authenticated custody, reconciled proceeds and authorized payment execution; direct registry/payment integrations are absent |
| Agents / MCP | Local stdio public/planning tools; hosted Streamable HTTP, scoped private reads and bounded member commands; real SDK handshakes, permission/revocation/isolation tests; live hosted handshake, private read and bounded write | Supported bearer-token client setup with consented member data; OAuth-only clients are unsupported |
| Single-server hosting | Linux Docker production build deployed behind Caddy HTTPS; existing SQL/state routes backed by SQLite and private disk evidence; daily local backup timer; staging and production restore checks; initial matching offhost archive | Final release/restart evidence in the deployment receipt; recurring encrypted offsite backups, recovery-key custody and operator rehearsal |
| iOS | Production service address, Keychain device token, authenticated co-op list/detail, member posts and explicit field-draft submission with retry protection; offline journal/manual export retained; macOS CI native tests and unsigned simulator build passed | Physical-device/accessibility testing, Apple team/signing and authorized TestFlight/App Store distribution |

See [pooling safeguards](POOLING_SAFEGUARDS.md), [the operator guide](../self-hosted/README.md), [MCP documentation](../mcp/README.md) and [native acceptance requirements](../ios/README.md).

## Validation receipt

Verified for the September 19, 2026 implementation candidate:

- The latest completed JavaScript suite reported **100 passing tests**, including self-hosted authentication/storage, pooling safeguards and real SDK MCP tests.
- The self-hosted production build and local three-account acceptance runner passed. It checked invitation approval, a member post, duplicate requests/version conflicts, outsider denial, forged identity/origin rejection, private file upload/download, app-token read scope and revocation, archival and synthetic-account closure.
- Full-project lint (zero diagnostics) and TypeScript checks passed after the accessibility, React lifecycle and shared-contract type fixes. [CI run 35454137711](https://github.com/jdhart81/verge-common/actions/runs/35454137711) passed all web, imagery and iOS jobs for the pushed candidate.
- macOS CI passed the native test suite and unsigned iPhone/iPad simulator build. A simulator compile is not physical-device acceptance or Apple distribution.
- The Linux Docker image was built and deployed to the dedicated VergeCommon server. The same three-account runner then passed against `https://vergecommon.com`, including real hosted MCP initialization, private reads, a bounded write, denied financial commands and encoded-path scope-bypass rejection. Synthetic workspaces were archived and the three synthetic login accounts were closed.
- The daily local backup timer is active. Staging and production snapshots passed isolated database integrity, relational and evidence-file checks. An initial production archive was copied offhost and its checksum matched. See the deployment record for exact receipts; recurring encrypted offsite backups are not configured yet.
- No real nonprofit affiliation, issued credit, sale, payout or environmental outcome was created or verified by these tests.

Run the commands in the operator guide on the exact candidate revision. A unit test pass or reachable health endpoint cannot substitute for a working production account, permission boundary, evidence download and recovery check.

## Release boundary

The former missing self-hosted runtime, native authentication and remote MCP implementation gaps now have implementations. The shared website and hosted MCP are deployed and their live automated acceptance checks pass. This qualifies an early technical pilot, not a claim that every real-world operational or financial workflow has been completed. Apple distribution, ongoing offsite recovery, participant acceptance and external nonprofit/program/registry/payment actions remain independent requirements.

Partnership records remain steward-only and are omitted from public discovery. Legacy area-only assessments, unscoped agreements and missing consent snapshots do not satisfy current preparation checks. Replace them through current review workflows; no automatic consent, affiliation, rights or execution backfill is performed. Historical records remain available, with stale-state warnings where applicable. A new issued-holding record requires current parcel safeguards and externally supplied supporting references; the software does not issue the holding.
