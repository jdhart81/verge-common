# Verge Common for iPhone and iPad

Native SwiftUI field-journal companion, targeting iOS 17+. The hosted co-op network remains a web application. This is an unsigned development candidate, not a TestFlight or App Store release.

## Build

Open `VergeCommon.xcodeproj` in Xcode. Select the `VergeCommon` scheme and an iPhone or iPad simulator, then Run. No third-party iOS dependencies are required.

```sh
swift test --package-path ios
xcodebuild -project ios/VergeCommon.xcodeproj -scheme VergeCommon -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/verge-ios CODE_SIGNING_ALLOWED=NO build
```

For a physical device or archive, select your own developer team in Signing & Capabilities and confirm the bundle identifier. `org.vergecommon.app` is a proposed local identifier; it has not been registered or checked for availability. Do not commit account state, provisioning profiles, signing certificates or credentials.

## What works

- Native creation/editing of place, calendar date, method, findings and optional HTTPS reference.
- Atomic journal saves with complete file protection; invalid or unreadable journals are preserved and further writes are blocked.
- Up to 1,000 drafts / 10 MB of encoded journal data; no automatic deletion or sync.
- Native JSON file export and confirmation before deleting local drafts.
- Browser links to co-op discovery/workspace. No cookies, passwords or tokens are copied into the native app.
- Website Monitoring imports one version-1 draft, displays its place/date, then lets the member populate the existing observation form. Import does not submit, approve, attach evidence, assign a parcel, or authenticate a source. The member chooses the parcel and submits through normal access/review rules.

Drafts are held in app storage and may be included in device backups according to device settings. Exports leave that protected storage and follow the user's chosen destination. This version requests no location, camera, tracking or notification access and has no analytics SDK. This is not a complete App Store privacy disclosure: inventory the final website/auth services and native build before submission.

The native app currently points to the private Sites pilot. Independent operators must change the two explicit community URLs in `VergeCommonApp.swift` to their own HTTPS deployment and test that deployment's identity flow.

## Before TestFlight

- Test actual create → save → relaunch → edit → export → website import → steward review on a physical device, including interrupted writes and lock/unlock behavior.
- Test VoiceOver, large text, iPad layouts and offline use.
- Confirm the intended team/bundle ID, configure signing, archive, and validate in Xcode.
- Make the backend accessible to the intended testers with approved access; no host-audience change is included here.
- Review moderation, account deletion, privacy/support URLs, authentication requirements, encryption/export questions, and App Review access for the final app scope against Apple's current guidance.
- Complete App Store Connect metadata and TestFlight distribution only after release authorization. Membership activation alone does not create an app record or upload a build.

Core tests validate schema, dates, text limits, exports and corrupt journal rejection. Compiling for a simulator or device does not prove a successful interactive device session.
