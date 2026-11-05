# Woodland projects switched on — 5 November 2026

**Woodland projects went live on vergecommon.com on 5 November 2026 at 12:43 UTC**, on the owner's decision. This was a settings change on the running service, not a release.

Source: the owner's operator report from the switch (run from the owner's Mac), plus a public read of the live pages afterwards. Environment values and secrets are not recorded here.

| Item           | Value                                                                                                                                                                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image          | `vergecommon:20261004-v0100-9147930`, unchanged; no build or install on the server                                                                                                                                                                                                                                                              |
| Source commit  | `914793054eb8e1b0e86a833d30a40db5acb0e204` (v0.10.0 maintenance)                                                                                                                                                                                                                                                                                |
| Flag before    | `VERGE_WOODLAND_DFM` not set                                                                                                                                                                                                                                                                                                                    |
| Flag after     | `VERGE_WOODLAND_DFM=1`, the only setting changed                                                                                                                                                                                                                                                                                                |
| How            | The app container is started with `docker run` and has no compose or `.env` file. Its full configuration was saved, a replacement container from the same image was checked to differ only by the flag, the old container was stopped and kept as `vergecommon-pre-woodland-20261105T124321Z` (no restart policy), and the new one was started. |
| Server receipt | `/opt/vergecommon/deployments/woodland-on-20261105T124321Z/` (root only)                                                                                                                                                                                                                                                                        |
| Data backup    | Taken immediately before the switch; its restore check passed                                                                                                                                                                                                                                                                                   |

## Checks after the switch

- Container running and healthy; `/healthz` reports v0.10.0 at `9147930`; one live app container.
- `https://vergecommon.com/` and `https://vergecommon.com/woodland/` return 200. `/woodland/` reads "Woodland projects are open on this service as part of the public beta." (also confirmed by a separate public read the same day).
- `tests/woodland_acceptance.py` from the `9147930` checkout passed all 7 checks against production. It creates synthetic accounts and deleted them as its last step.

## Rollback

On the server: `bash woodland-on.sh rollback 20261105T124321Z`. It restores the kept container, with the flag unset.

## Before the next release

Production settings now live only in the running container, and the flag is one of them. The release scripts used on 4 and 23 October (`switch.sh`, kept with their server receipts, not in this repository) stop with an error when `VERGE_WOODLAND_DFM` is set. Before the next release, change that check so the release **carries `VERGE_WOODLAND_DFM=1` over** from the running container, and confirm `/woodland/` still shows the open message after the switch. A release that drops the flag silently turns woodland projects off again.
