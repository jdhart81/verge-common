# VergeCommon — Shared Canopy

A logo concept for VergeCommon: adjoining land parcels form a shared tree canopy, with a branching trunk connecting them. It represents neighbors caring for a connected landscape.

The wordmark uses the canonical VergeCommon spelling. The forest and leaf greens are drawn from the existing website palette (`#17513b` and `#6d9d44`).

- `vergecommon-logo.png`: generated horizontal logo with an alpha channel, suitable for previewing on light backgrounds.
- `prompt.txt`: complete generation prompt.
- Creation method: built-in image generation; no CLI/API fallback.

Approved for use across the website and app. These are raster masters, not editable vectors. Keep these originals unchanged and create separate versions for future revisions.

## Production adaptations

- `app-icon-master.png`: square icon adapted with built-in image generation using the approved logo as reference; the wordmark is removed and the tree sits on an opaque light background.
- `app-icon-prompt.txt`: full adaptation prompt.
- Website headers and footers share `components/brand-logo.tsx` and `/brand/shared-canopy-logo-v1.png`; account pages use the same asset.
- Browser, Apple touch, installable web app and native iOS icons are resized exports of the square master. Versioned manifest/icon URLs request the updated identity. Native AppIcon is 1024 × 1024 with no alpha channel.
- Native Discover and sign-in show the approved horizontal wordmark on a light backing for dark-mode readability. `BrandLogo.imageset` holds the original asset.

The account page permits only the exact same-origin logo and the local icon directory through its image content-security policy. Scripts and other resource types retain their existing restrictions.

Validated with lint, TypeScript checks, self-hosted/public builds, an unsigned iOS Simulator build, gateway regression checks, and desktop/390px browser inspection. Native App Store distribution is a separate release step.
