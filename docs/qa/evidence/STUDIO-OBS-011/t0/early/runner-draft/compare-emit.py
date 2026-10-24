"""PREPARED, NOT EXECUTED. Compare complete emitted artifacts; never writes the actual dist."""
import hashlib,json,sys
from pathlib import Path
before,after=map(Path,sys.argv[1:3])
def inventory(root,js_only):
    rows=[]
    for p in sorted(root.rglob('*')):
        if p.is_file() and (not js_only or p.suffix=='.js'):
            rows.append({'path':p.relative_to(root).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    if not rows: raise SystemExit('Empty emit directory: '+str(root))
    digest=hashlib.sha256(json.dumps(rows,separators=(',',':')).encode()).hexdigest()
    return {'digestAlgorithm':'capture-manifest.py canonical sha256(JSON rows, compact separators, sorted path)' ,'digest':digest,'files':rows}
result={'kind':'EMIT_BYTE_COMPARISON_REQUIRES_ROOT_DISPOSITION_ON_CHANGE'}
for key,js in [('js',True),('all',False)]:
    b,a=inventory(before,js),inventory(after,js)
    bm={r['path']:r['sha256'] for r in b['files']};am={r['path']:r['sha256'] for r in a['files']}
    changed=[p for p in sorted(set(bm)|set(am)) if bm.get(p)!=am.get(p)]
    result[key]={'before':b,'after':a,'changedPaths':changed,'identical':not changed}
result['disposition']='IDENTICAL_EMIT' if result['all']['identical'] else 'AC4D_CARRIED_UNLESS_ROOT_ACCEPTS_EXACT_DIGEST_MOVE_IN_WRITING'
print(json.dumps(result,indent=2))
# A byte difference is recorded, never silently accepted by this tool.
raise SystemExit(0 if result['all']['identical'] else 1)
