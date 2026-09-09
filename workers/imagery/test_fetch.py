import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from urllib.request import Request
import rasterio
from fetch import assets_for, read_stream, run, NoRedirect, CATALOG, BANDS
import test_processor

IDS = ['S2C_MSIL2A_20260801T073611_N0512_R092_T37MBU_20260801T112221',
       'S2C_MSIL2A_20260830T073611_N0512_R092_T37MBU_20260830T112221']

class FetchTests(unittest.TestCase):
    def fixture(self, root):
        job, files = test_processor.ProcessorTests().fixture(root)
        job['scenes'] = [{'id': s} for s in IDS]
        responses, items = {}, []
        for side, scene in zip(['before', 'after'], IDS):
            item = {'id': scene, 'collection': 'sentinel-2-l2a', 'assets': {}}
            for band, key in BANDS.items():
                path = files[side][band]['path']
                with rasterio.open(path, 'r+') as ds: ds.nodata = 0
                data = Path(path).read_bytes()
                url = ('https://download.dataspace.copernicus.eu/odata/v1/Products(66d9e416-3cd4-4701-a2bb-8edeb31cea84)'
                       + '/Nodes(' + scene + '.SAFE)/Nodes(' + 'T37MBU_' + key + '.jp2)/$value')
                item['assets'][key] = {'alternate': {'https': {'href': url}}, 'file:size': len(data),
                    'file:checksum': '1620' + hashlib.sha3_256(data).hexdigest(), 'nodata': 0,
                    'raster:scale': 1, 'raster:offset': 0}
                responses[url] = data
            responses[CATALOG + scene] = json.dumps(item).encode()
            items.append(item)
        class Opener:
            calls = []
            def open(self, request, timeout):
                self.calls.append(request)
                return io.BytesIO(responses[request.full_url])
        return job, items, responses, Opener()

    def test_download_prepare_and_process(self):
        with tempfile.TemporaryDirectory() as root:
            job, _, _, opener = self.fixture(root)
            out = Path(root) / 'run'
            receipt = run(job, out, 'test-secret', opener)
            self.assertEqual(receipt['pairedPixels'], 100)
            self.assertAlmostEqual(receipt['meanChange'], -0.4, places=6)
            self.assertEqual(len(opener.calls), 8)
            for request in opener.calls:
                self.assertEqual(request.get_header('Authorization'), None if request.full_url.startswith(CATALOG) else 'Bearer test-secret')
            for path in out.glob('*.json'):
                self.assertNotIn('test-secret', path.read_text())
            with self.assertRaises(FileExistsError): run(job, out, 'test-secret', opener)

    def test_bad_metadata_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            _, items, _, _ = self.fixture(root)
            for mutate in [lambda x: x.update(id=IDS[1]),
                           lambda x: x['assets']['B04_10m'].update({'file:size': 500_000_001}),
                           lambda x: x['assets']['B04_10m'].update({'raster:offset': float('nan')}),
                           lambda x: x['assets']['B04_10m']['alternate']['https'].update(href='https://evil.example/data'),
                           lambda x: x['assets']['B04_10m'].update({'file:checksum': 'deadbeef'})]:
                item = copy.deepcopy(items[0]); mutate(item)
                with self.assertRaises(ValueError): assets_for(item, IDS[0])

    def test_integrity_and_size(self):
        for limit, size, checksum in [(2, 3, None), (10, 4, None), (10, 3, '1220' + '0'*64)]:
            with self.assertRaises(ValueError): read_stream(io.BytesIO(b'abc'), io.BytesIO(), limit, size, checksum)

    def test_failed_download_leaves_no_receipt_or_partial(self):
        with tempfile.TemporaryDirectory() as root:
            job, _, responses, opener = self.fixture(root)
            url = next(u for u in responses if not u.startswith(CATALOG))
            responses[url] = b'bad data'
            out = Path(root) / 'run'
            with self.assertRaises(ValueError): run(job, out, 'test-secret', opener)
            self.assertFalse((out / 'receipt.json').exists())
            self.assertEqual(list(out.glob('*.part')), [])

    def test_redirect_never_forwards_credentials(self):
        with self.assertRaises(ValueError):
            NoRedirect().redirect_request(Request('https://download.dataspace.copernicus.eu/'), None, 302, '', {}, 'https://evil.example')

    def test_missing_token_makes_no_requests(self):
        with tempfile.TemporaryDirectory() as root:
            job, _, _, opener = self.fixture(root)
            with self.assertRaises(ValueError): run(job, Path(root)/'run', '', opener)
            self.assertEqual(opener.calls, [])

if __name__ == '__main__': unittest.main()
