# Woodland (DFM) projects

Off by default. Set `VERGE_WOODLAND_DFM=1` on the server to enable it. With the flag off, woodland commands and analyses return 404, the project type is hidden, the analysis worker is not started, and the MCP tools are not registered.

Agents with an `mcp:read` token can use `check_woodland_plan` (the corridor check on proposed units) and `analyze_woodland_spine` (one spine analysis); both are read-only and follow the same membership and privacy rules as the website.

Woodland projects keep retained corridors connected across working woodlots as harvests are planned, and build the old-growth spine woodlot by woodlot. The engine is `@viridis/dfm-core` from the open-source [Dendritic Forest Management](https://github.com/jdhart81/hdfm-framework) repository (MIT), described at [dendriticforest.com](https://dendriticforest.com/). It is vendored as `vendor/viridis-dfm-core-0.2.0.tgz`, byte-identical to `npm pack` of `packages/dfm-core` at 0.2.0 (a test pins its SHA-256), until the package is published to npm. Its corridor check, `dfm-connectivity-0.1.0`, gives the same results as dfm-core 0.1.0.

The public page [/woodland/](https://vergecommon.com/woodland/) explains woodland projects to visitors and says whether they are open on the service; dendriticforest.com links to it.

## Workflow

1. Create a project of type **Woodland (DFM corridors)**.
2. A steward uploads corridor layers as a DFM Landscape Package: core areas (old-growth candidates, riparian cores, reserves), retained habitat, roads, open water, road crossings, plus the minimum corridor width and its source. Another steward reviews them. Only reviewed layers are used.
3. Any member submits a treatment plan: GeoJSON polygons with `dfm_id` and `intensity`. The server runs the corridor check against the current reviewed layers and the co-op's parcel consents.
   - **pass**: the plan is `submitted` and waits for review by a steward other than its author.
   - **fail** or **incomplete**: the plan is stored as `blocked` with the reasons. It cannot be reviewed.
4. A failed (not incomplete) plan can proceed only through a recorded override vote. A steward opens the vote with a reason. The electorate is frozen to active members, the quorum is two thirds, and the plan needs approval from a majority of the electorate. An adopted override returns the plan to `submitted`, and it still needs two-person review.
5. If the layers change after a plan was checked, that plan must be submitted again before review.

Corridor sections count as **committed** only on parcels whose current consent has been reviewed and matches the reviewed boundary. Elsewhere they are **proposed**.

## The old-growth spine

The spine is the dendritic network of retained forest along a landscape's streams, valleys and ridges: mapped whole, then committed woodlot by woodlot as holders consent, aging toward old growth while the woods around it are worked. It is optional; a project without spine lines works exactly as before.

1. **Lines.** In **Draw corridor layers**, a steward adds `streams` (lines with a Strahler `stream_order` from 1 to 12) and `connectors` (ridge, valley or saddle links that close loops), or imports them in a Landscape Package. Optional settings, each with its source: corridor width by stream order (never narrower for a larger stream, never below the minimum), the link width, the year stand ages were recorded, the old-growth age threshold, milestone years, core temperatures and a warming target.
2. **Draft.** **Draft spine corridors** runs `deriveSpine` in the browser. The drafted corridors replace earlier ones marked `spine` in **Retained corridors**; other retained features stay, and a corridor keeps the name and stand age given to it under the same ID. Record stand ages on corridors and cores, check the draft against the ground, then submit the layers. They take effect only after another steward reviews them (W1). Spine lines are saved only when the engine can draft them (WS5).
3. **Analyze.** The **Old-growth spine** section runs four read-only analyses on the current reviewed layers, in the server's analysis worker:
   - **Test the network** (`spineNetwork`): which core pairs the spine links, its loops, and where one disturbance up to the stated width would still cut a link (single points of failure, verified or not at nominal width). Robustness is reported only from a completed search, never assumed.
   - **Project the years ahead** (`projectSpine`): at each milestone, links through committed forest and through forest at old-growth age. A woodlot counts from the UTC year its current consent was reviewed; stand ages recorded as of the stand-age year (default: the year the layers were saved) are rolled forward to the current year.
   - **Find climate routes** (`climateRoutes`): for each core, the coolest core it can reach through links that hold, flagged when short of the warming target or unknown.
   - **Find the next woodlots** (`buildOutFrontier`): woodlots without current consent whose spine touches the committed spine, the links each would complete if it alone joined, and its direction. To commit one, record its holder's pooling consent and have another steward review it.
   Optionally apply a treatment plan to see its effect.
4. **Plan the build-out.** A woodlot without consent can carry a **planned join year** (`plan_parcel_join`), set by whoever recorded it or a steward. It is a projection assumption only: it never counts as consent, and only a year after the current one is used.

Analyses are structural. They do not establish species movement, genetic viability, old-growth condition or regulatory compliance, and projections predict no fire, storm or new road.

### Privacy (WS8)

Analyses need active membership, the woodland flag and a same-origin request. Network and climate results hold only reviewed-layer data, which every member already sees. Outlook and next-woodlot results name woodlots: stewards see all of them; any other member sees the woodlots they recorded, plus counts, and messages naming anyone else's woodlot are reworded. No parcel geometry is ever part of a result. Planned join years live on the parcel record, which only its recorder and stewards see.

### Analysis worker (WS7)

The engine's network, projection, climate and build-out functions take seconds on a watershed and block the thread they run on. The self-hosted gateway therefore registers a worker-thread runner (`self-hosted/woodland-analysis.mjs`) when `VERGE_WOODLAND_DFM=1`: one analysis at a time, two queued at most (a full queue answers 503 at once), and a deadline of `VERGE_WOODLAND_ANALYSIS_TIMEOUT_MS` (default 25,000 ms) from the moment a request is queued, so every answer arrives before the gateway's 30-second proxy limit. An analysis that reaches its deadline answers 504 and its worker is replaced. Results are cached in memory by exact input (32 entries), then reduced for each viewer. Each account may run 12 analyses per 10 minutes. `vinext dev` runs analyses inline; a production build without the runner refuses them.

## What the check establishes

Structural connectivity at a minimum width: whether core areas stay linked by retained habitat after road surfaces, open water and the proposed units are removed. It does not establish species movement, genetic viability, regulatory compliance or old-growth condition. Calling a stand `old-growth-verified` requires an evidence reference; otherwise it is reported as a candidate.

## Exchanging packages and reproducing results (WS12)

The corridor check's input is the Landscape Package's canonical form: every package layer is present (`boundary` is empty, because co-op parcels stand in for it), spine layers only when they hold features, and treatment units rounded as stored. A steward's **Download check inputs** on a plan gives the exact package the plan was checked against, so the open-source engine reproduces its result and input checksum (`checkConnectivity(fromLandscapePackage(pkg))`) while the co-op's woodlot consents are unchanged.

Packages from the DFM mapping workspace or other tools import into the editor: non-UUID IDs become UUIDs and the original ID becomes the feature's name when it has none; spine lines keep their link to the corridors drafted from them; the planning `boundary` layer is not kept. `tests/woodland-interop.test.mjs` checks a package exported by the workspace: the same status, lost links and responsible units by name, and areas within 0.01% (records are stored at 1e-7 degrees, about 1 cm).

## Erasure and rollback

When a member deletes their account, their treatment plans go with them, because each describes work on their land; a plan other members voted on keeps only a pseudonymous structural record (status and vote), without its name, units or mapped result. Layer versions are shared co-op maps and stay, without the author's notes; an override reason goes with the steward who wrote it. Writers older than v0.10.0 do not apply these rules: `self-hosted/rollback-check.mjs` refuses a rollback once woodland records or planned join years exist.

## Limits

- Layers: 90 KB per version after rounding, 400 features per layer, 5 versions with geometry per project (older versions keep their record but drop their geometry). Drafted spine corridors and spine lines may have up to 1,000 vertices; drawn features keep the 200-vertex limit. The DFM watershed on dendriticforest.com (2.8 × 2.6 km, 14 lines, 4 cores) uses about 79 KB.
- Plans: 50 treatment units and 40 KB each; 40 plans per project.
- The corridor check runs synchronously inside the command (typically well under a second for woodlot-scale layers). Spine analyses run in the analysis worker; on the watershed above each takes 1–6 seconds. Analyze one watershed at a time.

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
undo/redo. Map fit includes reviewed parcel boundaries visible to the viewer. In plan mode
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

**Preview corridor check** runs `@viridis/dfm-core` locally, loaded on demand,
using reviewed woodland layers and treatment units without parcel inputs. It
reports pass/fail/incomplete, reasons, warnings and responsible unit names/IDs;
lost functional corridor geometry appears in red with a dashed outline. Status,
lost links, pinch points and reasons match the server for the same layers and
units. Consent areas and the full input checksum are computed by the co-op on
submit. Private parcel boundaries are never projected to other members: reference
boundaries and downloaded packages include only parcels visible to the viewer
under the existing owner-or-steward rule.

**Preview with co-op inputs** calls the read-only `POST /api/woodland-preview`
endpoint. It requires active membership, the Woodland flag and a same-origin
request, enforces the existing treatment/body limits, and runs
`previewTreatmentCheck` on full server state. It returns check statistics and a
checksum, with no geometry, private parcel records, state changes or audit entry.
The server preview checksum is shown alongside the stored plan checksum for
comparison. **Check and submit plan** still calls `submit_treatment_plan` and
checks all inputs again on the server; failed or incomplete plans are blocked.
Changes to reviewed layers or consents before submission can change the checksum
and result. MCP projections and command semantics are unchanged.

Landscape Package and GeoJSON plan uploads remain alternatives to drawing: they
open editable drafts using the same validity and size gates. **Download
Landscape Package** exports the current draft with `toLandscapePackage`,
including authorized parcel references and parameters; an export may contain an incomplete
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
review, a parcel-free failed named-unit preview, the geometry-free full-state
server preview and blocked plan with the identical server checksum, file export/import, over-limit prevention, opted-in basemap requests,
flag-off client projection and bundle separation, 390px overflow and browser
errors. `tests/woodland-preview.test.mjs` covers membership/flag checks, plan
limits, non-mutation, privacy, structural local/server equality, and server
preview/stored checksum equality with private reviewed consents. Outputs: `outputs/woodland-editor-review/`.
