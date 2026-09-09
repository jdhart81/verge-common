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
