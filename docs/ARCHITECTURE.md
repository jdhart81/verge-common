# One service, web and native clients

## Current implementation decision

The public `jdhart81/verge-common` repository (the local `community/` checkout) is the authoritative implementation for continued product development. Its existing co-op service is shared by the website and native clients. Do not create a second native database of memberships, roles, posts, votes or payments.

The sibling private `application/` checkout is a legacy/reference implementation, not a runtime dependency of this repository. Its normalized social/monitoring tables and calculation engine require explicit reconciliation before any migration. No private records, research material, formal artifacts, account data or credentials are copied into this public repository by this decision.

| Area | Authoritative implementation | Native connection |
|---|---|---|
| Public discovery | `/api/network` and `publicWorkspace` projection | Native HTTP read of recent co-ops, projects, updates and events |
| Identity and membership | Sites-authenticated server identity and co-op membership checks | Not connected for native authenticated requests; browser handoff only |
| Private co-op records and mutations | `/api/workspaces`, shared domain commands, optimistic versions and audit | Not connected yet |
| Evidence files | `/api/files`, server-scoped access and storage | No native upload yet |
| Invitations | `/api/invitations`, existing expiration and review controls | Browser flow only |
| Field drafts | Device-local journal until explicitly submitted | Versioned export/import; never authoritative parcel identity or review status |
| Monitoring | Reviewed boundaries, discovery endpoint and separately operated imagery worker | Public native discovery is unrelated to carbon verification |

Native discovery uses the same published-field projection as the website. The list endpoint accepts `limit=1..30`; existing clients retain the default 30. The native client requests five recent co-ops and provides a browser link for the full directory. It does not implement infinite scrolling, geographic search or notifications. The legacy timestamp pagination still needs a tie-safe cursor before broad directory scaling.

`CommunityService.origin` is the single native deployment setting for API requests and community browser links. It defaults to the existing private pilot. Native requests send no copied browser cookies or bearer tokens, refuse redirects, do not persist responses, and have time/size limits. Host-level restrictions remain authoritative: local or fixture tests are not proof that a phone can access the hosted pilot.

## Legacy reconciliation backlog

- Social posts, comments, reactions and notifications exist in the legacy schema. Compare behavior, permissions, moderation and migration requirements before porting anything absent in the current service. Table existence is not feature acceptance evidence.
- Legacy `monitoringCycles` / `candidateCreditLots` and `monitoring-engine.ts` describe a different calculation/storage path. Do not present those calculations as an authenticated imagery or registry integration.
- The current bounded co-op JSON aggregate is the pilot storage model. If moving to normalized tables, preserve actor permissions, replay protection, transaction boundaries and the existing audit chain, with a rehearsed data migration.

## Next authenticated native milestone

Design and implement an explicit native session flow with a supported identity provider, secure device token storage, expiry/revocation, logout and server-side scope checks. Never embed Sites bypass credentials, trust client-supplied user IDs, or remove same-origin web protections to make a native request succeed. Then connect membership, discussions/events, and field submissions through the existing domain rules. Test with distinct member/steward accounts and restricted parcels before distribution.

Production website changes and TestFlight uploads remain separate release actions. The repository candidate can be tested without changing the hosted audience.
