# VergeCommon — current status

**Last updated: 27 September 2026 (soft-launch candidate).** This is the single, current summary of what is live, what is verified and what is still open. Update it with every deployment or change in operating state. Dated deployment receipts and reviews are preserved unchanged in [docs/history/](docs/history/).

## At a glance

| Area | State |
| --- | --- |
| Website and shared app | **Live public technical beta** at https://vergecommon.com — accounts, private co-ops, invitations, discussion and conversation actions, events, parcels/boundaries, evidence, governance records, operator report queue, hosted MCP. Free to use. |
| Hosting | One dedicated DigitalOcean droplet (`601953476`), Docker container behind Caddy, SQLite + private evidence files. Separate from Viridis Conservation. |
| Source of truth | Production runs branch `build/conversation-actions` (PR #3). The **soft-launch candidate is branch `launch/soft-launch`**, which contains PR #3, current `main` and the launch work below. Merge it to `main`, tag it, then deploy that tag. |
| Automated checks | Soft-launch candidate, 27 Sep 2026: **275/275 Node tests, TypeScript and lint pass**; isolated production-build acceptance passed (4 accounts + native lifecycle); browser check of every public page and all 14 co-op tabs at 1280 px and 375 px with no console errors or overflow. |
| Launch gate | `npm run launch-gate` checks the machine-checkable gates against production. Before this candidate is deployed, production fails 4 (terms page, terms at sign-up, build commit, HSTS); the candidate passes them locally. |
| Real adoption | None demonstrated yet. No real co-op, environmental or financial outcome has been recorded. |

## Soft-launch candidate (branch `launch/soft-launch`)

- Security review fixes: see [docs/history/SECURITY_REVIEW_2026-09-27.md](docs/history/SECURITY_REVIEW_2026-09-27.md). Abuse limits for open sign-up, IPv6-aware rate limits, per-member and per-uploader caps, open-redirect fix, HSTS, no raw database errors.
- Terms of Use at `/terms/`, accepted and recorded (version `2026-09-28`) at every password, app and first-time provider sign-up.
- Health endpoint reports the build commit (`VERGE_BUILD_COMMIT` build arg).
- No placeholders: unconfigured sign-in providers are hidden; the support page no longer says "not open yet"; co-op tabs have readable names.
- Sign-up limits allow a group on one network (60 attempts per 15 minutes per network).

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

1. Merge `launch/soft-launch` into `main` (it includes PR #3), tag `v0.8.0`, build the image with `--build-arg VERGE_BUILD_COMMIT=<sha>`, deploy with the usual backup → isolated restore → switch procedure, then run `npm run launch-gate -- --expect-commit <sha>`. Publish the Google OAuth consent screen out of Testing and set its support email to justin@viridisconservation.com.
2. Back up the Apple signing key and token-vault key to independent custody; rotate the Apple client secret before 19 Dec 2026.
3. Approve and re-enable encrypted off-server backups; run and record an isolated restore; configure an external alert destination.
4. Complete Apple and returning-Google sign-in acceptance; publish the Google consent screen out of Testing.
5. Feature freeze and run the [pilot checklist](docs/PILOT.md) with one real group (two stewards, a few neighbours, two activities).
6. Let pilot findings decide the next build (combined co-op map, notifications, native field capture, scalable storage).

## Where to read more

[README](README.md) · [Roadmap](ROADMAP.md) · [Launch gates](docs/LAUNCH.md) · [Service coverage](docs/SERVICE_COVERAGE.md) · [Feature acceptance](docs/FEATURE_ACCEPTANCE.md) · [Architecture](docs/ARCHITECTURE.md) · [Release notes](docs/RELEASE_NOTES.md) · [History](docs/history/)
