# v0.1 release notes

First public community edition, September 8, 2026.

## Included

Project homepage, device-local place planner, action checklist, notes, JSON download, invitation copying, contribution and privacy documentation, and continuous integration checks.

## Validation

- Four automated tests passed: plan round trip, invitation privacy, invalid data handling, and immutable action creation.
- Type checking and static production build passed for the homepage and planner.
- The dependency audit reported zero known vulnerabilities after targeted updates and overrides.
- The homepage returned HTTP 200 in the local preview.
- No browser visual or end-to-end interaction testing was performed in this release session.
- The optional read-only WebMCP tool is feature-detected. A supported WebMCP validation context was unavailable; registration and execution are not verified.

## Boundaries

The site does not run a shared network, authenticate users, verify observations, process money, or issue credits. Invitations are text copies, not links to a shared plan. JSON restoration is future work. There are no claims of active users, adoption, or ecological outcomes.

Keep transitive dependency overrides under review when upgrading the starter. The static output does not use Cloudflare runtime bindings. Node 22+ is required for development.
