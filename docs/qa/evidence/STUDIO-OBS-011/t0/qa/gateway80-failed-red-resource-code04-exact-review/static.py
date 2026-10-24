"""Named public-source metadata graph; no runtime/frozen/private/baseline acquisition."""
import ast,hashlib,json,stat
from pathlib import Path
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume4');O=Path(__file__).parent
checks=[];pins={}
def check(name,value):
    if value is not True:raise RuntimeError(name)
    checks.append(dict(name=name,passed=True))
def record(path,expected=None):
    p=Path(path)
    if '/runtime/' in str(p) or p.name=='preexisting-baseline.json':raise RuntimeError('CLOSED_INPUT')
    raw=p.read_bytes();r=dict(path=str(p),sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),mode=stat.S_IMODE(p.stat().st_mode))
    if expected is not None:
        mode=expected.get('mode',r['mode']);mode=int(mode,8) if isinstance(mode,str) and mode.startswith('0') and not mode.startswith('0o') else int(mode,0) if isinstance(mode,str) else mode
        check(str(p)+':hash',r['sha256']==expected['sha256'])
        if 'bytes' in expected:check(str(p)+':bytes',r['bytes']==expected['bytes'])
        check(str(p)+':mode',r['mode']==mode)
    pins[str(p)]=r;return raw
m=json.loads(record(S/'manifest.json',dict(sha256='cac4f5a1d4e770ae9d2ee65354b9ce7d93c48a41d49ccbb7c39ebbaa95d47b2e',mode=0o644)))
raws={r['path']:record(S/r['path'],r) for r in m['files']}
for row in json.loads(raws['input-pins.json'])['inputs']:record(row['path'],row)
OLD=S.parent/'resume3';oldm=json.loads(record(OLD/'manifest.json',dict(sha256=m['source03ManifestSha256'],mode=0o644)))
oldraw={r['path']:record(OLD/r['path'],r) for r in oldm['files']}
trees={n:ast.parse(v) for n,v in raws.items() if n.endswith('.py')}
api=json.loads(raws['api-map.json']);imap=json.loads(raws['interpretation-map.json'])
for key,row in api['functions'].items():
    nodes=[n for n in ast.walk(trees[row['file']]) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.lineno==row['line']]
    check('span:'+key,len(nodes)==1 and nodes[0].end_lineno==row['endLine'] and ast.unparse(nodes[0].args)==row['signature'])
for i,row in enumerate(imap['reachedInterpretationSites']):
    check('site:'+str(i),any(isinstance(n,ast.Call) and n.lineno==row['line'] and ast.unparse(n.func)==row['callee'] for n in ast.walk(trees[row['file']])))
check('118-function-spans',len(api['functions'])==118);check('118-interpretation-sites',len(imap['reachedInterpretationSites'])==118);check('13-input-classes',len(imap['inputClasses'])==13)
for name in ('entry.py','failed_gateway.py','custody.py','protocol.py','factory.py','installer.py','install-cli.py','shell-buffer-verify.py'):
    check('non-removable:'+name,not any(isinstance(n,ast.Assert) for n in ast.walk(trees[name])))
check('literal-binding',raws['binding-functions.bash']==raws['guard-failed-red.bash'])
# Complete FailureSink AST and closed constants are literal in all four owners.
def sink_shape(source):
    tree=ast.parse(source)
    selected=[n for n in tree.body if isinstance(n,ast.ClassDef) and n.name in ('FailureSink','BootstrapValueError') or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('STAGES','REASON_REGISTRY') for t in n.targets)]
    return ast.dump(ast.Module(body=selected,type_ignores=[]),include_attributes=False)
canonical=sink_shape(raws['protocol.py'])
for name in ('install-cli.py','guard-failed-red.bash','install-loader.bash'):
    source=raws[name].decode()
    if name.endswith('.bash'):source=source.split("-B -c '",1)[1].split("' \"$GATEWAY_FR03_ENTRY\"",1)[0] if name.startswith('guard') else source.split("-B -c '",1)[1].split("\n' '/Users/",1)[0]
    check('same-closed-sink:'+name,sink_shape(source)==canonical)
reuse=json.loads(raws['reuse-analysis.json'])
for row in reuse['unchangedFunctions']:
    def function(data):
        matches=[n for n in ast.walk(ast.parse(data)) if isinstance(n,ast.FunctionDef) and n.name==row['function']]
        if len(matches)!=1:raise RuntimeError('REUSE_AMBIGUITY:'+row['function'])
        return ast.dump(matches[0],include_attributes=False)
    check('reuse-unchanged:'+row['file']+':'+row['function'],function(raws[row['file']])==function(oldraw[row['file']]))
check('19-exact-prior-result-bytes',raws['extra-check-results.json']==raws['ancestor03-extra-check-results.json']==oldraw['extra-check-results.json'])
priorqa=Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway80-failed-red-resource-code03-exact-review')
prior=json.loads(record(priorqa/'replay-extra_checks.py.stdout').decode().splitlines()[-1])
check('19-independent-prior-pass-binding',prior['result']['passed']==19 and prior['result']['failed']==0 and prior['result']['realBoundaryCalls']==[])
oldids=[];newids=[]
for n in ('check-results.json','extra-check-results.json','optimized-bootstrap-results.json','code02-check-results.json','source03-check-results.json'):
    oldids.extend(r['name'] for r in json.loads(oldraw[n])['checks']);newids.extend(r['name'] for r in json.loads(raws[n])['checks'])
check('269-retained-ids',oldids==newids and len(newids)==269)
for name,count in [('checks.py',89),('optimized_bootstrap_checks.py',6),('code02_checks.py',83),('source03_checks.py',72),('source04_three_checks.py',63)]:
    value=json.loads(record(O/('replay-'+name+'.stdout')).decode().splitlines()[-1])
    check('current-replay:'+name,value['suiteSha256']==hashlib.sha256(raws[name]).hexdigest() and value['result']['passed']==count and value['result']['failed']==0 and value['result']['realBoundaryCalls']==[])
check('destination-consumer-bindings',all(b'gateway80-failed-red-resource-code04-exact-review/manifest.json' in raws[n] for n in ('factory.py','failed_gateway.py')) and O.name=='gateway80-failed-red-resource-code04-exact-review')
result=dict(kind='QUINN04_EXACT_SOURCE_AND_REUSE_GRAPH',passed=len(checks),failed=0,checks=checks,currentReplayed=313,boundPriorReused=19,totalSupported=332,protectedBaselineOrRuntimeReads=0)
(O/'checks.json').write_text(json.dumps(result,indent=2)+'\n');(O/'pins.json').write_text(json.dumps(dict(pins=list(pins.values())),indent=2)+'\n')
print(json.dumps(dict(passed=len(checks),pins=len(pins),current313=313,prior19='REUSED_NOT_REPLAYED')))
