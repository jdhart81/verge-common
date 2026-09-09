import json, tempfile, unittest
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_origin
from process import process
class ProcessorTests(unittest.TestCase):
 def fixture(self,root,cloud=False,offset=0):
  files={}
  for side,red,nir in [('before',0.2,0.8),('after',0.4,0.6)]:
   files[side]={}
   for name,value in [('red',red),('nir',nir),('scl',9 if cloud else 4)]:
    p=Path(root)/(side+'-'+name+'.tif'); data=np.full((10,10),value-offset if name!='scl' else value,dtype='float32')
    with rasterio.open(p,'w',driver='GTiff',width=10,height=10,count=1,dtype='float32',crs='EPSG:4326',transform=from_origin(0,0.01,0.001,0.001),nodata=-9999) as ds:ds.write(data,1)
    files[side][name]={'path':str(p),'scale':1,'offset':offset if name!='scl' else 0}
  job={'id':'job','boundaryId':'boundary','algorithm':'paired-ndvi-v1','geometry':{'type':'Polygon','coordinates':[[[0,0],[0.01,0],[0.01,0.01],[0,0.01],[0,0]]]},'scenes':[{'id':'a'},{'id':'b'}]}
  job['geometryCanonical']=json.dumps(job['geometry'],separators=(',',':'))
  return job,files
 def test_paired_change_and_radiometry(self):
  with tempfile.TemporaryDirectory() as tmp:
   job,files=self.fixture(tmp,offset=-0.1);r=process(job,files)
   self.assertEqual(r['pairedPixels'],100);self.assertAlmostEqual(r['meanChange'],-0.4,places=6)
   self.assertEqual(r['signal'],'decrease_for_review');self.assertEqual(len(r['inputSha256'][0]['red']),64)
 def test_clouds_produce_no_conclusion(self):
  with tempfile.TemporaryDirectory() as tmp:
   job,files=self.fixture(tmp,cloud=True);r=process(job,files)
   self.assertEqual(r['pairedPixels'],0);self.assertIsNone(r['meanChange']);self.assertEqual(r['signal'],'unavailable')
 def test_incomplete_footprint_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   job,files=self.fixture(tmp);job['geometry']['coordinates'][0][1][0]=0.02;job['geometryCanonical']=json.dumps(job['geometry'],separators=(',',':'))
   with self.assertRaises(ValueError):process(job,files)
 def test_coarser_cloud_mask_is_aligned(self):
  with tempfile.TemporaryDirectory() as tmp:
   job,files=self.fixture(tmp);path=files['after']['scl']['path']
   with rasterio.open(path,'w',driver='GTiff',width=2,height=2,count=1,dtype='float32',crs='EPSG:4326',transform=from_origin(0,0.01,0.005,0.005),nodata=-9999) as ds:ds.write(np.array([[4,9],[4,9]],dtype='float32'),1)
   result=process(job,files);self.assertEqual(result['pairedPixels'],50)
 def test_unaligned_reflectance_is_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   job,files=self.fixture(tmp)
   with rasterio.open(files['after']['red']['path'],'r+') as ds:ds.transform=from_origin(0.001,0.01,0.001,0.001)
   with self.assertRaises(ValueError):process(job,files)
if __name__=='__main__':unittest.main()
