# Roadmap

## Implemented foundation and current candidate

- Public conservation discovery and self-reported organization profiles; private co-ops and expiring invitations.
- Guided setup, country/currency settings, land-unit conversion, and local trial launcher.
- Community events, capacity-aware RSVPs, calendar downloads, discussions, reports, and steward moderation.
- Private parcels, consent references, agreement/evidence review, and pooling-assessment snapshots.
- Reviewed GeoJSON boundary versions, live satellite-scene discovery with consent, source receipts, and field observations.
- Boundary mapping: optional MapLibre/OpenFreeMap basemap, boundary drawing and corner editing, undo/redo, bounded GeoJSON imports/exports, and reuse of historical geometry through the existing review workflow.
- Charter proposals and member voting, exact allocations, independently reviewed external credit/payment records, and stewardship/treasury receipts with allocation reconciliation.
- Automatic foreground browser refresh, independently actionable monitoring/financial review queues, and native discussion replies with protected exact retries.
- Audit history, scoped exports, membership removal, and archival.

The [19 September launch candidate](docs/LAUNCH_BUILD_2026-09-19.md) additionally implements same-tab invitation continuity, safe upload discard/expiry/retry, current setup indicators, an independent operator report queue with private receipts, event editing/calendar revisions, pending-work notices, a private steward parcel overview, public directory search with stable pagination, and native calendar-date/reporting/search improvements. Candidate implementation is not a deployment or Apple distribution receipt. No real partner adoption or verified environmental impact is claimed.

## 1. Prove one complete local participation loop

Recruit one consenting organizer and a small real group. Use two stewards, create a project, approve invited members, hold one useful activity, and record what happened. Run the [pilot acceptance checklist](docs/PILOT.md). Measure actual return participation rather than impressions or invitations alone. Outreach requires the owner's approval; the software does not send invitations automatically.

**Exit evidence:** real members can join, understand privacy, respond, complete useful work, and return for a second activity. Problems are recorded and resolved.

## 2. Establish launch safety and operations

- Independent authentication/authorization review and multi-person browser/accessibility testing.
- Backup and restoration rehearsal covering database records and private files.
- Exercise implemented account erasure, incident procedures, operator-level report escalation and rate limits with the responsible humans. Establish retention periods, coverage and response expectations.
- Resolve the paused offhost-transfer authorization and independently secured recovery-key custody; test notification delivery without treating source tooling as active monitoring.
- Verify public account sign-in and obtain explicit approval for the hosted website's public audience.

**Exit evidence:** reviewed access boundaries, a successful restore, accountable operators, and an approved launch audience. The current bounded JSON store is a pilot architecture, not a proven global-scale service.

## 3. Make worldwide participation practical

- Extract all interface text into translation catalogs; recruit native-language reviewers and test right-to-left layouts.
- Low-bandwidth mobile design and accessibility testing with real participants.
- Expand implemented public co-op text search and stable pagination as pilot use requires; add opt-in geographic filtering and independently verified organization claims. A named member can accept a partner invitation with authority evidence and independent review. Organization-managed accounts, consented document sharing and independent affiliation verification remain to build.
- Replace the bounded co-op JSON aggregate with scalable storage while preserving audit and transaction rules.
- Document regional hosting/data-residency options and provide a production deployment installer with trusted identity configuration.

**Exit evidence:** a second independent community in a different country completes the participation loop in its preferred language. Currency support alone does not establish worldwide readiness.

## 4. Validate a real conservation and carbon pathway

Choose a real jurisdiction, legal structure, easement or tenure arrangement, and applicable methodology with qualified local reviewers. Confirm rights and consent, non-overlapping boundaries, monitoring obligations, external validation, and registry records. A pooled area total is not eligibility certification.

**Exit evidence:** independently documented authority and a validated pathway; no financial or environmental claim from a software checklist alone.

## 5. Connect verified external transactions

Registry provenance and cross-co-op serial reconciliation; authenticated settlement/payment receipts; governed payment execution; geospatial evidence and monitoring integrations. Select providers only for a real partner's requirements. New financial execution requires explicit authorization and provider controls.

**Exit evidence:** externally reconciled records and demonstrated controls. Reviewed input is distinct from independently authenticated money movement.

## Next conservation-care increment

Add structured obligations and disturbance/reversal cases tied to projects, parcels, due dates, responsible members, supporting evidence and independent closure. Generic shared tasks and observations do not yet enforce this continuing loop. See the [service coverage audit](docs/SERVICE_COVERAGE.md).

## Next monitoring increment

A separately runnable paired-NDVI worker and import/review workflow are now implemented. An experimental operator-run CDSE download adapter now retrieves selected bands and prepares local crops. Next: validate authenticated retrieval with an authorized operator, then repeatable orchestration, stronger provenance, statistical uncertainty, and field-validation links. The website itself still discovers catalogue metadata and imports worker results; it does not run imagery jobs. Select the first real monitored parcel and methodology before presenting ecological or carbon conclusions. The supported single-ring dataset already has geodesic area and within-co-op overlap checks. Complex polygons, antimeridian support and authoritative cross-installation/cadastral checks remain before broader geospatial intake.
