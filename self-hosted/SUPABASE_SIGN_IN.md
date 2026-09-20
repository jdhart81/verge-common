# Supabase sign-in for VergeCommon

Status on September 20, 2026: Google and Apple are saved and enabled in the dedicated Supabase project. **Supabase login is deployed behind the existing preview link, not publicly activated.** Google first-login acceptance has passed in Chrome; returning-login and Apple acceptance remain open. Email links remain disabled pending a production sender.

## Dedicated resources

- Organization: `jdhart81's Org` (`mllgeirarpyzitbwypgr`), Pro.
- Project: `VergeCommon`, reference `tizcemlockjetjaqnnlt`, `us-east-1`, returned `ACTIVE_HEALTHY` at creation.
- Approved project quote: $10/month, separate from the dedicated droplet. Billing begins with creation.
- Google project: `vergecommon`, display name `VergeCommon`, created with the explicitly approved `My Maps Billing Account` association. No paid Google APIs were enabled by this setup.
- These resources are separate from Viridis Conservation. Do not reuse its OAuth clients, Supabase project or user records.

## Architecture and account continuity

`VERGE_SOCIAL_BACKEND=supabase` opts into Supabase's authorization-code flow with S256 PKCE. Existing account/session, co-op authorization, explicit linking, recovery and deletion logic stays on the dedicated VergeCommon server. Default `direct` behavior remains unchanged.

Supabase tokens are exchanged on the server and never sent to the browser or used as VergeCommon bearer tokens. The server validates the user with Supabase's `/user` endpoint and independently checks the selected provider credential: Google UserInfo or an Apple refresh grant with signed ID-token validation. It matches the verified provider subject against Supabase's read-only identity record (`id`, not its database field name `provider_id`). User-editable metadata is used only for an optional display name, never account selection or permissions. The temporary Supabase session is signed out with local scope after verification.

Supabase is used for authentication only. Co-op records, chat, parcel maps and evidence files remain on the dedicated VergeCommon server. No Supabase Storage bucket or application-data migration is needed for this integration.

The same provider + subject retains an existing local identity, including identities created through the direct integration. Supabase automatic email linking cannot silently join local accounts. Existing members still sign in and explicitly link a provider from Your account.

Revocation credentials and the Supabase profile reference are encrypted in the existing token vault. Unlink/deletion queues revoke Google/Apple authorization; if no other linked local identity references the broker profile, cleanup deletes that Supabase user. Failures remain queued. Startup must retain Supabase configuration for pending broker cleanup. After broker identities exist, do not roll back to a release that cannot preserve and process their cleanup metadata.

## Configure providers

Provider callback registered with **both Google and Apple**:

`https://tizcemlockjetjaqnnlt.supabase.co/auth/v1/callback`

Google OAuth type: Web application. JavaScript origin: `https://vergecommon.com`. Scopes: `openid`, email and profile only. The owner explicitly approved `hartjustin6@gmail.com` as the public support contact and approved Google's API Services User Data Policy. The console now confirms "OAuth configuration created!" and shows the saved VergeCommon name/contact with Testing status. After owner approval, `VergeCommon Supabase Web` was created with the origin and Supabase callback above. Client ID: `509382893613-8ea0lnprjjgo3j7thtdpvo018a93ehj3.apps.googleusercontent.com`. Its downloaded credential JSON was verified for this project and restricted to owner-only permissions; it is outside the repository. The owner entered and saved the Google client secret, correcting an initial Apple-secret paste. The dedicated dashboard and public authentication settings confirm Google enabled. The new Google client ID/secret were securely installed in the dedicated server's existing root-only configuration, preserving the existing token-vault key. The Supabase preview deployment now enables Google and Apple with the broker backend. Homepage `https://vergecommon.com/`, privacy link `https://vergecommon.com/privacy/` and authorized domain `vergecommon.com` were saved and the console confirmed branding changes. Audience remains Testing; real sign-in acceptance is incomplete.

Apple: the owner explicitly approved the additional Supabase authentication destination. The dedicated Supabase hostname and callback were saved on existing Services ID `com.vergecommon.web`, retaining the existing direct callback. Apple reviewed four website URL entries before Save returned to the identifiers list. Keep the existing team/key configuration documented in [SOCIAL_SIGN_IN.md](./SOCIAL_SIGN_IN.md).

The owner saved the Apple secret for Client IDs `com.vergecommon.web` and then enabled the provider. Dashboard and public authentication settings confirm Apple enabled. A 90-day Apple client secret was generated locally, signature/issuer/audience/subject verified, and stored in a git-ignored owner-only file for secure entry. Its expiry is **2026-12-19 18:12:51 UTC**. Credential entry and submission through the browser require an owner handoff. The signing private key was not copied. Rotate the configured secret before that expiry; the existing server's short-lived Apple assertions alone do not rotate Supabase's configured secret.

Supabase Site URL was saved and read back as `https://vergecommon.com`.
These two additional allowed redirects were saved and read back (only these paths, with the generated state query):

```
https://vergecommon.com/auth/social/google/supabase-callback?state=*
https://vergecommon.com/auth/social/apple/supabase-callback?state=*
```

Both app callbacks use GET. Apple's cross-site POST terminates at Supabase, not the VergeCommon callback. The app still enforces a separate HttpOnly browser proof, single-use flow, expiry and same-origin confirmation. Do not allow wildcard domains or unrelated callback paths.

## Email-link sign-in

Implemented, opt-in and not enabled in production: `VERGE_EMAIL_ENABLED=1` requires the Supabase backend. Email is shown first, followed by Google/Apple, with existing username/password access retained in a disclosure. The same email action handles new and returning members. Existing members explicitly link email from their account settings; addresses never merge local accounts automatically.

After owner approval, this third allowed return address was saved and read back; the dashboard now lists exactly three allowed return addresses:

`https://vergecommon.com/auth/social/email/supabase-callback?state=*`

The server sends `/otp` requests with an S256 challenge and an exact return address. The default `ConfirmationURL` signup and magic-link templates must retain Supabase verification. Callback codes are exchanged server-side. The token is validated through `/user` before its authentication-method claims are read; confirmed email, the requested address hash, email identity and subject must match. No broker token reaches the browser. A local session is created only after the same-browser confirmation POST. Links expire locally after ten minutes and cannot be replayed. Opening in another browser requires starting again there.

Requests are limited per address (one/minute), client (five/15 minutes), and application (30/hour), in addition to existing sign-in and Supabase limits. Only an address hash is retained temporarily in flow/rate-limit records. Delivery failure removes the pending local proof and offers another sign-in method; it does not expose upstream errors. An abandoned request can leave an unconfirmed authentication profile in Supabase; operator retention must account for unconfirmed signups. Verified email identities use the same encrypted broker reference and queued profile cleanup as social identities. Email cleanup does not revoke Google/Apple authorization.

Live readback on September 20: Supabase public settings report email, Google and Apple enabled. Email remains disabled in the VergeCommon application. The dashboard explicitly reports use of the built-in email sender. **A production SMTP sender is still required** before public email-link activation; Supabase's default sender only supports authorized team addresses and is intended for testing. No email was sent during local validation. Keep email and social exposure behind the preview gate until real delivery and return-flow acceptance pass.

References: [passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [SMTP requirements](https://supabase.com/docs/guides/auth/auth-smtp), [official auth-js OTP/PKCE implementation](https://github.com/supabase/auth-js/blob/master/src/GoTrueClient.ts).

## Private server environment

Keep settings in the existing private server secret configuration, outside source and image build contexts. Never paste secrets into chat or commit them.

```
VERGE_SOCIAL_BACKEND=supabase
VERGE_SUPABASE_URL=https://tizcemlockjetjaqnnlt.supabase.co
VERGE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
VERGE_SUPABASE_SECRET_KEY=<server-only sb_secret key>
```

The secret key is required only for deletion of unreferenced authentication profiles and must never reach the browser. Existing Google/Apple client configuration and the token-vault key remain required for independent subject checks and revocation. Keep `VERGE_SOCIAL_PREVIEW=1` until provider acceptance completes. Do not replace or regenerate the existing token-vault key.

## Acceptance before activation

1. Validate broker-enabled gateway routes, wrong-provider/subject rejection, browser proof, PKCE, callback replay, explicit linking, recovery, cleanup retries and direct-backend regression tests.
2. Run lint, typecheck, production build and isolated full-app acceptance. Rehearse backup restore and preserve a compatible rollback release.
3. Verify enabled-provider settings on this dedicated project and test real Apple and Google login from HTTPS preview, including first login, returning to the same co-op account, consent cancellation and an existing-member link.
4. With a controlled account, verify local account deletion, provider authorization revocation, Supabase profile cleanup and failure retries. Synthetic tests are not proof of these external effects.
5. Turn off preview only after successful provider acceptance. Native Apple/Google UI and App Store release remain separate work.

References: [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google), [Supabase Apple sign-in](https://supabase.com/docs/guides/auth/social-login/auth-apple), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

## Validation receipt

- 259 automated tests passed after the browser-policy fix, including social/provider/email and gateway checks. Signed Apple refresh-token responses reject invalid issuer, audience and signature; Google subject verification uses provider UserInfo. Email checks reject mismatched/unconfirmed addresses, non-email proof and invalid tokens; delivery failure, limits, replay and returning-member behavior are covered. Broker tests use synthetic upstream responses, not real provider accounts.
- Lint, TypeScript, whitespace check and the production self-hosted build passed.
- An isolated local build passed full-app acceptance with disposable accounts: co-op membership, private content/evidence, account linking boundaries covered by authentication tests, native scoped access/recovery/deletion, hosted MCP, representative permissions and erasure. Social providers were disabled in this full-app acceptance run.
- Dedicated Supabase security advisors returned no lints. No application tables or policies were added to Supabase.
- The email-enabled login layout was checked in a local browser fixture with form submission disabled. This is UI evidence only.
- Both providers and all three return addresses are saved. The existing server-only Supabase key was verified against the Auth administration API and securely installed in the private server environment. Supabase preview deployment keeps public username/password login and leaves email links off. Google testing-audience acceptance, production SMTP, secret rotation and real-provider acceptance remain open. The Supabase project incurs the approved recurring cost while setup is pending.
- A real Chrome test found that the login page CSP omitted the broker origin, blocking form redirects. Commit `9e533a1` derives the additional exact form-action origin from the validated Supabase adapter, preserving the default-src and frame protections. The regression check and provider-origin test pass.
- Google Cloud audience was read back as External / Testing with no test users; the Data Access page has no declared scopes. Do not claim public availability or a successful Google login from this configuration alone.
- Deployment receipts are under `/opt/vergecommon/deployments/20260920-supabase-2494f3d` and `/opt/vergecommon/deployments/20260920-supabase-9e533a1`. The compatible rollback is `vergecommon:supabase-rollback-2d71131`; it preserves broker cleanup metadata but predates the CSP fix, so provider UI sign-in is degraded there. Never restore the older direct-only container after broker identities exist.

## Preview deployment receipt — September 20, 2026

- Runtime source: `9e533a1`; image `sha256:3df211ad912228a6e30a71186263c8a640395febf589307a5834034e92cce5ab`.
- `VERGE_SOCIAL_BACKEND=supabase`, Google/Apple enabled, `VERGE_SOCIAL_PREVIEW=1`, email disabled. Public password access remains available.
- Isolated full-app acceptance, candidate login-routing/CSP checks, pre/post deployment backups and restore checks passed. Public `/healthz` returns ok; the backup timer remains active and the app exposes no host ports.
- Chrome verification reached Apple's VergeCommon sign-in page with the exact Supabase callback, then Google's account chooser with the dedicated web client and email/profile scopes. No provider account was selected and no external callback/account-creation round trip has completed.
- Next: owner Google sign-in, returning-account continuity, Apple sign-in, explicit linking, cancellation and controlled cleanup acceptance. Provider-enabled status is not successful end-to-end authentication.

## Google confirmation fix and successful first login — September 20, 2026

- Current runtime source: `1f98cec`; image `sha256:f67d58501848cf99223540f981fede70f96733f20a559b337e9d54ed7a5bdcb0`. This supersedes the earlier runtime receipt above.
- The owner completed Google authentication, but the final form returned `Submit this form from VergeCommon.` The social pages used `Referrer-Policy: no-referrer`, which makes basic browser form POSTs send an opaque Origin. Social pages now use `strict-origin`: paths and query strings remain absent from referrers, and same-origin form proof works. The exact Origin check is unchanged; a regression assertion keeps `Origin: null` rejected. See [MDN referrer-policy behavior](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy).
- All 259 tests, lint and type checks passed. The server production build, isolated full-app acceptance, live preview checks, backup restoration and health checks passed. Receipts: `/opt/vergecommon/deployments/20260920-supabase-1f98cec`.
- Chrome resumed the still-valid verified Google flow, submitted the real confirmation form, and displayed the authenticated Your account page with Google linked and a one-time recovery code. The code was not recorded in this receipt. This establishes Google first login through Supabase and a local VergeCommon session, not returning-login, Apple, linking or deletion acceptance.
- The recovery-code page remains open for the owner to save the code. Public social activation and email links remain off. Current rollback image is `vergecommon:supabase-9e533a1`; it preserves broker cleanup metadata but predates the confirmation-policy fix.
