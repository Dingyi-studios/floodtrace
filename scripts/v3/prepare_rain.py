"""Separate source rain gauges; preserve observations and independent SWMM data."""
from pathlib import Path
import csv,json,datetime,os
ROOT=Path(__file__).resolve().parents[2];P=ROOT/'app/public/data'
SRC=Path(os.environ.get('FLOODTRACE_DATA_ROOT','/Volumes/T5/个人项目数据库/洪涝模拟数据'))
start=datetime.datetime(2012,6,29,4,30);duration=21600;gauges={};counts={}
with (SRC/'prepared/bellinge/model_2012_rainfall.csv').open() as f:
 for row in csv.DictReader(f):
  t=int((datetime.datetime.fromisoformat(row['source_datetime_no_offset'])-start).total_seconds())
  if 0<=t<=duration:
   g=row['gauge'];gauges.setdefault(g,{})
   assert t not in gauges[g],(g,t)
   gauges[g][t]=float(row['rainfall_volume_mm'])
   counts[g]=counts.get(g,0)+1
h=json.loads((P/'history.json').read_text());h['version']='0.3.0';h['rainGauge']='rg5425'
h['rainByGauge']={g:[{'t':t,'value':values.get(t,0.)} for t in range(0,duration+1,60)] for g,values in sorted(gauges.items())}
h['rain']=h['rainByGauge']['rg5425'];h['rainSemantics']={'unit':'mm per 60-second interval','timestamp':'interpreted as interval start, held constant for 60 seconds','dry_gaps':'timestamps absent from the source SWMM event rain file treated as dry; not a sensor completeness claim','other_station':'rg5427 retained separately as comparison; not summed into rg5425','surface_input':'rg5425 spatially uniform for the new surface sensitivity run'}
(P/'history.json').write_text(json.dumps(h,ensure_ascii=False,separators=(',',':')))
report={'gauges':{g:{'source_samples':counts[g],'minute_samples':len(rows),'total_mm':sum(r['value'] for r in rows),'peak_mm_h':max(r['value'] for r in rows)*60} for g,rows in h['rainByGauge'].items()},'surface_input':'rg5425','same_timestamp_different_stations_not_combined':True,'semantics':h['rainSemantics']}
(ROOT/'derived/v3/rain-gauges.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
