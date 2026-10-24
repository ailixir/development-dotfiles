"""Finite public/prepared byte, AST and sealed independent evidence binding only."""
from pathlib import Path
import ast, hashlib, json, stat
ROOT = Path.cwd()
T = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0'
D = T / 'early/c8-check01-public-evidence-prep/resume5'
P = D.parent / 'resume4'
O = Path(__file__).parent
checks, pins, buffers = [], {}, {}
def check(name, ok):
    if ok is not True: raise AssertionError(name)
    checks.append({'name': name, 'pass': True})
def sha(raw): return hashlib.sha256(raw).hexdigest()
def pin(path, digest=None, size=None, mode=None):
    path = Path(path).absolute()
    if '/runtime/' in str(path) or path.name == 'preexisting-baseline.json':
        raise AssertionError('OUTSIDE_PREPARATION_SCOPE')
    raw, info = path.read_bytes(), path.lstat()
    check('regular non-symlink ' + str(path.relative_to(ROOT)), stat.S_ISREG(info.st_mode))
    if digest is not None: check('SHA ' + str(path.relative_to(ROOT)), sha(raw) == digest)
    if size is not None: check('bytes ' + str(path.relative_to(ROOT)), len(raw) == size)
    if mode is not None: check('mode ' + str(path.relative_to(ROOT)), stat.S_IMODE(info.st_mode) == (int(mode, 0) if isinstance(mode,str) else mode))
    pins[str(path.relative_to(ROOT))] = dict(path=str(path.relative_to(ROOT)), sha256=sha(raw), bytes=len(raw), mode=stat.S_IMODE(info.st_mode))
    return raw
def sealed(directory, expected):
    m = json.loads(pin(directory/'manifest.json', expected))
    members = m.get('files',m.get('members'))
    check('finite manifest members '+str(directory.relative_to(T)), type(members) is list)
    data = {}
    for row in members:
        check('single member '+row['path'], Path(row['path']).name == row['path'])
        data[row['path']] = pin(directory/row['path'], row['sha256'], row['bytes'], row['mode'])
    check('exact directory '+str(directory.relative_to(T)), {p.name for p in directory.iterdir()} == set(data)|{'manifest.json'})
    return m, data
m, buffers = sealed(D, '4ee4fabed829952e235d1c2ff820c4a7f37e43970aab03d3b47d446a0436267f')
pm, old = sealed(P, '8322146c8638cdce1a2ab90aed1f8902983d767fa2bf231c13b33990e8db3310')
qm, qa = sealed(T/'qa/c8-public-observer-source05-exact-review', 'c128434100f0b123bccd54636fc19738fcffb15b38c85909ba98ce0a94a6fb92')
sealed(T/'resume-architecture/resume2/c8-public-observer-source04-exact-review', '018ef6e618bdc038ad1d764ca6e01753c9e731925ecbcffe6a875c28fcffd815')
sealed(T/'qa/c8-public-observer-source04-exact-review', '4f9d8295ec592246d72cb55acff6e61642b30c55770c7f9756205cae929f5a29')
pin(T/'resume2-c8-public-observer-source04-findings-root-adoption.json', 'c1b5ed617c10acaf81b05a2f22bb5d750873645e440bdf0aeb8f2dd4258fccec')
check('177 current /149 prior /23 QA', len(buffers)==177 and len(old)==149 and len(qa)==23)
for row in json.loads(buffers['runtime-input-pins.json'])['verifiedPreparedInputs']:
    pin(ROOT/row['path'], row['sha256'],row['bytes'],row['mode'])
for name in ('SHA256SUMS','RUNTIME-SHA256SUMS'):
    for line in buffers[name].decode().splitlines():
        digest, relative = line.split('  ',1)
        check(name+' '+relative, sha(buffers[relative])==digest)
for name in ('Replay.preimage.java','Replay.postimage.java','observer-fragment.java.txt','observer.patch','observer.reverse.patch','ObserverBoundaryHarness.java','java-harness-body.java.txt','public_contract.py','unit_policy.py','launch-control.template.json','public-observation.schema.json'):
    check('literal prior conditional mechanism '+name, buffers[name]==old[name])
retained = 0
for name in ('pure-check-results.json','runtime-adapter-check-results.json','boundary03-check-results.json','integration04-check-results.json'):
    current, previous = json.loads(buffers[name]), json.loads(old[name])
    check('exact retained names '+name,[r['name'] for r in current['checks']]==[r['name'] for r in previous['checks']] and current['failed']==0)
    retained += len(current['checks'])
check('727 retained semantic IDs', retained==727)
for name in ('runtime_adapter_checks.py','boundary03_checks.py','integration04_checks.py'):
    check('unchanged retained suite '+name,buffers[name]==old[name])
check('only explicit RuntimeError denial fixture',buffers['pure_checks.py'].decode()==old['pure_checks.py'].decode().replace("CONTROL['Hold'], AssertionError, TypeError", "CONTROL['Hold'], AssertionError, RuntimeError, TypeError"))
def functions(raw):
    result={}
    def walk(nodes, prefix=''):
        for node in nodes:
            if isinstance(node, ast.ClassDef):walk(node.body,prefix+node.name+'.')
            if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):result[prefix+node.name]=ast.dump(node,include_attributes=False)
    walk(ast.parse(raw).body)
    return result
before,after=functions(old['public_observation_unit.py']),functions(buffers['public_observation_unit.py'])
check('same adapter functions',set(before)==set(after))
for name in before:
    if name!='Effects.stop_relay':check('unchanged actual adapter AST '+name,before[name]==after[name])
before,after=functions(old['public_relay.py']),functions(buffers['public_relay.py'])
check('only refresh_closure added',set(after)-set(before)=={'Relay.refresh_closure'})
for name in before:
    if name not in ('Relay.stop','Relay.__init__'):check('unchanged actual relay AST '+name,before[name]==after[name])
impl=json.loads(buffers['runtime-implementation-map.json'])
trees={name:ast.parse(buffers[name]) for name in ('public_observation_unit.py','public_relay.py','public_contract.py','unit_policy.py','entry-loader.py.txt')}
check('99 sites15classes18callbacks9modes',len(impl['reachedInterpretationSites'])==99 and len(impl['inputClasses'])==15 and len(impl['requiredCallbacks'])==18 and len(impl['cli'])==9)
for qualified,row in impl['functions'].items():
    name,parts=qualified.split(':',1);nodes=trees[name].body
    for part in parts.split('.'):
        node=next(n for n in nodes if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name==part);nodes=node.body
    check('exact function span '+qualified,node.lineno==row['line'] and node.end_lineno==row['endLine'])
for index,row in enumerate(impl['reachedInterpretationSites']):
    check('actual interpretation site '+str(index),any(isinstance(n,ast.Call) and n.lineno==row['line'] and ast.unparse(n.func)==row['callee'] for n in ast.walk(trees[row['file']])))
for name,row in impl['requiredCallbacks'].items():
    check('callback span '+name,any(isinstance(n,ast.FunctionDef) and n.name==name and n.lineno==row['line'] and n.end_lineno==row['endLine'] for n in ast.walk(trees[row['file']])))
loader=buffers['entry-loader.py.txt'].decode();guard=buffers['guard-public-observe.bash'].decode()
check('common exact guard/ordinary/postclose loader',guard.split("readonly C8_PUBLIC_CONTROL_LOADER='\n",1)[1].split("\n'\nexit()",1)[0]+'\n'==loader)
check('all precompile checks non-removable',not any(isinstance(n,ast.Assert) for n in ast.walk(trees['entry-loader.py.txt'])))
install=json.loads(buffers['runtime-install-map.json'])
for row in install['members']:check('prospective install pin '+row['source'],sha(buffers[row['source']])==row['sha256'] and row['runtimeMode']==0o600)
check('common loader prospective pin',install['commonAdapterLoader']['sha256']==sha(buffers['entry-loader.py.txt']))
check('current candidate3a6f full recipe','3a6fddda4946106f143783640746464cf2c775256f2340b9d24d1a4701adadbd' in buffers['RECIPE.md'].decode())
for name in ('RECIPE.md','RUNTIME-RECIPE.md'):
    check('entry API and no obsolete candidate '+name,'entry-NNNN-pins.json' in buffers[name].decode() and 'ecb74d5f9ab42e3888d8e05f419f107213030873ca84d2b0dfc0ce4964da0b35' not in buffers[name].decode())
policy=json.loads(old['public-policy.json']);policy['sourceGeneration']=5
check('public policy only declared generation metadata',json.loads(buffers['public-policy.json'])==policy)
qa_checks=json.loads(qa['checks.json']);qa_findings=json.loads(qa['findings.json'])
check('sealed QA2290 checks',qa_checks['count']==2290 and all(row['pass'] is True for row in qa_checks['checks']))
check('sealed QA374/432/806 coverage',qa_checks['guardedReplayedControls']==374 and qa_checks['reusedPriorLiteralSemanticControls']==432 and qa_checks['totalSourceControlCoverage']==806)
for index,count in ((1,79),(2,104),(3,191)):
    lines=qa['suite-'+str(index)+'.stdout'].decode().splitlines();first,last=json.loads(lines[0]),json.loads(lines[-1])
    check('sealed actual guarded replay '+str(index),first['passed']==count and first['failed']==0 and last['executedChecks']==count and last['result']['failed']==0 and qa['suite-'+str(index)+'.stderr']==b'')
check('QA all-mode optimized/normal cases',len(qa_checks['independentAllModeLoaderCases'])==36)
check('QA all-five closure pairs',len(qa_checks['independentFiveResourceClosureCases'])==9)
check('QA mandatory constructor finding bound',qa_findings['mandatoryCount']==1 and qa_findings['mandatoryFindings'][0]['id']=='OBS05-QA-CUSTODY-01')
result=dict(count=len(checks),checks=checks,subjectMembers=177,oldMembers=149,qaMembers=23,retainedIds=727,reusedGuardedControls=374,reusedPriorControls=432,reusedSealedQaChecks=2290,actualActions=0)
(O/'source-checks.json').write_text(json.dumps(result,indent=2)+'\n')
(O/'pins.json').write_text(json.dumps(dict(pins=list(pins.values()),count=len(pins),actualProtectedBaselineOrRuntimeActions=0),indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
