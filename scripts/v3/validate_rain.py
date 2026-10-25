"""Validate source separation, exact rain volumes, physical balance and risk labels."""
from pathlib import Path
import json,hashlib
import numpy as np
from scipy.ndimage import map_coordinates
ROOT=Path(__file__).resolve().parents[2];P=ROOT/'app/public/data';checks=[]
def check(name,ok,details):
 checks.append({'name':name,'pass':bool(ok),'details':details});assert ok,(name,details)
h=json.loads((P/'history.json').read_text());totals={g:sum(p['value'] for p in a) for g,a in h['rainByGauge'].items()}
check('separate rain gauges with unique ordered minutes',all(len(a)==361 and len({r['t'] for r in a})==361 and all(x['t']<y['t'] for x,y in zip(a,a[1:])) for a in h['rainByGauge'].values()) and abs(totals['rg5425']-19.40046)<1e-7 and h['rain']==h['rainByGauge']['rg5425'],totals)
city=json.loads((P/'city.json').read_text())
for case in ['compound','historical']:
 m=json.loads((P/(case+'.json')).read_text());r=json.loads((ROOT/'results/anuga-v3'/case/'validation.json').read_text());g=m['grid'];a=np.fromfile(P/(case+'-fields.bin'),dtype='<f4').reshape(g['frames'],g['rows'],g['cols'],4);ground=np.fromfile(P/(case+'-ground.bin'),dtype='<f4').reshape(g['rows'],g['cols']);mask=np.fromfile(P/(case+'-buildings.bin'),dtype='uint8').reshape(g['rows'],g['cols'])
 check(case+' finite water fields and binary layout',np.isfinite(a).all() and a[:,:,:,1].min()>=0,{'frames':g['frames'],'native_cells':m['nativeCells'],'bytes':a.nbytes})
 check(case+' exact integrated rainfall volume',abs(r['rain_added_volume_m3']-r['rain_expected_volume_m3'])<1e-5,{'mm':r['rain_total_mm'],'computed_m3':r['rain_added_volume_m3'],'expected_m3':r['rain_expected_volume_m3']})
 check(case+' open-boundary and rainfall water balance',r['max_abs_balance_error_m3']<.01 and r['finite_nonnegative_depth'] and r['finite_velocity'],{'max_balance_error_m3':r['max_abs_balance_error_m3']})
 wet=a[:,:,:,1]>.05;err=abs(a[:,:,:,0]-ground[None]-a[:,:,:,1])[wet].max();check(case+' water level registration and velocity masks',err<1e-4 and np.max(abs(a[:,:,:,2:][:,mask.astype(bool)]))==0,{'max_stage_depth_error_m':float(err)})
 ops=json.loads((P/(case+'-operations.json')).read_text());rr=ops['risk'];risk=np.fromfile(P/(case+'-risk.bin'),dtype='uint8').reshape(rr['frames'],rr['rows'],rr['cols']);check(case+' risk coverage and classes',set(np.unique(risk))=={0,1,2,3} and len(ops['agents'])==18,{'classes':np.unique(risk).tolist(),'bytes':risk.nbytes})
 # Independently sample the outdoor risk cell centres against all saved water fields.
 xs=(np.arange(rr['cols'])+.5)/rr['cols']*(g['cols']-1);zs=(np.arange(rr['rows'])+.5)/rr['rows']*(g['rows']-1);xx,zz=np.meshgrid(xs,zs);cc=np.array([zz.ravel(),xx.ravel()]);depth=np.array([map_coordinates(f[:,:,1],cc,order=1) for f in a]);speed=np.array([np.hypot(map_coordinates(f[:,:,2],cc,order=1),map_coordinates(f[:,:,3],cc,order=1)) for f in a]);solid=map_coordinates(mask.astype(float),cc,order=1)>.35;violations=0;green_count=0
 for k in range(0,rr['frames'],max(1,rr['frames']//10)):
  t=k*rr['step'];lo=int(t//m['step']);hi=min(g['frames']-1,int(np.ceil(min(m['duration'],t+1860)/m['step'])));green=risk[k].ravel()==1;green_count+=int(green.sum());violations+=int(((depth[lo:hi+1].max(axis=0)[green]>=.08001)|(speed[lo:hi+1].max(axis=0)[green]>=.25001)|solid[green]).sum())
 check(case+' green zones obey full forecast depth/speed and outdoor mask',violations==0 and green_count>0,{'green_cells_checked':green_count,'violations':violations,'forecast_s':1800,'bin_buffer_s':60})
 # Check interpolated moving leaders and patrols, independently of route planning.
 x0=m['bounds'][0]-city['origin'][0];z0=city['origin'][1]-m['bounds'][3]
 def sample(x,z,t):
  f=np.clip(t/m['step'],0,g['frames']-1);i=int(f);j=min(i+1,g['frames']-1);q=np.array([[(z-z0)/g['height']*(g['rows']-1)],[(x-x0)/g['width']*(g['cols']-1)]]);return float(map_coordinates(a[i,:,:,1],q,order=1)[0]*(1-f+i)+map_coordinates(a[j,:,:,1],q,order=1)[0]*(f-i))
 max_walk=0;max_patrol=0;walk_samples=0
 for group in ops['agents']:
  for aa,bb in zip(group['track'],group['track'][1:]):
   if aa[3]!=1 or bb[0]<=aa[0] or np.linalg.norm(np.array(aa[1:3])-bb[1:3])<.001:continue
   for u in [.25,.75]:
    t=aa[0]*(1-u)+bb[0]*u;x=aa[1]*(1-u)+bb[1]*u;z=aa[2]*(1-u)+bb[2]*u;max_walk=max(max_walk,sample(x,z,t));walk_samples+=1
 for group in ops['patrols']:
  for aa,bb in zip(group['track'],group['track'][1:]):
   for u in [.5]:
    t=min(m['duration'],aa[0]*(1-u)+bb[0]*u);x=aa[1]*(1-u)+bb[1]*u;z=aa[2]*(1-u)+bb[2]*u;max_patrol=max(max_patrol,sample(x,z,t))
 check(case+' moving leaders and patrols respect sampled dry-route rules',max_walk<.18 and max_patrol<.1,{'leader_samples':walk_samples,'max_leader_depth_m':max_walk,'max_patrol_depth_m':max_patrol,'display_interpolation_tolerance_m':.03})
 if case=='historical':check('historical source rain creates visible modeled ponding',r['max_new_ponding_depth_m']>.1 and r['max_new_ponding_area_m2']>1000 and not r['historically_calibrated'],{'native_max_new_depth_m':r['max_new_ponding_depth_m'],'native_max_new_area_m2':r['max_new_ponding_area_m2'],'not_historical_inundation_observation':True})
report={'checked_on':'2026-10-25','passed':len(checks),'failed':0,'checks':checks};(ROOT/'validation/v3/data-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
