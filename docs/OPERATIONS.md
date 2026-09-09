# Operating Verge Common

## Start a real co-op workspace

1. Sign in and create a private workspace with a general region and purpose.
2. Set the profile public when the group consents to its introduction being visible. Website-level access still applies.
3. Copy the public profile link and share it yourself. A signed-in participant requests membership; the steward approves it.
4. Appoint a second trusted steward. The founding steward is the only person who can grant or remove steward roles.
5. Add projects. Publish only consented general descriptions; keep exact land references in private parcel records.
6. Assign actions and record observations/updates. A steward can hide inappropriate updates or remove member access.

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
3. Record an externally settled sale/transfer receipt in USD cents and units. Submitted records reserve internal quantity until reviewed or rejected.
4. Another steward reviews the settlement. The software has not queried a registry or bank; stewards must check those authoritative sources.
5. Choose an adopted charter to allocate the reviewed receipt. There is exactly one allocation per settlement.
6. A second steward approves the exact-cent allocation.
7. After payment occurs outside the platform, record each member's external payment reference with evidence. Another steward reviews the receipt. A reviewed payment record is not an API-verified bank reconciliation.
8. Record externally completed retirements and their evidence. Retirement quantities cannot exceed the recorded transferred quantity.

The app never sends payment instructions. Do not mark a scenario as settled cash or use a modeled value as evidence of external issuance.

## Data access and retention

- Anonymous discovery, when host access allows it: explicitly public profile/project/update information only.
- Active members: projects, tasks, governance and co-op financial records.
- Submitter/uploader and active stewards: private land, agreement and evidence records/files.
- Removed members: no private access. Existing records remain for governance/accounting continuity.
- Archive: no more mutations, profile disappears from discovery, retained member read/export access remains.

Hard deletion and statutory retention schedules are not automated. Resolve a real co-op's retention obligations before collecting regulated data. Database/R2 operators must establish backups, restoration and deletion procedures appropriate to their deployment; a JSON member export is not a complete file-store backup.

## Concurrency, retries and recovery

Each mutation checks the caller's workspace version. An atomic SQL update commits the entire aggregate and its linked audit event or rejects a stale version. The UI refreshes on a conflict. Request IDs and payload hashes recognize a retry without appending another mutation. Financial references and per-receipt allocation constraints add domain-level duplicate protection.

Uploads precede attachment to an evidence record. A successfully uploaded file that is never attached can remain orphaned in private storage; operators must reconcile orphaned assets before capacity limits are reached. Failed metadata inserts delete their uploaded bytes. No automatic garbage collection is enabled.

Production migration state may advance before a failed deployment finishes. Verify applied migrations before retrying. Keep the previous code version available for rollback; additive schema changes preserve the previous static pages.
