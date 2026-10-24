"""Finite named source metadata/pin/map checks. Runtime/private inputs excluded."""
import ast,hashlib,json,stat
from pathlib import Path
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume3')
OUT=Path(__file__).parent
checks=[];pins={}
def check(name,value):
    if value is not True:raise RuntimeError(name)
    checks.append(dict(name=name,passed=True))
def record(path,expected=None):
    path=Path(path)
    if '/runtime/' in str(path) or path.name=='preexisting-baseline.json':raise RuntimeError('CLOSED_INPUT')
    raw=path.read_bytes();st=path.stat();row=dict(path=str(path),sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),mode=stat.S_IMODE(st.st_mode))
    if expected is not None:
        mode=expected.get('mode',row['mode']);mode=int(mode,8) if isinstance(mode,str) and mode.startswith('0') and not mode.startswith('0o') else int(mode,0) if isinstance(mode,str) else mode
        check(str(path)+':hash',row['sha256']==expected['sha256'])
        if 'bytes' in expected:check(str(path)+':bytes',row['bytes']==expected['bytes'])
        check(str(path)+':mode',row['mode']==mode)
    pins[str(path)]=row;return raw
manifest=record(S/'manifest.json',dict(sha256='2e4f6203a252cae88239d37513e7f956f9dc1dd1d8345d1c79086023a1a8a198',mode=0o644))
m=json.loads(manifest);raws={r['path']:record(S/r['path'],r) for r in m['files']}
declared=json.loads(raws['input-pins.json'])
skipped=[]
for row in declared['inputs']:
    if '/runtime/' in row['path'] or Path(row['path']).name=='preexisting-baseline.json':skipped.append(row['path']);continue
    record(row['path'],row)
# Exact prior source02 seal and all116 public source payloads.
old=S.parent/'resume2';om=record(old/'manifest.json',dict(sha256=m['source02ManifestSha256'],mode=0o644))
for row in json.loads(om)['files']:record(old/row['path'],row)
api=json.loads(raws['api-map.json']);imap=json.loads(raws['interpretation-map.json']);trees={}
for name,raw in raws.items():
    if name.endswith('.py'):trees[name]=ast.parse(raw)
for key,row in api['functions'].items():
    candidates=[n for n in ast.walk(trees[row['file']]) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.lineno==row['line']]
    check('function-span:'+key,len(candidates)==1 and candidates[0].end_lineno==row['endLine'] and ast.unparse(candidates[0].args)==row['signature'])
for index,row in enumerate(imap['reachedInterpretationSites']):
    check('interpretation-site:'+str(index),any(isinstance(n,ast.Call) and n.lineno==row['line'] and ast.unparse(n.func)==row['callee'] for n in ast.walk(trees[row['file']])))
check('112-functions',len(api['functions'])==112)
check('93-sites',len(imap['reachedInterpretationSites'])==93)
check('13-input-classes',len(imap['inputClasses'])==13)
for name in ('entry.py','failed_gateway.py','custody.py','protocol.py','factory.py','installer.py','install-cli.py','shell-buffer-verify.py'):
    check('non-removable:'+name,not any(isinstance(n,ast.Assert) for n in ast.walk(trees[name])))
check('literal-binding-guard',raws['binding-functions.bash']==raws['guard-failed-red.bash'])
check('new-distinct-namespace',b'GATEWAY_FAILED_' not in raws['guard-failed-red.bash'] and b'gateway80_failed_red03_invoke' in raws['guard-failed-red.bash'])
oldids=[];newids=[]
for name in ('check-results.json','extra-check-results.json','optimized-bootstrap-results.json','code02-check-results.json'):
    v=json.loads((old/name).read_bytes());oldids.extend(r['name'] for r in v['checks'])
    v=json.loads(raws[name]);newids.extend(r['name'] for r in v['checks'])
check('197-retained-semantic-ids',oldids==newids and len(newids)==197)
for name,count in [('checks.py',89),('extra_checks.py',19),('optimized_bootstrap_checks.py',6),('code02_checks.py',83),('source03_checks.py',72)]:
    evidence=record(OUT/('replay-'+name+'.stdout'));value=json.loads(evidence.decode().splitlines()[-1])
    check('current-replay:'+name,value['suiteSha256']==hashlib.sha256(raws[name]).hexdigest() and value['result']['passed']==count and value['result']['failed']==0 and value['result']['realBoundaryCalls']==[])
check('history-provisional',m['oldFirstHoldReason']=='UNKNOWN_NOT_RETROACTIVELY_ESTABLISHED' and m['descriptor16PostExitLeakProved'] is False)
value=dict(kind='QUINN_FINITE_SOURCE_METADATA_CHECKS',passed=len(checks),failed=0,checks=checks,skippedClosedRuntimeInputs=skipped,protectedBaselineRead=False,actualRuntimeActions=0)
(OUT/'checks.json').write_text(json.dumps(value,indent=2)+'\n')
(OUT/'pins.json').write_text(json.dumps(dict(kind='EXACT_NAMED_PUBLIC_REVIEW_INPUT_PINS',pins=list(pins.values())),indent=2)+'\n')
print(json.dumps(dict(passed=len(checks),pins=len(pins),skippedClosedRuntimeInputs=len(skipped))))
