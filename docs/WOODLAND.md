# Woodland (DFM) projects

Off by default. Set `VERGE_WOODLAND_DFM=1` on the server to enable it. With the flag off, woodland commands and analyses return 404, the project type is hidden, the analysis worker is not started, and the MCP tools are not registered.

Map the old-growth corridor that runs through your woods, then plan harvests that keep it connected while it ages toward old growth. That corridor is the [old-growth spine](#the-old-growth-spine), and it is the core of a woodland project: every harvest plan is checked against it. Structural connectivity only; not a claim about species movement, genetics, regulatory compliance or old-growth condition. Age is reported, never condition.

Agents with an `mcp:read` token can use `check_woodland_plan` (the corridor check on proposed units) and `analyze_woodland_spine` (one spine analysis); both are read-only and follow the same membership and privacy rules as the website.

Woodland projects build the old-growth spine woodlot by woodlot and keep its retained corridors connected across working woodlots as harvests are planned. The engine is `@viridis/dfm-core` from the open-source [Dendritic Forest Management](https://github.com/jdhart81/hdfm-framework) repository (MIT), described at [dendriticforest.com](https://dendriticforest.com/). It is vendored as `vendor/viridis-dfm-core-0.3.0.tgz`, the `npm pack` of `packages/dfm-core` at 0.3.0 (a test pins its SHA-256), until the package is published to npm. 0.3.0 adds [native old growth](#native-old-growth-not-plantations): stand origin, native composition and native-only planting. Without those records its results are the ones 0.2.0 gave, apart from the engine names (`dfm-connectivity-0.3.0`, `dfm-spine-0.3.0`, `dfm-outlook-0.3.0`); `tests/woodland-native.test.mjs` checks every analysis and the corridor check against results recorded with 0.2.0, and a plan stored with 0.1.0 still reproduces. The corridor check gives the same results as 0.1.0 for every input without the stepping-stone setting, which woodland projects do not use, apart from four upkeep treatments 0.2.0 added (below). The engine also runs in prairie, savanna and flat country (stepping stones, flat-land links, exits); woodland projects offer the forest link kinds, and an upload names anything it leaves out.

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

## Corridor progress

The Woodland tab opens on corridor progress. The aim is one old-growth corridor that branches along the streams, valleys and ridges and is joined one woodlot at a time; each woodlot is a node that connects when its owner agrees. The view shows five ordered steps with the next one marked:

1. **Map the corridor:** a reviewed layers version exists.
2. **Trace the branches:** the layers hold streams or valley, ridge or saddle links.
3. **Record the woodlots:** at least one woodlot has a reviewed boundary.
4. **Owners join:** at least one woodlot has the owner's current reviewed consent.
5. **The corridor is whole:** every recorded woodlot the mapped corridor touches has joined.

Below the steps a member sees their own woodlots, with what each needs next and whether the mapped corridor touches it. Stewards see every woodlot. Any other member sees four counts for the rest of the co-op and nothing else about a neighbour's woodlot.

Progress is derived for each view from the reviewed layers, the parcels, their latest boundary and their latest consent. Nothing is stored and no analysis runs. "Joined" is the same test the engine uses for a committed woodlot. "Touches" means only that a reviewed boundary meets a retained corridor or core area on the maps; it does not establish species movement, genetics, regulatory compliance or old-growth condition. The rules are CP1 to CP6 in `lib/woodland-progress.mjs`, tested in `tests/woodland-progress.test.mjs`.

## The old-growth spine

The spine is the dendritic network of retained forest along a landscape's streams, valleys and ridges: mapped whole, then committed woodlot by woodlot as holders consent, aging toward old growth while the woods around it are worked. It is optional; a project without spine lines works exactly as before.

1. **Lines.** In **Draw corridor layers**, a steward adds `streams` (lines with a Strahler `stream_order` from 1 to 12) and `connectors` (ridge, valley or saddle links that close loops), or imports them in a Landscape Package. Optional settings, each with its source: corridor width by stream order (never narrower for a larger stream, never below the minimum), the link width, the year stand ages were recorded, the old-growth age threshold, milestone years, core temperatures and a warming target.
2. **Draft.** **Draft spine corridors** runs `deriveSpine` in the browser. The drafted corridors replace earlier ones marked `spine` in **Retained corridors**; other retained features stay, and a corridor keeps the name, stand age and origin and native-species records given to it under the same ID. Record stand ages and how each stand was established on corridors and cores, check the draft against the ground, then submit the layers. They take effect only after another steward reviews them (W1). Spine lines are saved only when the engine can draft them (WS5).
3. **Analyze.** The **Old-growth spine** section runs four read-only analyses on the current reviewed layers, in the server's analysis worker:
   - **Test the network** (`spineNetwork`): which core pairs the spine links, its loops, and where one disturbance up to the stated width would still cut a link (single points of failure, verified or not at nominal width). Robustness is reported only from a completed search, never assumed.
   - **Project the years ahead** (`projectSpine`): at each milestone, links through committed forest and through forest at old-growth age. A woodlot counts from the UTC year its current consent was reviewed; stand ages recorded as of the stand-age year (default: the year the layers were saved) are rolled forward to the current year.
   - **Find climate routes** (`climateRoutes`): for each core, the coolest core it can reach through links that hold, flagged when short of the warming target or unknown.
   - **Find the next woodlots** (`buildOutFrontier`): woodlots without current consent whose spine touches the committed spine, the links each would complete if it alone joined, and its direction. To commit one, record its holder's pooling consent and have another steward review it. Other members see this as **See the committed spine**: the co-op total only (see Privacy).
   Optionally apply a treatment plan to see its effect. Other members apply plans to the network and climate routes only (see Privacy).
4. **Plan the build-out.** A woodlot without consent can carry a **planned join year** (`plan_parcel_join`), set by whoever recorded it or a steward. It is a projection assumption only: it never counts as consent, and only a year after the current one is used.

Analyses are structural. They do not establish species movement, genetic viability, old-growth condition or regulatory compliance, and projections predict no fire, storm or new road.

### Native old growth, not plantations

The spine's aim is old growth of the place's own species. A plantation does not become old growth by standing long enough, and neither does a stand made up mostly of introduced species. Since dfm-core 0.3.0 a woodland project records how each stand was established and what it is made of, and the engine uses that in the old-growth projection and in the corridor check. All of it is optional and recorded as stated, each value with its source; the software does not identify species or survey a stand.

On a retained corridor or core area, under **Origin and native species**:

- **How the stand was established** (`stand_origin`, with `origin_source`): naturally regenerating, planted or seeded, or plantation (one or two species, even-aged, regularly spaced), as defined in FAO's Global Forest Resources Assessment. A plantation is never counted at old-growth age, whatever its recorded age. A planted stand that is not a plantation counts by its recorded age.
- **Never plowed or clear-cut** (`remnant`, with `remnant_source`): a remnant counts at old-growth age in every projection year. A stand cannot be both a remnant and a plantation.
- **Share in native species** (`native_share` from 0 to 1, with `composition_source`).

In the layer settings, under **Native old growth**:

- **Minimum native share** (`nativeShareMin`, with `nativeShareSource`): once set, a stand counts at old-growth age only where it records a share at or above the minimum. A stand without a recorded share never counts.
- **Native-status source for corridor planting** (`nativeStatusSource`, such as a state flora): the native-only planting policy. Once recorded, every restoration planting inside a corridor or core must list its species.

On a treatment unit that is a corridor-permitted `restoration-planting`, **Species planted** lists each species as native or not, with a native-status source. The planting stays permitted only when every species is native and a source is recorded, on the unit or in the layer settings. Otherwise the check treats it like any other unit: it removes the habitat it covers, the check names it and says why, and a plan that breaks a link is blocked. Without the policy setting, a planting that lists no species is checked as it was before 0.3.0; record a native-status source to require a species list for every corridor planting.

**Project the years ahead** then also shows, per milestone, how much committed forest is plantation and how much is below the minimum native share, and the panel says what the reviewed layers record. None of this changes whether a link holds today: origin and composition are read only by the projection, and the species list only by the corridor check. Age and origin are reported; old-growth condition is never claimed.

Layers, settings and units without these records are stored exactly as before and give the same results and checksums.

### Privacy (WS8)

Analyses need active membership, the woodland flag and a same-origin request. Network and climate results hold only reviewed-layer data, which every member already sees. Stewards see every woodlot in outlook and next-woodlot results. Any other member:

- gets an outlook projected with planned join years only for woodlots they recorded (someone else's planned year is an assumption on a record they cannot see, and a changed count would reveal it), naming only their woodlots, plus counts;
- gets the build-out as the co-op total (share of the spine committed, woodlot count, links held), without per-woodlot rows: a woodlot's place on that list, and the links it would complete, would show where neighbours have or have not consented;
- sees messages naming another member's woodlot reworded as "another woodlot"; core, line and unit names, which every member sees in the reviewed layers, are left alone;
- cannot apply a treatment plan to the outlook or build-out (403). Those results depend on woodlot consents, so a member could otherwise draw a unit anywhere and read, from the change in committed area, whether the land under it is committed. Network and climate results never use consents and take any plan.

Every member does see the co-op-level progress: the share of the spine committed and which links between core areas are held through committed forest. Where a link has a single route, that shows the woodlots along it have consented; this is the intended shared measure of the spine, and finer detail stays with stewards. No parcel geometry is ever part of a result. Planned join years live on the parcel record, which only its recorder and stewards see.

### Analysis worker (WS7)

The engine's network, projection, climate and build-out functions, and on a watershed the corridor check itself, take seconds and block the thread they run on. The self-hosted gateway therefore registers a worker-thread runner (`self-hosted/woodland-analysis.mjs`) when `VERGE_WOODLAND_DFM=1`, and all engine work on the server runs there: spine analyses, plan previews (browser and MCP), and the check on a submitted plan. For a submission the server first applies the command with the check deferred, so every refusal (name, period, units, plan limit, membership, archived co-op) is answered at no engine cost; then it checks the command's exact input in the worker and applies the command with that result, which is used only if its input checksum equals the input the command builds. A mismatch (the co-op changed in between) is refused with 409, never checked on the request thread.

- One job at a time, two queued at most: a full queue answers 503 at once.
- One job per account at a time: a second concurrent request from the same account answers 429.
- A deadline of `VERGE_WOODLAND_ANALYSIS_TIMEOUT_MS` (default 25,000 ms; clamped to 5,000–25,000) from the moment a request is queued, so every answer arrives before the gateway's 30-second proxy limit. A job that reaches its deadline answers 504 and its worker is replaced; a worker that cannot start answers 503.
- Analysis results are cached in memory by exact input (32 entries), then reduced for each viewer.
- Each account may run 12 analyses and 30 plan previews per 10 minutes, shared between the browser and MCP agents, and at most 60 worker jobs per 10 minutes whatever asked for them (plan submissions included). Agent commands share the browser's command budget (40 a minute, 400 an hour).

`vinext dev` runs engine work inline; a production build without the runner refuses it (503).

## Recreation along the corridor

By default the corridor is natural and ages toward old growth. A co-op can adopt a shared recreation use on a mapped stretch of it: a walking trail, a bike trail, disc golf or another use. Nothing changes for a project that adopts none (RC1). The rules are RC1 to RC9 in `lib/woodland-recreation.mjs`.

1. **Propose.** Any member draws the route on the corridor map, or uploads it as GeoJSON, in **Uses and facts along the corridor**: lines for trails, each with the width of ground cleared of trees (0 when only a tread is worn under standing trees), and polygons for cleared ground such as fairways. They name it, choose its kind and say whether it is meant for members or the public.
2. **The corridor comes first.** The cleared ground is removed from retained habitat and the corridor check runs on what is left, against the current reviewed layers, the co-op's consents and every use already adopted. If any link between core areas is lost or pinched below the minimum width, or the check is incomplete, the use is stored as blocked. There is no override vote for recreation: route it again. In practice a clearing down the middle of a corridor splits it into two strips that are each too narrow, and a clearing across a corridor cuts it; a trail along the corridor's edge, or a tread under standing trees, keeps it whole.
3. **Each holder agrees.** The use needs the recorded agreement of whoever recorded each woodlot it crosses, with an attestation that they may agree. Pooling consent is not agreement to people on the land. One refusal ends the proposal. A route that crosses no recorded woodlot with a reviewed boundary cannot be proposed.
4. **The co-op votes.** Once every holder has agreed, a steward opens a vote. The electorate is frozen to active members, the quorum is two thirds, and the use is adopted only with approval from a majority of the electorate. If the reviewed layers changed since the use was checked, it must be proposed again.
5. **An adopted use counts everywhere.** Its cleared ground is excluded from habitat in every later harvest-plan check and spine analysis, so it never counts as committed forest or toward old-growth age. A plan checked with adopted uses records the cleared ground it was checked with, and **Download check inputs** carries it in the package's `water` layer, marked `excluded: "recreation-clearing"`, so the stored result still reproduces.
6. **It can always end.** A steward, or the holder of any woodlot the use crosses, ends an adopted use, and the stretch is natural corridor again. Withdrawing a woodlot, or deleting the account that recorded it, ends the uses that cross it. A proposer can withdraw a proposal.

**Privacy.** Every member sees the whole route and the corridor result, because they vote on it. Which woodlots it crosses is shown to stewards and, for their own woodlots, to the members who recorded them; everyone else sees how many holders must agree and how many have. No parcel geometry is part of a use. When a member deletes their account, a use nobody else agreed to or voted on goes with them; one others acted on stays, without its description.

**What it does not establish.** A recorded use is the co-op's decision and the holders' agreement. It is not a right of way or an easement, does not open land to the public, and says nothing about liability, insurance, accessibility, trail safety, wetlands or any permit. The cleared width is as recorded; nobody measures it. The check is the same structural one as for harvests: it does not show that wildlife tolerates a trail.

**Limits.** 20 uses in progress or adopted per project, 20 features and 20 KB per use, lines of up to 500 points, cleared widths up to 30 m. **The corridor map.** **Show the corridor map** in this section draws every proposed or in-effect use and fact in orange over the reviewed corridor layers and the viewer's own woodlots. A member draws a trail line or an area on it (click for each point, drag a point to move it, finish the shape) and proposes or records the drawing; a route can still be uploaded as GeoJSON or downloaded. The map loads only when opened. It does not yet highlight the links a blocked proposal would break; the card lists them. Agents cannot propose, agree to or vote on a use, or record a fact.

`tests/woodland-recreation.test.mjs` covers RC1 to RC9 on the watershed co-op.

## Rights-of-way and blowdown

A corridor is shaped by three kinds of record: **treatments** a member plans (above), **uses** the co-op decides on (recreation) and **facts** it has to live with. Facts are CF1 to CF6 in `lib/woodland-recreation.mjs`, and they share the same section of the Woodland tab.

- **Recorded, not decided (CF1).** A steward records a right-of-way that exists on the land (a power line, a road or access easement) or a blowdown that has happened, with its source: a deed, a utility map, a field visit. It takes effect only after another steward reviews it. Nobody votes on a fact, and no holder is asked to agree to it.
- **Never blocked (CF2).** A right-of-way is checked against the corridor so the co-op sees which links it breaks or pinches, and it is recorded either way, because the map must show the ground as it is. Where a line breaks a link, a new loop such as a saddle or ridge link gives those core areas another route. On the test watershed a 20 m clearing straight across the main corridor breaks no link, because a saddle link already goes around it; the same clearing down the corridor's middle breaks four.
- **Cleared ground stops counting (CF3).** A reviewed right-of-way's cleared ground, at the width kept clear, is excluded from habitat in every later plan check and spine analysis, exactly like an adopted use.
- **Blowdown stays corridor (CF4).** Fallen trees are part of an old-growth corridor, and leaving them is the default. Recording a blowdown changes no check and no projection. Salvage is a treatment plan and meets the corridor check like any harvest, with the same override vote. A stand-replacing blowdown does reset the stand's age, which the software cannot map for the co-op: every spine analysis carries a warning until a steward saves layers whose stand ages were recorded in or after the year of the blowdown. Gaps under a standing canopy do not warn.
- **Ending (CF5).** A steward ends a fact when it no longer holds, such as a line removed or an easement released. A woodlot leaving the co-op does not end a fact.
- **Privacy and limits (CF6).** As for a use: every member sees the fact, its source and what it does to the corridor; which woodlots it crosses is shown to stewards and their holders. Facts share the 20-record limit per project. A project with no reviewed fact and no adopted use is unchanged.

## Edge bands: agroforestry beside the corridor

The corridor itself is native forest evolving toward old growth, and it is never farmed. Where a field meets it, the woodlot's holder can plant an **edge band** of native tree crops, in the tradition of J. Russell Smith's *Tree Crops: A Permanent Agriculture* (1929): trees as the crop on ground that should not be plowed. The rules are AG1 to AG7 in `lib/woodland-recreation.mjs`.

| Kind | What it is |
| --- | --- |
| Tree-crop edge | Nut and fruit trees along the corridor's field side |
| Alley cropping | Tree rows with crops or hay between |
| Silvopasture | Trees with managed grazing, fenced out of the corridor |
| Windbreak or hedgerow | A linear planting from field edges toward the corridor |
| Planted riparian buffer | A planted buffer on a field's stream side |

- **Beside the corridor, never in it (AG1).** A band is drawn as one or more areas and may not overlap retained forest or a core area; the corridor check measures the overlap and the proposal is refused if there is any. No forest is converted to make a band.
- **A buffer, never corridor (AG2).** A band changes no check and no projection. It counts toward neither the corridor's minimum width, committed forest nor old-growth age.
- **Native tree crops only (AG3).** Every species is recorded native, with the source of that status. A band that lists an introduced species is refused. The software does not identify species or check a flora.
- **The holder decides (AG4).** A band lies only on woodlots its proposer recorded. A steward reviews the map and the species; there is no co-op vote, because no shared corridor ground changes.
- **It can grow into corridor (AG5).** When a band has matured and its holder consents, a steward adds the stand to the retained layers through the ordinary layers review, recording it as planted. It then counts by its recorded age; a one- or two-species plantation never counts as old growth. This is the path from field, to tree-crop edge, to native forest.
- **Ending (AG6).** The holder or a steward removes a band. Withdrawing its woodlot, or deleting its holder's account, removes it.
- **Privacy (AG7).** A band is on one holder's land. Its map, name and species are shown to stewards and its holder; other members see that a band exists, its kind and its area.

**Forest farming** (understorey crops under the standing native canopy) is inside the forest, so it is not a band: it is a kind of use, proposed with nothing cleared, agreed by the crossed holders and voted on by the co-op.

A band records what a holder says they planted. It is not a planting plan, a grazing plan or advice on what will grow. `tests/woodland-edge-bands.test.mjs` covers AG1 to AG4, AG6 and AG7.

A recorded right-of-way is the co-op's note of what is on the ground. It does not establish that an easement exists, who holds it or what it allows. `tests/woodland-corridor-facts.test.mjs` covers CF1 to CF6.

## What the check establishes

Structural connectivity at a minimum width: whether core areas stay linked by retained habitat after road surfaces, open water and the proposed units are removed. It does not establish species movement, genetic viability, regulatory compliance or old-growth condition. Calling a stand `old-growth-verified` requires an evidence reference; otherwise it is reported as a candidate.

## Exchanging packages and reproducing results (WS12)

The corridor check's input is the Landscape Package's canonical form: every package layer is present (`boundary` is empty, because co-op parcels stand in for it), spine layers only when they hold features, and treatment units rounded as stored. Checks stored from v0.10.0 on say so (`check.inputForm: "landscape-package-1.0"`). For those, a steward's **Download check inputs** on a plan gives the exact package the plan was checked against, so the open-source engine reproduces its result and input checksum (`checkConnectivity(fromLandscapePackage(pkg))`) while the co-op's woodlot consents are unchanged. Earlier checks used an input without the empty `boundary` layer, so they are not offered; submit such a plan again to check it in the new form.

The contract runs both ways. dfm-core's own tests read a package downloaded from a VergeCommon plan (written by `scripts/dfm-contract-fixture.mjs`) and must reproduce its stored result and checksum, so a change in the engine cannot silently break plans stored here.

Packages from the DFM mapping workspace or other tools import into the editor: non-UUID IDs become UUIDs and the original ID becomes the feature's name when it has none; spine lines keep their link to the corridors drafted from them; the planning `boundary` layer is not kept. An upload lists anything it leaves out, so nothing is dropped silently: the planning boundary, woodlots and treatment units (which have their own places here), and any layer, setting or feature property VergeCommon does not use yet, such as a newer DFM tool's stepping stones or exits. Stand origin, remnant status, native share, the native settings and a planting's species list are kept. With those, the check here can differ from the tool that wrote the package. `tests/woodland-interop.test.mjs` checks a package exported by the workspace: the same status, lost links and responsible units by name, and areas within 0.01% (records are stored at 1e-7 degrees, about 1 cm).

## Erasure and rollback

When a member deletes their account, their treatment plans go with them, because each describes work on their land. A plan another member acted on (a steward reviewed it, or members voted on its override) keeps only a pseudonymous structural record of that decision (status, review and vote), without its name, units, review note or mapped result. Such a record is inert (E1): it cannot be reviewed, voted on, put to an override or applied in an analysis, and an override vote still open on it is closed as withdrawn. Layer versions are shared co-op maps and stay, without the author's notes; an override reason goes with the steward who wrote it. Writers older than v0.10.0 do not apply these rules: `self-hosted/rollback-check.mjs` refuses a rollback once woodland records or planned join years exist.

## Limits

- Layers: 300 KB per version after rounding (about 12,000 corners), 400 features per layer, 5 versions with geometry per project and 900 KB of layer geometry in all (older superseded versions keep their record but drop their geometry; the reviewed version always keeps its own). Drafted spine corridors and spine lines may have up to 1,000 vertices; drawn features keep the 200-vertex limit. The DFM watershed on dendriticforest.com (2.8 × 2.6 km, 14 lines, 4 cores) uses about 79 KB. The request that saves layers may be up to 900 KB; every other command stays under 100 KB. The limit is set by analysis time, not storage: on a 2.1 GHz core the slowest analysis (the years ahead) took 4 s at 80 KB, 8 s at 200 KB and 10 s at 264 KB, against the worker's 25 s deadline; at 860 KB it took 34 s and would fail.
- Plans: 50 treatment units and 40 KB each; 40 plans per project.
- Engine work runs in the analysis worker (WS7). For woodlot-scale layers the corridor check takes well under a second. On the watershed above, the check on drafted spine corridors takes about 2–6 seconds and each spine analysis 1–6 seconds, so plan previews and submissions there take seconds too. Analyze one watershed at a time; a landscape whose check cannot finish within the deadline cannot take plans until it is split.

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
and a reason. Since dfm-core 0.2.0 that list also holds the upkeep that fire- and
grazing-dependent woodland needs: prescribed burn, prescribed grazing,
late-season mowing and brush management. Since dfm-core 0.3.0 a corridor-permitted
restoration planting can list the species it plants, and stays permitted only with
native species (see Native old growth). Invalid geometry and missing properties are listed with the
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

**Download Land Package** (on a draft) and **Download as Land Package** (on a
checked plan, for stewards) write the same content as a
[Land Package](https://viridisconservation.com/ecosystem/land-package), the open
file format the other Viridis tools read. The conversion runs in the browser with
the vendored open-source converter (`lib/land-package.mjs`, from
[viridisconservation/land-package](https://github.com/viridisconservation/land-package));
nothing is sent to a server. The file converts back to a Landscape Package with
the same content (the written file sorts its keys, so key order can differ). It
declares its own privacy: a package with woodlot parcels is marked as
personal data, with consent `covered` only when every parcel is covered, so a
reader must treat it as not shareable. Because VergeCommon's Landscape Packages
record no data sources, each layer carries the source `unrecorded` and a warning.
Keep the file within the co-op, as with any parcel record.

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
errors. `tests/woodland-native.test.mjs` covers native old growth (NO1–NO5): a plantation
past the age threshold is not counted at old-growth age, a remnant counts in every
year, a corridor planting with an introduced species is blocked, and layers
without the new records give the results dfm-core 0.2.0 gave.
`tests/woodland-preview.test.mjs` covers membership/flag checks, plan
limits, non-mutation, privacy, structural local/server equality, and server
preview/stored checksum equality with private reviewed consents. Outputs: `outputs/woodland-editor-review/`.
