"""Finite SOURCE02 author metadata/copy. No target import/helper/native action."""
from pathlib import Path
import hashlib,json,stat
HERE=Path(__file__).absolute().parent
OLD=HERE.parent/'resume1'
T0=HERE.parents[2]
PINS=[]
def read(path,sha=None):
    raw=path.read_bytes();digest=hashlib.sha256(raw).hexdigest();info=path.stat()
    if sha is not None and sha!=digest:raise RuntimeError('PIN')
    PINS.append(dict(path=str(path),sha256=digest,bytes=len(raw),mode=stat.S_IMODE(info.st_mode)))
    return raw
def packet(path,sha):
    raw=read(path/'manifest.json',sha);manifest=json.loads(raw)
    for row in manifest['files']:
        member=path/row['path'];value=read(member,row['sha256'])
        if len(value)!=row['bytes'] or stat.S_IMODE(member.stat().st_mode)!=row['mode']:raise RuntimeError('PAYLOAD')
    return raw,manifest
old_raw,old=packet(OLD,'fd7cce1e0ee7da9c41cb0746f00b78b35fd41269f822776719ba1d2f6f18aa6f')
for path,sha in ((T0/'qa/c8-public-observer-java-qualification-source01-exact-review','346afb412109878078b96c83fb0a4b60f017b9231f8493df8ffc13b728434426'),
                 (T0/'resume-architecture/resume2/c8-public-observer-java-qualification-source01-exact-review','d36eedcf73ebc7e9da3638a5c83c7808bd50589c49fb4f99bcf7e94dd1bc4e45')):packet(path,sha)
read(T0/'resume2-c8-java-qualification-source01-all-findings-root-adoption.json','961c691211ee3d47f2e696ce99476d3ad568bd39d1cdc14d71c19dd0716523fd')
historical={'IMPLEMENTATION-DESIGN.md','prepare_source.py','seal_source.py','manifest.json','SHA256SUMS','schemas.json',
    'review.md','proof-coverage.json','author-history.json','implementation-map.json','first-read-and-ownership-map.json',
    'final-verification.json','flow-check-results.json','source-check-results.json'}
for row in old['files']:
    name=row['path'];destination=('source01-'+name) if name in historical else name
    target=HERE/destination
    if target.exists():raise RuntimeError('EXCLUSIVE_SOURCE_COPY')
    target.write_bytes((OLD/name).read_bytes());target.chmod(row['mode'])
(HERE/'source01-manifest.json').write_bytes(old_raw)
(HERE/'verified-source01-and-review-inputs.json').write_text(json.dumps(PINS,indent=2)+'\n')
print(json.dumps(dict(source01Payloads=49,reviewPayloads=34,pins=len(PINS),actualTargetActions=0)))
