"""Independent ANUGA executable: closed-basin pluvial stress scenario."""
from pathlib import Path
import os
os.environ['OMP_NUM_THREADS']='2'
import json,time
import numpy as np
import rasterio
from scipy.interpolate import RegularGridInterpolator
import anuga

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'results/anuga'
OUT.mkdir(parents=True,exist_ok=True)
start=time.perf_counter()
with rasterio.open(ROOT/'derived/hydraulic_terrain_10m.tif') as ds:
    terrain=ds.read(1);aff=ds.transform
east,north=583200,6132200
xi=np.arange(terrain.shape[1])*10+583205-east
yi=6133195-north-np.arange(terrain.shape[0])*10
interp=RegularGridInterpolator((yi[::-1],xi),terrain[::-1],bounds_error=False,fill_value=None)
def z(x,y):return interp(np.column_stack([y,x]))
domain=anuga.rectangular_cross_domain(48,40,len1=1200,len2=1000)
domain.set_name('bellinge_pluvial_90mmh')
domain.set_datadir(str(OUT))
domain.set_store(True)
domain.set_flow_algorithm('DE0')
domain.set_quantity('elevation',z)
domain.set_quantity('friction',.04)
domain.set_quantity('stage',z)
wall=anuga.Reflective_boundary(domain)
domain.set_boundary({tag:wall for tag in domain.get_boundary_tags()})
rain=anuga.Rate_operator(domain,rate=lambda t:90/1000/3600 if t<3600 else 0)
c=domain.centroid_coordinates
areas=domain.areas
elev=domain.quantities['elevation'].centroid_values.copy()
assert elev.min()>=terrain.min()-3 and elev.max()<=terrain.max()+3, 'Interpolated bed exceeds source range; inspect coordinate registration'
depths=[];velocity=[];stats=[]
for t in domain.evolve(yieldstep=120,finaltime=7200):
    depth=np.maximum(domain.quantities['stage'].centroid_values-elev,0)
    xmom=domain.quantities['xmomentum'].centroid_values
    ymom=domain.quantities['ymomentum'].centroid_values
    vel=np.column_stack([np.divide(xmom,depth,out=np.zeros_like(depth),where=depth>.02),np.divide(ymom,depth,out=np.zeros_like(depth),where=depth>.02)])
    depths.append(depth.astype('float32'));velocity.append(vel.astype('float32'))
    expected=1200000*.09*min(t,3600)/3600
    stats.append({'t':round(t),'area':round(float(areas[depth>.05].sum()),1),'volume':round(float((areas*depth).sum()),2),'maxDepth':round(float(depth.max()),3),'rain':90 if t<3600 else 0,'expectedVolume':round(expected,2)})
    if int(t)%600==0:print(json.dumps(stats[-1]),flush=True)

# Store native mesh connectivity and centroid fields. Browser renders actual
# piecewise constant cells and linearly interpolates only between output frames.
depths=np.array(depths);velocity=np.array(velocity)
np.savez_compressed(OUT/'fields.npz',depth=depths,velocity=velocity,centroids=c,areas=areas,elevation=elev)
mesh={'vertices':np.round(domain.get_nodes(),3).tolist(),'triangles':domain.triangles.tolist(),'centroids':np.round(c,3).tolist(),'elevation':np.round(elev,3).tolist(),'areas':areas.tolist()}
obj={'id':'BELL-PLUVIAL-01','engine':'ANUGA 4.1.0 / DE0','kind':'hypothetical-model','duration':7200,'step':120,'origin':[east,north],'mesh':mesh,'depth':np.round(depths,4).tolist(),'velocity':np.round(velocity,4).tolist(),'stats':stats,'assumptions':{'rainfall_mm_h':90,'rain_duration_s':3600,'initial':'dry','boundary':'all reflective / no flux','roughness_manning':.04,'infiltration':'zero','drainage':'zero; independent surface model','mesh_spacing_m':25,'building_obstacles':False}}
(ROOT/'app/public/data/surface.json').write_text(json.dumps(obj,separators=(',',':'),allow_nan=False))
balance=max(abs(s['volume']-s['expectedVolume']) for s in stats)
report={'engine':obj['engine'],'cells':len(c),'frames':len(stats),'elapsed_s':round(time.perf_counter()-start,2),'nonnegative_depth':bool((depths>=0).all()),'finite_fields':bool(np.isfinite(depths).all() and np.isfinite(velocity).all()),'bed_range_m':[float(elev.min()),float(elev.max())],'native_aggregated_grid_range_m':[float(terrain.min()),float(terrain.max())],'max_mass_error_m3':round(balance,3),'relative_final_mass_error':abs(stats[-1]['volume']-108000)/108000,'expected_final_volume_m3':108000,'actual_final_volume_m3':stats[-1]['volume'],'limitations':obj['assumptions']}
(OUT/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
assert report['finite_fields'] and report['nonnegative_depth'] and report['relative_final_mass_error']<.01
print(json.dumps(report,indent=2),flush=True)
