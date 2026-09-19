# VergeCommon

## What if conservation could be an open-source project?

**Enter VergeCommon: open tools for people caring for the places they share.**

Organize a local conservation project, document the work, and make decisions together. From hedgerows and woodlots to larger landscapes, communities should be able to inspect, adapt, and improve the tools they depend on.

**Early cooperative pilot.** The shared website is live with browser accounts, private co-ops and scoped agent access. The repository also includes the self-hosted account/storage runtime and native participation source. This is an invitation to build and test with us. Real partner adoption and verified environmental impact have not yet been demonstrated. See [current beta readiness](docs/BETA_READINESS_2026-09-19.md) for the next candidate, verification and remaining release requirements.

## Find your first contribution

| You bring | Start here |
| --- | --- |
| Local conservation experience | Walk through one activity with synthetic records and report the first confusing step. |
| Field or research experience | Review the [monitoring workflow](docs/MONITORING.md) and identify missing evidence or uncertainty. |
| Design or accessibility skills | Try the planner with a keyboard or narrow screen; report a reproducible barrier. |
| Development skills | Run the project locally and choose a bounded task from [the contributor guide](CONTRIBUTING.md). |

[Contribution guide](CONTRIBUTING.md) · [Roadmap](ROADMAP.md) · [Pilot checklist](docs/PILOT.md) · [Launch kit and release gates](docs/LAUNCH.md)

## Explore the project

[Website](https://vergecommon.com) · [Conservation network](https://vergecommon.com/network/) · [Member workspace](https://vergecommon.com/workspace/) · [Account and device access](https://vergecommon.com/account) · [Contribute](CONTRIBUTING.md)

`vergecommon.com` is the canonical service address. The shared application passed live HTTPS acceptance on September 19, 2026, using three independent synthetic accounts. The pilot source is on `build/coop-launch-readiness` while [PR #2](https://github.com/jdhart81/verge-common/pull/2) remains under review. See the [latest deployed build receipt](docs/LAUNCH_BUILD_2026-09-19.md) and [next candidate readiness](docs/BETA_READINESS_2026-09-19.md) for exact revisions and operational limits before inviting participants. Co-op and project publication is opt-in; member records and private land evidence retain their server-side access rules.

## Start your own community

For the self-hosted application, use Node 24.19.0 and follow [the single-server operator guide](self-hosted/README.md). It includes browser accounts, SQLite, private evidence files, device tokens, hosted MCP, deployment configuration, and backup/restore procedures. Build and exercise an isolated local instance before publishing it.

The original Cloudflare/Sites development path remains available through `npm run launch` with Node.js 22.13+. Its identity is a development fixture; never expose that development server publicly. In either workflow, create a co-op and follow the **Start** checklist. See [Worldwide adoption](docs/WORLDWIDE.md) for regional setup.

## Agents and MCP

The [MCP server](mcp/README.md) supports local stdio and authenticated Streamable HTTP at `/mcp` in the self-hosted runtime. Local stdio offers public discovery and hypothetical pooling/allocation drafts. Hosted tokens with `mcp:read` can also read the owner's permitted workspaces; `mcp:write` adds bounded project, member-update, task and RSVP commands. App tokens and MCP tokens are separate scopes.

Create a personal agent token from `/account`, store it in the client's secret settings, and revoke it when finished. The hosted endpoint requires bearer support; OAuth is not implemented. Agents cannot approve legal/financial records, escalate membership, issue credits, execute payments, or publish public updates. The live endpoint passed initialization, private-read, bounded-write and denied-financial-command acceptance checks on September 19, 2026.

## What is implemented

- A single-server Node runtime with durable SQLite and private evidence files, an authenticated gateway, username/password accounts, recovery codes, account export/closure, and revocable device/agent tokens.
- Boundary-derived area estimates, overlap screening, reviewed parcel-specific consent, scoped agreement coverage, stale-record detection, and withdrawal/revocation history. [Pooling safeguards](docs/POOLING_SAFEGUARDS.md).
- iPhone/iPad source for authenticated member workspaces, member posts, explicit field-draft submission and deliberate photo/PDF/text evidence submission. A protected, account-bound queue retains exact retry requests through interrupted connections. Public discovery and the protected offline journal remain available; signing, device acceptance and Apple distribution are separate release steps.

- Exportable imagery jobs and an independent NDVI screening worker, with validated result imports and human review. [Worker instructions](workers/imagery/README.md).


- Private versioned GeoJSON boundaries, independent review, explicit external-search consent, Copernicus Sentinel-2 catalogue discovery, and reviewed field observations. See [Monitoring](docs/MONITORING.md).


- A member community board with shared events, capacity-aware RSVPs, private calendar downloads, project discussions, and steward moderation.


- A guided six-step co-op setup, local organization discovery links, and self-reported organization profiles.
- Single-use private invitations with expiry, revocation, and steward approval before record access.
- Country/territory and accounting currency settings, correct currency minor units, and hectares/acres/m² intake.
- Snapshot-based carbon pathway assessments with methodology references and independent human review.
- A worked payout preview before members propose and vote on their policy.
- Signed-in, durable co-op workspaces with steward/member roles and membership requests.
- Opt-in co-op/project discovery, general-region search, shareable links, updates and moderation.
- Projects, assigned conservation actions, completion records, and private parcel/consent intake.
- Private agreement submissions with independent review and externally executed instrument references.
- Private PDF/image/text uploads, SHA-256 file digests, evidence submissions and independent review; exact upload retries, cancellation, expiry and durable cleanup.
- Partner representative invitations, acceptance, own authority evidence, independent co-op review and withdrawal. This grants no extra permissions and does not independently verify an organization.
- Coarse capacity warnings and a finite reserve for authorized safety actions; ordinary additions pause before the hard limit.
- Versioned allocation-charter proposals with frozen electorates, member votes, quorum, and tallies.
- External legal authority, serialized credit holding, settlement, allocation, payment receipt, and retirement records.
- Two-person reviews, integer-cent allocations, per-co-op quantity caps, duplicate references, and linked audit history.
- Scoped JSON exports, membership removal, member exit, and workspace archival.
- The separate hypothetical `/coop/` calculator and device-local `/demo/` stewardship planner.

## What the system does not execute

Verge Common does not form legal co-ops, execute or record deeds, certify ecological measurements, issue or transfer registry credits, initiate sales, send payments, or independently validate bank/registry receipts. Authorized people and external institutions perform those actions. The system stores their supporting records and review decisions.

The cooperative preparation and operational record workflows are implemented; direct registry and payment-provider integrations are not. A `reviewed` receipt means another steward recorded a review, not that a bank or registry independently authenticated it to the software. See [OPERATIONS.md](docs/OPERATIONS.md) and [COOPERATIVE_SYSTEM.md](docs/COOPERATIVE_SYSTEM.md).

## Local development

For a local instance of the self-hosted production build, use Node 24.19.0:

```sh
npm ci
npm run build:selfhost
VERGE_DATA_DIR=/tmp/vergecommon-local-data npm run start:selfhost
```

Open the printed loopback URL and register a local account. Keep its recovery code privately. The data path is persistent; use a dedicated empty path for synthetic acceptance tests. Follow the [operator guide](self-hosted/README.md) for canonical origin, reverse proxy, durable volumes and production settings.

For the original Cloudflare/Sites development workflow, use Node.js 22.13+ and npm. This development-only sign-in server must stay local:

```sh
npm ci
npm run db:migrate:local
npm run dev
```

Open the printed local URL and use Sign in. Local data and files live under ignored `.wrangler/`. The default local identity is a development fixture, not a production account.

## Validation

```sh
npm test
npm run typecheck
npm run lint
npm run build:selfhost
```

With a local self-hosted production build running against dedicated synthetic data:

```sh
VERGE_TEST_ORIGIN=http://127.0.0.1:3100 python3 tests/selfhost_acceptance.py
```

This checks independent accounts, invitations and access boundaries, version conflicts/retries, evidence storage, token scopes/revocation, hosted MCP and account closure. The runner defaults to local services and requires explicit opt-in for private synthetic fixtures on the canonical production service. Check [feature acceptance](docs/FEATURE_ACCEPTANCE.md) and the [deployment receipt](docs/DEPLOYMENT_2026-09-19.md) for actual results.

With the original Cloudflare development server running, run its HTTP persistence/concurrency checks:

```sh
python3 tests/http_integration.py
```

Local tests use synthetic records and archive their workspaces. The separately authorized production acceptance run also used private synthetic records, archived its workspace and closed its test login accounts.

## Hosting and authentication

Two runtime paths share the same routes, SQL schema, co-op state transport and domain commands:

- **Self-hosted Node:** `npm run build:selfhost` builds the shared app for the bundled gateway. SQLite adapters replace D1 and private local evidence replaces R2. A single application process runs behind Caddy; the internal app listener is loopback-only. Browser accounts use salted scrypt password hashes and secure session cookies. Expiring device/agent tokens are stored hashed, checked on each request and revocable. Cookie writes require the canonical origin; verified bearer clients use their own scopes without copying browser cookies.
- **Cloudflare/Sites:** `npm run build` retains the Worker, D1 and R2 deployment. The Sites dispatcher supplies authenticated identity and strips caller identity headers. `.openai/hosting.json` retains the original hosting project ID; forks must use their own project and storage bindings.

Both paths enforce co-op membership and roles inside the private APIs. Never expose the internal application listener or trust caller-supplied identity headers. Self-hosted accounts use usernames and a one-time recovery code, with no email verification, email reset, MFA or OAuth provider. Save the recovery code securely. Password change/recovery revokes earlier sessions and tokens. See [Security](SECURITY.md), [architecture](docs/ARCHITECTURE.md) and [the operator guide](self-hosted/README.md).

The self-hosted adapter applies the existing initial SQL migration transactionally. It does not automatically copy data or identity from an existing Sites deployment. Preserve deployed migration history and rehearse any later schema or record migration with a backup.

## Data boundaries and operating limits

Public profiles show only explicitly public project summaries/updates, general regions, and active member counts. Agreements, land references and evidence are restricted to their submitters and stewards. Members can inspect co-op governance and financial records; payout bank details are not collected. Files download as attachments. Review the [privacy policy](PRIVACY.md).

The self-hosted runtime supports one application process and one local SQLite database; it is not a replicated/high-availability deployment. Daily local backups are active, staging and production restore verification passed, and an initial matching production archive was copied offhost. See the deployment receipt for the exact recovery results. A recurring encrypted offsite schedule and recovery-key custody still require operator configuration. Each co-op is an atomically versioned aggregate with a 750 KB hard application limit, 500 member records and 5,000 audit events. In the next candidate, ordinary growth pauses at 650 KB or 4,500 audit events to reserve finite space for authorized safety actions; a private capacity banner warns members. File storage is limited to 200 files per co-op, 4 MB each. This architecture favors correctness for initial partner co-ops; a normalized event/record store is required before larger deployment. Cross-co-op or cross-installation registry claims still need the external registry's authoritative duplicate/custody checks.

## Mission and sustainability

The platform takes no percentage of credit sales. Co-op-approved stewardship and treasury allocations remain co-op funds. Optional hosted operation/support may fund maintenance; no paid service or financial outcome is promised by this release.

The repository contains the clean public system. Separate private research, proof candidates, production records, and private pilot source were not published as a bulk release. No formal or ecological certification is claimed.

## License

Original code and original workflow templates: GNU AGPL v3.0 only. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Dependency code retains its own licenses. Forks are welcome; do not imply endorsement through the Verge Common name.

## Shared service and native app

The website and native client use this repository's co-op service. See [architecture and legacy reconciliation](docs/ARCHITECTURE.md) and [iPhone/iPad build status](ios/README.md). Native public discovery, personal-device authentication, member posts and explicit field observation submission are implemented against `https://vergecommon.com`. Advanced governance, invitations, mapping and financial workflows use the website. Physical-device acceptance, signing and TestFlight/App Store distribution remain release requirements; source implementation is not a distributed mobile release.
