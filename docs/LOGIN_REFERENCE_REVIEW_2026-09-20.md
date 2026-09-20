# Viridis login reference review — September 20, 2026

Reference inspected read-only: the live `https://viridisconservation.com/login` page, its Supabase provider settings, and the `viridis-conservation-app` source inside the owner-selected Viridis Core docs workspace. No Viridis account, credential or configuration was changed or copied.

## Current findings

| Area | Viridis reference | VergeCommon |
| --- | --- | --- |
| Identity service | Supabase Auth | Dedicated Supabase integration implemented; not activated in production |
| Google and Apple | Both enabled in the reference project's Supabase dashboard; both buttons present on the live page | Google client created and email return address saved after approval; Google/Apple provider secret entry still pending |
| Email | One-time email link; the same form supports new and returning users | Opt-in email-link flow now implemented and locally tested; public delivery/activation still pending; username/password and recovery retained |
| First use | Account creation followed by Research OS onboarding | Provider identity confirmation followed by local account creation and co-op access |
| Account/session storage | Supabase session plus Viridis profiles/entitlements | Existing local accounts, co-op memberships and sessions; Supabase brokers provider authentication |
| Return destination | Validated local `next` path | Validated local `returnTo`, preserved through the provider flow |
| Identity linking | Supabase identity behavior | Explicit local linking; matching email does not merge co-op accounts |
| Credentials | Reference-project provider credentials held privately | Separate VergeCommon clients, callback registration and private credentials required |

The reference's `docs/beta/SOCIAL_LOGIN_SETUP.md` still says Google and Apple are disabled. That readiness snapshot is stale: the live dashboard showed both **Enabled** during this review. Enabled settings and visible buttons do not prove a completed sign-in. A reference Google button click was blocked by automatic approval review because inspection of the separate project did not authorize initiating its sign-in flow. No reference OAuth round trip was completed.

## Parity to carry forward

- Keep a single welcoming page with clear Google and Apple actions, matching VergeCommon's existing branding and conservation purpose.
- Use the same provider action for new and returning members. Return members to the co-op or invitation they were opening.
- Finish and test the dedicated VergeCommon provider setup, rather than reuse Viridis's project, secrets, user records or callbacks.
- Preserve existing username/password accounts and recovery access during migration.
- The owner confirmed email-link parity and authentication-only use of Supabase. Verified email identity, delivery/error states, rate limits, safe linking and deletion cleanup are now implemented behind the opt-in flag. The reference's hosted sender is not evidence of production-ready email delivery for VergeCommon; the dedicated project still needs SMTP and live acceptance.

## Remaining activation work

1. Google web client creation and the email return address are now saved. Configure the new client credentials privately in VergeCommon's Supabase project and server; finish audience/branding checks.
2. Owner enters and submits the prepared Apple client secret in the dedicated Supabase Apple form. The browser credential-entry handoff is still required.
3. Provision the server-only Supabase cleanup key and record Apple secret rotation before its actual expiry.
4. Deploy the already-tested broker integration behind the existing preview gate, preserving a compatible rollback and backup.
5. Complete real new/returning sign-in, cancellation, explicit linking, sign-out and controlled deletion acceptance for each provider. Public activation follows those results.

See [Supabase setup and validation receipt](../self-hosted/SUPABASE_SIGN_IN.md). This comparison does not change deployment status or establish live provider acceptance.
