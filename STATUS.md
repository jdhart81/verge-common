# VergeCommon — current status

**Last updated: 29 September 2026 (v0.8.1 live; v0.9.0 release candidate).** This is the single, current summary of what is live, what is verified and what is still open. Update it with every deployment or change in operating state. Dated deployment receipts and reviews are preserved unchanged in [docs/history/](docs/history/).

## At a glance

| Area | State |
| --- | --- |
| Website and shared app | **Live public technical beta** at https://vergecommon.com — accounts, private co-ops, invitations, discussion and conversation actions, events, parcels/boundaries, evidence, governance records, operator report queue, hosted MCP. Free to use. |
| Hosting | One dedicated DigitalOcean droplet (`601953476`), Docker container behind Caddy, SQLite + private evidence files. Separate from Viridis Conservation. |
| Source of truth | Production runs **v0.8.1**, merge commit `0921132` on `main` ([PR #7](https://github.com/jdhart81/verge-common/pull/7)). [Deployment and recovery receipt](docs/history/DEPLOYMENT_V081_2026-09-28.md). |
| Automated checks | v0.8.1, 28 Sep 2026: **276/276 Node tests, TypeScript and lint pass**; all four merge-commit CI jobs and secret scan passed; exact-image isolated acceptance and pre/post-deploy restore checks passed. |
| Launch gate | `npm run launch-gate -- --expect-commit 0921132` against production: **24 pass, 0 fail, 9 manual, 0 skipped**. Manual operational and owner gates remain open. |
| Real adoption | None demonstrated yet. No real co-op, environmental or financial outcome has been recorded. |

## Deployed release (v0.8.1)

- Adds the independent production monitor, tab/sign-in contrast fixes, and shared-network limits of 1,200 page requests/minute; static build assets are excluded from that page limit.
- `/healthz` commit is `0921132`; its static version field still reads `0.8.0` in the released source.

- Security review fixes: see [docs/history/SECURITY_REVIEW_2026-09-27.md](docs/history/SECURITY_REVIEW_2026-09-27.md). Abuse limits for open sign-up, IPv6-aware rate limits, per-member and per-uploader caps, open-redirect fix, HSTS, no raw database errors.
- Terms of Use at `/terms/`, accepted and recorded (version `2026-09-28`) at every password, app and first-time provider sign-up.
- Health endpoint reports the build commit (`VERGE_BUILD_COMMIT` build arg).
- No placeholders: unconfigured sign-in providers are hidden; the support page no longer says "not open yet"; co-op tabs have readable names.
- Sign-up limits allow a group on one network (60 attempts per 15 minutes per network).

## Sign-in

| Method | State |
| --- | --- |
| Username/password + recovery codes | Live |
| Google (via dedicated Supabase broker) | Real returning-account sign-in and authenticated workspace reload observed on 29 Sep. Google Cloud audience read back as **External / In production**; owner also reports successful testing. A neighbour cohort remains untested. |
| Apple (via Supabase broker) | Owner reports successful real sign-in on 29 Sep. Independent new-user acceptance and revocation-on-deletion remain separate checks. |
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
- Encrypted off-server backup transfer: **active hourly** on the owner Mac (`com.vergecommon.operations` loaded). Live receipts read on 29 Sep show successful encrypted archives, matching server snapshot hashes and isolated restore/deletion-ledger replay. Latest read receipt: 30 Sep 00:37 UTC (29 Sep 20:37 EDT), healthy. Notifications remain local receipts only; independent key custody and alert delivery are unqualified.
- Failure alerting: GitHub Actions Production monitor is configured for 15-minute health and nightly full launch-gate checks. Full manual run verified in the [deployment receipt](docs/history/DEPLOYMENT_V081_2026-09-28.md). Owner Watching → All activity and actual failure-email delivery remain unverified; no alert rehearsal was performed. The separate Mac webhook remains unconfigured.
- Historical plaintext archives exist on the owner's Mac (`private-backups/`); their retention/disposal is an open owner decision.
- Storage model: a bounded JSON aggregate per co-op (5,000 events / 750 KB). Suitable for pilots; needs capacity alerts and a scalable store before large co-ops.

Runbooks: [docs/OPERATIONS_BETA.md](docs/OPERATIONS_BETA.md), [docs/OPERATIONS.md](docs/OPERATIONS.md), [self-hosted/README.md](self-hosted/README.md).

## Not built (intentionally separate work)

- Apple signing, device acceptance, TestFlight/App Store distribution — [docs/APPLE_RELEASE.md](docs/APPLE_RELEASE.md)
- Online project contributions (Stripe) — [docs/FUNDING.md](docs/FUNDING.md)
- Carbon credit issuance, sales, registry custody or payment execution. The software records external events; it does not move money or issue credits.
- Hosted, unattended imagery monitoring jobs.

## v0.9.0 candidate (not yet the live receipt)

Shareable activity/progress pages with previews and QR codes; sign-in/join return to activity; actual attendance and independent work review/publication/withdrawal; private recurring care and disturbance history; opt-in browser push; classified participation, later-week contribution and shared-link attribution reporting. Local clean install, 287 Node tests, typecheck/lint and production build passed. Remote CI, exact-image acceptance, backup/restore and deployment follow before the candidate becomes live. Browser-provider acceptance is separate from observed device display.

## Next steps, in order

1. Complete the v0.9.0 verified release sequence and save its immutable deployment receipt.
2. Establish independent key custody, qualify failure-alert delivery and name a second operator.
3. Run one real group with two stewards, 5–10 neighbours, one shared activity and a later-week repeat. Record actual work and classify test accounts correctly.
4. Test reminders on each participant device, especially installed iPhone/iPad web apps. Provider revocation on account deletion, physical-device/accessibility acceptance and native distribution remain separate work.
5. Use participant/referred contribution and conservation-care records to decide later nearby discovery, unattended imagery monitoring and scalable-storage work. No adoption or ecological impact is inferred from CI or traffic.

## Where to read more

[README](README.md) · [Roadmap](ROADMAP.md) · [Launch gates](docs/LAUNCH.md) · [Service coverage](docs/SERVICE_COVERAGE.md) · [Feature acceptance](docs/FEATURE_ACCEPTANCE.md) · [Architecture](docs/ARCHITECTURE.md) · [Release notes](docs/RELEASE_NOTES.md) · [History](docs/history/)
