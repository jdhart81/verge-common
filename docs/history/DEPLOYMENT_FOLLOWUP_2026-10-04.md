# Follow-up deployment — 4 October 2026

**DFM links deployed at 2026-10-04T22:44:04.682828+00:00 UTC (18:44 EDT). VergeCommon final-engine follow-up deployed at 2026-10-04T23:11:15.310904+00:00 UTC (19:11 EDT).** Only the DFM site and app containers were swapped under the owner's self-contained prompt. Woodland remains **unset** in production.

## Delivered behavior

- dendriticforest.com points to `/woodland/` from home and `/woodland/#first-woodlot` from Unbroken Woods. The spine and prairie sections remain present.
- VergeCommon runs exact source `824019ce50d1ab0974369118d00493d78d9058ab`, including the final vendored dfm-core 0.2.0 engine, SHA-256 `dd5d1f41a1cb24ff49cfeb851ab0eaa13df2fa311ffb2fd5a4597046069d16f9`.
- `/woodland/` returns 200 and `data-woodland-open="no"`. Turning woodland projects on remains a separate owner decision.

## Release evidence

| Item | DFM site (task A) | VergeCommon (task B) |
| --- | --- | --- |
| Exact source | `e27dbe4e4e24d0d6288333e74623b354cba0763e` ([hdfm-framework #45](https://github.com/jdhart81/hdfm-framework/pull/45)) | `824019ce50d1ab0974369118d00493d78d9058ab` ([verge-common #41](https://github.com/jdhart81/verge-common/pull/41)) |
| Image tag | `dendriticforest-site:20261004T224012Z-dfm-site` | `vergecommon:20261004-v0100-824019c` |
| Immutable image | `sha256:749ecdf0aa655c902680ff7331a0b57a6f77cb8c03a9cf2099a06c7fc34dde16` | `sha256:50e6c7e46c54576b837a5538be1df60843417101006053fd3bf55212c835b6d3` |
| Actual previous image | `sha256:efd4023a108698471b692cb324623e6fc1bf803119b47a56ccbf1f5536827024` | `sha256:90846e75854b951ade18be70618d787c923f43fca10003f8080624dbe6014cf3` |
| Previous image tag | `dendriticforest-site:20261004T221226Z-dfm-site` | `vergecommon:20261004-v0100-09c1004` |
| Previous source | `2db671074d9f39f4972dd2bd0e61cbc6a9144381` | `09c1004f3fb7a053cf3b7a7b64f57b6a0260b9b7` |
| Retained recovery | Previous site image retained | `vergecommon-pre-824019c`, stopped, restart policy `no` |
| Server receipts | `/opt/vergecommon/deployments/20261004T224012Z-dfm-site` | `/opt/vergecommon/deployments/20261004-v0100-824019c` |

The VergeCommon commit archive SHA-256 is **`778c96b24a6e0b2c7a07961d8d111e9e07f9a5480bf398c5ecf6d64c1b0fecc3`**, independently downloaded and matched locally and on the server. DFM was fetched by full SHA and detached; server HEAD matched. Both contexts used umask 022 and world-readable source files. No source edits were included in either image.

## Checks and health

Task A Docker build: **17 passed, 1 skipped, 0 failed**. The skipped schema test requires a package outside `apps/site`'s build context. `dendriticforest-site-next` ran privately on `vergecommon` with no published port; its health was `ok` and its home contained the woodland link before the swap. Production became Docker healthy. Public `/`, `/unbroken/`, `/data-format/`, `/healthz` all returned **200**. Required line counts were **1 home woodland link, 1 Unbroken anchor link, 1 prairie section, 1 first-woodlot anchor**.

Task B: clean installation, **382 passed / 0 failed / 0 skipped**, lint, typecheck and self-hosted build passed locally and against the exact candidate image. Python and full GnuPG were supplied only inside a disposable check container for the documented operational-test prerequisites; the production image remained unchanged. All **three** self-hosted acceptance suites passed on a private production-data copy; all **seven** woodland acceptance checks passed on separate empty staging with its flag on. Staging containers and private copies were removed. No synthetic acceptance records were created in production.

| Health point | Result |
| --- | --- |
| Initial preflight, 22:37:39 UTC | `ok / 0.10.0 / aab3ba24763d8353978669e2a3d377be7161a99f` |
| Task A resumed before / end | `ok / 0.10.0 / 09c1004f3fb7a053cf3b7a7b64f57b6a0260b9b7` both times |
| Task B before | `ok / 0.10.0 / 09c1004f3fb7a053cf3b7a7b64f57b6a0260b9b7` |
| Task B after / final 23:13:32 UTC | `ok / 0.10.0 / 824019ce50d1ab0974369118d00493d78d9058ab`; Docker healthy |

The exact-source public launch gate returned **25 pass, 0 fail, 9 manual, 0 skipped**. Those nine human qualification gates were not verified by this deployment.

## Data safety and unchanged configuration

A fresh pre-switch backup and isolated restore passed before stopping the old writer. The old writer was explicitly verified stopped before the new writer started. Post-switch backup and isolated restore passed. No snapshot was restored over live data. The candidate rollback guard passed on a **read-only** live-data mount before the switch and again afterward, with `previousWriterCompatible=true` and `productionChanged=false`.

| Backup | Directory | Database SHA-256 | Isolated restore |
| --- | --- | --- | --- |
| predeploy | `/backups/2026-10-04T23-03-47-700Z-K2VWhM` | `3cd0a7b472375b4f6963eae8e9b17ed1037281ccdb364ab4261fa6e374918ad0` | Passed |
| preswitch | `/backups/2026-10-04T23-11-05-376Z-VAcs1V` | `03961d2545a94f1e2eb7870e7fe919085aaefaa4aa09e522815d6edd8b442848` | Passed |
| postdeploy | `/backups/2026-10-04T23-11-11-760Z-8HHG5Y` | `b67592b9a6cd411c8e7dcea49dcbfdb10eb20b5d0ddce4335872307d211237b3` | Passed |

All three snapshots record 294,912 database bytes, 13 committed deletions and 0 evidence files. Staging's own backup/restore also passed.

Environment values matched except `VERGE_BUILD_COMMIT`; production woodland remained absent. App mounts and full runtime flags matched: `vergecommon` network; read-only root; `/tmp` tmpfs `rw,noexec,nosuid,size=128m`; cap-drop ALL; no-new-privileges; 1 GiB memory; 256 PIDs; no published ports; data/backups binds and read-only secret mount. Bind directory permissions remained unchanged. Temporary environment transport stayed on host tmpfs and was erased on success or failure; no values were logged or included here.

Site flags matched: private `vergecommon` network, read-only root, `/tmp` and `/var/cache/nginx` tmpfs, cap-drop ALL, no-new-privileges, 128 MiB, 64 PIDs, no ports or host mounts, restart `unless-stopped`.

Caddyfile SHA-256 before/after both tasks: **`0e5cd755a2264b65d5b110c1a7d77f62be46e8e6eaf2a9cc8c2c273f51a13504`**. `vergecommon-web` retained image `sha256:de23def33b17fb5d1290b0f6c2add1d70780e52341896c00a4c8a2a2fe9d355e` and start time `2026-10-04T01:15:52.174616873Z`. Other deployed containers were unchanged during each completed swap. DNS, firewall, Caddy and secret configuration were not changed.

## Deviations and executed recovery

1. Another deployment moved the app from `aab3ba2` to `09c1004` during preparation. GitHub comparison showed only deployment documentation beyond approved `824019c`. The actual running image was recorded and retained for rollback; the earlier `aab3ba2` container remains stopped separately as `vergecommon-pre-v0100-09c1004`.
2. Task A's first pre-swap inventory guard stopped when an unrelated stopped test container disappeared. The live site was untouched. All deployed container fingerprints and the Caddyfile matched; the resumed check compared deployed containers and reused the same tested image.
3. Initial image-test harness attempts lacked Python, then the GnuPG agent. Complete documented tools were supplied only to a disposable check container, and the final full suite passed. Source and image ID were unchanged.
4. The first app cutover's launch-gate process could not reach public HTTPS from inside the app's private network. **Rollback ran first:** the read-only guard passed, the candidate writer was removed, and the actual predecessor restarted with unchanged configuration; health returned `ok / 0.10.0 / 09c1004`. No backup was restored over live records. The public gate was then verified in a disposable host-network container. The retry used that procedure and passed every check. Production networking stayed unchanged. First-attempt receipts remain under the app receipt directory's `attempt1/`.

## Rollback

For the app, first run the new image's `self-hosted/rollback-check.mjs /data` with a read-only live mount. If it refuses, retain current data and use a compatible repair. If it passes, stop/remove `vergecommon-app`, rename `vergecommon-pre-824019c` to `vergecommon-app`, restore `unless-stopped`, start it, and verify predecessor health. Never run both writers or restore an old snapshot over live records.

For DFM, replace only `dendriticforest-site` with previous immutable image `sha256:efd4023a108698471b692cb324623e6fc1bf803119b47a56ccbf1f5536827024`, using the same recorded flags, then wait for healthy and check both public sites. No Caddy restart is needed. DFM rollback execution was not fault-tested; app rollback was actually exercised above.

## Invariants and owner follow-up

| Rule | A | B |
| --- | --- | --- |
| R1 Approved container scope, woodland off | PASS | PASS, actual predecessor reconciled above |
| R2 Exact reviewed source recorded | PASS | PASS |
| R3 Healthy before and after | PASS | PASS |
| R4 Previous image recorded; failed swap checks restore first | PASS; no site swap failure | PASS; actual rollback verified |
| R5 Combined receipt and matching STATUS PR | PASS; this receipt and STATUS.md | PASS; this receipt and STATUS.md |

No production woodland activation, real-member pilot, real provider sign-in, physical-device acceptance or delivery of outage notifications was verified. The tag is **pending**, as explicitly allowed by the follow-up prompt. Run from the owner's checkout:

```sh
git fetch origin && git tag -a v0.10.0 824019ce50d1ab0974369118d00493d78d9058ab -m "VergeCommon v0.10.0: woodland corridors and the old-growth spine (final dfm-core 0.2.0)" && git push origin v0.10.0
```

Dependency repacking is a separate source PR and a later VergeCommon release; it was not included in these images.
