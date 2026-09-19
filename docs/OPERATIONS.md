# Operating Verge Common

These instructions describe the [verified launch build](LAUNCH_BUILD_2026-09-19.md). Confirm its deployment receipt before relying on newly added controls in production.

## Start a real co-op workspace

1. Sign in and create a private workspace with a general region and purpose.
2. Set the profile public when the group consents to its introduction being visible. Private record access remains limited by membership and record-specific permissions.
3. Copy a public profile link or create a private single-use invitation and share it yourself. The web application keeps an invitation through registration, sign-in or recovery in the same tab; save the new account recovery code before continuing. The steward still approves membership. If browser session storage is unavailable, reopen the original link after authentication.
4. Appoint a second trusted steward. The founding steward is the only person who can grant or remove steward roles.
5. Add projects. Publish only consented general descriptions; keep exact land references in private parcel records.
6. Assign actions and record observations/updates. The pending-work summary links to visible membership requests, reviews, safety reports and eligible votes; it sends no messages. A steward can hide inappropriate updates or remove member access. Operator escalation is separate below.
7. Use the setup checklist as recorded progress: its circle step requires two active stewards, and the pathway step requires the latest reviewed assessment to match current land records. These checks do not certify eligibility.

Software membership is not legal cooperative membership. Establish the appropriate external structure and legal authority before relying on financial or conservation obligations.

## Conservation record flow

- A member submits a private parcel reference, area, and landowner-consent reference.
- A different steward reviews the parcel record.
- Members submit enrollment/easement and carbon-rights agreements. Another steward records review, then execution/recording references from the actual instruments. Executed references are frozen; amendments need new submissions.
- Members upload supporting files or provide HTTPS evidence references. Uploaded bytes have a SHA-256 digest; external links can change and are not immutable files.
- Another steward reviews evidence. A reviewed record is an application-level review decision, not independent program approval.
- The legal entity/authority record needs reviewed supporting evidence and another steward's review.

An issued holding record is blocked until the co-op authority, parcel, participation agreement, carbon-rights instrument, and project evidence have the required recorded states.

## Cooperative governance

A steward proposes a charter with budgets and an explicit member-share schedule. Shares must total 100%. The electorate is frozen at proposal creation. Each active eligible member may vote or revise their vote until closing. Adoption requires at least two-thirds participation and more than half the full electorate voting approve. Close after the deadline or when every eligible member has voted. An adopted version is frozen.

This is a software policy record; applicable legal governance requirements must also be satisfied. Removed members cannot use the app to vote, even if they appear in a proposal's frozen electorate.

## Holdings and external proceeds

1. Record a real serialized holding supported by reviewed evidence. Only whole one-tonne units are supported. Prefix and numeric range must identify the complete registry serial namespace.
2. A second steward reviews the record. Overlapping serial ranges within the co-op are rejected.
3. Record an externally settled sale/transfer receipt in the co-op's accounting currency minor units and whole credit units. Submitted records reserve internal quantity until reviewed or rejected.
4. Another steward reviews the settlement. The software has not queried a registry or bank; stewards must check those authoritative sources.
5. Choose an adopted charter to allocate the reviewed receipt. There is exactly one allocation per settlement.
6. A second steward approves the exact-cent allocation.
7. After payment occurs outside the platform, record each member's external payment reference with evidence. Another steward reviews the receipt. A reviewed payment record is not an API-verified bank reconciliation.
8. Record externally completed retirements and their evidence. Retirement quantities cannot exceed the recorded transferred quantity.

The app never sends payment instructions. Do not mark a scenario as settled cash or use a modeled value as evidence of external issuance.

## Data access and retention

- Anonymous discovery: explicitly public profile/project/update information only.
- Active members: projects, tasks, governance and co-op financial records.
- Submitter/uploader and active stewards: private land, agreement and evidence records/files.
- Removed members: no private access. Existing records remain for governance/accounting continuity.
- Archive: no more mutations, profile disappears from discovery, retained member read/export access remains.

Password-confirmed account deletion removes attributable personal records and credentials, with durable private-file cleanup and a committed deletion ledger for backup replay. Shared de-identified governance/numeric structures and others' independent content can remain; see [privacy](../PRIVACY.md). Backup expiry and statutory retention schedules are not automatically chosen. Operators must establish retention and recovery procedures; a member JSON export is not a complete file-store backup.

## Concurrency, retries and recovery

Each mutation checks the caller's workspace version. An atomic SQL update commits the entire aggregate and its linked audit event or rejects a stale version. The UI refreshes on a conflict. Request IDs and payload hashes recognize a retry without appending another mutation. Financial references and per-receipt allocation constraints add domain-level duplicate protection.

Uploads precede attachment to an evidence record. The application supports cancel/discard, replacement and retry. Unattached files older than 24 hours are cleaned at startup, hourly maintenance and during subsequent uploads; this is not a promise of deletion at the exact expiry instant. Attached assets are protected by a same-statement attachment/existence guard. A durable object-deletion queue retries failures without losing cleanup intent. File quota and active-membership checks occur atomically at metadata insertion. The additive `0001_evidence_upload_lifecycle.sql` migration preserves existing evidence.

Event organizers and stewards can edit upcoming visible events or cancel an event. Public edits require a steward. Edits preserve RSVPs and cannot reduce a positive capacity below current active Going responses. Tell attendees about schedule/location changes: the app does not send email or push notifications. Calendar exports keep a stable UID and advance SEQUENCE, but participants must download and import the updated file; calendar-client import behavior varies.

Production migration state may advance before a failed deployment finishes. Verify applied migrations before retrying. Keep the previous code version available for rollback; additive schema changes preserve the previous static pages.

## Operator safety queue

People can submit a private concern from `/report/`, including complaints about the sole founding steward. The native candidate submits directly and saves a private receipt before sending. The receipt's status endpoint returns only report ID, general status and update time; it cannot retrieve complaint text or operator notes. Anonymous reports need no account. A private target must be accessible to an authenticated member; a general report can describe inaccessible concerns without probing private records. Signed-in submissions appear only in that account's export and are removed on account deletion. The native report client is anonymous; deleting a native account does not identify or withdraw those reports.

The report queue and decisions are host-operator functions. Connect through the existing authorized SSH account and run the CLI in the application's configured environment, against the intended database (`VERGE_DATA_DIR`, `/data` in the app container). Do not run an unconfigured CLI on an empty local data directory and interpret it as the production queue. There is no HTTP operator-admin endpoint, and app/MCP tokens never authorize operator decisions.

```sh
node self-hosted/safety-cli.mjs summary
node self-hosted/safety-cli.mjs list
node self-hosted/safety-cli.mjs list /private/path/cursor.json
node self-hosted/safety-cli.mjs show REPORT_ID
node self-hosted/safety-cli.mjs resolve /private/path/decision.json
node self-hosted/safety-cli.mjs release /private/path/release.json
```

`list` defaults to open reports and returns `{reports,next}` without complaint reasons or receipt hashes. To continue, place the returned `next` object unchanged into a private cursor JSON file. Pagination uses creation time plus ID, so matching timestamps do not skip reports. A cursor can specify `status: "all"` for resolved history and `limit` from 1 to 200. `show REPORT_ID` reveals its private description; handle that output as sensitive and do not paste it into public issues.

A decision file contains `id`, `action`, `operator` and `note`. Actions are `review` (mark reviewing), `hide` (hide an update, comment or event), `restrict` (remove the co-op from public discovery) or `dismiss` (close without a content action). Co-op/project concerns use restriction rather than hiding a project. Record the actual operator and a concrete rationale; the operator must assess the report before choosing an action. Keep private descriptions and credentials out of shell history and public logs.

A release file contains `coopId`, `operator` and `note`. Lifting an operator restriction preserves private visibility; only the steward chooses whether to republish afterward. Steward edits cannot override an active restriction. Decisions update the workspace/report and separate action log atomically, including the workspace version so stale participant writes cannot overwrite them. Completed reports cannot be resolved again.

Test submission, receipt lookup, independent decision and resulting visibility with synthetic records before broad launch. Establish human coverage and response expectations, and verify alerts through the operational setup in [OPERATIONS_BETA.md](OPERATIONS_BETA.md). A received report is not a completed review, a guaranteed response time, or evidence of a staffed service.
