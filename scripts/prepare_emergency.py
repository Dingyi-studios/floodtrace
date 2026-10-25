"""Hypothetical route on noded source roads; time-dependent stop rule."""
from pathlib import Path
import json
import numpy as np
import networkx as nx
from shapely.geometry import LineString,Point
from shapely.ops import unary_union
from scipy.spatial import cKDTree

ROOT=Path(__file__).resolve().parents[1]
scene=json.loads((ROOT/'app/public/data/scene.json').read_text())
surface=json.loads((ROOT/'app/public/data/surface.json').read_text())
depth=np.array(surface['depth'])
centroid=np.array(surface['mesh']['centroids']);centroid[:,0]+=surface['origin'][0]-scene['origin'][0];centroid[:,1]=scene['origin'][1]-surface['origin'][1]-centroid[:,1]
tree=cKDTree(centroid)
def inside(p):return -400<=p[0]<=800 and 150<=p[1]<=1150
def dep(p,t):
    if not inside(p):return 0.
    _,cell=tree.query(p);f=min(60,max(0,t/120));a=int(f);b=min(60,a+1);return float(depth[a,cell]*(1-f+a)+depth[b,cell]*(f-a))

lines=[LineString(r['points']) for r in scene['geography']['roads'] if r['kind']!='Sti' and len(r['points'])>1]
network=unary_union(lines)
g=nx.Graph()
for line in network.geoms:
    cs=list(line.coords)
    for a,b in zip(cs,cs[1:]):
        a=tuple(round(x,1) for x in a);b=tuple(round(x,1) for x in b)
        if a!=b:g.add_edge(a,b,weight=float(np.linalg.norm(np.array(a)-b)))
g=g.subgraph(max(nx.connected_components(g),key=len)).copy()
points=list(g.nodes)
origin=min(points,key=lambda p:np.linalg.norm(np.array(p)-[-650,-100]))
target=max((p for p in points if inside(p)),key=lambda p:dep(p,3600))
path=nx.shortest_path(g,origin,target,weight='weight')
line=LineString(path);dist=np.arange(0,line.length+10,10);dist=np.minimum(dist,line.length)
sample=np.array([line.interpolate(d).coords[0] for d in dist])
cells=tree.query(sample)[1];mask=np.array([inside(p) for p in sample]);all_depth=depth[:,cells]*mask
speed=8000/3600;depart=1200
stop_index=None;stop_time=None
for i,p in enumerate(sample):
    arrival=depart+dist[i]/speed
    if dep(p,arrival)>=.3:
        stop_index=max(0,i-1);stop_time=depart+dist[stop_index]/speed;break
terminal=dist[stop_index] if stop_index is not None else line.length
end_time=stop_time if stop_index is not None else depart+line.length/speed
frames=[]
for i in range(61):
    t=i*120;d=min(terminal,max(0,(t-depart)*speed));p=line.interpolate(d).coords[0]
    status='待出发' if t<depart else ('水深受阻' if stop_index is not None else '到达检查点') if t>=end_time else '沿线巡查'
    frames.append({'distance':round(d,2),'xy':[round(x,2) for x in p],'status':status,'progress':round(d/line.length,4),'maxDepth':round(float(all_depth[i].max()),4),'wetLength':round(float((all_depth[i]>=.3).sum()*10),1)})
logs=[{'t':0,'text':'R01 / C01 / S01 · 假设资源就绪'},{'t':depart,'text':'R01 · 按候选道路路线出发'},{'t':round(end_time),'text':'R01 · 水深 ≥ 0.30 m，停止进入' if stop_index is not None else 'R01 · 到达候选检查点'}]
obj={'kind':'hypothetical-response','route':np.round(sample,2).tolist(),'length_m':round(line.length,2),'checkpoint':list(target),'frames':frames,'logs':logs,'route_source':'2019 source road centrelines, unary-union noding and 0.1 m coordinate rounding; largest connected component; shortest geometric length','assumptions':{'speed_kmh':8,'departure_s':depart,'stop_depth_m':.3,'depth_sampling':'nearest ANUGA cell, linear between 120 s output frames; sample 10 m along road at arrival time','traffic_rules':'unknown','bridge_decks':'not reconstructed','resource':'fictional reconnaissance group'}}
(ROOT/'app/public/data/emergency.json').write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':')))
(ROOT/'derived/emergency-provenance.json').write_text(json.dumps({k:v for k,v in obj.items() if k not in ['route','frames']},ensure_ascii=False,indent=2))
print(json.dumps({'origin':origin,'target':target,'length_m':line.length,'stop_s':end_time,'blocked':stop_index is not None,'graph_nodes':len(g)},ensure_ascii=False,indent=2))
