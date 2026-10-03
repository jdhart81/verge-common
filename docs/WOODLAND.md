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
