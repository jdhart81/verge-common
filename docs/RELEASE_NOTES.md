# v0.3 — shared conservation network and co-op operating records

Adds D1-backed shared workspaces and R2 private files; sign-in and role checks; membership, discovery, projects, actions, private land/consent records, agreement and evidence review, governance, external authority/holding/settlement/retirement records, exact allocations, payment receipt review, audit history, export, removal and archival.

Validation: 27 domain tests, type checking and the Worker build passed. Local HTTP integration verified durable readback, idempotent retries, payload mismatch protection, stale/concurrent-write rejection, origin rejection, private discovery, linked audit, R2 upload/download, file digest matching, evidence attachment and archival. Browser visual/interaction QA and independent security review have not been performed. Multi-person permissions are covered by domain tests; the local HTTP test uses the starter's single development identity.

The deployed audience remains owner-only pending explicit public-access approval. No real co-op, legal instrument, credit, transaction or environmental outcome was created as part of testing. External documents/transactions are recorded and reviewed by stewards, not independently authenticated through registry/bank integrations.

---

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

## 0.4.0 — Local circles, worldwide scope

Added guided setup, self-reported organization profiles and regional discovery links, expiring single-use private invitations, reviewed-parcel pathway snapshots, payout illustrations, currency-specific integer minor units, country settings, and area-unit intake. Added `npm run launch` for a local trial. Existing databases require no schema migration; older co-ops default to USD and missing new collections are treated as empty. Website access remains controlled separately by the host. See WORLDWIDE.md for remaining translation and production-hosting limits.

## 0.5.0 — Participation and moderation

Added the member community board, timed events with private meeting instructions, capacity-aware RSVPs, Unicode-safe calendar downloads, member-only discussion replies, reports, and independent steward review of reported content. Public event summaries respect event/project/co-op visibility. Cancelled events reject further responses. Existing JSON records remain compatible without a schema migration. Local launch remains a trial workflow; production access is still separately controlled.

## 0.6.0 — Parcel monitoring foundation

Added private GeoJSON boundary versions and outlines, independent boundary review, revocable consent for catalogue queries, a live Copernicus Sentinel-2 L2A discovery connector, source receipts, and independently reviewed field observations. New boundary versions require review before further monitoring. No imagery processing, automated alerts, vegetation-change calculation, carbon estimation, or credit issuance is implemented by this connector. Existing database schema remains unchanged.

## 0.7.0 — Reproducible imagery screening

Added immutable two-scene processing jobs, private job export, an independently runnable Python NDVI worker, input/source fingerprints, conservative SCL masking, paired-pixel comparisons, insufficient-coverage handling, validated result imports, and independent steward review notes. Added synthetic raster tests and a separate CI job. Prepared imagery is still required; no provider download, background processing, carbon quantification, or market action is enabled.

## After 0.7.0 — Experimental authorized imagery retrieval

Added an operator-run CDSE OData adapter for exact selected bands, catalog checksum/size verification, local parcel cropping, explicit radiometry, and automatic screening-receipt generation. Tokens remain in the operator environment. Downloads are bounded and require an explicit flag. Synthetic end-to-end and failure tests run in CI. Authenticated provider downloads remain unvalidated pending operator credentials; the hosted application and access settings are unchanged.

## Native field-journal release candidate

Added an iOS 17+ SwiftUI field journal, protected atomic local saves, JSON export, delete confirmation and browser links to the community. Added an explicit preview-and-fill field-draft importer to Monitoring. Existing server permissions and independent steward review remain in force. Native build/tests and website validation are separate from physical-device acceptance, signing and TestFlight distribution. No production deployment is included in this candidate.
