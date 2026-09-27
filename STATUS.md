# VergeCommon — current status

**Last updated: 27 September 2026.** This is the single, current summary of what is live, what is verified and what is still open. Update it with every deployment or change in operating state. Dated deployment receipts and reviews are preserved unchanged in [docs/history/](docs/history/).

## At a glance

| Area | State |
| --- | --- |
| Website and shared app | **Live public technical beta** at https://vergecommon.com — accounts, private co-ops, invitations, discussion and conversation actions, events, parcels/boundaries, evidence, governance records, operator report queue, hosted MCP. Free to use. |
| Hosting | One dedicated DigitalOcean droplet (`601953476`), Docker container behind Caddy, SQLite + private evidence files. Separate from Viridis Conservation. |
| Source of truth | Production runs branch `build/conversation-actions` ([PR #3](https://github.com/jdhart81/verge-common/pull/3)). PR #2 and PR #4 (secret scanning) are merged into `main`. **PR #3 must be merged so `main` matches production.** |
| Automated checks | Merge of `main` + PR #3 verified 27 Sep 2026: **259/259 Node tests, TypeScript and lint pass**; clean merge. |
| Real adoption | None demonstrated yet. No real co-op, environmental or financial outcome has been recorded. |

## Sign-in

| Method | State |
| --- | --- |
| Username/password + recovery codes | Live |
| Google (via dedicated Supabase broker) | Button public; owner first-login acceptance passed. **Google Cloud audience was last read back as External / Testing with no test users** — in that mode Google blocks everyone except the project's own/test accounts, so the public button likely fails for neighbours. Publish the consent screen to Production (or hide the button) before inviting anyone. Returning-login acceptance open. |
| Apple (via Supabase broker) | Button public; real sign-in acceptance **open**. |
| Email link | Implemented, **disabled** — needs a production SMTP sender. |
| Native iOS | Password accounts only; native Google/Apple UI not built. |

Details: [self-hosted/SUPABASE_SIGN_IN.md](self-hosted/SUPABASE_SIGN_IN.md), [self-hosted/SOCIAL_SIGN_IN.md](self-hosted/SOCIAL_SIGN_IN.md).

## Credential and certificate calendar

| Item | Expires / due | Renewal |
| --- | --- | --- |
| Apple client secret configured in Supabase (`com.vergecommon.web`) | **2026-12-19 18:12:51 UTC** | Manual. Generate a new secret from the Apple signing key and save it in Supabase before expiry, or Apple sign-in stops. |
| TLS certificate, vergecommon.com | 2026-12-18 | Automatic (Caddy). Verify after renewal. |
| Supabase project (`tizcemlockjetjaqnnlt`, Pro) | Monthly billing | — |

**Custody gaps (open):** no independent recovery copy of the Apple signing private key, and no independent recovery custody of the server token-vault encryption key. Losing either can lock out provider-only accounts. Resolve before a broad invitation.

## Operations

- Daily on-server backup timer: **active**. Isolated restore has passed at each recorded deployment.
- Encrypted off-server backup transfer: **paused** (Mac LaunchAgent `com.vergecommon.operations` unloaded pending approval). No qualified production off-host recovery receipt yet.
- Failure alerting: **not active.** Webhook delivery is implemented but no destination is configured; local receipts only work while the Mac is awake.
- Historical plaintext archives exist on the owner's Mac (`private-backups/`); their retention/disposal is an open owner decision.
- Storage model: a bounded JSON aggregate per co-op (5,000 events / 750 KB). Suitable for pilots; needs capacity alerts and a scalable store before large co-ops.

Runbooks: [docs/OPERATIONS_BETA.md](docs/OPERATIONS_BETA.md), [docs/OPERATIONS.md](docs/OPERATIONS.md), [self-hosted/README.md](self-hosted/README.md).

## Not built (intentionally separate work)

- Apple signing, device acceptance, TestFlight/App Store distribution — [docs/APPLE_RELEASE.md](docs/APPLE_RELEASE.md)
- Online project contributions (Stripe) — [docs/FUNDING.md](docs/FUNDING.md)
- Carbon credit issuance, sales, registry custody or payment execution. The software records external events; it does not move money or issue credits.
- Hosted, unattended imagery monitoring jobs.

## Next steps, in order

1. Merge PR #3 into `main`; tag the release. Publish the Google OAuth consent screen out of Testing (or return Google to preview) — this affects the live site today.
2. Back up the Apple signing key and token-vault key to independent custody; rotate the Apple client secret before 19 Dec 2026.
3. Approve and re-enable encrypted off-server backups; run and record an isolated restore; configure an external alert destination.
4. Complete Apple and returning-Google sign-in acceptance; publish the Google consent screen out of Testing.
5. Feature freeze and run the [pilot checklist](docs/PILOT.md) with one real group (two stewards, a few neighbours, two activities).
6. Let pilot findings decide the next build (combined co-op map, notifications, native field capture, scalable storage).

## Where to read more

[README](README.md) · [Roadmap](ROADMAP.md) · [Launch gates](docs/LAUNCH.md) · [Service coverage](docs/SERVICE_COVERAGE.md) · [Feature acceptance](docs/FEATURE_ACCEPTANCE.md) · [Architecture](docs/ARCHITECTURE.md) · [Release notes](docs/RELEASE_NOTES.md) · [History](docs/history/)
