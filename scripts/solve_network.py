"""SWMM worker: historical rain, cold start, uncalibrated source parameters."""
from pathlib import Path
import os
os.environ['OMP_NUM_THREADS']='2'
import re,json,time
import numpy as np
import pandas as pd
from swmm.toolkit import solver,output
from swmm.toolkit.shared_enum import Time,ElementType,NodeAttribute

ROOT=Path(__file__).resolve().parents[1]
SRC=Path(os.environ.get('FLOODTRACE_DATA_ROOT','/Volumes/T5/个人项目数据库/洪涝模拟数据'))/'prepared/bellinge'
OUT=ROOT/'results/swmm';OUT.mkdir(parents=True,exist_ok=True)
text=(SRC/'BellingeSWMM_v021_nopervious.inp').read_text()
for k,v in {'START_DATE':'06/29/2012','START_TIME':'04:30:00','REPORT_START_DATE':'06/29/2012','REPORT_START_TIME':'04:30:00','END_DATE':'06/29/2012','END_TIME':'10:30:00','THREADS':'2'}.items():
    text,n=re.subn(rf'^{k}\s+[^\n]+',f'{k:<22}{v}',text,flags=re.M);assert n==1
text=text.replace('"rg_bellinge_Jun2010_Aug2021.dat"',f'"{SRC}/rg_bellinge_Jun2010_Aug2021.dat"')
inp,rpt,out=[OUT/f'bellinge_20120629.{x}' for x in ['inp','rpt','out']]
inp.write_text(text);start=time.perf_counter();solver.swmm_run(str(inp),str(rpt),str(out))
handle=output.init();output.open(handle,str(out))
periods=output.get_times(handle,Time.NUM_PERIODS)
names=[output.get_elem_name(handle,ElementType.NODE,i) for i in range(output.get_proj_size(handle)[1])]
sensors={}
for sensor in ['G71F04R','G71F05R','G71F06R','G71F68Y']:
    index=names.index(sensor) if sensor in names else None
    print(sensor,index,flush=True)
    channels=[]
    for f in sorted((SRC/'sensor_events').glob(f'model_2012__{sensor}*Level*.csv')):
        df=pd.read_csv(f);df['time']=pd.to_datetime(df['time'])
        df=df[(df.time>='2012-06-29 04:30')&(df.time<='2012-06-29 10:30')]
        if 'level' not in df:continue
        series=[]
        for _,r in df.iterrows():
            flags=[k for k in ['man_remove','ffill','stamp','outbound','frozen','outlier','frozen_high'] if k in r and r[k]==True]
            series.append({'t':int((r.time-pd.Timestamp('2012-06-29 04:30')).total_seconds()),'value':None if pd.isna(r['level']) else round(float(r['level']),4),'flags':flags})
        channels.append({'name':f.name,'field':'level','unit':'m DVR90','series':series})
    model=[]
    if index is not None:
        vals=output.get_node_series(handle,index,NodeAttribute.HYDRAULIC_HEAD,0,periods-1)
        model=[{'t':(i+1)*60,'value':round(float(v),4)} for i,v in enumerate(vals)]
    sensors[sensor]={'modelNode':sensor if index is not None else None,'model':model,'observations':channels,'quality':'source flags preserved; cold start SWMM; no calibration'}
output.close(handle)
rain=pd.read_csv(SRC/'model_2012_rainfall.csv');rain['time']=pd.to_datetime(rain.source_datetime_no_offset)
rain=rain[(rain.time>='2012-06-29 04:30')&(rain.time<='2012-06-29 10:30')]
rain_by_gauge={}
for gauge,rows in rain.groupby('gauge'):
    values={int((r.time-pd.Timestamp('2012-06-29 04:30')).total_seconds()):round(float(r.rainfall_volume_mm),5) for _,r in rows.iterrows()}
    assert len(values)==len(rows),'Duplicate station timestamps'
    rain_by_gauge[gauge]=[{'t':t,'value':values.get(t,0.)} for t in range(0,21601,60)]
rainfall=rain_by_gauge['rg5425']
obj={'id':'BELL-20120629','kind':'historical-and-uncalibrated-network','start':'2012-06-29T04:30:00Z','duration':21600,'sensors':sensors,'rain':rainfall,'rainByGauge':rain_by_gauge,'rainGauge':'rg5425','engine':'EPA SWMM 5.2.4','coldStart':True,'calibrated':False,'coupled':False}
(ROOT/'app/public/data/history.json').write_text(json.dumps(obj,separators=(',',':'),allow_nan=False))
report=rpt.read_text(errors='replace')
result={'engine':obj['engine'],'periods':periods,'elapsed_s':round(time.perf_counter()-start,2),'model_nodes':1020,'links':1044,'warnings':[l.strip() for l in report.splitlines() if 'WARNING' in l],'continuity_report':[l.strip() for l in report.splitlines() if 'Continuity Error' in l],'error_lines':[l.strip() for l in report.splitlines() if re.search(r'ERROR\s+\d{3}',l)]}
(OUT/'validation.json').write_text(json.dumps(result,indent=2));assert not result['error_lines']
print(json.dumps(result,indent=2))
