# Spec: VergeCommon email updates (opt-in list + campaign tooling)

Status: ready for implementation · Author: Justin Hart / Claude · 2026-10-03
Repo: `jdhart81/verge-common` (`community/`), base `main` @ `f0054da` (v0.9.0 live)
Branch: `feat/email-updates` · One PR · Do **not** deploy.

## 1. Goal

Let people opt in to occasional VergeCommon email updates, and give the operator a safe command-line tool to draft and send a campaign through Resend from `vergecommon.com`. Ship it **disabled by default**; it turns on only when the operator sets the env vars.

## 2. Context Codex must respect

- Runtime: Node ≥ 22.13, ESM `.mjs`, tests use `node --test tests/*.test.mjs`, lint `oxlint`, types `tsc --noEmit`. Self-hosted server: `self-hosted/server.mjs` (rate limiter: `auth.rateLimit(key, max, windowMs)`).
- **Privacy posture (PRIVACY.md):** "Email addresses are not required", "no advertising or application analytics tracker", "There is no email delivery." This feature changes the last statement; PRIVACY.md must be updated in the same PR.
- **No-placeholder rule:** unconfigured features are hidden, not shown as "coming soon" (see STATUS.md soft-launch notes).
- Email provider: **Resend** (domain `vergecommon.com` already added; return-path subdomain `send`). Use Resend's REST API via `fetch`. **No new npm dependencies.**
- Resend API shapes (contacts, segments/audiences, broadcasts) have changed recently. **Verify every endpoint and field against https://resend.com/docs/api-reference before coding**, and isolate all Resend calls in a single adapter module so tests can mock it.

## 3. Invariants (must hold; each has a test)

| ID | Invariant |
|---|---|
| I1 | **Disabled unless configured.** If any required env var is missing, `/updates/` returns 404, the signup API returns 404, and no page links to it. |
| I2 | **No subscriber emails in VergeCommon storage.** The app's SQLite DB, logs, audit entries and error messages never contain a subscriber email address. Resend is the only system of record. |
| I3 | **Double opt-in.** A contact is created in Resend only after the person clicks a confirmation link. Submitting the form only sends one confirmation email. |
| I4 | **Stateless, tamper-proof confirmation.** The link carries `email + expiry + segment` signed with HMAC-SHA256 (`VERGE_UPDATES_SIGNING_SECRET`), compared in constant time. It expires after 48 h. A tampered, expired or wrong-segment token creates nothing. |
| I5 | **Idempotent confirm.** Clicking a valid link twice gives the same success page and leaves exactly one contact. |
| I6 | **No enumeration.** The signup response is identical (status, body, timing within reason) whether the address is new, already subscribed, invalid-but-well-formed, or rate-limited. |
| I7 | **Abuse limits.** Per client: 5 signups / 15 min. Global: 100 / hour. Per address: 1 confirmation email / 10 min (in-memory, keyed by HMAC of the address, never the raw address). Reuse `auth.rateLimit`. Hidden honeypot field; if it is filled, return the normal response and send nothing. |
| I8 | **No tracking.** Open and click tracking are off in every send. No tracking pixels or redirect links in templates. |
| I9 | **Every campaign email is compliant.** It includes the sender identity, the physical mailing address (`VERGE_UPDATES_POSTAL_ADDRESS`), a working unsubscribe link (Resend's unsubscribe placeholder), and a plain-text part. The campaign CLI refuses to create a broadcast that lacks any of these. |
| I10 | **Sending is never accidental.** The CLI defaults to dry-run. Creating a draft needs `--create`. Sending needs `--send <broadcastId> --confirm <broadcastId>` (the same ID typed twice) and prints the recipient segment and count first. CI and tests never hit the network. |
| I11 | **Secrets stay server-side.** `RESEND_API_KEY` and the signing secret are never logged, rendered or returned. |

## 4. Deliverables

### 4.1 Resend adapter: `self-hosted/resend.mjs`
- `createResendClient({ apiKey, fetchImpl = fetch })` exposes `sendEmail`, `upsertContact(email, segmentId)`, `createBroadcast(...)`, `getBroadcast(id)`, `sendBroadcast(id)`, `countSegment(segmentId)`, each mapped to the verified endpoints.
- Errors are normalized to `{ status, code }` with no request body echoed (I2, I11).

### 4.2 Signup flow
- Env: `VERGE_UPDATES_ENABLED=1`, `RESEND_API_KEY`, `VERGE_UPDATES_SIGNING_SECRET` (≥ 32 bytes), `VERGE_UPDATES_SEGMENT_ID`, `VERGE_UPDATES_FROM` (e.g. `VergeCommon <updates@vergecommon.com>`), `VERGE_UPDATES_REPLY_TO`, `VERGE_UPDATES_POSTAL_ADDRESS`.
- `GET /updates/` is a server-rendered page matching existing public pages. It has a single email field, a short consent sentence ("Occasional updates about VergeCommon. Unsubscribe anytime. We store your address only with our email provider, Resend."), a privacy link and the honeypot. It must meet WCAG 2.1 AA, keeping axe at 0 violations as in v0.8.1.
- `POST /api/updates/subscribe` uses CSRF/same-origin protection consistent with existing forms. It normalizes and validates the address (length ≤ 254, a single `@`, no control characters) and applies I6/I7. When allowed, it sends the confirmation email (plain text + HTML, no tracking).
- `GET /updates/confirm?t=…` verifies the token (I4), upserts the contact (I5) and renders a confirmation page. Failures render a single generic "link expired or invalid — sign up again" page.
- Unsubscribe uses Resend's hosted unsubscribe. Do not build a local unsubscribe store.
- Add a "Get updates" link to the footer and the `/support-project/` page **only when enabled** (I1).

### 4.3 Campaign CLI: `scripts/campaign.mjs` (npm script `campaign`)
- Input is a Markdown file with front-matter (`subject`, `preview`, optional `replyTo`). The CLI renders HTML and plain text with a fixed footer (I9).
- `--lint <file>` checks I8/I9 and also rejects external images, `<script>`, and links that aren't `https:`.
- `--preview <file>` writes `outputs/campaign-preview/<slug>.{html,txt}`; `outputs/` is already ignored.
- `--test <file> --to <addr>` sends a single test email (not a broadcast).
- `--create <file>` creates a **draft** broadcast and prints its ID and the segment count.
- `--send <id> --confirm <id>` follows I10.
- Add `templates/campaign/first-update.md` as an example with placeholder copy marked `TODO(Justin)`.

### 4.4 DNS check: `scripts/email-dns-check.mjs` (npm script `email:dns`)
- Uses `node:dns/promises` to resolve and assert:
  - `resend._domainkey` TXT is present (`p=…`);
  - `send` TXT is `v=spf1 include:amazonses.com ~all`;
  - `send` MX is `feedback-smtp.us-east-1.amazonses.com` priority 10;
  - `rsend` CNAME is `send.forge.rmta.net`;
  - `_dmarc` TXT is present;
  - **root MX still includes `eforward1–5.registrar-servers.com`**, so inbound forwarding to justin@vergecommon.com is intact.
- Prints a pass/fail table and exits non-zero on any failure. The resolver is injectable for tests.

### 4.5 Docs
- New `docs/EMAIL.md`: architecture, env vars, the operator runbook (DNS, Resend key scopes, first test send, sending a campaign), the CAN-SPAM checklist, and rollback (unset `VERGE_UPDATES_ENABLED`).
- `PRIVACY.md`: replace "There is no email delivery" with an accurate description covering opt-in updates, Resend as processor, what is stored where, double opt-in, unsubscribe, and no tracking. Keep the statement that **account** sign-up does not require email.
- `STATUS.md` and `docs/RELEASE_NOTES.md`: add an "Unreleased" entry.
- `.env.example` / self-hosted README: add the new vars without values.

## 5. Tests (all offline, `node --test`)
- `tests/updates-signup.test.mjs`
  - I1: 404s when disabled.
  - I3: subscribe sends one email and creates no contact.
  - I4: tampered, expired and wrong-segment tokens are rejected; a valid token is accepted.
  - I5: double confirm leaves one upsert-equivalent result.
  - I6: identical responses across the four cases.
  - I7: limits trip and the honeypot sends nothing.
  - I2: a captured log, DB and error snapshot contains no fixture email.
  - I11: no secret appears in any response or log.
- `tests/campaign.test.mjs`
  - Lint rejects a missing unsubscribe, a missing address, a tracking pixel, `http:` links and scripts.
  - Dry-run makes zero network calls.
  - `--send` with a mismatched `--confirm` aborts.
  - Rendered output includes a text part.
- `tests/email-dns-check.test.mjs`: pass case; missing `send` MX fails; missing eforward root MX fails.
- `tests/resend-adapter.test.mjs`: request shapes match the documented API (mock fetch); errors are normalized without echoing the body.
- Existing suite stays green: 276+ tests, `lint`, `typecheck`, `build:selfhost`.

## 6. Acceptance
1. `npm test && npm run lint && npm run typecheck && npm run build:selfhost` all pass.
2. With the env unset, the built server shows no `/updates/` route and no footer link (I1).
3. With fixture env and a mocked Resend, the full journey (form → email captured by mock → confirm → contact upserted once) passes in an isolated test.
4. `npm run campaign -- --lint templates/campaign/first-update.md` passes, apart from `TODO(Justin)` warnings.
5. The PR description lists every invariant with the test that covers it, and flags anything that deviated from this spec.

## 7. Out of scope (do not do)
- DNS changes, Resend dashboard setup, API key creation, Gmail "Send mail as", or changes to email forwarding. These are operator tasks in docs/EMAIL.md.
- Enabling Supabase email-link sign-in. That's a separate follow-up; it may reuse the same Resend SMTP later.
- Importing any contact list, sending any real email, or deploying.
- Analytics, open/click tracking, or new npm dependencies.

## 8. Open decisions (Codex: implement with these defaults, flag in the PR)
- Sender `updates@vergecommon.com`, reply-to `justin@vergecommon.com`.
- Resend API key scope: contact upsert needs a full-access key. Document a separate sending-only key for the CLI test sends, and note the risk.
- Postal address is supplied only through env, never hard-coded.
- Confirmation token TTL is 48 h, and the per-address cooldown is in-memory, so it resets on restart (acceptable for pilot scale).
