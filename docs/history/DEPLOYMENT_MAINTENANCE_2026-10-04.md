# VergeCommon maintenance deployment — 4 October 2026

**Completed 4 October 2026 at 20:33:11 EDT (`2026-10-05T00:33:11.880182Z`).** VergeCommon runs healthy v0.10.0 source `914793054eb8e1b0e86a833d30a40db5acb0e204`, including the merged dependency maintenance and documentation. Its exact-source public launch gate passed **25 pass, 0 fail, 9 manual, 0 skipped** from the owner Mac. Woodland remains off. The DFM site remains healthy at `e27dbe4` with its links live. The existing public `v0.10.0` tag remains on `824019ce`; no tag was replaced.

## Reviewed repository changes

| Repository / PR | Result |
| --- | --- |
| [verge-common #31](https://github.com/jdhart81/verge-common/pull/31) | Merged as `2741343428d20200daa994e7c3fe8dc22ec94cd6`; vinext 1.0.0-beta.12. Clean install and all six main checks passed afterward. |
| [verge-common #30](https://github.com/jdhart81/verge-common/pull/30) | Merged as `e3cd364aa4d46a8189708c8053dbaaa2f4c73505`; grouped minor/patch dependencies. Clean install and all six main checks passed afterward. |
| [verge-common #39](https://github.com/jdhart81/verge-common/pull/39) | Merged as `914793054eb8e1b0e86a833d30a40db5acb0e204`; the historical DFM receipt/screenshots, exact history-index row and current STATUS. The sole merge conflict was STATUS text, resolved by retaining current main's deployment/tag facts. Final PR checks passed and GitHub reported CLEAN before merge; all six main checks passed afterward. |
| [hdfm-framework #46](https://github.com/jdhart81/hdfm-framework/pull/46) | Merged as `0f660ffeadcd8271e2cc585a1d62b222938fd73a`; refreshed dependencies and repacked dfm-core 0.2.0. Main checks passed, including vendored dfm-core drift. |

The stale hdfm-framework #41 is closed, unmerged; #46 supplies the reviewed replacement. The new HDFM tarball SHA-256 is `4c79dc3b1763a57abe867fc4efc38d6389c2573fe3f7b5babe47b545fd4075e3`. It was **not re-vendored into VergeCommon**. This app candidate retains dfm-core tarball SHA-256 `dd5d1f41a1cb24ff49cfeb851ab0eaa13df2fa311ffb2fd5a4597046069d16f9`.

## Maintenance release evidence

| Item | Result |
| --- | --- |
| Reviewed source | `914793054eb8e1b0e86a833d30a40db5acb0e204` |
| Version | `0.10.0` |
| Source archive SHA-256 | `8a838a15e4830fe8e80aebcf91a5babe23c59e5afe960c973497fa013656627a`, independently matched locally and on the server |
| Deployed image tag | `vergecommon:20261004-v0100-9147930` |
| Immutable image ID | `sha256:1b4dbe3d8988203d0639f7673ef86b6c7da8eae2ed344cae2639efc57ee001db` |
| Actual preceding source | `824019ce50d1ab0974369118d00493d78d9058ab` |
| Actual preceding image | `sha256:50e6c7e46c54576b837a5538be1df60843417101006053fd3bf55212c835b6d3` |
| Retained predecessor | `vergecommon-pre-v0100-9147930`, stopped with restart policy `no` |
| Writer stopped | `2026-10-05T00:32:48Z` (4 October, 20:32:48 EDT) |
| Writer started | `2026-10-05T00:32:51.044821752Z` (4 October, 20:32:51 EDT) |
| Candidate healthy | `2026-10-05T00:32:54Z` (4 October, 20:32:54 EDT); Docker healthy confirmed before finalization |
| Public health | `ok / vergecommon / 0.10.0 / 914793054eb8e1b0e86a833d30a40db5acb0e204` |
| Launch gate | Exact-source owner-Mac run: **25 pass, 0 fail, 9 manual, 0 skipped** |
| External gate JSON SHA-256 | `df4991466f032f61a8a500042f810174f513c816bce0261172c0e755713603ae`, matched on finalization |
| Woodland | Production flag absent; public `data-woodland-open="no"` |
| Chain result | `exit=0`; canonical `deployment.json` reports `status=completed` |
| Server receipts | `/opt/vergecommon/deployments/20261004-v0100-9147930` |

## Preserved preflight aborts and corrections

1. The first preparation attempt preserved `invalid-private-health-probe-driver-stop.json` (`phase=prepare`, `exitCode=1`). The private probe sent an untrusted loopback hostname and received HTTP 400; the running application's existing health check requires `Host: vergecommon.com`. Public health, Docker health and the sole production writer remained healthy and unchanged. No image build, backup, staging or production cutover occurred. The operational probe was corrected to use `node:http.get` with that existing trusted hostname, matching the Docker health check; it then returned the expected healthy `824019ce` with HTTP 200.
2. After staging passed, the first switch preflight preserved `config-equivalence-preflight-driver-stop.json` (`phase=switch`, `exitCode=1`). The configuration comparison treated order differences in identical bind entries and Docker's default `OomKillDisable=null` versus `false` as changes. Both allow normal OOM killing; no actual runtime configuration difference existed. The configuration-check container was created but never started, then removed. The abort occurred before the pre-switch backup or stopping the production writer. The operational fingerprint was corrected to sort binds and normalize only that default null/false representation; actual OOM-disable, memory, mount and PID changes remain rejectable. The corrected comparison passed before the successful switch.

Both original abort receipts are retained. These corrections changed only operational probes/fingerprints, with no application source edits, production configuration changes, staging acceptance failure or actual app-health regression. **No rollback was triggered in this maintenance release.** The actual rollback recorded in the older final-engine receipt remains a separate historical event.

## Staging, backups and runtime preservation

The exact deployed image passed all **three self-hosted acceptance suites** on a fresh backup copy, with loopback-only bindings, no provider environment and no secrets mount. Push subscriptions and pending provider revocations were cleared in the copy; both recorded 0 before and after sanitization. Staging backup/restore passed. Woodland acceptance passed on a separate empty directory with its flag on. The read-only rollback guard passed during staging, immediately pre-switch and post-switch. Synthetic acceptance records were confined to staging.

| Backup | Directory | Database SHA-256 | Isolated restore |
| --- | --- | --- | --- |
| Pre-deploy | `/backups/2026-10-05T00-25-14-973Z-ADFIKC` | `dec73afe6f5b644f82196d88dc89236f5bd4394d9933cdfb8c9aa00a29e38f1e` | Passed; matching hash; production unchanged |
| Immediately pre-switch | `/backups/2026-10-05T00-32-44-683Z-f1oVpC` | `2e8d08b0999784650c77dcecaa75db0f8564283d1dc02c135c3597be87481224` | Passed; matching hash; production unchanged |
| Post-deploy | `/backups/2026-10-05T00-32-54-209Z-uIkhPK` | `26b814ea162de7d99d9b01afd7e50aa0549564fde17e889f639439f1e5ba044c` | Passed; matching hash; production unchanged |

All three snapshots recorded 294,912 database bytes, 13 committed deletions and 0 evidence files; isolated restores recorded 6 workspaces and 2 users. Writer receipts confirmed zero writers between stopping the predecessor and starting the candidate, then exactly one `vergecommon-app` writer after startup and at finalization. No older backup was restored over live data. Historical predecessors, including `vergecommon-pre-v0100-aab3ba2`, were not removed.

Before/after and final fingerprints passed: production environment values unchanged except `VERGE_BUILD_COMMIT`; runtime flags, mounts, command, bind permissions, Caddy and other containers unchanged. Production retains the private `vergecommon` network, no host ports, read-only root, 1 GiB memory, 256 PIDs, dropped capabilities, `no-new-privileges`, `/tmp` tmpfs and existing data/backups/read-only secrets mounts. Environment values and secrets were not printed or included here. Caddyfile SHA-256 remained `0e5cd755a2264b65d5b110c1a7d77f62be46e8e6eaf2a9cc8c2c273f51a13504`. Immediately before cutover, `/` had **13,200,130,048 bytes available**, above the required 5 GiB.

The owner authorized the public launch gate to run from the exact-source Mac checkout. Server-local app/Docker health, recovery checks and fingerprints run before external acceptance. A valid external FAIL invokes guarded rollback and STOP. Incomplete or invalid external gate evidence leaves the switched release pending for owner attention. Recovery receipt/log failures cannot suppress the rollback attempt; strict writer and read-only compatibility checks remain mandatory. Finalization commits canonical `deployment.json` by atomic rename last.

## Reconciled earlier deployments

The [initial v0.10.0 receipt](DEPLOYMENT_V0100_2026-10-04.md), [DFM public-site receipt](DEPLOYMENT_DFM_SITE_2026-10-03.md), and [final-engine / DFM-link follow-up receipt](DEPLOYMENT_FOLLOWUP_2026-10-04.md) remain unchanged historical records.

The intervening `09c1004f3fb7a053cf3b7a7b64f57b6a0260b9b7` deployment completed at `2026-10-04T22:42:14Z`, according to `/opt/vergecommon/deployments/20261004-v0100-09c1004/deployment.json`; its retained chain receipt reports `exit=0`. Its image was `sha256:90846e75854b951ade18be70618d787c923f43fca10003f8080624dbe6014cf3`, with prior image `sha256:0c1ed3f2207750f32c33da63b06732d7476237cf511d0ff9c1917d792475354d` retained as `vergecommon-pre-v0100-09c1004`. The receipt reported healthy v0.10.0 / `09c1004`, woodland off. Source-archive SHA-256 `175c5c6730cc58d596f6d93e68e96c51eb245bbc1fc560e8e4e3c9462b74ee59` independently matches codeload locally and on the server. Collected staging logs record all three self-hosted suites and all seven woodland acceptance checks passing. An external launch-gate receipt for `09c1004` is **unavailable**; no gate counts are inferred from chain success. Exact writer-switch timestamps have not yet been collected for this reconciliation.

| Earlier `09c1004` backup | Directory | Database SHA-256 | Isolated restore |
| --- | --- | --- | --- |
| Pre-deploy | `/backups/2026-10-04T22-40-08-142Z-5Viv7L` | `1ebf887276886f6c8f76ec65234eb6f88620b982859dd3f123def1047f5d4e8c` | Passed; matching hash; production unchanged |
| Pre-switch | `/backups/2026-10-04T22-40-54-181Z-pCnFZ0` | `d3482f653983c8dd9e5307c132e174fd7f18ce0586c5f04511dc067b43a505a2` | Passed; matching hash; production unchanged |
| Post-deploy | `/backups/2026-10-04T22-40-58-899Z-Cg4cpU` | `d2f2bff0728575e1bb79803bb25a49d8ed9482eac24b7c4583d3a996045a896f` | Passed; matching hash; production unchanged |

The `824019ce` final-engine release completed at 23:11 UTC (19:11 EDT) on 4 October; its archive, images, predecessor, three backups, restores, staging and **25/0/9** launch gate are recorded in the existing follow-up receipt. That receipt also records an actual guarded rollback to `09c1004` before its successful retry. This new maintenance release does not rewrite or hide that recovery event.

## DFM site and public checks

The DFM site remains at reviewed source `e27dbe4e4e24d0d6288333e74623b354cba0763e`, image `sha256:749ecdf0aa655c902680ff7331a0b57a6f77cb8c03a9cf2099a06c7fc34dde16`, deployed at 22:44 UTC (18:44 EDT) on 4 October. The owner waived another DFM redeploy after confirming its links already live. HDFM repository main is newer after #46; that does not change the deployed static site's recorded source.

Fresh read-only public verification after the app deployment, at `2026-10-05T00:34:38.756Z` (4 October, 20:34 EDT), recorded:

| Check | Result |
| --- | --- |
| Home | 200; CSP; HSTS `max-age=31536000` |
| `/unbroken/` | 200; links to `https://vergecommon.com/woodland/` and `https://vergecommon.com/woodland/#first-woodlot` |
| `/data-format/` | 200 |
| `/missing` | 404 |
| `www` | 301 to `https://dendriticforest.com/` |

The same check confirmed healthy VergeCommon `9147930`. Final server fingerprints show the DFM image and its complete container fingerprint unchanged through the app switch. The recorded DFM source remains `e27dbe4`; no DFM redeploy occurred in this maintenance task.

## Tag and remaining owner gates

- Existing annotated `v0.10.0` remains on `824019ce50d1ab0974369118d00493d78d9058ab`, tag object `1fee3843d3f653d43a5e8b06d48a0b5100a3988a`. The requested alternative target `aab3ba2` would replace a public tag and remains a separate owner decision; it was not executed as part of this maintenance release.
- [verge-common #32](https://github.com/jdhart81/verge-common/pull/32) stays open on the pilot hold.
- [hdfm-framework #24](https://github.com/jdhart81/hdfm-framework/pull/24) stays open awaiting the outside contributor's sign-off. The first-time workflow was already approved and two polite requests were already posted; no duplicate request was sent during this handoff.
- The repacked HDFM tarball requires a separate reviewed VergeCommon source change and later release; it was not re-vendored here.
- Woodland activation waits for a confirmed woodlot group and the owner's pilot-start decision. The production flag remains off; 1 GiB container memory does not establish pilot qualification.
- The build-tooling braces audit finding awaits an upstream fix. No forced dependency upgrade was applied.
- Fresh external certificate observations show VergeCommon expiry `2026-12-18T12:09:56Z` and DFM expiry `2027-01-02T00:17:23Z`. The initial deployment receipt's 3 November expiry is historical, not the current certificate. Caddy handles automatic renewal.
- The nine manual operational/pilot gates remain manual. This maintenance task does not establish independent key custody, second-operator readiness, physical-device acceptance, real member use, outage-notification delivery or ecological results.

This receipt is based on canonical maintenance `deployment.json`, the three backup/restore pairs, staging receipts, owner-Mac gate/public-health/woodland receipts, unchanged-runtime fingerprints and the fresh DFM check. Source-archive and external-gate hashes were independently rechecked against the collected local files. Original preflight aborts and all earlier deployment/recovery records remain preserved.
