"""Finite public/prepared byte, AST and sealed independent evidence binding only."""
from pathlib import Path
import ast, hashlib, json, stat
ROOT = Path.cwd()
T = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0'
D = T / 'early/c8-check01-public-evidence-prep/resume6'
P = D.parent / 'resume5'
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
m, buffers = sealed(D, 'b5aa1e5d1e602c30b0e134ad21342ec1604ea2b2cf7e31be1b2c7d58a1f4bdf1')
pm, old = sealed(P, '4ee4fabed829952e235d1c2ff820c4a7f37e43970aab03d3b47d446a0436267f')
qm, qa = sealed(T/'qa/c8-public-observer-source06-exact-review', '8f53da49d167dbf13c391dc2c90e3615b9445cb9db6e39f9cabcb99c98c23ea2')
sealed(T/'resume-architecture/resume2/c8-public-observer-source05-exact-review', '36c2b9c8c4c2796669b9f86dc1c546912043d65c2452bceda35c03ac9f346a67')
sealed(T/'qa/c8-public-observer-source05-exact-review', 'c128434100f0b123bccd54636fc19738fcffb15b38c85909ba98ce0a94a6fb92')
pin(T/'resume2-c8-public-observer-source05-findings-root-adoption.json', '246e36e051568cdf538ccc57010f08eb90f731bf49cdc3f7a57209d61da249a4')
check('212 current /177 prior /21 QA', len(buffers)==212 and len(old)==177 and len(qa)==21)
for row in json.loads(buffers['runtime-input-pins.json'])['verifiedPreparedInputs']:
    pin(ROOT/row['path'], row['sha256'],row['bytes'],row['mode'])
for name in ('SHA256SUMS','RUNTIME-SHA256SUMS'):
    for line in buffers[name].decode().splitlines():
        digest, relative = line.split('  ',1)
        check(name+' '+relative, sha(buffers[relative])==digest)
for name in ('Replay.preimage.java','Replay.postimage.java','observer-fragment.java.txt','observer.patch','observer.reverse.patch','ObserverBoundaryHarness.java','java-harness-body.java.txt','public_contract.py','unit_policy.py','launch-control.template.json','public-observation.schema.json'):
    check('literal prior conditional mechanism '+name, buffers[name]==old[name])
retained = 0
for name in ('pure-check-results.json','runtime-adapter-check-results.json','boundary03-check-results.json','integration04-check-results.json','targeted05-check-results.json'):
    current, previous = json.loads(buffers[name]), json.loads(old[name])
    check('exact retained names '+name,[r['name'] for r in current['checks']]==[r['name'] for r in previous['checks']] and current['failed']==0)
    retained += len(current['checks'])
check('806 retained semantic IDs', retained==806)
for name in ('pure_checks.py','integration04_checks.py'):
    check('unchanged retained suite '+name,buffers[name]==old[name])
def predicates(raw):
    return [ast.dump(n,include_attributes=False) for n in ast.walk(ast.parse(raw)) if isinstance(n,ast.Assert) or isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id in ('check','denied')]
for name in ('runtime_adapter_checks.py','boundary03_checks.py','targeted05_checks.py'):
    check('unchanged retained semantic predicates '+name,predicates(buffers[name])==predicates(old[name]))
def functions(raw):
    result={}
    def walk(nodes, prefix=''):
        for node in nodes:
            if isinstance(node, ast.ClassDef):walk(node.body,prefix+node.name+'.')
            if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):result[prefix+node.name]=ast.dump(node,include_attributes=False)
    walk(ast.parse(raw).body)
    return result
before,after=functions(old['public_observation_unit.py']),functions(buffers['public_observation_unit.py'])
changed={'Custody.__init__','Custody.read','Custody.create_fd','Custody.write','Custody.replace_exact','Custody.close','System.custody','System.sink','System.lock_free','Effects.__init__','Effects.release_custody','Effects.start_relay','load','main'}
added={'Custody.close_fd','Custody.open_fd','Custody.token','Ownership.__init__','Ownership.acquire','Ownership.blockers','Ownership.close','Ownership.finish','Ownership.owner','Ownership.retain','Ownership.summary','Ownership.transfer','Ownership.view','System.__init__'}
check('exact14 changed adapter functions',{name for name in before if before[name]!=after[name]}==changed)
check('exact14 added functions',set(after)-set(before)==added and not set(before)-set(after))
for name in before:
    if name not in changed:check('unchanged actual adapter AST '+name,before[name]==after[name])
before,after=functions(old['public_relay.py']),functions(buffers['public_relay.py'])
check('exact2 changed relay methods',set(before)==set(after) and {name for name in before if before[name]!=after[name]}=={'Relay.__init__','Relay.refresh_closure'})
for name in before:
    if name not in ('Relay.__init__','Relay.refresh_closure'):check('unchanged actual relay AST '+name,before[name]==after[name])
coverage=json.loads(buffers['proof-coverage06.json'])
check('501 current420 reuse806 retained115new921 total',coverage['currentExecuted']==501 and coverage['reusedPrior']==420 and coverage['retainedIds']==806 and coverage['newChecks']==115 and coverage['totalSourceCoverage']==921)
subset=json.loads(buffers['retained06-affected-results.json']);runtime=json.loads(buffers['runtime-adapter-check-results.json'])
check('12 distinct affected retained IDs subset',len(subset['checks'])==12 and len({r['name'] for r in subset['checks']})==12 and {r['name'] for r in subset['checks']}<={r['name'] for r in runtime['checks']})
check('420 reuse with exact prior historic result bytes',buffers['pure-check-results.json']==old['pure-check-results.json'] and buffers['runtime-adapter-check-results.json']==old['runtime-adapter-check-results.json'] and 311+121-12==420)
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
policy=json.loads(old['public-policy.json']);policy['sourceGeneration']=6
check('public policy only declared generation metadata',json.loads(buffers['public-policy.json'])==policy)
qa_checks=json.loads(qa['checks.json']);qa_findings=json.loads(qa['findings.json'])
check('sealed QA2771 checks',qa_checks['count']==2771 and all(row['pass'] is True for row in qa_checks['checks']))
check('sealed QA501/420/921 coverage',qa_checks['guardedReplayedControls']==501 and qa_checks['reusedPriorLiteralSemanticControls']==420 and qa_checks['totalSourceControlCoverage']==921)
for index,count in ((1,79),(2,104),(3,191),(4,55),(5,60),(6,12)):
    lines=qa['suite-'+str(index)+'.stdout'].decode().splitlines();last=json.loads(lines[-1])
    check('sealed actual guarded replay '+str(index),last['executedChecks']==count and last['result'].get('failed',0)==0 and qa['suite-'+str(index)+'.stderr']==b'')
check('QA all-mode optimized/normal cases',len(qa_checks['independentAllModeLoaderCases'])==36)
check('QA eight borrow state pairs',len(qa_checks['independentBorrowStateCases'])==8)
check('QA exact zero mandatory finding',qa_findings['mandatoryCount']==0 and qa_findings['mandatoryFindings']==[])
result=dict(count=len(checks),checks=checks,subjectMembers=212,oldMembers=177,qaMembers=21,retainedIds=806,reusedGuardedControls=501,reusedPriorControls=420,reusedSealedQaChecks=2771,actualActions=0)
(O/'source-checks.json').write_text(json.dumps(result,indent=2)+'\n')
(O/'pins.json').write_text(json.dumps(dict(pins=list(pins.values()),count=len(pins),actualProtectedBaselineOrRuntimeActions=0),indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
