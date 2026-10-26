"""Bundle only the prefixed static build and attribution for a VPS upload."""
from pathlib import Path
import hashlib,io,json,tarfile
ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'app/package.json').read_text())['version']
BUILD=ROOT/'app/dist-vps'
OUT=ROOT/'delivery'/f'FloodTrace-v{VERSION}-vps.tar.gz'
def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for part in iter(lambda:f.read(4*1024*1024),b''):h.update(part)
    return h.hexdigest()
files={str(p.relative_to(BUILD)):p for p in BUILD.rglob('*') if p.is_file() and not any(x.startswith('._') or x=='.DS_Store' for x in p.parts)}
assert 'index.html' in files and '/floodtrace/assets/' in files['index.html'].read_text(),'Run npm --prefix app run build:vps first'
files['data-notice.md']=ROOT/'delivery/NOTICE-数据与许可.md'
for p in (ROOT/'delivery/third-party').iterdir():
    if p.is_file() and not p.name.startswith('._'):files['third-party/'+p.name]=p
manifest={'application':'FloodTrace','version':VERSION,'base':'/floodtrace/','files':[{'path':name,'bytes':p.stat().st_size,'sha256':sha(p)} for name,p in sorted(files.items())]}
raw=json.dumps(manifest,ensure_ascii=False,indent=2).encode()
with tarfile.open(OUT,'w:gz') as archive:
    for name,p in sorted(files.items()):
        info=archive.gettarinfo(str(p),arcname=name)
        info.uid=info.gid=0;info.uname=info.gname='';info.mode=0o644
        with p.open('rb') as stream:archive.addfile(info,stream)
    info=tarfile.TarInfo('deployment-manifest.json');info.size=len(raw);info.mode=0o644
    archive.addfile(info,io.BytesIO(raw))
(ROOT/'delivery/vps-bundle.json').write_text(json.dumps({'version':VERSION,'file':OUT.name,'bytes':OUT.stat().st_size,'sha256':sha(OUT),'fileCount':len(files)},indent=2))
print((ROOT/'delivery/vps-bundle.json').read_text())
