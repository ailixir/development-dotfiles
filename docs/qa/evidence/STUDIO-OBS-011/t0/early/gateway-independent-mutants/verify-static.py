from pathlib import Path
import hashlib,json,re,stat
O=Path(__file__).resolve().parent;ROOT=Path.cwd();D=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway-chart-draft'
def sha(b):return hashlib.sha256(b).hexdigest()
def load(p):return json.loads(p.read_text())
def apply(text,patch):
 lines=text.splitlines(True);delta=patch.splitlines(True);out=[];cursor=0;i=2
 assert delta[0].startswith('--- a/') and delta[1].startswith('+++ b/')
 while i<len(delta):
  h=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n',delta[i]);assert h,delta[i]
  start=int(h[1])-1;assert start>=cursor;out.extend(lines[cursor:start]);cursor=start;i+=1;old=new=0
  while i<len(delta) and not delta[i].startswith('@@ '):
   x=delta[i];assert x[0] in ' +-'
   if x[0] in ' -':assert cursor<len(lines) and lines[cursor]==x[1:];cursor+=1;old+=1
   if x[0] in ' +':out.append(x[1:]);new+=1
   i+=1
  assert old==int(h[2] or '1') and new==int(h[4] or '1')
 out.extend(lines[cursor:]);return ''.join(out)
plan=load(O/'mutations.json');base=(D/'repo/helm-chart/put-checks/templates/_helpers.tpl').read_text()
assert sha(base.encode())==plan['acceptedHelperSha256']
assert sha((D/'gateway-chart-draft.patch').read_bytes())==plan['originalDraftPatchSha256']=='30080476f4b6fdf3a7c1ec3dd7ad06ef050ff6342f5cca6a73000110bff68b0d'
assert sha((D/'manifest.json').read_bytes())==plan['originalDraftManifestSha256']=='2fb7008ce20c4a5de47c17b790daa0bfb66e25a00452351b4b08ed6a944ea516'
start=base.index('{{- define "put-checks.springConfig.validateProperties" -}}');section=base[start:]
protected=re.search(r'\$protected := list(.*?)\n-}}',section,re.S)[1]
tokens=re.findall(r'"([a-z0-9]+)"',protected)
current=[x for x in tokens if x.startswith('studiogateway')];legacy=[x for x in tokens if x.startswith('studiocompilegateway')]
assert len(current)==8 and len(legacy)==7
mutantchecks=[]
for unit in plan['mutants']:
 cand=O/unit['sourceCandidate'];candidate=cand.read_text();forward=(O/unit['forwardPatch']).read_text();restore=(O/unit['restorePatch']).read_text()
 assert sha(candidate.encode())==unit['candidateSha256']
 assert sha(forward.encode())==unit['forwardPatchSha256'];assert sha(restore.encode())==unit['restorePatchSha256']
 assert apply(base,forward)==candidate and apply(candidate,restore)==base
 assert candidate==base[:start]+section.replace(unit['exactOldFragment'],unit['exactNewFragment'],1)
 assert candidate[:start]==base[:start]
 assert re.search(r'\$protected := list(.*?)\n-}}',candidate[start:],re.S)[1]==protected
 assert (stat.S_IMODE(cand.stat().st_mode)==0o644)
 for guard in ['(hasPrefix "springprofiles" $normalized)','(eq $normalized "springapplicationjson")','{{- $normalized := regexReplaceAll "[^a-z0-9]" (lower $path) "" -}}']:
  assert candidate.count(guard)==base.count(guard)
 mutantchecks.append({'id':unit['id'],'minimalDiffExact':True,'forwardAndRestoreInMemoryExact':True,'allProtectedTokensUnchanged':True,'sourceProfileComparisonUnchanged':True,'candidateSha256':unit['candidateSha256']})
# A small source-bound prediction model checks witness design, not Helm/Go semantics or runtime proof.
def refused(values,path='',recursive=True,fold=True):
 for key,value in values.items():
  full=(path+'.'+key).lstrip('.');normalized=re.sub('[^a-z0-9]','',full.lower())
  member=normalized if fold else re.sub('[^A-Za-z0-9]','',full)
  if member in tokens or normalized.startswith('springprofiles') or normalized=='springapplicationjson':return full
  if isinstance(value,dict) and recursive:
   found=refused(value,full,recursive,fold)
   if found:return found
 return None
nested={'studio':{'gateway':{'provider':'override'}}};relaxed={'STUDIO_GATEWAY_PROVIDER':'override'}
predictions=[]
for unit in plan['mutants']:
 witness=nested if unit['witnessShape']=='nested' else relaxed
 other=relaxed if unit['unaffectedOtherShape']=='relaxed' else nested
 controls=[('target',witness,True),('canonical-flat',{'studio.gateway.provider':'override'},False),('legacy-flat',{'studio.compile.gateway.provider':'override'},False),('other-shape',other,False),('custom-flat',{'custom.gateway-note':'ordinary test configuration'},True)]
 for component in ['backend','worker']:
  for name,values,mutAccept in controls:
   for state in ['fixed','mutant']:
    actual=refused(values,recursive=not(state=='mutant' and unit['id']=='M-RECURSION'),fold=not(state=='mutant' and unit['id']=='M-NORMALIZED-COMPARISON')) is None
    expected=name=='custom-flat' or (state=='mutant' and mutAccept)
    assert actual==expected,(unit['id'],component,name,state)
    predictions.append({'unit':unit['id'],'component':component,'input':name,'state':state,'predictedAccept':actual,'classification':'STATIC_MODEL_ONLY_NATIVE_UNEXECUTED'})
 assert refused({'SPRING_PROFILES_ACTIVE':'x'},recursive=unit['id']!='M-RECURSION',fold=unit['id']!='M-NORMALIZED-COMPARISON')=='SPRING_PROFILES_ACTIVE'
assert len(predictions)==40
bound=load(O/'chart-bindings.json');assert len(bound['files'])==22
for row in bound['files']:
 p=O/'private-repo/helm-chart/put-checks'/row['path'];actual=ROOT/'helm-chart/put-checks'/row['path']
 assert sha(p.read_bytes())==row['fixedSha256'];assert sha(actual.read_bytes())==row['sourceSha256']
 assert format(stat.S_IMODE(p.stat().st_mode),'04o')==row['mode']
for row in bound['unchangedRunnerCopies']:
 assert sha((ROOT/row['path']).read_bytes())==row['sha256']==sha((O/'private-repo'/row['path']).read_bytes())
case=load(O/'original-80-case-map.json');assert len(case['ids'])==len(set(case['ids']))==80
assert sha((D/'repo/studio-runner/test/deployment/integrations.test.ts').read_bytes())==case['candidateTestSha256']=='38c101be9a0d466d12ac7fc6c08b4614b4e918e189feabce7059ac6ca7d29907'
original=load(D/'manifest.json')
for row in original['files']:
 assert sha((ROOT/row['path']).read_bytes())==row['originalSha256']
 assert sha((D/'repo'/row['path']).read_bytes())==row['draftSha256']
ts=(O/'private-repo/studio-runner/test/deployment/gateway-independent-mutants.test.ts').read_text()
assert ts.count("  it('")==2
assert "toHaveLength(20)" in ts and "toMatchObject(control.properties)" in ts
assert 'describe.skip' not in ts and 'it.skip' not in ts and 'skipIf' not in ts
assert "cpSync(CHART_DIR, fixed" in ts and "cpSync(CHART_DIR, mutant" in ts
assert 'writeFileSync(join(CHART_DIR' not in ts and 'rmSync(CHART_DIR' not in ts
assert 'AggregateError(errors' in ts and 'restored && parentUnchanged' in ts
result={'status':'STATIC_CHECKS_PASSED_NATIVE_UNEXECUTED','mutants':mutantchecks,'predictions':predictions,'chartFilesBound':22,'original80InventoryUnchanged':True,'scratchCasesPrepared':2,'expectedActualRenderOutcomes':40,'originalDraftAndActualTargetsUnchanged':True,'nativeExecutionCount':0,'noLifecycleOrSourceApproval':True}
(O/'static-checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['mutants','predictions']}))
