# Release: Google ownership file — 23 November 2026

**Deployed 23 November 2026 at 01:52:38 UTC**, on the owner's instruction ("finish the tasks"). The deployed commit is `16d1450a169cbf5bad38ea0afc32c0b14580423b`, the merge of [PR #119](https://github.com/jdhart81/verge-common/pull/119) on `main`.

## What changed

- The site serves Google's one-line ownership file at `/googleaf96b525bb3d46d2.html`. It carries no markup and must stay in place.
- Why: Google's sign-in screen names the sign-in service's address (a `supabase.co` host) instead of "VergeCommon". Google's branding check for the sign-in app failed with one issue: the home page was not registered to the owner.

No environment change, no schema change. The version stays 0.11.0. Environment values and secrets are not recorded here.

| Item                | Value |
| ------------------- | ----- |
| Source commit       | `16d1450a169cbf5bad38ea0afc32c0b14580423b` on `main` |
| Previous production | `bda2f6402880c694eb7096b0a045a6200410ad5a` on `main` |
| Source archive      | codeload tarball, SHA-256 `d033718b7d5c6c069a1b35f07845c6b56820516aab52f98daf7261f33b3eda33`, computed independently and matched against the server's download before the image was built |
| Image               | `vergecommon:20261123-main-16d1450`, `sha256:ed9b86bf35976cd7f1377489cff6c41bae2cfc96c6b24ccb6058143530ae14b1`, built on the server; the container was started from the image ID |
| Version reported    | `/healthz` reports `0.11.0` and commit `16d1450a169cbf5bad38ea0afc32c0b14580423b` |
| Settings            | Only the image and `VERGE_BUILD_COMMIT` changed. Mounts and networks identical |
| Rollback container  | `vergecommon-pre-v0110-20261123T014752Z` (the `bda2f64` image), stopped, no restart policy |
| Data backups        | `/backups/2026-11-23T01-47-53-431Z-XIkKkl` at preparation, `/backups/2026-11-23T01-52-37-632Z-fkLcA5` just before the switch and `/backups/2026-11-23T01-53-11-509Z-Zbiix6` after it; all three restore checks passed |
| Server receipt      | `/opt/vergecommon/deployments/v0110-20261123T014752Z/` (root only) |
| MCP Registry        | Not republished. The five public tools and their names are unchanged |

## Checks

- Before release: the new test and lint pass; `build:selfhost`; a local build served the file with status 200; CI green.
- Staging on the server before the switch: the exact image, no network, empty data; `/healthz` at `16d1450`; the five public tools; woodland open.
- After the switch, from outside: `/healthz` ok at `16d1450`; the file returns 200 with exactly Google's line; `scripts/launch-gate.mjs --expect-commit 16d1450…`: 25 pass, 0 fail, 9 manual.
- Google Search Console then reported "Ownership verified" for `https://vergecommon.com/` under the owner's account.
- After the release the container used 47 MB of its 1 GB and logged no errors.

## Not yet done

- Google's branding check has to be requested again; Google asks for a 24-hour wait after ownership is verified. Until it passes, the sign-in screen still shows the `supabase.co` address.

## Rollback

On the server: `bash /root/v0110-gsv.sh rollback 20261123T014752Z`. It restores `vergecommon-pre-v0110-20261123T014752Z`, which runs `bda2f64`. Rolling back removes the ownership file, and Google may then withdraw the verification.

## Production baseline

**Completed 23 November 2026 at 01:53:13 UTC, observed live (`2026-11-23T01:53:13.257Z`).** Observed from outside the server: `/healthz` reported status ok, version 0.11.0 and commit `16d1450a169cbf5bad38ea0afc32c0b14580423b`.

| Item            | Result                                     |
| --------------- | ------------------------------------------ |
| Reviewed source | `16d1450a169cbf5bad38ea0afc32c0b14580423b` |
