# Privacy and visibility

The shared conservation system stores co-op records in the hosting service's D1 database and files in private R2 storage. It uses the authenticated Site user ID for access control. Members choose their display names; the application does not persist their sign-in email addresses.

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
