# Public beta flow review — 19 September 2026

This review covers the shared web application, self-hosted account gateway and hosted MCP. It starts from `ea751477cda5059ad0d226ad63ba4a47bd687825` on `build/coop-launch-readiness`, with the blocking and stewardship-transfer changes described below. It is local implementation acceptance, not a production deployment receipt, physical-device acceptance or App Store approval. The final deployment must identify and verify its own source revision.

## Changes made during review

- **Block a member:** every active co-op member can block or unblock another member under Members. The server hides updates, replies and events between the pair from ordinary members and rejects replies/RSVPs between blocked participants. Each block list is visible only to its owner. Stewards retain moderated records, while their personal web feeds hide blocked social content. Public pages and shared governance records remain visible; this is a co-op-specific social block, not a global publication restriction. Reports remain available for steward review.
- **Transfer co-op responsibility:** the current founding steward can explicitly confirm a transfer to another active steward who has agreed to take over. The successor receives steward-appointment and archival authority; the former owner remains a steward and can leave afterward. Both the shared record and the database owner field change atomically. Existing land rights, legal authority, agreements and financial records do not change. This makes the account-closure guidance to arrange a handover actionable.
- **Private audit commitments:** member views and exports omit command-payload digests, full-state digests and private audit nonces. New persisted audit events include a private random nonce before their receipt is hashed, preventing other members from enumerating a small set of possible block targets against a visible receipt. Stored retry hashes and historical receipts remain intact. The nonce is not exposed to stewards through the app either.

Private social records expose an `authorMemberId` for member controls and a `blocked` flag where stewards retain moderation access. Native clients must hide flagged records in personal feeds. Agent command permissions remain unchanged: these new administrative/personal-safety commands are not added to the bounded MCP write allowlist.

## Acceptance evidence

The expanded JavaScript suite passed **103/103 tests**. Full lint and TypeScript checks passed. A fresh self-hosted production build passed; it retains the existing Vite JSON-import compatibility and large-chunk warnings.

The real production build then ran on an isolated loopback server with a separate temporary SQLite database and private file store. `tests/selfhost_acceptance.py` passed using three independent synthetic accounts:

| Journey | Observed evidence |
| --- | --- |
| Discover and enter | Correct, distinct mission homepage and app-page headings; authenticated workspace access |
| Create and join a co-op | Private co-op creation, single-use invitation acceptance, separate steward membership approval |
| Participate | Member-only update saved; exact retry does not duplicate it; changed request payload conflicts |
| Access boundaries | Outsider denied, forged identity rejected, cross-origin mutation rejected |
| Evidence | Upload bytes hashed, authorized download matches bytes, other member/outsider cannot download the private file |
| Device access | Read token can read but cannot write; revocation takes effect on the next request |
| Agent access | Actual MCP initialization, private read, bounded task write, financial-command denial, encoded-path scope bypass denied |
| Personal safety | Block removes another member's update from API reads, reply is rejected, another member cannot see the caller's block list, unblock restores permitted content |
| Co-op handover | Transfer updates both owner projections and relational ownership; previous owner cannot archive; successor can archive |
| Exit | Co-op archived and all three synthetic login accounts permanently closed |

The local receipt identifies synthetic workspace `9563c4d2-037d-46e1-9247-efe122d4f9b4`. The temporary server was stopped afterward. No production data or external registry, payment or messaging provider was changed by this review.

An independent follow-up review confirmed that account export obtains each co-op through the permission-filtered workspace endpoint, not raw database state. It added domain assertions that private audit digests/nonces never enter either member or steward projections, and an account-export assertion to the acceptance runner. The targeted 23-test domain suite, scoped lint for the changed flow files and TypeScript checks passed after this follow-up. The final production candidate must rerun the expanded acceptance runner to include the new export assertions and full lint after integration. Native browser handoff also needed the website's `coop` query parameter rather than the API's `id`; that correction is owned by the native review.

The domain suites separately exercise pooled parcel area/overlap, independent consent and evidence reviews, stale rights, frozen charter voting, integer allocation conservation, record-based holding/settlement/payment safeguards, event capacity, discussion reports, account recovery races and backup/restore integrity. These checks do not establish genuine nonprofit affiliation, ecological validation, registry-issued credits or executed payouts.

## Remaining release conditions

1. **Monitored private support and abuse escalation:** confirm a real recipient and working delivery path for public-page concerns, privacy requests and cases where a co-op's steward is the subject of a report. Do not send private complaints to public GitHub issues. Existing co-op reports and member blocking do not establish operator response coverage.
2. **Recovery operations:** recurring encrypted offsite backups, recovery-key custody and operator incident/restore rehearsal still require verification. The previous daily local backup and one-off offhost archive are different evidence.
3. **Account expectations:** sign-up requires saving a recovery code; email reset, OAuth and MFA are not implemented. Closing a login removes authentication/access while shared co-op history and operator backups have separate retention responsibilities. Publish and operate the applicable privacy/deletion process before accepting sensitive records.
4. **Human/device acceptance:** the parent review must check the final deployed browser experience. Physical iPhone/iPad, VoiceOver, larger text and intermittent-network acceptance remain native release requirements. See [Apple release review](APPLE_RELEASE.md).
5. **Real-world conservation work:** participant consent, actual partner acceptance, ownership/rights instruments, approved methodology, authenticated registry custody, proceeds and authorized payments remain external requirements. The beta stores preparation and review records.

A public beta can accurately invite people to try the organizing tools with these limits stated and an accountable operator. Passing automated checks does not justify promising fully qualified carbon projects, automatic payouts, App Store availability or operating revenue.
