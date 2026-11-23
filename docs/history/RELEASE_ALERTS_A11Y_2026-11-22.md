# Release: alerts that reach the owner, and two accessibility fixes — 22 November 2026

**Deployed 22 November 2026 at 23:58:32 UTC**, on the owner's instruction ("complete the needed tasks"). The deployed commit is `6b988f1ff95d739a96efda98c79c1749ad18ce35`, the merge of [PR #113](https://github.com/jdhart81/verge-common/pull/113) on `main`; it also contains [PR #112](https://github.com/jdhart81/verge-common/pull/112).

## What changed

- **Monitor alerts are assigned to the repository owner** (PR #112; workflow only, live from its merge at 23:46 UTC). The alerts of 6, 8 and 16 November were opened unassigned and no notification for them is in the owner's inbox. A test alert can now be raised on demand (`test_alert`).
- **A tab panel shows where keyboard focus is**, and selects and disclosure summaries get the shared focus ring (WCAG 2.4.7).
- **The Care & participation tab no longer scrolls sideways on a phone** (WCAG 1.4.10).

No environment change, no schema change. The version stays 0.11.0. Environment values and secrets are not recorded here.

| Item                | Value |
| ------------------- | ----- |
| Source commit       | `6b988f1ff95d739a96efda98c79c1749ad18ce35` on `main` |
| Previous production | `6c83caf024f49ff72bbc013a9ed124cc649df47c` on `main` |
| Source archive      | codeload tarball, SHA-256 `2b62ade97f6a3e6a41c80261ec4a01783e93ad85de2d64093f5d31bc43dea7ca`, computed independently and matched against the server's download before the image was built |
| Image               | `vergecommon:20261123-main-6b988f1`, `sha256:911e0bd23616a3cc40a1b3ce9df387defe881b7122f57c92cda72df6ea2f2072`, built on the server; the container was started from the image ID |
| Version reported    | `/healthz` reports `0.11.0` and commit `6b988f1ff95d739a96efda98c79c1749ad18ce35` |
| Settings            | Only the image and `VERGE_BUILD_COMMIT` changed. Mounts and networks identical |
| Rollback container  | `vergecommon-pre-v0110-20261122T235407Z` (the `6c83caf` image), stopped, no restart policy |
| Data backups        | `/backups/2026-11-22T23-54-07-997Z-3SOw2Z` at preparation, `/backups/2026-11-22T23-58-31-649Z-8YlEfQ` just before the switch and `/backups/2026-11-22T23-58-59-157Z-cfS0zZ` after it; all three restore checks passed |
| Server receipt      | `/opt/vergecommon/deployments/v0110-20261122T235407Z/` (root only) |
| MCP Registry        | Not republished. The five public tools and their names are unchanged |

## Checks

- Before release: `npm test` 528 pass and 0 fail; typecheck; lint; `build:selfhost`; CI green on both PRs.
- Accessibility audit on a local build and again on production after the switch: `/`, `/woodland/`, `/support/`, `/privacy/`, `/report/` and six workspace tabs (twelve locally) with axe-core WCAG 2.1 A/AA rules, 390 px width, 200% text and a keyboard walk. No rule violations, no sideways scrolling, a focus ring on every stop, no keyboard trap. The sign-in and registration pages were checked without axe, which their content security policy blocks.
- Test alert: run 45085149687 opened issue #114 assigned to the owner and closed it two seconds later.
- Staging on the server before the switch: the exact image, no network, empty data; `/healthz` at `6b988f1`; the five public tools; woodland open.
- After the switch, from outside: `/healthz` ok at `6b988f1`; `scripts/launch-gate.mjs --expect-commit 6b988f1…`: 25 pass, 0 fail, 9 manual.
- The production audit used one throwaway account, deleted afterwards with its co-op.
- After the release the container used 47 MB of its 1 GB and logged no errors.

## Not verified

- **That the test alert's notification reached the owner.** Ten minutes after issue #114 no email for it was in the owner's inbox. The owner should check their GitHub notifications and notification settings.
- A screen reader (VoiceOver) and real phones.

## Known limit

GitHub runs the "every 15 minutes" monitor about every five hours (90 scheduled runs in 19 days). An outage can go unnoticed for hours.

## Rollback

On the server: `bash /root/v0110-a11y.sh rollback 20261122T235407Z`. It restores `vergecommon-pre-v0110-20261122T235407Z`, which runs `6c83caf`. The two builds read and write the same records.

## Production baseline

**Completed 22 November 2026 at 23:59:14 UTC, observed live (`2026-11-22T23:59:14.024Z`).** Observed from outside the server: `/healthz` reported status ok, version 0.11.0 and commit `6b988f1ff95d739a96efda98c79c1749ad18ce35`.

| Item            | Result                                     |
| --------------- | ------------------------------------------ |
| Reviewed source | `6b988f1ff95d739a96efda98c79c1749ad18ce35` |
