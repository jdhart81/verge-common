# VergeCommon deployment receipt — September 19, 2026

## Result and scope

The shared cooperative web application is deployed at **https://vergecommon.com** on its dedicated DigitalOcean server. Browser accounts, membership-controlled workspaces, private evidence storage, native device tokens and authenticated agent MCP are connected to the same service and durable database. This replaces the earlier public-only website deployment.

This is an **early technical pilot**. It does not establish real nonprofit affiliation, a legally effective pooled-land agreement, verified ecological results, carbon eligibility, issued credits, sales, cleared proceeds or executed payouts. The software prepares and records those workflows; external people and institutions must complete them. Native source and an unsigned simulator build are not Apple distribution.

Implementation source: `build/coop-launch-readiness`, [PR #2](https://github.com/jdhart81/verge-common/pull/2). The full implementation was pushed as `2b73c2de7470c54c30fe4b4de1946c325c314c63`; the final deployed source is **`2e989abcefc0666bf327b417fb35fd465c9d273a`**. This receipt was finalized afterward without changing the runtime. `main` has not been merged.

## Deployment

- Dedicated droplet: `codex-keen-forge-bf65`, DigitalOcean ID `601953476`, NYC3, 2 vCPU / 4 GB. Separate from Viridis Conservation.
- Public HTTPS origin: `https://vergecommon.com`; `www` redirects to the canonical hostname.
- Private application container: `vergecommon-app`, one Node 24.19.0 process with SQLite and immutable private evidence files. No application port is published directly.
- Release image: `vergecommon:20260919-final`, manifest/image identifier `sha256:a6a458fc53da8a49c65665d48bc4705d0bc0c40cd9654ba290248df724c544b6`; source retained at `/opt/vergecommon/releases/20260919-final`.
- Reverse proxy: `vergecommon-web`, Caddy with persistent certificate volumes and private Docker network `vergecommon`.
- Durable database and evidence mount: `/opt/vergecommon/data`; backups: `/opt/vergecommon/backups`.
- Runtime restrictions: unprivileged user, read-only container filesystem, temporary scratch mount, dropped capabilities, no-new-privileges and resource limits.
- Original public-only container is retained stopped as `vergecommon-public-rollback`. Runtime rollback must retain the current data; never overwrite live data with an older backup merely to revert source.
- The preceding shared-app container is retained stopped as `vergecommon-app-rollback`. Isolated staging containers are stopped. Final application health was verified after replacement with the same durable mounts.

## Verified behavior

1. **Source validation:** 100 Node tests, complete lint with zero diagnostics and TypeScript checks passed. [GitHub CI 35454934778](https://github.com/jdhart81/verge-common/actions/runs/35454934778) passed web, deployment-container, imagery and iOS jobs for the final deployed source, including production builds, native tests and an unsigned simulator compile.
2. **Linux staging:** the deployed Docker build passed the production-build three-account acceptance runner. An isolated backup restore checked SQLite integrity, relationships, workspace JSON and evidence bytes.
3. **Live HTTPS acceptance:** three independent synthetic accounts exercised registration, invitations, membership approval, a private post, retry idempotency, version conflict handling, unauthorized-account and cross-origin denial, forged identity rejection, evidence upload/private download, scoped native tokens and revocation. Hosted MCP completed initialization, a permitted private read and bounded write, and denied financial commands and scope-bypass attempts.
4. **Fixture handling:** initial live synthetic workspace `e411b753-a9c6-40e5-ae3d-3c6900db0fe9` and final-release fixture `884f0d31-8a01-452f-8e5e-136bebabf309` were archived; all three synthetic login accounts from each run were closed. No real affiliation, land right, credit or payout was created. Private archived test history remains for traceability.
5. **Browser checks:** public discovery showed the honest empty state, private workspace entry reached the account form, and a synthetic local planner card survived a reload. The final mission homepage was checked visually; `/` and `/app/` now render distinct correct pages. Account HEAD returns 200, agent discovery points to the reviewed source branch, and `www` returns the expected canonical redirect.

The final browser review caught a route collision caused by building inside `/app`, where the source also contains an `app/app/page.tsx` path. Building in `/srv/vergecommon` corrected the collision. The acceptance runner now verifies both rendered headings before creating fixtures, and CI builds/tests the actual Docker image to cover container-specific behavior.

The health check traverses the gateway and public database API. `/healthz` alone is not the acceptance test. Test success does not establish throughput, high availability, independent security certification or physical-device acceptance.

## Backup and recovery evidence

`vergecommon-backup.timer` is installed, enabled and active, scheduled daily at 03:15 UTC with up to five minutes of jitter. Its service successfully generated the following production recovery point:

| Item | Receipt |
| --- | --- |
| Completed directory | `2026-09-19T16-20-21-783Z-9q2lhu` |
| Database SHA-256 | `488046a13a0e6ac80615c6ee5667491aaa1f96193cd5f7425ba1fb6edfe660fa` |
| Database bytes | 98,304 |
| Database integrity | `ok` |
| Verified referenced evidence files | 1 |
| Restore check on server | Passed at 16:21:03 UTC; production unchanged |
| Archive SHA-256 | `67c9aacb3f7abcb84e1d3231f2bfe1fb40c785af103c5143950cecec708b5ba2` |
| Initial offhost copy | Saved outside the Git repository in the owner's private project backup directory; checksum matched |
| Restore check on offhost copy | Passed at 16:23:12 UTC; production unchanged |

Both restore checks found one archived synthetic workspace, one evidence file and no remaining synthetic login accounts. Backup data and credentials are not included in this public repository. The local copy has restrictive filesystem permissions; this receipt does **not** claim that archive-level encryption or recurring offsite transfer is configured. Follow the [operator guide](../self-hosted/README.md) to establish an approved encrypted offsite destination and recovery-key custody.

After the final container replacement and second live acceptance run, backup `2026-09-19T16-30-56-145Z-vX9FNw` passed restore verification at 16:31:32 UTC. It contained two archived synthetic workspaces and two verified evidence files, with zero remaining test accounts, confirming retained data across the release switch. Database SHA-256: `01204dad4ca1060de668ae73c3e9c8d5d8dafdbc81dcb79b7c6f43d16fc415f4` (110,592 bytes). Its archive was also copied offhost with matching SHA-256 `53cc9e7ede84dd403b0bd70dfb84053ae920bf8395568f02e4b5c1380fd07993`. Production data was not modified by either restore check.

## Remaining work before broad enrollment

- Independent security/accessibility and real participant acceptance; name an accountable operator, confidential conduct contact and retention/removal policy.
- Recurring encrypted offsite backup transfer and recovery-key custody; operational alert delivery and regular recovery rehearsals.
- Apple signing, physical-device acceptance and TestFlight/App Store delivery for the native client. The website is usable in a phone browser now.
- A consenting nonprofit, suitable carbon methodology/program, external land-rights review, verification, registry/custody and payment arrangements for any real carbon/payout workflow.
- Final source review and explicit merge approval; public announcement approval remains separate. No announcement was sent by this deployment.

Start with [account access](https://vergecommon.com/account), [community discovery](https://vergecommon.com/network/) or the [MCP connection guide](../mcp/README.md). Agent discovery is at `https://vergecommon.com/.well-known/mcp.json`, with scoped bearer access at `https://vergecommon.com/mcp`.
