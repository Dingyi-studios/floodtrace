"""Derive building examples and response rules from the completed V2 field."""
from pathlib import Path
import json
import numpy as np
from scipy.ndimage import map_coordinates

ROOT=Path(__file__).resolve().parents[2];P=ROOT/'app/public/data';D=ROOT/'derived/v2'
s=json.loads((P/'city.json').read_text());m=json.loads((P/'urban.json').read_text());g=m['grid'];f=np.fromfile(P/'urban-fields.bin',dtype='<f4').reshape(g['frames'],g['rows'],g['cols'],4)
assert g['frames']==61 and m['nativeCells']==102400
x0=m['bounds'][0]-s['origin'][0];z0=s['origin'][1]-m['bounds'][3];stepx=g['width']/(g['cols']-1);stepz=g['height']/(g['rows']-1)
def sample(points,frame,component):
    pts=np.asarray(points);coords=np.array([(pts[:,1]-z0)/stepz,(pts[:,0]-x0)/stepx]);return map_coordinates(f[frame,:,:,component],coords,order=1,mode='constant',cval=np.nan)

points=[];owners=[]
for i,b in enumerate(s['geography']['buildings']):
    pp=[b['xy']]
    for ring in b['rings']:
        for a,c in zip(ring,ring[1:]):
            mid=(np.array(a)+c)/2;vec=mid-b['xy'];l=np.linalg.norm(vec)
            pp.append((mid+vec/(l or 1)*4).tolist())
    points.extend(pp);owners.extend([i]*len(pp))
points=np.array(points);owners=np.array(owners);nb=len(s['geography']['buildings']);ground=np.array([b['ground'] for b in s['geography']['buildings']]);height=np.array([b['height'] for b in s['geography']['buildings']]);roof=height+np.array([b['roofRise'] for b in s['geography']['buildings']])
depths=[];stages=[];counts=[]
for frame in range(g['frames']):
    st=sample(points,frame,0);h=sample(points,frame,1);level=np.where((h>.05)&np.isfinite(st),st,-np.inf);highest=np.full(nb,-np.inf);np.maximum.at(highest,owners,level)
    d=np.where(np.isfinite(highest),np.maximum(0,highest-ground),0);depths.append(d.astype('float32'));stages.append(highest.astype('float32'))
    counts.append({'t':frame*120,'roofOnly':int(((d>height)&(d<=roof)).sum()),'roofSubmerged':int((d>roof).sum()),'upperFloor':int(((d>2.9)&(d<=height)).sum()),'groundFloor':int(((d>.12)&(d<=2.9)).sum())})
depths=np.array(depths);stages=np.array(stages);np.savez_compressed(D/'building-inundation.npz',depth=depths,stage=stages)
peak=30;dd=depths[peak];eligible=np.array([b['floors']==2 and b['area']>70 and b['roofType']=='pitched' for b in s['geography']['buildings']]);xy=np.array([b['xy'] for b in s['geography']['buildings']]);distance=np.linalg.norm(xy-[-65,820],axis=1)
showcase=[]
for cond in [(dd>height)&(dd<=roof)&eligible,(dd>1)&(dd<height-.3)&eligible,(dd>roof)&eligible]:
    ids=np.where(cond)[0]
    if len(ids):showcase.append(int(ids[distance[ids].argmin()]))
assert len(showcase)>=2,'No meaningful building-inundation examples'
m['showcaseBuildings']=['B'+str(i).zfill(4) for i in showcase]
m['viewpoints']={'district':s['geography']['buildings'][showcase[0]]['xy']}
m['buildingInundationCounts']=counts
m['assumptions']['hydraulic_terrain']=f"native 0.4 m -> 4 m averages -> {m['assumptions']['mesh_spacing_m']:g} m cross mesh"
m['assumptions']['boundary_momentum']='zero prescribed momentum at the two external reservoir-stage boundaries'
m['assumptions']['cfl']=.7
(P/'urban.json').write_text(json.dumps(m,ensure_ascii=False,separators=(',',':')))

# Reuse the existing source-road candidate, recomputing every water-depth rule.
e=json.loads((P/'emergency.json').read_text());route=np.array(e['route']);dist=np.minimum(np.arange(len(route))*10,e['length_m']);speed=8000/3600;depart=1200
def dep(point,t):
    ff=np.clip(t/120,0,60);a=int(ff);b=min(60,a+1);u=ff-a
    da=float(sample([point],a,1)[0]);db=float(sample([point],b,1)[0]);return (da*(1-u)+db*u) if np.isfinite(da+db) else 0.
stop=None;end=e['length_m']
for i,p in enumerate(route):
    if dep(p,depart+dist[i]/speed)>=.3:stop=max(0,i-1);end=float(dist[stop]);break
end_time=depart+end/speed
frames=[]
for k in range(61):
    t=k*120;d=min(end,max(0,(t-depart)*speed));ix=min(len(route)-2,int(d//10));u=np.clip((d-dist[ix])/max(.0001,dist[ix+1]-dist[ix]),0,1);pos=route[ix]*(1-u)+route[ix+1]*u
    status='待出发' if t<depart else '沿线巡查' if t<end_time else '水深受阻' if stop is not None else '驻点受淹' if dep(pos,t)>=.3 else '到达检查点'
    all_depth=np.nan_to_num(sample(route,k,1),nan=0.)
    frames.append({'distance':round(d,2),'xy':np.round(pos,3).tolist(),'status':status,'progress':round(d/e['length_m'],4),'maxDepth':round(float(all_depth.max()),4),'wetLength':int((all_depth>=.3).sum())*10})
logs=[{'t':0,'text':'假设资源就绪 · 新外洪情景'},{'t':depart,'text':'R01 · 沿源道路候选路线出发'},{'t':round(end_time),'text':'R01 · 达到 0.30 m 阈值，停止进入' if stop is not None else 'R01 · 到达候选检查点'}]
last=False
for k,frame in enumerate(frames):
    iswet=frame['status']=='驻点受淹'
    if iswet!=last and k*120>=end_time:logs.append({'t':k*120,'text':'R01 · 驻点水深超阈（假设）' if iswet else 'R01 · 驻点水深回落（假设）'})
    last=iswet
e['frames']=frames;e['logs']=sorted(logs,key=lambda p:p['t']);e['resultVersion']=m['id'];e['assumptions']['depth_sampling']='bilinear 8 m render-grid depth, linear between 120 s field frames at road arrival time; physical source mesh 10 m'
(P/'urban-emergency.json').write_text(json.dumps(e,ensure_ascii=False,separators=(',',':')))
report={'showcase':[{**{k:s['geography']['buildings'][i][k] for k in ['id','xy','ground','height','roofRise','floors']},'uiId':'B'+str(i).zfill(4),'depth_at_60min_m':float(dd[i])} for i in showcase],'building_counts_at_60min':counts[30],'building_counts_at_70min':counts[35],'route_length_m':e['length_m'],'route_terminal':frames[-1],'route_logs':e['logs'],'note':'All building heights and response resources are schematic; counts describe this model-based visualization, not observed damage.'}
(D/'derived-scenes.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
