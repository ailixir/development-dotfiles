from pathlib import Path
import os,sys,json,hashlib,stat,subprocess,runpy,datetime,math,re,time,shutil

# One compiler-free consumer of separately root-bound, byte-exact D2 scripts.
# Preparation does not execute this file. No binder, source mutation or retry is implemented.
R=Path(__file__).resolve().parents[6]
P=Path(__file__).resolve().parent
B=P.parent
O=B/'final-d2-execution08'
PACKET=B/'linux-image-smoke-final-bound06'
E=R/'docs/qa/evidence/STUDIO-OBS-011/execution'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def write(name,value):(O/name).write_text(json.dumps(value,indent=2)+chr(10))
def checked_ref(ref):
 p=Path(ref['path']);p=p if p.is_absolute() else R/p
 assert p.is_file() and not p.is_symlink() and sha(p)==ref['sha256']
 if 'bytes' in ref:assert p.stat().st_size==ref['bytes']
 return p
assert len(sys.argv)==3
admissionPath=Path(sys.argv[1]);admissionSha=sys.argv[2]
assert admissionPath.is_absolute() and len(admissionSha)==64 and sha(admissionPath)==admissionSha
admission=json.loads(admissionPath.read_text())
assert admission['kind']=='ROOT_EXACT_D2_RUNTIME_ADMISSION' and admission['authorized'] is True
assert admission['soleHeavyLaneOwner']=='gateway_implementation' and admission['sourceWriterAllowed'] is False and admission['runtimeInvocationCount']==1
assert admission['rootRuntimeGoSeparateFromBinding'] is True
assert sha(P/'manifest.json')==admission['preparationManifestSha256']
for row in json.loads((P/'manifest.json').read_text())['artifacts']:checked_ref(row)
binding=json.loads((P/'bindings.json').read_text());commands=json.loads((P/'commands.json').read_text())
for ref in binding['acceptedProducerQaSeals']:
 m=checked_ref(ref)
 for row in json.loads(m.read_text())['artifacts']:
  p=Path(row['path']);p=p if p.is_absolute() else (R/p if (R/p).is_file() else m.parent/p)
  assert p.is_file() and sha(p)==row['sha256']
  if 'bytes' in row:assert p.stat().st_size==row['bytes']
for ref in binding['successionProofReferences']+binding['correctedD2SourcePins']:checked_ref(ref)
checked_ref(binding['original33Binding'])
for row in binding['sourceDependencies']:
 p=R/row['path'];assert p.is_file() and not p.is_symlink() and sha(p)==row['sha256'] and p.stat().st_size==row['bytes'] and oct(stat.S_IMODE(p.stat().st_mode))==row['mode']
# Exact one-expansion source successor and independently accepted dynamic QA.
correction=binding['sourceCorrection'];assert admission['sourceCorrectionManifestSha256']==correction['ownerManifest']['sha256']=='1b6ac6c046dd173aede93a492491533b4d9156996083698f832ff54ee9a5c315'
owner=checked_ref(correction['ownerManifest'])
for row in json.loads(owner.read_text())['artifacts']:checked_ref(row)
checked_ref(correction['candidate']);checked_ref(correction['closedDiagnostic'])
assert admission['sourceCorrectionQaAccepted'] is True and admission['rootDependencyIncludesWrapperCorrectionAndShell'] is True
sourceQa=admission['sourceCorrectionQa'];checked_ref(sourceQa)
shell=correction['canonicalShell'];assert admission['canonicalShell']==shell
checked_ref(binding['historicalFailed05']['producerManifest']);checked_ref(binding['historicalFailed05']['receipt'])
inspection=binding['inspectionDiagnostic']
inspectionOwner=checked_ref(inspection['ownerManifest'])
assert admission['inspectionDiagnosticOwnerSha256']==inspection['ownerManifest']['sha256']=='f0d41c372cb5558037153267f53e8940b4d5778110a651c9711e9a5a396df973'
for row in json.loads(inspectionOwner.read_text())['artifacts']:checked_ref(row)
checked_ref(inspection['fixture']);schemaPath=checked_ref(inspection['schema'])
assert admission['inspectionDiagnosticFixtureSha256']==inspection['fixture']['sha256']=='b73395f135d5db15fca3a575c43b9c58e6c4a03e6ca8e2f06e3ef3931ce9a95d'
assert admission['inspectionDiagnosticSchemaSha256']==inspection['schema']['sha256']=='9015f9683d7765e4dd207d07a9eaa6f32426de698491256024d2a395d49688bb'
assert admission['inspectionDiagnosticQaAccepted'] is True and admission['rootDependencyIncludesInspectionDiagnostic'] is True
inspectionQa=admission['inspectionDiagnosticQa'];checked_ref(inspectionQa);inspectionSchema=json.loads(schemaPath.read_text())
checked_ref(binding['historicalFailed06']['manifest']);checked_ref(binding['historicalFailed06']['receipt']);checked_ref(binding['historicalFailed06']['hashOnlyAssessment'])
dep=admission['dependencyReview'];checked_ref(dep)
assert dep['sha256'] not in ['855a7ff18815776de5afb3ddcf09293f74cbdcb8ad1bba551f30421bbf2e29e0','c33f3c59eb1b4fe6f2e1c4d6231be693ea5852b65b6c1a6edf51fc98ec4e8273','45765a20380e94009e4c985ba46880f5d4942b14bebe1e2baff6ee797a8c5ec1']
reviewRef=dep['reference'];assert isinstance(reviewRef,str) and reviewRef and not any(s in reviewRef for s in ['PENDING','UNBOUND','<','>'])
factsPath=O/'accepted-final-measured-bindings.json'
assert factsPath.is_file() and not factsPath.is_symlink() and sha(factsPath)==admission['acceptedFactsSha256']
facts=json.loads(factsPath.read_text());values=facts['finalBindings'];assert values==binding['genuineNineFinalBindings']
assert facts['acceptedFinalDependencyReviewReference']==reviewRef
assert facts['sourceCorrectionManifestSha256']==correction['ownerManifest']['sha256'] and facts['sourceCorrectionQa']==sourceQa and facts['sourceCorrectionQaAccepted'] is True and facts['canonicalShell']==shell
assert all(facts['rootDependencyAcceptance'][k]==dep[k] for k in ['path','sha256'])
assert facts['inspectionDiagnosticOwnerSha256']==inspection['ownerManifest']['sha256'] and facts['inspectionDiagnosticFixtureSha256']==inspection['fixture']['sha256'] and facts['inspectionDiagnosticSchemaSha256']==inspection['schema']['sha256'] and facts['inspectionDiagnosticQa']==inspectionQa and facts['inspectionDiagnosticQaAccepted'] is True
assert values['acceptedSourceDigest']==admission['expectedSourceDigest']=='a1f8e1c0eaf02f16834f6c129a2749411ab1bd5462f4daf501dc5182f6ff0ebc'
assert values['acceptedDistDigest']==admission['expectedDistDigest']=='e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1'
ID=values['measuredImmutableImageId'];assert ID==admission['expectedImageId']=='sha256:bd83d49256b5be0d2c8dc60b26ec92bef0bcf063eaa0a49de3d0db1fd154e753'
assert sha(PACKET/'manifest.json')==admission['boundPacketManifestSha256']
for row in json.loads((PACKET/'manifest.json').read_text())['files']:
 p=PACKET/row['path'];assert p.is_file() and not p.is_symlink() and sha(p)==row['sha256']
assert sha(PACKET/'future-smoke.sh')=='ea56c0ef2c45b4107a726b3c26cfd5cb35a96e51d18820da5d28463f6a414455'
assert sha(PACKET/'fixture.mjs')=='b73395f135d5db15fca3a575c43b9c58e6c4a03e6ca8e2f06e3ef3931ce9a95d'
packetBinding=json.loads((PACKET/'bindings.json').read_text())
assert packetBinding['finalBindings']==values and packetBinding['finalDependencySuccessor']['acceptedReviewReference']==reviewRef
assert packetBinding['finalDependencySuccessor']['measuredFactsSha256']==sha(factsPath)
expectedCorrection={'ownerManifestSha256':correction['ownerManifest']['sha256'],'sourceQa':sourceQa,'canonicalShell':shell,'historicalScriptSha256':'2b46b5e901df833ce11f570284516515dac8ca48df0119f6a3c97723fbdbc0ad','candidateScriptSha256':correction['candidate']['sha256']}
assert packetBinding['sourceCorrectionSuccessor']==expectedCorrection
assert json.loads((PACKET/'manifest.json').read_text())['sourceCorrectionSuccessor']==expectedCorrection
assert json.loads((PACKET/'future-command-and-bindings.json').read_text())['sourceCorrectionSuccessor']==expectedCorrection
expectedInspection={'ownerManifestSha256':inspection['ownerManifest']['sha256'],'fixtureSha256':inspection['fixture']['sha256'],'schemaSha256':inspection['schema']['sha256'],'sourceQa':inspectionQa,'historicalFixtureSha256':'4a6c8474c7c609c25b3c40ea3116094eb9e504d5b3da35f66fe730fdf9f89f91','failureOnly':True}
assert packetBinding['inspectionDiagnosticSuccessor']==expectedInspection and json.loads((PACKET/'manifest.json').read_text())['inspectionDiagnosticSuccessor']==expectedInspection and json.loads((PACKET/'future-command-and-bindings.json').read_text())['inspectionDiagnosticSuccessor']==expectedInspection
argv=commands['runtime']['argv'];assert json.loads((PACKET/'future-command-and-bindings.json').read_text())['argv']==argv
label=commands['expectedLabel'];prefix=commands['resourcePrefix'];out=O/'d2-execution01'
assert label==admission['collectorLabel']=='obs011-recovery-20261020-final-linux-d2-smoke04'
assert prefix==admission['resourcePrefix']=='obs011-d2-final-04' and str(out)==admission['outputDirectory']
assert argv==['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py'),label,'/bin/bash',str(PACKET/'future-smoke.sh'),ID,prefix,str(out)]
assert sha(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py')=='edeaa3592eb85b60097c79a7577d2025027b53ebc3eba470c092e9c9cf2a009f'
assert not out.exists() and not (O/'driver-start.json').exists() and not any(E.glob(label+'*'))
initialAllowed={factsPath.name}
if admissionPath.parent==O:initialAllowed.add(admissionPath.name)
assert all(p.is_file() and p.name in initialAllowed for p in O.iterdir())
env=os.environ.copy();env['PATH']=commands['env']['PATHPrefix']+':'+env['PATH'];env['PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD']='1'
resolvedShell=shutil.which('bash',path=env['PATH']);assert resolvedShell is not None and str(Path(resolvedShell).resolve(strict=True))==shell['path']=='/bin/bash'
shellPath=Path(shell['path']);assert shellPath.is_file() and not shellPath.is_symlink() and sha(shellPath)==shell['sha256']=='41e7f937a0d2e7e0bc03884595f54f7a892e468087519de1fc53e177b2503308' and oct(stat.S_IMODE(shellPath.stat().st_mode))==shell['mode']=='0o555'
write('canonical-shell-binding.json',{'canonicalShell':shell,'resolvedBashUnderSameEnvironment':resolvedShell,'pathSha256':hashlib.sha256(env['PATH'].encode()).hexdigest(),'explicitRuntimeArgvShell':'/bin/bash','sourceQa':sourceQa})
meta=json.loads(checked_ref(binding['runtimeInputPins']).read_text())
linksExpected=json.loads(checked_ref(binding['original21Links']).read_text())
expected=json.loads(checked_ref(binding['freshFullInputBaseline']).read_text())
cacheExpected=checked_ref(binding['freshCacheBaseline']);cache=R/'studio-runner/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json'
supplement=json.loads(checked_ref(binding['chartQuotesBaseline']).read_text())
snapshot=runpy.run_path(str(B/'bootstrap-process-tree-pure-proof-execution01/input-snapshot.py'))['snapshot']
def host():
 b=subprocess.run(['/usr/bin/pmset','-g','batt'],capture_output=True,text=True,check=True);l=subprocess.run(['/usr/sbin/ioreg','-r','-k','AppleClamshellState','-d1'],capture_output=True,text=True,check=True)
 s=re.findall(r'"AppleClamshellState"\s*=\s*(Yes|No|true|false)',l.stdout)
 v={'atUtc':now(),'acPower':"'AC Power'" in b.stdout,'lidOpen':bool(s) and set(s)<={'No','false'},'clamshellStates':s,'rawHostBodiesExported':False,'continuousAwakeClaim':False}
 assert v['acPower'] and v['lidOpen'];return v
def image(name):
 args=['docker','image','inspect',ID,'--format','{"Id":{{json .Id}},"Os":{{json .Os}},"Architecture":{{json .Architecture}},"User":{{json .Config.User}},"Cmd":{{json .Config.Cmd}},"Entrypoint":{{json .Config.Entrypoint}}}']
 p=subprocess.run(args,capture_output=True,text=True);write(name+'-image-command.json',{'argv':args,'exit':p.returncode,'stderrSha256':hashlib.sha256(p.stderr.encode()).hexdigest()});assert p.returncode==0
 v=json.loads(p.stdout);write(name+'-image.json',v)
 assert v=={'Id':ID,'Os':'linux','Architecture':'arm64','User':'pwuser','Cmd':['sh','-c','ulimit -c 0 && exec node dist/main.js'],'Entrypoint':None};return v
def guard(name):
 dest=O/(name+'-source.json');p=subprocess.run(['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'),str(dest)],cwd=R,env=env,capture_output=True,text=True)
 (O/(name+'-capture.log')).write_text(p.stdout+p.stderr);assert p.returncode==0
 c=json.loads(dest.read_text());assert c['digest']==values['acceptedSourceDigest'] and len(c['files'])==1814 and c['dist']['digest']==values['acceptedDistDigest'] and len(c['dist']['files'])==238
 current=snapshot(R);write(name+'-full-catalog.json',current);assert current==expected
 assert sha(cache)==sha(cacheExpected);v=json.loads(cache.read_text());assert v['version']=='3.2.7' and type(v['results']) is list and len(v['results'])==len(dict(v['results']))==191
 for k,x in v['results']:assert set(x)=={'duration','failed'} and type(x['failed']) is bool and type(x['duration']) in (int,float) and math.isfinite(x['duration']) and x['duration']>=0
 write(name+'-cache-binding.json',{'sha256':sha(cache),'version':'3.2.7','ordered191KeysAndEveryValueExact':True})
 for row in meta['actualCanonical5Pins']:
  p=R/'studio-runner/node_modules'/row['relativePath'];assert sha(p)==row['sha256'] and oct(stat.S_IMODE(p.stat().st_mode))==row['mode']
 for row in meta['protected']:assert sha(R/row['path'])==row['sha256'] and oct(stat.S_IMODE((R/row['path']).stat().st_mode))==row['mode']
 actual=[]
 for p in sorted((R/'studio-runner/node_modules/.bin').iterdir()):
  s=p.lstat();assert stat.S_ISLNK(s.st_mode);actual.append({'path':str(p.relative_to(R)),'target':os.readlink(p),'mode':oct(stat.S_IMODE(s.st_mode)),'device':s.st_dev,'inode':s.st_ino})
 assert actual==linksExpected
 browser=json.loads(Path(meta['browserRef']['path']).read_text());assert sha(browser['actualExecutablePath'])==meta['browserSha256']
 assert {k:{'present':k in env,'valueSha256':hashlib.sha256(env[k].encode()).hexdigest() if k in env else None} for k in meta['environment']}==meta['environment']
 chart=[]
 for p in sorted((R/'helm-chart/put-checks').rglob('*')):
  s=p.lstat();assert not stat.S_ISLNK(s.st_mode)
  if stat.S_ISDIR(s.st_mode):continue
  assert stat.S_ISREG(s.st_mode);chart.append({'path':str(p.relative_to(R)),'sha256':sha(p),'mode':oct(stat.S_IMODE(s.st_mode))})
 assert chart==supplement['chart22']
 quotes=[]
 for row in supplement['quoted6']:
  p=R/row['path'];assert p.is_file() and not p.is_symlink();quotes.append({'path':row['path'],'sha256':sha(p),'mode':oct(stat.S_IMODE(p.stat().st_mode))})
 assert quotes==supplement['quoted6'];write(name+'-chart-quotes.json',{'chart22':chart,'quoted6':quotes,'exactAcceptedDeployment05Bindings':True})
 for row in binding['sourceDependencies']:
  p=R/row['path'];assert p.is_file() and not p.is_symlink() and sha(p)==row['sha256'] and oct(stat.S_IMODE(p.stat().st_mode))==row['mode']
 assert sha(shellPath)==shell['sha256'] and oct(stat.S_IMODE(shellPath.stat().st_mode))==shell['mode']
 write(name+'-guard.json',{'sourceA1Files':1814,'hostDistE19Files':238,'fullInputsAndCache191AllValuesExact':True,'protected21CliBrowserEnvChart22Quotes6Dependencies33Exact':True,'host':host()})
def exact_resource_absence():
 checks=[]
 for kind,names in [('container',[prefix+'-'+x for x in ['prep','identity','init','noinit','debug','controller']]),('volume',[prefix+'-'+x for x in ['tls','tmp','journal']])]:
  for name in names:
   args=['docker',kind,'inspect',name];p=subprocess.run(args,capture_output=True,text=True)
   absent=p.returncode!=0 and (('no such container' in p.stderr.lower() or 'no such object' in p.stderr.lower()) if kind=='container' else 'no such volume' in p.stderr.lower())
   checks.append({'kind':kind,'name':name,'argv':args,'exit':p.returncode,'authoritativeAbsent':absent,'stderrSha256':hashlib.sha256(p.stderr.encode()).hexdigest()});write('resource-freshness.json',checks);assert absent
 return checks

# Only source-declared closed metadata below may be decoded. IDs/logs stay opaque hashes.
DECLARED={'image-before.txt','image-after.txt','pwuser.txt','noinit.id','noinit.json','debug.id','debug.json','positive.id','controller.id','pre-stop-fixture-events.jsonl','active.json','fixture-events.jsonl','drain.json','after.json','result.json','cleanup.json'}
def stable_bytes(p):
 s=p.lstat();assert stat.S_ISREG(s.st_mode) and not stat.S_ISLNK(s.st_mode)
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,'rb') as f:
  a=os.fstat(f.fileno());data=f.read();b=os.fstat(f.fileno())
 assert (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_mode)==(a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_mode)==(b.st_dev,b.st_ino,b.st_size,b.st_mtime_ns,b.st_mode)
 return data
def number(v):assert type(v) in (int,float) and math.isfinite(v) and v>=0
def count(v):assert type(v) is int and v>=0
def obj(name,required,optional=()):
 v=json.loads(stable_bytes(out/name));assert type(v) is dict and set(required)<=set(v)<=set(required)|set(optional);return v
def fixture_events(name):
 rows=[]
 shape={'D2_READY_FOR_STOP':{'event','assignStatus','contextStatus','claims','bootstraps','lifecycles','recordings','expiresAtMs'},'D2_LIFECYCLE':{'event','lifecycles','reason','receivedAtMs'},'D2_RECORDING_STORED':{'event','recordings','receivedAtMs'},'D2_FIXTURE_TERMINAL':{'event','claims','bootstraps','lifecycles','recordings'},'D2_FIXTURE_FAILED':{'event'},'D2_FIXTURE_REJECTED':{'event'},'D2_ADAPTER_ERROR':{'event'}}
 for line in stable_bytes(out/name).splitlines():
  v=json.loads(line);assert type(v) is dict and v.get('event') in shape and set(v)==shape[v['event']]
  for k,x in v.items():
   if k in ['event','reason']:continue
   number(x)
  if 'reason' in v:assert v['reason'] in ['CONTEXT_LOST']
  rows.append(v)
 return rows
def inspection_failure(v,expectedMode):
 # This one pinned source schema only; no generic schema engine or defaults.
 assert type(v) is dict and set(v)=={'event','mode','stage','reason','facts'}
 properties=inspectionSchema['properties']
 assert v['event']=='D2_INSPECTION_FAILED' and v['mode']==expectedMode and v['mode'] in properties['mode']['enum']
 assert v['stage'] in properties['stage']['enum'] and v['reason'] in properties['reason']['enum']
 facts=v['facts'];spec=properties['facts'];assert type(facts) is dict and set(facts)==set(spec['required'])==set(spec['properties'])
 for name,value in facts.items():
  allowed=spec['properties'][name]
  if value is None:assert 'null' in allowed['type'];continue
  if 'integer' in allowed['type']:assert type(value) is int and allowed['minimum']<=value<=allowed['maximum']
  else:assert 'boolean' in allowed['type'] and type(value) is bool
 return v
def project_outputs():
 assert out.is_dir() and not out.is_symlink();inventory=[]
 for p in sorted(out.iterdir()):
  assert p.name in DECLARED;data=stable_bytes(p);inventory.append({'name':p.name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
 write('output-custody.json',inventory);closed={};missing=[];inspectionFailures=[]
 def persist(attemptComplete=False):
  result={'closedFacts':closed,'missingSourceDeclaredFacts':missing,'projectionComplete':attemptComplete and not missing and not inspectionFailures,'projectionAttemptComplete':attemptComplete,'inspectionFailureDiagnostics':inspectionFailures,'opaqueIdsOnlyHashed':True,'privateNativeAuthPayloadsLogsMediaDecoded':False};write('closed-projection.json',result);return result
 persist()
 for name in ['noinit.json','debug.json']:
  if not (out/name).exists():missing.append(name);persist();continue
  v=obj(name,['exit','missedRefusalDeadline','pollBoundSeconds'],['exactExpectedRefusal','runnerStarted']);assert v['exit'] is None or type(v['exit']) is int;assert type(v['missedRefusalDeadline']) is bool;count(v['pollBoundSeconds'])
  for k in ['exactExpectedRefusal','runnerStarted']:
   if k in v:assert type(v[k]) is bool
  closed[name]=v;persist()
 if (out/'active.json').exists():
  fields=['event','observedAtMs','liveOwnedBrowserLeaders','linux','nodePid','journals','nonemptyJournals','owners','activeRecordingDirectories','recordingDirectoryHandles','tlsMode','tlsGid','readonlyRefusals','coreSoft','coreHard'];v=json.loads(stable_bytes(out/'active.json'))
  if type(v) is dict and v.get('event')=='D2_INSPECTION_FAILED':
   inspectionFailures.append({'missingSuccessObligation':'D2_ACTIVE','diagnostic':inspection_failure(v,'inspect')});missing.append('active.json');persist()
  else:
   assert type(v) is dict and set(fields)<=set(v)<=set(fields);assert v['event']=='D2_ACTIVE' and type(v['linux']) is bool and v['tlsMode']=='0440'
   for k in fields:
    if k not in ['event','linux','tlsMode']:number(v[k])
   pid=v.pop('nodePid');count(pid);v['nodeMainPidGreaterThanOne']=pid>1;closed['active.json']=v;persist()
 else:missing.append('active.json');persist()
 if (out/'drain.json').exists():
  fields=['events','stopSeconds','exit','activeObservedAtMs','liveOwnedBrowserLeaders','lifecycleReceivedAtMs','lifecycleReason','recordingReceivedAtMs','settlementAfterActualDraining'];v=obj('drain.json',fields);assert type(v['events']) is list and v['lifecycleReason']=='CONTEXT_LOST' and type(v['settlementAfterActualDraining']) is bool
  for event in v['events']:
   assert type(event) is dict and {'event','atMs'}<=set(event)<={'event','atMs','guidedClosed'} and event['event'] in ['runner.started','runner.draining','runner.drained'];number(event['atMs'])
   if 'guidedClosed' in event:assert type(event['guidedClosed']) is bool
  for k in fields:
   if k not in ['events','lifecycleReason','settlementAfterActualDraining']:number(v[k])
  closed['drain.json']=v;persist()
 else:missing.append('drain.json');persist()
 for name,fields in [('after.json',['event','activeRecordingDirectories']),('result.json',['allSevenD2StepsObserved','productionCredit','retryCount']),('cleanup.json',['commandExit','ownedResourcesRemaining'])]:
  if not (out/name).exists():missing.append(name);persist();continue
  if name=='after.json':
   v=json.loads(stable_bytes(out/name))
   if type(v) is dict and v.get('event')=='D2_INSPECTION_FAILED':
    inspectionFailures.append({'missingSuccessObligation':'D2_AFTER','diagnostic':inspection_failure(v,'inspect-after')});missing.append(name);persist();continue
   assert type(v) is dict and set(fields)<=set(v)<=set(fields)
  else:v=obj(name,fields)
  if name=='after.json':assert v['event']=='D2_AFTER';count(v['activeRecordingDirectories'])
  elif name=='result.json':assert type(v['allSevenD2StepsObserved']) is bool and type(v['productionCredit']) is bool;count(v['retryCount'])
  else:assert type(v['commandExit']) is int;count(v['ownedResourcesRemaining'])
  closed[name]=v;persist()
 for name in ['pre-stop-fixture-events.jsonl','fixture-events.jsonl']:
  if (out/name).exists():closed[name]=fixture_events(name)
  else:missing.append(name)
  persist()
 for name in ['image-before.txt','image-after.txt']:
  if (out/name).exists():
   v=obj(name,['Id','Os','Cmd','Entrypoint','User']);assert v=={'Id':ID,'Os':'linux','Cmd':['sh','-c','ulimit -c 0 && exec node dist/main.js'],'Entrypoint':None,'User':'pwuser'};closed[name]=v
  else:missing.append(name)
  persist()
 if (out/'pwuser.txt').exists():closed['pwuserUidGid1001']=bool(re.match(rb'^uid=1001\(pwuser\) gid=1001\(pwuser\)',stable_bytes(out/'pwuser.txt')))
 else:missing.append('pwuser.txt')
 return persist(True)

assert subprocess.run(['node','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip()=='v24.20.0'
assert subprocess.run(['pnpm','--config.package-manager-strict=false','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip()=='10.33.0'
guard('before');beforeImage=image('before');exact_resource_absence()
record={'driverPid':os.getpid(),'argv':argv,'cwd':str(R),'rootAdmissionPath':str(admissionPath),'rootAdmissionSha256':admissionSha,'rootDependencyReference':reviewRef,'startedAtUtc':now(),'accepted':False,'runtimeInvocationCount':1,'continuousAwakeClaim':False};inhibitor=None
try:
 inhibitor=subprocess.Popen(['/usr/bin/caffeinate','-i'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);assert inhibitor.poll() is None;record.update(caffeinatePid=inhibitor.pid,caffeinateArgv=['/usr/bin/caffeinate','-i'])
 started=time.monotonic()
 with (O/'driver-collector.log').open('w') as log:
  p=subprocess.Popen(argv,cwd=R,env=env,stdout=log,stderr=subprocess.STDOUT);record['collectorPid']=p.pid;write('driver-start.json',record);code=p.wait()
 record.update(rawCollectorExit=code,nativeElapsedSeconds=time.monotonic()-started,collectorEndedAtUtc=now());write('driver-terminal.json',record)
 result=json.loads((E/(label+'-results.json')).read_text());record['rawChildExit']=result['exit'];record['collectorReceiptSha256']=sha(E/(label+'-results.json'));write('driver-terminal.json',record)
 guard('after');assert image('after')==beforeImage
 projected=project_outputs()
 assert code==0 and result['exit']==0 and all(result[k] is True for k in ['sourceStable','testInputStable','distStable'])
 assert projected['projectionComplete'] and projected['closedFacts']['result.json']=={'allSevenD2StepsObserved':True,'productionCredit':False,'retryCount':0}
 assert projected['closedFacts']['cleanup.json']=={'commandExit':0,'ownedResourcesRemaining':0}
 record.update(accepted=True,allPostguardsClosedProjectionAndOwnedCleanupCompleteAtUtc=now(),sourceA1HostE19FullInputCache191Exact=True)
finally:
 if inhibitor:
  record['inhibitorHeldThroughAllPostguards']=record.get('accepted',False);inhibitor.terminate();record['caffeinateExit']=inhibitor.wait(timeout=10);record['caffeinateReleased']=True;record['caffeinateReleasedAtUtc']=now()
 write('driver-terminal.json',record)
print(json.dumps({'rawCollectorExit':record.get('rawCollectorExit'),'rawChildExit':record.get('rawChildExit'),'accepted':record['accepted'],'collectorPid':record.get('collectorPid'),'caffeinatePid':record.get('caffeinatePid'),'caffeinateReleased':record.get('caffeinateReleased'),'postguardsComplete':record.get('accepted',False)}))
