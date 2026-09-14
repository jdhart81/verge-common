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
