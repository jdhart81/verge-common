# Release: production runs `main` — 17 November 2026

**Production moved onto `main` on 17 November 2026 at 12:47:05 UTC**, on the owner's instruction ("ok finish the needed tasks", after the plan in the 17 November decisions note). The deployed commit is `29c8f2e0cb1c49a4097e38771c28af7fa4750a86`, the merge of [PR #104](https://github.com/jdhart81/verge-common/pull/104) on `main`.

Since October every release had been a hand backport onto a separate release line (`claude/release-0.11.0-*`), which had drifted 42 files from `main`. From this release on, a release is a commit on `main`.

## What changed for visitors and members

Beyond what the backports had already shipped:

- **The Hindi home page stays off** until a Hindi speaker has read it (`HINDI_HOME_REVIEWED = false` in `lib/i18n/home.ts`). A browser asking for Hindi gets English.
- **The satellite search tick comes before its form.**
- **The privacy page summary** now covers corridor uses, facts and edge bands.
- `llms.txt`, a clearer MCP tool listing with the same five public tools, and share cards for invitations.
- Dependency upgrades, including the app framework (vinext 1.4) and zod 4.

Present but off: optional email updates. `/updates/` returns 404 and the home page carries no updates link, because production does not configure them. No environment change. The version stays 0.11.0. Environment values and secrets are not recorded here.

| Item               | Value |
| ------------------ | ----- |
| Source commit      | `29c8f2e0cb1c49a4097e38771c28af7fa4750a86` on `main` |
| Previous production | `e5085dc7b79be45f023a379edc827a23cb2f809b` (branch `claude/release-0.11.0-layer-limit`) |
| Source archive     | codeload tarball, SHA-256 `98d91a6c5a63af790f5041b487eaf27ca7eabd1e8fdc24354164ca4ea606cccc`, computed independently and matched against the server's download before the image was built |
| Image              | `vergecommon:20261117-main-29c8f2e`, `sha256:9cb8777fde86d3fa75cc5d338710598ed877b57e1d2bed442b5bf3542c414d86`, built on the server; the container was started from the image ID |
| Version reported   | `/healthz` reports `0.11.0` and commit `29c8f2e0cb1c49a4097e38771c28af7fa4750a86` |
| Settings           | Only the image and `VERGE_BUILD_COMMIT` changed (27 environment names, none added or removed). Mounts identical. The image recipe and the database schema are the same as the previous build's |
| Rollback container | `vergecommon-pre-v0110-20261117T124302Z` (the `e5085dc` image), stopped, no restart policy |
| Data backups       | `/backups/2026-11-17T12-43-03-310Z-ghpNqi` at preparation, `/backups/2026-11-17T12-47-04-354Z-JvJQ8X` just before the switch and `/backups/2026-11-17T12-47-13-396Z-mQUVDk` after it; all three restore checks passed |
| Server receipt     | `/opt/vergecommon/deployments/v0110-20261117T124302Z/` (root only) |
| MCP Registry       | Not republished. The five public tools and their names are unchanged |

## Checks

- On the deployed code before release (the PR #104 branch): `npm test` 519 pass and 0 fail; typecheck; lint clean, so the two deprecation errors carried by the old release line are gone; `build`, `build:public`, `build:selfhost`; both acceptance suites.
- On a local self-hosted build: the join-path and woodland browser walks; the home animation; a browser asking for Hindi served English; `/updates/` 404 with no updates link; `/llms.txt` served. **Satellite scene search run end to end for the first time:** consent ticked, boundary reviewed, 20 Sentinel-2 scenes returned by Copernicus and the receipt saved.
- Staging on the server before the switch: the exact image, no network, empty data; `/healthz` at `29c8f2e`; the five public tools; woodland open.
- After the switch, from outside: `/healthz` ok at `29c8f2e`; `/`, `/privacy/`, `/terms/`, `/support/`, `/woodland/`, `/app/`, `/demo/`, `/network/`, the registration page and `/llms.txt` return 200; `/updates/` 404; a Hindi request served English; the privacy page carries the corridor records summary; the five public MCP tools; a bad bearer token 401; `scripts/launch-gate.mjs --expect-commit 29c8f2e…`: 25 pass, 0 fail, 9 manual; the home animation runs in Chrome with no errors.
- Signed in on production, one throwaway account each time, deleted afterwards with its co-op: sign-up, a private co-op, nine tabs, a woodland project, the corridor line and corridor progress, a woodlot and its next-step hint, an update, the account export; 264 KB of layers refused with the reason and 142 KB stored. The server holds ten co-ops, as before, and no test co-op by name.
- After the release the container used 92 MB of its 1 GB and logged no errors.

## Not verified

- Browser reminders, Apple and Google sign-in, and the carbon ledger screens in a browser.
- Satellite scene search on production itself (it needs a second steward, and a two-member test leaves an archived co-op behind; it was run on the local build of the same code).

## Rollback

On the server: `bash /root/v0110-main.sh rollback 20261117T124302Z`. It restores `vergecommon-pre-v0110-20261117T124302Z`, which runs `e5085dc`. The two builds read and write the same records.

## Production baseline

**Completed 17 November 2026 at 12:47:27 UTC, observed live (`2026-11-17T12:47:27.154Z`).** Observed from outside the server: `/healthz` reported status ok, version 0.11.0 and commit `29c8f2e0cb1c49a4097e38771c28af7fa4750a86`.

| Item            | Result                                     |
| --------------- | ------------------------------------------ |
| Reviewed source | `29c8f2e0cb1c49a4097e38771c28af7fa4750a86` |

The source commit is on `main`. The earlier release branches hold the previous baselines and should be kept.
