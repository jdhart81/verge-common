# Release: uses, facts and edge bands along the corridor; the corridor story — 15 November 2026

**The corridor's uses, facts and edge bands, and the corridor story on the opening page, went live on vergecommon.com on 15 November 2026 at 21:34:23 UTC**, on the owner's instruction ("merged and deploy") after [PR #90](https://github.com/jdhart81/verge-common/pull/90), [PR #91](https://github.com/jdhart81/verge-common/pull/91) and [PR #92](https://github.com/jdhart81/verge-common/pull/92) merged. The release is production `12e0fec` (v0.11.0) plus only those three changes.

- **Natural corridor is the default.** A woodland co-op can adopt a shared recreation use on a mapped stretch. It needs a corridor that still holds with the ground cleared, the agreement of every holder whose woodlot it crosses, and a co-op vote. There is no override.
- **Facts.** A steward records a right-of-way or a blowdown with its source and another steward reviews it. A right-of-way is recorded even when it breaks a link, and its cleared ground stops counting as forest. A blowdown stays corridor.
- **Edge bands.** A woodlot's holder can plant native tree crops beside the corridor on their own field. A band may not overlap retained forest and never counts as corridor or old growth.
- **Corridor map.** The Woodland tab shows uses, facts and bands over the reviewed layers, and members draw routes and areas there.
- **Opening page.** The landscape tells the corridor story in six captioned scenes, with a pause control and a still view for reduced motion.
- **Stored records keep their meaning.** A project with no adopted use, reviewed fact or band stores, checks and projects exactly as before. The rollback guard refuses older writers once such a record exists.

No environment change. Nothing else from main shipped: the Hindi home page, the invitation card, optional email updates, the MCP listing changes, the quickstart example and the README's open-commons table remain unreleased. The version stays 0.11.0. Environment values and secrets are not recorded here.

| Item               | Value |
| ------------------ | ----- |
| Source commit      | `3378166f3cc52525fdf0f4fcdca42fbfb1d58673` (branch `claude/release-0.11.0-corridor-uses`): production `12e0fec6ca04d1556b65db9ad761670cfff9256d` plus backports of the six commits of #90, #91 and #92 and a release-notes entry. `STATUS.md` was left as it was on the production commit |
| Differences from main | The opening-page captions are English only and live in the landscape component, because the home translations (`lib/i18n`) are not on production; `tests/home-locale.test.mjs` and `docs/QUICKSTART.md` are not on this branch |
| Source archive     | codeload tarball, SHA-256 `269216118fd4f7da400564f63e04b306a43b98e08ba4a57ea15d47ab214fa9b3`, computed independently and matched against the server's download before the image was built |
| Image              | `vergecommon:20261115-corridor-3378166`, `sha256:af29aa0b51adfd81eb0ac01f9afdb3e0dd66a0f027e829637d30544a978fbcf4`, built on the server; the container was started from the image ID |
| Version reported   | `/healthz` reports `0.11.0` and commit `3378166f3cc52525fdf0f4fcdca42fbfb1d58673` |
| Settings           | Only the image and `VERGE_BUILD_COMMIT` changed (27 environment names, none added or removed). `VERGE_WOODLAND_DFM=1` carried over. Mounts, network, no host ports, read-only root, limits and capabilities identical |
| Rollback container | `vergecommon-pre-v0110-20261115T212943Z` (the `12e0fec` image), stopped, no restart policy |
| Data backups       | `/backups/2026-11-15T21-29-44-591Z-y2HYni` at preparation, `/backups/2026-11-15T21-34-22-809Z-ifSV2x` just before the switch and `/backups/2026-11-15T21-34-38-650Z-MZko6B` after it; all three restore checks passed |
| Server receipt     | `/opt/vergecommon/deployments/v0110-20261115T212943Z/` (root only) |
| MCP Registry       | Not republished. The server and its tools did not change; agents cannot propose, agree to, vote on or record any of the new records |
| dendriticforest.com | Not rebuilt |

## Checks

- Before the release, on the release commit: `npm test` 437 pass and 0 fail; `npm run typecheck`, `npm run lint`, `npm run build` and `npm run build:selfhost` passed. The five checks on the pushed branch passed (check, container, imagery, ios, gitleaks).
- On a local self-hosted build of the release commit with woodland on: `tests/woodland_acceptance.py` passed with 10 checks (a blocked and an adopted recreation use, a right-of-way, a blowdown, an edge band, member privacy) and `tests/selfhost_acceptance.py` passed. In Chrome with three synthetic accounts: the corridor map opened, a trail was drawn and proposed, a right-of-way reviewed, a use agreed and put to a vote, and an edge band drawn and sent for review, with no console or page errors. The opening animation was viewed at each scene, paused and with reduced motion.
- Staging on the server, before the switch: the exact image on an empty data directory with no network, no host ports and no secrets, with `VERGE_WOODLAND_DFM=1`. `/healthz` reported `3378166` and 0.11.0; anonymous `tools/list` returned the five public tools; woodland projects were open.
- After the switch, from outside the server: `/healthz` ok at `3378166`, 0.11.0. `/`, `/privacy/`, `/terms/`, `/support/` and `/woodland/` return 200. The home page carries the story captions and the illustration disclaimer; `/woodland/` reports woodland projects open and carries the natural-by-default line. Anonymous `tools/list` returns exactly the five public tools; `Authorization: Bearer not-a-real-token` returns 401; the HSTS header is present. dendriticforest.com returns 200.
- Not run: the new panel was not exercised signed in on production itself, because that needs a member account in a real woodland co-op; it was exercised on the local build of the same commit. Also not run: `scripts/launch-gate.mjs` from the owner Mac and the browser test scripts in `tests/`. The scheduled monitor runs the launch gate against this baseline.

## Known gaps

- **The hosted privacy page's summary did not mention the new records at release.** The full policy (`PRIVACY.md`, linked from that page) does. The page text is corrected on main with this receipt and reaches production with the next release.
- The Hindi captions for the opening animation exist on main, written by the assistant and not yet read by a Hindi speaker. They are not live.
- The corridor map does not highlight the links a blocked proposal would break; the card lists them.
- An edge band's species and a trail's cleared width are as recorded. Nothing verifies them.
- Junctions between co-ops and a carbon program application record are specified (`docs/specs/CORRIDOR_NETWORK_AND_CARBON_SPEC.md`), not built. The opening animation's last scene is captioned as the aim.
- The gaps listed in the earlier 15 November receipt still stand.

## Rollback

On the server: `bash /root/v0110-corridor.sh rollback 20261115T212943Z`. It stops the new container and restores `vergecommon-pre-v0110-20261115T212943Z`, which runs `12e0fec`. `/root/v0110-corridor.sh` is `/root/v0110-oldgrowth.sh` with the expected production commit changed from `7541560` to `12e0fec`.

Run `self-hosted/rollback-check.mjs` first. Once any co-op has a corridor use, fact or band, the `12e0fec` writer cannot protect it: it would ignore adopted cleared ground in plan checks and send every member the full record, including which woodlots a route crosses and other holders' bands. In that case do not roll back to `12e0fec`; fix forward.

## Production baseline

**Completed 15 November 2026 at 21:34:45 UTC, observed live (`2026-11-15T21:34:45.424Z`).** Observed from outside the server: `/healthz` reported status ok, version 0.11.0 and commit `3378166f3cc52525fdf0f4fcdca42fbfb1d58673`.

| Item            | Result                                     |
| --------------- | ------------------------------------------ |
| Reviewed source | `3378166f3cc52525fdf0f4fcdca42fbfb1d58673` |

The source commit lives on branch `claude/release-0.11.0-corridor-uses`. Keep that branch for as long as this is the baseline: the check resolves the commit from git. The earlier release branches hold its ancestors and should be kept as well.
