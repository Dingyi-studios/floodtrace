"""Deterministic illustrative evacuation on noded source roads and V3 water fields."""
from pathlib import Path
import json,math,argparse,heapq
import numpy as np
import networkx as nx
from shapely.geometry import LineString,box
from shapely.ops import unary_union
from scipy.ndimage import map_coordinates
from scipy.spatial import cKDTree
ROOT=Path(__file__).resolve().parents[2];P=ROOT/'app/public/data';D=ROOT/'derived/v3'
parser=argparse.ArgumentParser();parser.add_argument('--case',choices=['compound','historical'],required=True);args=parser.parse_args();case=args.case
city=json.loads((P/'city.json').read_text());m=json.loads((P/(case+'.json')).read_text());g=m['grid'];field=np.fromfile(P/(case+'-fields.bin'),dtype='<f4').reshape(g['frames'],g['rows'],g['cols'],4)
x0=m['bounds'][0]-city['origin'][0];z0=city['origin'][1]-m['bounds'][3];W,H=g['width'],g['height'];end=int(m['duration']);step=m['step'];clip=box(x0+12,z0+12,x0+W-12,z0+H-12)
def coords(points):
 q=np.asarray(points);return np.array([(q[:,1]-z0)/H*(g['rows']-1),(q[:,0]-x0)/W*(g['cols']-1)])
def sample_all(points,component):
 cc=coords(points);return np.array([map_coordinates(f[:,:,component],cc,order=1,mode='constant',cval=np.nan) for f in field])
lines=[LineString(r['points']) for r in city['geography']['roads'] if len(r['points'])>1]
network=unary_union(lines).intersection(clip);G=nx.Graph()
for line in network.geoms:
 cs=list(line.coords)
 for a,b in zip(cs,cs[1:]):
  a=tuple(round(v,1) for v in a);b=tuple(round(v,1) for v in b)
  length=math.dist(a,b)
  if length>.3:G.add_edge(a,b,length=length)
nodes=list(G.nodes);node_index={p:i for i,p in enumerate(nodes)};xy=np.array(nodes);edges=list(G.edges);samples=[];owners=[];adj=[[] for _ in nodes]
for i,(a,b) in enumerate(edges):
 G[a][b]['eid']=i;length=G[a][b]['length'];n=max(2,int(math.ceil(length/8))+1)
 for u in np.linspace(0,1,n):samples.append(np.array(a)*(1-u)+np.array(b)*u);owners.append(i)
 ia,ib=node_index[a],node_index[b];adj[ia].append((ib,i,length));adj[ib].append((ia,i,length))
nh=sample_all(xy,1);nv=np.hypot(sample_all(xy,2),sample_all(xy,3));sh=sample_all(samples,1);sv=np.hypot(sample_all(samples,2),sample_all(samples,3));owners=np.array(owners)
eh=np.zeros((g['frames'],len(edges)),dtype='float32');ev=eh.copy()
for f in range(g['frames']):np.maximum.at(eh[f],owners,sh[f]);np.maximum.at(ev[f],owners,sv[f])
def value(a,t,index):
 f=np.clip(t/step,0,g['frames']-1);i=int(f);j=min(i+1,g['frames']-1);return a[i,index]*(1-f+i)+a[j,index]*(f-i)
def edge_safe(e,a,b,depth=.15,speed=.5):
 lo=max(0,int(a//step));hi=min(g['frames']-1,int(math.ceil(b/step)))
 return max(value(eh,a,e),value(eh,b,e),eh[lo:hi+1,e].max(initial=0))<depth and max(value(ev,a,e),value(ev,b,e),ev[lo:hi+1,e].max(initial=0))<speed
# Shelters are illustrative road-side candidate points with all-window dry access.
safe_edges=[(a,b) for i,(a,b) in enumerate(edges) if eh[:,i].max()<.08 and ev[:,i].max()<.25]
SG=nx.Graph();SG.add_weighted_edges_from((a,b,G[a][b]['length']) for a,b in safe_edges);cc=max(nx.connected_components(SG),key=len);SG=SG.subgraph(cc).copy();candidates=np.array([node_index[p] for p in SG.nodes if nh[:,node_index[p]].max()<.06])
selected=[]
for target in [[50,-100],[800,0],[700,500]]:
 valid=[i for i in candidates if all(math.dist(xy[i],xy[j])>250 for j in selected)] or list(candidates)
 i=min(valid,key=lambda i:math.dist(xy[i],target));selected.append(i)
shelters=[{'id':'A0'+str(i+1),'name':'预定集结点 '+chr(65+i),'xy':xy[n].tolist(),'capacity':[160,140,140][i],'node':int(n),'assumed':True,'allWindowMaxDepth':float(nh[:,n].max())} for i,n in enumerate(selected)]
reserved=[0]*3;occupied=[0]*3;logs=[];route_lines=[]
buildtree=cKDTree(np.array([b['xy'] for b in city['geography']['buildings']]));nearbuild=buildtree.query(xy)[0]<95
eligible=np.where((nh[0]<.07)&nearbuild)[0];wet=sorted([i for i in eligible if nh[:,i].max()>.18],key=lambda i:(math.atan2(xy[i,1]-400,xy[i,0]-100),-float(nh[:,i].max())))
origins=[]
for pool,nwanted in [(wet,12),(list(eligible),18)]:
 for i in pool:
  if len(origins)>=nwanted:break
  if all(math.dist(xy[i],xy[j])>55 for j in origins) and all(math.dist(xy[i],s['xy'])>130 for s in shelters):origins.append(i)
assert len(origins)==18
agents=[]
for i,n in enumerate(origins):
 depart=(4500+i%6*360+i//6*120) if case=='historical' else (600+i%6*450+i//6*180)
 agents.append({'id':f'E{i+1:02}','count':20,'speed':round(.9+i%4*.1,2),'departure':depart,'origin':xy[n].tolist(),'track':[[0,*xy[n].tolist(),0,-1]],'node':n,'edge':None,'remaining':0.,'next':None,'path':[],'status':0,'shelter':-1,'retry':0,'reroutes':0})
def plan(agent,t):
 if agent['shelter']>=0:reserved[agent['shelter']]-=agent['count'];agent['shelter']=-1
 choices={s['node']:i for i,s in enumerate(shelters) if reserved[i]+occupied[i]+agent['count']<=s['capacity']}
 start=agent['node'];dist={start:0.};prev={};queue=[(0.,start)];target=None
 while queue:
  d,u=heapq.heappop(queue)
  if d!=dist[u]:continue
  if u in choices:target=u;break
  for v,e,length in adj[u]:
   ta=t+min(600,d/agent['speed']);tb=t+min(600,(d+length)/agent['speed'])
   if not edge_safe(e,ta,tb):continue
   nd=d+length
   if nd<dist.get(v,float('inf')):dist[v]=nd;prev[v]=u;heapq.heappush(queue,(nd,v))
 if target is None:return False
 path=[target]
 while path[-1]!=start:path.append(prev[path[-1]])
 path.reverse();si=choices[target];reserved[si]+=agent['count'];agent['shelter']=si;agent['path']=path[1:];agent['status']=1
 if len(route_lines)<150:route_lines.append({'agent':agent['id'],'t':round(t,2),'points':xy[path].round(2).tolist()})
 return True
def save(a,t,pos):
 row=[round(float(t),3),round(float(pos[0]),3),round(float(pos[1]),3),a['status'],a['shelter']]
 if a['track'][-1][0]==row[0]:a['track'][-1]=row
 else:a['track'].append(row)
frames=[]
for t in range(0,end+1,10):
 for a in agents:
  if a['status']==2:continue
  if a['status']==0 and t<a['departure']:continue
  if a['status']==0 or (a['status']==3 and t>=a['retry']):
   if plan(a,t):logs.append({'t':t,'text':a['id']+' · '+str(a['count'])+' 人出发 / 重新规划至 '+shelters[a['shelter']]['id']})
   else:a['status']=3;a['retry']=t+60
   save(a,t,xy[a['node']])
  if a['status']!=1:continue
  budget=min(10,end-t);elapsed=0.
  while budget>1e-5 and a['status']==1:
   if a['edge'] is None:
    if not a['path']:
     si=a['shelter'];reserved[si]-=a['count'];occupied[si]+=a['count'];a['status']=2;save(a,t+elapsed,xy[a['node']]);logs.append({'t':round(t+elapsed),'text':a['id']+' · '+str(a['count'])+' 人到达 '+shelters[si]['id']});break
    nxt=a['path'][0];e=G[nodes[a['node']]][nodes[nxt]]['eid'];length=G[nodes[a['node']]][nodes[nxt]]['length']
    if not edge_safe(e,t+elapsed,t+elapsed+length/a['speed']):
     a['reroutes']+=1
     if not plan(a,t+elapsed):a['status']=3;a['retry']=t+60;save(a,t+elapsed,xy[a['node']]);logs.append({'t':t,'text':a['id']+' · 道路受淹，受阻待援'});break
     logs.append({'t':t,'text':a['id']+' · 原路段停用，重新规划'})
     if a['reroutes']>100:a['status']=3;a['retry']=t+60;save(a,t+elapsed,xy[a['node']]);break
     continue
    a['next']=nxt;a['remaining']=length;a['edge']=e;a['length']=length
   move=min(a['remaining'],budget*a['speed']);dt=move/a['speed'];a['remaining']-=move;budget-=dt;elapsed+=dt
   u=1-a['remaining']/a['length'];pos=xy[a['node']]*(1-u)+xy[a['next']]*u
   if a['remaining']<1e-5:a['node']=a['next'];a['edge']=None;a['path']=a['path'][1:]
   save(a,t+elapsed,pos)
 if t%60==0:
  counts={k:sum(a['count'] for a in agents if a['status']==i) for i,k in enumerate(['waiting','moving','arrived','blocked'])}
  assert sum(counts.values())==360 and all(occupied[i]+reserved[i]<=s['capacity'] for i,s in enumerate(shelters))
  frames.append({'t':t,**counts,'occupancy':occupied.copy(),'reserved':reserved.copy()})
# Derive public counters from timestamped tracks, not the look-ahead integration state.
frames=[]
for t in range(0,end+1,60):
 counts=dict(waiting=0,moving=0,arrived=0,blocked=0);occ=[0]*3;res=[0]*3
 for a in agents:
  ts=[p[0] for p in a['track']];ix=max(0,int(np.searchsorted(ts,t,side='right'))-1);row=a['track'][ix];status=row[3];target=row[4]
  counts[['waiting','moving','arrived','blocked'][status]]+=a['count']
  if target>=0:
   if status==2:occ[target]+=a['count']
   elif status==1:res[target]+=a['count']
 assert sum(counts.values())==360 and all(occ[i]+res[i]<=ss['capacity'] for i,ss in enumerate(shelters))
 frames.append({'t':t,**counts,'occupancy':occ,'reserved':res})
# Safe-road patrol loops, with checking and assembly-point guidance dwell states.
patrols=[]
for i,s in enumerate(shelters):
 source=nodes[s['node']];reachable=nx.single_source_dijkstra_path_length(SG,source,cutoff=280)
 dest=max(reachable,key=reachable.get);path=nx.shortest_path(SG,source,dest,weight=lambda a,b,d:G[a][b]['length']);points=[np.array(p) for p in path];track=[[0,*source,1,i]];tt=0;loop=points+points[-2::-1]
 while tt<end:
  for j,(a,b) in enumerate(zip(loop,loop[1:])):
   tt+=math.dist(a,b)/1.15
   if tt>end:break
   track.append([round(tt,3),*np.round(b,3).tolist(),1 if j<len(points)-1 else 4,i])
   if j==len(points)-2:
    track[-1][3]=2;tt+=45;track.append([round(tt,3),*np.round(b,3).tolist(),4,i])
  if tt>end:break
  track[-1][3]=3;tt+=90;track.append([round(tt,3),*source,1,i])
 # Ensure the final segment ends at the simulation boundary.
 if track[-1][0]<end:track.append([end,*track[-1][1:]])
 patrols.append({'id':f'T{i+1:02}','name':'安全巡检 '+str(i+1),'count':2,'shelter':i,'track':track,'route':[p.tolist() for p in loop],'tasks':{'1':'安全区巡查','2':'边界检查','3':'集结点引导','4':'返回集结点'}})
# A guidance hand-off is logged only when an actual moving group meets a team
# dwelling at the same target assembly point. No invented contacts.
def track_at(track,t):
 ts=[row[0] for row in track];i=max(0,int(np.searchsorted(ts,t,side='right'))-1);a=track[i];b=track[min(i+1,len(track)-1)];u=np.clip((t-a[0])/(b[0]-a[0]),0,1) if b[0]>a[0] else 0
 return np.array(a[1:3])*(1-u)+np.array(b[1:3])*u,a[3],a[4]
for a in agents:
 for t in range(a['departure'],end+1,10):
  pos,status,target=track_at(a['track'],t)
  if status!=1:continue
  found=False
  for team in patrols:
   pp,phase,si=track_at(team['track'],t)
   if phase==3 and si==target and np.linalg.norm(pos-pp)<=45:
    a['guidedBy']=team['id'];a['guidanceTime']=t;logs.append({'t':t,'text':team['id']+' · 引导 '+a['id']+' 队列进入 '+shelters[si]['id']});found=True;break
  if found:break
# Risk cells are outdoors; safe needs a dry route to a shelter throughout forecast.
RC=100;RR=100;gx=x0+(np.arange(RC)+.5)*W/RC;gz=z0+(np.arange(RR)+.5)*H/RR;xx,zz=np.meshgrid(gx,gz);rp=np.column_stack([xx.ravel(),zz.ravel()]);rh=sample_all(rp,1);rv=np.hypot(sample_all(rp,2),sample_all(rp,3));road_distance,nearest=cKDTree(xy).query(rp);mask=np.fromfile(P/(case+'-buildings.bin'),dtype='uint8').reshape(g['rows'],g['cols']);solid=map_coordinates(mask.astype(float),coords(rp),order=1,mode='constant',cval=1)>.35
risk=[];risk_stats=[]
for t in range(0,end+1,60):
 lo=int(t//step);hi=min(g['frames']-1,int(math.ceil(min(end,t+1860)/step)));hm=eh[lo:hi+1].max(axis=0);vm=ev[lo:hi+1].max(axis=0);edge_ok=(hm<.08)&(vm<.25)
 seen=set(selected);queue=list(selected)
 for u in queue:
  for v,e,length in adj[u]:
   if edge_ok[e] and v not in seen:seen.add(v);queue.append(v)
 h=rh[lo:hi+1].max(axis=0);v=rv[lo:hi+1].max(axis=0);red=(h>=.3)|((h>.05)&((v>=1)|(h*v>=.15)));safe=(h<.08)&(v<.25)&(road_distance<=90)&np.isin(nearest,list(seen))
 code=np.where(red,3,np.where(safe,1,np.where((h>=.08)|(road_distance<=90),2,0))).astype('uint8');code[solid]=0
 risk.append(code);counts=np.bincount(code,minlength=4)*W/RC*H/RR;risk_stats.append({'t':t,'unknown':float(counts[0]),'safe':float(counts[1]),'caution':float(counts[2]),'danger':float(counts[3])})
np.array(risk,dtype='uint8').tofile(P/(case+'-risk.bin'))
# Pick an actual rain-created ponding street for the historical close-up.
if case=='historical':
 ids=np.where((nh[0]<.03)&nearbuild&(xy[:,0]>x0+100)&(xy[:,1]>z0+100)&(xy[:,0]<x0+W-100)&(xy[:,1]<z0+H-100))[0];best=int(ids[np.argmax(nh[:,ids].max(axis=0))]);m['viewpoints']['district']=xy[best].round(2).tolist();m['viewpoints']['ponding']=m['viewpoints']['district'];m['pondingSample']={'xy':m['viewpoints']['district'],'maxDepth':float(nh[:,best].max()),'peakTime':int(np.argmax(nh[:,best])*step)}
 nearest_build=int(buildtree.query(xy[best])[1]);m['showcaseBuildings']=['B'+str(nearest_build).zfill(4),'B2194'];m['recommendedTime']=int(np.argmax(nh[:,best])*step)
else:m['recommendedTime']=2400
(P/(case+'.json')).write_text(json.dumps(m,ensure_ascii=False,separators=(',',':')))
for a in agents:
 for key in ['node','edge','remaining','next','path','status','shelter','retry','length']:a.pop(key,None)
 if a['track'][-1][0]<end:a['track'].append([end,*a['track'][-1][1:]])
report={'version':'0.3.0','scenario':m['id'],'duration':end,'totalPeople':360,'groupRepresentation':'18 illustrative groups of 20 people; synthetic population at source-road nodes','shelters':shelters,'agents':agents,'patrols':patrols,'routes':route_lines,'frames':frames,'logs':sorted(logs,key=lambda p:p['t']),'risk':{'cols':RC,'rows':RR,'step':60,'frames':len(risk),'url':'/data/'+case+'-risk.bin','stats':risk_stats,'horizon_s':1800,'sample_buffer_s':60,'codes':{'0':'unknown / no verified road access or building interior','1':'candidate safe with dry shelter access through forecast','2':'caution or uncertain access','3':'model danger by illustrative thresholds'}},'assumptions':{'population':'synthetic; not census or real tracks','shelters':'source-road candidate points; suitability and capacity assumed','pedestrian_rule':'depth <0.15m and speed <0.5m/s at segment traversal time, illustrative only','routing':'source-road graph, plan with 10-minute lookahead and recheck each segment at crossing time; bridges and traffic rules unverified','safe_zone_rule':'outdoor grid, future 30min + 60s bin buffer: h<0.08m, v<0.25m/s and dry road connection within 90m to a shelter','danger_rule':'h>=0.30m or h>0.05m and (v>=1m/s or h*v>=0.15m2/s); illustrative classification, not an official safety standard','patrols':'synthetic teams on roads dry throughout the modeled window; timed checks and guidance dwell','capacity':'reserved en route and occupied at arrival; groups may wait if no safe route/capacity','outside':'outside hydraulic extent unassessed; never labeled safe'}}
(P/(case+'-operations.json')).write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')))
summary={'case':case,'nodes':len(nodes),'edges':len(edges),'groups':len(agents),'people':360,'shelters':shelters,'reroutes':sum(a['reroutes'] for a in agents),'peakBlocked':max(f['blocked'] for f in frames),'peakMoving':max(f['moving'] for f in frames),'final':frames[-1],'risk_bytes':len(risk)*RC*RR,'ponding':m.get('pondingSample')}
(D/(case+'-operations-summary.json')).write_text(json.dumps(summary,ensure_ascii=False,indent=2));print(json.dumps(summary,ensure_ascii=False,indent=2))
