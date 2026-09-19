# Public beta review and deployment — 19 September 2026

The updated website is live at **https://vergecommon.com/**. The software is available for public beta use with its stated limitations. This receipt does not qualify Apple distribution, sensitive-record operations, charitable fundraising, carbon issuance or payments to co-ops.

## Released changes

- Co-op members can block/unblock social interaction; stewards retain moderation access. Founder responsibility can be explicitly transferred to another active steward before departure.
- Member-facing audit records and exports omit private payload/state digests and nonce values. Newly stored audit receipts include a private nonce to prevent guessing low-entropy private commands from public hashes.
- The homepage identifies the public beta and links dedicated privacy, help and project-support pages. Account closure is described accurately as login closure with retained shared records.
- Router-generated trailing-slash account links now reach the account gateway. Native co-op handoffs use the website's correct `coop` selector while API requests retain `id`.
- Native source includes member-update reports, block/unblock controls, hidden/blocked feed filtering and direct help/privacy/account links.

## Verification

Source revision: `c7cc5d411d8a4082a41a4371433a91f9d977108f`, branch `build/coop-launch-readiness`, [PR #2](https://github.com/jdhart81/verge-common/pull/2).

[GitHub run 35458553516](https://github.com/jdhart81/verge-common/actions/runs/35458553516) passed all four jobs: web checks, actual deployment container, imagery and iOS. Evidence includes **104 Node tests**, full lint/typecheck, Cloudflare/static/self-hosted builds, multi-account acceptance, **28 Swift tests**, and unsigned iPhone/iPad simulator compilation. Native signing and device acceptance remain separate.

Browser walkthrough against the isolated final build verified sign-in, co-op entry, member block/unblock, handover confirmation/cancellation, account navigation and sign-out. It also verified homepage-to-registration and help-to-recovery navigation. Support and privacy pages were checked at 390px and 320px widths with no horizontal overflow. The local walkthrough fixture was archived and both synthetic accounts were closed. No browser console errors were captured after the final route correction.

The exact server image passed isolated three-account acceptance before deployment (workspace `0ad6e71d-d052-4cf1-bf07-f9af33a7581c`). The initial readiness race ended before fixture creation; the run after the health check passed. The test container is stopped.

After deployment, the same acceptance suite passed over canonical HTTPS with private synthetic workspace `1d123f57-0dc5-4549-8449-a56dce5a3ddd`. It verified account creation, invitation/approval, posts, replay/conflicts, outsider/origin/identity denial, private evidence bytes, device revocation, actual hosted MCP reads/writes and financial denial, blocking and private export projections, persisted founder transfer and authority changes. The fixture was archived and all three login accounts closed. These are test records, not real participating co-ops or ecological impact.

## Deployment and recovery

The dedicated VergeCommon droplet runs `vergecommon-app` from image `vergecommon:20260919-beta-final`, identifier `sha256:18345ebcb673e139a7750fece1dafc8358389d1b6128812fca8d2ad836d9698c`. Source is retained at `/opt/vergecommon/releases/20260919-beta-final`. Existing data/evidence mounts, private network and Caddy HTTPS proxy are retained. The previous mission interface image is stopped as `vergecommon-beta-rollback-c7cc5d4` for rollback. Health and the live public-beta homepage were checked after the switch.

Predeployment backup: `/backups/2026-09-19T17-37-58-642Z-rJpR3f`; database SHA-256 `5a7e52a2f0f8e20a140efa90d9847948d2d0ab8ec9cffa2feedad64401121bdf`. Isolated restore checks passed on the server and on the private offhost Mac copy. The archive SHA-256 is `2f4b0df18f013994dc0887503a7ee6b06e158df6962db7f1144adc374b552098`. Daily local backup scheduling is active. This manual offhost copy is not recurring encrypted offsite protection; destination/key custody and alert delivery remain open operational work.

## Outstanding decisions and gates

- **Support:** a monitored private email and real response process have not been confirmed. The public help page explicitly identifies this gap and asks beta participants to keep records nonsensitive. Shared-record removal and backup retention still require an operated process.
- **Funding:** the support page is deployed, but its payment link is intentionally unconfigured. Stripe read access confirmed the Viridis LLC public business identity and payment capability; product creation was permission-denied. No checkout, contribution, subscription or app price was created. See [funding setup](FUNDING.md).
- **Apple:** App Store Connect requires owner sign-in. Local Xcode requires license acceptance and has no valid signing identity/team configured. Consumer sign-in, complete associated-data deletion, public-content safeguards and physical-device acceptance remain product gates. No build has been uploaded or submitted. See [Apple release review](APPLE_RELEASE.md).
- **Pricing:** a paid finished native app is under consideration. The website beta remains free; no price is selected. Apple beta distribution uses TestFlight without charging for access.

No public announcement or main-branch merge was performed. The public source branch, deployed website and Apple candidate have distinct, recorded states.
