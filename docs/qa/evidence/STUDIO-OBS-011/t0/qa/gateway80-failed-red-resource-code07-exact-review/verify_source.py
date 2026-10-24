"""Finite immutable Source07 bindings; no target execution."""
import ast,copy,hashlib,json,stat,shlex
from pathlib import Path
H=Path(__file__).absolute().parent;T=H.parents[1];ROOT=next(p for p in H.parents if p.name=='ui-studio');S=T/'early/gateway80-failed-red-resource-prep/resume7';OLD=S.parent/'resume6'
PINS=[];CHECKS=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def check(n,v):
 if v is not True:raise ValueError(n)
 CHECKS.append(n)
def bind(p,h=None,size=None,mode=None):
 b=p.read_bytes();st=p.lstat();check('regular:'+str(p),stat.S_ISREG(st.st_mode) and not p.is_symlink())
 if h is not None:check('sha:'+str(p),sha(b)==h)
 if size is not None:check('bytes:'+str(p),len(b)==size)
 if mode is not None:check('mode:'+str(p),stat.S_IMODE(st.st_mode)==(int(mode,8) if type(mode)is str else mode))
 PINS.append(dict(path=str(p.relative_to(ROOT)),sha256=sha(b),bytes=len(b),mode=stat.S_IMODE(st.st_mode)));return b
def packet(p,expected):
 m=json.loads(bind(p/'manifest.json',expected))
 for r in m['files']:bind(p/r['path'],r['sha256'],r['bytes'],r['mode'])
 return m
m=packet(S,'045c5121ff25966eff78d741894684c776448e35c553cceb7765591ff70dd9b1');check('53',len(m['files'])==53)
lines=bind(S/'SHA256SUMS').decode().splitlines();check('54checksums',len(lines)==54)
for l in lines:
 h,n=l.split('  ',1);check('checksum:'+n,sha((S/n).read_bytes())==h)
check('membership',{p.relative_to(S).as_posix() for p in S.rglob('*') if p.is_file()}=={r['path'] for r in m['files']}|{'manifest.json','SHA256SUMS'})
for r in json.loads((S/'input-read-receipt.json').read_bytes())['references']:
 p=ROOT/r['path'];bind(p,r['sha256'],r['bytes'])
 if 'fullPayloadsReadAndVerified' in r:packet(p.parent,r['sha256'])
for r in json.loads((OLD/'input-read-receipt.json').read_bytes())['inputs']:bind(ROOT/r['path'],r['sha256'],r['bytes'],r['mode'])
bind(OLD/'complete-root-all-findings-adoption.json','7abc98e0eb0dadbff1a21476cc38faff0c551e4ea59bff78c288ebd785560b7d',202238)
for suffix in ('task.txt','context.json'):bind(ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'/('gateway-failed-resource-source07-qa-review-'+suffix))
f=json.loads((S/'final-bindings.json').read_bytes());attempt=json.loads((S/'critical-attempt04.json').read_bytes())
for n,h in f['currentSourceHashes'].items():check('current-executed:'+n,sha((S/n).read_bytes())==h==attempt['sourceHashes'][n])
def component(path,name):
 raw=path.read_text();nodes=ast.parse(raw).body
 for part in name.split('.'):
  node=next(n for n in nodes if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name==part);nodes=getattr(node,'body',[])
 return ast.get_source_segment(raw,node),node
for r in f['components']:
 if 'subject' not in r:check('literal:'+r['path'],(S/r['path']).read_bytes()==(OLD/r['path']).read_bytes());continue
 cur,c=component(S/r['path'],r['subject']);old,o=component(OLD/r['path'],r['subject'])
 check('component-new:'+r['subject'],sha(cur.encode())==r['currentComponentSha256']);check('component-old:'+r['subject'],sha(old.encode())==r['source06ComponentSha256'])
 if r['literalBytesExact']:check('literal-component:'+r['subject'],cur==old)
 else:
  class Normalize(ast.NodeTransformer):
   def visit_Constant(self,n):
    if type(n.value)is str:
     for a,b in [('resume7','resume6'),('code07','code06'),('SOURCE07','SOURCE06'),('source07','source06')]:n.value=n.value.replace(a,b)
    elif type(n.value)is int and n.value==7:n.value=6
    return n
  check('normalized-generation-only:'+r['subject'],ast.dump(Normalize().visit(copy.deepcopy(c)),include_attributes=False)==ast.dump(o,include_attributes=False))
protocol=ast.parse((S/'protocol.py').read_bytes());sink=next(n for n in protocol.body if isinstance(n,ast.ClassDef) and n.name=='FailureSink')
constants={n.targets[0].id:ast.literal_eval(n.value) for n in protocol.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ('STAGES','REASON_REGISTRY')}
for r in f['shellArguments']:
 body=shlex.split((S/r['path']).read_text().split('-B -c ',1)[1])[0];tree=ast.parse(body)
 check('shellraw:'+r['path'],sha(body.encode())==r['PythonArgumentSha256'] and len(body.encode())==r['bytes'])
 other=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='FailureSink');check('sink:'+r['path'],ast.dump(other)==ast.dump(sink))
 actual={n.targets[0].id:ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in constants};check('registry:'+r['path'],actual==constants)
 if r['path']!='install-loader.bash':
  oldbody=shlex.split((OLD/r['path']).read_text().split('-B -c ',1)[1])[0]
  strip=lambda tr:ast.Module(body=[n for n in tr.body if not(isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in constants)],type_ignores=[])
  check('whole-guardAST:'+r['path'],ast.dump(strip(tree))==ast.dump(strip(ast.parse(oldbody))))
k=json.loads((S/'contract.json').read_bytes());oldk=json.loads((OLD/'contract.json').read_bytes())
for name in ('subject','typedRoleContract','physicalRoleRequirements','limits','priorNamespaces','knownPostBaseActors'):
 if name in k:check('contract-preserved:'+name,k[name]==oldk[name])
check('known11',len(k['knownPostBaseActors'])==11);check('prior7and8',[len(x['members']) for x in k['priorNamespaces']]==[7,8])
check('current31/3',attempt['passed']==31 and attempt['failure'] is None and len(attempt['operatorSteps'])==3)
for i in range(1,5):bind(S/('critical-attempt0%d-tool-status.json'%i))
result=dict(checks=len(CHECKS),checksDetail=CHECKS,pins=PINS,payloads=53,checksumRows=54,actualTargetEffects=0,wholeOldSuitesReplayed=False)
(H/'finite-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(dict(checks=len(CHECKS),pinRecords=len(PINS),payloads=53,checksumRows=54)))
