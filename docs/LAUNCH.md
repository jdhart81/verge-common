# VergeCommon launch kit

## Positioning

**What if conservation could be an open-source project? Enter VergeCommon.**

Open tools for people caring for the places they share. Organize conservation projects, document field work, and make decisions together.

Launch this as an **early cooperative pilot**. The shared website is live at [vergecommon.com](https://vergecommon.com), with browser accounts, private co-ops and scoped agent access. Invite a consenting community to try a bounded workflow and contribute one useful improvement. The initial success milestone is one independent community completing a useful activity and returning for a second one. Stars, impressions, downloads, and test results do not establish adoption or ecological impact.

## Announcement draft — not posted

What if conservation could be an open-source project?

Enter VergeCommon: open tools for people caring for the places they share.

VergeCommon is a shared workspace for conservation projects: community activities, private field records, project mapping, land-pooling preparation and cooperative decisions. Communities can inspect the code, adapt the workflows, and contribute improvements back.

This is an early cooperative pilot. We’re inviting conservation practitioners, community organizers, designers, researchers, and developers to help shape it. You don’t need to write code: try a workflow, tell us what is missing, or improve a guide.

The code is AGPL-3.0-only. Private land and participant records are not public data. The software does not certify environmental outcomes, issue carbon credits, or send payments.

Try the website:
https://vergecommon.com

Inspect the pilot source and review:
https://github.com/jdhart81/verge-common/pull/2

Our first milestone is simple: help one community do useful conservation work, then come back and do it again.

## Repository description draft

Open-source tools for community conservation: organize projects, document field work, and make decisions together.

Suggested topics: `conservation`, `open-source`, `community`, `cooperatives`, `stewardship`, `geospatial`.

## Pilot release checklist

- [x] Mission-led README and homepage with a concrete contributor invitation.
- [x] Existing AGPL-3.0-only license and third-party notices linked.
- [x] Contribution guidance, bounded starting tasks, conduct policy, and contribution issue form.
- [x] Document local setup and the production authentication boundary.
- [x] Push the full implementation candidate (`2b73c2d`) on `build/coop-launch-readiness`; [PR #2](https://github.com/jdhart81/verge-common/pull/2) remains under review.
- [x] Complete local validation and [GitHub web, imagery and iOS checks](https://github.com/jdhart81/verge-common/actions/runs/35454137711). See [feature acceptance](FEATURE_ACCEPTANCE.md) for scope.
- [x] Deploy the shared application and pass the live HTTPS three-account acceptance checks. See the [deployment receipt](DEPLOYMENT_2026-09-19.md).
- [ ] Complete final source review and obtain approval before merging the launch branch into `main`.
- [ ] Check contributor links, issue forms and license rendering on the final merged revision.
- [x] Enable and verify GitHub private vulnerability reporting; link its destination in SECURITY.md.
- [ ] Establish a dedicated confidential conduct contact before broad community recruitment; the current policy documents the interim contact-request route.
- [ ] Approve the announcement text and destination before posting it. No announcement has been sent by this preparation.

The draft is not posted. GitHub is public and private vulnerability reporting is enabled. The live shared website was checked using synthetic accounts on September 19, 2026; co-op record access still requires membership approval. The deployed pilot source is on the launch branch while PR #2 is under review. Neither deployment nor its acceptance tests establish real community adoption, nonprofit affiliation or carbon payouts.

## Remaining pilot gates

The live acceptance runner verified three independent accounts, membership approval, private files, request retries/conflicts, scoped native tokens and actual MCP reads/writes. The operator guide includes moderation, incident response, account closure and abuse controls. Daily local backups are active. Staging and production snapshots passed isolated database/file restore checks, and an initial matching production archive was copied offhost. The [deployment receipt](DEPLOYMENT_2026-09-19.md) records the recovery results.

These requirements remain separate from deployment:

- Independently review authentication, membership, private files and authorization.
- Configure recurring encrypted offsite backups and recovery-key custody; a local schedule or one copied archive is insufficient for continuing offsite recovery.
- Assign real pilot stewards and an incident/conduct contact; rehearse the documented procedures with them.
- Complete [pilot acceptance](PILOT.md), including mobile and accessibility checks with real participants.
- Test the native app on physical devices, configure Apple signing and authorize TestFlight/App Store distribution. The unsigned simulator build and native tests pass in CI; no distributed mobile release is claimed.
- Confirm nonprofit participation, local consent, land rights and the suitability of the selected legal/ecological methodology with qualified reviewers.

Authenticated native participation is implemented in source against the live service. Ecological certification, registry issuance/transfers, sales and payment execution remain external actions. See [architecture](ARCHITECTURE.md), [security](../SECURITY.md), and [roadmap](../ROADMAP.md).

## Launch-day sequence

1. Review the release candidate, validation receipt, and unresolved gates.
2. Complete source review and any approved merge; verify the final revision, deployed image, CI and contributor links.
3. Publish an approved pilot announcement to an approved destination.
4. Triage newcomer reports into bounded tasks and acknowledge actual contributions.
5. Record whether a consenting independent community completed a useful workflow and returned. Close the relevant participant, recovery and external-review gates before expanding the pilot.
