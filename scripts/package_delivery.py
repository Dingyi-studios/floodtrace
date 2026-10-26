"""Package final static and source artifacts on the SSD, excluding caches."""
from pathlib import Path
import json,hashlib,zipfile,os

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'delivery'
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda:f.read(4*1024*1024),b''):h.update(block)
    return h.hexdigest()
files=[p for p in (ROOT/'app/dist').rglob('*') if p.is_file() and not any(x.startswith('._') for x in p.parts)]
manifest={'version':'0.4.0','built_on':'2026-10-26','root':'dist/','static_files':[{'path':str(p.relative_to(ROOT/'app/dist')),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(files)]}
(OUT/'build-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
portable='''FloodTrace v0.4 洪涝侦察与应急沙盘 / 2026-10-26

解压后在该文件夹执行：
python3 -m http.server 5178 --bind 127.0.0.1 --directory dist

浏览器打开 http://127.0.0.1:5178/ 。需要 WebGL 浏览器。
不要直接以 file:// 打开 index.html，因为数据需要通过 HTTP 加载。

这是冻结的可运行前端与求解结果；不包含计算引擎、原始大型地形和开发依赖。
完整源码、独立求解输出及复现脚本在另一个 source 压缩包与 SSD 项目根目录。
数据使用与模型假设请阅读 NOTICE-数据与许可.md。
'''
with zipfile.ZipFile(OUT/'FloodTrace-v0.4-static.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in files:z.write(p,'dist/'+str(p.relative_to(ROOT/'app/dist')))
    z.writestr('README-打开静态构建.txt',portable)
    z.write(OUT/'NOTICE-数据与许可.md','NOTICE-数据与许可.md')
    z.write(OUT/'build-manifest.json','build-manifest.json')
    z.write(ROOT/'docs/VIDEO-PARITY.md','docs/VIDEO-PARITY.md')
    z.write(ROOT/'docs/VALIDATION-V04.md','docs/VALIDATION-V04.md')
    for p in (OUT/'third-party').iterdir():
        if p.is_file() and not p.name.startswith('._'):z.write(p,'third-party/'+p.name)

with zipfile.ZipFile(OUT/'FloodTrace-v0.4-source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for folder,dirs,names in os.walk(ROOT):
        dirs[:]=[d for d in dirs if d not in ['node_modules','references','delivery','versions','__pycache__','.git'] and not d.startswith('._') and not (Path(folder)==ROOT/'app' and d=='dist')]
        for name in names:
            if name.startswith('._') or name in ['.DS_Store','server.pid','server.log']:continue
            p=Path(folder)/name;z.write(p,str(p.relative_to(ROOT)))
    z.write(OUT/'NOTICE-数据与许可.md','delivery/NOTICE-数据与许可.md')
    for p in (OUT/'third-party').iterdir():
        if p.is_file() and not p.name.startswith('._'):z.write(p,'delivery/third-party/'+p.name)
packages=[]
for name in ['FloodTrace-v0.4-static.zip','FloodTrace-v0.4-source.zip']:
    p=OUT/name
    with zipfile.ZipFile(p) as z:assert z.testzip() is None
    packages.append({'name':name,'bytes':p.stat().st_size,'sha256':sha(p),'zip_crc_passed':True})
(OUT/'packages.json').write_text(json.dumps(packages,ensure_ascii=False,indent=2))
print(json.dumps(packages,ensure_ascii=False,indent=2))
