"""Finite exact public-source metadata/AST review; no target execution."""
from pathlib import Path
import ast,hashlib,json,re,stat
ROOT=Path('docs/qa/evidence/STUDIO-OBS-011/t0');HERE=Path(__file__).absolute().parent
SUBJECT=ROOT/'early/gateway80-failed-red-resource-prep/resume4'
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
subject=packet('early/gateway80-failed-red-resource-prep/resume4','cac4f5a1d4e770ae9d2ee65354b9ce7d93c48a41d49ccbb7c39ebbaa95d47b2e')
packet('early/gateway80-failed-red-resource-prep/resume3','2e4f6203a252cae88239d37513e7f956f9dc1dd1d8345d1c79086023a1a8a198')
packet('early/gateway80-proof-prep/resume6','e2e3340b48628c76884d6b243dd69134052e8e2ff3d25f5ab09d94f4e9150585')
packet('resume-architecture/resume2/gateway80-failed-red-resource-code03-exact-review','338207669e4f3c6c2d7806162987ebcdc19b388b20b49b040e07beaa8151e5a3')
packet('qa/gateway80-failed-red-resource-code03-exact-review','82d60d1827250b7780b13138ce7617202f07e0b0ae5dece6e6a438f3a9c6188c')
pin(ROOT/'resume2-gateway80-failed-resource-source03-all-findings-root-adoption.json','a4b1642e42cb49049ff23b0e398ada2463acc4582007d77926a322c0d8f1419e')
api=json.loads((SUBJECT/'api-map.json').read_text());mapping=json.loads((SUBJECT/'interpretation-map.json').read_text())
trees={name:ast.parse((SUBJECT/name).read_bytes()) for name in {row['file'] for row in api['functions'].values()}}
for key,row in api['functions'].items():
    found=[n for n in ast.walk(trees[row['file']]) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.lineno==row['line']]
    check('mapped_function:'+key,len(found)==1 and found[0].end_lineno==row['endLine'] and ast.unparse(found[0].args)==row['signature'])
check('matching_complete_function_maps',api['functions']==mapping['functions'] and len(api['functions'])==118)
for i,row in enumerate(mapping['reachedInterpretationSites']):
    found=[n for n in ast.walk(trees[row['file']]) if isinstance(n,ast.Call) and n.lineno==row['line'] and ast.unparse(n.func)==row['callee']]
    check('mapped_interpretation:'+str(i),len(found)>=1)
check('118sites13classes',len(mapping['reachedInterpretationSites'])==118 and len(mapping['inputClasses'])==13)
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

prior=ROOT/'early/gateway80-failed-red-resource-prep/resume3'
reuse=json.loads((SUBJECT/'reuse-analysis.json').read_text())
for row in reuse['unchangedFunctions']:
    def selected(directory):
        nodes=[n for n in ast.walk(ast.parse((directory/row['file']).read_bytes())) if isinstance(n,ast.FunctionDef) and n.name==row['function']]
        check('reuse_unique:'+str(directory)+row['function'],len(nodes)==1)
        return ast.dump(nodes[0],include_attributes=False)
    check('reuse_ast:'+row['file']+row['function'],selected(SUBJECT)==selected(prior))
check('reuse19_original_result',(SUBJECT/'ancestor03-extra-check-results.json').read_bytes()==(prior/'extra-check-results.json').read_bytes() and json.loads((SUBJECT/'ancestor03-extra-check-results.json').read_text())['passed']==19)
classes=[]
for n in ('protocol.py','install-cli.py'):
    tree=ast.parse((SUBJECT/n).read_bytes());classes.append(ast.dump(next(x for x in tree.body if isinstance(x,ast.ClassDef) and x.name=='FailureSink'),include_attributes=False))
for n in ('guard-failed-red.bash','install-loader.bash'):
    text=(SUBJECT/n).read_text();body=text.split("-B -c '",1)[1].split("\n' ",1)[0]
    tree=ast.parse(body);classes.append(ast.dump(next(x for x in tree.body if isinstance(x,ast.ClassDef) and x.name=='FailureSink'),include_attributes=False))
    check('inline_nonremovable:'+n,not any(isinstance(x,ast.Assert) for x in ast.walk(tree)))
check('all_four_sink_classes_literal_ast',len(set(classes))==1)
for n in ('factory.py','failed_gateway.py'):
    text=(SUBJECT/n).read_text();check('exact_final_review_paths:'+n,'gateway80-failed-red-resource-code04-exact-review/manifest.json' in text and 'gateway80-failed-red-resource-source04-exact-review/manifest.json' not in text)
for suffix in ('task.txt','context.json','rev2-task.txt','rev2-context.json'):
    prefix='gateway80-failed-red-resource-source04-architecture-review-'
    pin(Path('.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011')/(prefix+suffix))

qa=ROOT/'qa/gateway80-failed-red-resource-code04-exact-review';suitecounts={}
qa_files=['replay.py','independent.py','independent.stdout','independent.stderr']
for n in ('checks.py','optimized_bootstrap_checks.py','code02_checks.py','source03_checks.py','source04_three_checks.py'):
    qa_files.extend(['replay-'+n+'.stdout','replay-'+n+'.stderr'])
    output=pin(qa/('replay-'+n+'.stdout')).decode();result=json.loads(output.splitlines()[-1]);check('qa_exact_suite:'+n,result['suite']==n and result['suiteSha256']==hashlib.sha256((SUBJECT/n).read_bytes()).hexdigest() and result['result']['failed']==0)
    suitecounts[n]=result['result']['passed']
check('qa313_bound',list(suitecounts.values())==[89,6,83,72,63] and sum(suitecounts.values())==313)
for name in qa_files:pin(qa/name)
result=dict(kind='FINITE_SOURCE04_METADATA_AST_AND_EXACT_QA_BINDINGS',passed=len(CHECKS),failed=0,checks=CHECKS,pins=list(PINS.values()),qaReplayedControlsBound=suitecounts,prior19ReusedAfterAstResultBinding=True,qaFinalSealPendingAtAriaSeal=True,subjectFunctionsExecutedByThisChecker=0,protectedRuntimePrivateBaselineReads=0)
(HERE/'source-checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(checks=len(CHECKS),uniquePins=len(PINS),qa313bound=True,prior19reuseBound=True,subjectExecution=0)))
