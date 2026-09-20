# Service follow-through candidate — 19 September 2026

This candidate follows the [conversation-actions build](CONVERSATION_ACTIONS.md). It addresses gaps found in the [service coverage audit](SERVICE_COVERAGE.md). It is an implementation record; its source does not establish production deployment, Apple distribution or completed external conservation/financial activity.

## Changes

- **Current web conversations:** the selected workspace checks for changes every 30 seconds while visible and online, and on focus or reconnection. Same-workspace forms remain mounted. A failed background check shows that records may be stale. Reads have a 15-second deadline; saves have a 30-second deadline and retain their request identity on an uncertain result. A denied individual action rechecks workspace access before clearing drafts; confirmed loss of access removes private state.
- **Independent review queue:** visible submitted observations, imagery results, issued holdings, settlements, allocation approvals, member payments, stewardship/treasury receipts and retirements appear as counts with links to their existing panels. Server-derived review flags exclude authors, ordinary members and paused records. A missing legacy flag does not imply permission. No private titles, geometry, documents or receipt details are added to these notices.
- **Conservation and treasury receipt records:** approved allocations can record externally completed stewardship payments and treasury reserve transfers, including partial amounts within each budget. Pending records reserve their amounts; another steward reviews them. Recorded, pending and unrecorded totals reconcile separately for members, stewardship and treasury. Evidence must belong to the settlement's project, and payment references cannot be reused across member payments and disbursements. The UI can open the exact supporting evidence only when it is already present in the viewer's authorized projection. Capacity, archival and erased financial references disable recording. Account erasure preserves numeric history while removing attributable receipt details.
- **Native group discussion:** the iPhone/iPad candidate adds member discussion views and explicit replies using a protected, account-bound retry queue. Private local retry state and online discussion records remain separate. Physical-device testing and Apple release acceptance remain separate from source implementation.

No background email/push delivery, registry transaction or money transfer is introduced. The MCP write allowlist remains unchanged.

## Verification record

Source candidate: `build/conversation-actions`, extending `baa2ffd`, in [PR #3](https://github.com/jdhart81/verge-common/pull/3). The commit containing this receipt records these local checks; the PR identifies the exact head and its CI results. This is not a deployment receipt.

- Pending-work and partner-participation suites: **13 tests passed**. Checks include all eight new review categories, actual domain review transitions, self-review exclusion, ordinary-member projections, missing flags, capacity pause, financial erasure and archive behavior. Scoped lint passed.
- **226 Node tests passed**, including allocation/receipt conservation, independent review, cross-project evidence rejection, account erasure, permissions, bounded refresh and existing integration regressions. Full lint and TypeScript checks passed.
- **82 Swift tests passed**, including 14 discussion regressions. The unsigned iPhone/iPad simulator build passed. Independent source review found and resolved rejected-reply recovery, access-loss clearing and fail-closed persistence-display issues. No physical device, signed build or Apple submission was exercised.
- The self-hosted production build passed. Fresh local HTTP acceptance passed for four accounts, invitation/privacy, files, replay/conflicts, native token lifecycle, partner participation, account erasure and MCP boundaries.
- The fictional rehearsal passed **110 commands and 26 expected denials**. Its $2,000 allocation reconciled to $1,400 member receipts, $400 stewardship receipts and a $200 treasury transfer only after independent review. These were fictional records; no credits or money moved.
- Browser walkthrough on an isolated local database verified an incoming reply appears automatically without clearing an unsent draft; removed membership clears the private discussion and draft; a $150 stewardship receipt persists as pending; a $250.01 addition to the $250 remainder is rejected without clearing the form; another steward's review changes the displayed totals automatically while the draft remains; the exact supporting evidence link is available; no console errors occurred. At 390px, the page and embedded receipt content have no horizontal overflow after correcting the embedded grid.
- Temporary browser tabs and viewport overrides were closed/reset. The isolated fictional browser/acceptance databases were disposed after testing. No production records were used or changed.
- Production image, hosted acceptance and deployment/rollback decision: not established by this document.

## Remaining service gaps

- Continuing conservation obligations need linked schedules, responsible people, disturbances/reversal concerns, responses and reviewed closure; generic tasks and observations do not yet provide that lifecycle.
- Complex financial accounting still needs explicit partial member payments, refunds/corrections and settlement fee/adjustment treatment. Current amounts are software records of external receipts, not bank balances.
- General project/budget motions and selectively shared partner documents require further design if demanded by the pilot. Current votes concern benefit-sharing charters; representative participation does not grant access to others' private records.
- Actual credit qualification, verification, issuance/custody, buyer contracting, sales and payments still require qualified external parties and selected providers. The platform does not perform those acts.
- Optional project contributions remain disabled until the verified Viridis LLC Stripe destination is configured. Production recovery/alerting, consenting participant acceptance, physical-device checks and Apple distribution retain their own release requirements.

See [SERVICE_COVERAGE.md](SERVICE_COVERAGE.md) for the claim-by-claim boundaries and [OPERATIONS_BETA.md](OPERATIONS_BETA.md) for the separate recovery/operations status.
