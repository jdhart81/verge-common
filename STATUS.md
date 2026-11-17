# VergeCommon — current status

## Corridor progress: every woodlot a node — deployed 16 November 2026

**Production runs v0.11.0, commit `6ce4f0859cb40717ce87281c44432aa382fa535d`, since 16 November 2026 at 23:35:37 UTC**: the first-day build `6457d84` plus only PR #99. The Woodland tab opens on corridor progress (the aim, five ordered steps, each woodlot as a node); a line above the tabs, woodlot wording in Parcels and a “Join the corridor” consent form point the rest of the app at it. A signed-in smoke test ran on production itself with a throwaway account that was then deleted. Receipt and rollback: [16 November evening release](docs/history/RELEASE_CORRIDOR_PROGRESS_2026-11-16.md).

## An easier first day for a new co-op — deployed 16 November 2026

**Deployed as commit `6457d84ba4444e3bbdae3be6fd9f794a22f9a635` on 16 November 2026 at 02:17:45 UTC (since superseded by `6ce4f08`, above)**: the late-evening build `f91cea0` plus only PRs #96 and #97. A co-op opens on nine everyday tabs with the rest behind one More link; Get started has a Map the corridor step; the parcel map opens on the land; an organization profile no longer needs a website; votes say what happens once everyone has voted; an empty woodland project says how to get layers. The whole app was walked as a new customer on the previous build first: every feature worked, with no privacy leak. Receipt and rollback: [16 November release](docs/history/RELEASE_FIRST_DAY_2026-11-16.md).

## The opening page shows how a co-op works — deployed 15 November 2026

**Deployed as commit `f91cea061e5141091cc40e2138fd845e9aa4689c` on 15 November 2026 at 22:56:35 UTC (since superseded by `6457d84`, above)**: the evening build `3378166` plus only PR #94. The opening-page animation now shows three neighbors' woodlots, one corridor mapped through all three, each owner agreeing for their own plot and connecting at its node, a co-op vote on a shared trail, the woodlots growing old and, as the aim, meeting the next co-op's corridor. It loops with no pause button; reduced motion shows the still scene. English only in production. Receipt and rollback: [15 November late release](docs/history/RELEASE_COOP_STORY_2026-11-15.md).

## Uses, facts and edge bands along the corridor; the corridor story — deployed 15 November 2026

**Deployed as commit `3378166f3cc52525fdf0f4fcdca42fbfb1d58673` on 15 November 2026 at 21:34:23 UTC (since superseded by `f91cea0`, above)**: the morning's build `12e0fec` plus only PRs #90, #91 and #92. The opening page tells the corridor story in six captioned scenes (English only in production; the Hindi captions ship with the Hindi home page). Receipt and rollback: [15 November evening release](docs/history/RELEASE_CORRIDOR_USES_2026-11-15.md). A woodland co-op can adopt a shared recreation use (walking trail, bike trail, disc golf) on a mapped stretch of its corridor; natural corridor stays the default. A use needs a corridor that still holds with its ground cleared, the agreement of every holder whose woodlot it crosses, and a co-op vote, and it can be ended by a steward or any crossed holder. Adopted cleared ground never counts toward old growth. Stewards also record rights-of-way and blowdown as facts, with a source and a second steward's review: a right-of-way's cleared ground stops counting as forest, and a blowdown stays corridor. A holder can also plant an agroforestry edge band of native tree crops beside the corridor, never in it. All of these are shown and drawn on a corridor map in the Woodland tab. Connecting one co-op's spine to the next and a carbon program application record are specified, not built ([spec](docs/specs/CORRIDOR_NETWORK_AND_CARBON_SPEC.md)). See the [woodland guide](docs/WOODLAND.md#recreation-along-the-corridor).

## Unreleased — optional email updates

Disabled by default, with a separate double opt-in form, encrypted 48-hour confirmation links and an explicit confirmation POST, Resend-only subscriber records, abuse limits and no tracking. Adds an offline-tested campaign draft/preview/lint/test/send CLI and a read-only DNS checker. See [email operator runbook](docs/EMAIL.md) for configuration and deliberate send gates. No deployment, real email, DNS change or provider setup is part of this change.

**Last updated: 16 November 2026 (an easier first day for a new co-op live; 15 November late evening: the opening page shows how a co-op works; evening: corridor uses, facts, edge bands and the corridor story live; morning: the old-growth corridor and dfm-core 0.3.0 live; 14 November: woodland Land Package downloads live; related-projects footer row live; before that, 6 November: v0.10.0 maintenance plus the MCP public-tools hotfix live; woodland projects on since 5 November).** This is the single, current summary of what is live, what is verified and what is still open. Update it with every deployment or change in operating state. Dated deployment receipts and reviews are preserved unchanged in [docs/history/](docs/history/).

## The old-growth corridor first, on dfm-core 0.3.0 — deployed 15 November 2026

**Production runs v0.11.0, commit `12e0fec6ca04d1556b65db9ad761670cfff9256d`, since 15 November 2026 at 15:11:03 UTC**: the 14 November build `7541560` plus only [PR #88](https://github.com/jdhart81/verge-common/pull/88). The [woodland page](https://vergecommon.com/woodland/) leads with the old-growth corridor, and woodland projects run the dfm-core 0.3.0 engine: retained corridors and core areas can record stand origin, remnant status and native share, a plantation never counts at old-growth age, and a corridor-permitted restoration planting stays permitted only with native species. Layers and plans without the new records give the results 0.2.0 gave, apart from the engine names. Structural connectivity only; age is reported, never condition. Only the image and `VERGE_BUILD_COMMIT` changed; `VERGE_WOODLAND_DFM=1` carried over. Nothing else from main shipped. dendriticforest.com was not rebuilt: it already serves the current site source. Receipt and rollback: [15 November release](docs/history/RELEASE_OLD_GROWTH_2026-11-15.md).

## Woodland downloads as a Land Package — deployed 14 November 2026

**Production ran v0.11.0, commit `754156087e12da2a25a5603595f96d28abbf0f0c`, from 14 November 2026 at 20:51:21 UTC until the 15 November release above**: the earlier 14 November build `49a73f7` plus only the woodland Land Package downloads. A woodland draft and a checked plan can be downloaded as a [Land Package](https://viridisconservation.com/ecosystem/land-package), the open exchange format read by the Viridis Ecological OS decision workspace. The conversion runs in the browser with the vendored open-source converter (`lib/land-package.mjs`, pinned by hash in `tests/land-package.test.mjs`) and sends nothing to a server. The file converts back to a Landscape Package with the same content and is marked as personal data whenever it holds woodlot parcels. No server, database, MCP or permission change. After the release both buttons were pressed in a real browser against the released commit running locally with a synthetic co-op (`tests/browser-woodland.mjs`, 18 checks passed), and the converter served by production was run in a signed-in browser session and gave the same package as the reference implementation. The buttons were not pressed inside a production co-op, because the owner account has none. Receipt and rollback: [14 November Land Package release](docs/history/RELEASE_LAND_PACKAGE_2026-11-14.md).

## Related open projects in the footers — deployed 14 November 2026

**Production ran v0.11.0, commit `49a73f7721278046f2633d601cf810c404bc1429`, from 14 November 2026 at 15:10:27 UTC until the Land Package release later that day**: the 7 November build `ca4b9fc` plus only one footer row on the public pages. It links Dendritic Forest Management, the Global Soil Intelligence Project and Viridis Conservation, and points once to land plans from Viridis, labelled as a separate service. VergeCommon states no price and sells nothing. dendriticforest.com was rebuilt the same day from hdfm-framework `0a9c9de` with matching links. Receipt and rollback: [14 November release](docs/history/RELEASE_ECOSYSTEM_LINKS_2026-11-14.md).

## v0.10.0 — woodland corridors and the old-growth spine, deployed 4 October 2026

**The maintenance deployment runs exact source `914793054eb8e1b0e86a833d30a40db5acb0e204`**, live since 4 October at 20:33 EDT (`2026-10-05T00:33:11Z`). It includes merged dependency PRs #31 and #30, the historical DFM documentation in #39, and the already deployed final dfm-core 0.2.0 engine. The initial v0.10.0 release went live at 22:03 UTC on 4 October. It adds:
- woodland projects ([PR #33](https://github.com/jdhart81/verge-common/pull/33), [PR #37](https://github.com/jdhart81/verge-common/pull/37));
- the old-growth spine from dfm-core 0.2.0 ([PR #40](https://github.com/jdhart81/verge-common/pull/40));
- the public [/woodland/](https://vergecommon.com/woodland/) page;
- the pilot-readiness tooling.

**Woodland projects are on in production since 5 November 2026 at 12:43 UTC.** The owner turned them on by setting `VERGE_WOODLAND_DFM=1` on the running container, same image and commit `9147930`; nothing was rebuilt. `/woodland/` says they are open as part of the public beta. Receipt and rollback: [woodland switch 5 November 2026](docs/history/WOODLAND_ON_2026-11-05.md). **The next release must carry the flag over**: the release scripts used on 4 and 23 October refuse to run while it is set (see the receipt).

[PR #41](https://github.com/jdhart81/verge-common/pull/41) is merged and deployed: the vendored engine SHA-256 is `dd5d1f41a1cb24ff49cfeb851ab0eaa13df2fa311ffb2fd5a4597046069d16f9`. The final engine includes the spine network soundness fix. dendriticforest.com serves exact hdfm-framework source `e27dbe4e4e24d0d6288333e74623b354cba0763e`, including merged [#45](https://github.com/jdhart81/hdfm-framework/pull/45): its homepage and Unbroken Woods links reach `/woodland/` and `#first-woodlot`, while the spine and prairie sections remain present.

Receipt: [maintenance deployment 4 October 2026](docs/history/DEPLOYMENT_MAINTENANCE_2026-10-04.md). The [final-engine follow-up](docs/history/DEPLOYMENT_FOLLOWUP_2026-10-04.md), [initial deployment](docs/history/DEPLOYMENT_V0100_2026-10-04.md) and [DFM public-site deployment 3 October 2026](docs/history/DEPLOYMENT_DFM_SITE_2026-10-03.md) remain immutable historical records. The annotated [`v0.10.0` tag](https://github.com/jdhart81/verge-common/releases/tag/v0.10.0) remains on exact `824019ce50d1ab0974369118d00493d78d9058ab`; tag object `1fee3843d3f653d43a5e8b06d48a0b5100a3988a`. It was not replaced by this maintenance release; the newer live source is recorded above. See also the [release notes](docs/RELEASE_NOTES.md) and [woodland projects](docs/WOODLAND.md).

## Hosted MCP public tools — hotfix deployed 6 November 2026

**Production ran v0.11.0, commit `ca4b9fcdc59dfb4df5a533fffe314ec879de1e00`, from 7 November 2026 at 18:12:16 UTC until the 14 November footer release below**: the 6 November build `5d1a276` plus only agent call counts (`GET /mcp/stats`) and source receipts on public tool answers. Agents can call the five public discovery and planning tools on `https://vergecommon.com/mcp` without a token, rate limited; private tools still need a personal agent token, and a bad token is refused with 401. `VERGE_MCP_PUBLIC=0` turns anonymous access off and `VERGE_MCP_STATS=0` turns counting off; both are unset. Every other setting, including `VERGE_WOODLAND_DFM=1`, was carried over. The MCP Registry lists 0.11.0. Receipt and rollback: [Release 0.11.0, 7 November 2026](docs/history/RELEASE_0_11_0_2026-11-07.md); previous: [MCP public tools 6 November 2026](docs/history/MCP_PUBLIC_2026-11-06.md).

## Pilot-readiness tooling — deployed; human qualification pending

The [local readiness report](docs/PILOT_READINESS.md), [audit](docs/PILOT_AUDIT_2026-10-03.md) and [operator rehearsal kit](docs/PILOT_REHEARSAL.md) describe the 3 October engineering checkpoint. That tooling is included in deployed `9147930`; owner start approval and actual pilot completion remain separate gates. Custody/recoverability, failure/recovery acknowledgement, Mac stale-run coverage, second operator, cohort/dates/support, urgent contact and real offered-device qualification remain open.

[hdfm-framework #46](https://github.com/jdhart81/hdfm-framework/pull/46) is merged with passing main and vendored-drift checks. The live `9147930` app retains the final engine archive recorded above (`dd5d1f41…`). The repacked tarball (`4c79dc3b…`) subsequently merged into repository main via the separate [verge-common #46](https://github.com/jdhart81/verge-common/pull/46), commit `18f265f842ad62a5c834fa8a6752537bfc6784b9`; it is outside this live deployment. [verge-common #32](https://github.com/jdhart81/verge-common/pull/32) merged into source on 30 October 2026 at `616956824cc5292b16a55dc9ce8debe85b97851a`; email updates remain unreleased and disabled by default, with deployment and provider/send approval separate. [hdfm-framework #24](https://github.com/jdhart81/hdfm-framework/pull/24) awaits the contributor's sign-off. The braces build-tooling audit finding awaits an upstream fix; no forced upgrade was applied.

## At a glance

| Area | State |
| --- | --- |
| Website and shared app | **Live public technical beta** at https://vergecommon.com — accounts, private co-ops, invitations, discussion and conversation actions, events, parcels/boundaries, evidence, governance records, operator report queue, hosted MCP. Free to use. |
| Hosting | One dedicated DigitalOcean droplet (`601953476`), Docker container behind Caddy, SQLite + private evidence files. Separate from Viridis Conservation. |
| Source of truth | Production runs **v0.11.0**, exact commit `6ce4f0859cb40717ce87281c44432aa382fa535d` since 16 November 2026 at 23:35 UTC ([receipt](docs/history/RELEASE_CORRIDOR_PROGRESS_2026-11-16.md)): the first-day build `6457d84` ([receipt](docs/history/RELEASE_FIRST_DAY_2026-11-16.md)) plus only corridor progress. That build was the late-evening build `f91cea0` ([receipt](docs/history/RELEASE_COOP_STORY_2026-11-15.md)) plus only the first-day changes. That build was the evening build `3378166` ([receipt](docs/history/RELEASE_CORRIDOR_USES_2026-11-15.md)) plus only the reworked opening-page animation. That build was the morning's build `12e0fec` ([receipt](docs/history/RELEASE_OLD_GROWTH_2026-11-15.md)) plus only corridor uses, facts, edge bands, the corridor map and the opening-page corridor story. That build was the 14 November build `7541560` ([receipt](docs/history/RELEASE_LAND_PACKAGE_2026-11-14.md)) plus only the old-growth corridor and dfm-core 0.3.0 change. That build was the 7 November build `ca4b9fc` ([receipt](docs/history/RELEASE_0_11_0_2026-11-07.md)) plus only the related-projects footer row ([receipt](docs/history/RELEASE_ECOSYSTEM_LINKS_2026-11-14.md)) and the woodland Land Package downloads, with `VERGE_WOODLAND_DFM=1` since 5 November 2026. [Maintenance deployment and recovery receipt](docs/history/DEPLOYMENT_MAINTENANCE_2026-10-04.md); [woodland switch receipt](docs/history/WOODLAND_ON_2026-11-05.md); [MCP public tools receipt](docs/history/MCP_PUBLIC_2026-11-06.md). |
| Automated checks | Maintenance source: all six main checks passed, including Node tests, TypeScript, lint and builds. The exact deployed image passed three private-copy self-hosted acceptance suites and empty-data woodland acceptance. Fresh pre-deploy, pre-switch and post-deploy backups passed isolated restore; read-only live rollback guards passed. Runtime/configuration fingerprints and single-writer checks passed. |
| Launch gate | `node scripts/launch-gate.mjs --expect-commit 914793054eb8e1b0e86a833d30a40db5acb0e204` from the owner Mac against production: **25 pass, 0 fail, 9 manual, 0 skipped**. Manual operational and owner gates remain open. |
| Real adoption | Unproven. At 30 Sep 01:38 UTC: 2 accounts including owner tests, no active co-op or evidence files. Apple/Google records and one new registration do not establish external adoption. |

## Previous deployed release (v0.9.0)

- Public activity/progress pages with social previews and QR codes; sign-in/join returns to the activity.
- Actual attendance, independent completed-work review and explicit publication/withdrawal.
- Evidence-backed recurring care and disturbance history, private notices and classified participation/repeat/shared-link contribution reports in **Care & participation**.
- Optional browser reminders, off by default; actual device display remains unqualified.
- At that release, `/healthz` reported version `0.9.0` and exact commit `6089e6a`; the current build identity is recorded above.
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
| TLS certificate, dendriticforest.com | 2027-01-02 | Automatic (Caddy). Verify after renewal. |
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
