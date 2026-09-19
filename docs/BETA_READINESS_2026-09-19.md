# Beta readiness candidate — 19 September 2026

This candidate follows the [deployed launch build](LAUNCH_BUILD_2026-09-19.md). It is a software readiness record, not an Apple distribution receipt or evidence of a real community pilot. The website and agent service already operate as an early technical beta; this new candidate must pass the isolated deployment-image check below before switching production.

## Completed in this candidate

- **Native field evidence:** deliberate system photo/file selection; photos reencoded without source metadata and capped at 2,048 pixels/4 MB, with bounded source reads. PDF/text contents and metadata are unchanged and the UI asks users to review them. The protected, account-bound queue saves exact upload and command IDs before sending, keeps interrupted outcomes recoverable, records confirmed submission before removing local bytes, and has explicit local erasure. No automatic camera/GPS capture or background sending.
- **Reliable uploads:** migration `0002_idempotent_evidence_uploads` gives identical retries the same asset, rejects conflicting or retired attempts, and selects a single immutable file across concurrent attempts. Canonical file paths are preserved for backup, restore and erasure; losing and expired attempts use durable cleanup. A retryable quota rejection preserves the attempt.
- **Partner participation:** an approved member receives a private invitation for a reviewed partnership, accepts or declines, and supplies their own authority evidence. A different steward reviews it. Ending participation and account erasure withdraw attributable records. This adds no privileges, institutional verification, executed agreement or finance eligibility.
- **Finite safety reserve:** private capacity warnings; ordinary growth pauses at 650,000 serialized bytes or 4,500 audit entries. Authorized safety changes may use the remaining reserve up to 750,000 bytes/5,000 entries, including in archived co-ops. Full receipt metadata counts toward limits. Independent operator reporting and account deletion remain outside the aggregate. No history is silently dropped.
- **Release disclosures:** privacy, native reviewer notes, pilot checklist and operations guidance describe the actual selected-file flow, local retention and remaining human responsibilities.

## Verified locally

- **199 Node tests** pass, including a real-object-storage concurrency test followed by backup, restore verification, account erasure and replay of the current deletion ledger into an older isolated backup.
- **68 Swift tests** and an unsigned iPhone/iPad simulator build pass. Independent review fixed bounded photo reads, disk/memory divergence after failed writes, preserved uncertain submissions after denied retries, and honest account-switch messaging.
- Full lint/typecheck and Cloudflare, static public and self-hosted production builds pass.
- Fresh-database self-hosted HTTP acceptance passes with four independent synthetic accounts, plus native account lifecycle checks. It covers invitation/approval, reviewed partnership acceptance/authority review, privacy and unchanged privileges, exact upload retries/conflicts/discard, private bytes, representative erasure, scoped native identity, MCP handshake/read/write and financial denial, account recovery/deletion and archival. Local fixture: `0d22fee8-0566-428b-958f-dfec2279346a`; synthetic logins were closed by the runner.
- Browser acceptance used three synthetic roles for invitation → acceptance → independent review, verifying the representative cannot see the private agreement. A separate synthetic archived capacity fixture displayed the reserve warning, disabled ordinary event creation and allowed ending participation. Layout checked at 390-pixel phone width. The fixture initially lacked required audit fields; correcting the test-only data resolved its rendering error.

Logs are local verification artifacts under `/tmp/vergecommon-readiness-*`, `/tmp/verge-native-capacity-review.log` and `/tmp/verge-ios-capacity-review.log`, not durable production or Apple receipts.

## Deployment candidate receipt

The coordinator will record the exact source commit, image digest, same-image isolated HTTP/backup/restore result and CI run here. A green health route alone is insufficient. Production was read-only checked while preparing this candidate: image `vergecommon:20260919-launch-build`, digest `sha256:192b1525a2d8abd41f8e152f242e807f1d0216f14f276518f79a7af88d883236`, healthy; daily local backup timer active; 27 GB free. These observations are point-in-time checks.

Migration `0002` is new and additive. Release from a fresh source build after a verified on-server backup. Keep previous source/image for diagnosis, but do not roll back to an executable that ignores upload tombstones, evidence cleanup or current safety/erasure controls. Use a compatible forward fix or keep writes closed. Do not restore a stale deletion ledger. Earlier disposable development databases using pre-release versions of `0002` are not migration inputs.

## Remaining gates

| Milestone | Remaining requirement |
| --- | --- |
| Controlled web deployment | Record the exact isolated image result and CI; then switch with a verified predeployment snapshot and repeat canonical HTTPS acceptance. Main-branch merge remains at the existing owner approval gate. |
| Broader public beta invitation | Consenting community pilot, named operator and backup responder, tested response coverage and external alert delivery. The software does not supply real participation or human staffing. |
| Recovery readiness | Recurring encrypted transfer of production database, evidence and latest committed deletion ledger to the proposed Mac backup destination remains paused pending exact owner authorization. Independent recovery-key custody, retention choice and offsite restore rehearsal remain. No transfer or scheduler activation is performed by this candidate. |
| Apple beta / App Store | Choose Viridis LLC organization seller versus the currently observed individual team; register the bundle/app record and signing; qualify physical iPhone/iPad behavior and accessibility; complete collection/privacy declarations, final manifest/archive review, screenshots and review access; then sign, validate and upload. Unsigned tests are not Apple distribution. |
| Optional project contributions | The authorized Stripe product-write connection still needs permission. No working contribution link or charge is claimed. This does not block a free controlled web beta. |

Native selected photos/files and explicit partner responses close software gaps from the earlier review. They do not establish nonprofit-controlled organization accounts, independent affiliation verification, broader native governance/mapping, OAuth, email/push delivery, hosted imagery scheduling, large-scale storage migration or certified carbon outcomes. Those remain later scoped work or outside qualifications. Actual title/legal review, methodology eligibility, registry issuance/custody, sales and payout execution must be qualified separately before advertising carbon revenue.
