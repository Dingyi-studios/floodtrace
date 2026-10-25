"""Native physics, independent coordinates and visualization data checks."""
from pathlib import Path
import json,hashlib
import numpy as np
import rasterio
from rasterio.features import rasterize
from shapely.geometry import Polygon,mapping
from scipy.spatial import cKDTree
from scipy.ndimage import map_coordinates

ROOT=Path(__file__).resolve().parents[2];P=ROOT/'app/public/data';OUT=ROOT/'validation/v2'
m=json.loads((P/'urban.json').read_text());city=json.loads((P/'city.json').read_text());v=json.loads((ROOT/'results/anuga-v2/validation.json').read_text());n=np.load(ROOT/'results/anuga-v2/native-fields.npz');g=m['grid'];checks=[]
def check(name,ok,details):
    checks.append({'name':name,'pass':bool(ok),'details':details});assert ok,(name,details)
field=np.fromfile(P/'urban-fields.bin',dtype='<f4').reshape(g['frames'],g['count'],4);ground=np.fromfile(P/'urban-ground.bin',dtype='<f4');mask=np.fromfile(P/'urban-buildings.bin',dtype='uint8')
check('binary frame layout',field.shape==(61,40401,4) and ground.size==40401 and mask.size==40401,{'bytes':field.nbytes,'native_cells':m['nativeCells'],'components':g['field_components']})
check('finite nonnegative native fields',np.isfinite(n['depth']).all() and (n['depth']>=0).all() and np.isfinite(n['velocity']).all(),{'depth_range_m':[float(n['depth'].min()),float(n['depth'].max())],'max_speed_ms':v['peak_speed_ms']})
vol=n['depth']@n['areas'];theory=v['initial_volume_m3']+np.array([s['boundaryVolume'] for s in m['stats']]);error=np.max(abs(vol-theory));relative=error/max(theory.max(),1)
check('native open-boundary volume balance',relative<1e-6 and v['max_abs_balance_error_m3']<.01,{'native_solver_max_abs_error_m3':v['max_abs_balance_error_m3'],'float32_saved_fields_max_abs_error_m3':float(error),'relative_saved_field_error':float(relative)})
check('full rise and retreat',vol[35]>vol[10]*5 and vol[-1]<vol[35]*.15,{'volume_20min_m3':float(vol[10]),'volume_70min_m3':float(vol[35]),'volume_end_m3':float(vol[-1])})

# Reconstruct sampled triangle vertex positions independently from centroid
# location and the rectangular-cross cell geometry; sample raster via its affine.
c=n['centroids'];spacing=m['assumptions']['mesh_spacing_m'];rng=np.random.default_rng(43);ids=rng.choice(len(c),1024,replace=False);cc=c[ids];cell=np.floor(cc/spacing)*spacing;local=(cc-cell)/spacing
vertices=[]
for p,l in zip(cell,local):
    a=p;d=p+[spacing,spacing];b=p+[spacing,0];e=p+[0,spacing];center=p+spacing/2
    tri=[a,center,e] if l[0]<.34 else [d,center,b] if l[0]>.66 else [b,center,a] if l[1]<.5 else [e,center,d]
    vertices.append(tri)
vertices=np.array(vertices)+m['origin'];flat=vertices.reshape(-1,2)
with rasterio.open(ROOT/'derived/v2/native_terrain_4m.tif') as ds:
    z=ds.read(1);aff=ds.transform
    fx=(flat[:,0]-aff.c)/aff.a-.5;fy=(flat[:,1]-aff.f)/aff.e-.5;ix=np.clip(np.floor(fx).astype(int),0,ds.width-2);iy=np.clip(np.floor(fy).astype(int),0,ds.height-2);a=fx-ix;b=fy-iy
    bare=z[iy,ix]*(1-a)*(1-b)+z[iy,ix+1]*a*(1-b)+z[iy+1,ix]*(1-a)*b+z[iy+1,ix+1]*a*b
    shapes=[]
    for bu in city['geography']['buildings']:
        rings=[[(p[0]+city['origin'][0],city['origin'][1]-p[1]) for p in ring] for ring in bu['rings']];poly=Polygon(rings[0],rings[1:]).buffer(0)
        if not poly.is_empty:shapes.append((mapping(poly),bu['height']+bu['roofRise']))
    blocks=rasterize(shapes,out_shape=z.shape,transform=aff,fill=0,dtype='float32',all_touched=False);ri=np.clip(((flat[:,1]-aff.f)/aff.e).astype(int),0,ds.height-1);ci=np.clip(((flat[:,0]-aff.c)/aff.a).astype(int),0,ds.width-1)
    expected=(bare+blocks[ri,ci]).reshape(-1,3).mean(axis=1);bederr=np.max(abs(expected-n['bed'][ids]))
check('independent native terrain and building-bed registration',bederr<1e-5,{'random_triangles':len(ids),'max_error_m':float(bederr),'crs':'EPSG:25832 / DVR90','note':'Consistency, not measurement accuracy.'})

wet=field[:,:,1]>.05;stage_error=np.max(abs((field[:,:,0]-ground[None,:]-field[:,:,1])[wet]))
check('free surface equals ground plus displayed water depth',stage_error<1e-4,{'wet_max_error_m':float(stage_error),'surface_height_bias_m':.018,'waves_change_normals_only':True})
check('dry shallow and building velocity masks',np.max(abs(field[:,:,2:][field[:,:,1]<.1]))==0 and np.max(abs(field[:,:,2:][:,mask.astype(bool)]))==0,{'shallow_cutoff_m':.1,'building_mask_nodes':int(mask.sum())})

# Compare smooth free-surface data to nearby native street cells in robust wet
# interiors, away from building and front discontinuities.
xx,yy=np.meshgrid(np.linspace(0,g['width'],g['cols']),np.linspace(g['height'],0,g['rows']));points=np.column_stack([xx.ravel(),yy.ravel()]);dist,near=cKDTree(c).query(points,k=8);dd=n['depth'][30];ob=n['obstacle'];eligible=(dd[near]>.5).all(axis=1)&(ob[near]<.05).all(axis=1)&(~mask.astype(bool))
stage_diff=abs(field[30,:,0]-n['stage'][30,near[:,0]])[eligible]
check('display interpolation tracks native wet streets',len(stage_diff)>200 and np.quantile(stage_diff,.95)<.3,{'samples':int(len(stage_diff)),'p95_stage_difference_m':float(np.quantile(stage_diff,.95)),'max_stage_difference_m':float(stage_diff.max()),'method':'convex local wet-neighbour interpolation'})

derived=json.loads((ROOT/'derived/v2/derived-scenes.json').read_text());bc=derived['building_counts_at_60min']
check('schematic buildings show deep inundation',bc['roofOnly']>0 and bc['roofSubmerged']>0 and bc['upperFloor']>0,bc)
bi=np.load(ROOT/'derived/v2/building-inundation.npz');ex=m['showcaseBuildings'][0];index=int(ex[1:]);house=city['geography']['buildings'][index]
check('same building progresses from dry to roof exposure and retreat',bi['depth'][10,index]<.15 and bi['depth'][30,index]>house['height'] and bi['depth'][30,index]<house['height']+house['roofRise'] and bi['depth'][55,index]<1,{'building':ex,'depth_20min':float(bi['depth'][10,index]),'depth_60min':float(bi['depth'][30,index]),'depth_110min':float(bi['depth'][55,index]),'height_is_schematic':True})
e=json.loads((P/'urban-emergency.json').read_text());check('response is bound to V2 water result',e['resultVersion']==m['id'] and all(a['distance']<=b['distance'] for a,b in zip(e['frames'],e['frames'][1:])),{'route_m':e['length_m'],'logs':e['logs']})
check('scenario metadata remains explicit',m['kind']=='hypothetical-model' and not v['historically_calibrated'] and not v['coupled'],{'scenario':m['id'],'boundary':m['assumptions']['boundary'],'particle_semantics':m['assumptions']['particles']})
hashes={name:hashlib.sha256((P/name).read_bytes()).hexdigest() for name in ['city.json','urban.json','urban-fields.bin','urban-ground.bin','urban-buildings.bin','urban-emergency.json','city-ground.jpg']}
report={'checked_on':'2026-10-25','passed':len(checks),'failed':0,'checks':checks,'sha256':hashes}
(OUT/'data-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
