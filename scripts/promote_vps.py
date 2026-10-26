"""Verify and atomically publish a static bundle on an existing OpenResty site.
Run on the VPS; credentials and host configuration are supplied outside this file.
"""
from pathlib import Path,PurePosixPath
from datetime import datetime,timezone
import argparse,hashlib,json,os,tarfile
p=argparse.ArgumentParser()
p.add_argument('--archive',required=True)
p.add_argument('--sha256',required=True)
p.add_argument('--webroot',required=True)
a=p.parse_args()
def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for part in iter(lambda:f.read(4*1024*1024),b''):h.update(part)
    return h.hexdigest()
archive=Path(a.archive);root=Path(a.webroot).resolve(strict=True)
assert root.is_dir() and (root/'index.html').is_file(),'Existing site root required'
assert sha(archive)==a.sha256,'Upload checksum mismatch'
releases=root.parent/'releases/floodtrace'
releases.mkdir(parents=True,exist_ok=True,mode=0o755)
target=root/'floodtrace';previous=None
if target.is_symlink():
    previous=os.readlink(target)
    assert target.resolve().parent==releases.resolve(),'Existing link is outside managed release directory'
else:assert not target.exists(),'Refusing to replace an existing directory or file'
with tarfile.open(archive,'r:gz') as tar:
    manifest=json.load(tar.extractfile('deployment-manifest.json'))
    assert manifest['application']=='FloodTrace' and manifest['base']=='/floodtrace/'
    version=manifest['version'];assert version and all(c in '0123456789.-' for c in version)
    label=version+'-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    release=releases/label;release.mkdir(mode=0o755)
    expected={x['path']:x for x in manifest['files']}
    assert len(expected)==len(manifest['files'])
    members=tar.getmembers()
    assert len(members)==len(expected)+1
    for member in members:
        rel=PurePosixPath(member.name)
        assert member.isfile() and not rel.is_absolute() and '..' not in rel.parts,'Unsafe archive member'
        assert member.name in expected or member.name=='deployment-manifest.json'
        dest=release.joinpath(*rel.parts);dest.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
        with tar.extractfile(member) as source,dest.open('xb') as out:
            while data:=source.read(4*1024*1024):out.write(data)
        dest.chmod(0o644)
    for rel,entry in expected.items():
        dest=release/rel
        assert dest.stat().st_size==entry['bytes'] and sha(dest)==entry['sha256'],'Release content mismatch: '+rel
new_link=root/('.floodtrace-'+label)
new_link.symlink_to(os.path.relpath(release,root),target_is_directory=True)
os.replace(new_link,target)
record={'version':version,'release':str(release),'link':str(target),'previousTarget':previous,'filesVerified':len(expected),'archiveSha256':a.sha256,'publishedAt':datetime.now(timezone.utc).isoformat()}
(releases/(label+'.json')).write_text(json.dumps(record,indent=2))
print(json.dumps(record))
