# Verge Common for iPhone and iPad

Native SwiftUI conservation client, targeting iOS 17+, with public community discovery, native account creation, sign-in and recovery, native member workspaces and a local field journal. Advanced governance, land mapping and financial workflows use the shared website. This is an unsigned development candidate, not a TestFlight or App Store release.

The [19 September Apple release review](../docs/APPLE_RELEASE.md) records the current submission blockers, prepared metadata and the distinction between a free TestFlight beta and a future paid App Store release. Local native checks currently stop at the unaccepted Xcode license; an installed Xcode version alone does not establish a usable build environment.

## Build

Open `VergeCommon.xcodeproj` in Xcode. Select the `VergeCommon` scheme and an iPhone or iPad simulator, then Run. No third-party iOS dependencies are required.

```sh
swift test --package-path ios
xcodebuild -project ios/VergeCommon.xcodeproj -scheme VergeCommon -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/verge-ios CODE_SIGNING_ALLOWED=NO build
```

For a physical device or archive, select your own developer team in Signing & Capabilities and confirm the bundle identifier. `org.vergecommon.app` is a proposed local identifier; it has not been registered or checked for availability. Do not commit account state, provisioning profiles, signing certificates or credentials.

## What works

- Native recent-co-op discovery, public project summaries, community updates and event summaries from the existing `/api/network` service. Item-specific report links open a draft to the operator with only public co-op/item identifiers; the user adds their concern and sends it. No report email is sent automatically.
- Hide a public co-op from Discover on this device and show it again through Hidden co-ops. These protected local preferences persist across launches and account changes; they do not block authors, leave memberships or hide public websites. Member blocking remains a separate co-op control.
- Native username/password sign-in, account creation and recovery use the canonical HTTPS `/auth/native/*` endpoints. Passwords and recovery codes stay only in memory for the request; the app never persists them. Creation and recovery show the new recovery code once and require explicit saved confirmation before installing the session. Browser cookies, URL caches and redirects are disabled.
- Device access uses an `app:write` token stored in Keychain `WhenUnlockedThisDeviceOnly`, excluded from journal backups. Advanced users can still paste an existing `app:read` or `app:write` token created on the website.
- Native authenticated co-op list and member detail, projects, updates, tasks, accessible parcels and observation review status, using the same membership rules as the website.
- Explicit member-only posting, preserving the command request ID on connection retries and requiring a fresh confirmation after a version conflict.
- Native reporting of member updates for steward review, and per-co-op member block/unblock controls, with explicit confirmation, preserved request IDs on retries and conflict refresh. Reports require an app token with participation access. Blocked or hidden updates stay out of the native member feed, including when a steward receives moderation records. Blocking does not conceal public pages or remove shared governance and land records.
- Native account deletion requires the current password and the exact confirmation `DELETE`, waits for explicit server deletion success and clears saved device access. Sole stewards must transfer a shared co-op first. The form explains retained numeric/governance records with identity fields removed and other members’ independent content. Local drafts and exported copies are separate, and the completion state explicitly says the local journal remains. Privacy, support and direct support-email links are available in the app.
- Explicit field draft submission to a selected accessible parcel with a reviewed current boundary. The date, method, finding and optional reference are uploaded for steward review. Local drafts remain intact. Repeating the exact same draft for the same parcel and boundary has a stable request ID across app restarts; editing a draft creates a distinct observation.
- Sign-out revokes the current device token on the server, then removes local access and private in-memory workspace state. An explicit offline Remove saved sign-in option clears the local credential while explaining that copies are not revoked. Session changes invalidate pending results, and private form callbacks cannot update a different signed-in account. Revoked, expired, insufficient-scope and pending-membership states explain how to recover.
- Pull-to-refresh, bounded responses, offline/error/access-restricted states, and browser handoff for joining, steward reviews and other advanced workflows.

- Native creation/editing of place, calendar date, method, findings and optional HTTPS reference.
- Atomic journal saves with complete file protection; invalid or unreadable journals are preserved and further writes are blocked.
- Up to 1,000 drafts / 10 MB of encoded journal data; no automatic deletion or sync.
- Native single-draft JSON export, full-journal backup/import, and confirmation before deleting one or all local drafts. Removing all drafts uses one atomic journal update; failures preserve the previous data.
- Backup imports add missing drafts, skip identical copies, and reject the entire import when an existing ID has conflicting edits.
- Reload control for retrying after transient file-access errors; corrupt files are never silently reset.
- Browser links to co-op discovery/workspace/account for advanced workflows; browser sign-in remains separate from native sign-in.
- Website Monitoring imports one version-1 draft, displays its place/date, then lets the member populate the existing observation form. Import does not submit, approve, attach evidence, assign a parcel, or authenticate a source. The member chooses the parcel and submits through normal access/review rules.

Drafts are held in app storage and may be included in device backups according to device settings. Exports leave that protected storage and follow the user's chosen destination. This version requests no location, camera, tracking or notification access and has no analytics SDK. Selected observations, member posts, safety reports and block choices leave the device only after explicit submission. Private workspace responses are kept in memory, with no URL cache or cookie store. There is no automatic journal upload or synchronization. This is not a complete App Store privacy disclosure: inventory the final website/auth services and native build before submission.

The native app points to `https://vergecommon.com`. Independent operators must change `CommunityService.origin` in `CommunityAPI.swift` to their own HTTPS deployment and test bearer authentication, scope enforcement and token revocation. The keychain account is bound to the origin, so a different deployment does not reuse the previous deployment's stored token.

## Before TestFlight

- Test create → save → relaunch → connect device → select co-op and parcel → submit → steward review on a physical device, including connection loss, concurrent edits, duplicate retry, registration/recovery-code acknowledgement, recovery, token revocation, sign-out/sign-in to another account, account deletion, separate local-journal deletion, interrupted journal writes and lock/unlock behavior. Test manual export and website import separately.
- Test VoiceOver, large text, iPad layouts and offline use.
- Confirm the intended team/bundle ID, configure signing, archive, and validate in Xcode.
- Verify the production backend, native account creation/recovery/deletion and API membership/scope enforcement with the exact native release build and intended tester accounts.
- Review moderation, account deletion, privacy/support URLs, authentication requirements, encryption/export questions, and App Review access for the final app scope against Apple's current guidance.
- Complete App Store Connect metadata and TestFlight distribution only after release authorization. Membership activation alone does not create an app record or upload a build.

Core tests validate schema, dates, text limits, exports, real disk save/edit/delete across repository reopens, backup restoration, repeated imports, conflict rollback, corrupt-file preservation, and simulated out-of-space failures. Compiling for a simulator or device does not prove a successful interactive device session.

Native discovery tests include a shared synthetic fixture checked against the backend public projection and an intercepted URLSession request. Native member-client tests cover canonical HTTPS bearer requests, list/detail envelopes, mutation request IDs and versions, response size/type checks, unauthorized/forbidden/conflict/pending states, header injection rejection, reviewed-boundary restrictions and deterministic field submission retries. Native account tests cover canonical JSON POSTs without browser cookies, username/display-name/password/recovery bounds, exact deletion confirmation, bearer validation, response bounds and rejection, expiry, required new recovery codes and explicit deletion success. Atomic bulk-journal deletion is tested across successful reopens and write failures. Public safety tests cover fixed-recipient report URL encoding, header-injection rejection, each public item kind, persistent discovery hiding/unhiding, duplicate handling and failure preservation. Safety regressions cover legacy responses without block fields, suppression of hidden/blocked steward records, membership-ID commands, self/pending-member rejection and report validation. No synthetic communities are seeded into the product. These tests do not establish physical-device or production end-to-end behavior. See [the shared-service decision](../docs/ARCHITECTURE.md).

## Local validation constraints

When Xcode presents a license prompt, the account holder must review and accept it themselves; no setup command here accepts Apple terms. Core source compilation can also use an already configured standalone Command Line Tools installation, but XCTest may be absent from that installation. XCTest and an unsigned simulator build need a usable Xcode installation; the macOS CI job runs both. Production distribution additionally needs an Apple Developer team, an approved bundle identifier, signing, an App Store Connect app record, release metadata and authorized TestFlight/App Store submission.
