# Launch acceptance — September 19, 2026

## Target

A conservation social network where neighbors organize a co-op, document distinct land contributions, work with a consenting conservation nonprofit, prepare a compatible carbon pathway for external review, and maintain transparent records of externally issued holdings, proceeds, and member allocations. No claim of being the first such project is established.

## Current evidence

| Flow | Implemented and checked | Remaining launch requirement |
| --- | --- | --- |
| Neighborhood community | Membership/roles, private invitations, project updates, events/RSVP capacity, discussions, moderation; automated domain coverage | Two real independent accounts on the intended production host; real activity and return participation |
| Nonprofit involvement | Public self-reported organizer profiles; new private project-specific agreement/evidence records, separate steward review, revocation | Actual nonprofit consent and qualified review of its role; software review is not independent affiliation verification |
| Land pooling | Reviewed parcel intake, versioned boundaries, project-level assessment, current snapshot checks | Parcel ownership/consent verification, overlap/area analysis, explicit parcel-level rights coverage, selected program and methodology |
| Monitoring | Boundary review, catalogue discovery, observations, external imagery result import | Authorized real imagery retrieval, field validation and accepted monitoring method |
| Preparation checklist | Ten record-based checks for members, partner, parcels, boundaries, current assessment, area threshold, agreements, legal authority, and charter | Checklist completion is preparation for external review, not carbon eligibility or payout authorization |
| Cooperative finance | Frozen electorate, charter votes, integer allocations, holding/settlement/payment/retirement records and separate reviews | Registry/verifier approval, genuine issued holdings, reconciled proceeds, authorized banking/payment arrangements |
| Agents / MCP | Stdio server, five public-read/local-planning tools, schema validation, bounded GET requests, no forwarded credentials, real SDK client tests | Production discovery availability; remote HTTP transport and scoped authenticated tools remain unimplemented |
| DigitalOcean hosting | Dedicated droplet provision requested in this task | Finish SSH setup, replace Cloudflare D1/R2 runtime dependencies and Sites identity or select an explicitly supported architecture, rehearse backups/restore, DNS/TLS, access tests |
| iOS | Native public discovery and local field drafts | Authenticated native participation and distribution remain outside the completed implementation |

## Validation receipt

- 61 automated tests passed, including eight new partnership, snapshot/readiness, and MCP tests.
- Type checking and production build passed.
- Local HTTP integration passed: durable reads/writes, retries, conflict handling, cross-origin rejection, public/private separation, files, evidence attachment, and archival.
- New MCP/readiness modules and tests pass targeted lint.
- Browser walkthrough created a synthetic private workspace and project and verified the new pooling checklist and partner form.
- Full-project lint baseline reports 147 errors; it is not a clean launch gate.
- No real co-op, nonprofit affiliation, issued credit, sale, payout, or environmental outcome was created or verified by these tests.

## Release decision

**Not ready for unrestricted public application launch.** This branch is a testable implementation increment. The immediate software blocker is the production runtime/authentication migration for the dedicated droplet. Operational review, two-account production testing, backup recovery, rate limiting, and the remaining lint/UI debt follow. Program, nonprofit and legal/financial external decisions must be supplied by authorized people and cannot be manufactured by the application.

The new partnership records are steward-only and never included in public discovery. Legacy assessments without snapshots must be replaced before approval. Existing reviewed assessments remain historical records, with an explicit warning when they no longer match the current parcel/boundary snapshot. No data migration or issued-record rewrite is performed.
