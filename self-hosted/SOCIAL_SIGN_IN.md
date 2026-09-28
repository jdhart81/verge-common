# Direct Google and Apple sign-in

For the owner-requested Supabase integration, see [SUPABASE_SIGN_IN.md](./SUPABASE_SIGN_IN.md). The Supabase project has been created, but provider configuration and real-provider acceptance are not complete. Direct sign-in remains the default backend until an explicit runtime cutover.

This integration uses OpenID Connect with `openid-client` and signed Apple client assertions with `jose`. Firebase is not required. Providers authenticate identities; VergeCommon owns accounts, permissions, sessions and co-op records. It never joins accounts based on email addresses.

## Activation status

Implementation is opt-in and disabled by default. Apple registration was completed on September 20; live user acceptance remains pending. Google registration is waiting for the owner’s billing-account choice. Local automated tests use synthetic identities and signed test tokens; they do not establish successful production provider consent or native-app distribution. Do not advertise provider login until the real-provider checklist below passes.

The native iOS app still uses its existing password/device-token flow. A web social account receives a generated VergeCommon username and one-time recovery code, which can set a backup password in Your account. It can also issue a scoped device token. Native Google/Apple buttons and native provider callbacks are not included in this web integration.

## Provider registration

Use a **dedicated VergeCommon** application, owned by Viridis LLC. Do not change the separate Viridis Conservation application or its users.

Google: create a web OAuth client, configure the consent screen with the VergeCommon name, verified domain, support contact and privacy policy, and register exactly:

`https://vergecommon.com/auth/social/google/callback`

Apple: enable Sign in with Apple for the appropriate primary App ID; create a Services ID associated with it, register `vergecommon.com` and exactly:

`https://vergecommon.com/auth/social/apple/callback`

Create or select the signing key for that primary App ID. Use the Services ID (not the bundle ID) as the web client ID. The server signs five-minute client assertions using the Team ID, Key ID and private key. Apple's callback is a cross-site form POST. Google uses an authorization code with PKCE. The browser must accept the secure, HttpOnly flow cookie for ten minutes.

References: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Apple web configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web), [Apple account deletion and token revocation](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple).

## Private runtime configuration

Inject secrets through the deployment's private environment file or secret manager. Do not commit them, include them in image build inputs, screenshots, support messages, or logs. Mount the Apple key read-only with access for the container's `node` user. The public callback origin must match `VERGE_ORIGIN` exactly.

| Variable | Value |
| --- | --- |
| `VERGE_SOCIAL_PREVIEW` | `1` keeps provider buttons off ordinary login; `/account?socialPreview=1` shows configured providers for acceptance. This controls visibility, not access authorization. |
| `VERGE_OAUTH_TOKEN_KEY` | 32 random bytes encoded as 64 hexadecimal characters |
| `VERGE_GOOGLE_ENABLED` | `1` to enable Google |
| `VERGE_GOOGLE_CLIENT_ID` | Google's web client ID |
| `VERGE_GOOGLE_CLIENT_SECRET` | Google's client secret |
| `VERGE_APPLE_ENABLED` | `1` to enable Apple |
| `VERGE_APPLE_CLIENT_ID` | Apple Services ID |
| `VERGE_APPLE_TEAM_ID` | Owning Apple Developer Team ID |
| `VERGE_APPLE_KEY_ID` | Sign in with Apple key ID |
| `VERGE_APPLE_PRIVATE_KEY_FILE` | Absolute in-container path to mounted PKCS#8 `.p8` key |

Enable providers independently. Incomplete enabled configuration fails startup. A disabled provider has no login button. Preserve the encryption key separately from database backups under operator-controlled secret custody. Losing or replacing this key without migrating encrypted credentials prevents revocation. Do not casually rotate it. Startup refuses to reopen with pending revocations when the necessary provider configuration is missing.

## Account and deletion behavior

- First provider login creates a local account and a one-time recovery code. Returning logins use provider plus subject ID, retaining the same memberships and records.
- Existing members first sign in normally, then use Your account to link a provider. A current password, the same browser session, provider verification, and explicit consent are required. An identity already attached to another user cannot be taken over.
- Removing a provider requires a working backup password. Provider-only users set one using their recovery code before linking another provider or removing their current link.
- Provider-only users can delete their account after fresh verification with a linked provider and a final confirmation. Existing founder-transfer and retained-governance rules still apply.
- Authorization revocation is queued transactionally when a link/account is removed, including deletion-ledger replay after restoration. Local access ends immediately. Failed revocation retains encrypted credentials for retries at restart/hourly maintenance. Operators must resolve maintenance failures; never claim external authorization was revoked merely because local deletion succeeded.
- Short-lived login flows are browser-bound, expire after ten minutes, consume callbacks once, and require a same-origin POST before signing in or changing an account. ID token signatures, issuer, audience and nonce are checked. An in-flight flow predating removal cannot restore its identity.

## Release checklist

1. Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build:selfhost`.
2. Run the existing isolated acceptance and backup/restore checks with the release image. Retain a database-compatible rollback image. Once provider records exist, do not roll back to an image that does not understand provider-only users, deletion triggers, encrypted tokens and revocation queues.
3. Configure each provider on a dedicated HTTPS staging origin/client first, using its exact callback URI. Check new registration, returning login, saved recovery, explicit link, cancellation, unlink and deletion using synthetic accounts.
4. Check Apple Safari and Google Chrome, including cross-site callback cookies, pop-up-free redirects, keyboard navigation and the recovery-code page. Check the approved provider button branding before public activation.
5. Enable the real production clients, then perform a separately controlled real-provider smoke test. Confirm existing password users retain access, the same provider returns the same co-op identity, and deletion revokes provider authorization. Do not treat mocked tests as this receipt.

## September 20, 2026 implementation verification

- 238 Node tests passed, including real signed test-token rejection for incorrect signature, issuer, audience and nonce; browser-bound callbacks; Apple cross-site form response handling; consent/session-bound linking; recovery; revocation retries; and deletion-ledger replay.
- Lint, TypeScript checking and the self-hosted production build passed.
- The built application passed isolated acceptance on loopback using disposable accounts, private co-op membership, evidence, authenticated MCP, scoped native access, recovery and deletion. Providers were disabled for that application acceptance; provider tests used synthetic adapters/tokens.
- Read-only provider console checks found no Google project matching `verge`, and no Apple Services IDs in the currently signed-in developer team. No provider registration or credential change was made.
- This is source readiness, not a successful live Google/Apple sign-in or a deployed native social-login release. Production activation remains pending provider registration, secret provisioning and real-provider acceptance.

## Approved Apple registration follow-up

Registered under the owner-approved existing Apple Developer team `ST9K746229` (Justin Daniel Hart): primary App ID `org.vergecommon.app`, Services ID `com.vergecommon.web`, Sign in with Apple key ID `6J6KY5FQBW`. This is registration for web authentication, not App Store publication or a change to the team’s seller identity. The exact callback and domain above are saved. Apple’s authorization page recognizes VergeCommon; a deliberate invalid-code probe returned `invalid_grant` rather than `invalid_client`. Neither check is a successful user login.

The private key and token-encryption configuration are stored outside the repository on the dedicated server. A downloaded Apple key remains permission-restricted on the owner’s Mac. An additional local recovery copy was blocked by automatic approval review and awaits explicit owner approval. Do not claim independently recoverable encryption-key custody until that is completed.
