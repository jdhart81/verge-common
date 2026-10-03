# Bounded pilot review and operator evidence

Prepared 3 October 2026. This is a local review workflow, separate from land/conservation `lib/readiness.mjs`. Engineering completion, release/production qualification, pilot-start approval and actual pilot results are different decisions. No deployment, access grant, notification subscription or participant enrollment is authorized by this increment.

## Local report

Copy [the synthetic template](pilot-evidence.example.json) to an approved restricted location **outside the checkout**. Every supplied human gate starts UNVERIFIED. Use mode 0700 for its directory and 0600 for the manifest. Never upload a real manifest to source control, CI artifacts, a public issue or the application. The report omits evidence references and reviewer/operator identifiers; keep the private manifest for accountability.

```sh
npm run pilot:readiness -- --manifest /private/operator/pilot-evidence.json \
  --candidate FULL_40_CHARACTER_CANDIDATE_COMMIT --environment staging \
  --config OWNER_SELECTED_OPAQUE_CONFIGURATION_VERSION --origin http://127.0.0.1:3100 --json
```

An explicit `--origin` runs the existing launch checks against that instance, including sign-in redirect probes. Without it, automated qualification remains UNVERIFIED and exits 1. The CLI never fetches manifest references. Its explicit operator origin must match the manifest target; a local service cannot qualify a production manifest. It reads at most 32 KiB; schema 1 permits only the documented fields/gate IDs, rejects unknown/duplicate gates and accepts strict UTC times such as `2026-10-03T16:00:00.000Z`. Invalid input exits 2 with a fixed redacted error. Unmet gates exit 1. Exit 0 means **eligible for owner pilot review**, never permission to deploy, announce or invite.

The candidate must be an immutable full Git SHA. A dirty working tree has no final candidate identity: test its patch locally and record its diff hash, then rerun qualification after a separately reviewed commit/deployment. The full deployed commit must be observed from `/healthz`, match exactly and remain unchanged across the automated checks. An abbreviated/unknown health commit cannot qualify this report; do not infer today's deployment from STATUS or a tag. Existing launch-gate success/monitor semantics remain unchanged.

Manifest context: `schema`, `environment` (`local`, `staging`, `production`), `targetOrigin` (canonical origin, with no credentials/query/path), `candidateCommit`, `operatingConfig`, `scope` (`providers`, `reminders`, booleans), `custody` (backup/apple/vault credentialRef and custodian), and `gates`. The configuration version is an opaque owner-maintained identity for the intended operating arrangement: offered sign-in/device scope, responder coverage, alert/stale-run arrangement, urgent-contact process and custody versions. Change it whenever any of these changes. Never put configuration values, URLs or contacts in that identity.

Each gate has `id`, `result` (PASS/FAIL/UNVERIFIED/NOT_APPLICABLE). To qualify, add `time`, `evidenceRef`, `reviewer`, `operator`; use only opaque 1–80 character letters/numbers/underscore/hyphen identifiers. Do not store participant names/rosters, exact meeting details, complaint bodies, secrets, recovery codes, contact lists, URLs or private files. Keep referenced detailed evidence in its approved private location. Privacy-access and two-operator rehearsal gates require distinct reviewer/operator identifiers. A reviewer attests to having checked it; this tool cannot establish the truth of an attestation.

All noncustody attestations also require `candidateCommit`, `deployedCommit` and `operatingConfig` matching the intended/observed context. Custody attestations require `credentialRef` matching the current custody entry and `operator` matching its custodian; they remain valid across code-only releases while those values and their verification freshness remain unchanged. They are human attestations, **not machine proof of key possession**. Custody location references and procedures belong in the separately held inventory described below.

| Gate | Private evidence required | Freshness |
| --- | --- | --- |
| release-checks | Exact final CI/candidate identity, security review and secret scan, build/image identity, credential/TLS expiry review, rollback/forward-repair check; list unavailable checks as blockers | 24 h |
| privacy-access-review | Independent review of authorization, invitations, pending/removed/outsider/public projections, retries, withdrawal/deletion, capacity and report intake at limits | 30 d |
| provider-revocation | Controlled deletion/revocation for each provider offered to the cohort | 30 d |
| custody-backup / custody-apple / custody-vault | Independent recovery custody inventory and owner verification for all three secrets | 30 d |
| independent-archives-ledger | Independently accessible archives **and latest committed ledger**, including the intended simultaneous-loss scenario | 30 d |
| backup-under-24h | Completed verified off-server snapshot; timestamp is snapshot creation, not inspection | Strictly <24 h |
| restore-under-30d | Isolated intended-release restore, integrity/evidence checks, latest-ledger replay and supported application acceptance | Strictly <30 d |
| operations-under-2h | Successful full operations receipt, unavailable metrics and private safety backlog reviewed | ≤2 h |
| alert-failure-recovery | Controlled failure and recovery actually received by both responders, acknowledgements/escalation observed | 30 d |
| mac-stale-run-coverage | Approved independent stale-run check or staffed fallback and rehearsal, interval/coverage gaps recorded | 30 d |
| two-operators-report-rehearsal | Two named technical operators, coverage/authority and independent synthetic founding-steward complaint triage/visible result | 30 d |
| urgent-contact-rehearsal | Consented channel reaches all participants; sender/backup, acknowledgements and nonresponder fallback rehearsed | 30 d |
| signin-device-accessibility | Offered login/register/recovery and invitation paths; phone, keyboard, 200% text, VoiceOver/real devices; offline/denied fallback | 30 d |
| reminder-device-display | Actual display on every opted-in participating device/browser, account switch/removal/deletion and denied/unsupported/offline fallback | 30 d |
| consenting-scope-support | Owner confirms dates, consented cohort, two active stewards, technical operators, support hours and response expectations | 30 d |
| owner-go-no-go | Owner reviews all gates, unresolved incidents and permitted scope; records explicit start decision | 24 h |

Missing evidence, future times, stale times or wrong builds/configurations remain UNVERIFIED. FAIL remains FAIL. Only provider-revocation with `scope.providers=false` and reminder-device-display with `scope.reminders=false` can be genuinely NOT_APPLICABLE; exclusions require a dated accountable attestation and explicit scope/fallback evidence. A code/test pass cannot complete a human gate. BL-03, BL-05/06/07/10/14 remain represented explicitly. BL-02 consent/provider acceptance is covered by the offered-scope and release evidence. BL-13 is a **post-pilot** result and cannot be a prerequisite for the first activity. BL-16 broader announcement requires separate approval and is always unverified here. Unsupported native distribution, legal, carbon and payments do not become pilot gates.

## Owner decisions and start blockers

- Confirm the consenting cohort and dates. The working proposal is about four weeks, two organizers/stewards, 5–10 consenting volunteers, one useful activity and a later repeat; none is an accepted commitment.
- Name two technical operators, agree support coverage, acknowledgement/escalation expectations, release/rollback and restore authority. Technical access is distinct from co-op steward membership. Do not grant either implicitly.
- Approve custody destinations and personally arrange and verify independent recovery access. Approve any additional archive/ledger destination, permissions or credentials separately. Qualify the intended loss scenario; a second key copy alone cannot recover lost archives.
- Qualify a fresh off-server backup and isolated intended-release restore with the latest ledger. Approve alert destinations/settings, observe failure **and** recovery received by both responders; decide and qualify Mac downtime/stale-run coverage.
- Choose and rehearse the urgent participant channel and nonresponder fallback before invitations. Qualify every offered sign-in/device path and provider revocation; actual reminder display only where people voluntarily opt in.
- Decide historical plaintext retention/disposal separately. No cleanup policy is adopted here.
- Approve start only with all required evidence. Broader announcement is a separate decision. Record actual attendance, useful work, returns and concerns only after activities occur.

Unresolved release/security checks, recovery custody/recoverability, alerts/stale backup coverage, second operator, required privacy/access/recovery checks, urgent contact or participants/dates/support block start. Return the precise unmet gate and smallest owner decision. See [pilot workflow](PILOT.md), [rehearsal kit](PILOT_REHEARSAL.md), [audit](PILOT_AUDIT_2026-10-03.md).
