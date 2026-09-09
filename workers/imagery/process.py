"""Local-file Sentinel-2 paired NDVI screening; no network or credit issuance."""
import argparse, hashlib, json, math
from contextlib import ExitStack
from pathlib import Path
import numpy as np
import rasterio
from rasterio.features import geometry_mask, geometry_window
from rasterio.warp import transform_geom
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
ALGORITHM = 'paired-ndvi-v1'
def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(1024*1024), b''): h.update(block)
    return h.hexdigest()
def local_file(value):
    p=Path(value)
    if not p.is_file() or str(value).startswith('/vsi') or '://' in str(value): raise ValueError('Supply existing local raster files only.')
    return p

def process(job, files):
    if job.get('algorithm')!=ALGORITHM or len(job.get('scenes',[]))!=2: raise ValueError('Use an exported paired-ndvi-v1 job.')
    geometry=job['geometry']
    if geometry != json.loads(job['geometryCanonical']): raise ValueError('Boundary does not match the exported job.')
    if geometry.get('type')!='Polygon' or len(geometry.get('coordinates',[]))!=1: raise ValueError('Use the reviewed polygon from the job export.')
    with ExitStack() as stack:
        datasets=[]; hashes=[]; scaling=[]
        for side in ['before','after']:
            config=files[side]; row={}; row_hash={}
            for band in ['red','nir','scl']:
                path=local_file(config[band]['path'])
                ds=stack.enter_context(rasterio.open(path))
                if ds.driver not in ['GTiff','JP2OpenJPEG'] or ds.count!=1 or ds.crs is None or ds.nodata is None: raise ValueError('Use single-band georeferenced GeoTIFF/JP2 files with explicit nodata; VRT input is not accepted.')
                row[band]=ds; row_hash[band]=digest(path)
            scales={}
            for band in ['red','nir']:
                scale=float(config[band]['scale']); offset=float(config[band]['offset'])
                if not math.isfinite(scale) or not math.isfinite(offset) or scale<=0: raise ValueError('Supply finite radiometric scale and offset from source metadata.')
                scales[band]={'scale':scale,'offset':offset}
            datasets.append(row);hashes.append(row_hash);scaling.append(scales)
        grid=datasets[0]['red']
        for row in datasets:
            for name in ['red','nir']:
                ds=row[name]
                if (ds.crs,ds.transform,ds.width,ds.height)!=(grid.crs,grid.transform,grid.width,grid.height): raise ValueError('Both dates and reflectance bands must use exactly the same grid; prepare aligned inputs first.')
        g=transform_geom('EPSG:4326',grid.crs,geometry)
        window=geometry_window(grid,[g],boundless=True)
        if window.col_off<0 or window.row_off<0 or window.col_off+window.width>grid.width or window.row_off+window.height>grid.height: raise ValueError('The raster must cover the complete parcel boundary.')
        if window.width*window.height>4_000_000: raise ValueError('Parcel window exceeds four million pixels; use a smaller job.')
        shape=(int(window.height),int(window.width))
        inside=geometry_mask([g],shape,grid.window_transform(window),invert=True,all_touched=False)
        total=int(inside.sum())
        if not total: raise ValueError('No pixel centres fall inside this parcel; use field or finer-resolution data.')
        values=[]; valid=[]
        for row,scale in zip(datasets,scaling):
            red=row['red'].read(1,window=window,masked=True).astype('float64')
            nir=row['nir'].read(1,window=window,masked=True).astype('float64')
            r=red.data*scale['red']['scale']+scale['red']['offset']
            n=nir.data*scale['nir']['scale']+scale['nir']['offset']
            scl=stack.enter_context(WarpedVRT(row['scl'],crs=grid.crs,transform=grid.transform,width=grid.width,height=grid.height,src_nodata=row['scl'].nodata,nodata=0,resampling=Resampling.nearest)).read(1,window=window,masked=True)
            ok=inside & ~np.ma.getmaskarray(red) & ~np.ma.getmaskarray(nir) & ~np.ma.getmaskarray(scl) & np.isin(scl.data,[4,5,6]) & np.isfinite(r) & np.isfinite(n) & (r>=0) & (n>=0) & (r<=1) & (n<=1) & ((r+n)>0)
            ndvi=np.divide(n-r,n+r,out=np.zeros_like(r),where=(r+n)>0)
            valid.append(ok);values.append(ndvi)
        common=valid[0]&valid[1];count=int(common.sum());fraction=count/total
        enough=count>=10 and fraction>=0.5
        before=float(values[0][common].mean()) if enough else None
        after=float(values[1][common].mean()) if enough else None
        change=after-before if enough else None
        return {'algorithm':ALGORITHM,'jobId':job['id'],'boundaryId':job['boundaryId'],
            'geometryCanonical':job['geometryCanonical'],'sceneIds':[s['id'] for s in job['scenes']], 'inputSha256':hashes,'radiometry':scaling,
            'processorSha256':digest(__file__),'runtime':{'numpy':np.__version__,'rasterio':rasterio.__version__},
            'totalPixels':total,'pairedPixels':count,'beforeValidPixels':int(valid[0].sum()),'afterValidPixels':int(valid[1].sum()),
            'beforeMean':before,'afterMean':after,'meanChange':change,
            'quality':'sufficient_for_screening' if enough else 'insufficient_coverage',
            'signal':'decrease_for_review' if enough and change<=-0.1 else 'no_decrease_flag' if enough else 'unavailable',
            'maskClasses':[4,5,6], 'limitations':'Pixel-centre, paired-date NDVI screening only. Seasonality, weather, land management and residual cloud effects require field review. Not biomass, carbon, causation or verified ecological impact.'}
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--job',required=True);parser.add_argument('--files',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
    try:
        result=process(json.loads(Path(args.job).read_text()),json.loads(Path(args.files).read_text()))
        with open(args.output,'x') as f:json.dump(result,f,allow_nan=False,indent=2)
        print('Saved screening receipt:',result['quality'])
    except (ValueError,KeyError,OSError,rasterio.errors.RasterioError) as e:parser.exit(1,str(e)+'\n')
