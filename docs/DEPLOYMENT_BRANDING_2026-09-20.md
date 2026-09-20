# Shared Canopy branding deployment

Deployed to https://vergecommon.com at approximately **2026-09-20 01:55 UTC** (September 19, 9:55 p.m. New York).

- Source: `37a53ed6561be450983b97550a28d09a436bc0fb`, branch `build/conversation-actions`.
- Dedicated VergeCommon droplet: `601953476`, alias `codex-keen-forge-bf65`.
- Release directory: `/opt/vergecommon/releases/20260920-brand-37a53ed`.
- Running image: `sha256:922a237cf284b83da5d25f6028c01d7d87eb5b73311ec7e9bc986471ad217f89`.
- Source archive SHA-256: `954c54ac067675fcc99fb48bc50738fb1fb995d769f4debb02bfec0cc5065443`.
- Exact-commit CI: [run 35482554128](https://github.com/jdhart81/verge-common/actions/runs/35482554128), all four jobs passed.

## Scope and verification

The approved logo replaces the generic sprout/text identity in the website header/footer, public information pages, directory/workspace navigation, planner, join page, account pages and app-installation page. Browser favicons, Apple touch icons and installable web-app icons use the matching square tree mark. Icon references are versioned to request the new assets.

The native iOS source includes the new opaque 1024px app icon and horizontal branding in Discover and sign-in. The unsigned iOS Simulator build passed. This deployment does not sign, submit or distribute an Apple app.

Local lint, TypeScript, self-hosted/public builds and 12 gateway tests passed. Desktop and 390px browser checks confirmed the logo loads without horizontal overflow; account-page image access is restricted to the exact logo and same-origin icon directory. The remaining account resource restrictions are unchanged.

The final server image passed isolated checks on six pages and seven branding assets before the switch. Those same checks passed in the running production image. Public HTTPS branding files matched source-export hashes, and the live homepage and app-installation page showed the approved identity. No synthetic accounts or co-ops were created for this branding deployment.

## Recovery receipts

Receipt directory: `/opt/vergecommon/deployments/20260920-brand-37a53ed`.

| Check | Backup | Result |
| --- | --- | --- |
| Before switch | `/backups/2026-09-20T01-55-28-108Z-F9YhOO` | Restore passed; database SHA-256 `9fbd080142bf8ff3eb440256caf4ace6faf39cd7820c27b2dae870d93bb2de85` |
| After switch | `/backups/2026-09-20T01-55-31-954Z-IgaSW0` | Restore passed; database SHA-256 `3f9a528c8f6ef2fa9d6b00977ecf54b085dc0850a12c35481bf08d85399a6de7` |

Both restore checks verified database integrity, all three migrations and three evidence files. The existing durable data and backup mounts, private network, unprivileged process, read-only container and security restrictions remain in place. No application port is published; the daily backup timer remains active.

The immediately preceding compatible image (`750f7f3`, image `e41ad5dd…`) is retained in the stopped `vergecommon-pre-brand-750f7f3` container. This release changes no schema or erasure semantics; rollback must use that compatible executable with current data and ledger, never an older database snapshot or the pre-service executable.

Registry/payment integrations, funding activation, offsite backup qualification and Apple distribution retain their previously recorded status. Branding deployment does not establish those services.
