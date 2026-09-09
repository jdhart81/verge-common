# v0.2 — cooperative conservation workbench

The primary product is now the operating system for EcoHedge and larger-parcel conservation co-ops. This release adds an editable project/member scenario, compatible-scope checks, exact reserve and payout modeling, draft packet export, and open enrollment/easement/payout-policy workflows.

Validation: 15 automated tests and type checking passed; the static production build succeeded for `/`, `/coop/`, and `/demo/`. Tests cover oversales, incompatible scopes, invalid or unsafe inputs, duplicate IDs, reserve rounding, deterministic member cents, and explicit non-issued/non-paid draft exports. Browser visual and interaction testing was not performed.

Production capabilities remain unimplemented: authenticated shared records, executed legal instruments, verified carbon issuance, custody ledger, live payment processing, and reconciliation. This is a functional modeling foundation with documented implementation milestones, not an operating financial co-op.

---

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
