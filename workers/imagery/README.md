# Verge Common imagery worker

A separately runnable, open-source worker for paired-date vegetation screening. It consumes a private job exported from the co-op's Monitoring screen and prepared local Sentinel-2 L2A B04 (red), B08 (near infrared), and SCL files for two dates. The optional CDSE adapter downloads selected source bands and prepares parcel crops. Neither command starts background jobs, issues credits, or uploads results.

## Run

Use Python 3.12+ in an isolated environment:

```sh
python -m venv .venv
.venv/bin/pip install -r workers/imagery/requirements.txt
.venv/bin/python workers/imagery/process.py --job job.json --files files.json --output receipt.json
```

On Windows use `.venv\Scripts\python.exe` and its corresponding pip. The output must not already exist, avoiding accidental overwrite. Import the resulting JSON under the matching job in Monitoring; a second steward reviews it.

## Optional authorized download and screening

The new adapter is **experimental: tested with synthetic responses and checked against live public catalog metadata; authenticated band downloads have not yet been validated**.

Export a private job from Monitoring. Obtain your own Copernicus Data Space **OData access token** using the [official authentication instructions](https://documentation.dataspace.copernicus.eu/APIs/Token.html). Make it available as `CDSE_ACCESS_TOKEN` through your local secret manager or a hidden terminal prompt; never paste it into the website, job JSON, source files, or a committed environment file. A Sentinel Hub OAuth client is a different authentication workflow.

With the worker dependencies installed:

```sh
.venv/bin/python workers/imagery/fetch.py --job /private/path/job.json --output-dir /private/path/new-run --allow-download
```

Use a new output directory outside the repository. The explicit flag authorizes up to six full-scene bands, each limited to 500 MB (up to 3 GB total, plus crops). Ensure sufficient storage and provider quota. Only scene IDs and ordinary request metadata go to Copernicus; parcel geometry stays on your computer. The local operator must have current authority to process the parcel: an exported job cannot check later membership changes or consent revocation.

The adapter retrieves B04/B08 at 10 m and SCL at 20 m from the exact catalog item for each selected scene. It checks catalog file sizes and SHA-256/SHA3-256 multihashes, preserves raw files and catalog metadata, and crops locally without resampling. Catalog scale/offset and nodata are applied explicitly. Both dates must use the same Sentinel-2 tile and aligned grids; unsupported products fail closed.

On success, import `receipt.json` in Monitoring. `files.json` allows local reprocessing; `retrieval.json` and the saved catalog responses retain source metadata. These are local records, not signed provider attestations, and the website does not authenticate them. Keep the entire folder private. On failure, no successful receipt is written; verified earlier bands may remain. Obtain a fresh token if expired and retry into a new folder. Redirects are refused to prevent credential forwarding; a provider redirect currently needs an adapter update after review. There are no automatic retries or token refreshes.

## Prepare inputs manually

Obtain the actual selected scenes through an authorized imagery provider. Retain their product metadata. Both dates' red and NIR rasters must have identical CRS, transform, dimensions and full parcel coverage. Use trusted, single-band GeoTIFF or JP2 files with explicit nodata. The SCL raster may be coarser; it is aligned with nearest-neighbor resampling. The worker rejects arbitrary VRT inputs and remote paths.

Create a files manifest with `before` and `after` entries, each containing `red`, `nir`, and `scl`. All entries need a local `path`; red and NIR also require explicit `scale` and `offset`. For example, **only when already converted to physical surface reflectance**:

```json
{
  "before": {
    "red": {"path": "/data/before-red.tif", "scale": 1, "offset": 0},
    "nir": {"path": "/data/before-nir.tif", "scale": 1, "offset": 0},
    "scl": {"path": "/data/before-scl.tif"}
  },
  "after": {
    "red": {"path": "/data/after-red.tif", "scale": 1, "offset": 0},
    "nir": {"path": "/data/after-nir.tif", "scale": 1, "offset": 0},
    "scl": {"path": "/data/after-scl.tif"}
  }
}
```

Conversion is `reflectance = stored_value * scale + offset`. For raw Sentinel-2 digital numbers, derive these values per band from source product metadata; `BOA_ADD_OFFSET` must be divided by the quantification value when expressed as this formula's offset. Do not apply an offset twice to provider-harmonized data. See [Copernicus Sentinel-2 L2A documentation](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/S2L2A.html). The worker records operator-supplied conversion values; it does not authenticate them or prove that the files belong to the scene IDs.

## Method and limits

`paired-ndvi-v1`:

- Clips by parcel pixel centres, with a bounding window limited to four million pixels. No partial raster footprint is accepted.
- Excludes nodata/nonfinite data, reflectance outside [0,1], zero denominators, and SCL classes other than 4 (vegetation), 5 (non-vegetated), or 6 (water). SCL cloud classification is not a perfect cloud mask; there is no cloud-edge dilation.
- Computes `(NIR - red) / (NIR + red)` only for pixels usable on both dates.
- Requires at least 10 common pixels and 50% usable parcel-pixel coverage. Below either threshold, reports insufficient coverage and null means/change.
- Flags a mean NDVI decrease of at least 0.1 for review. This is a fixed screening threshold, not a statistical confidence interval, causal inference, or disturbance certification.
- Retains six input SHA-256 fingerprints, processor-source fingerprint, runtime versions, radiometric parameters, scene IDs, canonical boundary, and pixel counts. Private filesystem paths are omitted from the receipt.

Means are unweighted pixel means, not area-weighted estimates. Terrain, phenology, acquisition geometry, weather, agricultural activity, atmospheric differences and residual cloud effects can explain a difference. No biomass, carbon, credits, survival rate, or independently verified impact is calculated. Small EcoHedges may lack sufficient pixels and require field or finer-resolution data.

## Reproduction and trust

Run `python workers/imagery/test_processor.py` and `python workers/imagery/test_fetch.py` for synthetic raster and retrieval tests. Dependencies are pinned, but different native GDAL/PROJ builds can affect numerical reproduction; receipts identify Python package versions and the processor source, not every operating-system component. Preserve the actual inputs and environment for a rigorous audit.

The website validates job/geometry/scene binding and internal numeric consistency. It does not execute the worker, verify input-file hashes against provider files, or attest the worker's identity. Imported receipts are explicitly computer-reported and require independent human review. Never treat import success or review status as registry certification.
