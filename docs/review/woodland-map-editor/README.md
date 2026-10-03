# Woodland map editor verification — October 3, 2026

Local candidate based on PR #33 (`feat/woodland-dfm`). No production deployment.

| Check | Result |
| --- | --- |
| `npm test` | 315 passed, 0 failed (299 existing + 16 editor tests) |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `npm run build:selfhost` | Passed |
| `npm run build:public` | Passed |
| `npm run simulate:coop` | Passed: 110 successful commands, 26 expected denials |
| `tests/browser-woodland.mjs` | 11 passed; no runtime or console errors |

Browser test: installed Chrome with Playwright; localhost:3001; isolated,
disposable database; three synthetic accounts (two stewards, one member).
The Woodland flag was enabled only for the local test process. The fixture
co-op was archived at the end and the local server stopped.

The browser checks a flag-off client projection and the production manifest's
static import graph. The editor and DFM core are dynamically loaded, with no
editor/engine chunk requested when `data.features.woodland` is false. Its
member-owned treatment cuts the only corridor; the authoritative server stores
it as blocked with the same input checksum as the local failed preview.
A reviewed parcel recorded by the steward is included via the minimal,
flag-gated editor projection, while ordinary members still cannot see that
parcel's private record or consent references.

- [Desktop corridor layers](desktop-layers.png)
- [Desktop failed preview and loss geometry](desktop-preview.png)
- [390 px mobile](mobile-editor.png)
- [Browser result receipt](browser-results.json)

Screenshots depict synthetic equatorial geometry. OpenFreeMap tiles were
requested only after opt-in; the blue background is the fixture's ocean
location. Red dashed geometry is functional corridor loss, magenta dotted
geometry is the responsible treatment, and the parcel is a fine dashed
read-only reference. Colors also have text labels and distinct line patterns.

Unverified: real-device touch drawing, screen-reader/assistive-technology
participant testing, and independent field/ecological validation. The editor
retains the existing single-ring, local WGS84 boundary scope: holes and
antimeridian drawings are not supported. Unsaved drafts disappear on reload;
a private Landscape Package download is the retention path.
