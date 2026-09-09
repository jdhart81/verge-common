# Monitoring foundation

The Monitoring tab provides a private, reviewable evidence workflow. It is not a carbon quantification or certification engine.

1. Submit a parcel in Parcels.
2. Upload or paste a WGS84 GeoJSON Polygon or Feature in Monitoring. This release accepts a single exterior ring with 3–200 distinct corners, closed by its first point. Holes, self-intersections, spans exceeding 10 degrees, and antimeridian-crossing polygons are rejected. The outline is not a basemap, boundary survey, area calculation, or overlap check.
3. Record a consent reference and whether the landholder permits external catalogue searches. A different steward reviews the boundary. Each revision remains in history; the newest must be reviewed before monitoring continues.
4. Explicitly confirm sending the reviewed boundary's bounding box and chosen dates to Copernicus. The connector queries the public [CDSE STAC endpoint](https://documentation.dataspace.copernicus.eu/APIs/STAC.html) for Sentinel-2 L2A metadata. Requests have a 15-second timeout, 2 MB response limit, maximum 366-day window, and 20-result limit. Results are sorted newest first; narrow the date range when more scenes are needed. Only successful searches are stored, with a one-minute per-parcel cooldown; this is not a full distributed rate limiter.
5. Inspect acquisition dates, source links, and scene-level cloud coverage. Bounding-box overlap does not establish usable cloud-free coverage of the whole parcel. Zero results means no returned catalogue matches, not absence of ecological change. Scene metadata are normalized and retained with query dates, boundary version, connector version, and raw-response SHA-256. Raw provider responses and imagery are not archived in this release.
6. Record field findings with observation date, method, units/sampling description, uncertainty, and optional HTTPS reference. Use Evidence for private photo/document uploads. Another steward reviews the observation record. Older observations retain their original boundary version.

## Permissions and limits

Only the parcel's submitting member and active stewards can access its boundaries, searches, and observations. No geometry or monitoring records enter public discovery. Revoking external-search consent blocks future queries for that version. An archived co-op cannot run searches or save monitoring records. Generic workspace commands reject direct catalogue-receipt creation; the server obtains the scene metadata itself.

Limits: 20 boundary revisions per parcel, 200 saved searches per co-op, 1,000 field observations, plus existing aggregate-size/audit limits. Monitoring uses existing JSON storage without a database migration.

## What remains

Imagery download/processing, map drawing and basemaps, complex-polygon/overlap validation, reproducible cloud masks, vegetation and disturbance metrics, automated alerts, formal sampling protocols, satellite/field calibration, methodology-specific uncertainty, and independent verification. Small EcoHedges need suitable field measurements; coarse satellite pixels alone are insufficient to characterize each hedge.

The provider connector is open source. Free catalogue access does not imply unlimited free processing, commercial imagery, validation, or registry services. No account, paid service, background schedule, market listing, or payment execution is created by this release.

## Paired imagery screening (0.7.0)

After discovering at least two scenes for the current reviewed boundary, create a processing job in Monitoring. Download its private job file, run [the imagery worker](../workers/imagery/README.md) with prepared local imagery, and import the receipt. The worker compares common usable pixels and reports a review flag or insufficient coverage. A second steward records field checks and limitations. Jobs preserve their boundary and scene selection; older results remain historical after a boundary revision. Reprocessing requires a new job.

This adds manual imagery processing and review, not automatic ingestion or alerts. Satellite discovery remains metadata-only. The app never converts these results to carbon units. Analysis jobs and results inherit parcel privacy. Each co-op can retain at most 200 jobs under the existing aggregate limits.
