# Optional email updates

Unreleased and disabled by default. This change does not deploy, configure a provider, change DNS, import contacts or send real email.

## Architecture and privacy

The self-hosted gateway serves `/updates/`, `POST /api/updates/subscribe` and `/updates/confirm?t=…`. The public server components evaluate configuration at request time; no secrets are serialized into markup or browser code. The form uses the gateway's canonical same-origin protection and a hidden honeypot. Resend calls are isolated in `self-hosted/resend.mjs` with an injectable fetch. Tests call the gateway in process without a socket, mock every provider call and inject DNS resolution.

Submitting an address creates no contact. It queues one confirmation email and returns the same generic 202 page after a 250 ms response floor. Delivery is detached so provider failures and latency cannot enumerate subscribers. The token contains the normalized address, expiry and segment, signed with HMAC-SHA256 and verified in constant time. It expires in 48 hours; confirmation creates the unique provider contact or attaches an existing one to the segment. An existing contact's global unsubscribe is preserved: replaying an old link never re-subscribes it. A person who previously unsubscribed must manage subscription with the provider/operator. No local unsubscribe store exists.

SQLite contains only the existing hashed rate-limit buckets (5/client/15 minutes and 100/global/hour), never subscriber addresses. The address cooldown (one confirmation/10 minutes) is a gateway-local map keyed by HMAC of the address; it resets on restart. Pending confirmation delivery contains transient address/token data in memory, not persistent subscriber records. Provider errors are reduced to fixed `{ status, code }`, without provider message/body/name/URL. Never add request-body or full-URL logging for these routes. Confirmation responses use `no-store` and `no-referrer`. The supplied Caddyfile has no access logging; operators adding proxy, APM, tracing or log middleware must exclude subscribe bodies and confirmation query strings. Resend itself receives and may retain delivery/bounce/suppression records.

## Configuration

All of these must be supplied to show the route and links:

| Variable | Requirement / operator default |
| --- | --- |
| `VERGE_UPDATES_ENABLED` | Exactly `1`; leave unset for rollback |
| `RESEND_API_KEY` | Full-access runtime key (contact management and tracking readback) |
| `VERGE_UPDATES_SIGNING_SECRET` | At least 32 UTF-8 bytes of independent random secret material |
| `VERGE_UPDATES_SEGMENT_ID` | Dedicated VergeCommon updates segment UUID |
| `VERGE_UPDATES_FROM` | `VergeCommon <updates@vergecommon.com>` |
| `VERGE_UPDATES_REPLY_TO` | `justin@vergecommon.com` |
| `VERGE_UPDATES_POSTAL_ADDRESS` | Operator's actual valid physical mailing address, supplied only via env |

No postal address or credential is hard-coded. Keep keys in the operator's secret environment; do not commit them or paste them into terminal arguments/screenshots. Rotating the signing secret invalidates outstanding confirmation links. Use one gateway instance at pilot scale; per-client/global limits are shared via auth SQLite, but per-address cooldown and pending-send state are per process.

For a CLI test send, use a separate domain-restricted sending-only `RESEND_API_KEY`. The adapter also needs to read domain tracking settings; supply `VERGE_UPDATES_TRACKING_API_KEY` with a full-access key for that readback. It is used only for GET `/domains`, not the email POST. Full-access keys expose other provider resources: restrict operator access, separate environments and rotate/revoke when needed. If the readback key is absent, the adapter uses the primary key; sending-only keys that cannot read domain settings fail closed. Never skip the tracking guard.

## Verified API contracts (2026-10-03)

These official REST docs were read before implementation. Audiences are deprecated; use `segment_id`.

| Operation | Method/path and shape | Official source |
| --- | --- | --- |
| Confirmation/test send | POST `/emails`: `from`, `to`, `subject`, `html`, `text`, `reply_to` | [Send email](https://resend.com/docs/api-reference/emails/send-email) |
| Existing contact lookup | GET `/contacts/{email}` (URL-encoded path component) | [Retrieve contact](https://resend.com/docs/api-reference/contacts/get-contact) |
| New contact | POST `/contacts`: `email`, `unsubscribed:false`, `segments:[{id}]` | [Create contact](https://resend.com/docs/api-reference/contacts/create-contact) |
| Membership readback | GET `/contacts/{id}/segments`; paginated; repeat confirmations skip existing membership | [List contact segments](https://resend.com/docs/api-reference/contacts/list-contact-segments) |
| Existing segment membership | POST `/contacts/{id}/segments/{segment_id}`; no body | [Add contact to segment](https://resend.com/docs/api-reference/contacts/add-contact-to-segment) |
| Draft | POST `/broadcasts`: `segment_id`, `from`, `subject`, `html`, `text`, `reply_to`, `send:false` | [Create broadcast](https://resend.com/docs/api-reference/broadcasts/create-broadcast) |
| Review draft | GET `/broadcasts/{id}`: includes `segment_id`, `status`, content and sender | [Retrieve broadcast](https://resend.com/docs/api-reference/broadcasts/get-broadcast) |
| Send | POST `/broadcasts/{id}/send`, `{}`; no schedule | [Send broadcast](https://resend.com/docs/api-reference/broadcasts/send-broadcast) |
| Count | GET `/segments/{id}/contacts`; `data`, `has_more`, exclude `unsubscribed:true` | [Segment contacts](https://resend.com/docs/api-reference/segments/list-segment-contacts) |
| Tracking guard | GET `/domains`; match sender domain, require `open_tracking:false` and `click_tracking:false` | [List domains](https://resend.com/docs/api-reference/domains/list-domains) |
| Pagination | `limit=100`, `after=<last id>` when `has_more:true` | [Pagination](https://resend.com/docs/api-reference/pagination) |

The send/create REST schemas do not document per-message tracking switches. Do not send invented fields. Instead every confirmation, test, draft creation and broadcast send reads and requires disabled domain tracking. The adapter performs no settings mutation. Operators must keep those settings off while delivery is queued; API readback and sending are separate provider operations, so the provider cannot provide an atomic per-message guarantee through these endpoints. Unknown/missing settings and readback failures block sends. Changing domain settings concurrently is outside this application's control.

The create-broadcast schema also does not document `preview_text`. The Markdown `preview` is rendered as the first visible paragraph in HTML and text instead of sending an unsupported field.

## Operator runbook

1. Check DNS with `npm run email:dns`. This is a read-only live resolver command, never a test. It requires DKIM `p=…`, the exact `send` SPF, SES MX priority 10, `rsend` CNAME, DMARC, and **all five** eforward root MX records. A failure exits nonzero. Preserve inbound forwarding; this PR changes no DNS.
2. In Resend, verify `vergecommon.com`, create the dedicated segment, and set both domain tracking settings off. Prepare the full-access runtime key and independent signing secret privately. Use section 8 sender/reply-to defaults above and an actual postal address. Do not enable the feature until these operator tasks are complete.
3. Prepare a separate sending-only key for CLI test emails plus the full-access tracking-readback key described above. Replace `TODO(Justin)` in a copy of `templates/campaign/first-update.md`; reviewed copy must contain no raw HTML, images or non-HTTPS links. Only headings, paragraphs, bold and inline HTTPS links are supported. A fixed identity/address/unsubscribe footer is appended in both parts. `replyTo` front matter can override the configured reply-to.
4. With sender, reply-to and postal env configured, run `npm run campaign -- --lint templates/campaign/first-update.md`. The example lints with TODO warnings but cannot be sent or created. Lint/preview/dry-run work without API keys. `npm run campaign -- path/to/reviewed.md` is a dry-run; `--preview path/to/reviewed.md` writes HTML/text to ignored `outputs/campaign-preview/`.
5. Deliberately send a single reviewed test: `npm run campaign -- --test path/to/reviewed.md --to your-test-address`. This is a transactional test, never a broadcast. Resend's hosted unsubscribe placeholder expands only for broadcasts; the test footer labels that limitation and removes the unusable link. Confirm inbox delivery separately from provider acceptance. The command never prints the recipient address or key.
6. Enable the gateway with all required env after the operator authorizes it. Use a controlled address for the form → confirmation → contact check and unsubscribe from the first approved campaign to verify hosted behavior. Offline tests prove request contracts, not live delivery or provider unsubscribe behavior.
7. Create a draft: `npm run campaign -- --create path/to/reviewed.md`. Review its ID, segment, subscribed-contact count, HTML/text, sender and address before any send. No implicit send or schedule is permitted.
8. Send only after deliberate review: `npm run campaign -- --send BROADCAST_ID --confirm BROADCAST_ID`. The CLI retrieves and validates a draft in the configured segment, prints the segment and subscribed-contact count, then sends. Count is a read-time estimate, not delivery evidence. Writes/test sends are rejected in CI. Never include real credentials in test fixtures.

## CAN-SPAM operator checklist

Before an approved campaign, check accurate sender/header identity and nondeceptive subject; include the operator's valid physical mailing address and clear hosted unsubscribe in HTML and text; identify commercial content when applicable; verify unsubscribe works and honor it promptly (within 10 business days); do not import unconsented lists or send to suppressed contacts; retain appropriate provider-held consent/operational records. This implementation is limited to occasional opted-in project updates and is not legal certification. Lint cannot establish the truth of an address or copy; the operator reviews those before sending.

## Rollback and limits

Unset `VERGE_UPDATES_ENABLED` and restart the gateway/internal page server. All updates endpoints return 404 and links disappear. This stops new signup/confirmation; it does not recall provider-accepted emails, delete contacts, cancel already-sent broadcasts or prevent a separately invoked operator CLI. Revoke the relevant keys separately if needed. Remove provider-held subscriber data through Resend's authorized operator controls. There is no subscriber table or DB migration to roll back.

Defaults retained: sender `updates@vergecommon.com`, reply-to `justin@vergecommon.com`, postal address env-only, 48-hour TTL, in-memory cooldown. API-driven adjustments: domain readback instead of unsupported per-message tracking fields; optional separate tracking-readback key for sending-only CLI test key; visible preview paragraph instead of unsupported preview field; transactional test footer cannot expand a hosted broadcast unsubscribe link; existing global opt-outs are preserved rather than reversed by old links. No new dependencies, network calls in new tests, deployment, real sends or DNS/provider changes.

## Offline validation

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build:selfhost`. Then `node --test tests/updates-built.mjs` exercises the actual built page handler without a socket: every missing variable hides the home/support/privacy-footer links; runtime-enabled fixture config shows them without either secret in HTML. The main suite includes 27 new tests that map I1–I11 to signup, adapter and campaign behavior plus DNS fixtures. No live DNS command or real send belongs in this test sequence.

`tests/updates-accessibility.mjs` is a separate offline browser audit. Point `VERGE_PLAYWRIGHT_MODULE` at an already-installed local Playwright entry module and `VERGE_AXE_SOURCE` at a local `axe.min.js`, then run `node --test tests/updates-accessibility.mjs` with installed Chrome. It blocks all page requests, checks WCAG 2.1 A/AA on form/success/failure, verifies no 320-pixel overflow, and checks keyboard focus reaches the email field. No npm/browser dependency is installed or added to this repository. The 2026-10-03 local audit used existing axe 4.12.1 and Chrome and reported zero violations. Automated axe checks do not replace all manual accessibility review.
