"""Reproducible illustrative aircraft/resources tied to V3 water and source roads.
No hydraulic fields are modified by logistics. Coordinates are local east/south metres.
"""
from pathlib import Path
import json,math,heapq
import numpy as np
import networkx as nx
from scipy.ndimage import map_coordinates,label,uniform_filter
from shapely.geometry import LineString,box
from shapely.ops import unary_union
ROOT=Path(__file__).resolve().parents[2]; P=ROOT/'app/public/data'
def write(case):
 city=json.loads((P/'city.json').read_text());m=json.loads((P/f'{case}.json').read_text());op=json.loads((P/f'{case}-operations.json').read_text());g=m['grid'];duration=int(m['duration']);step=m['step']
 field=np.memmap(P/f'{case}-fields.bin',dtype='<f4',mode='r',shape=(g['frames'],g['rows'],g['cols'],4));mask=np.fromfile(P/f'{case}-buildings.bin',dtype='u1').reshape(g['rows'],g['cols'])
 x0=m['bounds'][0]-city['origin'][0];z0=city['origin'][1]-m['bounds'][3];W=g['width'];H=g['height'];events=[]
 def sample(points,t,comp=1):
  q=np.asarray(points).reshape(-1,2);coords=np.array([(q[:,1]-z0)/H*(g['rows']-1),(q[:,0]-x0)/W*(g['cols']-1)]);f=np.clip(t/step,0,g['frames']-1);i=int(f);j=min(i+1,g['frames']-1)
  return map_coordinates(field[i,:,:,comp],coords,order=1,mode='constant',cval=np.nan)*(1-f+i)+map_coordinates(field[j,:,:,comp],coords,order=1,mode='constant',cval=np.nan)*(f-i)
 def speed(points,t):return np.hypot(sample(points,t,2),sample(points,t,3))
 lines=[LineString(r['points']) for r in city['geography']['roads'] if len(r['points'])>1]
 geom=unary_union(lines).intersection(box(x0+12,z0+12,x0+W-12,z0+H-12));G=nx.Graph();SG=nx.Graph()
 for line in geom.geoms:
  for a,b in zip(list(line.coords),list(line.coords)[1:]):
   a=tuple(round(v,1) for v in a);b=tuple(round(v,1) for v in b);d=math.dist(a,b)
   if d>.3:G.add_edge(a,b,weight=d)
 for a,b,d in G.edges(data=True):
  pts=np.linspace(a,b,max(2,math.ceil(d['weight']/8)+1));safe=all(np.nanmax(sample(pts,t))<.08 and np.nanmax(speed(pts,t))<.25 for t in range(0,duration+1,step))
  if safe:SG.add_edge(a,b,**d)
 def closest(graph,p):return min(graph.nodes,key=lambda q:math.dist(q,p))
 base=op['shelters'][0]['xy'];base_node=closest(SG,base);component=SG.subgraph(nx.node_connected_component(SG,base_node));targets=[closest(component,s['xy']) for s in op['shelters']]
 def safe_route(k):
  target=targets[k%len(targets)]
  if target==base_node:target=max(nx.single_source_dijkstra_path_length(component,base_node,cutoff=500,weight='weight'),key=lambda a:math.dist(a,base_node))
  return [list(a) for a in nx.shortest_path(component,base_node,target,weight='weight')]
 def event(r,t,kind,amount=0,xy=None,until=None):
  e={'id':f"EV-{len(events)+1:04}",'resourceId':r['id'],'t':round(t,3),'kind':kind,'amount':amount,'xy':list(xy or base),'unit':'箱' if amount else None}
  if until is not None:e['until']=round(until,3)
  events.append(e);return e
 def resource(id,name,typ,crew,capacity=0,mission=''):
  return {'id':id,'name':name,'type':typ,'crew':crew,'capacity':capacity,'unit':'箱','mission':mission,'sourceKind':'illustrative','track':[],'route':[],'navigation':{'depthMaxM':.15,'speedMaxMs':.5} if typ in ['vehicle','crew'] else {}}
 # Track rows: [seconds,east,south,AGL metres,status,payload boxes].
 def row(r,t,p,status,payload,alt=0):
  v=[round(float(t),3),round(float(p[0]),3),round(float(p[1]),3),round(float(alt),2),status,round(float(payload),3)]
  if r['track'] and r['track'][-1][0]==v[0]:r['track'][-1]=v
  else:r['track'].append(v)
 def travel(r,t,points,status,payload,velocity,alt=0,check=False):
  for a,b in zip(points,points[1:]):
   dt=math.dist(a,b)/velocity
   if t+dt>duration:return t,list(a),False
   pts=np.linspace(a,b,max(2,math.ceil(math.dist(a,b)/4)+1))
   if check and any(np.nanmax(sample(pts,tt))>=.15 or np.nanmax(speed(pts,tt))>=.5 for tt in np.linspace(t,t+dt,max(2,math.ceil(dt/10)+1))):
    row(r,t,a,'blocked',payload,alt);r['blockedReason']='前方道路达到示意通行阈值';event(r,t,'blocked',xy=a);return t,list(a),False
   t+=dt;row(r,t,b,status,payload,alt)
  return t,list(points[-1]),True
 resources=[]
 # Two rotorcraft: finite stock and deterministic supply cycles.
 for k in range(2):
  r=resource(f'H0{k+1}',['北区物资直升机','南区物资直升机'][k],'helicopter',2,[60,40][k],'集结点物资投送 / 返程补给');resources.append(r)
  dest=op['shelters'][k+1]['xy'];route=[base,[(base[0]+dest[0])/2-180,(base[1]+dest[1])/2+220],dest];r['route']=route;t=300+k*180;payload=r['capacity'];row(r,0,base,'standby',0);row(r,t,base,'loading',0);event(r,t,'load',payload,until=t+45);t+=45;row(r,t,base,'outbound',payload,115)
  for cycle in range(2):
   t,p,ok=travel(r,t,route,'outbound',payload,10,115);row(r,t,p,'delivering',payload,85);event(r,t,'deliver',payload,p,t+50);t+=50;row(r,t,p,'returning',0,85)
   t,p,ok=travel(r,t,list(reversed(route)),'returning',0,10,115);row(r,t,p,'reloading',0);event(r,t,'reload',payload,p,t+90);t+=90;row(r,t,p,'outbound' if cycle==0 else 'complete',payload,115 if cycle==0 else 0)
  row(r,duration,base,'complete',payload)
 # Road vehicles: two dry supply routes and an explicitly checked wet-route attempt.
 for k in range(3):
  r=resource(f'V0{k+1}',['集结点运输车','道路补给车','水情检查车'][k],'vehicle',2,[80,50,0][k],'源路网运输' if k<2 else '动态水情检查 / 受阻停驶');resources.append(r);route=safe_route(k+1);depart=500+k*130
  if k==2:
   start=closest(G,base);pool=[n for n in G if nx.has_path(G,start,n)];wet=sorted(pool,key=lambda n:float(sample([n],duration*.45)[0]),reverse=True)
   target=next((n for n in wet if sample([n],duration*.45)[0]>.3),wet[0]);route=[list(a) for a in nx.shortest_path(G,start,target,weight='weight')];depart=duration*.42
  r['route']=route;cap=r['capacity'];row(r,0,route[0],'standby',0);row(r,depart,route[0],'loading' if cap else 'outbound',0)
  if cap:event(r,depart,'load',cap,route[0],depart+45);depart+=45
  row(r,depart,route[0],'outbound',cap);t,p,ok=travel(r,depart,route,'outbound',cap,3.0 if k<2 else 2.0,check=True)
  if ok and cap:
   row(r,t,p,'delivering',cap);event(r,t,'deliver',cap,p,t+40);t+=40;row(r,t,p,'returning',0);t,p,ok=travel(r,t,list(reversed(route)),'returning',0,3.,check=True)
   if ok:row(r,t,p,'reloading',0);event(r,t,'reload',cap,p,t+90);t+=90;row(r,t,p,'complete',cap)
  elif ok:row(r,t,p,'checking',0)
  if t<duration:row(r,duration,p,r['track'][-1][4],r['track'][-1][5])
 # Rescue crews use the same dry road graph; existing 3 patrol teams remain shared identities.
 for k in range(2):
  r=resource(f'G0{k+1}',['东区支援队','西区支援队'][k],'crew',4,0,'沿干燥道路支援集结点');resources.append(r);route=safe_route(k+1);r['route']=route;depart=900+k*300;row(r,0,base,'standby',0);row(r,depart,route[0],'outbound',0);t,p,ok=travel(r,depart,route,'outbound',0,1.1,check=True)
  if ok:row(r,t,p,'guiding',0);event(r,t,'support',xy=p)
  row(r,duration,p,r['track'][-1][4],0)
 for patrol in op['patrols']:
  r=resource(patrol['id'],patrol['name'],'patrol',patrol['count'],0,'安全巡查 / 边界检查 / 集结点引导');r['route']=patrol['route'];r['sharedPatrol']=True
  for t,x,z,status,target in patrol['track']:row(r,min(t,duration),[x,z],{1:'patrolling',2:'checking',3:'guiding',4:'returning'}[status],0)
  resources.append(r)
 # Boat routes use connected water cells, not road lines. Require depth>=0.4 and speed<=2 for the entire mission interval.
 for k in range(2):
  r=resource(f'B0{k+1}',['河道巡航艇','浅滩检查艇'][k],'boat',2,0,'模型水域巡航');resources.append(r);r['navigation']={'minDepthM':.4,'maxSpeedMs':2.,'buildingMaskExcluded':True};start=duration*(.18+k*.08);finish=min(duration,start+1000)
  f0=int(start//step);f1=min(g['frames'],int(math.ceil(finish/step))+1);valid=(field[f0:f1,:,:,1].min(axis=0)>=.4)&(np.hypot(field[f0:f1,:,:,2],field[f0:f1,:,:,3]).max(axis=0)<=2)&(mask==0)
  labels,n=label(valid);sizes=np.bincount(labels.ravel());sizes[0]=0
  if n and sizes.max()>15:
   comp=labels==sizes.argmax();rr,cc=np.where(comp);first=int(np.argmin(cc+rr*.2));a=(int(rr[first]),int(cc[first]));gg=nx.Graph()
   for y,x in zip(rr,cc):
    for dy,dx in [(1,0),(0,1)]:
     q=(int(y+dy),int(x+dx))
     if 0<=q[0]<g['rows'] and 0<=q[1]<g['cols'] and comp[q]:gg.add_edge((int(y),int(x)),q)
   ds=nx.single_source_shortest_path_length(gg,a);b=max(ds,key=ds.get);path=nx.shortest_path(gg,a,b);path=path if not k else list(reversed(path));path=path[:max(3,min(len(path),100))];route=[[x0+x*W/(g['cols']-1),z0+y*H/(g['rows']-1)] for y,x in path];r['route']=route;row(r,0,route[0],'standby',0);row(r,start,route[0],'patrolling',0);t,p,ok=travel(r,start,route,'patrolling',0,1.8);row(r,t,p,'checking',0);t+=60;row(r,t,p,'returning',0);t,p,ok=travel(r,t,list(reversed(route)),'returning',0,1.8);row(r,t,p,'complete',0);row(r,duration,p,'complete',0)
  else:
   p=op['shelters'][0]['xy'];row(r,0,p,'standby',0);row(r,duration,p,'standby',0);r['blockedReason']='任务窗口内没有满足水深 / 流速条件的连通水路'
 depot=resource('S01','物资补给站','depot',2,6000,'示意库存 / 装载与补给');row(depot,0,base,'supplying',6000);row(depot,duration,base,'supplying',6000);resources.append(depot)
 # UAV paths and gimbals are deterministic. Target positions are in the actual model domain.
 drone_names=['边界测绘','深水监视','孤立积水检查','建筑巡查','区域普查','通信中继'];drones=[]
 def xy_at(ij):
  y,x=ij;return [x0+x*W/(g['cols']-1),z0+y*H/(g['rows']-1)]
 peak=field[round((g['frames']-1)*.5),:,:,1].copy();peak[mask>0]=0
 # Mission targets are actual wet parts of this model, rather than arbitrary dry city points.
 broad=uniform_filter(peak,size=9);broad[:20]=0;broad[-20:]=0;broad[:,:20]=0;broad[:,-20:]=0;deep=xy_at(np.unravel_index(np.argmax(broad),broad.shape))
 by,bx=np.indices(peak.shape);shore=(peak>=.25)&(peak<=1.5)&(mask==0)&(bx>8)&(bx<g['cols']-9)&(by>8)&(by<g['rows']-9)
 coast=xy_at(np.unravel_index(np.argmax(np.where(shore,uniform_filter(peak,size=5),-1)),peak.shape))
 comps,ncomp=label((peak>.05)&(mask==0));sizes=np.bincount(comps.ravel());sizes[0]=0;main=int(sizes.argmax());isolated=(comps!=main)&(comps>0)&(sizes[comps]>=4);isolated[:10]=False;isolated[-10:]=False;isolated[:,:10]=False;isolated[:,-10:]=False
 pond=xy_at(np.unravel_index(np.argmax(np.where(isolated,peak,-1)),peak.shape)) if isolated.any() else coast
 if case=='historical':pond=m['viewpoints']['ponding']
 building=next((b['xy'] for i,b in enumerate(city['geography']['buildings']) if 'B'+str(i).zfill(4) in m.get('showcaseBuildings',[])),[160,80])
 centres=[coast,deep,pond,building,coast,base]
 for k,name in enumerate(drone_names):
  cx,cz=centres[k];cx=float(cx);cz=float(cz);track=[];telemetry=[];height=[140,100,85,90,180,130][k];radius=[270,145,110,190,330,70][k]
  for t in range(0,duration+1,10):
   angle=t/[200,160,125,180,250,210][k]+k;xx=cx+math.cos(angle)*radius;zz=cz+math.sin(angle)*radius*.65;agl=height+math.sin(angle*.5)*8;track.append([t,round(xx,3),round(zz,3),round(agl,3),'mapping' if k==0 else 'surveying',0]);telemetry.append([t,round(94-k*2-t/duration*(58+k),3),round(-62-math.hypot(xx-base[0],zz-base[1])*.015,3)])
  drones.append({'id':f'D0{k+1}','name':name,'type':'fixed-wing' if k in [0,4] else 'quadcopter','mission':name,'target':[cx,cz],'sourceKind':'illustrative','track':track,'telemetry':telemetry})
 detections=[]
 for k,drone in enumerate(drones):
  pts=[drone['target'],*[a['origin'] for a in op['agents'][:12]]]
  for fraction in [.22,.35,.5]:
   t=round(duration*fraction)+k*15;vals=sample(pts,t);i=int(np.nanargmax(vals));depth=float(vals[i])
   if depth>=.15:detections.append({'id':f'DET-{len(detections)+1:03}','t':t,'droneId':drone['id'],'xy':pts[i],'depth':round(depth,4),'label':'模型水深阈值记录','sourceKind':'model-sampling','method':'candidate-point threshold sample, not image recognition'})
 events.sort(key=lambda a:(a['t'],a['id']));detections.sort(key=lambda a:a['t'])
 result={'schemaVersion':1,'version':'0.4.0','modelId':m['id'],'duration':duration,'sourceKind':'illustrative','coordinates':'local east/south metres; AGL relative to displayed terrain','drones':drones,'resources':resources,'events':events,'detections':detections,'assumptions':{'roadThresholds':'h<0.15 m and |v|<0.5 m/s (illustrative)','boats':'h>=0.4 m, |v|<=2 m/s, no building cells in mission window; unverified bathymetry/bridges','aircraft':'scripted paths, not flight planning; AGL relative to terrain','telemetry':'synthetic battery/link; deterministic model-time replay','camera':'same 3D scene; depth/risk are model analysis, not thermal measurements','logistics':'boxes are illustrative; delivery has no hydraulic effect; patrol personnel shared with evacuation, other resource crews separate from population360'}}
 (P/f'{case}-missions.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
 print(case,'drones',len(drones),'resources',len(resources),'events',len(events),'detections',len(detections),'boats',[len(r['route']) for r in resources if r['type']=='boat'],'blocked',[r['id'] for r in resources if any(a[4]=='blocked' for a in r['track'])])
for case in ['compound','historical']:write(case)
