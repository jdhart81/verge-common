# Release: patched HTTP client library; Google sign-in and revocation verified — 23 November 2026

**Deployed 23 November 2026 at 01:06:43 UTC**, on the owner's instruction ("finish these tasks"). The deployed commit is `bda2f6402880c694eb7096b0a045a6200410ad5a`, the merge of [PR #117](https://github.com/jdhart81/verge-common/pull/117) on `main`; it also contains the documentation of the outage watch ([PR #116](https://github.com/jdhart81/verge-common/pull/116)).

## What changed

- The pinned `undici` moves from 7.30.0 to 7.30.2. `npm audit --omit=dev` goes from 1 high and 11 moderate to 0 high and 8 moderate. The server does not import this library; no served page or record changes.
- No environment change, no schema change. The version stays 0.11.0. Environment values and secrets are not recorded here.

| Item                | Value |
| ------------------- | ----- |
| Source commit       | `bda2f6402880c694eb7096b0a045a6200410ad5a` on `main` |
| Previous production | `6b988f1ff95d739a96efda98c79c1749ad18ce35` on `main` |
| Source archive      | codeload tarball, SHA-256 `8f28453b400f07fdff43d75cb7585fb480b0030f038f1503987b0de94bfef723`, computed independently and matched against the server's download before the image was built |
| Image               | `vergecommon:20261123-main-bda2f64`, `sha256:cf20eb5c026409152a81e4932f47f1f181cd4aecaa0cdf582339f3353a385aa5`, built on the server; the container was started from the image ID |
| Version reported    | `/healthz` reports `0.11.0` and commit `bda2f6402880c694eb7096b0a045a6200410ad5a` |
| Settings            | Only the image and `VERGE_BUILD_COMMIT` changed. Mounts and networks identical |
| Rollback container  | `vergecommon-pre-v0110-20261123T010159Z` (the `6b988f1` image), stopped, no restart policy |
| Data backups        | `/backups/2026-11-23T01-01-59-985Z-UVDh8O` at preparation, `/backups/2026-11-23T01-06-42-586Z-QrMqJ7` just before the switch and `/backups/2026-11-23T01-07-16-618Z-h4xPpH` after it; all three restore checks passed |
| Server receipt      | `/opt/vergecommon/deployments/v0110-20261123T010159Z/` (root only) |
| MCP Registry        | Not republished. The five public tools and their names are unchanged |

## Checks

- Before release: `npm test` 531 pass and 0 fail; typecheck; lint; `build`, `build:public`, `build:selfhost`; both acceptance suites; CI green.
- Staging on the server before the switch: the exact image, no network, empty data; `/healthz` at `bda2f64`; the five public tools; woodland open.
- After the switch, from outside: `/healthz` ok at `bda2f64`; `scripts/launch-gate.mjs --expect-commit bda2f64…`: 25 pass, 0 fail, 9 manual.
- Signed in on production, one throwaway account, deleted afterwards with its co-op: sign-up, a private co-op, a woodland project, the first-woodlot map, the holdings checklist and the reminders panel.
- After the release the container used 46 MB of its 1 GB and logged no errors.

## Observed on production the same evening (on build `6b988f1`; sign-in code unchanged since)

With the owner's permission, in the owner's browser, using the project's own Google account as a controlled account:

- **Google sign-in works end to end:** account chooser, Google's consent, VergeCommon's terms step, a new account, the recovery code shown once, and the member workspace.
- **Deletion revokes the provider grant (BL-03, Google):** before deletion the Google account listed the sign-in under its linked apps; after "Verify with Google to delete my VergeCommon account" VergeCommon reported the account deleted and the authorization revoked, and the entry was gone from the Google account's linked apps.
- **Finding (BL-02):** Google's chooser and consent screens name the app as the sign-in service's address (a `supabase.co` host), not "VergeCommon". A member is asked to trust a name they have never seen.
- **Outage watch:** the test email of 00:21 UTC is in the operations inbox.

## Not verified

- Apple sign-in and Apple revocation (needs the owner's Apple ID).
- A real reminder notification on a device; a screen reader; real phones.

## Rollback

On the server: `bash /root/v0110-deps.sh rollback 20261123T010159Z`. It restores `vergecommon-pre-v0110-20261123T010159Z`, which runs `6b988f1`. The two builds read and write the same records.

## Production baseline

**Completed 23 November 2026 at 01:07:18 UTC, observed live (`2026-11-23T01:07:18.423Z`).** Observed from outside the server: `/healthz` reported status ok, version 0.11.0 and commit `bda2f6402880c694eb7096b0a045a6200410ad5a`.

| Item            | Result                                     |
| --------------- | ------------------------------------------ |
| Reviewed source | `bda2f6402880c694eb7096b0a045a6200410ad5a` |
