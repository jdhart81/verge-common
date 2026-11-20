# Release: the one Viridis services link points at corridor mapping — 20 November 2026

**Deployed 20 November 2026 at 02:20:47 UTC**, on the owner's instruction. The deployed commit is `6c83caf024f49ff72bbc013a9ed124cc649df47c`, the merge of [PR #109](https://github.com/jdhart81/verge-common/pull/109) on `main`.

## What changed for visitors

- The single link to Viridis services (rule R2 in `lib/related-projects.mjs`) now reads "Old-growth corridor mapping from Viridis (separate service)" and leads to `https://viridisconservation.com/corridor-mapping`. Corridor layers are what a woodland co-op needs first, and that page offers professional old-growth corridor mapping.
- Still one services link, still labelled as a separate service, and still no price or purchase language in VergeCommon (R1).
- The README's "Try it in ChatGPT" section (PR #110) is on `main` and so in this build's source; it changes no served page.

The Hindi label was rewritten without a Hindi speaker's review. The Hindi home page is off, so nobody sees it yet. No environment change, no schema change. The version stays 0.11.0. Environment values and secrets are not recorded here.

| Item                | Value |
| ------------------- | ----- |
| Source commit       | `6c83caf024f49ff72bbc013a9ed124cc649df47c` on `main` |
| Previous production | `ac5021700e387743f63f6b25e39511ebcb04d9a8` on `main` |
| Source archive      | codeload tarball, SHA-256 `1baf9d573fc6fb5993dfc4d29dc46e416cf75e3b534a3f15ee578d67b79d349e`, computed independently and matched against the server's download before the image was built |
| Image               | `vergecommon:20261120-main-6c83caf`, `sha256:e018d288b1bbe2caf0bb85e3e8a249767411af6d59fc9e833e75801fd9f0638b`, built on the server; the container was started from the image ID |
| Version reported    | `/healthz` reports `0.11.0` and commit `6c83caf024f49ff72bbc013a9ed124cc649df47c` |
| Settings            | Only the image and `VERGE_BUILD_COMMIT` changed. Mounts and networks identical |
| Rollback container  | `vergecommon-pre-v0110-20261120T021639Z` (the `ac50217` image), stopped, no restart policy |
| Data backups        | `/backups/2026-11-20T02-16-40-594Z-5ZCg0C` at preparation, `/backups/2026-11-20T02-20-47-009Z-03Nk9l` just before the switch and `/backups/2026-11-20T02-21-20-299Z-W4wlzr` after it; all three restore checks passed |
| Server receipt      | `/opt/vergecommon/deployments/v0110-20261120T021639Z/` (root only) |
| MCP Registry        | Not republished. The five public tools and their names are unchanged |

## Checks

- Before release: `npm test` 526 pass and 0 fail on the PR branch; typecheck; lint; CI green on the PR. The services-link tests were rerun on the merge commit.
- The destination was live first: `https://viridisconservation.com/corridor-mapping` returned 200 at 02:15 UTC with the service name, the structural-connectivity caveat and no checkout.
- Staging on the server before the switch: the exact image, no network, empty data; `/healthz` at `6c83caf`; the five public tools; woodland open.
- After the switch, from outside: `/healthz` ok at `6c83caf`; the home page carries the new link and label and no link to `/land-plans`; `scripts/launch-gate.mjs --expect-commit 6c83caf…`: 25 pass, 0 fail, 9 manual.
- After the release the container used 46 MB of its 1 GB and logged no errors.

## Not verified

- A signed-in browser walk on production for this release; the change is one link and its label.

## Rollback

On the server: `bash /root/v0110-link.sh rollback 20261120T021639Z`. It restores `vergecommon-pre-v0110-20261120T021639Z`, which runs `ac50217`. The two builds read and write the same records.

## Production baseline

**Completed 20 November 2026 at 02:21:22 UTC, observed live (`2026-11-20T02:21:22.318Z`).** Observed from outside the server: `/healthz` reported status ok, version 0.11.0 and commit `6c83caf024f49ff72bbc013a9ed124cc649df47c`.

| Item            | Result                                     |
| --------------- | ------------------------------------------ |
| Reviewed source | `6c83caf024f49ff72bbc013a9ed124cc649df47c` |
