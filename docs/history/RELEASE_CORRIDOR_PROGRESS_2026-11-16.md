# Release: corridor progress, every woodlot a node — 16 November 2026

**Corridor progress went live on vergecommon.com on 16 November 2026 at 23:35:37 UTC**, on the owner's instruction ("you drive, work your way through the list") after [PR #99](https://github.com/jdhart81/verge-common/pull/99) merged. The release is production `6457d84` (v0.11.0) plus only that pull request.

- **Corridor progress leads the Woodland tab.** The aim (one old-growth corridor that branches along streams, valleys and ridges, joined one woodlot at a time), then five ordered steps with the next one marked.
- **Each woodlot is a node.** A member sees their own woodlots, what each needs next and whether the mapped corridor touches it. Stewards see every woodlot; other members see counts only (CP2, as WS8).
- **The rest of the app points at the corridor:** a line above the tabs, woodlot wording and a "Join the corridor" consent form in Parcels, and a next-step button on each woodlot.

Derived for each view; nothing new is stored. No environment change. The version stays 0.11.0. Environment values and secrets are not recorded here.

| Item               | Value |
| ------------------ | ----- |
| Source commit      | `6ce4f0859cb40717ce87281c44432aa382fa535d` (branch `claude/release-0.11.0-corridor-progress`): production `6457d84ba4444e3bbdae3be6fd9f794a22f9a635` plus backports of the two commits of #99 |
| Differences from main | None in the changed code. The release line still lacks main's home translations and optional email updates |
| Source archive     | codeload tarball, SHA-256 `e7fc8b2cf4978dbf179993528470598392a6fabfe5480bfac95fd363119a107e`, computed independently and matched against the server's download before the image was built |
| Image              | `vergecommon:20261116-progress-6ce4f08`, `sha256:ce3a5fabf3f414fce6d6169e2e824084e4d5660d6bc2b1bd5fc3a55729bac4a4`, built on the server; the container was started from the image ID |
| Version reported   | `/healthz` reports `0.11.0` and commit `6ce4f0859cb40717ce87281c44432aa382fa535d` |
| Settings           | Only the image and `VERGE_BUILD_COMMIT` changed (27 environment names, none added or removed). Mounts identical |
| Rollback container | `vergecommon-pre-v0110-20261116T233354Z` (the `6457d84` image), stopped, no restart policy |
| Data backups       | `/backups/2026-11-16T23-33-55-225Z-fC4c8G` at preparation, `/backups/2026-11-16T23-35-36-529Z-Ysrvqd` just before the switch and `/backups/2026-11-16T23-35-45-699Z-izpoEo` after it; all three restore checks passed |
| Server receipt     | `/opt/vergecommon/deployments/v0110-20261116T233354Z/` (root only) |
| MCP Registry       | Not republished. The server and its tools did not change |

## Checks

- Before the release, on the release commit: `npm test` 445 pass and 0 fail; typecheck, `build`, `build:public` and `build:selfhost` passed. `npm run lint` reported the same two deprecation errors in `mcp/server.mjs` as on the previous production commit.
- On a local self-hosted build of the release commit with woodland on: both acceptance suites passed. In Chrome, an owner and a steward walked a woodlot from record to joined; the hint was right at each of the six states and the woodlot showed as joined in Parcels, in corridor progress and in the line above the tabs. Phone width: no sideways scrolling.
- Staging on the server before the switch: the exact image, no network, empty data; `/healthz` at `6ce4f08`; the five public tools; woodland open.
- After the switch, from outside: `/healthz` ok at `6ce4f08`; `/`, `/privacy/`, `/terms/`, `/support/`, `/woodland/`, `/app/` and the registration page return 200; anonymous `tools/list` returns the five public tools; a bad bearer token returns 401; `scripts/launch-gate.mjs --expect-commit 6ce4f08…`: 25 pass, 0 fail, 9 manual.
- **Signed in on production, for the first time in this series.** One throwaway account (`zz_smoke_…`) signed up, created a private co-op and a woodland project, saw nine tabs, the corridor line ("Next: map the corridor"), corridor progress and the first-steps notice, recorded a woodlot and saw its next-step hint, posted an update and downloaded its account export. Signed out, the co-op showed nothing and was not in the public directory. The account was then deleted from the account page; sign-in was refused afterwards and the server holds no co-op with the test name.
- Not covered on production: anything needing a second steward (reviews, consent, votes), which ran on the local build of the same commit.

## Known gaps

- A corridor layers version is limited to 90 KB and a co-op to 750 KB; real land-trust GIS layers may exceed that. Work on this is in progress.
- No load test yet. Satellite scene search, browser reminders, Apple and Google sign-in and the carbon ledger screens have not been exercised end to end.
- The gaps in the earlier receipts still stand.

## Rollback

On the server: `bash /root/v0110-progress.sh rollback 20261116T233354Z`. It restores `vergecommon-pre-v0110-20261116T233354Z`, which runs `6457d84`. This release stores nothing new, so rollback is safe for records. Do not roll back further than `3378166` once any corridor use, fact or band exists.

## Production baseline

**Completed 16 November 2026 at 23:35:58 UTC, observed live (`2026-11-16T23:35:58.098Z`).** Observed from outside the server: `/healthz` reported status ok, version 0.11.0 and commit `6ce4f0859cb40717ce87281c44432aa382fa535d`.

| Item            | Result                                     |
| --------------- | ------------------------------------------ |
| Reviewed source | `6ce4f0859cb40717ce87281c44432aa382fa535d` |

The source commit lives on branch `claude/release-0.11.0-corridor-progress`. Keep that branch for as long as this is the baseline, and the earlier release branches with it.
