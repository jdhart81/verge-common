# Recovery, alert and second-operator rehearsal kit

3 October 2026. Use disposable synthetic fixtures and current supported source/build. These steps grant no access and authorize no production changes. Keep detailed receipts privately; record opaque references in [pilot readiness](PILOT_READINESS.md).

## Independent custody inventory (owner completes privately)

| Secret | Purpose | Owner/custodian role | Approved location reference | Verified date | Renewal/recovery |
| --- | --- | --- | --- | --- | --- |
| Backup recovery secret | Decrypt encrypted snapshot and deletion-ledger archives | UNASSIGNED | UNVERIFIED | UNVERIFIED | Retrieve independent copy, decrypt a synthetic drill; preserve versions while dependent archives exist; separately approve replacement |
| Apple signing private key | Renew Apple client secret; recover configured provider access | UNASSIGNED | UNVERIFIED | UNVERIFIED | Owner uses approved Apple renewal process before recorded expiry; validate offered sign-in/revocation after separately authorized changes |
| Server token-vault encryption key | Decrypt retained provider tokens for revocation/recovery | UNASSIGNED | UNVERIFIED | UNVERIFIED | Recover exact active version from independent custody; qualify restored synthetic state and revocation; separately approve rotation |

Privately fill purpose, accountable owner/custodian, opaque credential/version and approved custody-location reference, verification date, retrieval and renewal/recovery procedure. Never record key bytes, export commands containing credentials, recovery codes or provider tokens in source or readiness output. Verify independent access without sending keys to another operator in this assignment.

**Archives and ledger are a separate dependency.** Current dated receipts describe archives and the recovery key on the owner's Mac in separate directories. Losing both server and that Mac loses recovery unless independently accessible encrypted archives **and the latest committed deletion ledger** survive. A second key copy does not supply those bytes. Simultaneous-loss recoverability remains UNVERIFIED until the owner approves and qualifies an arrangement. No additional transfer, credential or host is provisioned here.

## Isolated restore drill

1. Record intended full release/image, configuration, snapshot creation time and current ledger observation/reference. Select a completed snapshot whose receipt, database hash and evidence checks passed. Retrieve the latest independently retained **committed** deletion ledger and its receipt/checksum from the approved source. Refuse missing, incomplete, unavailable, stale or pending ledgers. An old snapshot's ledger alone is insufficient. Recover a pending commit decision from the original database or hold; never infer it from an older restore.
2. Create a new restricted disposable directory on the recovery host (0700; plaintext files 0600). Confirm it is separate from all live paths and listeners. Use the approved decrypt procedure reading the key from its restricted custody file; never place it in command text or logs. Use existing safe `operations.py` extraction/rehearsal routines, which reject links/traversal/special files and refuse unsuccessful decryption. No extraction over live data.
3. Validate snapshot integrity **before** replay: `node self-hosted/restore-check.mjs /isolated/snapshot`. Require recorded database hash and all evidence hashes. Verify the separately retained ledger receipt with existing operations validation; do not manufacture an empty ledger if unavailable.
4. Install that verified latest committed ledger as the disposable runtime's `deletion-ledger`. Replay with `node self-hosted/erasure.mjs --replay --data /isolated/snapshot --ledger /isolated/snapshot/deletion-ledger`. Require passed replay, no pending files and erased synthetic accounts, sessions/tokens and private files absent. Repeat replay to show no resurrection. Recheck the authoritative ledger identity; a changed ledger invalidates the drill.
5. Use the intended supported application build against only this synthetic directory on a loopback listener. Verify remaining synthetic login/member/outsider/file paths and restart persistence; the erased account cannot authenticate and erased evidence cannot be retrieved. The hash check alone does not establish a working application. Record synthetic acceptance separately from later production/loss-scenario qualification.
6. Run `node self-hosted/rollback-check.mjs /isolated/snapshot` before proposing an older writer. Existing participation/safety state makes old writers unsafe even if SQLite is additive/readable. Preserve data and deletion intent and use a compatible forward repair; never overwrite live data with an older snapshot.
7. Stop the isolated listener, close databases, remove only this drill's disposable plaintext directory and check it is gone, including interrupted-run leftovers. Normal deletion is not forensic SSD erasure. Preserve encrypted test archives/sanitized receipts only as required; historical production plaintext disposition is a separate owner decision.

Reproducible engineering checks (no SSH or live recovery):

```sh
node --test tests/pilot-recovery.test.mjs tests/storage.test.mjs tests/erasure.test.mjs
python3 tests/operations_test.py
```

The new combined synthetic drill exercises an encrypted older snapshot/evidence with a later committed deletion ledger, then uses supported auth/storage on restored state and proves account/file removal and repeat replay. Existing tests refuse wrong keys/corruption, pending/incomplete ledger, unsafe extraction and corrupt evidence. Real archives, independent retrieval and release-image acceptance remain owner qualification.

## Failure, recovery and Mac-unavailable rehearsal

Use existing `.github/workflows/uptime.yml` and optional redacted operations webhook. GitHub runs public health every 15 minutes and nightly launch checks; its issue creation/recovery closure is evidence of monitor execution, not Watch-email delivery. Public health cannot establish offhost backup freshness, private report queue health or Mac job execution. The Mac job cannot announce its own absence.

Existing isolated mocked transport tests verify failure/recovery transitions, unchanged-failure deduplication, retry identity after timeout, disabled delivery, redaction, unavailable metrics and report backlog. No external destination is contacted. Operations warns at 30 h server backup age; **pilot** backup qualification requires <24 h. A local status receipt >2 h old is stale; a <30 d restore is a third separate check. None substitutes for the others.

After separate approval, rehearse a selected destination with a controlled failure and recovery. Record event times, destination opaque reference, primary and second responder receipt/acknowledgement, escalation and response timing in private evidence. An issue, HTTP 2xx or push-provider acceptance is insufficient. Keep report bodies/member data out of transport and public issue text.

Smallest proposed bounded fallback for owner approval: a named operator on an independent available device checks the privately accessible last completed full operations receipt at an agreed interval **no longer than two hours during covered pilot windows**, and before each activity. They check actual backup creation age, latest ledger/recovery receipt and unavailable metrics/backlog; alert the backup responder through the agreed channel on missing/stale/failed status. An operator on the same stopped Mac is not independent. Record coverage windows, observation interval, acknowledgement deadline, escalation and gaps (sleep/outages outside coverage and loss of receipt access). If the only receipt is inaccessible, record UNVERIFIED and pause the activity. No automatic cross-device transfer is implied. Owner decides whether that staffed coverage is adequate; if unattended assurance is required, hold until an explicitly approved independent stale-run path is qualified. No credentials or paid monitoring are created.

## Second-operator handoff and independent complaint drill

- Owner identifies primary and second technical operators and approves their least necessary access separately. Co-op stewards manage membership/community reviews; technical operators triage independent reports and service/recovery incidents. Two stewards are not evidence of two qualified technical operators.
- Second operator locates the release/status record, private operations receipts, report queue runbook in OPERATIONS.md, custody inventory, renewal calendar, restore authority and rollback/forward-repair instructions without receiving secrets in this handoff.
- In an isolated synthetic application, a participant submits a private `/report/` complaint about the **founding steward**, saves the private receipt, and checks its status. Verify the founder cannot resolve their own complaint through ordinary steward authority. Use existing SSH/local operator queue tooling against the disposable database; a separately acting operator independently triages, records a reason/decision and shows the reporter the existing visible status result. No automatic moderation decision or public complaint body.
- Second operator demonstrates queue/backlog checks, independent judgement and escalation when the primary/founder is conflicted, unavailable or lacks authority. Record synthetic input/result reference, reviewer/operator, times and gaps privately. Owner later signs off actual operator identity, access and coverage.
- Rehearse consent withdrawal, member removal, denied outsider access, intake when the co-op aggregate is full, support escalation, credential renewal and release responsibility. Device/account incident changes and real restore/release switches require separate authority.
- Record owner acknowledgement of report triage windows, urgent external threat process, support availability, release/rollback and restore authority. All remain UNVERIFIED until confirmed. Never invite participants under this kit.

Engineering evidence for independent report status, no public body leakage and queue access at capacity: `tests/safety.test.mjs`, `tests/safety-gateway.test.mjs`, `tests/workspace-capacity.test.mjs`. The independent operator's actual ability to follow the private runbook remains a human gate.
