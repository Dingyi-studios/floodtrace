"""Exercise the actual shipped start/stop scripts and production assets."""
from pathlib import Path
import subprocess,json,re,urllib.request,urllib.error
from datetime import date
ROOT=Path(__file__).resolve().parents[1]
def run(script):
    p=subprocess.run([str(ROOT/script)],cwd=ROOT,capture_output=True,text=True,timeout=15)
    assert p.returncode==0,p.stdout+p.stderr
    return p.stdout.strip()
stop=run('stop.sh')
try:
    urllib.request.urlopen('http://127.0.0.1:5178/health',timeout=2)
    raise AssertionError('Owned server should have stopped')
except urllib.error.URLError:pass
start=run('start.sh')
def get(path):
    with urllib.request.urlopen('http://127.0.0.1:5178'+path,timeout=10) as r:return r.status,r.read()
status,health=get('/health');health=json.loads(health)
assert status==200 and health['application']=='FloodTrace' and health['version']==json.loads((ROOT/'app/package.json').read_text())['version'] and health['root']==str(ROOT)
status,html=get('/');assert status==200
paths=re.findall(r'(?:src|href)="([^"]+)"',html.decode())
paths+=[f'/data/{x}' for x in ['city.json','city-ground.jpg','history.json','compound.json','compound-fields.bin','compound-ground.bin','compound-buildings.bin','compound-operations.json','compound-risk.bin','compound-emergency.json','historical.json','historical-fields.bin','historical-ground.bin','historical-buildings.bin','historical-operations.json','historical-risk.bin','compound-missions.json','historical-missions.json']]
assets=[]
for p in paths:
    code,body=get(p);assert code==200 and len(body)>0
    assets.append({'path':p,'status':code,'bytes':len(body)})
pid=(ROOT/'results/server.pid').read_text()
again=run('start.sh');assert (ROOT/'results/server.pid').read_text()==pid
result={'checked_on':date.today().isoformat(),'passed':4,'failed':0,'checks':['start/stop lifecycle','loopback health and SSD root','all production assets return 200','idempotent start retains one PID'],'stop_output':stop,'start_output':start,'repeat_output':again,'health':health,'assets':assets}
(ROOT/'validation/v4/delivery-checks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False,indent=2))
