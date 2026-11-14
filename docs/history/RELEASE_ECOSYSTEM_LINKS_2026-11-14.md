# Release: related open projects in the public footers — 14 November 2026

**The footer links went live on vergecommon.com on 14 November 2026 at 15:10:27 UTC**, on the owner's decision. The release is production `ca4b9fc` (v0.11.0) plus one change: both public footers name the related open projects and point once to Viridis's separate land-plan service.

- Dendritic Forest Management: `https://dendriticforest.com/`
- Global Soil Intelligence Project: `https://globalsoilintelligence.com/`
- Viridis Conservation: `https://viridisconservation.com/ecosystem`
- Land plans from Viridis (separate service): `https://viridisconservation.com/land-plans`

VergeCommon itself still states no price and sells nothing. The links carry no query string. Nothing else from main shipped: the Hindi home page, the invitation card, optional email updates and the MCP listing changes remain unreleased. The version stays 0.11.0. Environment values and secrets are not recorded here.

| Item               | Value                                                                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source commit      | `49a73f7721278046f2633d601cf810c404bc1429` (branch `claude/release-0.11.0-ecosystem-links`): production `ca4b9fcdc59dfb4df5a533fffe314ec879de1e00` plus a backport of #83 only                                      |
| Source archive     | codeload tarball, SHA-256 `b3131ea025df7599ad011dffb1196306bec697039849408a90c38b46e28d6ed0`, computed independently before the server download and matched                                                       |
| Image              | `vergecommon:20261114-links-49a73f7`, `sha256:514f93e36cc29485180005cfd0cc2dc5008851faa4468330289425fd84862ed0`, built on the server; the container was started from the image ID                                  |
| Version reported   | `/healthz` reports `0.11.0` and commit `49a73f7721278046f2633d601cf810c404bc1429`                                                                                                                                 |
| Settings           | Only the image and `VERGE_BUILD_COMMIT` changed (27 environment names, none added or removed). `VERGE_WOODLAND_DFM=1` carried over. Mounts, network, no host ports, read-only root, limits and capabilities identical |
| Rollback container | `vergecommon-pre-v0110-20261114T150542Z` (the `ca4b9fc` image), stopped, no restart policy                                                                                                                         |
| Data backups       | `/backups/2026-11-14T15-05-43-335Z-D0Nua6` at preparation, `/backups/2026-11-14T15-10-26-459Z-i1lnEH` just before the switch and `/backups/2026-11-14T15-10-50-625Z-0NENEw` after it; all three restore checks passed |
| Server receipt     | `/opt/vergecommon/deployments/v0110-20261114T150542Z/` (root only)                                                                                                                                                |
| MCP Registry       | Not republished. The server and its tools did not change                                                                                                                                                          |

## Checks

- Before the release: on the release commit, `npm test` 405 pass and 0 fail, `npm run typecheck`, `npm run lint`, `npm run build` and the self-hosted build passed. The five checks on the pushed branch passed (check, container, imagery, ios, gitleaks).
- Staging, before the switch: the exact image on an empty data directory with no network, no host ports and no secrets, with `VERGE_WOODLAND_DFM=1`. `/healthz` reported `49a73f7` and 0.11.0; anonymous `tools/list` returned the five public tools; woodland projects were open.
- After the switch, from outside the server: `/healthz` ok at `49a73f7`, 0.11.0. `/`, `/privacy/`, `/terms/`, `/support/` and `/woodland/` return 200 and each carries the four links. Anonymous `tools/list` returns exactly the five public tools; `Authorization: Bearer not-a-real-token` returns 401; `/woodland/` reports woodland projects open; the HSTS header is present.
- Not run: `scripts/launch-gate.mjs` from the owner Mac and `tests/woodland_acceptance.py` against production. The scheduled monitor runs the launch gate against this baseline.

## Also on 14 November 2026: dendriticforest.com

The static site container was rebuilt from hdfm-framework `0a9c9de6d2e5a98897f186e2ac57a109b1afd11d` (image `dendriticforest-site:20261114T150351Z-dfm-site`, `sha256:8f12aec5a9e22403e22a30857dec8c1a5e16b296be58a24a391a7765f8a68a45`) with the same run flags. Its footer now links VergeCommon, the Global Soil Intelligence Project and Viridis. The Caddyfile and the proxy were not touched. The previous container is kept stopped as `dendriticforest-site-prev-20261114T150351Z-dfm-site`. From outside: `/`, `/unbroken/` and `/data-format/` return 200 with the links, a missing page returns 404, the CSP and HSTS headers are present and `www` redirects.

## Rollback

On the server: `bash /root/v0110-links.sh rollback 20261114T150542Z`. It stops the new container and restores `vergecommon-pre-v0110-20261114T150542Z`, which runs `ca4b9fc` with woodland projects on. `/root/v0110-links.sh` is `/root/v0110.sh` with the expected production commit changed from `5d1a276` to `ca4b9fc`.

## Known gaps for the next release

- Main carries the same footer row with two Hindi labels (`relatedProjects`, `viridisServices`) that a fluent speaker has not reviewed.
- The gaps listed in the 0.11.0 receipt still stand.

## Production baseline

**Completed 14 November 2026 at 15:11:12 UTC, observed live (`2026-11-14T15:11:12.583Z`).** Observed from outside the server: `/healthz` reported status ok, version 0.11.0 and commit `49a73f7721278046f2633d601cf810c404bc1429`.

| Item            | Result                                     |
| --------------- | ------------------------------------------ |
| Reviewed source | `49a73f7721278046f2633d601cf810c404bc1429` |

The source commit lives on branch `claude/release-0.11.0-ecosystem-links`. Keep that branch for as long as this is the baseline: the check resolves the commit from git.
