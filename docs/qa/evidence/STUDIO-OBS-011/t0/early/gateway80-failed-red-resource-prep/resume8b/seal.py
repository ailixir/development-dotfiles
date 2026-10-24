"""Source-only finite delta/pin seal. No target methods or old suites execute."""
from pathlib import Path
import ast,difflib,hashlib,json,os,stat

D=Path(__file__).absolute().parent;OLD=D.parent/'resume8'
R=D.parents[7]
T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def put(name,value):
 with (D/name).open('x') as out:out.write(json.dumps(value,indent=2,sort_keys=True)+'\n')
def pin(path):
 raw=path.read_bytes();return dict(path=str(path.relative_to(R)),sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(path.stat().st_mode))
def node(raw,name):
 body=ast.parse(raw).body
 for part in name.split('.'):
  item=next(n for n in body if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name==part)
  body=getattr(item,'body',[])
 return ast.dump(item,include_attributes=False)
raw=(OLD/'manifest.json').read_bytes()
assert sha(raw)=='3fe65bc487f8badf8329ff44040b11d1634e93145142eb3b5bd72d782a82190b'
parent=json.loads(raw);rows={r['path']:r for r in parent['files']}
names=('failed_gateway.py','custody.py','protocol.py','entry.py','contract.json','guard-failed-red.bash','factory.py','installer.py','install-cli.py','control-author.py','control-author-cli.py','control-author-loader.bash','operator-completion.js','install-loader.bash','binding-functions.bash','bind-command.template.bash','binding-wrapper.bash','buffer-bootstrap-inline.py','buffer-verifier-inline.py','install-loader.bash.first-read-prefix.bash','binding-functions.bash.first-read-prefix.bash','control-author-loader.bash.first-read-prefix.bash','caller-bindings.json','trace-bearing-composition.json')
bindings=[];diff=[]
special={'caller-bindings.json','trace-bearing-composition.json','install-loader.bash.first-read-prefix.bash','control-author-loader.bash.first-read-prefix.bash','binding-functions.bash.first-read-prefix.bash'}
for name in names:
 old=(OLD/name).read_bytes();new=(D/name).read_bytes()
 assert sha(old)==rows[name]['sha256'] and len(old)==rows[name]['bytes']
 expected=old.replace(b'gateway80-failed-red-resource-prep/resume8',b'gateway80-failed-red-resource-prep/resume8b').replace(b'gateway80-failed-red-resource-code08-exact-review',b'gateway80-failed-red-resource-code08b-exact-review')
 if name=='failed_gateway.py':expected=expected.replace(b'        if str(path) in self.external_inputs:return self.bound(path,cap=134217728)',b'        path=self.s.path(path)\n        if str(path) in self.external_inputs:return self.bound(path,cap=134217728)')
 if name not in special:assert new==expected,name
 bindings.append(dict(path=name,oldSha256=sha(old),currentSha256=sha(new),rawUnchanged=old==new,onlyApprovedNormalizationAndBindings=name not in special))
 diff.extend(difflib.unified_diff(old.decode().splitlines(True),new.decode().splitlines(True),fromfile='resume8/'+name,tofile='resume8b/'+name))
with (D/'source-delta.patch').open('x') as out:out.writelines(diff)
k=json.loads((D/'contract.json').read_bytes());oldk=json.loads((OLD/'contract.json').read_bytes())
assert k==oldk and (D/'contract.json').read_bytes()==(OLD/'contract.json').read_bytes()
assert len(k['externalInputModes'])==29 and sum(v==0o600 for v in k['externalInputModes'].values())==1 and sum(v==0o644 for v in k['externalInputModes'].values())==28
assert set(k['externalInputModes'])==set(k['externalSourcePins'])
components=[]
for name,component in [('failed_gateway.py','System'),('failed_gateway.py','Unit.bound'),('failed_gateway.py','Unit.operate'),('failed_gateway.py','Unit.close'),('failed_gateway.py','Unit.require_setup'),('failed_gateway.py','run'),('protocol.py','external_input_specs'),('protocol.py','actor_union'),('protocol.py','GateQualification'),('protocol.py','FailureSink'),('installer.py','audit_ancestry')]:
 a=node((OLD/name).read_bytes(),component);b=node((D/name).read_bytes(),component)
 assert a==b,component
 components.append(dict(path=name,component=component,ASTUnchanged=True,sha256=sha(a.encode())))
callers=json.loads((D/'caller-bindings.json').read_bytes())
for row in callers['currentCallerSources']:
 raw=(D/row['path']).read_bytes();assert row['sha256']==sha(raw) and row['bytes']==len(raw) and row['firstReadCap']==len(raw)+1
assert callers['controlAuthorCliSha256']==sha((D/'control-author-cli.py').read_bytes())
assert callers['operatorHelperSha256']==sha((D/'operator-completion.js').read_bytes())
trace=json.loads((D/'trace-bearing-composition.json').read_bytes())
for row in trace['payloads']:
 payload=Path(row['payloadPath']);assert payload.parent==D
 raw=payload.read_bytes();assert row['payloadSha256']==sha(raw) and row['payloadBytes']==len(raw)
 assert row['staged807Argv'][-2:]==[sha(raw),str(len(raw))]
 prefix=(D/row['firstReadPrefix']).read_text()
 assert '-n '+str(len(raw)+1)+' ' in prefix and '== '+str(len(raw))+' ]]' in prefix and str(payload) in prefix
 assert '# STOP HERE:' in prefix and 'builtin eval' not in prefix
result=json.loads((D/'dispatcher-results.json').read_bytes())
assert result['failure'] is None and result['passed']==45 and len(result['scenarios'])==4 and result['realBoundaryCalls']==[]
for name,h in result['sourceHashes'].items():assert sha((D/name).read_bytes())==h
adoption=T/'resume2-gateway-failed-resource-source08-all-findings-root-adoption.json'
assert sha(adoption.read_bytes())=='1e70ebf9a8a07eea2107d74783e0e0be8150183aa356414673b1a25705161706'
conditions=[adoption,OLD/'phase-a-impact.json',OLD/'phase-b-authorization-bindings.json']
proof=[OLD/'manifest.json',OLD/'final-bindings.json',OLD/'critical-attempt02.json',OLD/'critical-attempt02-tool-status.json',OLD/'critical_check.py',T/'qa/gateway80-failed-red-resource-code08-exact-review/critical-results.json',T/'qa/gateway80-failed-red-resource-code08-exact-review/review-record.json']
put('unchanged-proof-references.json',dict(kind='SOURCE08B_FULL_CONDITIONS_AND_COMPONENT_PROOF_REUSE',completeConditionCarriers=[pin(p) for p in conditions],allFullCurrentAndInheritedConditionsRetained=True,noAuthorityTransfer=True,source08RemainsImmutableHold=True,source08Fixed41SevenCasesReusedOnly=True,oldSuitesReplayed=False,proofReferences=[pin(p) for p in proof],reusedScope='Unchanged mechanisms/components only; not full Source08b execution or actual resource qualification',allActualGatesOwed=True))
put('static-bindings.json',dict(kind='SOURCE08B_FINITE_SOURCE_DELTA_AND_BINDING',sourceBindings=bindings,unchangedComponents=components,rawContractUnchanged=True,registry29Unchanged=True,private600=1,public644=28,externalHashesUnchanged=True,allLimitsAndPriorNamespacesUnchanged=True,sourceGeneration=8,prospectiveN04FR05Unchanged=True,currentSourceAndSiblingReviewPathsOnly=True,callerRawPinsAndCountsChecked=True,testedSourceHashesMatch=True,onlySemanticChange='Unit.retained_source_read self.s.path before membership; same normalized object both routes',actualTargetActions=0))
files=[]
for path in sorted(D.iterdir()):
 if path.name in ('manifest.json','SHA256SUMS'):continue
 assert path.is_file() and not path.is_symlink()
 p=pin(path);p['path']=path.name;assert p['mode']==0o644;files.append(p)
put('manifest.json',dict(kind='GATEWAY_FAILED_RESOURCE_SOURCE08_REVISION_B_SOURCE_ONLY',status='SEALED_FOR_EXACT_INDEPENDENT_REVIEW_ALL_ACTUAL_AUTHORITY_HOLD',finding='FR08-REGISTERED-READER-PATH-ALIAS-BYPASS',sourceGeneration=8,parentManifest=pin(OLD/'manifest.json'),allInheritedConditionsRetained=True,externalInputPolicyEntries=29,private600=1,public644=28,newDispatcherAssertions=45,newDispatcherCompositions=1,inherited41SevenCasesReusedOnly=True,actualTargetActions=0,actualAuthority=False,credit=False,files=files))
manifest=(D/'manifest.json').read_bytes()
with (D/'SHA256SUMS').open('x') as out:
 for row in files:out.write(row['sha256']+'  '+row['path']+'\n')
 out.write(sha(manifest)+'  manifest.json\n')
print(json.dumps(dict(pid=os.getpid(),parentPid=os.getppid(),ownFutureStatus=None,manifestSha256=sha(manifest),manifestBytes=len(manifest),payloads=len(files),payloadBytes=sum(r['bytes'] for r in files),checksumRows=len(files)+1,checksumsSha256=sha((D/'SHA256SUMS').read_bytes()),sourceSha256=sha((D/'failed_gateway.py').read_bytes()),dispatcherResultsSha256=sha((D/'dispatcher-results.json').read_bytes()),actualTargetActions=0)))
