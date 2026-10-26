"""Package a versioned portable static patch without replacing older archives."""
from pathlib import Path
from datetime import date
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'delivery'
VERSION=json.loads((ROOT/'app/package.json').read_text())['version']
def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(4*1024*1024),b''):h.update(block)
    return h.hexdigest()
files=sorted(p for p in (ROOT/'app/dist').rglob('*') if p.is_file() and not any(x.startswith('._') for x in p.parts))
assert files and (ROOT/'app/dist/index.html').exists(),'Build app first'
manifest={'version':VERSION,'built_on':str(date.today()),'root':'dist/','static_files':[{'path':str(p.relative_to(ROOT/'app/dist')),'bytes':p.stat().st_size,'sha256':sha(p)} for p in files]}
manifest_path=OUT/f'build-manifest-v{VERSION}.json'
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
archive=OUT/f'FloodTrace-v{VERSION}-static.zip'
portable=f'''FloodTrace v{VERSION} 洪涝沙盘

解压后在该文件夹执行：
python3 -m http.server 5178 --bind 127.0.0.1 --directory dist

浏览器打开 http://127.0.0.1:5178/ 。需要 WebGL 浏览器。
不能直接以 file:// 打开 index.html，数据需要通过 HTTP 加载。

本包包含冻结前端和求解结果。源码与复现脚本见GitHub对应标签：
https://github.com/Dingyi-studios/floodtrace/releases/tag/v{VERSION}
数据许可与模型假设请阅读 NOTICE-数据与许可.md 和 docs/MODEL.md。
'''
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in files:z.write(p,'dist/'+str(p.relative_to(ROOT/'app/dist')))
    z.writestr('README-打开静态构建.txt',portable)
    z.write(manifest_path,'build-manifest.json')
    z.write(OUT/'NOTICE-数据与许可.md','NOTICE-数据与许可.md')
    for name in ['MODEL.md','VIDEO-PARITY.md','VALIDATION-V041.md','DEPLOYMENT-VPS.md']:z.write(ROOT/'docs'/name,'docs/'+name)
    for p in (OUT/'third-party').iterdir():
        if p.is_file() and not p.name.startswith('._'):z.write(p,'third-party/'+p.name)
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
result={'version':VERSION,'name':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive),'zip_crc_passed':True}
(OUT/f'package-v{VERSION}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False,indent=2))
