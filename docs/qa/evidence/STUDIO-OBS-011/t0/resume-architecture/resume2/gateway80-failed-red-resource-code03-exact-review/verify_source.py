"""Finite exact public-source metadata/AST review; no target execution."""
from pathlib import Path
import ast,hashlib,json,re,stat
ROOT=Path('docs/qa/evidence/STUDIO-OBS-011/t0');HERE=Path(__file__).absolute().parent
SUBJECT=ROOT/'early/gateway80-failed-red-resource-prep/resume3'
CHECKS=[];PINS={}
def check(name,value):
    if value is not True:raise ValueError(name)
    CHECKS.append(dict(id=name,passed=True))
def pin(path,sha=None,size=None,mode=None):
    raw=path.read_bytes();info=path.lstat();h=hashlib.sha256(raw).hexdigest()
    check(str(path)+':regular',stat.S_ISREG(info.st_mode))
    if sha is not None:check(str(path)+':sha',h==sha)
    if size is not None:check(str(path)+':bytes',len(raw)==size)
    if mode is not None:check(str(path)+':mode',stat.S_IMODE(info.st_mode)==mode)
    PINS[str(path)]=dict(path=str(path),sha256=h,bytes=len(raw),mode=stat.S_IMODE(info.st_mode));return raw
def packet(sub,expected):
    p=ROOT/sub;m=json.loads(pin(p/'manifest.json',expected));rows=m.get('files',m.get('members'))
    check(sub+':finite_rows',type(rows)is list)
    for r in rows:
        check(sub+':relative_'+r['path'],not Path(r['path']).is_absolute() and '..' not in Path(r['path']).parts)
        mode=r['mode'];mode=mode if type(mode)is int else int(mode,0) if mode.startswith('0o') else int(mode,8)
        pin(p/r['path'],r['sha256'],r['bytes'],mode)
    return m
subject=packet('early/gateway80-failed-red-resource-prep/resume3','2e4f6203a252cae88239d37513e7f956f9dc1dd1d8345d1c79086023a1a8a198')
packet('early/gateway80-failed-red-resource-prep/resume2','aaeb967ecc7eb279c70fb50e69218898295094b96fea23f7fdf82c99ce224558')
packet('early/gateway80-proof-prep/resume6','e2e3340b48628c76884d6b243dd69134052e8e2ff3d25f5ab09d94f4e9150585')
packet('resume-architecture/resume2/gateway80-failed-red-resource-code02-exact-review','19948c278df2fdb3fe334ebe328c3b0fe2a1eef0c8d1e51c6c2c4227a5e0a1ed')
packet('qa/gateway80-failed-red-resource-code02-exact-review','894be13e034fcfb1cc137a5b1b76b28a2eaac650a2c6145713251108a2252610')
packet('resume-architecture/resume2/gateway-failed-prequalification-disposition-design','eaddcae2d795989a6585d636718d8c5f67340d79bde824803d16f8a28704f06c')
packet('qa/gateway-failed-prequalification-disposition-design-review','6a5fc57b2f89b879f5f12d3760a01d1b5bf9f54d62a297268644427e2536fa25')
api=json.loads((SUBJECT/'api-map.json').read_text());mapping=json.loads((SUBJECT/'interpretation-map.json').read_text())
trees={name:ast.parse((SUBJECT/name).read_bytes()) for name in {row['file'] for row in api['functions'].values()}}
for key,row in api['functions'].items():
    found=[n for n in ast.walk(trees[row['file']]) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.lineno==row['line']]
    check('mapped_function:'+key,len(found)==1 and found[0].end_lineno==row['endLine'] and ast.unparse(found[0].args)==row['signature'])
check('matching_complete_function_maps',api['functions']==mapping['functions'] and len(api['functions'])==112)
for i,row in enumerate(mapping['reachedInterpretationSites']):
    found=[n for n in ast.walk(trees[row['file']]) if isinstance(n,ast.Call) and n.lineno==row['line'] and ast.unparse(n.func)==row['callee']]
    check('mapped_interpretation:'+str(i),len(found)>=1)
check('93sites13classes',len(mapping['reachedInterpretationSites'])==93 and len(mapping['inputClasses'])==13)
for name,tree in trees.items():check('nonremovable_runtime:'+name,not any(isinstance(n,ast.Assert) for n in ast.walk(tree)))
k=json.loads((SUBJECT/'contract.json').read_text());check('2255_exact_numeric_set',len(k['finiteUnion']['numericIds'])==2255 and len(set(k['finiteUnion']['numericIds']))==2255 and k['finiteUnion']['numericOnlyAbsent']==[73492,86096,96486])
check('immutable_typed_prior7',len(k['priorNamespaces'])==1 and len(k['priorNamespaces'][0]['members'])==7 and k['priorNamespaces'][0]['type']=='IMMUTABLE_PRIOR_FAILED_PREQUALIFICATION_NAMESPACE')
install=json.loads((SUBJECT/'install-map.json').read_text())
for row in install['files']:
    raw=(SUBJECT/row['source']).read_bytes();check('install_code:'+row['source'],hashlib.sha256(raw).hexdigest()==row['sha256'] and row['sourceMode']==420 and row['installedMode']==384)
guard=(SUBJECT/'guard-failed-red.bash').read_text();check('literal_binding',(SUBJECT/'binding-functions.bash').read_text()==guard and guard in (SUBJECT/'bind-command.template.bash').read_text())
check('no_global_shell_settings',not any(re.match(r'^set [+-][A-Za-z]',l.strip()) or l.strip().startswith('shopt ') for l in guard.splitlines()))
check('separate_new_caps',all('GATEWAY_FR03_'+x+'_STARTED=1' in guard for x in ('NEGATIVE','HELD','ARCHIVE','FINAL','GATE','POSTCLOSE')) and 'GATEWAY_FAILED_' not in guard)
registry=json.loads((SUBJECT/'source-reason-registry.json').read_text())['registries']
for name in ('protocol.py','install-cli.py'):
    tree=ast.parse((SUBJECT/name).read_bytes());assign=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='REASON_REGISTRY' for t in n.targets));check('registry:'+name,ast.literal_eval(assign.value)==registry)
for name in ('guard-failed-red.bash','install-loader.bash'):
    text=(SUBJECT/name).read_text();start=text.index('REASON_REGISTRY=');line=text[start:].splitlines()[0];check('registry:'+name,ast.literal_eval(ast.parse(line).body[0].value)==registry)
qa=ROOT/'qa/gateway80-failed-red-resource-code03-exact-review';suitecounts={};qa_files=['replay.py','independent.py','independent-final.stdout','independent-final.stderr']
for n in ('checks.py','extra_checks.py','optimized_bootstrap_checks.py','code02_checks.py','source03_checks.py'):
    qa_files.extend(['replay-'+n+'.stdout','replay-'+n+'.stderr'])
    output=pin(qa/('replay-'+n+'.stdout')).decode();result=json.loads(output.splitlines()[-1]);check('qa_exact_suite:'+n,result['suite']==n and result['suiteSha256']==hashlib.sha256((SUBJECT/n).read_bytes()).hexdigest() and result['result']['failed']==0)
    suitecounts[n]=result['result']['passed']
check('qa269_bound',list(suitecounts.values())==[89,19,6,83,72] and sum(suitecounts.values())==269)
for name in qa_files:pin(qa/name)
independent=json.loads((qa/'independent-final.stdout').read_text());check('qa12_attributed',independent['passed']==12 and independent['failed']==0 and any(r['name']=='INDEPENDENT_CREATED_NAMESPACE_MISREPORTED_ABSENT' for r in independent['checks']))
result=dict(kind='FINITE_SOURCE_METADATA_AST_AND_EXACT_QA_BINDINGS',passed=len(CHECKS),failed=0,checks=CHECKS,pins=list(PINS.values()),qaReplayedControlsBound=suitecounts,qaIndependentChecksAttributed=12,qaFinalSealPendingAtAriaSeal=True,subjectFunctionsExecutedByThisChecker=0,protectedRuntimePrivateBaselineReads=0)
(HERE/'source-checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(checks=len(CHECKS),uniquePins=len(PINS),qa269bound=True,subjectExecution=0)))
