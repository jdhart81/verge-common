# Interactive boundary editor — local candidate

September 14, 2026. Implemented in the authoritative `community/` application; no production deployment is included.

## Included

- Optional MapLibre GL JS 6.7.0 map with the OpenFreeMap Liberty style, navigation and explicitly requested device location.
- Click-to-add corners, draggable numbered corners, keyboard-accessible coordinate entry, corner selection/update/removal, fit-to-boundary and go-to-coordinate controls.
- Undo/redo, clear draft, bounded GeoJSON import, direct GeoJSON editing and private GeoJSON download.
- Reuse of a historical boundary as a new draft; explicit submission through the existing authenticated boundary-review workflow. Reuse resets the external-search checkbox and consent-reference form.
- Incomplete/crossing draft editing with invalid submissions disabled, shared server geometry validation and private boundary history.
- Optional basemap loading, preserved drafts during map errors, a 15-second loading notice, retry and map shutdown.
- Explicit Vite bundling of MapLibre's rendering worker. The default computed relative worker URL did not survive bundling; checking only style loading and HTML markers missed the absent tiles and boundary fill.

The editor does not call Nominatim, calculate surveyed area, detect overlap with other parcels, handle polygon holes or antimeridian crossings, or run background imagery jobs. See [monitoring limits and remaining work](MONITORING.md).

## Validation

- 53 automated tests passed, including five new boundary editor tests and existing boundary authorization, independent review, privacy, immutable history and imagery job tests.
- Type checking and production build passed. The build emits a separate MapLibre worker asset and loads mapping code on demand.
- 15 local Chrome browser checks passed: coordinate drawing; undo/redo; export round trip; rejected/valid imports; actual live map tile responses; dragging; map-click drawing; failed-map recovery; mobile overflow; private submitted saves; historical reuse and parcel switching; reload persistence; archived controls; and no browser runtime errors.
- Inspected desktop and 390-pixel mobile screenshots. The desktop screenshot confirms actual streets, land detail, polygon fill/outline and numbered corners, not just a loaded style or empty map container.
- New editor/helper/browser-test files pass targeted lint. Full-project lint remains blocked by existing typing, accessibility and React findings in other components and the existing monitoring board.

The browser run used synthetic private parcels in a local co-op, then archived that fixture. It did not alter the hosted application, real parcels, accounts, review decisions or external records. Existing multi-user domain tests cover reviewer separation; the browser test uses the local development identity.

## Repeat the browser check

Use Node 22.13+, a running local app with its local database migrations applied, Playwright, and installed Google Chrome. From the repository root:

```sh
VERGE_TEST_ORIGIN=http://localhost:3001 node tests/browser-boundary.mjs
```

The test accepts only `http://localhost:3000` or `http://localhost:3001`. If Playwright is provided by an external tool runtime, set `VERGE_PLAYWRIGHT_MODULE` to its entry point. Outputs go to `outputs/map-editor-review/`, including `browser-results.json`, `parcel-map.png`, `desktop-editor.png` and `mobile-editor.png`.

Live basemap checks need internet access. The failure-recovery check deliberately blocks the style request. Each run creates and archives a local fixture and therefore consumes one of the current per-owner co-op slots; use a disposable local database for repeated CI runs.

## Next work

1. Address search with explicit consent, provider-wide rate limiting and a cache.
2. Area and overlap checks with clear distinction between drawn estimates and surveyed boundaries.
3. Draft recovery across navigation, and accessibility/touch testing with actual participants.
4. Authenticated imagery retrieval validation and supported job orchestration for a consenting pilot parcel.
5. Resolve the existing full-project lint backlog before a broader release.

These remain separate from independent ecological validation, carbon certification, hosted publication and native distribution.

## Woodland corridor and treatment editor

Woodland projects now have a separate typed map editor; the Polygon-only parcel
boundary editor keeps its existing controls and workflow. See
[Woodland drawing and preview](WOODLAND.md#drawing-layers-and-treatment-units).
Polygon validation continues to use `validateBoundary`. Boundary polygons and
woodland roads share the unchanged edge-crossing/touching predicate in
`lib/geometry.mjs`. No new map or analysis dependency is added.

Stewards draw core areas, retained corridors, roads, open water and crossings.
Members draw treatment units over read-only reviewed corridor layers and
reviewed parcel boundaries. Feature selection, coordinate add/update/remove,
delete, undo and redo all have keyboard paths. On desktop, feature properties
and vertices sit beside the optional map; the layout stacks at mobile widths.
Labels, a legend, distinct line patterns and visible focus accompany colors.

The local corridor preview dynamically loads the engine, names responsible
units and draws lost corridor with a red dashed outline. Submitting always
uses the existing authoritative server command. An existing client import of
server command code was split into pure budget arithmetic and activity-path
helpers so neither the Woodland editor nor the DFM engine is fetched when the
client flag is off. The preview checksum test and production bundle/browser
checks verify these boundaries.

To repeat the Woodland browser check, use a **disposable** local database and a
self-hosted build (Node 22.13+). Enable `VERGE_WOODLAND_DFM=1` only on that local
test process. The test accepts localhost ports 3000 and 3001 and creates three
synthetic accounts plus an archived fixture co-op:

```sh
npm run build:selfhost
VERGE_DATA_DIR=/tmp/woodland-test-db VERGE_ORIGIN=http://localhost:3001 \
  PORT=3001 VERGE_WOODLAND_DFM=1 npm run start:selfhost
VERGE_TEST_ORIGIN=http://localhost:3001 node tests/browser-woodland.mjs
```

If Playwright is supplied by an external runtime, set `VERGE_PLAYWRIGHT_MODULE`
to its entry point. Chrome and internet access for opted-in OpenFreeMap tiles
are needed. No production configuration, deployment or hosted account is used.
Desktop layer/preview and 390px mobile screenshots and the browser results are
written to `outputs/woodland-editor-review/`. Real-device touch drawing and
assistive-technology review remain unverified; automated keyboard and mobile
layout checks do not substitute for those participant checks.

The October 3, 2026 candidate passes all 315 unit tests, full-project lint,
typechecking, standard/self-hosted/public builds, co-op simulation and 11 local
Woodland browser checks with no runtime or console errors. See the
[verification receipt and screenshots](review/woodland-map-editor/README.md).
The September boundary-editor validation notes above are historical.
