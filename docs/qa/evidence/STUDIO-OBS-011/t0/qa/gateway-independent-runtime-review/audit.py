"""Independent actual gateway artifact/native-frame review. No Node/Helm/cleanup execution.
Bounded structural YAML reader covers selected Deployment mounts and ConfigMap/plain-map payloads.
Whole-document YAML parsing was also performed by the bound actual runtime harness.
"""
from pathlib import Path
from collections import Counter
import hashlib,json,re,stat,os
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';D=T/'runtime/obs009-gateway-independent-20261019-0622-corrected';A=D/'complete-workspace-archive';E=A/'render-evidence-exit2';P=T/'early/gateway-independent-mutants/resume2';O=T/'qa/gateway-independent-runtime-review'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();hs=lambda v:hashlib.sha256(v.encode() if isinstance(v,str) else v).hexdigest();compact=lambda v:json.dumps(v,separators=(',',':'),ensure_ascii=False)
context=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gateway-independent-runtime-review-context.txt';pins=re.findall(r'^(docs/[^\n]+) SHA256 ([a-f0-9]{64})$',context.read_text(),re.M)
for path,digest in pins:assert h(R/path)==digest,path
auth=json.loads((D/'root-authorization.json').read_text());release=json.loads((D/'root-command-release.json').read_text());terminal=json.loads((D/'root-terminal-archive.json').read_text());actual=json.loads((D/'actual-command.json').read_text());identity=json.loads((D/'wrapper-identity.json').read_text());chart=json.loads((P/'chart-bindings.json').read_text());mutations=json.loads((P/'mutations.json').read_text());manifest=json.loads((P/'manifest.json').read_text())
assert release['authorizationSha256']==h(D/'root-authorization.json') and release['runPrivateSha256']==h(D/'run_private.py')=='ff8b82850bdda7bc066c5f7d8ab202d3c1cfcb155d31711168cfb0ec6feff054'
assert release['independentReviewSha256']==h(T/'qa/gateway-runtime-mask-corrected-review/review.md')=='9f0b704d30700f1bf985c8b8f7325b2c9971b10d68c2a34ad4031d58f5fbf602'
assert h(P/'manifest.json')==auth['manifestSha256']=='06107221f5863414867f79831e69758253252ff1d991663db460200882a80d54'
for row in manifest['artifacts']:assert h(P/row['path'])==row['sha256'] and (P/row['path']).stat().st_size==row['bytes'] and f'{stat.S_IMODE((P/row["path"]).stat().st_mode):04o}'==row['mode']
for row in chart['files']:assert h(R/chart['sourceChart']/row['path'])==row['sourceSha256'] and f'{stat.S_IMODE((R/chart["sourceChart"]/row["path"]).stat().st_mode):04o}'==row['mode']
assert terminal['wrapperExit']==actual['exit']==0 and terminal['wrapperPid']==identity['pid']==62354 and terminal['endPsExit']==1 and terminal['endPsOutput']==''
assert identity['kernelObservation'].startswith('62354 62334 Mon Oct 19 02:26:34 2026') and ' '.join(identity['argv']) in identity['kernelObservation']
assert identity['rootWrapperSha256']==h(D/'execute_once.py') and identity['innerRunnerSha256']==h(D/'run_private.py')
assert identity['argv'][1].endswith('/execute-008/with-gradle-lock.py')
assert (D/'wrapper.stdout').read_text().splitlines()==['[gradle-lock] acquired after 0.0s','[gradle-lock] released, exit 0']
assert (D/'wrapper.stderr').stat().st_size==(D/'vitest.stderr').stat().st_size==0
assert actual['argv']==[auth['node'],*auth['runCommand'][1:]] and actual['cwd']==auth['scratch']+'/studio-runner' and actual['automaticRetry'] is False
versions=json.loads((D/'versions.json').read_text());assert versions['node']=='v24.20.0' and versions['helm']=='v4.2.0+g0646808'
for key in ['node','helm']:assert h(Path(auth[key]))==auth[key+'Sha256']
v=json.loads((A/'vitest.json').read_text());assert (v['numTotalTests'],v['numPassedTests'],v['numFailedTests'],v['numPendingTests'],v['numTodoTests'],v['success'])==(2,2,0,0,0,True)
assert len(v['testResults'])==1 and len(v['testResults'][0]['assertionResults'])==2
assert [x['title'] for x in v['testResults'][0]['assertionResults']]==['M-RECURSION: nested refusal discriminates only recursive descent','M-NORMALIZED-COMPARISON: relaxed refusal discriminates only protected-name case normalization']
assert all(x['status']=='passed' and x['failureMessages']==[] for x in v['testResults'][0]['assertionResults'])
# YAML reader intentionally rejects unsupported selected shapes instead of fuzzy searching for overrides.
def meaningful(lines):return [s for s in lines if s.strip() and not s.lstrip().startswith('#')]
def indent(s):return len(s)-len(s.lstrip(' '))
def scalar(s):
 s=s.strip()
 if s.startswith('"'):return json.loads(s)
 if s=='true':return True
 if s=='false':return False
 if s in ['null','~']:return None
 if s=='{}':return {}
 if re.fullmatch(r'-?(?:0|[1-9][0-9]*)',s):return int(s)
 assert not s.startswith(('!','&','*','[','{',"'")) and ': ' not in s and ' #' not in s and '\t' not in s
 return s

def mapping(lines):
 lines=meaningful(lines)
 if not lines:return {}
 base=indent(lines[0]);out={};i=0
 while i<len(lines):
  line=lines[i];assert indent(line)==base and not line.lstrip().startswith('- ')
  match=re.fullmatch(r'([^:]+):(?: (.*))?',line[base:]);assert match,line
  key=match[1];value=match[2];assert key not in out and key.strip()==key
  j=i+1
  while j<len(lines) and indent(lines[j])>base:j+=1
  child=lines[i+1:j]
  if value=='|':
   assert child;blockindent=min(indent(x) for x in child);out[key]='\n'.join(x[blockindent:] for x in child)+'\n'
  elif value is None:assert child;out[key]=mapping(child)
  else:assert not child;out[key]=scalar(value)
  i=j
 return out

def child(lines,key):
 lines=meaningful(lines);base=min(map(indent,lines));found=[]
 for i,line in enumerate(lines):
  if indent(line)==base and line[base:]==key+':':
   j=i+1
   while j<len(lines) and indent(lines[j])>base:j+=1
   found.append(lines[i+1:j])
 assert len(found)==1,(key,len(found));return found[0]

def named_entry(lines,name):
 lines=meaningful(lines);base=min(map(indent,lines));groups=[];i=0
 while i<len(lines):
  assert indent(lines[i])==base and lines[i][base:].startswith('- ')
  j=i+1
  while j<len(lines) and indent(lines[j])>base:j+=1
  first=' '*(base+2)+lines[i][base+2:];entry=[first,*lines[i+1:j]]
  if first.strip()=='name: '+name:groups.append(entry)
  i=j
 assert len(groups)==1,(name,len(groups));return groups[0]

def mounted(raw,role):
 docs=[meaningful(x.splitlines()) for x in re.split(r'^---\s*$',raw,flags=re.M)];docs=[x for x in docs if x]
 deployments=[];configs=[]
 for doc in docs:
  kinds=[s for s in doc if indent(s)==0 and s.startswith('kind: ')];assert len(kinds)==1
  if kinds[0]=='kind: ConfigMap':configs.append(mapping(doc))
  if kinds[0]=='kind: Deployment':
   metadata=mapping(child(doc,'metadata'))
   if metadata['name'].endswith('-'+role):deployments.append(doc)
 assert len(deployments)==1
 pod=child(child(child(deployments[0],'spec'),'template'),'spec')
 volume=mapping(named_entry(child(pod,'volumes'),'spring-config'));config_name=volume['configMap']['name']
 container=named_entry(child(pod,'containers'),role)
 mount=mapping(named_entry(child(container,'volumeMounts'),'spring-config'));assert mount['readOnly'] is True
 env=mapping(named_entry(child(container,'env'),'SPRING_CONFIG_ADDITIONAL_LOCATION'));assert env['value']=='file:'+mount['mountPath']+'/application.yaml'
 selected=[x for x in configs if x['metadata']['name']==config_name];assert len(selected)==1
 props=mapping(selected[0]['data']['application.yaml'].splitlines())
 return props,dict(deploymentRole=role,configMap=config_name,mountPath=mount['mountPath'],readOnly=True)

def contains(actual,wanted):
 assert isinstance(actual,dict)
 for k,v in wanted.items():
  assert k in actual
  if isinstance(v,dict):contains(actual[k],v)
  else:assert actual[k]==v

def inventory(directory):
 files={};links={};dirs={}
 def walk(path):
  for name in sorted(os.listdir(path)):
   p=path/name;st=p.lstat();rel=str(p.relative_to(directory))
   if stat.S_ISLNK(st.st_mode):links[rel]=os.readlink(p)
   elif stat.S_ISDIR(st.st_mode):dirs[rel]=f'{stat.S_IMODE(st.st_mode):04o}';walk(p)
   else:assert stat.S_ISREG(st.st_mode);files[rel]={'sha256':h(p),'mode':f'{stat.S_IMODE(st.st_mode):04o}','bytes':st.st_size}
 walk(directory);return files,links,dirs
fixed={x['path']:x for x in chart['files']};assert len(fixed)==22
pin=':'.join(f'{(n*7+11)%256:02X}' for n in range(32));counts=Counter();results=[];receipts={}
for unit in mutations['mutants']:
 ident=unit['id'];receipt=json.loads((E/(ident+'-receipt.json')).read_text());receipts[ident]=receipt
 assert receipt['status']=='SCRATCH_ASSERTIONS_PASSED_PENDING_INDEPENDENT_QA' and receipt['restored'] is receipt['parentUnchanged'] is receipt['cleaned'] is True
 assert receipt['errorCount']==0 and receipt['nativeGateCredit'] is False and receipt['original80CaseInventoryChange']==0 and len(receipt['renders'])==20
 assert receipt['fixedSha256']==mutations['acceptedHelperSha256'] and receipt['mutantSha256']==unit['candidateSha256']==h(P/unit['sourceCandidate'])
 fixed_helper=(P/'private-repo/helm-chart/put-checks/templates/_helpers.tpl').read_text();assert fixed_helper.count(unit['exactOldFragment'])==1
 assert fixed_helper.replace(unit['exactOldFragment'],unit['exactNewFragment'],1)==(P/unit['sourceCandidate']).read_text()
 original=receipt['originalChart'];assert len(original)==22 and len({x['path'] for x in original})==22 and {x['path'] for x in original}==set(fixed)
 for row in original:assert row=={'path':row['path'],'sha256':fixed[row['path']]['fixedSha256'],'mode':'0644'}
 mutant=[dict(x,sha256=unit['candidateSha256']) if x['path']=='templates/_helpers.tpl' else dict(x) for x in original];hashes={'fixed':hs(compact(original)),'mutant':hs(compact(mutant))}
 def shape(name):return ({'studio':{'gateway':{'provider':'override'}}},'studio.gateway.provider') if name=='nested' else ({'STUDIO_GATEWAY_PROVIDER':'override'},'STUDIO_GATEWAY_PROVIDER')
 controls=[('target',*shape(unit['witnessShape']),True),('canonical-flat',{'studio.gateway.provider':'override'},'studio.gateway.provider',False),('legacy-flat',{'studio.compile.gateway.provider':'override'},'studio.compile.gateway.provider',False),('other-shape',*shape(unit['unaffectedOtherShape']),False),('custom-flat',{'custom.gateway-note':'ordinary test configuration'},'custom.gateway-note',True)]
 expect=[]
 for component in ['backend','worker']:
  for kind,properties,path,mutant_accepts in controls:
   for state in ['fixed','mutant']:expect.append((component,kind,properties,path,state,kind=='custom-flat' or state=='mutant' and mutant_accepts))
 for sequence,(entry,exp) in enumerate(zip(receipt['renders'],expect),1):
  component,kind,properties,path,state,accept=exp;assert (entry['sequence'],entry['component'],entry['kind'],entry['state'],entry['expectedAccepts'],entry['observedOk'])==(sequence,component,kind,state,accept,accept)
  argv=['helm','template','release-name',receipt['ownedDirectory']+'/'+state,'--set','studioRunner.enabled=true','--set','studioRunner.tls.controllerCertificateFingerprint256='+pin,'--set-json',component+'.configOverrides='+compact(properties)]
  assert entry['argv']==argv and entry['expectedNative']=={'argvSha256':hs(compact(argv)),'cwd':actual['cwd'],'chartSha256':hashes[state]}
  assert entry['observerFailureCount']==0 and entry['builtinRestored'] is True and len(entry['nativeFrames'])==1
  frame=entry['nativeFrames'][0]
  assert frame['executable']=='helm' and frame['argv']==argv and frame['argvSha256']==hs(compact(argv)) and frame['cwd']==actual['cwd']
  assert frame['optionsMatched'] is frame['observerComplete'] is frame['signalKnown'] is True and frame['signal'] is None and frame['setupErrorCode'] is None and frame['spawnErrorPresent'] is False
  assert frame['chartBeforeSha256']==frame['chartAfterSha256']==hashes[state]
  assert type(frame['nativeExit']) is int and frame['nativeExit']==(0 if accept else 1) and frame['nativeThrew'] is (not accept)
  stem=f'{ident}-{sequence:02d}-{component}-{kind}-{state}';raw=(E/(stem+'.yaml')).read_text();error=(E/(stem+'.stderr.txt')).read_text()
  assert hs(raw)==entry['rawSha256']==frame['stdoutSha256'] and frame['stdoutKnown'] is True and hs(error)==entry['errorSha256']
  binding=None
  if accept:
   assert frame['exitSource']=='EXECFILESYNC_RETURN' and error=='' and frame['stderrKnown'] is frame['messageKnown'] is False and frame['stderrSha256'] is frame['messageSha256'] is frame['mergedErrorSha256'] is None
   actual_props,binding=mounted(raw,'api' if component=='backend' else 'worker');contains(actual_props,properties);counts['nativeAccepts']+=1
  else:
   intended='configOverrides property '+path+' is managed by the chart'
   assert frame['exitSource']=='THROWN_NATIVE_STATUS' and frame['stderrKnown'] is frame['messageKnown'] is True and frame['mergedErrorSha256']==hs(error) and raw=='' and intended in error and entry['namedRefusalObserved'] is True
   splits=[i for i,c in enumerate(error) if c=='\n' and hs(error[:i])==frame['stderrSha256'] and hs(error[i+1:])==frame['messageSha256']];assert len(splits)==1
   i=splits[0];assert intended in error[:i] and intended in error[i+1:];counts['nativeRefusals']+=1
  counts[ident+':'+kind+':'+state+':'+str(accept)]+=1
  results.append(dict(unit=ident,sequence=sequence,component=component,kind=kind,state=state,actualNativeExit=frame['nativeExit'],accepts=accept,nativeFrameCount=1,observerRestored=True,inputBeforeAfterExact=True,rawOutputHash=hs(raw),harnessErrorHash=hs(error),mountedConfiguration=binding))
 restored=E/receipt['restoredChartArchive'];files,links,dirs=inventory(restored);assert not links and len(files)==22
 for path,fact in files.items():assert fact['sha256']==fixed[path]['fixedSha256'] and fact['mode']=='0644'
 assert not Path(receipt['ownedDirectory']).exists()
# Complete retained workspace matches archive, with only its known dependency link.
workspace=Path(auth['scratch']);st=workspace.lstat();assert stat.S_ISDIR(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==448
wf,wl,wd=inventory(workspace);af,al,ad=inventory(A);assert wf==af and wl==al and wd==ad and {k:v['sha256'] for k,v in af.items()}==terminal['archiveFiles']
assert wl=={'studio-runner/node_modules':auth['dependencies']}
for row in chart['files']:assert h(A/'helm-chart/put-checks'/row['path'])==row['fixedSha256'] and stat.S_IMODE((A/'helm-chart/put-checks'/row['path']).stat().st_mode)==420
# Old failure and its separate authorized scratch disposal remain honest.
oldD=T/'runtime/obs009-gateway-independent-20261019-0620-once';oldcleanup=json.loads((oldD/'root-failed-owned-scratch-cleanup.json').read_text());prior=json.loads((T/'qa/gateway-runtime-mask-review/audit.json').read_text())
assert oldcleanup['independentReviewSha256']==h(T/'qa/gateway-runtime-mask-review/review.md') and oldcleanup['rawSuiteExit']==1 and oldcleanup['templateRenders']==0 and oldcleanup['originalFailedOracleFlagsNotRewritten'] is True and oldcleanup['repositoryDependencyTargetRetained'] is True
assert {t['path'] for t in oldcleanup['targets']}=={t['path'] for t in prior['cleanupCandidates']}
for target in oldcleanup['targets']:
 prior_target=next(x for x in prior['cleanupCandidates'] if x['path']==target['path']);assert (target['dev'],target['ino'])==(prior_target['dev'],prior_target['ino'])
 assert target['exactArchiveRechecked'] is target['removed'] is target['absentAfter'] is True and not Path(target['path']).exists()
for unit in receipts:
 old=json.loads((oldD/'complete-workspace-archive/render-evidence-exit2'/(unit+'-receipt.json')).read_text());assert old['status']=='FAILED_OR_INCOMPLETE' and old['renders']==[] and old['restored'] is old['parentUnchanged'] is old['cleaned'] is False
old_actual=json.loads((oldD/'actual-command.json').read_text());old_vitest=json.loads((oldD/'complete-workspace-archive/vitest.json').read_text())
assert old_actual['exit']==1 and old_vitest['numTotalTests']==old_vitest['numFailedTests']==2 and old_vitest['numPassedTests']==0 and old_vitest['success'] is False
assert h(oldD/'root-failure-classification.json')==prior['oldFailureClassificationSha256']
assert oldcleanup['durableOriginalEvidencePreserved'] is True and oldcleanup['currentCorrectedUnitNotTouched'] is True
for file in ['actual-command.json','vitest.stdout','vitest.stderr','versions.json','wrapper-identity.json']:
 assert stat.S_IMODE((D/file).stat().st_mode)==384
assert stat.S_IMODE(Path(actual['evidenceDirectory']).stat().st_mode)==448
assert counts['nativeAccepts']==12 and counts['nativeRefusals']==28 and len(results)==40
out=dict(scope='ACTUAL_CORRECTED_TWO_CASE_40_TEMPLATE_COUNTERFACTUALS_ONLY',dispatchPinsVerified=len(pins),suiteTotal=2,suitePassed=2,suiteFailed=0,suiteSkipped=0,actualTemplateFrames=40,actualNativeAccepts=12,actualNamedNativeRefusals=28,allNativeFramesOnePerRender=True,allBuiltinRestorations=True,allObserverFailuresZero=True,counterfactualCounts=dict(counts),renders=results,restoredChartArchives=2,restoredFilesPerArchive=22,restoredModes='0644',ownCaseScratchDirectoriesAbsent=True,repository22ChartUnchanged=True,package63ArtifactsUnchanged=True,versions=versions,wrapperPid=62354,wrapperKernelStart='Mon Oct 19 02:26:34 2026',wrapperTerminalExit=0,recordedWrapperPostwaitAbsent=True,rawSuiteExit=0,authorizationSha256=h(D/'root-authorization.json'),releaseSha256=h(D/'root-command-release.json'),actualCommandSha256=h(D/'actual-command.json'),terminalArchiveSha256=h(D/'root-terminal-archive.json'),unitReceiptHashes={k:h(E/(k+'-receipt.json')) for k in receipts},workspaceArchiveFiles=len(wf),workspaceCleanupCandidate=dict(path=str(workspace),dev=st.st_dev,ino=st.st_ino,uid=st.st_uid,gid=st.st_gid,mode='0700',archive=str(A.relative_to(R)),files=wf,directories=wd,symlinks=wl,cleanupRequiresFreshExactIdentityAndInventoryRecheck=True,dependencyTargetMustRemain=True),oldFailurePreserved=True,oldThreeRootCleanupRecordVerified=True,oldCleanupReceiptSha256=h(oldD/'root-failed-owned-scratch-cleanup.json'),parentEvidenceFileModes='0600',ownedEvidenceDirectoryMode='0700',reviewNativeHelmNodeCalls=0,cleanupPerformed=False,productSourceApplied=False,original80CaseOrFullTierOrLaneOrC8LifecycleCredit=False,boundedYamlReaderScope='Selected Deployment mounts/references, ConfigMaps and embedded plain mappings; full YAML also parsed by bound actual runtime harness')
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k not in ['renders','counterfactualCounts','workspaceCleanupCandidate']}))
