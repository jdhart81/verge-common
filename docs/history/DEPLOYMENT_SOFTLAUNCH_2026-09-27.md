# Soft-launch deployment — 27 September 2026

VergeCommon v0.8.0 was deployed at approximately **20:56 EDT on 27 September 2026 (00:56 UTC on 28 September)**. Justin authorized passing the checks and merging the launch branch after providing the deployment handoff.

## Release and validation

| Item | Verified result |
| --- | --- |
| Launch merge | [PR #5](https://github.com/jdhart81/verge-common/pull/5), merged to main |
| Tagged source | `v0.8.0`, `fc9f412984e1cbf065770ab285246c837759dd2c` |
| Local validation | Clean dependency install, typecheck, lint, 275 tests passed / 0 failed; merge tree matches the tested branch |
| Merge-commit CI | [Community checks](https://github.com/jdhart81/verge-common/actions/runs/36363748593): web, container acceptance/backup, imagery, iOS all passed; [secret scan](https://github.com/jdhart81/verge-common/actions/runs/36363748475) passed |
| Source archive SHA-256 | `c17d8a37ab9859e26f3d974df33982c3df8bc21c0ed01c6c2b9aa8855d34eb45` (matched locally and on server) |
| Image tag | `vergecommon:20260927-softlaunch-fc9f412` |
| Immutable deployed image | `sha256:140430504299709aa9954ef06d70006f7fcb7d20724d92775f791bb57105ab91` |
| Build argument / live health | `VERGE_BUILD_COMMIT=fc9f412`; `/healthz` reports version `0.8.0`, commit `fc9f412`, status `ok` |
| Dedicated host | `codex-keen-forge-bf65`, droplet `601953476` |
| Source / private receipt directory | `/opt/vergecommon/releases/20260927-softlaunch-fc9f412` / `/opt/vergecommon/deployments/20260927-softlaunch-fc9f412` |
| Previous container | `vergecommon-pre-softlaunch-fc9f412`, retained **stopped** |
| Previous image | `sha256:f67d58501848cf99223540f981fede70f96733f20a559b337e9d54ed7a5bdcb0` |

The failing container CI fixture had only 128 MiB of data capacity, below the application's 2 GiB upload free-space floor. Commit `ab1f63a` increased that fixture to a 3 GiB tmpfs capacity. The production safeguard and 1 GiB container memory limit were preserved. Both push and PR checks passed before merge.

## Deployment and recovery

- Built the exact tagged source with its commit argument. The live container remained on its previous image during the build and isolated acceptance.
- Backed up through the running previous container and verified a disposable restore. Started the candidate by image ID against an on-server private backup copy with the current deletion ledger.
- Isolated acceptance passed: four independent accounts, invitations and membership, posts, replay/conflict handling, CSRF and identity denial, upload/hash/private access/discard, native token scope/revocation, hosted MCP, agent financial denial, blocking, partnership authority/privacy, founder transfer, archival, and account erasure. Native registration/login/logout/recovery/deletion also passed. An additional staging backup and restore passed. The staging container is stopped.
- Repeated backup and isolated restore immediately before switching. Stopped and renamed the previous container before starting the new one on live data; only one application writer uses live data. No snapshot was restored over production.
- Retained existing data, backup and read-only secret mounts, private network, read-only image, unprivileged user, dropped capabilities, no-new-privileges, temporary scratch, and resource limits. No app port is published.
- Verified the existing private environment file matches the prior runtime without printing or exporting credentials. The Supabase broker/provider configuration and `VERGE_SOCIAL_PREVIEW=0` were preserved.
- Validated the release Caddyfile, saved the prior file in the private receipt directory, and updated the bind-mounted file in place. Because Caddy's admin API is disabled, restarted the existing proxy to load HSTS. HTTPS now returns `Strict-Transport-Security: max-age=31536000`.
- Post-deployment backup and isolated restore passed; the app reports healthy. The restore contained one existing account, six workspaces, and zero evidence files. These counts are recovery metadata, not adoption evidence.

| Recovery evidence | Immediately before switch | After deployment |
| --- | --- | --- |
| Backup directory under `/backups` | `2026-09-28T00-56-47-800Z-2iYKyH` | `2026-09-28T00-56-53-163Z-aoChPw` |
| Database SHA-256 | `680304045ed5091572f966880be314793a839d28d7246b816194be9737477c94` | `277e5153946e524eabc052670c6e10af81ca6c7baa93118ce63192e3f0093227` |
| Database bytes | 266240 | 278528 |
| Verified evidence files | 0 | 0 |
| Committed deletion receipts | 13 | 13 |
| Isolated restore | Passed | Passed |

## Launch gate and remaining owner work

`npm run launch-gate -- --expect-commit fc9f412` returned exit 0: **24 pass, 0 fail, 9 manual, 0 skipped**. Public routes, Terms at sign-up, exact build identity, HSTS, provider redirects, contact address and public copy passed. Provider redirects do not establish completed real provider sign-in. The Apple-secret expiry check uses the recorded date, not a newly inspected provider secret.

The nine manual gates remain open: Google consent publication; controlled-account provider revocation on deletion; independent key custody; qualified off-server backup/restore; external uptime alert delivery; two named operators/report rehearsal; pilot completion; phone/keyboard/VoiceOver/200% text acceptance; announcement approval. DigitalOcean backup enablement and off-server-job approval remain owner actions. Set Google support email to `justin@viridisconservation.com`, place key backups in a password manager plus offline custody, and name the second operator/pilot group before broader invitations.

No public announcement, consent-screen change, credential transfer, off-server backup activation, or paid backup enablement occurred in this deployment.

## Rollback

For this release, follow the handoff: stop the new container and restart the retained immediate predecessor against current data. Do not restore an older backup over live data, and do not run both containers against the live directory. The older pre-service container described in the 20 September service receipt is a different executable and is not the rollback target.
