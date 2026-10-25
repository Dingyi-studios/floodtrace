"""V2: exact display sampling, schematic architectural details, native terrain."""
from pathlib import Path
import json,math,os
import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.enums import Resampling
from scipy.ndimage import map_coordinates
from scipy.interpolate import RegularGridInterpolator
from shapely.geometry import Polygon,LineString,box
from shapely.ops import split,triangulate
from PIL import Image,ImageEnhance

ROOT=Path(__file__).resolve().parents[2]
P=ROOT/'app/public/data';D=ROOT/'derived/v2';D.mkdir(parents=True,exist_ok=True)
SRC=Path(os.environ.get('FLOODTRACE_DATA_ROOT','/Volumes/T5/个人项目数据库/洪涝模拟数据'))
scene=json.loads((P/'scene.json').read_text())
domain=(583000,6132100,584600,6133700)
scene['domain']=domain
scene['version']='0.2.0'
# Sample precisely at the displayed world-grid vertices, not cell centres.
b=scene['bounds'];cols,rows=426,339
xs=np.linspace(b[0],b[2],cols);ys=np.linspace(b[3],b[1],rows)
with rasterio.open(SRC/'prepared/bellinge/terrain_2m_average_preview.tif') as ds:
    arr=ds.read(1);a=ds.transform
    xx,yy=np.meshgrid((xs-a.c)/a.a-.5,(ys-a.f)/a.e-.5)
    h=map_coordinates(arr,[yy,xx],order=1,mode='nearest')
assert h.min()>-100 and np.isfinite(h).all()
scene['terrain']={'cols':cols,'rows':rows,'heights':np.round(h,3).ravel().tolist()}
sample=RegularGridInterpolator((ys[::-1],xs),h[::-1],bounds_error=False,fill_value=None)
origin=np.array(scene['origin'])
roof_counts={'pitched':0,'flat':0}
for bu in scene['geography']['buildings']:
    x,z=bu['xy'];bu['ground']=round(float(sample((origin[1]-z,origin[0]+x))),3)
    poly=Polygon(bu['rings'][0],bu['rings'][1:]).buffer(0)
    if poly.geom_type!='Polygon' or poly.is_empty:continue
    rect=poly.minimum_rotated_rectangle
    cs=np.array(rect.exterior.coords)[:4];edges=np.roll(cs,-1,axis=0)-cs;lens=np.linalg.norm(edges,axis=1);k=lens.argmax();along=edges[k]/lens[k];across=np.array([-along[1],along[0]]);center=np.array(poly.centroid.coords[0]);short=float(lens.min());long=float(lens.max())
    pitched=bu['area']<650 and short>3 and poly.area/max(rect.area,1)>.52
    floors=1 if bu['area']<65 or bu['area']>1800 else (3 if bu['area']>430 and int(bu['id'])%3==0 else 2)
    bu['floors']=floors;bu['height']=round(floors*2.9+.4,2)
    bu['roofType']='pitched' if pitched else 'flat';bu['roofRise']=round(min(2.5,max(1.05,short*.22)) if pitched else .2,2)
    bu['orientation']=round(math.atan2(along[1],along[0]),5)
    bu['roofVertices']=[]
    if pitched:
        cutter=LineString([center-along*(long+30),center+along*(long+30)])
        parts=split(poly,cutter).geoms
    else:parts=[poly]
    # Split at the ridge so rectangular roofs have actual ridge vertices.
    for part in parts:
        for tri in triangulate(part):
            if not part.covers(tri.representative_point()):continue
            for p in list(tri.exterior.coords)[:3]:
                q=np.array(p);rel=abs(np.dot(q-center,across));rise=bu['roofRise']*max(0,1-rel/(short/2)) if pitched else bu['roofRise']
                bu['roofVertices'].append([round(p[0],3),round(bu['height']+rise,3),round(p[1],3)])
    roof_counts[bu['roofType']]+=1
    bu['heightSource']='schematic floor/roof heights; footprint is source geometry'
for s in scene['sensors']:
    if s['visible']:s['ground']=round(float(sample((origin[1]-s['xy'][1],origin[0]+s['xy'][0]))),3)

# Only material colour changes; this is the same categorical cartographic map.
im=Image.open(P/'landcover.jpg').convert('RGB');im=ImageEnhance.Color(im).enhance(.82);im=ImageEnhance.Contrast(im).enhance(1.08)
im.save(P/'city-ground.jpg',quality=94)
(P/'city.json').write_text(json.dumps(scene,ensure_ascii=False,separators=(',',':')))

sources=[]
for path in sorted((SRC/'raw/bellinge/terrain').glob('DHYMRAIN*.tif')):
    ds=rasterio.open(path)
    if box(*ds.bounds).intersects(box(*domain)):sources.append(ds)
    else:ds.close()
grid,aff=merge(sources,bounds=domain,res=4,resampling=Resampling.average,nodata=-9999)
names=[s.name for s in sources]
for s in sources:s.close()
assert grid.min()>-100 and np.isfinite(grid).all()
with rasterio.open(D/'native_terrain_4m.tif','w',driver='GTiff',width=grid.shape[2],height=grid.shape[1],count=1,dtype='float32',crs='EPSG:25832',transform=aff,nodata=-9999,compress='deflate') as ds:ds.write(grid.astype('float32'))
provenance={'domain':domain,'native_source_pixel_m':.4,'hydraulic_preparation':'native tiles -> 4 m area average; solver mesh configured separately (10 m in v0.2)','source_tiles':names,'building_count':len(scene['geography']['buildings']),'roof_counts':roof_counts,'schematic_height_rule':'1-3 floors at 2.9 m + 0.4 m eaves; pitched or flat roofs; no surveyed building heights','terrain_range_m':[float(grid.min()),float(grid.max())],'display_vertex_sampling':'precise bilinear at world vertices; ~8 m display mesh','source_datum':'EPSG:25832 / DVR90','case_selection':'Bellinge input files verified locally; Ahr hydraulic inputs incomplete; new river flood is hypothetical'}
(D/'city-provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2))
print(json.dumps(provenance,ensure_ascii=False,indent=2))
