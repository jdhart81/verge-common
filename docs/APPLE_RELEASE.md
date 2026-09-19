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
| Native features | Public co-op discovery, personal device-token access, member workspaces/posts, member-update reports, per-co-op blocking, explicit field-observation submission, offline journal and JSON backup/export |
| Website handoffs | Membership, mapping, governance, moderation, account management and financial recordkeeping |
| App icon | Present, 1024 × 1024 PNG, no alpha channel |
| Local toolchain | Xcode 27.0, build 27A266a; selected at `/Applications/Xcode.app/Contents/Developer` |
| Local checks attempted | `swift test --package-path ios` and unsigned simulator build both exit 69: Xcode license agreement is not accepted |
| Local signing | `security find-identity -v -p codesigning` reports zero valid identities; project has no development team |
| App Store Connect access | Browser reaches Apple sign-in; no authenticated team/app access verified |
| Distribution proof | No signed archive, App Store Connect app record, upload receipt, approved TestFlight build or App Store listing verified in this review |

Fresh [macOS CI for revision c7cc5d4](https://github.com/jdhart81/verge-common/actions/runs/35458553516) passed all 28 core tests and an unsigned iPhone/iPad simulator build, including these safety controls and corrected co-op browser links. That result does not establish local device behavior, signing or distribution. The license must be reviewed and accepted by the account holder; automation has not accepted Apple terms.

## Release blockers

1. **Native sign-in experience.** The current flow opens a browser, creates a device token, then asks the person to paste it into the app. Preserve tokens for advanced clients, but implement and test a normal native or secure in-app sign-in flow before general distribution. Apple's account-deletion FAQ also calls default-browser sign-in/registration inappropriate UX. See [Apple's account-deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
2. **Deletion of associated records.** Closing a login revokes access and deletes authentication records, but shared co-op content remains. This is not yet an account-and-associated-data deletion process. Implement deletion or appropriate anonymization, specify any legally required retention and backup treatment, and verify completion from the native entry point. A closure link alone does not resolve this blocker. See [Apple's deletion requirements](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
3. **User-generated content safeguards.** The native candidate now offers member-update reporting and confirmed per-co-op block/unblock controls. The shared service enforces blocks for private social content; native feeds also suppress flagged steward records. The public discovery feed remains viewable without an account, and its reporting path opens website support. Public-content filtering, an effective confidential escalation channel, operator response and all public/private paths still need qualification against the final Apple release scope. Per-co-op blocks alone do not establish complete App Store compliance. See [App Review Guidelines 1.2 and 1.5](https://developer.apple.com/app-store/review/guidelines/).
4. **Build and signing.** Resolve the local license prompt, confirm Viridis LLC's Apple Developer team, register the identifier, configure signing, build a release archive and validate it. Enrollment, certificate and provisioning changes must use the owner's authorized account. Do not commit certificates, credentials or profiles.
5. **Device acceptance.** Run the exact release build on physical iPhone and iPad hardware, including VoiceOver, larger text, offline journaling, locked storage, app relaunch, failed/repeated submission, concurrent edits, token expiry/revocation and account switching. Capture actual screenshots with synthetic records.
6. **Submission declarations and review access.** Confirm the privacy/support destinations and reachable contact, age-rating answers, required-reason API/privacy manifest review, export compliance, content rights and territorial availability. Prepare a dedicated synthetic review account with the permissions and sample records needed to exercise the native app; never publish its password/token. Declare actual collection by the app and connected service, not only local journal behavior. See [Apple's privacy details guidance](https://developer.apple.com/app-store/app-privacy-details/).

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

Do not submit this draft until the sign-in and deletion descriptions accurately reflect the release build. Screenshots must show implemented native screens using synthetic data. Never use website mockups as evidence of native features.

## Handoff once blockers are resolved

1. Run core tests, a simulator build and the device acceptance checklist against a recorded commit.
2. Archive and validate the signed release with the confirmed team and identifier. Record commit, version/build, archive checksum and validation result.
3. Complete the App Store Connect record, declarations, private review credentials, support contact and screenshots.
4. Upload the build, verify processing, and submit the beta for TestFlight review. Record the actual upload/build identifier and review status.
5. Use tester feedback to qualify a finished App Store release. Apply an approved price and release configuration only for that finished release; retain a record of Apple's review decision.

An unsigned CI build, a working website, or an installed Xcode version is not an Apple release receipt.
