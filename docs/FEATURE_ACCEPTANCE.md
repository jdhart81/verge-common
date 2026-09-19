# Launch acceptance — September 19, 2026

## Target

A conservation social network where neighbors organize a co-op, document distinct land contributions, work with a consenting conservation nonprofit, prepare a compatible carbon pathway for external review, and maintain transparent records of externally issued holdings, proceeds, and member allocations. No claim of being the first such project is established.

This document records the implementation candidate and local acceptance evidence. It does not assert that every listed feature is already serving production traffic. Keep the final source revision, deployed image, public smoke checks, backup/restore receipt and CI results with the release record.

## Current implementation

| Flow | Implemented and checked | Remaining acceptance or external requirement |
| --- | --- | --- |
| Accounts and access | Self-hosted username/password gateway; salted password hashes, secure browser sessions, recovery codes, account export/closure, expiring revocable device/agent tokens; independent-account local acceptance | Verify the exact deployed release and canonical HTTPS behavior; operator recovery/incident procedures; email verification/reset, OAuth and MFA are not included |
| Neighborhood community | Membership/roles, private invitations, project updates, events/RSVP capacity, discussions and moderation; domain tests and local multi-account participation | Real activity, accessibility/device acceptance and sustained return participation; public production smoke receipt |
| Nonprofit involvement | Self-reported organizer profiles, private project-specific partnership/evidence records, separate steward review and revocation | Actual nonprofit consent and qualified review of its role; a software review is not independently verified affiliation |
| Land pooling | Reviewed parcels/boundaries, geodesic area estimates, area-mismatch and overlap checks, parcel-specific consent, explicit agreement coverage, revocation/withdrawal history and stale snapshots | Ownership/title and competing claims outside this co-op, surveyed area where required, valid executed instruments and qualified program/methodology review |
| Monitoring | Boundary review and explicit search consent, Copernicus catalogue discovery, field observations, exportable imagery jobs and validated NDVI result import | Authorized real imagery processing, field validation and a monitoring method accepted by the chosen program; screening is not carbon verification |
| Preparation checklist | Record-based partner, parcel, geometry, current consent/rights, assessment, authority and charter checks | Completing preparation records is not carbon eligibility, registry approval or payout authorization |
| Cooperative finance | Frozen electorate, charter voting, integer allocations, holding/settlement/payment/retirement records and separate reviews | Registry/verifier approval, genuine issued holdings, authenticated custody, reconciled proceeds and authorized payment execution; direct registry/payment integrations are absent |
| Agents / MCP | Local stdio public/planning tools; hosted Streamable HTTP, scoped private reads and bounded member commands; real SDK handshakes, permission/revocation/isolation tests | Production MCP connectivity with a supported bearer-token client and consented member data; OAuth-only clients are unsupported |
| Single-server hosting | Node production build; existing SQL/state routes backed by SQLite and private disk evidence; authenticated gateway, Caddy/Docker configuration, backup snapshots and isolated restore verifier | Deployed-image/public access receipt, persistent mounts/restart check, actual scheduled backups, offsite encryption/key custody and successful recovery rehearsal |
| iOS | Production service address, Keychain device token, authenticated co-op list/detail, member posts and explicit field-draft submission with retry protection; offline journal/manual export retained | Final macOS CI/XCTest and simulator build, physical-device/accessibility testing, Apple team/signing and authorized TestFlight/App Store distribution |

See [pooling safeguards](POOLING_SAFEGUARDS.md), [the operator guide](../self-hosted/README.md), [MCP documentation](../mcp/README.md) and [native acceptance requirements](../ios/README.md).

## Local validation receipt

At this documentation checkpoint:

- The latest completed JavaScript suite reported **100 passing tests**, including self-hosted authentication/storage, pooling safeguards and real SDK MCP tests.
- The self-hosted production build and local three-account acceptance runner passed. It checked invitation approval, a member post, duplicate requests/version conflicts, outsider denial, forged identity/origin rejection, private file upload/download, app-token read scope and revocation, archival and synthetic-account closure.
- Full-project lint and TypeScript checks passed after the accessibility, React lifecycle and shared-contract type fixes. Hosted CI and the final deployed-image checks remain part of the release receipt.
- Native core sources compiled. Eight native networking/command scenarios passed a standalone local smoke runner; that run is not XCTest or a device session. Local Xcode required license acceptance by the account holder, and the standalone Command Line Tools lacked XCTest. The macOS CI job must validate the actual test suite and simulator build.
- Synthetic acceptance data stayed on isolated local services. No real co-op, nonprofit affiliation, issued credit, sale, payout or environmental outcome was created or verified by these tests.

Run the commands in the operator guide on the exact candidate revision. A unit test pass or reachable health endpoint cannot substitute for a working production account, permission boundary, evidence download and recovery check.

## Release boundary

The former missing self-hosted runtime, native authentication and remote MCP implementation gaps now have source implementations. Final deployment qualification is a separate, evidence-bearing step; local checks alone do not establish public availability. Apple distribution and external nonprofit/program/registry/payment actions remain independent requirements even after web deployment.

Partnership records remain steward-only and are omitted from public discovery. Legacy area-only assessments, unscoped agreements and missing consent snapshots do not satisfy current preparation checks. Replace them through current review workflows; no automatic consent, affiliation, rights or execution backfill is performed. Historical records remain available, with stale-state warnings where applicable. A new issued-holding record requires current parcel safeguards and externally supplied supporting references; the software does not issue the holding.
