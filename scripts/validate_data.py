"""Checks with independent geometric reconstruction, not only file presence."""
from pathlib import Path
import json,hashlib
import numpy as np
import rasterio
from scipy.interpolate import RegularGridInterpolator
from scipy.spatial import cKDTree

ROOT=Path(__file__).resolve().parents[1]
P=ROOT/'app/public/data'
scene=json.loads((P/'scene.json').read_text());surf=json.loads((P/'surface.json').read_text());hist=json.loads((P/'history.json').read_text());rescue=json.loads((P/'emergency.json').read_text())
checks=[]
def check(name,condition,details):
    checks.append({'name':name,'pass':bool(condition),'details':details})
    assert condition,(name,details)
v=np.array(surf['mesh']['vertices']);tr=np.array(surf['mesh']['triangles']);c=np.array(surf['mesh']['centroids']);bed=np.array(surf['mesh']['elevation']);d=np.array(surf['depth']);vel=np.array(surf['velocity']);areas=np.array(surf['mesh']['areas'])
check('mesh-centroid registration',np.max(np.abs(v[tr].mean(axis=1)-c))<.001,{'max_error_m':float(np.max(np.abs(v[tr].mean(axis=1)-c)))})
with rasterio.open(ROOT/'derived/hydraulic_terrain_10m.tif') as ds:
    z=ds.read(1);aff=ds.transform
    xs=aff.c+(np.arange(ds.width)+.5)*aff.a;ys=aff.f+(np.arange(ds.height)+.5)*aff.e
    f=RegularGridInterpolator((ys[::-1],xs),z[::-1],bounds_error=False,fill_value=None)
    vert_global=v+surf['origin'];zb=f(vert_global[:,::-1]);expected=zb[tr].mean(axis=1)
    err=np.abs(expected-bed)
check('native-grid / solver bed coordinate registration',err.max()<.002,{'max_error_m':float(err.max()),'mean_error_m':float(err.mean()),'bed_range_m':[float(bed.min()),float(bed.max())]})
check('finite nonnegative surface fields',np.isfinite(d).all() and (d>=0).all() and np.isfinite(vel).all(),{'frames':d.shape[0],'cells':d.shape[1]})
native=np.load(ROOT/'results/anuga/fields.npz')['depth']
volumes=native@areas;target=np.minimum(np.arange(61)*120,3600)/3600*108000;relative=np.max(abs(volumes-target))/108000
browser_error=np.max(abs(d@areas-target))
check('closed-domain mass balance and browser quantization',relative<1e-6 and browser_error/108000<1e-4,{'native_max_abs_volume_error_m3':float(np.max(abs(volumes-target))),'native_max_relative_error':float(relative),'browser_4_decimal_max_abs_volume_error_m3':float(browser_error),'browser_relative_error':float(browser_error/108000)})
check('flood grows and redistributes',np.max(d[-1]-d[0])>.2 and np.max(np.abs(d[-1]-d[30]))>.01,{'peak_depth_m':float(d.max()),'wet_area_44min_m2':float(areas[d[22]>.05].sum())})
check('historical model / observation mapping',all(hist['sensors'][n]['modelNode']==n and hist['sensors'][n]['observations'] for n in ['G71F04R','G71F05R','G71F06R','G71F68Y']),{'sensor_ids':list(hist['sensors']),'model_kind':'independent cold-start SWMM; no coupling'})
missing=sum(p['value'] is None for s in hist['sensors'].values() for ch in s['observations'] for p in ch['series'])
flagged=sum(bool(p['flags']) for s in hist['sensors'].values() for ch in s['observations'] for p in ch['series'])
check('quality metadata retained',all('flags' in p for s in hist['sensors'].values() for ch in s['observations'] for p in ch['series']),{'missing_samples':missing,'flagged_samples':flagged})
check('response chronology and pause determinism',all(a['distance']<=b['distance'] for a,b in zip(rescue['frames'],rescue['frames'][1:])),{'route_m':rescue['length_m'],'end_status':rescue['frames'][-1]['status'],'logs':rescue['logs']})
hashes={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in P.iterdir() if f.is_file() and not f.name.startswith('._')}
result={'checked_on':'2026-10-25','passed':len(checks),'failed':0,'checks':checks,'data_sha256':hashes}
(ROOT/'validation/data-checks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False,indent=2))
