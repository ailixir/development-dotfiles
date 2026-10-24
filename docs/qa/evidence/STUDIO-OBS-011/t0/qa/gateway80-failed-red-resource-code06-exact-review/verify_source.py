"""Independent bounded immutable Source06 pin/AST/evidence bindings. No target execution."""
import ast,hashlib,json,stat,shlex
from pathlib import Path
H=Path(__file__).absolute().parent;T=H.parents[1];ROOT=next(p for p in H.parents if p.name=='ui-studio');S=T/'early/gateway80-failed-red-resource-prep/resume6'
PINS=[];CHECKS=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def check(n,ok):
    if ok is not True:raise ValueError(n)
    CHECKS.append(n)
def bind(p,h=None,size=None,mode=None):
    b=p.read_bytes();st=p.lstat();check('regular:'+str(p.relative_to(ROOT)),stat.S_ISREG(st.st_mode) and not p.is_symlink())
    if h is not None:check('sha:'+str(p.relative_to(ROOT)),sha(b)==h)
    if size is not None:check('bytes:'+str(p.relative_to(ROOT)),len(b)==size)
    if mode is not None:check('mode:'+str(p.relative_to(ROOT)),stat.S_IMODE(st.st_mode)==(int(mode,8) if type(mode)is str else mode))
    PINS.append(dict(path=str(p.relative_to(ROOT)),sha256=sha(b),bytes=len(b),mode=stat.S_IMODE(st.st_mode)));return b
m=json.loads(bind(S/'manifest.json','b751602e38355042033e1a1b86ad0996c30a0377e56fae064f1eb383866e7976',56818,0o644))
for row in m['files']:bind(S/row['path'],row['sha256'],row['bytes'],row['mode'])
check('all258',len(m['files'])==258)
cs=bind(S/'SHA256SUMS').decode();lines=cs.splitlines();check('checksum259',len(lines)==259)
for line in lines:
    h,n=line.split('  ',1);check('checksum:'+n,sha((S/n).read_bytes())==h)
check('whole membership',{p.relative_to(S).as_posix() for p in S.rglob('*') if p.is_file()}=={r['path'] for r in m['files']}|{'manifest.json','SHA256SUMS'})
receipt=json.loads((S/'input-read-receipt.json').read_bytes())
for row in receipt['inputs']:bind(Path(row['path']),row['sha256'],row['bytes'],row['mode'])
bind(S/'complete-root-all-findings-adoption.json','7abc98e0eb0dadbff1a21476cc38faff0c551e4ea59bff78c288ebd785560b7d',202238)
for stem in ('gateway-failed-resource-source06','gateway-failed-resource-source06-lean-resume','gateway-failed-resource-source06-qa-review'):
    for suffix in ('task.txt','context.json'):bind(ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'/(stem+'-'+suffix))
names=('protocol.py','failed_gateway.py','factory.py','installer.py','install-cli.py','entry.py','control-author.py','control-author-cli.py','custody.py')
trees={n:ast.parse((S/n).read_bytes()) for n in names}
for n,tree in trees.items():check('nonremovable:'+n,not any(isinstance(x,ast.Assert) for x in ast.walk(tree)))
check('literal qualified custody',(S/'custody.py').read_bytes()==(S.parent/'resume5/custody.py').read_bytes())
final=json.loads((S/'final-binding-receipt.json').read_bytes());protocol=trees['protocol.py']
sink=next(n for n in protocol.body if isinstance(n,ast.ClassDef) and n.name=='FailureSink')
constants={n.targets[0].id:ast.literal_eval(n.value) for n in protocol.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ('STAGES','REASON_REGISTRY')}
for row in final['shellTokens']:
    text=(S/row['path']).read_text();check('final shellSHA:'+row['path'],sha(text.encode())==row['finalSha256'])
    body=shlex.split(text.split("-B -c '",1)[1].split("' ",1)[0].join(["'","'"]))[0] if False else shlex.split(text.split('-B -c ',1)[1])[0]
    check('actual argumentSHA:'+row['path'],sha(body.encode())==row['actualArgumentSha256'] and len(body.encode())==row['actualSingleQuotedArgumentBytes'])
    tree=ast.parse(body);other=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='FailureSink')
    check('actual sink AST:'+row['path'],ast.dump(sink,include_attributes=False)==ast.dump(other,include_attributes=False))
    actual={n.targets[0].id:ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in constants}
    check('actual registry:'+row['path'],actual==constants)
    old=(S/row['path'].replace('.bash','.bash.before-shell-quote-fix.txt')).read_text() if (S/row['path'].replace('.bash','.bash.before-shell-quote-fix.txt')).exists() else None
    # Historical intended Python is bound by the full frozen source hash below.
    check('nonremovable shell:'+row['path'],not any(isinstance(x,ast.Assert) for x in ast.walk(tree)))
late=json.loads((S/'critical-attempt10.json').read_bytes());old=(S/'failed_gateway-attempt10.py.txt').read_bytes();current=(S/'failed_gateway.py').read_bytes()
check('old runtimeSHA',sha(old)==late['sourceHashes']['failed_gateway.py'])
check('exact incremental delta',old.count(b'            typed.extend(rows)')==1 and old.replace(b'            typed.extend(rows)',b'            typed=P.actor_union(self.k,[*typed,*rows],allow_pending=True)')==current)
oldg=(S/'guard-failed-red.bash.before-shell-quote-fix.txt').read_text();oldbody=oldg.split("-B -c '",1)[1].split("' \"$GATEWAY_FR04_ENTRY\"",1)[0]
newbody=shlex.split((S/'guard-failed-red.bash').read_text().split('-B -c ',1)[1])[0]
check('historical intended actual AST',ast.dump(ast.parse(oldbody),include_attributes=False)==ast.dump(ast.parse(newbody),include_attributes=False))
for n in ('protocol.py','entry.py','custody.py','contract.json','operator-completion.js'):check('late unchanged dependency:'+n,sha((S/n).read_bytes())==late['sourceHashes'][n])
denials=[x for x in late['diagnostics'] if x.get('fault') in ('allow_io','unit_close','outer_close','delivery')]
check('four exact late denials',len(denials)==4 and all(x['status']==1 and x['primary']==dict(namespace='PROTOCOL_HOLD',reason='FRESHNESS_OR_CLOCK_REVERSE',stage='FINAL_GUARDED_ACCEPTANCE') for x in denials))
attempt=json.loads((S/'critical-attempt13.json').read_bytes());check('observed positive39',attempt['passed']==39 and attempt['failure'] is None and len(attempt['operatorSteps'])==13)
helper=(S/'operator-completion.js').read_bytes();prefix=final['pureJSReuse']['unchangedFunctionDependencyPrefixBytes'];historical=[p for p in S.rglob('*.js*') if sha(p.read_bytes())==final['pureJSReuse']['executedHistoricalHelperSha256']]
check('exact JS dependency prefix',len(historical)==1 and helper[:prefix]==historical[0].read_bytes()[:prefix])
p5=ast.parse((S.parent/'resume5/protocol.py').read_bytes());a5=next(n for n in p5.body if isinstance(n,ast.FunctionDef) and n.name=='actor_union');a6=next(n for n in protocol.body if isinstance(n,ast.FunctionDef) and n.name=='actor_union')
check('actor cap expansion explicit', '<= 256' in ast.unparse(a5) and '<= 8192' in ast.unparse(a6))
k=json.loads((S/'contract.json').read_bytes());check('prior namespaces',[len(x['members']) for x in k['priorNamespaces']]==[7,8]);check('known11 retained',len(k['knownPostBaseActors'])==11)
check('constant physical gap explicit',k['freshnessProofSubject']=='ORIGINAL_PERMIT_AT_FINAL_GUARDED_ACCEPTANCE_AFTER_SELECTED_CLEANUP')
result=dict(checks=len(CHECKS),pins=len(PINS),payloads=258,checksumRows=259,checksDetail=CHECKS,inputs=PINS,actualTargetActions=0,previous256To8192Explicit=True,current8192DedupUnchanged=True)
(H/'finite-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({x:y for x,y in result.items() if x not in ('checksDetail','inputs')}))
