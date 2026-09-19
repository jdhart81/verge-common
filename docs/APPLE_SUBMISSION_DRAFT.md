# Apple submission draft

Prepared 19 September 2026 from source commit `5aa1a5f7b4b6a365898c26e2ffa6df510d8d6f7b`. This is a review packet, not a completed App Store Connect declaration, upload or approval. Live release evidence and remaining gates belong in [APPLE_RELEASE.md](APPLE_RELEASE.md).

The coordinator verified access to an **individual** App Store Connect account, with no VergeCommon app record and no matching proposed bundle identifier in the new-app selector. The owner identifies the project operator as **Viridis LLC**. Confirm the intended team and public seller identity before registering the app. Free Apps is active; Paid Apps is unaccepted, and EU trader status is incomplete.

## Listing fields

| Field | Draft value |
| --- | --- |
| App name | VergeCommon |
| Subtitle | Care for land together |
| Primary category | Social Networking, subject to owner confirmation |
| Secondary category | Lifestyle, if appropriate to the final listing |
| Language | English (U.S.) |
| Bundle identifier | `org.vergecommon.app`, proposed in source; availability/team registration unverified |
| Version / build | `0.8.0` / `1` |
| Compatibility | iPhone and iPad; iOS 17 or later |
| Marketing URL | `https://vergecommon.com/` |
| Support URL | `https://vergecommon.com/support/` |
| Privacy policy URL | `https://vergecommon.com/privacy/` |
| Support contact | `justin@viridisconservation.com`, approved project contact; verify receipt and response operation |
| Keywords | `conservation,community,land,cooperative,field journal,habitat,restoration,neighbors` |
| Promotional text | Work with neighbors to care for shared places. Keep field notes offline, follow co-op projects, and submit observations for steward review. |
| Copyright | Confirm the actual copyright holder and year before entry; project operation alone does not settle contributor ownership |
| Price / storefronts | Not selected in this draft. TestFlight access must be free; a finished paid release is a separate decision |

Description:

> Care for land together. VergeCommon connects a private field journal with community conservation workspaces.
>
> Discover public co-ops, projects and events. Create an account in the app to see your member workspaces, share updates, and submit selected field observations for steward review. Keep notes offline, export a journal backup, and choose when to share a draft.
>
> Report a member update or block a member within your co-op. You can also report public content to the project operator and hide a public co-op from Discover on your device.
>
> The shared website provides membership, parcel mapping, invitations, governance and detailed project tools. Joining a co-op requires steward approval. VergeCommon helps communities organize evidence and decisions; it does not certify carbon credits or guarantee conservation funding or payouts.

Do not add a price, TestFlight reward, unsupported superlative, verified conservation result or future feature to listing text. Use screenshots of the actual signed native build with synthetic records; include Discover, My co-ops, a member workspace and the local journal on the supported devices.

## Privacy inventory for the final questionnaire

This inventory covers the native client and the shared self-hosted service. It is not a final selection of Apple's data categories. Data leaving the app for an account feature still counts in the review even when entered voluntarily. Use [Apple's privacy definitions](https://developer.apple.com/app-store/app-privacy-details/) when completing the live questionnaire.

| Data and source | Where it goes / purpose | Draft disclosure considerations |
| --- | --- | --- |
| Username, display name and opaque account ID (`NativeAccountAPI.swift`, `self-hosted/auth.mjs`) | HTTPS account service; account access and member identity. Stored in the service database | Name and User ID; linked to the account; app functionality |
| Password and recovery-code input; hashed password/recovery records | Sent for the chosen authentication/deletion request; raw inputs are not persisted by the app. Service stores password/recovery hashes | Authentication/security inventory; do not describe the app as collecting no data. Review the appropriate category under the final form |
| Expiring bearer credential and token metadata (`WorkspaceAPI.swift`, `auth.mjs`) | Raw credential in device-only Keychain and HTTPS authorization; server stores a hash, label, scopes, expiry and account association | Account identifiers/access data; linked; app functionality. No advertising device identifier is used |
| Member updates; submitted observation date, method, finding, HTTPS reference and parcel ID (`WorkspaceCommand`) | Saved in the selected co-op under membership rules | Other User Content and associated identifiers; linked; app functionality. A submitted observation is associated with land |
| Safety report text, target identifiers and member block choices | Saved in the co-op; reports visible to reporter and stewards, personal block list to its owner | Other User Content / Customer Support where applicable; linked; safety and app functionality |
| Public report/support email, if the person sends it (`PublicSafety.swift`) | An external mail app opens a draft to the operator. Only public item IDs are prefilled; the person writes and sends the message | Operator may receive sender email, name and customer-support content. No automatic email transmission; verify retention and whether any Apple optional-disclosure exception actually applies |
| Security actions and timestamps; hashed short-lived request-rate keys (`auth.mjs`, `server.mjs`) | Authentication abuse prevention and security audit. Rate limiting derives a key from the network address | Review identifiers/usage-data or other-data classification and provider processing. No product analytics purpose is implemented |
| Private land records, general regions and optional coordinates in the shared service | Website users can submit parcel geography and records. Native observations reference those parcels; private API responses can include already stored records | Review Coarse/Precise Location and Other User Content against the final app/service scope. No native GPS request does **not** establish that no location-related data is collected |
| Network request metadata | Hosting/reverse-proxy infrastructure necessarily receives requests, including IP information | Confirm actual host/log/retention practices. Source alone cannot prove what providers retain |
| Minimal opaque deletion identifier and time | Private deletion ledger prevents older backups from resurrecting erased data | Account-linked deletion/security record; disclose retention purpose consistently with the policy |

Local-only records are distinct: journal drafts and the hidden-co-op display list stay in protected app storage until the person explicitly submits or exports content. They may be included in device backups according to device settings. Journal exports exclude the Keychain credential. Account deletion preserves the local journal; **Journal tools → Delete all local drafts** is a separate confirmed action. Exported copies and other people's independent content are not under the app's automatic control.

Source has no ad SDK, analytics SDK, tracking identifier, native camera/location/microphone access, push notification feature, contact-book access, StoreKit purchase or native payment-card entry. Do not select tracking or a payment-data category merely because the external website has an optional support page. Conversely, do not answer “Data Not Collected”: native accounts and shared contributions are transmitted and retained.

No `PrivacyInfo.xcprivacy` is present in this source tree. The focused scan found no explicit UserDefaults, file-timestamp, disk-space or system-uptime API use. This is not a signed-archive SDK audit: inspect the final privacy report and required-reason API usage before declaring the manifest requirements satisfied. TLS, Keychain, file protection and CryptoKit SHA-256 are present; confirm the final encryption/export-compliance answers against the submitted binary instead of guessing.

## Age-rating facts

Complete Apple's current questionnaire from these facts; no numeric age rating is selected here.

- **User-generated content and communication:** yes. Members publish text updates and field observations; public co-ops can publish project/update/event text. There is no native private direct-message or live-chat feature.
- **Moderation:** reports, per-co-op blocks, public email reports, device-only public co-op hiding and a narrow English text filter are implemented. A report does not automatically hide content; human response must be operational. Hiding a co-op is not global author blocking.
- **Parental controls / age assurance:** no parental-control or verified-age system found. Signup does not collect a date of birth. This candidate is not designed as a Kids Category app.
- **Web access:** fixed website/support/source links and references can open external applications. There is no general-purpose embedded browser. Review the exact question wording and final navigation behavior.
- **Designed content:** conservation and community planning. No built-in gambling, simulated gambling, loot boxes, contests, mature sexual material, medical treatment guidance or intentional violence/horror content found. User text still requires frequency/content answers based on actual moderation and use, not a blanket assumption of “None.”
- **Commercial features:** no native purchases, subscriptions or advertising. Website financial records and hypothetical planning do not issue credits, trade investments or execute payouts.

## Draft reviewer notes

> VergeCommon is a native SwiftUI conservation companion using the live HTTPS service at vergecommon.com. Discover and the local field journal can be used without an account. My co-ops supports native account creation, sign-in and recovery; recovery codes are shown once and must be acknowledged as saved. No email address or email verification is required.
>
> A dedicated synthetic review account and a populated co-op must be provided privately in App Store Connect before review. Its login, role and sample parcel must be confirmed with the submitted build. No real personal information or sensitive habitat coordinates should be used.
>
> In My co-ops, open the review co-op to view projects and member updates. Post an update or choose Submit a field journal draft. Submission requires a locally saved draft and an accessible parcel with a reviewed current boundary. It records an observation for steward review, not a verified conservation result. The local draft is preserved.
>
> Report update sends a private report to the co-op's stewards. Member safety offers confirmed block/unblock controls. Public item reports open a user-controlled email draft; the app sends nothing automatically. Hiding a public co-op only changes this device's Discover list.
>
> Account deletion is in My co-ops and requires the password plus DELETE. It erases authored personal content and credentials while preserving shared numeric/governance structures with attributable identity removed. A founder with other active members must transfer stewardship first. Local journal deletion is separately available in Journal tools. Review the linked privacy policy for backup and independent-copy handling.
>
> The website handles membership approvals, parcel mapping, governance and detailed project administration. There are no in-app purchases, native donation checkout, automatic journal synchronization, background location collection or carbon-credit issuance/payment execution in this build.

These notes are not ready to submit until the private review account and the exact navigation paths have been checked. Do not put review credentials, recovery codes, private access tokens or personal reviewer contact details into this repository.

## Qualification before upload

1. Resolve the intended seller/team, proposed bundle ID, signing setup and license prompt. Build and validate an archive from a recorded commit, then record version/build and archive checksum. Preserve the current CI evidence separately from device results.
2. On a physical iPhone and iPad, use a dedicated synthetic co-op with two accounts and a reviewed nonsensitive parcel. Verify registration, recovery-code acknowledgment, backgrounding during recovery, app relaunch, sign-out, failed sign-out/offline local removal, account switching, token revocation and recovery. Check the displayed account before each write.
3. Add/edit/save notes offline; relaunch; test locked storage and read failures; export/import a backup; delete one/all drafts with cancel and confirm. Confirm account deletion leaves drafts and the separate local-delete control removes them.
4. Submit the same observation through a simulated connection interruption and retry; verify only one server record. Repeat a member post with concurrent edits and confirm conflict recovery. Verify pending callbacks cannot write into another account's visible state.
5. Exercise reports, block/unblock, public hide/unhide and mail handoff with a test mailbox. Verify a human receives the report and can respond, including escalation when a steward is reported. Use controlled synthetic examples to exercise the filter; do not post abusive material into public discovery.
6. Delete the synthetic member account; verify revoked access, erased authored content and private files, preserved independent content and explicit incomplete-cleanup errors. Test founder-transfer prerequisites in the synthetic co-op. Rehearse deletion-ledger replay against an isolated restored backup, never the live database.
7. Check VoiceOver reading/focus order, largest practical Dynamic Type, landscape/iPad layouts, keyboard and touch targets, error messages and reduced-motion settings where relevant. Capture actual native screenshots with synthetic data.
8. Verify final policy/support links, mail availability fallback, privacy report, declarations and private review credentials. Upload only the signed qualified candidate; record Apple's processing and review status. Use TestFlight for the beta without charging for access.

References: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/), [app privacy](https://developer.apple.com/app-store/app-privacy-details/), [app pricing](https://developer.apple.com/help/app-store-connect/manage-app-pricing/set-a-price/).
