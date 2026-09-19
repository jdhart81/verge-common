# One service, web, native and agent clients

## Authoritative implementation

The public `jdhart81/verge-common` repository (the local `community/` checkout) is the authoritative implementation. Website, native and agent clients use the same co-op service. They do not maintain separate authoritative memberships, roles, posts, votes, consent or financial records.

The sibling private `application/` checkout is a legacy/reference implementation, not a runtime dependency. Its normalized social/monitoring tables and calculation engine require explicit reconciliation before any migration. No private records, research material, formal artifacts, account data or credentials are copied into this public repository by this decision.

## Runtime paths

The self-hosted production path is:

```text
Browser / native client / MCP client
                |
          Canonical HTTPS
                |
         Caddy reverse proxy
                |
      Node account/API/MCP gateway
                |
      Loopback-only production app
                |
   Shared SQL routes and domain commands
                |
   Local SQLite + private evidence files
```

`npm run build:selfhost` selects the Node storage adapter. The adapter implements the existing D1 query interface against SQLite and the existing private-object interface against files outside the asset directory. Routes keep the same SQL tables, versioned `state_json`, membership filtering, command validation, request IDs and audit transport. The initial SQL migration is applied transactionally; this is not a normalized-schema rewrite or an automatic migration from a hosted Sites database.

The gateway and internal app share a single process and database connection. SQLite uses WAL, full synchronous writes and version compare-and-swap. Evidence uses private immutable paths and SHA-256 records. The supported model is one application process on one server; replicas, a network-mounted SQLite database and high availability are not supplied. Backup snapshots and isolated restore verification are implemented. Scheduling, encrypted offsite transfer, key custody and a successful deployment recovery rehearsal require operator setup. See [single-server operations](../self-hosted/README.md).

The original `npm run build` path remains a Cloudflare Worker using D1/R2 and the Sites dispatcher. Its project metadata must be replaced when a fork provisions its own hosting. The two runtime paths share domain behavior while using different identity and storage boundaries. A self-hosted release does not reuse Sites authentication or copy private pilot data automatically.

## Identity and request boundaries

The Node gateway supplies browser registration/sign-in, password changes, one-time recovery codes, account export/closure, seven-day sessions and 90-day personal tokens. Passwords use salted scrypt hashes; sessions, recovery codes and tokens are stored hashed. Tokens are shown once and revocable. Password change/recovery invalidates earlier sessions and tokens. There is no email verification/reset service, MFA or OAuth provider.

Incoming identity and forwarding headers are removed before the gateway injects the verified account into the loopback app. The internal app listener must not be publicly reachable. Browser mutations require the canonical origin. Bearer clients can omit an origin after verification; a foreign origin is rejected, and scopes are checked before forwarding. `app:read`/`app:write` do not grant MCP access; `mcp:read`/`mcp:write` do not grant account-management or app-API access.

On the Cloudflare/Sites path, the dispatcher owns production sign-in, strips supplied identity headers and injects verified identity. In both cases, application routes independently enforce membership, ownership and steward review. Client-provided user IDs are never an authentication mechanism.

## Client responsibilities

| Area | Authoritative implementation | Native / agent connection |
| --- | --- | --- |
| Public discovery | `/api/network` and `publicWorkspace` projection | Native recent-co-op reads; public MCP reads/planning |
| Identity and membership | Runtime authentication boundary plus shared membership checks | Native personal app token; hosted MCP personal agent token; invitations and membership administration use the website |
| Private co-op state | `/api/workspaces`, filtered member view, shared commands, version/request ID and audit | Native list/detail, member-only updates and field submissions; hosted MCP filtered reads and bounded project/update/task/RSVP commands |
| Evidence files | `/api/files`, scoped access and private storage | Website upload/download; no native upload or MCP attachment tool in this release |
| Invitations | `/api/invitations`, expiration, revocation and independent membership approval | Browser workflow; a pending membership grants no private records |
| Field drafts | Device-local journal until explicitly submitted | Native selects a co-op and reviewed parcel, confirms the draft and submits through the normal command; manual export/import remains available |
| Land preparation and finance | Reviewed boundaries/consent, scoped rights agreements, preparation checks and recorded external receipts | Website workflows; native and MCP do not approve rights, issue credits or execute payments |
| Monitoring analysis | Catalogue metadata and separately operated imagery worker | Native field observations use reviewed parcels; NDVI receipts are screening records requiring review |

### Native client

`CommunityService.origin` is the single native setting for API requests and browser handoffs and now defaults to `https://vergecommon.com`. A user signs in on the website, creates an `app:read` or `app:write` token and explicitly pastes it into the native client. It is stored in Keychain with `WhenUnlockedThisDeviceOnly` protection, keyed to the service origin. Browser cookies and passwords are not copied into the app.

Native clients refuse redirects, use bounded time/size limits, disable cookie and URL-response storage, and retain private workspace responses only in memory. Disconnect removes the local saved credential and private workspace view; revocation on the website invalidates every copy. Server-side expiry, revocation, scopes and membership are checked on every authenticated request.

Member posts retain their request ID for a connection retry and require refresh/confirmation after a version conflict. Field submission maps one selected local note to one reviewed current parcel boundary. A stable ID for that exact note/parcel/boundary prevents a repeat from duplicating the observation across app restarts. Edited notes represent distinct submissions. No journal entry uploads automatically, and successful submission does not erase the local draft or establish an approved conservation result.

Native public discovery requests five recent co-ops from the same published-field projection as the website. The endpoint supports `limit=1..30`, preserving the default 30 for existing clients. Full directory browsing, invitations, advanced governance and financial workflows use browser handoffs. Infinite scrolling, notifications and native evidence uploads are not implemented. The legacy timestamp pagination needs a tie-safe cursor before directory scaling.

### Hosted MCP

The Node gateway exposes stateless Streamable HTTP at `/mcp` and connection metadata at `/.well-known/mcp.json`. It requires bearer tokens even for its public tools. Cookie sessions are insufficient. Each request creates an isolated server/transport, and read/write callbacks use the same member view and audited domain command path as the website.

`mcp:read` permits discovery/planning and the owner's permitted workspace reads. `mcp:write` additionally exposes a strict command allowlist for proposed projects, member-only updates, tasks and RSVPs. There are no membership-escalation, public-publishing, legal-review, credit-issuance or payment commands. Local stdio retains only the public/planning tools and accepts no account credentials. See [the complete MCP contract](../mcp/README.md) for schemas, retry rules, client configuration and unsupported OAuth-only clients.

## External systems and evidence

A consenting nonprofit, qualified land/title review, executed instruments, approved carbon methodology, accredited verification, registry issuance/custody and banking/payment execution are external prerequisites. The software can prepare and review records describing them; it cannot create those facts or authenticate a bank/registry receipt on its own. Polygon estimates and overlap screens cover the recorded co-op dataset, not land registries or other installations. No cross-installation claim uniqueness is established.

## Legacy reconciliation and release evidence

- Legacy posts, reactions and notifications should be compared for behavior, permissions, moderation and migration requirements before anything is ported. A table's existence is not feature acceptance.
- Legacy `monitoringCycles`, `candidateCreditLots` and `monitoring-engine.ts` describe a different calculation/storage path. They are not authenticated imagery or registry integrations.
- A future normalized record store must preserve actor permissions, replay protection, transaction boundaries and audit history through a rehearsed migration. Preserve original deployed migration files and backup evidence.

The runtime and client implementations are available in source. [Feature acceptance](FEATURE_ACCEPTANCE.md) distinguishes local evidence from the final deployment receipt. Public website availability, production recovery, physical-device acceptance, Apple signing and TestFlight/App Store uploads remain separate release checks. Do not describe a source or simulator build as a distributed mobile release.
