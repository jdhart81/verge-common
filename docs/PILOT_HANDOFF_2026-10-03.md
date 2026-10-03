# Bounded pilot implementation handoff — 3 October 2026

## Review/merge description

The existing launch gate can exit successfully while human gates remain MANUAL; historical runbooks also blur optional reminders and active backup tooling with earlier installation state. This increment adds a local fail-closed pre-pilot evidence report and synthetic unverified template, dated custody/recovery/alert/operator workflows, and clear organizer contact/calendar instructions. It refuses missing/stale/future/wrong-build/config evidence, keeps actual BL-13 completion and broader announcement separate, and preserves existing invitation/event/reminder mechanics.

Two demonstrated recovery gaps are closed: missing local deletion-ledger directories can no longer be created as apparently empty ledgers, and the pre-v0.9.0 rollback guard now detects operator-restricted/hidden state. New fixtures combine real synthetic GnuPG encryption, older backup evidence and later committed deletion replay; independent complaint triage; strict evidence validation and an actual loopback CLI/build-switch probe. No production action, migration, dependency, access grant, notification service or storage-limit change.

## Changed files and reasons

- `.gitleaksignore`: exact fingerprint for the classified authored synthetic template version-ID match; no real credential or broad suppression.
- `scripts/pilot-readiness.mjs`, `package.json`, `docs/pilot-evidence.example.json`, `.gitignore`: bounded local CLI/report and private-manifest guidance. `scripts/launch-gate.mjs` only exports the existing certificate helper; existing monitor success semantics stay intact.
- `self-hosted/operations.py`, `self-hosted/rollback-check.mjs`: fail closed on missing recovery ledger and unsafe operator safety state respectively.
- `components/community-board.tsx`: current-details/calendar language and successful reschedule/cancellation handoff to agreed manual contact, acknowledgements and fallback. Existing commands/RSVPs/request identities unchanged.
- `docs/PILOT.md`, `PILOT_READINESS.md`, `PILOT_REHEARSAL.md`, `PILOT_AUDIT_2026-10-03.md`: proposal/owner placeholders, independent custody/archive+ledger loss scenario, staged rehearsal and acceptance map.
- `STATUS.md`, `docs/OPERATIONS.md`, `OPERATIONS_BETA.md`, `LAUNCH.md`, `FEATURE_ACCEPTANCE.md`, `self-hosted/README.md`: separate dated current observations from historical installation/launch evidence; fix no-push/paused wording without editing `docs/history/` receipts.
- `tests/pilot-readiness.test.mjs`, `pilot-recovery.test.mjs`, `calendar.test.mjs`, `operations_test.py`, `operations.test.mjs`: evidence CLI, combined recovery/operator/rollback, DST and unavailable/stale operational fixtures.

## Engineering checks and reproducibility

All source edits passed **302/302 Node tests**, including 16 Python/GnuPG operations cases. The original full local check-job sequence passed before the final missing-ledger/independent-review tightening; the complete sequence is repeated after the local candidate commit, with exact outcomes in ignored `outputs/pilot-review/results.json` and per-command logs. That file is the authoritative final run receipt; do not use the earlier 300-test run as final qualification.

Base main: `800d5175ddc1f01a39841b8095c372f64675d45c`. Branch: `codex/bounded-pilot-readiness`. Obtain the final local candidate via `git rev-parse HEAD`; confirm `git status --short` is clean. The final full candidate identity/observation is recorded in `outputs/pilot-review/candidate.json`. No commit/CI result here is a production observation.

Environment: Darwin 25.6.0 arm64, bundled Node 24.19.0, Python 3.14.3, GnuPG 2.4.7, Docker Desktop engine 29.8.1, Swift 6.4 / Xcode 27.0. Put the bundled Node directory first in PATH (the default shell Node 18 is unsupported):

```sh
export PATH="/Users/justinhart/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
npm ci
npm test
npm run simulate:coop
npm run lint
npm run typecheck
npm run build
npm run build:public
npm run db:migrate:local
# Start npm run dev on loopback with isolated checkout-local .wrangler state;
# stop it after this existing synthetic acceptance script:
python3 tests/http_integration.py
npm run build:selfhost
# Start npm run start:selfhost with fresh disposable VERGE_DATA_DIR,
# VERGE_BACKUP_DIR and full VERGE_BUILD_COMMIT=$(git rev-parse HEAD).
python3 tests/selfhost_acceptance.py
npm run backup:selfhost
```

The HTTP script permits only localhost:3000/3001; self-hosted acceptance defaults to 127.0.0.1:3100. Never set its production-fixture opt-in under this assignment. Migration runs against isolated checkout-local Wrangler storage. The full-suite fixture directories are temporary; ignored integration databases/logs contain only synthetic data.

Deployment-container equivalent to `.github/workflows/check.yml`:

```sh
docker build -f self-hosted/Dockerfile --build-arg VERGE_BUILD_COMMIT="$(git rev-parse HEAD)" -t vergecommon:pilot-local .
docker run -d --name vergecommon-pilot-local-check --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=128m \
  --tmpfs /data:rw,noexec,nosuid,size=3g,uid=1000,gid=1000 \
  --tmpfs /backups:rw,noexec,nosuid,size=128m,uid=1000,gid=1000 \
  --cap-drop ALL --security-opt no-new-privileges --pids-limit 256 --memory 1g \
  -p 127.0.0.1:3100:3000 -e VERGE_ORIGIN=http://127.0.0.1:3100 \
  -e VERGE_TRUST_CADDY=0 vergecommon:pilot-local
# Wait for /healthz, then:
python3 tests/selfhost_acceptance.py
docker exec vergecommon-pilot-local-check node self-hosted/backup.mjs
# Stop/remove only this disposable test container afterward.
```

Container build, multi-account acceptance and backup passed locally; final candidate/image receipt is `outputs/pilot-review/container-results.json`. The 3 GiB tmpfs preserves the existing 2 GiB safety floor. No production limits were raised.

Other local CI checks passed: `swift test --package-path ios` (**82 tests**); `xcodebuild -quiet -project ios/VergeCommon.xcodeproj -scheme VergeCommon -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/verge-pilot-ios CODE_SIGNING_ALLOWED=NO build`; pinned requirements installed in `/tmp/verge-pilot-imagery-venv`, then its Python ran `workers/imagery/test_processor.py` (**5 tests**) and `test_fetch.py` (**6 tests**, mock transport). Python is 3.14 locally vs CI 3.12; hosted Ubuntu/macOS job execution remains unperformed until a separately authorized push. Full existing CI remains the release standard.

CI-pinned gitleaks **8.21.2**, `gitleaks git . --log-opts=HEAD --no-banner --redact`, passed on the selected main history. Repeat on final local candidate; receipt `outputs/pilot-review/selected-secret-scan.log`. Local 8.30.1 also passed selected history. An unscoped local scan included unrelated email-branch history; those excluded commits are not attributed to this pilot. PR #33 and PR #32 status/findings are described with dated identities in the audit; no unrelated suppressions were copied or credential values printed. One authored synthetic template version-ID match was classified from source and documented with an exact historical fingerprint in `.gitleaksignore`; no rule/path wildcard was added.

Targeted reproducible drills:

```sh
node --test tests/pilot-readiness.test.mjs tests/pilot-recovery.test.mjs
node --test tests/calendar.test.mjs tests/event-edit.test.mjs tests/participation.test.mjs tests/push.test.mjs
python3 tests/operations_test.py
node --test tests/storage.test.mjs tests/erasure.test.mjs tests/safety.test.mjs tests/safety-gateway.test.mjs tests/workspace-capacity.test.mjs
```

The synthetic template must report NO / exit 1 when run with no launch observation or human attestations. Invalid private input exits 2 without echoing it. The successful loopback readiness fixture also proves that a build switch during checks returns unverified, and that an aggregate health PASS cannot cover missing launch checks or human gates.

Local in-app browser review at 390×844: page/workspace/events rendered with no error overlay or console errors, body width 375 ≤ viewport 390, Enter opened cancellation controls, successful synthetic cancellation displayed the urgent-contact notice, RSVP stayed recorded, and refresh retained cancellation/version 11. The skill's agent-browser executable was unavailable; its page/snapshot/error checklist was performed through the available in-app browser. Synthetic-only screenshot: `outputs/pilot-review/synthetic-cancellation-phone.png`; nothing from a real participant was captured. Zoom shortcuts did not establish 200% text in this browser: **200% text, VoiceOver and real cohort devices are UNVERIFIED**, not passed. Reset viewport and stop the temporary listener after review.

## Engineering complete (local)

- Local report/schema/template, honest per-gate and automated results, freshness/build/config/custody rules and redacted errors.
- Recovery/alert/operator/urgent-contact runbooks and historical provenance preserved.
- Synthetic validation, encrypted recovery/replay, failure/retry/recovery/redaction, capacity/privacy/access, calendar and independent operator intake evidence.
- Minimal copy/recovery guard changes, no schema or production mutation. Final full CI equivalents must be green in the receipts referenced above before calling this exact candidate checked.

## Production qualification unverified

Today's full deployed identity; intended-release real backup/restore/latest-ledger/loss-scenario qualification; independent key/archive/ledger custody; real primary/second-responder failure/recovery acknowledgement; independent Mac stale-run coverage; actual operators' independent report rehearsal/access; offered provider consent/revocation and real device/reminder display; VoiceOver/200% text; remote CI for this candidate. Historical 29 September evidence cannot fill these gates.

## Owner decisions needed

Confirm participants/dates, two organizers/active stewards and two named technical operators, support availability and response/escalation expectations; approve custody destinations and independently accessible archives/latest ledger; approve and rehearse alert/stale-run arrangement; choose/rehearse consented urgent-contact channel and nonresponder fallback; qualify offered sign-in/device scope; decide historical plaintext retention/disposal separately. No access, settings, credentials or infrastructure are enabled implicitly.

## Release/pilot blockers and next step

Pilot start remains blocked until every required readiness gate has fresh exact-build/config evidence and the owner explicitly approves start. If a required local/hosted release/security check is unresolved, it also blocks release. The excluded PR #33 secret-scan failures require safe classification before any later inclusion; do not import that work or its suppressions into this branch.

Next: review this local candidate and acceptance receipts, then complete the private owner-controlled gate checklist. Request separate authority for any push/merge/deploy/provider/access/participant/notification action. Broader announcement is separate; BL-13 results are recorded only after real activities. Passing code/tests and traffic do not prove adoption or ecological impact.

Compatibility/rollback: no migration or dependency change. Preserve authorization/concurrency/idempotency/audit/privacy/deletion and safety limits. The read-only old-writer guard now refuses participation and operator safety markers. A guard pass alone does not authorize an old writer: use a supported forward repair where needed, preserve current data and deletion intent, and never restore an older snapshot over live data.
