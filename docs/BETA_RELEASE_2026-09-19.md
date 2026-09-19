# Public beta review and deployment — 19 September 2026

The updated website is live at **https://vergecommon.com/**. Native account access, associated-data deletion, safety controls and the approved support contact are implemented and tested. Apple distribution and optional Stripe contributions are **not launched**. Recurring encrypted offhost backup transfer is **paused pending explicit approval**; on-server daily backups remain active.

## Latest homepage update — living habitat

The owner-requested SVG update was introduced in **`d44051b3d3c913a1e67967df66e6f36ea7b9600d`** and the bird-motion refinement is deployed from **`bc49c48be6d808b3c9f6ae0d916aa707c525a343`**. Trees grow from anchored roots, hedgerows and wildflowers bloom around property edges, birds cross the parcels, butterflies flutter and a rabbit moves its ears. Staggered 22–26 second plant cycles hide their resets. The visible pause/play button is removed. Reduced-motion and no-JavaScript visitors receive a mature static scene; offscreen animation pauses internally. Stable SVG identifiers remove the observed server/client hydration mismatch.

Bird wings now rotate independently around fixed shoulders instead of being flattened and inverted with negative vertical scaling. Two gentle beats settle into a longer glide in each 4.8-second cycle. Filled tapered wings, a stable body and forked tail keep the birds recognizable, and their orientation follows the flight direction. [Run 35466570051](https://github.com/jdhart81/verge-common/actions/runs/35466570051) passed all four jobs; local lint/typecheck, both web builds, browser inspection and exact-image smoke checks passed. Live inspection confirmed paired rotations, the absence of the old inverted-wing layer and no browser errors.

Full lint/typecheck, self-hosted and static-preview builds passed. [GitHub run 35464323267](https://github.com/jdhart81/verge-common/actions/runs/35464323267) passed all four jobs. Desktop and 390px browser inspection confirmed the composition without horizontal overflow; browser style checks confirmed infinite running loops, no motion button and offscreen pausing. The exact isolated Linux image passed homepage, wildlife markup, public route and MCP-discovery smoke checks. Its initial health probe used the production hostname against the loopback staging origin; the corrected staging-origin probe passed. The production health check passed unchanged.

Current image: **`vergecommon:20260919-bird-motion`**, identifier **`sha256:50cda4cddffa56c2d8f68768024612d5cda367935d4190a6fca22a37a3dbacff`**. Source: `/opt/vergecommon/releases/20260919-bird-motion`. The preceding landscape image is retained stopped as `vergecommon-bird-rollback-d44051b`; data/evidence mounts and server restrictions are preserved. The live HTTPS page was reloaded and visibly checked, with infinite running animation, no motion control and no browser errors.

Before the bird refinement, on-server backup `/backups/2026-09-19T20-11-09-971Z-lb3x52` passed isolated restore with four workspaces, three evidence files, zero accounts and four committed deletion receipts. Database SHA-256: `2a159bf5b8b599987fe0dbe2fd1cb88e700ba37fe243f92b49cb4eed59e572a5`. The earlier landscape backup below is historical.

Pre-update on-server backup: `/backups/2026-09-19T19-21-07-107Z-aLf2ry`; database SHA-256 `aa117fb1acf493eff7e03f0132c8bdb0a04e89fc546fc8f171a0bc8cc6a589ea`. Its isolated restore passed with four historical synthetic workspaces, three evidence files and zero accounts; four committed deletions were preserved. No production backup was copied offhost by this update. The account/data lifecycle evidence below remains for the unchanged backend.

## Released changes

- Native registration, sign-in and recovery now use a normal account form. Recovery codes are acknowledged once; expiring participation tokens are stored in Keychain. Sign-out revokes the token, including advanced read-only tokens. No browser token-paste step is required.
- Password-confirmed account deletion removes authored personal content, private land/evidence records and uploaded files along with credentials. Founder handover protects active shared co-ops. Shared numeric/governance structures can remain with identity fields removed; erased finance references pause further financial recording. Other members' independent content and downloaded copies are separate.
- Durable committed deletion receipts prevent older backups from resurrecting deleted accounts. Prepared intents cannot authorize a failed deletion. Startup verifies ledger completeness, replays committed erasures, retries evidence cleanup and reconciles interrupted uploads before listening. Late writes cannot recreate deleted membership or uploaded evidence. SQLite secure deletion and checkpointing are enabled; this is not a forensic-media erasure claim.
- The shared service rejects narrowly matched threats, personal attacks and explicit sexual promotion before saving social/profile text. Legacy matching public content is filtered. This English-language baseline supplements reports and steward review; it is not comprehensive moderation.
- Native public items have specific report-email drafts and device-only co-op hiding with undo. Private member reports and blocks remain service-enforced. No email is automatically sent. A separate confirmed action clears the on-device journal.
- **justin@viridisconservation.com** is published for private support, safety and privacy requests. Viridis LLC remains the operator. Help, privacy, conduct and recovery instructions now match the implemented deletion flow.

## Verification

Deployed code: **`5aa1a5f7b4b6a365898c26e2ffa6df510d8d6f7b`**, branch `build/coop-launch-readiness`, [PR #2](https://github.com/jdhart81/verge-common/pull/2).

[GitHub run 35462710257](https://github.com/jdhart81/verge-common/actions/runs/35462710257) passed all four jobs: web checks, deployment container, imagery and iOS. This includes **128 Node tests**, the **seven-case Python operations suite**, lint/typecheck, Cloudflare/static/self-hosted builds, HTTP integration, account/co-op acceptance, **44 Swift tests** and unsigned iPhone/iPad simulator compilation. The final delayed-revocation audit regression also passed locally. Signing and physical-device acceptance are separate.

The isolated local production build passed the full shared co-op and native lifecycle runner (fixture `8f05eb97-de73-4659-b36b-b06fa529e77f`). Browser inspection verified support-to-account navigation, sign-in, co-op entry, account controls and privacy links. The deletion disclosure and confirmation form were visually checked at 390px width. The extra browser account and its temporary credential file were removed.

The exact server image passed isolated acceptance (fixture `fd4db54b-fcf9-4aeb-94ec-fc8f8e39e568`) and backup/restore checks before the switch. Its staging container is stopped.

After deployment, canonical HTTPS acceptance passed with fixture **`147d78b4-75db-4b09-808f-9b91f41bf967`**. Checks included independent accounts, invitation/approval, version conflicts and retries, origin/identity/outsider rejection, private evidence bytes, device revocation, hosted MCP handshake/read/write and financial denial, member blocking, private export, persisted founder transfer, archival and associated-data deletion. Native registration without cookies, login, token revocation, recovery rotation and explicit deletion also passed. All four synthetic accounts were deleted. These are tests, not community adoption or conservation outcomes.

Live health, privacy/support content, the published email and MCP discovery returned successfully. A browser refresh confirmed the deployed support contact.

## Initial beta deployment and recovery

The initial beta deployment ran `vergecommon-app` from image **`vergecommon:20260919-beta-launch`**, image identifier **`sha256:8f7c2816aea0bc9b7574ace115724d7ae5c52ef8773273ef0adc901f39e25a6d`**. Source is `/opt/vergecommon/releases/20260919-beta-launch`. Durable data/evidence mounts, private Docker network and Caddy HTTPS were retained. The pre-privacy container is stopped as `vergecommon-preprivacy-rollback-5aa1a5f`. The homepage-only image above supersedes this running image without changing the backend.

**Do not restart an older executable lacking deletion replay after deletions have occurred.** Recovery requires an erasure-capable release and the latest independently preserved committed ledger before reopening. Use a compatible forward fix or keep service closed while repairing; a blind image/data rollback can resurrect records.

Predeployment backup: `/backups/2026-09-19T18-51-21-191Z-7xt6Me`; database SHA-256 `359690471075c9b5d9ead464eb02626a6884e73c71fb384ab71af4980a9af662`. Its isolated server restore check passed with three historical synthetic workspaces, three evidence files and zero accounts.

Postdeployment backup: **`/backups/2026-09-19T18-59-57-832Z-kdUxHj`**; database SHA-256 **`c4c9798ea8211b34f54bf2dce28168edc84ef9fa162da60c31632038aab4cf2e`**. Integrity and evidence checks passed; three historical evidence files remain and four new committed deletions are recorded. The live deletion ledger is complete. The daily server backup timer is active and the app is healthy. See [operations](OPERATIONS_BETA.md) for exact independent checks.

Encrypted Mac recovery tooling passed real encryption/decryption, corruption/wrong-key tests and a historical-snapshot rehearsal with a newer synthetic deletion (one account and file removed, no queued cleanup). Its hourly LaunchAgent was installed, then **unloaded** after automatic approval review rejected the first production transfer pending exact payload/destination authorization. No new production-backed encrypted offhost receipt is claimed. Existing older plaintext copies are unchanged. Approval, independent key custody, retention choices and externally delivered monitoring remain open.

## Remaining launch gates

- **Apple:** authenticated App Store Connect access is now verified. The available seller is an individual account, with an active Free Apps Agreement and an unaccepted Paid Apps Agreement; no Viridis LLC team or VergeCommon app/identifier is available. Seller choice, local Xcode license acceptance, signing, physical-device/accessibility acceptance, privacy declarations, review account/screenshots and actual TestFlight upload/review remain open. Xcode's agreement is open for owner review. Nothing has been uploaded or submitted.
- **Funding:** the website support page is live, with no checkout until a verified Stripe Payment Link exists. The connector lacks product-creation permission; a permission-change link has been provided. No product, contribution, subscription or app price was created. See [funding](FUNDING.md).
- **Offhost recovery:** explicit authorization to copy the production database, evidence and deletion ledger over SSH into the existing encrypted Mac backup destination is pending. The scheduler is paused, preserving its configuration/key. The Mac can only run checks while awake, online and logged in; no external notification delivery is configured.
- **Public source:** the validated code is pushed and PR #2 is current. Main-branch merge approval remains pending under the existing launch checklist. No public announcement was sent.
- **Real operation:** assign/rehearse human moderation and incident response, secure a second recovery-key copy, choose backup retention and complete a consenting community pilot. Software records do not establish nonprofit consent, land rights, carbon verification, issued credits or actual payouts.

The website public beta remains free. A paid finished App Store release is a separate pricing decision; TestFlight access is not sold.
