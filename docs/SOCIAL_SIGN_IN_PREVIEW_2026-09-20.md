# Apple sign-in preview deployment — September 20, 2026

Apple sign-in is available for acceptance at `https://vergecommon.com/account?socialPreview=1`. Ordinary login retains its existing password flow; `VERGE_SOCIAL_PREVIEW=1` hides provider buttons there. Preview is a visibility control, not an authorization barrier. Provider endpoints still enforce browser proof, callback validation, session/account binding and same-origin confirmation.

## Deployment evidence

- Source: `6f7e0e9c2f6a29aaa95723273edfd4c19ba9a1a0`, branch `build/conversation-actions`, PR #3. No merge performed.
- Container image: `sha256:05225505df0fd9c8bb301ddd3a5d7aa573941c819f94ca019853cac1c91ed02d`.
- Dedicated host: VergeCommon droplet `601953476`; separate from Viridis Conservation.
- 239 Node tests and lint passed. The exact-commit [Community checks run](https://github.com/jdhart81/verge-common/actions/runs/35518473938) passed; the self-hosted Docker production build succeeded.
- Fresh isolated acceptance passed registration, co-op membership, evidence permissions, hosted MCP, native token scope, recovery and deletion. A previous repeat against reused synthetic data correctly hit account-attempt rate limits; production was untouched at that failure and the accepted run used fresh isolated data.
- Live preview checks passed: ordinary login unchanged; Apple visible in preview; unconfigured Google hidden; public API healthy; cross-origin initiation denied; Apple redirect uses the registered client/callback and protected proof cookie.
- Browser click from the real HTTPS preview reached Apple's page identifying VergeCommon. The user must still complete Apple authentication and the return/confirmation flow. No real provider login or real provider account deletion is claimed.
- Pre/post deployment backup and isolated restore passed. Post-deploy integrity was `ok`, with 6 workspaces, 3 verified evidence files and 0 account users at the receipt time. These counts are operational evidence, not adoption.
- Private server receipts: `/opt/vergecommon/deployments/20260920-social-preview-6f7e0e9/`. No credential contents belong in public receipts.

## Remaining activation steps

1. Owner completes a real Apple sign-in from the preview, saves the recovery code and confirms return to the same local account on a second sign-in. Link/unlink, recovery and provider-revocation acceptance remain to be checked with controlled accounts before public activation.
2. Google project creation is held for the owner's decision about the console-required billing association. The form offers existing billing accounts and no no-billing choice. No Google project, billing association, OAuth client or paid service was created.
3. Automatic approval review rejected an additional local recovery copy of the Apple private key and token-encryption configuration. The owner has been asked for specific approval; the copy was not made. The Apple key's original download is permission-restricted on the Mac, and server configuration remains private. Independent token-encryption-key recovery custody is not yet established.
4. Complete final provider-button branding review, then turn off preview mode only after real-provider acceptance. Native Google/Apple sign-in UI and App Store delivery remain separate work.

The preceding pre-social image is retained for incident reference. Once any provider-only account, identity or revocation entry exists, do not reopen that old authentication image against current data. Preserve the database and use a compatible image or forward repair; never restore an old backup to remove a failed deployment.

## Account design follow-up

The owner supplied a split-screen login reference. Release `77fafd83c4dd0f2b5117e0ae1cb358e565a3eb1b` deploys an original conservation landscape beside the form, rounded inputs/provider buttons, provider icons and responsive registration/recovery layouts. Unconfigured options are explicitly disabled; Google setup and real Apple acceptance remain pending. Signed-in members retain linked-provider management even while public provider buttons are in preview.

Image: `sha256:5182cfef01d348c4970c540c1ab8e9da4c2d1b5bed9dcdd4c957eb14187514e5`. The design passed 239 regression tests; the subsequent provider-management correction passed all 13 gateway tests. Lint, production build, fresh isolated acceptance, live smoke checks, and pre/post backup restore passed. Desktop and phone-width layouts were reviewed; the deployed HTTPS preview was visually verified. Receipts: `/opt/vergecommon/deployments/20260920-account-77fafd8/`. No provider credentials, billing choices, or public activation flags changed during this design update.
