# VergeCommon — current status

## Unreleased — optional email updates

Disabled by default, with a separate double opt-in form, signed 48-hour confirmation links, Resend-only subscriber records, abuse limits and no tracking. Adds an offline-tested campaign draft/preview/lint/test/send CLI and a read-only DNS checker. See [email operator runbook](docs/EMAIL.md) for configuration and deliberate send gates. No deployment, real email, DNS change or provider setup is part of this change.


**Last updated: 29 September 2026 EDT (v0.9.0 live; 30 September UTC).** This is the single, current summary of what is live, what is verified and what is still open. Update it with every deployment or change in operating state. Dated deployment receipts and reviews are preserved unchanged in [docs/history/](docs/history/).

## At a glance

| Area | State |
| --- | --- |
| Website and shared app | **Live public technical beta** at https://vergecommon.com — accounts, private co-ops, invitations, discussion and conversation actions, events, parcels/boundaries, evidence, governance records, operator report queue, hosted MCP. Free to use. |
| Hosting | One dedicated DigitalOcean droplet (`601953476`), Docker container behind Caddy, SQLite + private evidence files. Separate from Viridis Conservation. |
| Source of truth | Production runs **v0.9.0**, tagged merge commit `6089e6a` ([PR #10](https://github.com/jdhart81/verge-common/pull/10), [PR #11](https://github.com/jdhart81/verge-common/pull/11)). [Deployment and recovery receipt](docs/history/DEPLOYMENT_V090_2026-09-29.md). |
| Automated checks | v0.9.0: **287/287 Node tests, TypeScript, lint, simulation and build pass**; all four final source CI jobs and secret scan passed; exact-image isolated acceptance and pre/post-deploy restore checks passed; npm audit 0 vulnerabilities. |
| Launch gate | `npm run launch-gate -- --expect-commit 6089e6a` against production: **24 pass, 0 fail, 9 manual, 0 skipped**. Manual operational and owner gates remain open. |
| Real adoption | Unproven. At 30 Sep 01:38 UTC: 2 accounts including owner tests, no active co-op or evidence files. Apple/Google records and one new registration do not establish external adoption. |

## Deployed release (v0.9.0)

- Public activity/progress pages with social previews and QR codes; sign-in/join returns to the activity.
- Actual attendance, independent completed-work review and explicit publication/withdrawal.
- Evidence-backed recurring care and disturbance history, private notices and classified participation/repeat/shared-link contribution reports in **Care & participation**.
- Optional browser reminders, off by default; actual device display remains unqualified.
- `/healthz` reports version `0.9.0` and exact commit `6089e6a`.
- Preserves v0.8.1 production monitor, contrast fixes and shared-network request limits.

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
- Failure alerting: GitHub Actions Production monitor is configured for 15-minute health and nightly full launch-gate checks. Full run verified after v0.9.0 deployment in the [deployment receipt](docs/history/DEPLOYMENT_V090_2026-09-29.md). Owner Watching → All activity and actual failure-email delivery remain unverified; no alert rehearsal was performed. The separate Mac webhook remains unconfigured.
- Historical plaintext archives exist on the owner's Mac (`private-backups/`); their retention/disposal is an open owner decision.
- Storage model: a bounded JSON aggregate per co-op (5,000 events / 750 KB). Suitable for pilots; needs capacity alerts and a scalable store before large co-ops.

Runbooks: [docs/OPERATIONS_BETA.md](docs/OPERATIONS_BETA.md), [docs/OPERATIONS.md](docs/OPERATIONS.md), [self-hosted/README.md](self-hosted/README.md).

## Not built (intentionally separate work)

- Apple signing, device acceptance, TestFlight/App Store distribution — [docs/APPLE_RELEASE.md](docs/APPLE_RELEASE.md)
- Online project contributions (Stripe) — [docs/FUNDING.md](docs/FUNDING.md)
- Carbon credit issuance, sales, registry custody or payment execution. The software records external events; it does not move money or issue credits.
- Hosted, unattended imagery monitoring jobs.

## Next steps, in order

1. Establish independent key custody, qualify failure-alert delivery and name a second operator.
2. Run one real group with two stewards, 5–10 neighbours, one shared activity and a later-week repeat. Record actual work and classify test accounts correctly.
3. Test reminders on each participant device, especially installed iPhone/iPad web apps. Provider revocation on account deletion, physical-device/accessibility acceptance and native distribution remain separate work.
4. Use participant/referred contribution and conservation-care records to decide later nearby discovery, unattended imagery monitoring and scalable-storage work. No adoption or ecological impact is inferred from CI or traffic.

## Where to read more

[README](README.md) · [Roadmap](ROADMAP.md) · [Launch gates](docs/LAUNCH.md) · [Service coverage](docs/SERVICE_COVERAGE.md) · [Feature acceptance](docs/FEATURE_ACCEPTANCE.md) · [Architecture](docs/ARCHITECTURE.md) · [Release notes](docs/RELEASE_NOTES.md) · [History](docs/history/)
