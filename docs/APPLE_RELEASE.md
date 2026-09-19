# Apple release review — 19 September 2026

**Status: native development candidate; not uploaded, submitted, or approved.** The website's public beta and an Apple distribution release are separate milestones. Viridis LLC is the project operator identified by the owner; the Apple Developer organization's enrollment, seller identity and agreements have not been verified.

## Current candidate and evidence

| Item | Observed state |
| --- | --- |
| Xcode project / scheme | `ios/VergeCommon.xcodeproj` / `VergeCommon` |
| Proposed bundle identifier | `org.vergecommon.app`; registration and availability unverified |
| Version / build | `0.8.0` / `1` |
| Platforms | iPhone and iPad; iOS 17 or later |
| Backend | `https://vergecommon.com` |
| Native features | Native registration/sign-in/recovery, one-time recovery-code acknowledgement, account deletion, public co-op discovery and item reporting, device-only co-op hiding, member workspaces/posts/reports/blocking, explicit field submission, offline journal and separate local-draft deletion/export |
| Website handoffs | Membership, mapping, governance, steward moderation and financial recordkeeping |
| App icon | Present, 1024 × 1024 PNG, no alpha channel |
| Local toolchain | Xcode 27.0, build 27A266a; selected at `/Applications/Xcode.app/Contents/Developer` |
| Local checks attempted | `swift test --package-path ios` and unsigned simulator build both exit 69: Xcode license agreement is not accepted |
| Local signing | `security find-identity -v -p codesigning` reports zero valid identities; project has no development team |
| App Store Connect access | Browser reaches Apple sign-in; no authenticated team/app access verified |
| Distribution proof | No signed archive, App Store Connect app record, upload receipt, approved TestFlight build or App Store listing verified in this review |

The previous deployed revision passed 28 Swift tests and an unsigned simulator build. The updated candidate adds 16 core tests for native account requests, disclosure, local journal deletion and public safety controls; record its fresh CI result in the current beta deployment receipt. Local core compilation and focused smoke checks passed using Command Line Tools. The license must be reviewed and accepted by the account holder; automation has not accepted Apple terms.

## Implemented account and safety changes

- Native account forms send origin-bound JSON directly to the HTTPS gateway and receive a scoped, expiring Keychain token. They do not require a browser token-paste flow. Recovery codes are acknowledged once and kept only in memory; passwords are never persisted. Sign-out revokes the device token on the server.
- Password-confirmed deletion removes authored personal records and credentials atomically, drains private file cleanup, and records a minimal durable deletion ledger for older-backup replay. Shared governance/numeric structures retain identity fields removed, and other members' independent content is separate. Failed cleanup is visibly incomplete; native completion requires explicit server confirmation. Local journal deletion is a separate confirmed control. See [privacy](../PRIVACY.md) and [Apple's deletion requirements](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
- Member reports and blocks use the shared co-op service. Native public item reports open a user-controlled email draft with only public identifiers; nothing is sent automatically. Device-only hiding of a public co-op has an undo list and is clearly distinguished from member blocking. The approved private contact is **justin@viridisconservation.com**.
- A narrow shared text filter rejects matched direct threats, personal abuse and explicit sexual promotion before social/profile text is saved. It preserves legitimate ecology terms and permits incident quotations in report reasons. Legacy matching public content is screened from discovery. This English-language baseline is not comprehensive moderation, a staffed response service or proof of Apple compliance.

## Remaining release blockers

1. **Build and signing.** Resolve the local license prompt, confirm Viridis LLC's Apple Developer team, register the identifier, configure signing, build a release archive and validate it. Enrollment, certificate and provisioning changes must use the owner's authorized account. Do not commit certificates, credentials or profiles.
2. **Device acceptance.** Run the exact release build on physical iPhone and iPad hardware, including VoiceOver, larger text, offline journaling, locked storage, app relaunch, failed/repeated submission, concurrent edits, recovery acknowledgement, token expiry/revocation, account switching and deletion. Capture actual screenshots with synthetic records.
3. **Moderation operation.** Exercise public reports, private reports and blocks with the final native build and establish a timely human response process, including escalation when the founding steward is the subject of a report. Public co-op hiding does not establish a global author block. Qualify the full scope against [App Review Guidelines 1.2 and 1.5](https://developer.apple.com/app-store/review/guidelines/); a keyword filter alone is not a release guarantee.
4. **Submission declarations and review access.** Confirm reachable privacy/support destinations, the enrolled seller, age-rating answers, required-reason API/privacy manifest review, export compliance, content rights and territorial availability. Prepare a dedicated synthetic review account with appropriate sample records; never publish its password/token. Declare actual collection by both the app and its service. See [Apple's privacy details guidance](https://developer.apple.com/app-store/app-privacy-details/).
5. **Upload and review.** Obtain a signed archive, upload it, verify processing and submit for TestFlight beta review. No build has yet been uploaded or submitted by this work.

## Public beta and paid app decision

Use TestFlight for the native beta. Apple does not allow selling TestFlight access or giving access as a crowdfunding reward. External beta review remains required where applicable; calling a build a beta does not bypass the review requirements. See [App Review Guidelines 2.2](https://developer.apple.com/app-store/review/guidelines/).

A completed App Store app can have an upfront download price configured in App Store Connect. That purchase is processed by Apple; a Stripe account does not configure App Store pricing. Confirm the desired price and storefronts before changing them. The Account Holder must have accepted the Paid Apps Agreement, with the business's tax and banking setup complete. See [Apple's pricing instructions](https://developer.apple.com/help/app-store-connect/manage-app-pricing/set-a-price/) and [agreement instructions](https://developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements/).

There is no StoreKit purchase, subscription or entitlement implementation in this candidate. If paid digital features are added, scope and test purchases, restoration, refunds and access separately. Rules for outside purchase links vary by storefront; do not add an unrestricted native Stripe checkout as a substitute. Review [App Review Guidelines 3.1](https://developer.apple.com/app-store/review/guidelines/) for the chosen distribution model.

Voluntary website support for Viridis LLC must state its recipient and purpose accurately. It must not imply charitable tax deductibility, Apple beta access, carbon-credit ownership, a financial return or a guaranteed future feature. Native fundraising is a separate review question; no fundraising button is added to the native app in this candidate.

## Prepared metadata (review before entry)

| Field | Draft |
| --- | --- |
| Name | VergeCommon |
| Subtitle | Care for land together |
| Suggested category | Social Networking; confirm final classification in App Store Connect |
| Marketing URL | `https://vergecommon.com/` |
| Support URL | `https://vergecommon.com/support/`; verify deployed content and reachable operator contact before submission |
| Privacy URL | `https://vergecommon.com/privacy/`; verify deployed policy matches the submitted app and services |
| Seller | Confirm the enrolled Apple entity; owner identifies project as operated by Viridis LLC |
| Age rating | Complete Apple's current questionnaire for the actual social and user-content features; do not guess |
| Price / availability | Not selected or changed in this review |

Draft description:

> Work with your neighbors to care for the places you share. VergeCommon connects a local field journal with community conservation workspaces.
>
> Discover public conservation co-ops, follow their projects and events, and connect to your member workspaces. Write field notes offline, keep a private journal backup, and choose when to submit an observation for steward review. Share updates with co-op members and follow the review status of your records.
>
> The shared website provides membership, land mapping, governance and detailed project tools. VergeCommon helps communities organize evidence and decisions; it does not certify carbon credits or guarantee conservation funding or payouts.

Verify these descriptions against the signed release build before submission. Screenshots must show implemented native screens using synthetic data. Never use website mockups as evidence of native features.

## Handoff once blockers are resolved

1. Run core tests, a simulator build and the device acceptance checklist against a recorded commit.
2. Archive and validate the signed release with the confirmed team and identifier. Record commit, version/build, archive checksum and validation result.
3. Complete the App Store Connect record, declarations, private review credentials, support contact and screenshots.
4. Upload the build, verify processing, and submit the beta for TestFlight review. Record the actual upload/build identifier and review status.
5. Use tester feedback to qualify a finished App Store release. Apply an approved price and release configuration only for that finished release; retain a record of Apple's review decision.

An unsigned CI build, a working website, or an installed Xcode version is not an Apple release receipt.
