# Release: room for corridor maps and saves that hold up under load — 17 November 2026

Two releases an hour apart, on the owner's instruction ("you merge and finish the needed tasks then deploy").

1. **01:05:58 UTC, commit `4f1b54a`:** production `6ce4f08` plus [PR #101](https://github.com/jdhart81/verge-common/pull/101).
2. **01:44:24 UTC, commit `e5085dc`:** `4f1b54a` plus [PR #102](https://github.com/jdhart81/verge-common/pull/102), a correction to the first. **This is what production runs.**

## What changed for a co-op

- **Corridor layers may be 150 KB per version**, up from 90 KB (about 6,000 corners instead of 3,500). Layer history holds 450 KB of geometry; older superseded versions keep their record and drop their geometry.
- **Corridor records have their own storage budget** (2 MB before growth pauses, 2.5 MB hard) and no longer consume the co-op's general 650 KB / 750 KB.
- **An idle page no longer re-downloads the co-op every 30 seconds.**
- **A save from a page that is behind no longer fails** for commands that only add the sender's own record: an update, a comment, an RSVP, a report, a parcel, a vote. Reviews, approvals and every change to an existing record still need the version the sender saw.
- **Simultaneous saves are queued per co-op**, and storage is measured in one pass.

## The correction, and why it was needed

PR #101 set layers to 300 KB from analysis timings on a development machine. After it went live, the same benchmark was run on the production server in a throwaway container of the release image (no network, no data, 2 CPUs, 1 GB):

| Stored layers | Slowest analysis, development machine | Slowest analysis, production server |
| --- | --- | --- |
| 79 KB | 4.3 s | 12.6 s |
| 142 KB | 5.9 s | 17.1 s |
| 264 KB | 10.5 s | 28.3 s, past the worker's 25 s deadline |

A co-op that saved layers near 300 KB would have had "the years ahead" time out. PR #102 lowered the limit to 150 KB. The 300 KB limit was live for 38 minutes. The only layers over 150 KB saved in that window are in the release's own test co-op (below).

**Lesson recorded:** a limit that depends on speed is measured on the server it will run on, before release.

| Item               | Value |
| ------------------ | ----- |
| Source commit      | `e5085dc7b79be45f023a379edc827a23cb2f809b` (branch `claude/release-0.11.0-layer-limit`): `4f1b54a4c022b5d979c5e981b50cbb921bdcca48` (branch `claude/release-0.11.0-capacity`) plus backports of #102; `4f1b54a` is `6ce4f0859cb40717ce87281c44432aa382fa535d` plus backports of #101 |
| Source archives    | `e5085dc`: SHA-256 `09a68bf3322457144f085d07eca8f6b507591676396f2a9a0e9efdfdcfb6cb23`. `4f1b54a`: `be8adab7cd5e23ef5a0e63711f2ffb8687ea992682ac5cf6487235b60fa73222`. Each computed independently and matched against the server's download before its image was built |
| Images             | `vergecommon:20261117-layerlimit-e5085dc`, `sha256:e36a7c0c47905fc491ba8cf239eb28c5651f804eaa9c8f1433ed31a444b4b7db` (running). `vergecommon:20261117-capacity-4f1b54a`, `sha256:79fee41f37f91a0ecad70609f68350619b2f5a42260d7ce61c3a0f285fa8f6bf` |
| Version reported   | `/healthz` reports `0.11.0` and commit `e5085dc7b79be45f023a379edc827a23cb2f809b` |
| Settings           | Each time only the image and `VERGE_BUILD_COMMIT` changed (27 environment names). Mounts identical |
| Rollback containers | `vergecommon-pre-v0110-20261117T014205Z` (the `4f1b54a` image) and `vergecommon-pre-v0110-20261117T010429Z` (the `6ce4f08` image), stopped |
| Data backups       | First release: `/backups/2026-11-17T01-04-29-864Z-hpyj2O`, `…T01-05-57-587Z-wD493H`, `…T01-06-06-825Z-J0T2SB`. Second: `…T01-42-06-535Z-Sk0uQL`, `…T01-44-23-563Z-0PgIHw`, `…T01-44-32-469Z-lieZg6`. All six restore checks passed |
| Server receipts    | `/opt/vergecommon/deployments/v0110-20261117T010429Z/` and `/opt/vergecommon/deployments/v0110-20261117T014205Z/` (root only) |
| MCP Registry       | Not republished |

## Checks

- On each release commit: `npm test` 453 pass and 0 fail; typecheck; `build`, `build:public`, `build:selfhost`; both acceptance suites, including a post from a page that was behind (accepted) and a role change from one (refused). `npm run lint` reports the same two deprecation errors in `mcp/server.mjs` as every release on this line.
- Load and failure test on the code of the first release: [LOAD_TEST_2026-11-16.md](LOAD_TEST_2026-11-16.md).
- Staging on the server before each switch passed.
- After each switch, from outside: `/healthz` at the release commit; the main pages 200; the five public MCP tools; a bad bearer token 401; `scripts/launch-gate.mjs --expect-commit <commit>`: 25 pass, 0 fail, 9 manual.
- **Signed in on production, first release, two throwaway accounts:** invitation, join request, approval and a second steward; a woodlot taken from recorded to joined through all six states; a post from a page that was behind accepted and a role change from one refused; the short refresh; 264 KB of layers saved in 1.3 s; two analyses run.
- **Signed in on production, second release, one throwaway account:** 264 KB of layers refused with "Simplify the layers to under 150 KB"; 142 KB stored in 0.8 s; the editor shows the 150,000 byte limit; the short refresh. The account was deleted and its co-op removed with it.

## Left behind on production

The two-account test's co-op remains as **one archived record with identities removed**, shown as "Community co-op" (270 KB, 15 audit entries, synthetic layers). Both accounts were deleted. The erasure rules keep a co-op that has had a second member, so deleting the founder's account archived it instead of removing it. Nobody can sign in to it and it is not public. Removing it needs a direct database change by the operator; it was left as it is.

## Not verified

- **Satellite scene search.** The test did not reach the search: the tick that enables the form sits below the form and was missed. Fixed in the test, not rerun, to avoid leaving a second archived co-op.
- Browser reminders, Apple and Google sign-in, and the carbon ledger screens in a browser.

## Rollback

`bash /root/v0110-layerlimit.sh rollback 20261117T014205Z` restores `4f1b54a` (the 300 KB limit: not advised). To return to the build before both releases, also run `bash /root/v0110-capacity.sh rollback 20261117T010429Z`, which restores `6ce4f08`; that build measures a co-op against the single 750 KB limit, so a co-op holding more corridor records than that would show as full until this build is restored.

## Production baseline

**Completed 17 November 2026 at 01:44:47 UTC, observed live (`2026-11-17T01:44:47.048Z`).** Observed from outside the server: `/healthz` reported status ok, version 0.11.0 and commit `e5085dc7b79be45f023a379edc827a23cb2f809b`.

| Item            | Result                                     |
| --------------- | ------------------------------------------ |
| Reviewed source | `e5085dc7b79be45f023a379edc827a23cb2f809b` |

The source commit lives on branch `claude/release-0.11.0-layer-limit`. Keep that branch and the earlier release branches.
