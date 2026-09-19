# Launch build checklist — 19 September 2026

**Source candidate; consolidated release verification and deployment receipt pending.** This build addresses the owner's request to work through the launch-gap list. It does not establish a real community pilot, Apple distribution, funded conservation outcomes or active offhost recovery. The [previous deployed receipt](BETA_RELEASE_2026-09-19.md) remains historical evidence; do not infer that every candidate feature below is already live.

## Implemented in this candidate

| Area | Result and practical boundary |
| --- | --- |
| Neighbor invitations | A valid invitation survives registration, sign-in and recovery in the same tab using a 24-hour session handoff. Tokens remain in fragment/session storage, outside auth query strings. Successful membership requests clear the handoff. Storage-denied, missing and expired/used-link cases give recovery guidance. Steward approval remains required. |
| Evidence uploads | Cancel/discard, replacement and retry are explicit. Unattached files older than 24 hours are eligible for cleanup at startup, hourly maintenance or subsequent uploads; attached evidence remains protected. A durable deletion queue and atomic attachment/quota/membership checks address lost responses and concurrent edits. Includes the additive `0001_evidence_upload_lifecycle.sql` migration. |
| Setup progress | The circle step requires two active stewards. The pathway step requires the latest reviewed assessment for a project to match its current land records. Recorded setup is not carbon eligibility. |
| Operator reports | Web and native clients submit private reports to an operator queue with random private status receipts and exact-request retries. This provides escalation independent of a co-op's stewards. Signed-in reports participate in account export/deletion; anonymous native reports remain receipt-based. Human review/response coverage must still be qualified. |
| Operator decisions | An existing SSH-authorized operator uses `self-hosted/safety-cli.mjs` to inspect, review, hide, restrict or dismiss. Restriction release keeps the co-op private. Queue pagination keeps open reports reachable after older resolutions. Decisions and workspace versions commit atomically; there is no HTTP operator-admin endpoint. See [the runbook](OPERATIONS.md#operator-safety-queue-in-the-candidate). |
| Calendar dates | Web/native observations carry a matching calendar date and time zone. New native drafts preserve their originating zone; legacy drafts keep their UTC interpretation and retry identity. This addresses local-midnight rejection east of UTC. |
| Events | Organizers/stewards can edit or reschedule upcoming visible events within ownership, block, public-visibility, date and capacity rules. RSVPs remain recorded; edits cannot shrink a positive capacity below active Going responses. Calendar UID stays stable, SEQUENCE advances, and participants are told to check the new details and reimport their calendar. No messages are sent automatically. |
| Pending work | A private in-app summary links to visible membership requests, reviews, reports, eligible outstanding votes and ready-to-tally proposals. It uses the existing permission-filtered workspace; it does not send email, push or agent notifications. |
| Cooperative parcel overview | A steward-only browser drawing combines the latest reviewed parcel boundaries, project selection, highlighting, estimated area and current pooling-consent state. Invalid/unreviewed/withdrawn parcels are not silently shown as prepared. It contacts no map provider and grants no new member access. |
| Public discovery | Web and native text search cover public co-op names, regions, descriptions and countries, with additional-page loading and timestamp-plus-ID cursors. This does not verify nonprofit affiliation or provide an independently curated organization registry. |
| Native readiness | Source includes direct operator reports, protected receipt storage/status lookup, directory search/pagination and local-calendar-date handling. The native workstream reports 55 passing core tests and an unsigned iOS Simulator build. The earlier Xcode-license error no longer blocks those checks; signing and physical acceptance remain separate. |
| Operational checks | Candidate operations tooling addresses monitoring/report-queue/capacity checks and recovery alerts. Installed scheduling, actual notification delivery and a new production-backed offhost recovery receipt require their own evidence; see [operations status](OPERATIONS_BETA.md). |

## Candidate verification and release record

- Final consolidated local suite: **170 Node tests passed**, including the **15-case Python operations suite**. Lint, TypeScript, Cloudflare, static-public and self-hosted builds passed. Production dependency advisory check reported **zero known vulnerabilities** at this check.
- Native core suite: **55 tests passed**; unsigned iPhone/iPad Simulator compilation passed. Logs: `/tmp/verge-native-launch-core.log` and `/tmp/verge-native-launch-ios.log`. No signed or physical-device acceptance is implied.
- Browser acceptance used disposable local fixtures: invitation → sign-in → retained invitation → membership request → steward approval; pending membership notice disappeared after approval. It caught and fixed the trailing-slash sign-in alias and the explicit join/report submit-button types.
- Browser report submission and private receipt status succeeded. An independent review also added a 4,000-CJK-character request regression and separated earlier-receipt lookup from a new report draft.
- Steward parcel view showed reviewed/current consent and consent-needed outlines, keyboard selection worked, and the 390-pixel phone layout had no horizontal page overflow. No external map provider was contacted.
- Browser event create → RSVP → edit preserved the existing Going response and displayed the change notice. Regression tests cover capacity, ownership, calendar sequence, stale/hidden content and permission boundaries.
- Upload tests cover discard/retry, expiry, protected attachments, concurrent attachment/deletion and quota/membership checks. Local production-build acceptance passed (fixture `6e64a492-946f-4c07-b3f1-025d29b4873a`), including private evidence, account lifecycle, scoped native and MCP access, and financial-write denial; its four synthetic accounts were deleted.
- Local backup and isolated restore passed with migrations `0000_famous_nighthawk` and `0001_evidence_upload_lifecycle`, four committed deletions and database SHA-256 `ce3012fc127bd399b6143f46fbe8f8b7a4bae4edeee22fbbccca5fb6acb833c1`.

The final browser report regression passed: malformed and valid earlier-receipt lookups preserved the new draft; submitting it created a distinct receipt. No console warnings/errors were observed in these browser checks.

**Release still pending at this source checkpoint:** exact-image isolated acceptance, on-server backup/restore, deployment receipt and PR checks. All browser writes above were synthetic and local. New-account recovery acknowledgment remains covered by API/domain checks and prior acceptance, not a newly completed human pilot.

Final implementation commit and production image: recorded in the follow-up deployment receipt once verified. The prior image is retained stopped for diagnosis; after this release's operator restrictions or migration are used, use a compatible forward fix rather than an old executable that lacks those safeguards. Never restore stale deletion data or discard the current committed erasure ledger.

## Independent gates still open

| Gate | Current boundary / required next evidence |
| --- | --- |
| Optional funding | Viridis LLC is the intended recipient. Stripe product/payment-link writes were denied by the connected account's current permissions today; additional permission was requested. There is no verified checkout or live payment-link receipt. Do not route around the denied permission or invent a link, price, charitable status or successful payment. |
| Offhost recovery | The production backup transfer and recurring Mac scheduler remain paused pending the owner's answer for the encrypted data destination and hourly updates. No production-backed encrypted offhost recovery receipt is qualified. Independently secured recovery-key custody and a restore rehearsal remain necessary. On-server backup history is separate. |
| Apple seller/signing | The last verified App Store Connect account was an individual seller; the owner identifies the project operator as Viridis LLC. Seller/team choice remains pending. The last signing check found zero valid identities; no signed archive, VergeCommon app record, upload or approval receipt is established. Local simulator success does not resolve these gates. |
| Physical/device acceptance | Rehearse the exact signed build on physical iPhone and iPad, including VoiceOver, large text, offline/locked storage, receipt recovery, date boundaries, account switching, revocation and deletion. Capture real native screenshots with synthetic data. |
| Real community pilot | Consenting neighbors and two responsible stewards must complete the [pilot acceptance loop](PILOT.md), including invitation, land/consent review, an activity, evidence, reporting and recovery. Automated fixtures do not establish adoption or ecological impact. No outreach is sent by this build. |
| Human safety coverage | Name the operator and backup responder, establish response expectations, and rehearse queue checks/decision handling and alert delivery. The software records submissions and decisions; it does not staff the service. |
| Repository release | Final source/CI reconciliation and the pending main-branch merge remain separate from implementation. Do not replace historical deployment hashes with an unverified candidate. |

The [Apple release review](APPLE_RELEASE.md) and [submission draft](APPLE_SUBMISSION_DRAFT.md) cover native distribution details. TestFlight beta access is not sold; any finished paid App Store release, price, agreements and storefront configuration are separate owner decisions. Optional website support does not purchase co-op privileges, land rights, carbon credits or promised returns.

## Features and external arrangements not completed by this build

- Nonprofit-controlled enrollment/acceptance, independently verified affiliation and accountable partner participation. Self-reported profiles and co-op-reviewed agreements are already present.
- Native photo evidence, offline binary-upload recovery, broader native governance and mapping. Current browser handoffs remain intentional and must be described accurately in the app listing.
- Email/push notifications, verified email recovery, stronger steward authentication and OAuth for agent clients that require it. Current recovery codes and scoped/revocable MCP tokens continue to work.
- Large-scale aggregate/storage migration, operator-selected retention periods, regional hosting, translation and wider community accessibility acceptance. Capacity indicators do not remove hard limits.
- Qualified land/title review, legal cooperative arrangements, executed instruments, methodology eligibility, independent verification, registry issuance/custody, credit sales and actual payment execution. The application prepares records, votes and allocation math; it does not authenticate these external facts, issue carbon credits or move cooperative payouts.
- Automated hosted imagery orchestration, formal field/satellite validation and methodology-specific uncertainty. Boundary and NDVI screening are not certified environmental results.
