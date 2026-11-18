# Release: first map view, holding checklist, reminders that fail clearly — 18 November 2026

**Deployed 18 November 2026 at 00:07:06 UTC**, on the owner's instruction ("finish the remaining needed tasks"). The deployed commit is `ac5021700e387743f63f6b25e39511ebcb04d9a8`, the merge of [PR #107](https://github.com/jdhart81/verge-common/pull/107) on `main`.

## What changed for members

- **A first woodlot's map no longer opens on the whole world.** With no boundary to start from, the boundary map opens near land the co-op has already mapped, then on the region of the device's time zone, then on the world. The corridor map does the same. The time zone is read in the browser; nothing is sent, asked for or stored (`lib/map-start.mjs`, MS1–MS5).
- **The holdings screen lists what must be on record before a holding**, with a button to the tab where each item is resolved. The list and the command's refusal are one function (`holdingBlockers`, HR1–HR3). Refusal messages are unchanged.
- **Enabling reminders gives up after 20 seconds with a reason** when the browser cannot reach its notification service.

No environment change, no schema change. The version stays 0.11.0. Environment values and secrets are not recorded here.

| Item                | Value |
| ------------------- | ----- |
| Source commit       | `ac5021700e387743f63f6b25e39511ebcb04d9a8` on `main` |
| Previous production | `29c8f2e0cb1c49a4097e38771c28af7fa4750a86` on `main` |
| Source archive      | codeload tarball, SHA-256 `8be5b4c39ec38ed73caddf549f7020ace9bfae73a9bdd0dca065168d0a7bb533`, computed independently and matched against the server's download before the image was built |
| Image               | `vergecommon:20261118-main-ac50217`, `sha256:d1627fc642ee689e31ed3732bffc0327f65b1752db374be9c7784b59bcf9f425`, built on the server; the container was started from the image ID |
| Version reported    | `/healthz` reports `0.11.0` and commit `ac5021700e387743f63f6b25e39511ebcb04d9a8` |
| Settings            | Only the image and `VERGE_BUILD_COMMIT` changed (27 environment names, none added or removed). Mounts and networks identical |
| Rollback container  | `vergecommon-pre-v0110-20261118T000538Z` (the `29c8f2e` image), stopped, no restart policy |
| Data backups        | `/backups/2026-11-18T00-05-39-109Z-pt3sJf` at preparation, `/backups/2026-11-18T00-07-05-230Z-EsLPt7` just before the switch and `/backups/2026-11-18T00-07-43-554Z-77LOjr` after it; all three restore checks passed |
| Server receipt      | `/opt/vergecommon/deployments/v0110-20261118T000538Z/` (root only) |
| MCP Registry        | Not republished. The five public tools and their names are unchanged |

## Checks

- Before release, on the PR branch: `npm test` 526 pass and 0 fail; typecheck; lint; `build`, `build:public`, `build:selfhost`; both acceptance suites; CI green.
- In a browser on a local self-hosted build, for the first time: **the whole records ledger** as two stewards and a member — evidence, holding, settlement, allocation and its approval, member, stewardship and treasury receipts, retirement. An over-budget receipt was refused with the reason; a recorder was never offered their own review; the member saw amounts but not restricted evidence; member shares summed exactly to the member budget. The map opened on the region for `America/New_York` and `Asia/Kolkata` and on the world for `UTC`. The reminders screen showed the new message.
- Staging on the server before the switch: the exact image, no network, empty data; `/healthz` at `ac50217`; the five public tools; woodland open.
- After the switch, from outside: `/healthz` ok at `ac50217`; `/`, `/privacy/`, `/terms/`, `/support/`, `/woodland/`, `/app/`, `/demo/`, `/network/`, the registration page and `/llms.txt` return 200; `/updates/` 404; `scripts/launch-gate.mjs --expect-commit ac50217…`: 25 pass, 0 fail, 9 manual.
- Signed in on production, one throwaway account, deleted afterwards with its co-op: a first woodlot's map opened on the region; the holdings checklist listed the missing records and its button opened Settings; the reminders panel was offered.
- After the release the container used 75 MB of its 1 GB and logged no errors.

## Not verified

- Delivery of a real notification to a device: the test machine cannot reach a browser push service.
- Apple and Google sign-in through a real account (the hand-off to the provider was checked on 17 November).

## Rollback

On the server: `bash /root/v0110-finish.sh rollback 20261118T000538Z`. It restores `vergecommon-pre-v0110-20261118T000538Z`, which runs `29c8f2e`. The two builds read and write the same records.

## Production baseline

**Completed 18 November 2026 at 00:07:45 UTC, observed live (`2026-11-18T00:07:45.158Z`).** Observed from outside the server: `/healthz` reported status ok, version 0.11.0 and commit `ac5021700e387743f63f6b25e39511ebcb04d9a8`.

| Item            | Result                                     |
| --------------- | ------------------------------------------ |
| Reviewed source | `ac5021700e387743f63f6b25e39511ebcb04d9a8` |
