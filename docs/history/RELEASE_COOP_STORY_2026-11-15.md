# Release: the opening page shows how a co-op works — 15 November 2026

**The reworked opening-page animation went live on vergecommon.com on 15 November 2026 at 22:56:35 UTC**, on the owner's instruction ("deploy") after [PR #94](https://github.com/jdhart81/verge-common/pull/94) merged. The release is production `3378166` (v0.11.0) plus only that change.

- **How a co-op works, in six captioned scenes.** Three neighbors with a woodlot behind each home; they start a co-op and map one corridor through all three; each owner agrees for their own plot, which lights up, connects at its node and turns its stretch of corridor solid; a shared trail goes to a co-op vote while tree crops on a field are the owner's call; the woodlots behind the houses grow old; and, as the aim, the corridor meets the next co-op's.
- **No pause button.** The 40-second loop runs on its own. It stops when scrolled off screen, and a visitor who asks for reduced motion gets the finished scene and one summary line.
- Still labelled an illustration, not a map of real land. SVG and CSS only.

No environment change, no data change. Nothing else from main shipped. The version stays 0.11.0. Environment values and secrets are not recorded here.

| Item               | Value |
| ------------------ | ----- |
| Source commit      | `f91cea061e5141091cc40e2138fd845e9aa4689c` (branch `claude/release-0.11.0-coop-story`): production `3378166f3cc52525fdf0f4fcdca42fbfb1d58673` plus one backport commit touching only `components/conservation-landscape.tsx` and `components/conservation-landscape.css` |
| Differences from main | The captions are English only and live in the landscape component, because the home translations (`lib/i18n`) are not on production; the stylesheet is identical to main |
| Source archive     | codeload tarball, SHA-256 `fe3f93c61e7c80cb58dd25d757a163037f386337d625eed58ecdef36158f3530`, computed independently and matched against the server's download before the image was built |
| Image              | `vergecommon:20261115-coopstory-f91cea0`, `sha256:dfdcc4141a591117e4e4deecfb71956b82be196a224c395659a54b00eda4ddcf`, built on the server; the container was started from the image ID |
| Version reported   | `/healthz` reports `0.11.0` and commit `f91cea061e5141091cc40e2138fd845e9aa4689c` |
| Settings           | Only the image and `VERGE_BUILD_COMMIT` changed (27 environment names, none added or removed). `VERGE_WOODLAND_DFM=1` carried over. Mounts, network, no host ports, read-only root, limits and capabilities identical |
| Rollback container | `vergecommon-pre-v0110-20261115T225524Z` (the `3378166` image), stopped, no restart policy |
| Data backups       | `/backups/2026-11-15T22-55-25-290Z-K47d2T` at preparation, `/backups/2026-11-15T22-56-34-847Z-Px7XWo` just before the switch and `/backups/2026-11-15T22-56-59-146Z-KrTDMB` after it; all three restore checks passed |
| Server receipt     | `/opt/vergecommon/deployments/v0110-20261115T225524Z/` (root only) |
| MCP Registry       | Not republished. The server and its tools did not change |
| dendriticforest.com | Not rebuilt |

## Checks

- Before the release, on the release commit: `npm test` 437 pass and 0 fail; `npm run typecheck`, `npm run build`, `npm run build:selfhost` and `npm run build:public` passed. `npm run lint` reported two deprecation errors in `mcp/server.mjs`; the same two are reported on the previous production commit `3378166`, and this release does not touch that file.
- On main, for the same change (PR #94): 501 tests, typecheck, lint and the three builds passed. On a local self-hosted build, each scene and the reduced-motion view were viewed in Chrome with no console or page errors.
- Staging on the server, before the switch: the exact image on an empty data directory with no network, no host ports and no secrets, with `VERGE_WOODLAND_DFM=1`. `/healthz` reported `f91cea0` and 0.11.0; anonymous `tools/list` returned the five public tools; woodland projects were open.
- After the switch, from outside the server: `/healthz` ok at `f91cea0`, 0.11.0. `/`, `/privacy/`, `/terms/`, `/support/` and `/woodland/` return 200. The home page carries the new captions and the illustration disclaimer and has no pause button; in Chrome the animation runs, the reduced-motion view is still, and there are no console or page errors. Anonymous `tools/list` returns exactly the five public tools; `Authorization: Bearer not-a-real-token` returns 401; the HSTS header is present.
- Not run: the Hindi page and phone width were not re-checked after this rework (Hindi is not live); `scripts/launch-gate.mjs` from the owner Mac; the acceptance suites, since no server code changed. The scheduled monitor runs the launch gate against this baseline.

## Known gaps

- The Hindi captions exist on main, written by the assistant and not yet read by a Hindi speaker. They are not live.
- The hosted privacy page's summary still does not mention corridor uses, facts and bands in production; the corrected text is on main with this receipt and reaches production with the next release that includes it.
- The animation's last scene (meeting the next co-op) is captioned as the aim: junctions between co-ops are specified, not built.
- The gaps listed in the two earlier 15 November receipts still stand.

## Rollback

On the server: `bash /root/v0110-coopstory.sh rollback 20261115T225524Z`. It stops the new container and restores `vergecommon-pre-v0110-20261115T225524Z`, which runs `3378166`. `/root/v0110-coopstory.sh` is `/root/v0110-corridor.sh` with the expected production commit changed from `12e0fec` to `3378166`.

This rollback is safe for stored records: `3378166` and `f91cea0` read and write the same data. Do not roll back further, to `12e0fec`, once any corridor use, fact or band exists; see the earlier receipt.

## Production baseline

**Completed 15 November 2026 at 22:57:38 UTC, observed live (`2026-11-15T22:57:38.201Z`).** Observed from outside the server: `/healthz` reported status ok, version 0.11.0 and commit `f91cea061e5141091cc40e2138fd845e9aa4689c`.

| Item            | Result                                     |
| --------------- | ------------------------------------------ |
| Reviewed source | `f91cea061e5141091cc40e2138fd845e9aa4689c` |

The source commit lives on branch `claude/release-0.11.0-coop-story`. Keep that branch for as long as this is the baseline: the check resolves the commit from git. The earlier release branches hold its ancestors and should be kept as well.
