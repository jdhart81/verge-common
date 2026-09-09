# Verge Common

**Open infrastructure for cooperative conservation.**

A conservation network and shared co-op workspace for EcoHedge projects and larger land parcels. Communities can organize projects, manage private conservation records, vote on allocation policies, and account for externally documented credit holdings and proceeds.

[Website](https://verge-common-community.jdhart.chatgpt.site) · [Conservation network](https://verge-common-community.jdhart.chatgpt.site/network/) · [Member workspace](https://verge-common-community.jdhart.chatgpt.site/workspace/) · [Contribute](CONTRIBUTING.md)

The hosted site currently uses owner-only access until the owner approves public website access. The repository is public. Making a co-op profile public within the app does not override the host's access policy.

## Start your own community

Clone or download this repository, install Node.js 22.13+, and run `npm run launch` in the project folder. This installs the locked dependencies, prepares a local database, and opens the development service. Follow its printed local URL, sign in, create a co-op, and use the **Start** checklist. This is a local trial, not a public production deployment.

See [Worldwide adoption](docs/WORLDWIDE.md) for regional setup and production hosting boundaries.

## What is implemented

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
- Private PDF/image/text uploads, SHA-256 file digests, evidence submissions, and independent review.
- Versioned allocation-charter proposals with frozen electorates, member votes, quorum, and tallies.
- External legal authority, serialized credit holding, settlement, allocation, payment receipt, and retirement records.
- Two-person reviews, integer-cent allocations, per-co-op quantity caps, duplicate references, and linked audit history.
- Scoped JSON exports, membership removal, member exit, and workspace archival.
- The separate hypothetical `/coop/` calculator and device-local `/demo/` stewardship planner.

## What the system does not execute

Verge Common does not form legal co-ops, execute or record deeds, certify ecological measurements, issue or transfer registry credits, initiate sales, send payments, or independently validate bank/registry receipts. Authorized people and external institutions perform those actions. The system stores their supporting records and review decisions.

The whole operational record flow is implemented; direct registry and payment-provider integrations are not. A `reviewed` receipt means another steward recorded a review, not that a bank or registry independently authenticated it to the software. See [OPERATIONS.md](docs/OPERATIONS.md) and [COOPERATIVE_SYSTEM.md](docs/COOPERATIVE_SYSTEM.md).

## Local development

Use Node.js 22.13+ and npm. The local development server uses the Sites starter's development-only sign-in flow. Never expose that development server publicly.

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
npm run build
```

With the local development server running, run the HTTP persistence/concurrency checks:

```sh
python3 tests/http_integration.py
```

Tests use synthetic local records and archive their workspaces. No test writes to the hosted service.

## Hosting and authentication

This is a Cloudflare Worker application using D1 and R2, not a static export. The build produces `dist/server/index.js`, static assets, and Sites hosting/migration metadata. `.openai/hosting.json` retains the official project's ID; forks must use their own project ID and logical storage bindings.

On Sites, the dispatcher owns sign-in, strips caller-supplied identity headers, and forwards authenticated identity. Every private API additionally enforces co-op membership/roles server-side. Self-hosting requires an equivalent trusted authentication gateway that strips incoming `oai-authenticated-user-*` headers and injects verified identities. Do not expose a raw Worker accepting arbitrary identity headers. Generic self-hosted OAuth and payment integrations are not bundled.

D1 migrations are generated by Drizzle and applied before hosting. Do not rewrite migrations after deployment.

## Data boundaries and operating limits

Public profiles show only explicitly public project summaries/updates, general regions, and active member counts. Agreements, land references and evidence are restricted to their submitters and stewards. Members can inspect co-op governance and financial records; payout bank details are not collected. Files download as attachments. Review the [privacy policy](PRIVACY.md).

Each co-op is an atomically versioned aggregate with a 750 KB application limit, 500 member records, and 5,000 audit events. File storage is limited to 200 files per co-op, 4 MB each. This architecture favors correctness for initial partner co-ops; a normalized event/record store is required before larger deployment. Cross-co-op or cross-installation registry claims still need the external registry's authoritative duplicate/custody checks.

## Mission and sustainability

The platform takes no percentage of credit sales. Co-op-approved stewardship and treasury allocations remain co-op funds. Optional hosted operation/support may fund maintenance; no paid service or financial outcome is promised by this release.

The repository contains the clean public system. Separate private research, proof candidates, production records, and private pilot source were not published as a bulk release. No formal or ecological certification is claimed.

## License

Original code and original workflow templates: GNU AGPL v3.0 only. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Dependency code retains its own licenses. Forks are welcome; do not imply endorsement through the Verge Common name.
