# Release: an easier first day for a new co-op — 16 November 2026

**The first-day changes went live on vergecommon.com on 16 November 2026 at 02:17:45 UTC**, on the owner's instruction ("you make the call on the decisions … and deploy when ready") after [PR #96](https://github.com/jdhart81/verge-common/pull/96) merged. The release is production `f91cea0` (v0.11.0) plus only #96 and its follow-up [PR #97](https://github.com/jdhart81/verge-common/pull/97). **PR #97 was open, not merged, when this release went out**; this receipt is part of that pull request.

The changes came from walking the whole app as a new customer on the live build the evening before (three test members and an outsider, on a local copy; no test data in production).

- **Everyday tabs first.** A co-op opens on nine tabs. Organizations, Land pooling, Agreements, Governance, Records ledger, History and Settings sit behind one "More" link and open by themselves when a step or a pending item leads there. Nothing is removed.
- **Get started follows the corridor.** A co-op with a woodland project gets a "Map the corridor" step. The carbon steps are marked later and optional.
- **The parcel map opens on the land.** A saved boundary is drawn dashed and the map starts there. A parcel with no boundary opens near another boundary the viewer can already see. No new map provider is contacted.
- **An organization profile no longer needs a website.** HTTPS is still enforced when one is given.
- **Votes say what happens next** once everyone has voted. The voting rules are unchanged.
- **An empty woodland project says how to get layers:** draw them, upload a Landscape Package from the DFM mapping workspace, or ask a forester for GIS layers.
- **The opening page links to woodland corridors** beside the first buttons.

No environment change. Nothing else from main shipped. The version stays 0.11.0. Environment values and secrets are not recorded here.

| Item               | Value |
| ------------------ | ----- |
| Source commit      | `6457d84ba4444e3bbdae3be6fd9f794a22f9a635` (branch `claude/release-0.11.0-first-day`): production `f91cea061e5141091cc40e2138fd845e9aa4689c` plus backports of the two commits of #96 and #97 |
| Differences from main | The opening-page link is written into `app/page.tsx` in English, because the home translations (`lib/i18n`) and `components/home-content.tsx` are not on production |
| Source archive     | codeload tarball, SHA-256 `3e6618c179420154f657583293e26f91dcca98ac80f19fdf5e90e85e32e7eede`, computed independently and matched against the server's download before the image was built |
| Image              | `vergecommon:20261116-firstday-6457d84`, `sha256:175283f4730ac51d82e4ac471169a494f2a03ad33b65f513a3164299e7b8e55a`, built on the server; the container was started from the image ID |
| Version reported   | `/healthz` reports `0.11.0` and commit `6457d84ba4444e3bbdae3be6fd9f794a22f9a635` |
| Settings           | Only the image and `VERGE_BUILD_COMMIT` changed (27 environment names, none added or removed). `VERGE_WOODLAND_DFM=1` carried over. Mounts, network, no host ports, read-only root, limits and capabilities identical |
| Rollback container | `vergecommon-pre-v0110-20261116T021422Z` (the `f91cea0` image), stopped, no restart policy |
| Data backups       | `/backups/2026-11-16T02-14-22-893Z-3vWJa0` at preparation, `/backups/2026-11-16T02-17-44-821Z-xiQOi1` just before the switch and `/backups/2026-11-16T02-17-54-281Z-akiRUI` after it; all three restore checks passed |
| Server receipt     | `/opt/vergecommon/deployments/v0110-20261116T021422Z/` (root only) |
| MCP Registry       | Not republished. The server and its tools did not change |
| dendriticforest.com | Not rebuilt |

## Checks

- Before the release, on the release commit: `npm test` 437 pass and 0 fail; `npm run typecheck`, `npm run build`, `npm run build:selfhost` and `npm run build:public` passed. `npm run lint` reported the same two deprecation errors in `mcp/server.mjs` as on the previous production commit; this release does not touch that file.
- On a local self-hosted build of the release commit with woodland on: `tests/selfhost_acceptance.py` and `tests/woodland_acceptance.py` passed. In Chrome with a fresh three-member co-op: nine tabs and the More link, the corridor step, an organization profile saved without a website, the map opening on a saved boundary, the everyone-has-voted notice and tally, phone width with no sideways scrolling, the home link, the empty-woodland guidance, and the woodland corridor walk, with no page errors.
- Staging on the server, before the switch: the exact image on an empty data directory with no network, no host ports and no secrets. `/healthz` reported `6457d84` and 0.11.0; anonymous `tools/list` returned the five public tools; woodland projects were open.
- After the switch, from outside the server: `/healthz` ok at `6457d84`, 0.11.0. `/`, `/privacy/`, `/terms/`, `/support/`, `/woodland/`, `/app/` and the registration page return 200. The home page carries the woodland link. Anonymous `tools/list` returns exactly the five public tools; `Authorization: Bearer not-a-real-token` returns 401; the HSTS header is present. `scripts/launch-gate.mjs --expect-commit 6457d84…` from the build workspace: 25 pass, 0 fail, 9 manual.
- Not run: a signed-in walk on production itself; it was done on the local build of the same commit.

## Decisions taken with this release

- **No address search or aerial imagery.** Each needs a new outside map provider and a privacy-policy change. A co-op's first parcel still opens on a world view; the owner pans, uses the locate button, enters coordinates or imports a file.
- **No in-app link to Viridis services.** The services page does not offer corridor mapping yet, and the rule of one services link stays.
- **Opening-page headline unchanged.**
- **Voting rules unchanged.** Recording the result on the last vote would stop a member changing their vote.

## Known gaps

- The hosted privacy page's summary still does not mention corridor uses, facts and bands in production.
- Hindi home page not live; its captions are unreviewed.
- Not exercised in the customer walk: satellite scene search, browser reminders, Apple and Google sign-in, and the carbon ledger screens in a browser.
- The gaps listed in the 15 November receipts still stand.

## Rollback

On the server: `bash /root/v0110-firstday.sh rollback 20261116T021422Z`. It stops the new container and restores `vergecommon-pre-v0110-20261116T021422Z`, which runs `f91cea0`. `/root/v0110-firstday.sh` is `/root/v0110-coopstory.sh` with the expected production commit changed from `3378166` to `f91cea0`.

Stored records keep their meaning either way. One cosmetic effect: an organization profile saved without a website would show an empty website link under `f91cea0`. Do not roll back further, to `12e0fec`, once any corridor use, fact or band exists.

## Production baseline

**Completed 16 November 2026 at 02:18:03 UTC, observed live (`2026-11-16T02:18:03.615Z`).** Observed from outside the server: `/healthz` reported status ok, version 0.11.0 and commit `6457d84ba4444e3bbdae3be6fd9f794a22f9a635`.

| Item            | Result                                     |
| --------------- | ------------------------------------------ |
| Reviewed source | `6457d84ba4444e3bbdae3be6fd9f794a22f9a635` |

The source commit lives on branch `claude/release-0.11.0-first-day`. Keep that branch for as long as this is the baseline: the check resolves the commit from git. The earlier release branches hold its ancestors and should be kept as well.
