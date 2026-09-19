# Verge Common for iPhone and iPad

Native SwiftUI conservation client, targeting iOS 17+, with public community discovery, personal-device authentication, native member workspaces and a local field journal. Advanced governance, land mapping and financial workflows use the shared website. This is an unsigned development candidate, not a TestFlight or App Store release.

The [19 September Apple release review](../docs/APPLE_RELEASE.md) records the current submission blockers, prepared metadata and the distinction between a free TestFlight beta and a future paid App Store release. Local native checks currently stop at the unaccepted Xcode license; an installed Xcode version alone does not establish a usable build environment.

## Build

Open `VergeCommon.xcodeproj` in Xcode. Select the `VergeCommon` scheme and an iPhone or iPad simulator, then Run. No third-party iOS dependencies are required.

```sh
swift test --package-path ios
xcodebuild -project ios/VergeCommon.xcodeproj -scheme VergeCommon -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/verge-ios CODE_SIGNING_ALLOWED=NO build
```

For a physical device or archive, select your own developer team in Signing & Capabilities and confirm the bundle identifier. `org.vergecommon.app` is a proposed local identifier; it has not been registered or checked for availability. Do not commit account state, provisioning profiles, signing certificates or credentials.

## What works

- Native recent-co-op discovery, public project summaries, community updates and event summaries from the existing `/api/network` service.
- Personal device tokens created at `https://vergecommon.com/account`, with `app:read` or `app:write` access. Tokens are stored using Keychain `WhenUnlockedThisDeviceOnly`, excluded from journal backups and never sent to redirects. No passwords are captured by the app.
- Native authenticated co-op list and member detail, projects, updates, tasks, accessible parcels and observation review status, using the same membership rules as the website.
- Explicit member-only posting, preserving the command request ID on connection retries and requiring a fresh confirmation after a version conflict.
- Native reporting of member updates for steward review, and per-co-op member block/unblock controls, with explicit confirmation, preserved request IDs on retries and conflict refresh. Reports require an app token with participation access. Blocked or hidden updates stay out of the native member feed, including when a steward receives moderation records. Blocking does not conceal public pages or remove shared governance and land records.
- Privacy, support and account-management links are available in the app. The account closure link and explanation distinguish closing the website login from erasing associated data; full data erasure remains a release blocker.
- Explicit field draft submission to a selected accessible parcel with a reviewed current boundary. The date, method, finding and optional reference are uploaded for steward review. Local drafts remain intact. Repeating the exact same draft for the same parcel and boundary has a stable request ID across app restarts; editing a draft creates a distinct observation.
- Disconnect removes the local keychain credential and private in-memory workspace state. It does not revoke other copies; the account page supplies server-side revocation. Revoked, expired, insufficient-scope and pending-membership states explain how to recover.
- Pull-to-refresh, bounded responses, offline/error/access-restricted states, and browser handoff for joining, steward reviews and other advanced workflows.

- Native creation/editing of place, calendar date, method, findings and optional HTTPS reference.
- Atomic journal saves with complete file protection; invalid or unreadable journals are preserved and further writes are blocked.
- Up to 1,000 drafts / 10 MB of encoded journal data; no automatic deletion or sync.
- Native single-draft JSON export, full-journal backup/import, and confirmation before deleting local drafts.
- Backup imports add missing drafts, skip identical copies, and reject the entire import when an existing ID has conflicting edits.
- Reload control for retrying after transient file-access errors; corrupt files are never silently reset.
- Browser links to co-op discovery/workspace/account. Authentication uses an explicitly pasted personal device token; browser cookies and passwords are never copied into the app.
- Website Monitoring imports one version-1 draft, displays its place/date, then lets the member populate the existing observation form. Import does not submit, approve, attach evidence, assign a parcel, or authenticate a source. The member chooses the parcel and submits through normal access/review rules.

Drafts are held in app storage and may be included in device backups according to device settings. Exports leave that protected storage and follow the user's chosen destination. This version requests no location, camera, tracking or notification access and has no analytics SDK. Selected observations, member posts, safety reports and block choices leave the device only after explicit submission. Private workspace responses are kept in memory, with no URL cache or cookie store. There is no automatic journal upload or synchronization. This is not a complete App Store privacy disclosure: inventory the final website/auth services and native build before submission.

The native app points to `https://vergecommon.com`. Independent operators must change `CommunityService.origin` in `CommunityAPI.swift` to their own HTTPS deployment and test bearer authentication, scope enforcement and token revocation. The keychain account is bound to the origin, so a different deployment does not reuse the previous deployment's stored token.

## Before TestFlight

- Test create → save → relaunch → connect device → select co-op and parcel → submit → steward review on a physical device, including connection loss, concurrent edits, duplicate retry, token revocation, disconnect/reconnect to another account, interrupted journal writes and lock/unlock behavior. Test manual export and website import separately.
- Test VoiceOver, large text, iPad layouts and offline use.
- Confirm the intended team/bundle ID, configure signing, archive, and validate in Xcode.
- Verify the production backend, account token creation and API membership/scope enforcement with the exact native release build and intended tester accounts.
- Review moderation, account deletion, privacy/support URLs, authentication requirements, encryption/export questions, and App Review access for the final app scope against Apple's current guidance.
- Complete App Store Connect metadata and TestFlight distribution only after release authorization. Membership activation alone does not create an app record or upload a build.

Core tests validate schema, dates, text limits, exports, real disk save/edit/delete across repository reopens, backup restoration, repeated imports, conflict rollback, corrupt-file preservation, and simulated out-of-space failures. Compiling for a simulator or device does not prove a successful interactive device session.

Native discovery tests include a shared synthetic fixture checked against the backend public projection and an intercepted URLSession request. Native member-client tests cover canonical HTTPS bearer requests, list/detail envelopes, mutation request IDs and versions, response size/type checks, unauthorized/forbidden/conflict/pending states, header injection rejection, reviewed-boundary restrictions and deterministic field submission retries. Safety regressions cover legacy responses without block fields, suppression of hidden/blocked steward records, membership-ID commands, self/pending-member rejection and report validation. No synthetic communities are seeded into the product. These tests do not establish physical-device or production end-to-end behavior. See [the shared-service decision](../docs/ARCHITECTURE.md).

## Local validation constraints

When Xcode presents a license prompt, the account holder must review and accept it themselves; no setup command here accepts Apple terms. Core source compilation can also use an already configured standalone Command Line Tools installation, but XCTest may be absent from that installation. XCTest and an unsigned simulator build need a usable Xcode installation; the macOS CI job runs both. Production distribution additionally needs an Apple Developer team, an approved bundle identifier, signing, an App Store Connect app record, release metadata and authorized TestFlight/App Store submission.
