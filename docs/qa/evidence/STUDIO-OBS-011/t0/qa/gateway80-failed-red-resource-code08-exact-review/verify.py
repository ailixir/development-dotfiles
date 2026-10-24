"""Finite exact Code08/source/mode/caller/reuse bindings. No target calls/private path access."""
from pathlib import Path
import ast,copy,json,hashlib,stat,shlex
H=Path(__file__).absolute().parent;T=H.parents[1];ROOT=next(p for p in H.parents if p.name=='ui-studio');S=T/'early/gateway80-failed-red-resource-prep/resume8';OLD=S.parent/'resume7';PRIVATE=T/'resume2-gateway80-source04-install-input-directory-facts.json';PINS=[];CHECKS=[]
sha=lambda b:hashlib.sha256(b).hexdigest()
def check(n,v):
 if v is not True:raise ValueError(n)
 CHECKS.append(n)
def bind(p,h=None,size=None,mode=None):
 check('publicapproved:'+str(p),p!=PRIVATE and '/runtime/' not in str(p));b=p.read_bytes();st=p.lstat();check('regular:'+str(p),stat.S_ISREG(st.st_mode) and not p.is_symlink())
 if h is not None:check('SHA:'+str(p),sha(b)==h)
 if size is not None:check('bytes:'+str(p),len(b)==size)
 if mode is not None:check('mode:'+str(p),stat.S_IMODE(st.st_mode)==mode)
 PINS.append(dict(path=str(p.relative_to(ROOT)),sha256=sha(b),bytes=len(b),mode=stat.S_IMODE(st.st_mode)));return b
m=json.loads(bind(S/'manifest.json','3fe65bc487f8badf8329ff44040b11d1634e93145142eb3b5bd72d782a82190b',7608,420))
for r in m['files']:bind(S/r['path'],r['sha256'],r['bytes'],r['mode'])
check('41payloads',len(m['files'])==41);lines=bind(S/'SHA256SUMS','cf5a5215db342d020932024f65b9a6e4bfc8f06b856aafdef241991a20437ccd').decode().splitlines();check('42checksum',len(lines)==42)
for line in lines:
 h,n=line.split('  ',1);check('checksum:'+n,sha((S/n).read_bytes())==h)
check('membership',{p.name for p in S.iterdir()}=={r['path']for r in m['files']}|{'manifest.json','SHA256SUMS'})
for r in json.loads((S/'phase-a-impact.json').read_bytes())['references']:bind(ROOT/r['path'],r['sha256'],r['bytes'],r['mode'])
phase=json.loads((S/'phase-b-authorization-bindings.json').read_bytes())
for r in [phase['rootAdoption'],phase['ariaManifest'],*phase['allFiveFullRead']]:bind(ROOT/r['path'],r['sha256'],r['bytes'],r.get('mode'))
registry=json.loads((T/'resume-architecture/resume2/gateway80-source08-private-input-mode-scope/registry.json').read_bytes());k=json.loads((S/'contract.json').read_bytes());ko=json.loads((OLD/'contract.json').read_bytes())
check('external hashprojection unchanged',k['externalSourcePins']==ko['externalSourcePins']);expected={r['path']:(r['sha256'],r['mode'])for r in registry['proposedEntries']}
check('closed exact29join',len(expected)==29 and {p:(k['externalSourcePins'][p],v)for p,v in k['externalInputModes'].items()}==expected)
check('oneprivate60028public644',sum(v==384 for v in k['externalInputModes'].values())==1 and sum(v==420 for v in k['externalInputModes'].values())==28)
for name in ('subject','retainedFailure','limits','priorNamespaces','typedRoleContract','expectedPhysicalPythonRoles','knownPostBaseActors','frozenEvidence','freshnessProofSubject','parentSchedulingIntervalProved'):check('unchanged:'+name,k[name]==ko[name])
check('NORMAL06 literal',k['subject']['code06ManifestSha256']=='e2e3340b48628c76884d6b243dd69134052e8e2ff3d25f5ab09d94f4e9150585')
check('onlyN01N02',[len(v['members'])for v in k['priorNamespaces']]==[7,8]);check('prospectiveN04',k['namespace']=='failed-red-resource-disposition04' and k['sourceGeneration']==8 and 'disposition04/root-authorization.json'in k['initialActorCarrierPath'])
final=json.loads((S/'final-bindings.json').read_bytes());critical=json.loads((H/'critical-results.json').read_bytes());author=json.loads((S/'critical-attempt02.json').read_bytes())
for n,h in final['currentTargetHashes'].items():check('currentexecuted:'+n,sha((S/n).read_bytes())==h==critical['sourceHashes'][n]==author['sourceHashes'][n])
def node(path,name):
 raw=path.read_text();nodes=ast.parse(raw).body
 for part in name.split('.'):
  n=next(n for n in nodes if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name==part);nodes=n.body
 return ast.get_source_segment(raw,n),n
class Normalize(ast.NodeTransformer):
 def visit_Constant(self,n):
  if type(n.value)is str:
   for a,b in [('resume8','resume7'),('code08','code07'),('SOURCE08','SOURCE07'),('source08','source07'),('Source08','Source07'),('FR05','FR04'),('fr05','fr04'),('N04','N03'),('failed-red-resource-disposition04','failed-red-resource-disposition03')]:n.value=n.value.replace(a,b)
  elif type(n.value)is int and n.value==8:n.value=7
  return n
for r in final['components']:
 if 'component'not in r:check('literal:'+r['path'],sha(bind(S/r['path']))==r['sha256'] and (S/r['path']).read_bytes()==(OLD/r['path']).read_bytes());continue
 a,na=node(S/r['path'],r['component']);b,nb=node(OLD/r['path'],r['component'])
 check('componenthashnew:'+r['component'],sha(a.encode())==r['currentComponentSha256']);check('componenthashold:'+r['component'],sha(b.encode())==r['source07ComponentSha256'])
 check('componentnormalization:'+r['component'],ast.dump(Normalize().visit(copy.deepcopy(na)),include_attributes=False)==ast.dump(nb,include_attributes=False))
 if r['rawExact']:check('rawliteral:'+r['component'],a==b)
protocol=ast.parse((S/'protocol.py').read_bytes());sink=next(n for n in protocol.body if isinstance(n,ast.ClassDef)and n.name=='FailureSink');constants={n.targets[0].id:ast.literal_eval(n.value)for n in protocol.body if isinstance(n,ast.Assign)and isinstance(n.targets[0],ast.Name)and n.targets[0].id in('STAGES','REASON_REGISTRY')}
for r in final['shellArgumentBindings']:
 body=shlex.split((S/r['path']).read_text().split('-B -c ',1)[1])[0];tree=ast.parse(body);check('actualshellarg:'+r['path'],sha(body.encode())==r['PythonArgumentSha256'])
 other=next(n for n in tree.body if isinstance(n,ast.ClassDef)and n.name=='FailureSink');check('commonsink:'+r['path'],ast.dump(other)==ast.dump(sink))
 actual={n.targets[0].id:ast.literal_eval(n.value)for n in tree.body if isinstance(n,ast.Assign)and isinstance(n.targets[0],ast.Name)and n.targets[0].id in constants};check('closedregistry:'+r['path'],actual==constants)
trace=json.loads((S/'trace-bearing-composition.json').read_bytes())
for row in trace['literalComponents']:bind(S/row['path'],row['sha256'],row['bytes']);check('tracehonestorigin:'+row['path'],'Source07'in row['origin'] and row['ownPidParentTrace'] is True)
for row in trace['payloads']:
 raw=(Path(row['payloadPath'])).read_bytes();prefix=(S/row['firstReadPrefix']).read_text();check('newtracepayload:'+row['firstReadPrefix'],sha(raw)==row['payloadSha256'] and len(raw)==row['payloadBytes'])
 check('boundedcorrectBashprefix:'+row['firstReadPrefix'],"IFS= LC_ALL=C builtin read -r -d '' -n "+str(row['payloadBytes']+1)+' 'in prefix and 'builtin eval'not in prefix and '-B -c'not in prefix and 'readonly '+row['readonlyBuffer']in prefix)
 check('samebuffertraceargv:'+row['firstReadPrefix'],row['staged807Argv'][-3:]==[row['readonlyBuffer'],row['payloadSha256'],str(row['payloadBytes'])])
check('independentfixed7',critical['passed']==41 and len(critical['cases'])==7 and critical['failure']is None and critical['realBoundaryCalls']==[])
# Source-level conflict conditions are assessed without adding a test matrix.
bound,nb=node(S/'failed_gateway.py','Unit.bound');retained,nr=node(S/'failed_gateway.py','Unit.retained_source_read');ext,ne=node(S/'protocol.py','external_input_specs')
check('stricttypedregistry',"type(mode)is int"in ext and "mode in(0o600,0o644)"in ext)
check('boundconflictsbeforebody',bound.index('CONFLICTING_EXPLICIT_INPUT_PIN')<bound.index('self.s.read') and bound.index('IMMUTABLE_MODE_CONFLICT')<bound.index('self.s.read'))
check('aliasfindingcodebound',retained.index('str(path) in self.external_inputs')<retained.index('self.s.read(path,None') and 'path=self.s.path(path)'not in retained)
alias=json.loads((H/'alias-results.json').read_bytes());check('concreteextraaliaspair',alias['directBoundDeniedBeforeBody']and alias['fallbackReadWrongModeAndChangedRaw']and alias['hashMismatchReturned']and alias['realBoundaryCalls']==[] and alias['extraCases']==1)
result=dict(checks=len(CHECKS),detail=CHECKS,pins=PINS,subjectPayloads=41,checksumRows=42,components=21,currentFixedAssertions=41,currentFixedCases=7,extraAliasCase=1,allOriginalPrivateBodyStatHashReads=0,actualTargetEffects=0,mandatoryAliasFindingConfirmed=True)
(H/'finite-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(dict(checks=len(CHECKS),pinRecords=len(PINS),all41and42=True,components=21,mandatoryAliasFindingConfirmed=True)))
