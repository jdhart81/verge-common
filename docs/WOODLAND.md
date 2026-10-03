# Woodland (DFM) projects

Off by default. Set `VERGE_WOODLAND_DFM=1` on the server to enable it. With the flag off, woodland commands return 404, the project type is hidden, and the MCP tool is not registered.

Woodland projects keep retained corridors connected across working woodlots as harvests are planned. The corridor check is `@viridis/dfm-core` from the open-source [Dendritic Forest Management](https://github.com/jdhart81/hdfm-framework) repository (MIT). It is vendored as `vendor/viridis-dfm-core-0.1.0.tgz` until the package is published to npm.

## Workflow

1. Create a project of type **Woodland (DFM corridors)**.
2. A steward uploads corridor layers as a DFM Landscape Package: core areas (old-growth candidates, riparian cores, reserves), retained habitat, roads, open water, road crossings, plus the minimum corridor width and its source. Another steward reviews them. Only reviewed layers are used.
3. Any member submits a treatment plan: GeoJSON polygons with `dfm_id` and `intensity`. The server runs the corridor check against the current reviewed layers and the co-op's parcel consents.
   - **pass**: the plan is `submitted` and waits for review by a steward other than its author.
   - **fail** or **incomplete**: the plan is stored as `blocked` with the reasons. It cannot be reviewed.
4. A failed (not incomplete) plan can proceed only through a recorded override vote. A steward opens the vote with a reason. The electorate is frozen to active members, the quorum is two thirds, and the plan needs approval from a majority of the electorate. An adopted override returns the plan to `submitted`, and it still needs two-person review.
5. If the layers change after a plan was checked, that plan must be submitted again before review.

Corridor sections count as **committed** only on parcels whose current consent has been reviewed and matches the reviewed boundary. Elsewhere they are **proposed**.

## What the check establishes

Structural connectivity at a minimum width: whether core areas stay linked by retained habitat after road surfaces, open water and the proposed units are removed. It does not establish species movement, genetic viability, regulatory compliance or old-growth condition. Calling a stand `old-growth-verified` requires an evidence reference; otherwise it is reported as a candidate.

## Limits

- Layers: 90 KB per version, 400 features per layer, 5 versions with geometry per project (older versions keep their record but drop their geometry).
- Plans: 50 treatment units and 40 KB each; 40 plans per project.
- The check runs synchronously inside the command (typically well under a second for woodlot-scale layers).

## Drawing layers and treatment units

The Woodland tab is loaded only when the server exposes `features.woodland`.
Stewards can draw corridor layers in **Draw corridor layers**; members can draw
polygons in **Draw treatment plan** after another steward reviews the layers.
The layer editor starts with the current reviewed version, or the latest
submitted version if there is no reviewed version. Saving always creates a new
submitted version through the existing `save_woodland_layers` command.

Choose a layer, create a feature, name it, and add coordinates or enable drawing
by clicking on the optional map. Polygon rings close automatically; roads use
LineStrings and crossings use Points. Select a feature and vertex to update or
remove coordinates, drag its numbered map vertices, delete the feature, or use
undo/redo. Map fit includes the reviewed parcel boundary references. In plan mode
corridor layers and parcels are read-only. Each layer has a text label and its
own line pattern, and crossings use a ring symbol.

New and imported draft features have stable UUID `dfm_id` values. Core classes
are candidates, riparian cores or reserves; the editor does not offer verified
old growth. Crossings default to assumed passage. Treatment intensity can be
free text; corridor permission requires one of the engine's `LIGHT_INTENSITIES`
and a reason. Invalid geometry and missing properties are listed with the
feature name/ID and prevent submission. Validation shares the boundary editor's
WGS84, self-crossing, closure and 200-corner rules, with 2–200 vertices for roads
and one coordinate for crossings. Polygon holes and antimeridian drawings are
outside this editor's scope.

**Preview corridor check** runs `@viridis/dfm-core` locally, loaded on demand. It
reports pass/fail/incomplete, reasons, warnings, responsible unit names/IDs and
the complete input checksum. Lost functional corridor geometry appears in red
with a dashed outline. The shared `woodlandCheckInput` helper cleans treatment
properties exactly as the server does and uses the same reviewed layers,
parameters and current parcel-consent snapshots. The flag-gated member API adds
only reviewed parcel geometry, parcel IDs and derived consent status for these
checks; private parcel records, names and consent references keep their existing
visibility rules, and MCP projections are unchanged. Preview is advisory: **Check
and submit plan** always calls `submit_treatment_plan`, which checks the inputs
again on the server. A failed or incomplete check is still stored as blocked.
Changing reviewed layers or consents before submission can change that result.

Landscape Package and GeoJSON plan uploads remain alternatives to drawing: they
open editable drafts using the same validity and size gates. **Download
Landscape Package** exports the current draft with `toLandscapePackage`,
including parcel references and parameters; an export may contain an incomplete
draft, so check its problems before sharing or importing it elsewhere.

The draft meter displays compact UTF-8 JSON bytes against 90,000 for layers or
40,000 for treatment units, plus the complete request envelope against the strict
100,000-byte ceiling. It also shows 400 features per corridor layer and 50 units
per plan. Oversized drafts stay editable but cannot be sent.

No map or tile request occurs until **Load background map** is explicitly
selected. The consent notice explains the area disclosure to OpenFreeMap.
Coordinate editing and private file download work without a basemap. No
geocoding is performed. Drafts and undo history live only in component state;
reload/navigation can discard unsaved work. Download a private draft to retain
it. Production configuration and the default-off flag are unchanged.

## Editor verification

`tests/woodland-editor.test.mjs` covers M1–M9: typed geometry, shared boundary
validation, UUID/default/property rules, exact byte/count limits, input cleaning,
consent shape, byte-identical persisted fixture results, gated dynamic loading,
state-only drafts, and keyboard control/legend structure. Existing
`tests/woodland.test.mjs` retains authoritative checks and independent review.

`tests/browser-woodland.mjs` uses three synthetic accounts on a disposable local
self-hosted instance. It covers drawing and coordinate controls, keyboard-only
crossing entry, map clicks/dragging, invalid-save prevention, independent steward
review, a failed named-unit preview, the blocked server plan with the identical
checksum, file export/import, over-limit prevention, opted-in basemap requests,
flag-off client projection and bundle separation, 390px overflow and browser
errors. Outputs: `outputs/woodland-editor-review/`.
