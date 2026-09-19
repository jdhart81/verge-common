# Public beta review and deployment — 19 September 2026

The updated website is live at **https://vergecommon.com/**. Native account access, associated-data deletion, safety controls and the approved support contact are implemented and tested. Apple distribution and optional Stripe contributions are **not launched**. Recurring encrypted offhost backup transfer is **paused pending explicit approval**; on-server daily backups remain active.

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

## Deployment and recovery

The dedicated VergeCommon droplet runs `vergecommon-app` from image **`vergecommon:20260919-beta-launch`**, image identifier **`sha256:8f7c2816aea0bc9b7574ace115724d7ae5c52ef8773273ef0adc901f39e25a6d`**. Source is `/opt/vergecommon/releases/20260919-beta-launch`. Durable data/evidence mounts, private Docker network and Caddy HTTPS are retained. The previous container is stopped as `vergecommon-preprivacy-rollback-5aa1a5f`.

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
