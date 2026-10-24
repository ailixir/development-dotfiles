"""Finite exact Code08 whole-source/reuse/caller binding, no target execution."""
from pathlib import Path
import ast,copy,hashlib,json,shlex,stat
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume8');T=Path('docs/qa/evidence/STUDIO-OBS-011/t0');O=T/'resume-architecture/resume2/gateway80-failed-red-resource-code08-exact-review'
checks=[];pins=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def check(n,v):
 checks.append(dict(id=n,passed=bool(v)))
 if not v:raise AssertionError(n)
def bind(p,r=None):
 b=p.read_bytes();mode=stat.S_IMODE(p.stat().st_mode)
 if r:check('PIN-'+str(p),sha(b)==r['sha256'] and len(b)==r['bytes'] and ('mode' not in r or mode==r['mode']))
 pins.append(dict(path=str(p),sha256=sha(b),bytes=len(b),mode=mode));return b
def packet(path,expected,count):
 raw=bind(path/'manifest.json');check('MANIFEST-'+str(path),sha(raw)==expected);m=json.loads(raw)
 check('COUNT-'+str(path),len(m['files'])==count and len({r['path'] for r in m['files']})==count)
 return {r['path']:bind(path/r['path'],r) for r in m['files']}
cache=packet(S,'3fe65bc487f8badf8329ff44040b11d1634e93145142eb3b5bd72d782a82190b',41)
check('EXACT-CURRENT-MEMBERSHIP',{str(p.relative_to(S)) for p in S.rglob('*') if p.is_file()}==set(cache)|{'manifest.json','SHA256SUMS'})
cs={}
for line in (S/'SHA256SUMS').read_text().splitlines():
 h,n=line.split('  ',1);check('CHECKSUM-'+n,sha((S/n).read_bytes())==h);cs[n]=h
check('42-ACYCLIC-CHECKSUMS',len(cs)==42 and set(cs)==set(cache)|{'manifest.json'})
old=packet(S.parent/'resume7','045c5121ff25966eff78d741894684c776448e35c553cceb7765591ff70dd9b1',53)
design=T/'resume-architecture/resume2/gateway80-source08-private-input-mode-scope';dc=packet(design,'de8eb1e7182294e48bcf546d5fb64352c1abb6443042537f42f5547e74415ead',5)
phase=json.loads(cache['phase-b-authorization-bindings.json']);root=phase['rootAdoption'];bind(Path(root['path']),root)
for r in phase['allFiveFullRead']:bind(Path(r['path']),r)
k=json.loads(cache['contract.json']);ko=json.loads(old['contract.json']);registry=json.loads(dc['registry.json'])['proposedEntries']
check('EXACT-29-JOIN-TO-SEALED-DESIGN',{p:(k['externalSourcePins'][p],mode) for p,mode in k['externalInputModes'].items()}=={r['path']:(r['sha256'],r['mode']) for r in registry})
check('UNCHANGED-29-HASHES',k['externalSourcePins']==ko['externalSourcePins'] and len(k['externalInputModes'])==29)
for n in ('typedRoleContract','limits','priorNamespaces','knownPostBaseActors','finiteUnion','frozenEvidence','expectedPhysicalPythonRoles','expectedObservationExecutables','subject'):
 check('UNCHANGED-CONTRACT-'+n,k[n]==ko[n])
check('ROLE-CONTRACT-PIN',sha(json.dumps(k['typedRoleContract'],sort_keys=True,separators=(',',':'),allow_nan=False).encode())=='f7fe2d5fcff6065b3b6c4074359206ff3723d27e9ae275cf6f50725bdd0bb8c9')
def node(b,symbol):
 n=ast.parse(b)
 for part in symbol.split('.'):n=next(x for x in n.body if isinstance(x,(ast.FunctionDef,ast.ClassDef)) and x.name==part)
 return n
def seg(b,symbol):return ast.get_source_segment(b.decode(),node(b,symbol))
class OwnGeneration(ast.NodeTransformer):
 def visit_Constant(self,n):
  if type(n.value)is str:
   v=n.value
   for a,b in [('SOURCE08','SOURCE07'),('source08','source07'),('code08','code07'),('resume8','resume7'),('FR05','FR04'),('fr05','fr04'),('N04','N03'),('N4_STATE','N3_STATE'),('disposition04','disposition03')]:v=v.replace(a,b)
   return ast.copy_location(ast.Constant(v),n)
  return n
 def visit_Compare(self,n):
  self.generic_visit(n)
  if isinstance(n.left,ast.Subscript) and isinstance(n.left.slice,ast.Constant) and n.left.slice.value=='sourceGeneration':
   n.comparators=[ast.copy_location(ast.Constant(7),x) if isinstance(x,ast.Constant) and type(x.value)is int and x.value==8 else x for x in n.comparators]
  return n
 def visit_keyword(self,n):
  self.generic_visit(n)
  if n.arg=='sourceGeneration' and isinstance(n.value,ast.Constant) and type(n.value.value)is int and n.value.value==8:n.value=ast.copy_location(ast.Constant(7),n.value)
  return n
final=json.loads(cache['final-bindings.json'])
transport=T/'early/gateway80-source07-bash32-delivery/resume1';tm=json.loads(bind(transport/'manifest.json'));check('TRANSPORT-REFERENCE',sha((transport/'manifest.json').read_bytes())=='8d60c9ba73c9c318b6b082a3d758c09705933fd7f66d1cff39c1a6f266300c7f')
tr={r['path']:r for r in tm['files']}
for r in final['components']:
 name=r['path']
 if 'component' not in r:
  if name=='custody.py':check('LITERAL-CUSTODY',cache[name]==old[name])
  else:
   approved={'buffer-bootstrap-inline.py':'096dc4e870fa916d1d179e7f87f3c1825b7d89e8615a24a28b8c1bc4d9a8517c','buffer-verifier-inline.py':'58261be0963e6fb9172bfd964d99061939f4c5fc06a6b63773f22de37c24ef0b'}
   check('LITERAL-TRACE-COMPONENT-'+name,sha(cache[name])==r['sha256']==approved[name])
  continue
 sym=r['component'];x,y=seg(cache[name],sym),seg(old[name],sym)
 if r['rawExact']:check('LITERAL-'+name+'-'+sym,x==y)
 else:check('OWN-LABEL-AST-'+name+'-'+sym,ast.dump(OwnGeneration().visit(copy.deepcopy(node(cache[name],sym))),include_attributes=False)==ast.dump(node(old[name],sym),include_attributes=False))
js=OwnGeneration().visit(ast.Constant(cache['operator-completion.js'].decode())).value
check('JS-ONLY-OWN-LABELS',js.replace('FR08Operator','FR07Operator').replace('sourceGeneration===8','sourceGeneration===7')==old['operator-completion.js'].decode())
pt=ast.parse(cache['protocol.py'])
def assigns(t):return {x.id:ast.dump(n.value,include_attributes=False) for n in t.body if isinstance(n,ast.Assign) for x in n.targets if isinstance(x,ast.Name)}
pa=assigns(pt)
for r in final['shellArgumentBindings']:
 name=r['path'];argument=shlex.split(cache[name].decode().split('-B -c ',1)[1])[0];a=ast.parse(argument)
 check('SHELL-ARG-'+name,sha(argument.encode())==r['PythonArgumentSha256'])
 check('SHELL-SINK-'+name,ast.dump(node(argument.encode(),'FailureSink'),include_attributes=False)==ast.dump(node(cache['protocol.py'],'FailureSink'),include_attributes=False))
 check('SHELL-CLOSED-CONSTANTS-'+name,all(assigns(a)[key]==pa[key] for key in ('STAGES','REASON_REGISTRY')))
attempt=json.loads(cache['critical-attempt02.json'])
check('AUTHOR41-7-FAKE',attempt['passed']==41 and len(attempt['cases'])==7 and attempt['failure'] is None and attempt['realBoundaryCalls']==[] and attempt['originalPrivateBodyStatHashAcquired'] is False)
for name,h in attempt['sourceHashes'].items():check('AUTHOR-EXECUTED-14-'+name,sha(cache[name])==h==final['currentTargetHashes'][name])
current=json.loads((O/'critical-results.json').read_bytes());check('OWN-BATCH-OBSERVED',current['failure'] is None and len(current['fixedSubsetCases'])==2 and current['ownChecksCount']==7 and current['realBoundaryCalls']==[])
for name,h in current['sourceHashes'].items():check('OWN-EXECUTED-14-'+name,sha(cache[name])==h)
trace=json.loads(cache['trace-bearing-composition.json'])
for r in trace['payloads']:
 name=Path(r['payloadPath']).name;prefix=cache[r['firstReadPrefix']].decode()
 check('PREFIX-EXACT-PAYLOAD-'+name,sha(cache[name])==r['payloadSha256'] and len(cache[name])==r['payloadBytes'] and str(r['payloadBytes']+1) in prefix)
 commands='\n'.join(line for line in prefix.splitlines() if not line.lstrip().startswith('#'))
 check('PREFIX-BASH32-STOP-'+name,"IFS= LC_ALL=C builtin read -r -d '' -n " in commands and 'eval ' not in commands and 'python' not in commands)
for name in ('install-cli.py','control-author-cli.py','entry.py','installer.py','factory.py','control-author.py'):ast.parse(cache[name]);check('PARSE-'+name,True)
bound=seg(cache['failed_gateway.py'],'Unit.bound');reader=seg(cache['failed_gateway.py'],'Unit.retained_source_read')
check('BOUND-NORMALIZES-BEFORE-REGISTRY',bound.index('self.s.path(path)')<bound.index('self.external_inputs.get'))
check('CALLBACK-RAW-LOOKUP-PRECEDES-NORMALIZING-FALLBACK',"if str(path) in self.external_inputs" in reader and "self.s.read(path,None,134217728)" in reader and 'self.s.path(path)' not in reader)
check('MODE-REGISTRY-BEFORE-AUTHORITY-EXTERNAL-BODIES','external_input_specs(contract)' in seg(cache['protocol.py'],'authority_shape'))
print(json.dumps(dict(kind='ARIA08_EXACT_FINITE_SOURCE_REUSE_BINDING',passed=len(checks),failed=0,checks=checks,pins=pins,uniqueNamedPins=len({r['path'] for r in pins}),targetFunctionsExecuted=0,privateOriginalBodyStatHashAcquired=False,actualResourceActions=0,callbackNormalizationConcernRecorded=True),indent=2))
