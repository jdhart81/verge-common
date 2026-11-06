# Hosted MCP public tools hotfix — 6 November 2026

**The hosted MCP endpoint went live with anonymous public tools on 6 November 2026 at 12:47:56 UTC**, on the owner's decision. Before this, `https://vergecommon.com/mcp` refused every request without a personal agent token, so agents that found VergeCommon in the MCP Registry could not try anything.

A request with **no** `Authorization` header now gets only the five public discovery and planning tools (`vergecommon_capabilities`, `list_public_coops`, `get_public_coop`, `example_pooling_draft`, `prepare_pooling_draft`), rate limited to 60 a minute per client and 600 a minute in total. Private tools still need a token. A malformed, duplicate, invalid or revoked token is still refused with 401; it never falls back to public access. `VERGE_MCP_PUBLIC=0` on the container turns anonymous access off.

Environment values and secrets are not recorded here.

| Item               | Value                                                                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source commit      | `5d1a276490f50d019234f2515049b21889ad981f` (branch `claude/mcp-public-tools-hotfix`): production `914793054eb8e1b0e86a833d30a40db5acb0e204` plus only this change, 8 files                                        |
| Source archive     | codeload tarball, SHA-256 `ca166e243aab81147b87fe309a3c1326771aa534959bef507f6ba14aa7b7f7f3`                                                                                                                      |
| Image              | `vergecommon:20261106-mcppublic-5d1a276`, `sha256:3f06eb81e9992bd92d7e340fac710364a11913414769465c52fe5464e3a14a75`, built on the server with `docker build -f self-hosted/Dockerfile`                            |
| Version reported   | `/healthz` reports `0.10.0` (the hotfix kept the production `package.json`); repository main records it as 0.10.1                                                                                                 |
| Settings           | Only the image and `VERGE_BUILD_COMMIT` changed. `VERGE_WOODLAND_DFM=1`, mounts, network, limits, read-only root, capabilities and restart policy were carried over and checked twice, before and after the start |
| Rollback container | `vergecommon-pre-mcppublic-20261106T124604Z` (image `vergecommon:20261004-v0100-9147930`), stopped, no restart policy                                                                                             |
| Data backup        | `/backups/2026-11-06T12-47-55-203Z-t2ClOh`, restore check passed                                                                                                                                                  |
| Server receipt     | `/opt/vergecommon/deployments/mcp-public-20261106T124604Z/` (root only)                                                                                                                                           |

## Checks

- Staging, before the switch: the exact image on an empty data directory with no network, no host ports and no secrets mount, with `VERGE_WOODLAND_DFM=1`. `/healthz` reported `5d1a276`; anonymous `tools/list` returned 200 with the five public tools and no `get_private_workspace`.
- After the switch, from outside the server: `/healthz` ok at `5d1a276`; `/woodland/` returns 200 and still reads that woodland projects are open; anonymous `initialize` returns 200 with `serverInfo` `vergecommon` `0.1.0`; anonymous `tools/list` lists exactly the five public tools; `tools/list` with `Authorization: Bearer not-a-real-token` returns 401.
- `tests/woodland_acceptance.py` (identical in `9147930` and `5d1a276`) passed 7/7 against production. It creates synthetic accounts and deleted them as its last step.

## Rollback

Stop the new container and rename it `vergecommon-failed-mcppublic-20261106T124604Z`, then rename `vergecommon-pre-mcppublic-20261106T124604Z` back to `vergecommon-app`, set its restart policy to `unless-stopped`, and start it. On the server: `bash /root/mcp-public.sh rollback 20261106T124604Z`. It restores `9147930` with woodland projects still on.

## Before the next release

The next release from main must, like this one, carry over every setting of the running container, including `VERGE_WOODLAND_DFM=1`, and should confirm anonymous `tools/list` still returns the five public tools.
