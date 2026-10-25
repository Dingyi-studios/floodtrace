"""Create compact, georeferenced browser assets. Never edit upstream data."""
from pathlib import Path
import json, math, hashlib
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from rasterio.merge import merge
from pyproj import Transformer
from shapely.geometry import shape, box, mapping
from shapely.ops import transform
from scipy.interpolate import RegularGridInterpolator
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
SRC=Path('/Volumes/T5/个人项目数据库/洪涝模拟数据')
DATA=SRC/'prepared/bellinge'
OUT=ROOT/'app/public/data'
OUT.mkdir(parents=True,exist_ok=True)
BOUNDS=(581900,6132000,585300,6134700)
OX,OY=583600,6133350
DOMAIN=(583200,6132200,584400,6133200)
to_utm=Transformer.from_crs(4326,25832,always_xy=True).transform
to_lonlat=Transformer.from_crs(25832,4326,always_xy=True).transform
clip=box(*BOUNDS)

def dump(name,obj):
    (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'),allow_nan=False))

with rasterio.open(DATA/'terrain_2m_average_preview.tif') as ds:
    w=from_bounds(*BOUNDS,ds.transform)
    h=ds.read(1,window=w,out_shape=(271,341),resampling=Resampling.bilinear)
assert np.isfinite(h).all() and h.min()>-100
height=RegularGridInterpolator((np.linspace(BOUNDS[3],BOUNDS[1],271)[::-1],np.linspace(BOUNDS[0],BOUNDS[2],341)),h[::-1],bounds_error=False,fill_value=None)
def elev(x,y):return float(height((y,x)))
def coord(c):return [round(c[0]-OX,2),round(OY-c[1],2)]

geography={}
stats={}
for name in ['buildings','roads','lakes','watercourses']:
    rows=[]
    source=json.loads((DATA/f'geography/{name}_wgs84.geojson').read_text())
    for f in source['features']:
        g=transform(to_utm,shape(f['geometry']))
        if not g.intersects(clip):continue
        g=g.intersection(clip).simplify(.6 if name=='buildings' else 1.2,preserve_topology=True)
        if g.is_empty:continue
        p=f['properties']; ident=str(p.get('FOT_ID',p.get('_source_record_id')))
        parts=list(g.geoms) if g.geom_type.startswith('Multi') else [g]
        for part in parts:
            if part.geom_type=='Polygon':
                if part.area<8:continue
                rings=[[coord(c) for c in ring.coords] for ring in [part.exterior,*part.interiors]]
                cx,cy=part.centroid.coords[0]
                rows.append({'id':ident,'rings':rings,'xy':coord([cx,cy]),'ground':round(elev(cx,cy),2),'area':round(part.area,1),'height':round(4.5+(int(ident)%5)*.6,1)})
            elif part.geom_type=='LineString':
                rows.append({'id':ident,'points':[coord(c) for c in part.coords],'kind':p.get('VEJ_TYPE','watercourse')})
    geography[name]=rows;stats[name]=len(rows)

nodes=[]
for f in json.loads((DATA/'network_nodes_wgs84.geojson').read_text())['features']:
    p=f['properties'];x,y=p['easting_m'],p['northing_m']
    if clip.covers(shape({'type':'Point','coordinates':[x,y]})):
        nodes.append({'id':p['id'],'xy':coord([x,y]),'ground':round(elev(x,y),2),'invert':p.get('invert_elevation_m'),'maxDepth':p.get('max_depth_m'),'kind':p['node_type']})
links=[]
for f in json.loads((DATA/'network_links_wgs84.geojson').read_text())['features']:
    g=transform(to_utm,shape(f['geometry']))
    if g.intersects(clip):
        p=f['properties'];links.append({'id':p['id'],'points':[coord(c) for c in g.coords],'kind':p['link_type'],'from':p['from_node'],'to':p['to_node']})
sensors=[]
for f in json.loads((DATA/'sensor_locations_wgs84.geojson').read_text())['features']:
    p=f['properties'];x,y=p['easting_m'],p['northing_m']
    sensors.append({'id':p['id'],'xy':coord([x,y]),'ground':round(elev(x,y),2) if clip.covers(shape({'type':'Point','coordinates':[x,y]})) else None,'visible':BOUNDS[0]<x<BOUNDS[2] and BOUNDS[1]<y<BOUNDS[3],'lonlat':f['geometry']['coordinates']})

# A cartographic land-use texture; categorical colours are an illustrative palette.
TW,TH=2048,1626
with rasterio.open(DATA/'land_use/OV-2016_NF-2013_v8_Bellinge.tif') as ds:
    land=ds.read(1,window=from_bounds(*BOUNDS,ds.transform),out_shape=(TH,TW),resampling=Resampling.nearest)
palette=np.array([[157,173,124],[185,192,156],[172,184,146],[197,191,163],[160,178,133],[182,193,155],[145,168,123],[155,180,148],[174,185,147],[194,191,165],[176,184,145],[167,184,148],[145,170,130],[186,188,159],[192,199,169],[167,182,147]]+[[174,188,150]]*240,dtype=np.float32)
rgb=palette[land]
rng=np.random.default_rng(27)
rgb=np.clip(rgb+rng.normal(0,2,(TH,TW,1)),0,255).astype('uint8')
im=Image.fromarray(rgb).filter(ImageFilter.GaussianBlur(.45));draw=ImageDraw.Draw(im)
def pixel(p):return ((p[0]+OX-BOUNDS[0])/(BOUNDS[2]-BOUNDS[0])*TW,(p[1]+BOUNDS[3]-OY)/(BOUNDS[3]-BOUNDS[1])*TH)
for b in geography['buildings']:draw.polygon([pixel(p) for p in b['rings'][0]],fill='#a3ab96')
im.save(OUT/'landcover.jpg',quality=92)
dump('scene.json',{'bounds':BOUNDS,'origin':[OX,OY],'crs':'EPSG:25832','verticalDatum':'DVR90','terrain':{'cols':341,'rows':271,'heights':np.round(h,2).ravel().tolist()},'geography':geography,'nodes':nodes,'links':links,'sensors':sensors,'counts':stats,'domain':DOMAIN})

# Prepare a new hydraulic grid directly from native 0.4 m tiles, with explicit
# 10 m averaging; this is independent of the display preview and not kerb-safe.
tiles=[]
for path in sorted((SRC/'raw/bellinge/terrain').glob('*.tif')):
    if path.name.startswith('._'):continue
    ds=rasterio.open(path)
    if box(*ds.bounds).intersects(box(*DOMAIN)):tiles.append(ds)
    else:ds.close()
a,aff=merge(tiles,bounds=DOMAIN,res=10,resampling=Resampling.average,nodata=-9999)
for ds in tiles:ds.close()
assert np.isfinite(a).all() and a.min()>-100
profile={'driver':'GTiff','height':a.shape[1],'width':a.shape[2],'count':1,'dtype':'float32','crs':'EPSG:25832','transform':aff,'nodata':-9999,'compress':'deflate'}
with rasterio.open(ROOT/'derived/hydraulic_terrain_10m.tif','w',**profile) as ds:ds.write(a.astype('float32'))
metadata={'bounds':DOMAIN,'source':'native DHYMRAIN 0.4 m / DTU Bellinge','source_tiles':[ds.name for ds in tiles],'aggregation':'10 m average, then piecewise bilinear interpolation to 25 m cross mesh','hydraulic_limitations':['coarse grid does not resolve kerbs or bridge structures','buildings are visual assets, not hydraulic obstacles','no sewer-surface coupling','reflective domain boundary is hypothetical'],'display_extent':BOUNDS,'display_height_range_m':[float(h.min()),float(h.max())],'feature_counts':stats,'network_nodes':len(nodes),'network_links':len(links)}
(ROOT/'derived/terrain-provenance.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
print(json.dumps(metadata,ensure_ascii=False,indent=2))
