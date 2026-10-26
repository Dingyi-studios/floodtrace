from pathlib import Path
import json,math
import numpy as np
from scipy.ndimage import map_coordinates
R=Path(__file__).resolve().parents[2];P=R/'app/public/data';checks=[]
for case in ['compound','historical']:
 m=json.loads((P/f'{case}.json').read_text());p=json.loads((P/f'{case}-missions.json').read_text());city=json.loads((P/'city.json').read_text());g=m['grid'];f=np.memmap(P/f'{case}-fields.bin',dtype='<f4',mode='r',shape=(g['frames'],g['rows'],g['cols'],4));mask=np.fromfile(P/f'{case}-buildings.bin',dtype='u1').reshape(g['rows'],g['cols']);x0=m['bounds'][0]-city['origin'][0];z0=city['origin'][1]-m['bounds'][3]
 def read(x,z,t,c):
  co=np.array([[(z-z0)/g['height']*(g['rows']-1)],[(x-x0)/g['width']*(g['cols']-1)]]);i=int(min(g['frames']-1,t/m['step']));j=min(i+1,g['frames']-1);u=t/m['step']-i
  return float(map_coordinates(f[i,:,:,c],co,order=1,mode='constant',cval=np.nan)[0]*(1-u)+map_coordinates(f[j,:,:,c],co,order=1,mode='constant',cval=np.nan)[0]*u)
 details=[]
 for r in p['resources']:
  if r['type'] not in ['vehicle','crew','boat']:continue
  seen=0;maxh=0;maxv=0;minh=999
  for a,b in zip(r['track'],r['track'][1:]):
   if a[4] not in ['outbound','returning','patrolling'] or math.dist(a[1:3],b[1:3])<.001:continue
   for u in np.linspace(0,1,max(3,math.ceil(math.dist(a[1:3],b[1:3])/2)+1)):
    x=a[1]*(1-u)+b[1]*u;z=a[2]*(1-u)+b[2]*u;t=a[0]*(1-u)+b[0]*u;h=read(x,z,t,1);v=math.hypot(read(x,z,t,2),read(x,z,t,3));assert math.isfinite(h) and math.isfinite(v)
    if r['type']=='boat':
     assert h>=.3999 and v<=2.001,(case,r['id'],t,h,v)
     ix=round((x-x0)/g['width']*(g['cols']-1));iz=round((z-z0)/g['height']*(g['rows']-1));assert mask[iz,ix]==0
    else:assert h<.1501 and v<.5001,(case,r['id'],t,h,v)
    maxh=max(maxh,h);maxv=max(maxv,v);minh=min(minh,h);seen+=1
  details.append({'id':r['id'],'sampleCount':seen,'maxDepth':maxh,'minDepth':None if not seen else minh,'maxSpeed':maxv})
 checks.append({'case':case,'check':'independent 2m segment water/depth/speed and boat obstacle checks','passed':True,'resources':details})
 for d in p['detections']:
  h=read(*d['xy'],d['t'],1);assert abs(h-d['depth'])<.0002,(case,d,h)
 checks.append({'case':case,'check':'each detection matches model field at recorded place/time','passed':True,'count':len(p['detections'])})
 assert p['modelId']==m['id'];assert len({d['id'] for d in p['drones']})==6;assert all(min(row[3] for row in d['track'])>=65 for d in p['drones'])
 checks.append({'case':case,'check':'model identity and minimum terrain-relative AGL65m','passed':True})
(R/'validation/v4/navigation-checks.json').write_text(json.dumps({'passed':len(checks),'failed':0,'checks':checks},ensure_ascii=False,indent=2));print(len(checks),'navigation/data checks passed')
