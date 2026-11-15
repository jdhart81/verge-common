# Release: the old-growth corridor first, on dfm-core 0.3.0 — 15 November 2026

**Native old growth went live on vergecommon.com on 15 November 2026 at 15:11:03 UTC**, on the owner's instruction to update the websites after [PR #88](https://github.com/jdhart81/verge-common/pull/88) merged. The release is production `7541560` (v0.11.0) plus one change: woodland projects lead with the old-growth corridor and run the dfm-core 0.3.0 engine.

- **Woodland page:** [/woodland/](https://vergecommon.com/woodland/) opens with "Map the old-growth corridor that runs through your woods, then plan harvests that keep it connected while it ages toward old growth."
- **Engine:** `vendor/viridis-dfm-core-0.3.0.tgz` (SHA-256 `764ba7329a320f244f8638b38a992f8e5af0c2f12f1cd26bbaee632253136514`) replaces the 0.2.0 tarball. New results carry the engine names `dfm-connectivity-0.3.0`, `dfm-spine-0.3.0` and `dfm-outlook-0.3.0`.
- **Native old growth:** retained corridors and core areas can record stand origin, remnant status and native share, each with its source. A plantation never counts at old-growth age. A corridor-permitted restoration planting can list its species and stays permitted only when all are native.
- **Stored records keep their meaning.** Layers, settings and plans without the new records are stored as before and give the results 0.2.0 gave, apart from the engine names. Production's earlier 0.2.0 tarball differs from the one on main only in a devDependency version, so the recorded 0.2.0 results in `tests/dfm-results-0.2.0-watershed.json` apply to it.

No database, MCP, permission or environment change. Nothing else from main shipped: the Hindi home page, the invitation card, optional email updates, the MCP listing changes, the quickstart example and the README's open-commons table remain unreleased. The version stays 0.11.0. Environment values and secrets are not recorded here.

| Item               | Value |
| ------------------ | ----- |
| Source commit      | `12e0fec6ca04d1556b65db9ad761670cfff9256d` (branch `claude/release-0.11.0-old-growth`): production `754156087e12da2a25a5603595f96d28abbf0f0c` plus a backport of #88 only (main `5dd46a3`). `STATUS.md` was left as it was on the production commit |
| Source archive     | codeload tarball, SHA-256 `b89fffe69817593dc84742e30cf76d6c3739cee6cfeb93924a98fb255d71ade6`, computed independently and matched against the server's download before the image was built |
| Image              | `vergecommon:20261115-oldgrowth-12e0fec`, `sha256:d87928fc359742597fa79aba3da78f9f17ecacd3a6c37aa7f3ce244758ff9a49`, built on the server; the container was started from the image ID |
| Version reported   | `/healthz` reports `0.11.0` and commit `12e0fec6ca04d1556b65db9ad761670cfff9256d` |
| Settings           | Only the image and `VERGE_BUILD_COMMIT` changed (27 environment names, none added or removed). `VERGE_WOODLAND_DFM=1` carried over. Mounts, network, no host ports, read-only root, limits and capabilities identical |
| Rollback container | `vergecommon-pre-v0110-20261115T150617Z` (the `7541560` image), stopped, no restart policy |
| Data backups       | `/backups/2026-11-15T15-06-18-628Z-tzWSaQ` at preparation, `/backups/2026-11-15T15-11-02-185Z-u7LkbB` just before the switch and `/backups/2026-11-15T15-11-18-160Z-jE7QYv` after it; all three restore checks passed |
| Server receipt     | `/opt/vergecommon/deployments/v0110-20261115T150617Z/` (root only) |
| MCP Registry       | Not republished. The server and its tools did not change |
| dendriticforest.com | Not rebuilt. It already serves hdfm-framework's current site source, including the native old-growth section and the data-format properties; [hdfm-framework #69](https://github.com/jdhart81/hdfm-framework/pull/69) changed only the repository README |

## Checks

- Before the release: on the release commit, `npm test` 417 pass and 0 fail, `npm run typecheck`, `npm run lint` and `npm run build` passed. The five checks on the pushed branch passed (check, container, imagery, ios, gitleaks). On main, #88 passed the same checks with 480 tests.
- Staging, before the switch: the exact image on an empty data directory with no network, no host ports and no secrets, with `VERGE_WOODLAND_DFM=1`. `/healthz` reported `12e0fec` and 0.11.0; anonymous `tools/list` returned the five public tools; woodland projects were open.
- After the switch, from outside the server: `/healthz` ok at `12e0fec`, 0.11.0. `/`, `/privacy/`, `/terms/`, `/support/` and `/woodland/` return 200. `/woodland/` carries the new lead sentence and the native old-growth line, reports woodland projects open and still carries the related-projects row. Anonymous `tools/list` returns exactly the five public tools; `Authorization: Bearer not-a-real-token` returns 401; the HSTS header is present. dendriticforest.com returns 200.
- Not run: the new editor fields and the spine panel were not exercised in a signed-in browser session on production, because that needs a member account in a woodland co-op. They are covered by `tests/woodland-native.test.mjs`. Also not run: `scripts/launch-gate.mjs` from the owner Mac, `tests/woodland_acceptance.py` against production and the browser tests (`tests/browser-woodland*.mjs`). The scheduled monitor runs the launch gate against this baseline.

## Rollback

On the server: `bash /root/v0110-oldgrowth.sh rollback 20261115T150617Z`. It stops the new container and restores `vergecommon-pre-v0110-20261115T150617Z`, which runs `7541560` with woodland projects on. `/root/v0110-oldgrowth.sh` is `/root/v0110-landpackage.sh` with the expected production commit changed from `49a73f7` to `7541560`.

After a rollback, layers or plans saved under this release that record stand origin, native share, remnant status or a species list keep those values in storage, but the 0.2.0 engine does not read them.

## Known gaps for the next release

- The native-only planting policy applies to every corridor planting only once a co-op records a native-status source in its layers; without one, a planting that lists no species is checked as before.
- The in-app footer still reads "Land plans from Viridis (separate service)". The README sentence about professional old-growth corridor mapping is not on the hosted pages.
- The gaps listed in the 14 November receipts and the 0.11.0 receipt still stand.

## Production baseline

**Completed 15 November 2026 at 15:11:24 UTC, observed live (`2026-11-15T15:11:24.930Z`).** Observed from outside the server: `/healthz` reported status ok, version 0.11.0 and commit `12e0fec6ca04d1556b65db9ad761670cfff9256d`.

| Item            | Result                                     |
| --------------- | ------------------------------------------ |
| Reviewed source | `12e0fec6ca04d1556b65db9ad761670cfff9256d` |

The source commit lives on branch `claude/release-0.11.0-old-growth`. Keep that branch for as long as this is the baseline: the check resolves the commit from git. The earlier branches `claude/release-0.11.0-land-package` and `claude/release-0.11.0-ecosystem-links` hold its ancestors and should be kept as well.
