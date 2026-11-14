# Release: woodland downloads as a Land Package — 14 November 2026

**Woodland Land Package downloads went live on vergecommon.com on 14 November 2026 at 20:51:21 UTC**, on the owner's standing instruction to connect the open projects. The release is production `49a73f7` (v0.11.0) plus one change: a woodland draft and a checked plan can be downloaded as a [Land Package](https://viridisconservation.com/ecosystem/land-package), the open exchange format read by the Viridis Ecological OS decision workspace.

- **Draft:** a **Download Land Package** button beside **Download Landscape Package**.
- **Checked plan (stewards):** a **Download as Land Package** button beside **Download check inputs**, with a line saying the file is marked as personal data and should stay within the co-op.
- The conversion runs in the browser with `lib/land-package.mjs`, a byte-identical copy of `js/land_package.mjs` from [viridisconservation/land-package](https://github.com/viridisconservation/land-package) at `cd2021d` (Apache-2.0), loaded on demand. Nothing is sent to a server.

No server, database, MCP, permission or dependency change. Nothing else from main shipped: the Hindi home page, the invitation card, optional email updates and the MCP listing changes remain unreleased. The version stays 0.11.0. Environment values and secrets are not recorded here.

| Item               | Value |
| ------------------ | ----- |
| Source commit      | `754156087e12da2a25a5603595f96d28abbf0f0c` (branch `claude/release-0.11.0-land-package`): production `49a73f7721278046f2633d601cf810c404bc1429` plus a backport of #85 only. `STATUS.md` was left as it was on the production commit |
| Source archive     | codeload tarball, SHA-256 `d30a0524e834d16ea4724e7be84f187b7b0b7a2a8598d712b9c223043a69e282`, computed independently and matched against the server's download before the image was staged |
| Image              | `vergecommon:20261114-landpackage-7541560`, `sha256:4ffab80df783edb5b2c758cbc97eea1c88d3e2042d75a4eae14f0a1018dc3f9b`, built on the server; the container was started from the image ID |
| Version reported   | `/healthz` reports `0.11.0` and commit `754156087e12da2a25a5603595f96d28abbf0f0c` |
| Settings           | Only the image and `VERGE_BUILD_COMMIT` changed (27 environment names, none added or removed). `VERGE_WOODLAND_DFM=1` carried over. Mounts, network, no host ports, read-only root, limits and capabilities identical |
| Rollback container | `vergecommon-pre-v0110-20261114T204623Z` (the `49a73f7` image), stopped, no restart policy |
| Data backups       | `/backups/2026-11-14T20-46-24-361Z-5CPpdn` at preparation, `/backups/2026-11-14T20-51-20-315Z-Avk7Cq` just before the switch and `/backups/2026-11-14T20-52-48-325Z-zOgGIU` after it; all three restore checks passed |
| Server receipt     | `/opt/vergecommon/deployments/v0110-20261114T204623Z/` (root only) |
| MCP Registry       | Not republished. The server and its tools did not change |

## Checks

- Before the release: on the release commit, `npm test` 409 pass and 0 fail, `npm run typecheck`, `npm run lint` and `npm run build` passed. The five checks on the pushed branch passed (check, container, imagery, ios, gitleaks). On main, #85 passed the same checks with 472 tests.
- Staging, before the switch: the exact image on an empty data directory with no network, no host ports and no secrets, with `VERGE_WOODLAND_DFM=1`. `/healthz` reported `7541560` and 0.11.0; anonymous `tools/list` returned the five public tools; woodland projects were open.
- After the switch, from outside the server: `/healthz` ok at `7541560`, 0.11.0. `/`, `/privacy/`, `/terms/`, `/support/` and `/woodland/` return 200 and each still carries the related-projects row. Anonymous `tools/list` returns exactly the five public tools; `Authorization: Bearer not-a-real-token` returns 401; `/woodland/` reports woodland projects open; the HSTS header is present. The served woodland panel script contains the new button, and the converter script it loads on demand returns 200.
- Not run: the two new buttons were not pressed in a signed-in browser session on production, because that needs a member account in a woodland co-op. The conversion they call is covered by `tests/land-package.test.mjs` and the same converter file runs in the browser on viridisconservation.com. Also not run: `scripts/launch-gate.mjs` from the owner Mac and `tests/woodland_acceptance.py` against production. The scheduled monitor runs the launch gate against this baseline.

## Rollback

On the server: `bash /root/v0110-landpackage.sh rollback 20261114T204623Z`. It stops the new container and restores `vergecommon-pre-v0110-20261114T204623Z`, which runs `49a73f7` with woodland projects on. `/root/v0110-landpackage.sh` is `/root/v0110-links.sh` with the expected production commit changed from `ca4b9fc` to `49a73f7`.

## Known gaps for the next release

- VergeCommon's Landscape Packages record no data sources, so each layer of a downloaded Land Package carries the source `unrecorded` and a validator warning.
- A downloaded Land Package carries the check's inputs, not its result.
- The gaps listed in the earlier 14 November receipt and the 0.11.0 receipt still stand.

## Production baseline

**Completed 14 November 2026 at 20:52:55 UTC, observed live (`2026-11-14T20:52:55.773Z`).** Observed from outside the server: `/healthz` reported status ok, version 0.11.0 and commit `754156087e12da2a25a5603595f96d28abbf0f0c`.

| Item            | Result                                     |
| --------------- | ------------------------------------------ |
| Reviewed source | `754156087e12da2a25a5603595f96d28abbf0f0c` |

The source commit lives on branch `claude/release-0.11.0-land-package`. Keep that branch for as long as this is the baseline: the check resolves the commit from git. The earlier branch `claude/release-0.11.0-ecosystem-links` holds its parent and should be kept as well.
