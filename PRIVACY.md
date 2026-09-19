# Privacy and visibility

VergeCommon's hosted public beta at https://vergecommon.com is operated by Viridis LLC. The hosted [privacy summary](https://vergecommon.com/privacy/) and [support page](https://vergecommon.com/support/) provide account controls and current contact options. Keep beta records nonsensitive while getting familiar with the permissions and support available.

The self-hosted conservation system stores co-op records in a private SQLite database and evidence files on the dedicated server. Accounts use a chosen username, display name, salted password hash and a hashed recovery code. Email addresses are not required. Browser sessions and optional device/agent tokens are stored as hashes with expiry and revocation. The alternate Sites build uses its trusted identity gateway with D1/R2 storage.

## Public information

A steward can publish a co-op's introduction and general region. Public profiles show active member counts and only explicitly public projects and updates. Signed agreements, exact land references, evidence, member identities, votes, and financial records are not exposed through the discovery API. Website-level access restrictions still apply.

Do not put private addresses, sensitive habitat locations, personal information, or confidential evidence into public descriptions. The application cannot determine whether you have consent to publish what you enter.

## Private information

Active members can view co-op projects, governance and financial records. Parcel, agreement and evidence records are visible only to their submitters and stewards. File downloads require the uploader or an active steward. Stewards therefore have access to sensitive submitted material; choose them carefully.

The software does not collect payment-account credentials or send invitations. Sharing a link, copying text, or downloading an export is a deliberate user action. Exports contain private information and must be stored securely.

Removed members lose private access. Their earlier records remain with the co-op. Archiving stops edits and public discovery but preserves authorized reads. The current software has no hard-delete or automatic retention scheduler; operators must establish appropriate retention/deletion procedures before admitting sensitive or regulated records.

## Supporting tools

The `/coop/` hypothetical calculator keeps scenarios in page memory until exported. The `/demo/` local planner stores one plan in browser storage. These supporting tools do not write to the shared co-op ledger. The optional read-only browser-agent tool on `/demo/` can read that local plan in supporting browsers.

## Hosting and external references

The host may process request metadata, such as IP addresses, under its own policies. External document links and GitHub have their own policies. An HTTPS reference can change; a stored upload digest refers to the uploaded bytes. The application includes no advertising or application analytics tracker.

Invitation labels are private to stewards. Invitation secrets are stored only as SHA-256 hashes; the complete link is shown once and its fragment is submitted only when the recipient requests membership. Anyone holding a link may consume its single request, so share it privately. A steward must approve that request before private record access. Links expire after seven days. Retained invitations follow the co-op record retention policy; creating 200 invitations reaches the current per-co-op limit.

Organization profiles are self-reported. Public organization details appear only inside public co-ops when that profile also opts into public visibility. Country/territory is part of public co-op discovery. Do not put private locations in public profile fields. External discovery searches send the entered search text to the selected search provider when you follow the link.

Community event summaries may be public only when their event, project, and co-op all opt into public visibility. Exact meeting instructions remain member-only. Organizers and stewards see active members' RSVP names; other members see their own response and a total. Downloaded calendar files contain private meeting instructions and must be handled accordingly. They are static copies, not automatically updated subscriptions.

Discussion replies are always member-only. Reports are visible to the reporting member and co-op stewards. Hiding content removes it from regular member/public views but retains it in the co-op's moderated records; it is not deletion. Event organizers and stewards can cancel events; no automatic email or push alerts are sent.

Personal block lists are visible only to the blocking member. Blocking hides social updates, replies and events between the pair within that co-op. Shared governance records and public pages remain visible, and stewards retain access to moderation material. Blocking is not a deletion request and does not remove the other member from the co-op.

Transferring founder responsibility in Members changes application administration only. It does not transfer land rights, legal authority or financial records.

Parcel boundary geometry, satellite search history, and field observations are restricted to the parcel's submitting member and active stewards. Boundary submission records a consent reference and whether external catalogue searches are permitted. The search action separately confirms sending the bounding box and date window to Copernicus Data Space; member identities, land references, and consent documents are not sent. External providers can retain request metadata under their own policies. Revocation blocks future searches for that boundary version but does not erase prior provider requests or retained co-op history.

Downloaded imagery jobs contain private parcel geometry and selected scene identifiers. Share them only with authorized processors. Worker receipts retain source-file fingerprints, radiometric settings, canonical geometry, and measurements but omit local source-file paths. Only the parcel's submitting member and stewards can access jobs/results. Imported receipts are not automatically published or sent to a registry.

The optional boundary basemap contacts OpenFreeMap only after you choose **Load background map**. The provider receives your IP address and map tile requests that reveal the viewed area. Boundary overlays are drawn locally and are not uploaded to the map provider. Turning off the map stops future map requests; it does not erase previous requests. Device location is requested only when you select the map's location control. Basemap loading and satellite catalogue consent are separate choices. Unsaved drafts are kept in page memory, not browser storage; switching parcels, leaving Monitoring, or reloading loses them. GeoJSON downloads contain private coordinates and must be handled accordingly.

## Self-hosted accounts and recovery

The account page lets you export records available to you, revoke device or agent tokens, change your password, or permanently close your login. Closing an account revokes access and removes its authentication records; shared co-op history remains with the co-op. Transfer stewardship before closing an owner account. Recovery codes are shown once and rotated after use. Account actions retain an internal security event with user ID and timestamp, without passwords, recovery codes or tokens. Rate-limit keys are hashed and expire. Operators control backup retention and must process any shared-record deletion requests according to their applicable responsibilities.

## Optional project support

If enabled, the project-support page links to a verified Stripe-hosted payment page for voluntary contributions to Viridis LLC. Payment details are entered with Stripe, not stored in the shared co-op workspace. Stripe and the operator process the payment information under their respective responsibilities. Project support does not buy co-op membership privileges, land rights, carbon credits, priority access or a share of future payouts, and is separate from any co-op's own financial records.
