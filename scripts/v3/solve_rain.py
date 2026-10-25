"""Independent V3 ANUGA rain worker; exact minute-volume forcing."""
from pathlib import Path
import os
os.environ['OMP_NUM_THREADS']='2'
import json,time,argparse
import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy.interpolate import RegularGridInterpolator
from scipy.spatial import cKDTree
from shapely.geometry import Polygon,mapping
import anuga

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'results/anuga-v3';OUT.mkdir(parents=True,exist_ok=True)
P=ROOT/'app/public/data'
parser=argparse.ArgumentParser();parser.add_argument('--spacing',type=float,default=10);parser.add_argument('--case',choices=['compound','historical'],required=True);parser.add_argument('--finaltime',type=float);args=parser.parse_args()
CASE=args.case;HIST=CASE=='historical';DURATION=args.finaltime or (21600 if HIST else 7200);STEP=300 if HIST else 120
OUT=OUT/CASE;OUT.mkdir(parents=True,exist_ok=True)
history=json.loads((P/'history.json').read_text());rt=np.arange(0,DURATION+60,60,dtype=float)
if HIST:
 rain=np.array([next((r['value'] for r in history['rain'] if r['t']==t),0.) for t in rt])
else:
 tt=np.array([0,600,1200,2100,3000,4200,5400,7200]);rr=np.array([0,6,30,60,35,12,0,0]);rain=(np.interp(rt,tt,rr)+np.interp(rt+60,tt,rr))/2/60
rain[-1]=0;rain_cum=np.r_[0,np.cumsum(rain)]
def rainfall_total(t):return float(np.interp(t,np.r_[rt,rt[-1]+60],rain_cum))
def rain_intensity(t):return float(rain[min(len(rain)-1,max(0,int(t//60)))]*60)
from anuga.operators.rate_operators import Rate_operator
class ExactRain(Rate_operator):
 def __call__(self):
  t=self.domain.get_time();dt=self.domain.get_timestep();self.rate=(rainfall_total(t+dt)-rainfall_total(t))/1000/dt if dt else 0.;super().__call__()
started=time.perf_counter();sc=json.loads((P/'city.json').read_text());E,N,R,T=sc['domain'];W,H=R-E,T-N;DX=args.spacing;nx,ny=round(W/DX),round(H/DX)
with rasterio.open(ROOT/'derived/v2/native_terrain_4m.tif') as ds:
    ground=ds.read(1);aff=ds.transform
    xs=aff.c+(np.arange(ds.width)+.5)*aff.a;ys=aff.f+(np.arange(ds.height)+.5)*aff.e
    terrain_interp=RegularGridInterpolator((ys[::-1]-N,xs-E),ground[::-1],bounds_error=False,fill_value=None)
def terrain(x,y):return terrain_interp(np.column_stack([y,x]))

# Finite raised-bed representations of buildings. These are not survey heights.
shapes=[];footprints=[]
for b in sc['geography']['buildings']:
    rings=[[(p[0]+sc['origin'][0],sc['origin'][1]-p[1]) for p in ring] for ring in b['rings']]
    poly=Polygon(rings[0],rings[1:]).buffer(0)
    if not poly.is_empty:
        shapes.append((mapping(poly),float(b['height']+b['roofRise'])))
        footprints.append((mapping(poly),1))
obstacle=rasterize(shapes,out_shape=ground.shape,transform=aff,fill=0,dtype='float32',all_touched=False)
mask=rasterize(footprints,out_shape=ground.shape,transform=aff,fill=0,dtype='uint8',all_touched=False)
def building_height(x,y):
    c=np.clip(((x+E-aff.c)/aff.a).astype(int),0,ground.shape[1]-1);r=np.clip(((y+N-aff.f)/aff.e).astype(int),0,ground.shape[0]-1)
    return obstacle[r,c]
def bed(x,y):return terrain(x,y)+building_height(x,y)

domain=anuga.rectangular_cross_domain(nx,ny,len1=W,len2=H)
domain.set_name('bellinge_'+CASE+'_v3');domain.set_datadir(str(OUT));domain.set_flow_algorithm('DE0');domain.set_cfl(.7);domain.set_store(True)
domain.set_quantity('elevation',bed);domain.set_quantity('friction',.045)
domain.set_quantity('stage',lambda x,y:np.maximum(bed(x,y),13.8))
times=np.array([0,600,1800,3600,4200,6000,7200],dtype=float)
us=np.array([14,15,21,27,27,17,14],dtype=float)
ds=np.array([13.2,13.3,16,23,23,15,13.2],dtype=float)
up=lambda t:13.8 if HIST else float(np.interp(t,times,us));down=lambda t:13.2 if HIST else float(np.interp(t,times,ds))
wall=anuga.Reflective_boundary(domain)
inlet=anuga.Time_boundary(domain,lambda t:[up(t),0.,0.])
outlet=anuga.Time_boundary(domain,lambda t:[down(t),0.,0.])
# Mapped river crosses west boundary around N=6132281 and east around 6133135.
boundary={};tagcounts={}
for (tri,edge),tag in domain.boundary.items():
    mid=domain.get_edge_midpoint_coordinate(tri,edge)
    name='inlet' if tag=='left' and mid[1]<=420 else 'outlet' if tag=='right' and 650<=mid[1]<=1320 else 'wall'
    boundary[(tri,edge)]=name;tagcounts[name]=tagcounts.get(name,0)+1
domain.boundary=boundary
domain.mesh.boundary=boundary
domain.tag_boundary_cells={name:[] for name in ['inlet','outlet','wall']}
for key,name in boundary.items():domain.tag_boundary_cells[name].append(domain.boundary_enumeration[key])
domain.set_boundary({'inlet':inlet,'outlet':outlet,'wall':wall})
rain_operator=ExactRain(domain,rate=0.,label='Exact integrated minute rainfall')

c=domain.centroid_coordinates;areas=domain.areas.copy();z=domain.quantities['elevation'].centroid_values.copy();native_ground=terrain(c[:,0],c[:,1]);ob=np.maximum(z-native_ground,0);tree=cKDTree(c)
# Fixed 8 m render/sample grid; adaptive physics cells do not enter the browser.
COLS,ROWS=201,201;gx=np.linspace(0,W,COLS);gy=np.linspace(H,0,ROWS);xx,yy=np.meshgrid(gx,gy);points=np.column_stack([xx.ravel(),yy.ravel()]);gnd=terrain(points[:,0],points[:,1]);building_grid=building_height(points[:,0],points[:,1])>.1
dist,near=tree.query(points,k=8);weights=1/(dist**2+4)
render=[];native_depth=[];native_velocity=[];native_stage=[];stats=[]
initial_volume=domain.get_water_volume();initial_depth=np.maximum(domain.quantities['stage'].centroid_values-z,0)
for t in domain.evolve(yieldstep=STEP,finaltime=DURATION):
    eta=domain.quantities['stage'].centroid_values.copy();depth=np.maximum(eta-z,0);xm=domain.quantities['xmomentum'].centroid_values;ym=domain.quantities['ymomentum'].centroid_values
    vel=np.column_stack([np.divide(xm,depth,out=np.zeros_like(depth),where=depth>.03),np.divide(ym,depth,out=np.zeros_like(depth),where=depth>.03)])
    native_depth.append(depth.astype('float32'));native_velocity.append(vel.astype('float32'));native_stage.append(eta.astype('float32'))
    # Convex local wet-neighbour interpolation; no upward overshoot. Native dry
    # nearest cells remain dry, except building footprints where the hidden
    # interior free surface is reconstructed from adjacent wet street cells.
    valid=(depth[near]>.025)&((ob[near]<.1)|(depth[near]>.1))&(dist<22)
    w=weights*valid;sumw=w.sum(axis=1);ncell=near[:,0]
    support=(depth[ncell]>.025)|building_grid
    support&=(sumw>0)
    st=np.divide((eta[near]*w).sum(axis=1),sumw,out=gnd.copy(),where=sumw>0)
    rd=np.where(support,np.maximum(st-gnd,0),0);st=np.where(rd>.025,st,gnd)
    ux=np.divide((vel[near,0]*w).sum(axis=1),sumw,out=np.zeros(len(points)),where=sumw>0);uy=np.divide((vel[near,1]*w).sum(axis=1),sumw,out=np.zeros(len(points)),where=sumw>0)
    ux[(rd<.1)|building_grid]=0;uy[(rd<.1)|building_grid]=0
    frame=np.column_stack([st,rd,ux,uy]).astype('<f4');render.append(frame)
    peak=float(depth.max());wet=depth>.05;speed=np.linalg.norm(vel,axis=1);volume=float((areas*depth).sum())
    balance=volume-initial_volume-domain.get_boundary_flux_integral()-rain_operator.cumulative_influx
    stats.append({'t':round(t),'area':round(float(areas[wet].sum()),2),'volume':round(volume,3),'maxDepth':round(peak,4),'rain':rain_intensity(t),'rainCumulative':rainfall_total(t),'rainAddedVolume':float(rain_operator.cumulative_influx),'rainWetArea':round(float(areas[wet&(initial_depth<.03)&(ob<.1)].sum()),2),'rainMaxDepth':round(float(depth[(initial_depth<.03)&(ob<.1)].max()),4),'inletStage':up(t),'outletStage':down(t),'maxSpeed':round(float(speed[depth>.1].max()) if (depth>.1).any() else 0,4),'boundaryVolume':float(domain.get_boundary_flux_integral()),'balanceError':float(balance)})
    if int(t)%600==0:print(json.dumps(stats[-1]),flush=True)

render=np.array(render,dtype='<f4');render.tofile(P/(CASE+'-fields.bin'))
gnd.astype('<f4').tofile(P/(CASE+'-ground.bin'));building_grid.astype('uint8').tofile(P/(CASE+'-buildings.bin'))
np.savez_compressed(OUT/'native-fields.npz',depth=np.array(native_depth),velocity=np.array(native_velocity),stage=np.array(native_stage),centroids=c,areas=areas,bed=z,ground=native_ground,obstacle=ob)
np.savez_compressed(ROOT/('derived/v3/'+CASE+'-grid.npz'),ground=gnd,buildings=building_grid,points=points)
metadata={'id':'BELL-RAINFALL-'+CASE.upper()+'-03','version':'0.3.0','engine':'ANUGA 4.1.0 / DE0','kind':'historical-rainfall-driven-surface-model' if HIST else 'hypothetical-compound-model','title':'历史降雨驱动 · 地表积水试算' if HIST else '假设外洪 + 降雨复合情景','duration':float(DURATION),'step':STEP,'origin':[E,N],'bounds':[E,N,R,T],'nativeCells':len(c),'grid':{'cols':COLS,'rows':ROWS,'width':W,'height':H,'count':COLS*ROWS,'order':'north to south rows; west to east columns','field_components':['stage_m_DVR90','depth_above_native_ground_m','east_velocity_ms','north_velocity_ms'],'dtype':'little-endian float32','frames':len(render),'fields_url':'/data/'+CASE+'-fields.bin','ground_url':'/data/'+CASE+'-ground.bin','building_mask_url':'/data/'+CASE+'-buildings.bin'},'stats':stats,'boundaryHydrograph':[{'t':float(t),'inlet':float(a),'outlet':float(b)} for t,a,b in zip(times,us,ds)],'assumptions':{'case':'measured rg5425 rain on assumed initial river stage and boundary; not validated historical inundation' if HIST else 'hypothetical river-stage and rainfall compound stress; not historical reconstruction','boundary':'west river crossing inlet stage / east river corridor outlet stage; remaining boundaries reflective','rainfall':'rg5425 measured minute volumes, spatially uniform; source timestamp interpreted as interval start' if HIST else 'hypothetical time-varying rainfall, 60 mm/h peak; exact per-step integrated source','initial_stage_m_DVR90':13.8,'mesh_spacing_m':float(DX),'hydraulic_terrain':f'native 0.4 m -> 4 m averages -> {DX:g} m cross mesh','friction_manning_n':.045,'building_obstacles':'finite raised beds using schematic eaves+roof heights; openings and sub-grid lanes unresolved','infiltration':'none','drainage':'none; not coupled to SWMM','rendering':'local convex wet-neighbour stage interpolation on 8 m grid; hidden building interiors filled from adjacent wet cells; native stats are authoritative','particles':'instantaneous velocity-field tracers, not debris or real tracked objects'}}
metadata['boundaryHydrograph']=[{'t':t,'inlet':up(t),'outlet':down(t)} for t in (range(0,int(DURATION)+1,600) if HIST else times)]
metadata['rainSeries']=[{'t':float(t),'value':rain_intensity(t)} for t in rt]
metadata['rainCumulative']=[{'t':float(t),'value':rainfall_total(t)} for t in rt]
metadata['rainGauge']='rg5425' if HIST else 'hypothetical'
metadata['showcaseBuildings']=['B2194','B2742'];metadata['viewpoints']={'district':[583.93,903.36]}
metadata['assumptions'].update({'boundary_momentum':'zero prescribed momentum at both reservoir-stage boundaries','cfl':.7,'drainage':'none; upper-bound sensitivity, not coupled to SWMM','rain_time_convention':'each minute value applies to [timestamp,timestamp+60s); dry gaps in event file treated as zero'})
(P/(CASE+'.json')).write_text(json.dumps(metadata,ensure_ascii=False,separators=(',',':')))
report={'elapsed_seconds':round(time.perf_counter()-started,2),'native_cells':len(c),'frames':len(render),'bed_range_m':[float(z.min()),float(z.max())],'initial_volume_m3':float(initial_volume),'max_abs_balance_error_m3':max(abs(s['balanceError']) for s in stats),'final_volume_m3':stats[-1]['volume'],'final_boundary_volume_m3':stats[-1]['boundaryVolume'],'rain_added_volume_m3':float(rain_operator.cumulative_influx),'rain_expected_volume_m3':rainfall_total(DURATION)/1000*W*H,'rain_total_mm':rainfall_total(DURATION),'rain_peak_mm_h':max(rain)*60,'max_new_ponding_depth_m':max(s['rainMaxDepth'] for s in stats),'max_new_ponding_area_m2':max(s['rainWetArea'] for s in stats),'finite_nonnegative_depth':bool(np.isfinite(native_depth).all() and np.min(native_depth)>=0),'finite_velocity':bool(np.isfinite(native_velocity).all()),'peak_depth_m':max(s['maxDepth'] for s in stats),'peak_speed_ms':max(s['maxSpeed'] for s in stats),'boundary_edge_counts':tagcounts,'binary_bytes':render.nbytes,'historically_calibrated':False,'coupled':False}
(OUT/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,indent=2),flush=True)
