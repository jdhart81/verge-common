# Security review — 27 September 2026

Independent review of revision `4cd17bd` before the open-sign-up soft launch (Beta Launch Spec gate BL-04). The reviewer had no build context, read the gateway, auth, OAuth broker, co-op state machine, uploads, MCP and storage code, and ran proofs of concept against `lib/network.mjs` and `self-hosted/account.mjs`.

**Result:** no Critical findings; no authentication bypass, cross-co-op data access, file-download IDOR, SQL injection, stored XSS or OAuth account takeover. One High and six Medium findings concerned abuse and availability under open sign-up. All High and Medium items are fixed on branch `launch/soft-launch` except the M5 scan refactor, which is mitigated and scheduled.

| ID | Finding | Status | Fix / test |
| --- | --- | --- | --- |
| H1 | Anonymous 5 MB request bodies buffered before auth | Fixed | Anonymous `/api` writes refused before reading the body; 8 concurrent uploads; 30 uploads per user per 10 min; 2 GiB free-disk floor. `tests/abuse-controls.test.mjs` |
| M1 | Per-IP limits bypassed by rotating IPv6 addresses | Fixed | Keys use IPv4 /32 and IPv6 /64 (`self-hosted/client-key.mjs`) |
| M2 | Anyone could lock a username out of login and recovery | Fixed | Lockout keyed per (username, network) |
| M3 | Fake requests fill a public co-op's 500-member cap | Fixed | Cap counts active members; 50 pending requests maximum |
| M4 | One member can freeze a co-op by filling storage | Fixed | Per-member caps (20 projects, 50 parcels, 300 updates, 150 tasks; stewards exempt) and 40/min, 400/h command limits |
| M5 | Full-table JSON scans on some requests | Mitigated | `rate_limits(expires_at)` indexed and purged once a minute. Membership and asset-reference tables replace the `json_each`/`json_tree` scans in the next storage increment; current per-account co-op cap (20) and capacity limits bound the cost for the pilot |
| M6 | No per-user or server storage quota | Fixed | 500 MB per uploader; free-disk floor |
| L1 | Open redirect via `/.//host` return path | Fixed | Protocol-relative paths rejected in gateway and social flows |
| L2 | One person with two accounts can satisfy two-person review | Policy + follow-up | Terms of Use forbid it; follow-up: show reviewer account age and invitation source in reviews before real financial records |
| L3 | No HSTS; no app-wide CSP | Partly fixed | HSTS added to the production Caddyfile. App-wide CSP needs nonce support in the renderer; tracked |
| L4 | Raw database errors shown to users | Fixed | `userMessage()` hides driver errors |
| L5 | Anonymous reports can fill the operator queue | Mitigated | Now keyed per /64 network; per-reporter cap tracked |

Areas checked and found sound: session tokens and cookies, scrypt passwords and recovery codes, CSRF origin checks, identity-header stripping, OAuth state/PKCE/replay and linking, co-op authorization (`requireMember`/`requireSteward`, member and public views), file download authorization, MCP scopes and revocation, upload types and served headers, bound SQL parameters, monitoring SSRF limits, request size caps and secret hygiene.
