"""Explicit, bounded CDSE band retrieval. Credentials never enter job files."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from process import process
import rasterio
from rasterio.features import geometry_window
from rasterio.warp import transform_geom

CATALOG = 'https://stac.dataspace.copernicus.eu/v1/collections/sentinel-2-l2a/items/'
BANDS = {'red': 'B04_10m', 'nir': 'B08_10m', 'scl': 'SCL_20m'}
MAX_BAND = 500_000_000
SCENE = r'S2[ABC]_MSIL2A_\d{8}T\d{6}_N\d{4}_R\d{3}_T[0-9A-Z]{5}_\d{8}T\d{6}'

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Provider redirected the request; no credentials were forwarded. Review the provider endpoint.')


def read_stream(response, destination, limit, expected=None, checksum=None):
    count = 0
    algorithm = None
    if checksum:
        # STAC file extension uses multihash, not a bare hex digest.
        algorithm = {'1220': hashlib.sha256, '1620': hashlib.sha3_256}.get(checksum[:4])
        if not algorithm or not re.fullmatch(r'[0-9a-f]{68}', checksum):
            raise ValueError('Unsupported provider checksum; download refused.')
    h = algorithm() if algorithm else hashlib.sha256()
    while True:
        chunk = response.read(min(1024 * 1024, limit - count + 1))
        if not chunk:
            break
        count += len(chunk)
        if count > limit:
            raise ValueError('Provider response exceeded the download limit.')
        destination.write(chunk)
        h.update(chunk)
    if expected is not None and count != expected:
        raise ValueError('Downloaded size does not match the catalog.')
    if checksum and h.hexdigest() != checksum[4:]:
        raise ValueError('Downloaded checksum does not match the catalog.')
    return count


def fetch_item(scene_id, opener):
    if not re.fullmatch(SCENE, scene_id):
        raise ValueError('Unsupported Sentinel-2 scene ID.')
    import io
    data = io.BytesIO()
    with opener.open(Request(CATALOG + scene_id), timeout=60) as response:
        read_stream(response, data, 2_000_000)
    return json.loads(data.getvalue())


def assets_for(item, scene_id):
    if item.get('id') != scene_id or item.get('collection') != 'sentinel-2-l2a':
        raise ValueError('Catalog returned a different scene or collection.')
    result = {}
    for band, key in BANDS.items():
        asset = item['assets'][key]
        url = asset['alternate']['https']['href']
        parsed = urlsplit(url)
        if (parsed.scheme != 'https' or parsed.netloc != 'download.dataspace.copernicus.eu'
                or parsed.query or parsed.fragment
                or not parsed.path.endswith('_' + key + '.jp2)/$value')
                or not re.fullmatch(r'/odata/v1/Products\([0-9a-f-]{36}\)/Nodes\(' + re.escape(scene_id)
                    + r'\.SAFE\)(/Nodes\([A-Za-z0-9_.-]+\))+/\$value', parsed.path)):
            raise ValueError('Untrusted or mismatched band download URL.')
        size = asset['file:size']
        checksum = asset['file:checksum']
        if type(size) is not int or not 0 < size <= MAX_BAND:
            raise ValueError('Band exceeds the 500 MB limit.')
        if not re.fullmatch(r'(1220|1620)[0-9a-f]{64}', checksum):
            raise ValueError('Unsupported provider checksum.')
        if asset.get('nodata') != 0:
            raise ValueError('Expected Sentinel-2 nodata value zero.')
        entry = {'url': url, 'size': size, 'checksum': checksum}
        if band != 'scl':
            scale, offset = asset['raster:scale'], asset['raster:offset']
            if any(type(v) not in (int, float) or not math.isfinite(v) for v in (scale, offset)) or scale <= 0:
                raise ValueError('Missing or invalid catalog radiometry.')
            entry.update(scale=scale, offset=offset)
        result[band] = entry
    return result


def prepare(path, geometry):
    """Crop without resampling; retain raw DN and catalog nodata semantics."""
    target = path.with_suffix('.tif')
    with rasterio.open(path) as source:
        if source.driver not in ('JP2OpenJPEG', 'GTiff') or source.count != 1 or source.crs is None or source.nodata not in (None, 0):
            raise ValueError('Unexpected provider raster format or nodata.')
        boundary = transform_geom('EPSG:4326', source.crs, geometry)
        window = geometry_window(source, [boundary], boundless=True)
        if (window.col_off < 0 or window.row_off < 0 or window.col_off + window.width > source.width
                or window.row_off + window.height > source.height or window.width * window.height > 4_000_000):
            raise ValueError('Parcel exceeds raster footprint or four million pixel limit.')
        with rasterio.open(target, 'w', driver='GTiff', count=1, dtype=source.dtypes[0],
                width=int(window.width), height=int(window.height), crs=source.crs,
                transform=source.window_transform(window), nodata=0) as destination:
            destination.write(source.read(1, window=window), 1)
    return target


def run(job, output, token, opener=None):
    if job.get('algorithm') != 'paired-ndvi-v1' or len(job.get('scenes', [])) != 2:
        raise ValueError('Use an exported paired-ndvi-v1 job.')
    if job['geometry'] != json.loads(job['geometryCanonical']):
        raise ValueError('Boundary does not match the job.')
    ids = [s['id'] for s in job['scenes']]
    if any(not re.fullmatch(SCENE, s) for s in ids) or ids[0] == ids[1]:
        raise ValueError('Select two distinct Sentinel-2 scenes.')
    if ids[0].split('_')[5] != ids[1].split('_')[5]:
        raise ValueError('This adapter requires two dates from the same Sentinel-2 tile.')
    if not token or any(c.isspace() for c in token):
        raise ValueError('Set CDSE_ACCESS_TOKEN securely in the operator environment.')
    output = Path(output).resolve()
    # Fresh, private directory; failed runs never contain a successful receipt.
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    opener = opener or build_opener(NoRedirect())
    manifest, provenance = {}, []
    for side, scene_id in zip(['before', 'after'], ids):
        item = fetch_item(scene_id, opener)
        assets = assets_for(item, scene_id)
        (output / (side + '-catalog.json')).write_text(json.dumps(item, indent=2))
        manifest[side] = {}
        for band, asset in assets.items():
            path = output / (side + '-' + band + '.jp2')
            partial = path.with_suffix('.part')
            request = Request(asset['url'], headers={'Authorization': 'Bearer ' + token})
            try:
                with opener.open(request, timeout=120) as response, partial.open('xb') as f:
                    read_stream(response, f, MAX_BAND, asset['size'], asset['checksum'])
                partial.rename(path)
            except Exception:
                partial.unlink(missing_ok=True)
                raise
            prepared = prepare(path, job['geometry'])
            manifest[side][band] = {'path': str(prepared)}
            if band != 'scl':
                manifest[side][band].update(scale=asset['scale'], offset=asset['offset'])
        provenance.append({'sceneId': scene_id, 'assets': assets})
    (output / 'files.json').write_text(json.dumps(manifest, indent=2))
    (output / 'retrieval.json').write_text(json.dumps({'provider': 'CDSE STAC / OData', 'assets': provenance,
        'trust': 'Local retrieval record, not a signed provider attestation. No credentials included.'}, indent=2))
    receipt = process(job, manifest)
    (output / 'receipt.json').write_text(json.dumps(receipt, allow_nan=False, indent=2))
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--job', required=True)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--allow-download', action='store_true', help='Authorize six band downloads (up to 3 GB); scene IDs go to Copernicus, boundary stays local.')
    args = parser.parse_args()
    if not args.allow_download:
        parser.exit(1, 'No network requests made. Add --allow-download after reviewing the download scope.\n')
    try:
        receipt = run(json.loads(Path(args.job).read_text()), args.output_dir, os.environ.get('CDSE_ACCESS_TOKEN', ''))
        print('Saved receipt.json:', receipt['quality'])
    except HTTPError as e:
        parser.exit(1, f'Provider HTTP {e.code}; check token validity, access and quota. No receipt created.\n')
    except (ValueError, KeyError, TypeError, OSError, URLError, rasterio.errors.RasterioError):
        parser.exit(1, 'Retrieval or processing failed. Check job, provider metadata, storage, grid alignment and credentials. No receipt created; use a new output directory to retry.\n')
