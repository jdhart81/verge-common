# Release notes

## v0.11.0 — corridor layer limit set from the production server's speed (release branch on production 4f1b54a)

Production `4f1b54a` plus only PR #102 from `main`.

- **Corridor layers: 150 KB per version** (about 6,000 corners), down from the 300 KB released an hour earlier and up from the original 90 KB. Layer history: 450 KB.
- **Why.** The 300 KB figure came from a development machine. Measured on the production server itself, analyses run about three times slower: the slowest took 28 s at 264 KB, past the 25 s deadline, and 17 s at 142 KB. The only layers over 150 KB stored in between are in the release's own test co-op, which is archived with its two throwaway accounts deleted.
- Everything else from the previous release stands: the separate corridor storage budget, short refreshes, saves from a page that is behind, and queued saves.

## v0.11.0 — room for real corridor maps, and saves that hold up under load (release branch on production 6ce4f08)

Production `6ce4f08` plus only PR #101 from `main`.

- **Corridor layers may be 300 KB per version, up from 90 KB** (about 12,000 corners instead of 3,500). The limit is set by analysis time: the slowest analysis takes about 10 s at that size against a 25 s deadline.
- **Corridor records have their own storage budget.** Layers, treatment plans and corridor uses count against 2 MB (hard limit 2.5 MB) and no longer consume the co-op's general 650 KB. A co-op without corridor records is measured exactly as before.
- **Layer history is bounded by bytes as well as by count:** 900 KB of geometry across a project's versions. Older superseded versions keep their record and drop their geometry; the reviewed version always keeps its own.
- **Only saving layers may send a large request** (900 KB). Every other command stays under 100 KB.
- **An idle co-op page no longer re-downloads the co-op every 30 seconds.** The refresh says which version it holds and gets a short answer when nothing changed.
- **A save from a page that is behind no longer fails** for commands that only add the sender's own record: an update, a comment, an RSVP, a report, a parcel, a vote. Reviews, approvals and every change to an existing record still need the version the sender saw.
- **Simultaneous saves are queued per co-op.** Thirty members posting at the same instant are all saved in 3 s with no conflict shown; before, it took 17 s.
- **A save costs half as much** on a co-op with large layers: storage is measured in one pass.
- See the [load and failure test](history/LOAD_TEST_2026-11-16.md).
- Rollback note: the previous build measures a co-op against the single 750 KB limit. After a rollback, a co-op holding more corridor geometry than that would show as full until this build is restored.

## v0.11.0 — corridor progress: every woodlot a node (release branch on production 6457d84)

Production `6457d84` plus only PR #99 from `main`.

- **Corridor progress leads the Woodland tab.** It states the aim (one old-growth corridor that branches along streams, valleys and ridges, joined one woodlot at a time) and shows five ordered steps with the next one marked: map the corridor, trace the branches, record the woodlots, owners join, the corridor is whole.
- **Each woodlot is a node.** A member sees their own woodlots with what each needs next (a boundary, a review, or the owner's consent) and whether the mapped corridor touches it. Stewards see every woodlot. Other members see counts only, never a neighbour's woodlot (CP2, as WS8).
- **Joined means what the engine counts:** a reviewed woodlot with a reviewed boundary and the owner's current reviewed consent.
- **The rest of the app points at the corridor.** A line above the tabs says how many woodlots have joined and the next step, with one button to the Woodland tab. In a woodland project the Parcels tab calls a parcel a woodlot, says what it needs next at every state, and the consent form reads “Join the corridor: record the owner’s consent for this woodlot”. Each woodlot in corridor progress has a button to its own next step. Other project kinds keep the pooling wording.
- Read-only and derived for each view; nothing new is stored, and no analysis runs. "Touches" compares maps only: it does not establish species movement, genetics, regulatory compliance or old-growth condition.

## v0.11.0 — easier first day for a new co-op (release branch on production f91cea0)

Production `f91cea0` plus only these changes from `main` (#96, #97). Found by walking the whole app as a new customer on the live build (15 November 2026).

- **Everyday tabs first.** A co-op opens on nine tabs: Community, Get started, Projects, Woodland corridors, Parcels, Map & monitor, Evidence, Care & participation and Members. Organizations, Land pooling, Agreements, Governance, Records ledger, History and Settings sit behind one “More” link and open by themselves when a step or a pending item leads there. Nothing is removed.
- **Get started follows the corridor.** A co-op with a woodland project gets a “Map the corridor” step. The carbon pathway and benefit-sharing steps are marked as later and optional. Buttons use the tab names.
- **The parcel map opens on the land.** When a parcel has a saved boundary, the background map opens on it and draws it as a dashed outline, and “Fit boundary” returns to it. Before, the map opened on the whole world.
- **An organization profile no longer needs a website.** A website, when given, must still be HTTPS.
- **Votes say what happens next.** When everyone has voted, members see that a steward records the result and stewards see “Close and tally” highlighted. The voting rules are unchanged: a member can change a vote until a steward closes it.
- **The opening page links to woodland corridors** beside the first buttons, not only in the footer.
- **A new parcel's map opens near the co-op's other land.** When the parcel has no boundary yet, the map starts at another boundary the viewer can already see instead of the whole world. No new map provider is contacted.
- **A woodland project with no layers says how to get them:** draw them, upload a Landscape Package from the DFM mapping workspace, or ask a forester for GIS layers.

## v0.11.0 — uses, facts and edge bands along the corridor; the corridor story (release branch on production 12e0fec)

Production `12e0fec` plus only these changes from `main` (#90, #91, #92). Woodland projects stay behind `VERGE_WOODLAND_DFM`.

- **Natural corridor is the default.** A co-op can adopt a shared recreation use on a mapped stretch (walking, bike, ski or motorized trail, disc golf, sugaring lines, forest farming). It needs a corridor that still holds with the ground cleared, the agreement of every holder whose woodlot it crosses, and a co-op vote. No override.
- **Facts are recorded, not decided.** A steward records a right-of-way or a blowdown with its source and another steward reviews it. A right-of-way is recorded even when it breaks a link, and its cleared ground stops counting as forest. A blowdown stays corridor.
- **Agroforestry beside the corridor.** A woodlot's holder can plant an edge band of native tree crops on their own field. A band may not overlap retained forest and never counts as corridor or old growth. The corridor itself is never farmed.
- **Corridor map.** The Woodland tab shows uses, facts and bands over the reviewed layers, and members draw routes and areas there.
- **Opening page.** The landscape tells the corridor story in six captioned scenes, with a pause control and a still view for reduced motion. English only on this branch; the Hindi captions ship with the Hindi home page.
- Projects with no adopted use, reviewed fact or band store, check and project exactly as before. `PRIVACY.md` describes the new records. Details: [woodland guide](WOODLAND.md#recreation-along-the-corridor).

## v0.11.0 — native old growth (dfm-core 0.3.0; release branch on production 7541560)

The old-growth corridor is now the lead of woodland projects, and the engine behind it moves to dfm-core 0.3.0. Woodland projects stay off unless the operator sets `VERGE_WOODLAND_DFM=1`. No deployment is part of this change.

- **Engine:** `vendor/viridis-dfm-core-0.3.0.tgz` replaces the 0.2.0 tarball; it is the `npm pack` of hdfm-framework `packages/dfm-core` 0.3.0, and a test pins its SHA-256. Engine names in new results are `dfm-connectivity-0.3.0`, `dfm-spine-0.3.0` and `dfm-outlook-0.3.0`.
- **A plantation is never projected as old growth.** Retained corridors and core areas can record how the stand was established (naturally regenerating, planted, or plantation), whether it was never plowed or clear-cut, and its share in native species, each with its source. A plantation never counts at old-growth age whatever its age; a remnant counts in every year; with a minimum native share, a stand of mostly introduced species does not count. The outlook shows how much committed forest is plantation or below the native share.
- **A corridor is never replanted with introduced species.** A corridor-permitted restoration planting can list its species; it stays permitted only when every species is native and a native-status source is recorded. Once the layers record a native-status source, every corridor planting must list its species. Otherwise the check treats the planting like a harvest and names it.
- **Nothing stored changes meaning.** Layers, settings and units without the new records are stored as before and give the results 0.2.0 gave, apart from the engine names; a test compares every spine analysis and the corridor check with results recorded under 0.2.0. Remnant status, which uploads used to leave out, is now kept.
- **Words:** the README, the [woodland page](https://vergecommon.com/woodland/) and the [woodland guide](WOODLAND.md) lead with the old-growth corridor. The caveat is unchanged: structural connectivity only; not a claim about species movement, genetics, regulatory compliance or old-growth condition. Age is reported, never condition.

## v0.11.0 — agent call counts and answer receipts (hotfix on production 5d1a276)

- `/mcp` usage is counted per UTC day (requests, initialize, tools/list, calls per tool, errors, rate-limited, anonymous vs token) and served at `GET /mcp/stats` for the last 30 days. Counts only: no IPs, tokens, arguments or results are stored; distinct clients use a keyed hash with a daily in-memory salt. `VERGE_MCP_STATS=0` turns it off.
- Every successful public tool answer carries a `source` receipt (name, url, license, version) and `check_or_start_your_own`, a vergecommon.com page. The discovery tools' old top-level `source` string is now `source.retrieved_from`.
- Built on the running hotfix `5d1a276` with only these two changes, so nothing else merged on main ships with it.

## v0.10.0 — woodland corridors and the old-growth spine (deployed 4 October 2026, 22:03 UTC; woodland projects off)

Everything merged after v0.9.0, plus the spine integration. Woodland projects stay off unless the operator sets `VERGE_WOODLAND_DFM=1`.

- **Woodland projects** ([PR #33](https://github.com/jdhart81/verge-common/pull/33), [PR #37](https://github.com/jdhart81/verge-common/pull/37)): corridor layers reviewed by a second steward; every treatment plan checked by the open-source DFM engine and blocked if it breaks a link between core areas, with a recorded override vote; drawing, import and local/server previews.
- **The old-growth spine** (dfm-core 0.2.0, byte-identical to the published package, including the network soundness fix from hdfm-framework #44; the corridor check's results are unchanged, under the engine name `dfm-connectivity-0.2.0`, except that four upkeep treatments are now permitted light treatments with a reason: prescribed burn, prescribed grazing, late-season mowing and brush management): optional stream and ridge/valley/saddle lines, spine settings with sources, **Draft spine corridors**, and four analyses: network robustness, the years ahead from consent and stand ages, climate routes, and the next woodlots whose consent would complete a link. Planned join years model the build-out without standing in for consent. Members other than stewards see only the woodlots they recorded, project only with their own planned years, and see the build-out as a co-op total. See [woodland projects](WOODLAND.md).
- **Engine work off the request thread:** spine analyses, plan previews (browser and MCP) and the check on a submitted plan all run in one server worker thread with a 25-second deadline, one job per account at a time, and per-account budgets shared by the browser and agents (12 analyses and 30 previews per 10 minutes, 60 worker jobs in all). A submission is validated before any engine work and uses the worker's result only for exactly the input the command builds. Agent commands now share the browser's per-account command budget.
- **Consent privacy in analyses:** only stewards apply a treatment plan to the outlook or build-out, so a member cannot probe where neighbours have consented.
- **Interoperability with Dendritic Forest Management:** the check input is the Landscape Package's canonical form, so a steward's **Download check inputs** reproduces a stored plan result and its checksum with the open-source engine (for checks made from v0.10.0 on, which say so); packages from the DFM workspace import with names kept. New public page [/woodland/](https://vergecommon.com/woodland/) links to dendriticforest.com, which links back to it.
- **Agents:** read-only MCP tool `analyze_woodland_spine` beside `check_woodland_plan`, which hosted now runs the co-op's own preview (with woodlot consents, without parcel geometry). Busy and time-out answers reach agents as written.
- **Privacy and recovery:** account erasure now covers woodland plans, layer notes and override reasons; a plan another member reviewed or voted on keeps an inert, pseudonymous record of that decision. The rollback guard refuses writers older than v0.10.0 once woodland records exist. Reviewers write their own review notes on layers and plans.
- **Pilot readiness** ([PR #35](https://github.com/jdhart81/verge-common/pull/35)): fail-closed readiness report, recovery and operator rehearsal kit, missing-ledger and rollback guards, truthful event and urgent-contact copy.
- **DFM site on this server** ([PR #34](https://github.com/jdhart81/verge-common/pull/34), [PR #38](https://github.com/jdhart81/verge-common/pull/38)): additive Caddy runbook for dendriticforest.com; footers link the woodland page.
- `/healthz` reports the version from `package.json` (now 0.10.0). The launch gate also checks `/woodland/`.

Validation before deployment: see the pull request. CI runs the woodland acceptance (`tests/woodland_acceptance.py`) inside the production image with the flag on. Deployment receipt: [history/DEPLOYMENT_V0100_2026-10-04.md](history/DEPLOYMENT_V0100_2026-10-04.md).

## v0.9.0 — participation and continuing care (29 September 2026)

- Individual public project, event and progress pages with social metadata, native share/copy fallback and QR codes. Shared-link source codes are explained at joining and retained privately; no tracking cookies or external analytics.
- Activity context survives sign-in and membership approval; approved members open the relevant event. Private invitation recipients can preview an already-public co-op without exposing its bearer secret.
- Organizers record actual attendance and completed work after the event. Another steward reviews the record, then publication requires a separate public preview/confirmation and can be withdrawn.
- Private care and disturbance commitments include responsible members, dates, recurrence, evidence-backed independent completion and histories. Account erasure removes affected records and invalidates unsupported closure.
- Opt-in encrypted browser reminders for approvals, replies, subscribed event changes and assigned due care, with batched/weekly modes, unsubscribe and a test button. Provider acceptance is not proof of device display. No reminder email is sent.
- Steward participation reports exclude founder, test and unclassified memberships; measure recorded/confirmed contribution, later-week repeats and contributing participants from shared links. Visitors, off-platform shares and causal virality remain unmeasured.
- Compatible patched development/network dependencies; clean npm security audit reports zero known vulnerabilities. Package/health version is now 0.9.0.
- Recovery guard prevents older executables from writing new participation data without the current privacy/erasure rules. See the operator guide before rollback.


## Pollinator grassland conservation — deployed September 20, 2026 UTC

Added **Grassland & meadow (pollinators)** to co-op project creation and the cooperative planner. The saved project kind is `grassland`, supported by the workspace API and MCP agent tools. Existing privacy, independent review and pooling-scope rules continue to apply; selecting a habitat type does not calculate carbon benefits or establish credit eligibility. Homepage and discovery copy now include pollinator meadows.

Validation: 39 focused network/planner/MCP tests, lint, TypeScript, self-hosted build, isolated multi-account HTTP acceptance with a saved grassland project, and browser selection in the planner. Exact-commit CI [35483007673](https://github.com/jdhart81/verge-common/actions/runs/35483007673) passed all four jobs.

Deployed source `9c39c14e55a47c990b65e00769346069c6bf0b21` at approximately 02:06 UTC. Image: `sha256:31b2b66d51645322366d0cc8103bb9bdcba63bd1a2525b08d3f7bd949aac01f3`. Seven-page/seven-asset checks and an in-memory grassland creation/privacy check passed in the isolated and live images; the public HTTPS planner shows the new option. No production accounts or co-ops were created for this check.

Recovery receipts are in `/opt/vergecommon/deployments/20260920-grassland-9c39c14`. Before-switch backup `/backups/2026-09-20T02-06-11-336Z-806XId` and after-switch backup `/backups/2026-09-20T02-06-15-492Z-iziAKw` both passed restore verification. Current data mounts and the daily backup timer are preserved. The immediately preceding compatible image remains stopped as `vergecommon-pre-grassland-37a53ed`; any rollback preserves the current data and deletion ledger.


## Shared Canopy branding — deployed September 20, 2026 UTC

The approved logo is live across public and member web pages, account screens, browser icons and installable web-app icons. Native Discover/sign-in branding and the iOS app icon are updated in source; the unsigned simulator build passed, with Apple distribution still separate. [Deployment and recovery receipt](history/DEPLOYMENT_BRANDING_2026-09-20.md).

Source `750f7f3` is live at https://vergecommon.com on the dedicated server. The exact image passed an on-server restored-copy migration rehearsal, canonical-hostname health check and full live HTTPS account/co-op/file/native/MCP acceptance. Fresh before/after backups passed isolated restore verification. Existing data and private mounts were preserved; no offhost transfer or Apple submission occurred. See the [deployment receipt](history/DEPLOYMENT_SERVICE_2026-09-20.md). Remaining service and release gaps below still apply; earlier candidate language records its historical checkpoint.

---

# Service follow-through candidate — September 19, 2026

Adds automatic foreground workspace refresh with retained drafts, native private discussion replies with protected explicit retries, a complete monitoring/financial review queue, and external stewardship/treasury receipts with exact allocation reconciliation. Receipt evidence must match its originating project; reviewers can inspect their authorized supporting evidence from each receipt. Independent reviews, budget limits, reference uniqueness, account erasure and capacity pauses remain enforced.

Validation: 226 Node tests, 82 Swift tests, full lint and TypeScript checks, self-hosted build, unsigned simulator compilation, isolated multi-account HTTP acceptance and browser/phone-width walkthrough passed. The fictional rehearsal now covers 110 successful commands and 26 expected denials. See [service build and verification](history/SERVICE_BUILD_2026-09-19.md) and [claim-by-claim coverage](SERVICE_COVERAGE.md). This candidate has not been deployed or submitted to Apple. Continuing conservation obligations, provider transactions, funding activation and release operations remain separate unfinished work.

---

# Conversation actions candidate — September 19, 2026

Community now opens on Discussion with private guided actions for land intake, mapping, explicit pooling consent, evidence, partner participation, agreements, legal authority, governance and external receipts. The same structured forms remain available in workspace tabs. Retained drafts survive closing an action and same-workspace refresh; conflicting edits preserve the draft for review and retry. Voting controls respect the frozen electorate and deadline. Pooling consent requires choosing the confirmation rather than accepting a preselected answer.

Local validation: 210 Node tests, TypeScript, repository lint and the self-hosted build pass. The fictional co-op rehearsal now runs in CI (100 successful commands and 19 expected denials). See [conversation scope and verification](CONVERSATION_ACTIONS.md). This candidate is not a hosted deployment, Apple distribution or registry/payment integration. Earlier entries below describe their historical checkpoints.

---

# Deployed cooperative pilot — September 19, 2026

The shared website is live at https://vergecommon.com on its dedicated server, with self-hosted accounts, private co-ops, durable SQLite/evidence storage, and scoped hosted MCP. Native source now includes authenticated participation. Land preparation adds boundary-area and overlap checks, current parcel consent, explicit agreement coverage, and withdrawal/revocation safeguards.

The implementation candidate `2b73c2d` passed 100 JavaScript tests, full-project lint with zero diagnostics, type checking, and [GitHub web, imagery and iOS checks](https://github.com/jdhart81/verge-common/actions/runs/35454137711). Linux Docker and live HTTPS three-account acceptance passed, including private evidence, token scopes/revocation and actual MCP read/write boundaries. Daily local backups are active; staging and production restore checks passed and an initial matching production archive was copied offhost. See [feature acceptance](FEATURE_ACCEPTANCE.md) and the [deployment receipt](history/DEPLOYMENT_2026-09-19.md) for final release identifiers and limits.

The source remains on the launch branch under [PR #2](https://github.com/jdhart81/verge-common/pull/2). Real participant acceptance, recurring encrypted offsite recovery, Apple signing/distribution and external nonprofit, carbon registry, sale and payment requirements remain separate. Historical entries below describe their checkpoints and are not the current deployment status.

---

# Local candidate — partner preparation and agent MCP (September 19, 2026)

Adds private project-specific conservation partnership records with reviewed evidence, independent approval, and revocation. Adds a preparation checklist and versioned parcel/boundary snapshots: changed land records prevent approval of an outdated assessment. Adds a stdio MCP server with public co-op discovery and local hypothetical pooling/allocation tools, without private access or financial execution.

61 automated tests, type checking, production build, local HTTP integration, and new-module targeted lint passed. Browser walkthrough verified a synthetic workspace/project, checklist, and partner form. Full-project lint has 147 existing errors. See [feature acceptance and remaining launch requirements](FEATURE_ACCEPTANCE.md) and [MCP setup](../mcp/README.md). This candidate does not complete DigitalOcean migration, production authentication, external carbon approval, or payment execution.

---

# Launch branch preparation — September 17, 2026

The launch branch includes the previously local private parcel mapping commit plus contributor onboarding and mission-led homepage updates. GitHub repository visibility was verified public. Private vulnerability reporting is now enabled and SECURITY.md links directly to it. CI now checks launch-page lint, applies job timeouts, and fails explicitly when the integration server cannot start.

Local validation: 53 tests, type checking, targeted homepage/layout lint, and the production build passed on Node 24.19.0. Existing desktop/mobile browser checks are recorded below. GitHub CI is the release gate for clean installation, HTTP integration, imagery tests, Swift tests, and unsigned simulator compilation of the complete branch. Repository-wide lint has pre-existing debt and is not claimed clean. Public hosted access, independent security review, confidential conduct contact, and real pilot evidence remain separate open items.

---

# Local launch candidate — open-source conservation (September 16, 2026)

Reframed the homepage, metadata, and README around “What if conservation could be an open-source project? Enter VergeCommon.” Added paths for non-code contributors, three bounded starting tasks, a contribution issue form, community conduct guidance, and an announcement draft with separate contributor-preview and hosted-pilot gates. Updated homepage internal links to use the framework navigation component.

Validation on Node 24.19.0: all 53 domain tests passed, TypeScript checking passed, production build passed, and lint passed for the two changed application files. Local database migration completed with no pending migrations. Browser inspection verified the homepage at desktop and 390px mobile widths and the planner entry link. `git diff --check` passed. The default shell's Node 18 is unsupported; use Node 22.13+ as documented.

Scope: this was a launch-copy and contributor-onboarding change. Full repository lint, HTTP integration, native builds, imagery processing, independent security review, and multi-person pilot acceptance were not revalidated in this preparation. Production access and repository settings were not queried. No push, deployment, release, access change, or announcement was performed. Remaining publication and pilot gates are tracked in [LAUNCH.md](LAUNCH.md).

---

# Local candidate — interactive parcel mapping (September 14, 2026)

Added MapLibre/OpenFreeMap boundary drawing, draggable corners, coordinate editing, undo/redo, bounded GeoJSON import/export, historical boundary reuse and integration with the existing private review workflow. Basemap loading is opt-in, with recovery for unavailable maps. Fixed the rendering-worker packaging required by the current build tool. See [mapping implementation and validation](MAPPING_EDITOR.md). This is a local candidate; no hosted deployment is included.

---

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

## Native journal reliability candidate

Added full-journal backup/import, conflict-safe merging and explicit reload after transient access failures. Moved persistence into a testable repository that updates visible state only after successful atomic writes. Reads are bounded before JSON decoding. Added disk/reopen and injected write-failure tests. This increment remains an unsigned candidate, with no website deployment or TestFlight upload.

## Native public community discovery candidate

Added a native Discover tab with public co-op/project/update/event views backed by the current network API, restricted-access handling and a bounded anonymous client. The network list accepts a validated optional page size for small mobile requests. Added cross-language public-projection contract and native HTTP request tests. Documented the current repository as the shared service and the private application as legacy/reference. Native sign-in, posting, membership and sync are not yet connected. No production deployment or TestFlight upload is included.
