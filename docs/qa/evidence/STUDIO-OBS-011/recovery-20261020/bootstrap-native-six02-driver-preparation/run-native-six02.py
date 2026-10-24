from pathlib import Path
import os,json,subprocess,datetime,hashlib,runpy,re,shutil,platform,time,sys,math
R=Path.cwd();B=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020';O=B/'bootstrap-process-tree-native-six-execution02';S=Path('/private/tmp/obs009-bootstrap-observation-20261020-proof01');T=S/'repo';C='studio-runner/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json';raw=T/'bootstrap-six-raw02'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def wj(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
# An explicit fresh root-dispatched path AND exact hash are required; the source template cannot admit a run.
assert len(sys.argv)==3
admissionPath=Path(sys.argv[1]);admissionSha=sys.argv[2];assert re.fullmatch('[0-9a-f]{64}',admissionSha) and sha(admissionPath)==admissionSha
admission=json.loads(admissionPath.read_text());assert admission['kind']=='ROOT_SEPARATE_PROSPECTIVE_NATIVE_SIX02_ADMISSION' and admission['authorized'] is True
assert admission['pureExecutionQaAccepted'] is True and admission['prospectiveResourceLimitationAccepted'] is True and admission['historicalFailedCleanupPass'] is False
assert admission['singleHeavyLaneOwner']=='gateway_implementation' and admission['runtimeOAbsentConfirmed'] is True and admission['freshRawAbsentConfirmed'] is True
refs=admission['references'];required=['pureProducerManifest','pureExecutionQaReview','pureExecutionQaReadiness','pureExecutionQaManifest','resourceReadiness','terminalPrivateSnapshots','terminalActualSnapshot','canonicalCliPins','browserInput','runtimeInputBinding'];assert set(refs)==set(required)
for key in required:
 ref=refs[key];assert isinstance(ref['path'],str) and ref['path'] and isinstance(ref['sha256'],str) and re.fullmatch('[0-9a-f]{64}',ref['sha256']) and sha(ref['path'])==ref['sha256'],key
Q=B/'bootstrap-owned-scope-pure-proof-execution02';assert Path(refs['pureProducerManifest']['path']).resolve()==(Q/'manifest.json').resolve() and refs['pureProducerManifest']['sha256']=='24b7b9d8807983f7065e5e149771546667595af844f050a9cc0828a8388b844c'
m=json.loads(Path(refs['pureProducerManifest']['path']).read_text());assert len(m['artifacts'])==117
for row in m['artifacts']:assert sha(Q/row['path'])==row['sha256'],row['path']
expectedPrivate={'studio-runner/test/fixtures-tier/observed-bootstrap-process-tree.test.ts':'f4cc9fb3be55dad91daa30e2d169e9d1d872a8be4a4901649d61c681cf858eba','studio-runner/test/helpers/bootstrapProcessTreeObservation.ts':'ab10aa5a188d07aba698704af1f43abd5f6f86ff1c90f8922f7c8ea17435c998','studio-runner/test/run/bootstrapProcessTreeObservation.test.ts':'e22cfa670de9996381663b29f60d23a6590aa72a5cccd4dcfd76b77c865ee7bd'}
expectedActual={p:{'exists':p.endswith('/observed-bootstrap-process-tree.test.ts'),'sha256':'7b928dc51eef99343cdeefdb1cbf8055c70b7d46c2ed086073ec380f92c17fb1' if p.endswith('/observed-bootstrap-process-tree.test.ts') else None} for p in expectedPrivate}
assert admission['privateSources']==expectedPrivate and admission['actualPreimages']==expectedActual
assert admission['actualSourceDigest']=='3e1801b434eb8a3a1b096b65bd3701cb76859b5607121c5062631d0377facd4f' and admission['actualDistDigest']=='698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210' and admission['privateDistDigest']=='e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1'
assert not O.exists() and not raw.exists() and os.environ.get('GUIDED_CLOSE_BOUND_OUT') is None
O.mkdir();(O/'generated-cache').mkdir()
wj('verified-prerequisites.json',{'rootAdmissionPath':str(admissionPath),'rootAdmissionSha256':admissionSha,'references':refs,'producerArtifactsVerified':117,'rootAcceptedPureQaAndProspectiveResourceLimitation':True,'historicalAllGone':'NOT_ESTABLISHED','historicalCleanupPass':False})
snap=runpy.run_path(str(B/'bootstrap-process-tree-pure-proof-execution01/input-snapshot.py'))['snapshot'];before={n:snap(S/n) for n in ['before-repo','repo']};assert before==json.loads(Path(refs['terminalPrivateSnapshots']['path']).read_text());actual=snap(R);assert actual==json.loads(Path(refs['terminalActualSnapshot']['path']).read_text());assert len(before['before-repo']['copyProfileFiles'])==13993 and len(before['repo']['copyProfileFiles'])==13995 and len(before['repo']['dist']['files'])==238 and before['repo']['dist']['digest']==admission['privateDistDigest']
browser=json.loads(Path(refs['browserInput']['path']).read_text());assert sha(browser['actualExecutablePath'])==browser['actualExecutableSha256']
pins=json.loads(Path(refs['canonicalCliPins']['path']).read_text());assert len(pins)==15
for row in pins:
 p=Path(row['tree'])/'studio-runner/node_modules'/row['relativePath'];assert sha(p)==row['sha256'] and oct(p.stat().st_mode&0o777)==row['mode'],row['relativePath']
for p,h in expectedPrivate.items():
 assert sha(T/p)==h;actualPin=expectedActual[p];assert sha(R/p)==actualPin['sha256'] if actualPin['exists'] else not (R/p).exists()
wj('canonical-cli-pins.json',pins)
env=os.environ.copy();env['PATH']='/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin:'+env['PATH'];runtime=json.loads(Path(refs['runtimeInputBinding']['path']).read_text());assert runtime['node']=='v24.20.0' and runtime['pnpm']=='10.33.0'
envpins={k:{'present':k in env,'valueSha256':hashlib.sha256(env[k].encode()).hexdigest() if k in env else None} for k in runtime['environment']};assert envpins==runtime['environment']
wj('private-before-fixtures-full-snapshots.json',before);wj('actual-before-fixtures-full-selected.json',actual);shutil.copy2(T/C,O/'generated-cache/fixtures-before.json');raw.mkdir()
argv=['pnpm','--dir='+str(T/'studio-runner'),'--config.package-manager-strict=false','exec',str(T/'studio-runner/node_modules/vitest/vitest.mjs'),'run','--config','vitest.fixtures.config.ts','test/fixtures-tier/observed-bootstrap-process-tree.test.ts','--minWorkers=1','--maxWorkers=1','--reporter=default','--reporter=json','--outputFile='+str(raw/'vitest.json')];cwd=T/'studio-runner'
cap=['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py')]
record={'label':'obs009-recovery-20261020-bootstrap-native-six02','argv':argv,'cwd':str(cwd),'rawReportPath':str(raw/'vitest.json'),'rawLogPath':str(raw/'vitest.log'),'driverPid':os.getpid(),'directExistingRouting':True,'runRunnerFixtureCollectorCalled':False,'fileNameFilters':['test/fixtures-tier/observed-bootstrap-process-tree.test.ts'],'testNamePattern':None,'configGlobalSetupUnchanged':True,'nativeExecutionCount':1,'caffeinateArgv':['/usr/bin/caffeinate','-i'],'rootAdmissionSha256':admissionSha,'continuousAwakeClaim':False}
wj('fixtures02-admission-and-command.json',record)
cr=subprocess.run(cap+[str(O/'fixtures-actual-before.json')],cwd=R,env=env,capture_output=True,text=True);(O/'fixtures-actual-before-capture.log').write_text(cr.stdout+cr.stderr);assert cr.returncode==0
rootBefore=json.loads((O/'fixtures-actual-before.json').read_text());assert rootBefore['digest']==admission['actualSourceDigest'] and len(rootBefore['files'])==1812 and rootBefore['dist']['digest']==admission['actualDistDigest'] and len(rootBefore['dist']['files'])==238
# Existing closed host read, immediately before the owned inhibitor/native launch.
batt=subprocess.run(['/usr/bin/pmset','-g','batt'],capture_output=True,text=True,check=True);lid=subprocess.run(['/usr/sbin/ioreg','-r','-k','AppleClamshellState','-d1'],capture_output=True,text=True,check=True);onAC="'AC Power'" in batt.stdout;states=re.findall(r'"AppleClamshellState"\s*=\s*(Yes|No|true|false)',lid.stdout);host={'atUtc':now(),'acPower':onAC,'lidOpen':bool(states) and set(states)<={'No','false'},'clamshellStates':states,'pmsetExit':batt.returncode,'ioregExit':lid.returncode,'pmsetRawSha256':hashlib.sha256(batt.stdout.encode()).hexdigest(),'ioregRawSha256':hashlib.sha256(lid.stdout.encode()).hexdigest(),'rawHostBodiesExported':False}
wj('fixture-host-and-environment.json',{'host':host,'environment':envpins,'pathPrefix':env['PATH'].split(':')[0],'node':runtime['node'],'pnpm':runtime['pnpm'],'platform':platform.system(),'architecture':platform.machine(),'browser':browser['provenance'],'GUIDED_CLOSE_BOUND_OUT':'UNSET','userReadyCommitmentPersists':True});assert onAC and host['lidOpen']
inhibitor=None;p=None;code=None;nativeStarted=None;record['nativeStartedAtUtc']=None;record['nativeEndedAtUtc']=None;record['nativeElapsedSeconds']=None
try:
 try:
  inhibitor=subprocess.Popen(record['caffeinateArgv'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);record['caffeinatePid']=inhibitor.pid;assert inhibitor.poll() is None
  with (raw/'vitest.log').open('w') as log:
   nativeStarted=time.monotonic();record['nativeStartedAtUtc']=now();p=subprocess.Popen(argv,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT);record['nativePid']=p.pid;wj('fixtures-start.json',record);code=p.wait()
 finally:
  # Wait only the same original handle if its wait was interrupted; never restart or signal native manually.
  if p is not None:
   if code is None:code=p.wait()
   record.update(rawNativeExit=code,nativeEndedAtUtc=now(),nativeElapsedSeconds=time.monotonic()-nativeStarted)
  cr=subprocess.run(cap+[str(O/'fixtures-actual-after.json')],cwd=R,env=env,capture_output=True,text=True);(O/'fixtures-actual-after-capture.log').write_text(cr.stdout+cr.stderr);record['actualAfterCaptureExit']=cr.returncode
  after={n:snap(S/n) for n in ['before-repo','repo']};actualafter=snap(R);wj('private-after-fixtures-full-snapshots.json',after);wj('actual-after-fixtures-full-selected.json',actualafter);shutil.copy2(T/C,O/'generated-cache/fixtures-after.json')
  assert cr.returncode==0 and actualafter==actual and after['before-repo']==before['before-repo'] and after['repo']['dist']==before['repo']['dist']
  rootAfter=json.loads((O/'fixtures-actual-after.json').read_text());assert rootAfter['files']==rootBefore['files'] and rootAfter['dist']==rootBefore['dist']
  x={r['path']:r for r in before['repo']['copyProfileFiles']};y={r['path']:r for r in after['repo']['copyProfileFiles']};assert x.keys()==y.keys();delta=[{'path':k,'before':x[k],'after':y[k]} for k in x if x[k]!=y[k]];assert {r['path'] for r in delta}<={C}
  bc=json.loads((O/'generated-cache/fixtures-before.json').read_text());ac=json.loads((O/'generated-cache/fixtures-after.json').read_text());assert set(bc)==set(ac)=={'version','results'} and bc['version']==ac['version']=='3.2.7';bl=bc['results'];al=ac['results'];assert type(bl)==type(al)==list and len(bl)==len(al)==191 and len(set(k for k,_ in bl))==len(set(k for k,_ in al))==191 and [k for k,_ in bl]==[k for k,_ in al]
  for _,v in bl+al:assert set(v)=={'duration','failed'} and type(v['failed']) is bool and type(v['duration']) in (int,float) and math.isfinite(v['duration']) and v['duration']>=0
  b=dict(bl);a=dict(al);changed=[k for k in b if b[k]!=a[k]];assert set(changed)<={':test/fixtures-tier/observed-bootstrap-process-tree.test.ts'}
  wj('cache-key-reconciliation.json',{'keyCount':191,'orderedKeysUniqueAndSame':True,'allOther190ValuesExact':True,'changedKeys':changed})
  wj('fixtures-generated-cache-delta.json',{'exactRootAcceptedPath':C,'delta':delta,'sameMembership':True,'version':'3.2.7','sameOrdered191Keys':True,'durationFailedFieldsOnly':True,'beforeSha256':sha(O/'generated-cache/fixtures-before.json'),'afterSha256':sha(O/'generated-cache/fixtures-after.json'),'fullCatalogUnchanged':not delta})
  assert sha(browser['actualExecutablePath'])==browser['actualExecutableSha256']
  for row in pins:
   q=Path(row['tree'])/'studio-runner/node_modules'/row['relativePath'];assert sha(q)==row['sha256'] and oct(q.stat().st_mode&0o777)==row['mode']
  batt=subprocess.run(['/usr/bin/pmset','-g','batt'],capture_output=True,text=True,check=True);lid=subprocess.run(['/usr/sbin/ioreg','-r','-k','AppleClamshellState','-d1'],capture_output=True,text=True,check=True);states=re.findall(r'"AppleClamshellState"\s*=\s*(Yes|No|true|false)',lid.stdout)
  hostAfter={'atUtc':now(),'acPower':"'AC Power'" in batt.stdout,'lidOpen':bool(states) and set(states)<={'No','false'},'clamshellStates':states,'pmsetExit':batt.returncode,'ioregExit':lid.returncode,'pmsetRawSha256':hashlib.sha256(batt.stdout.encode()).hexdigest(),'ioregRawSha256':hashlib.sha256(lid.stdout.encode()).hexdigest(),'rawHostBodiesExported':False,'continuousAwakeClaim':False};wj('terminal-host-metadata.json',hostAfter);assert hostAfter['acPower'] and hostAfter['lidOpen']
  record['inhibitorStillRunningThroughMetadata']=inhibitor is not None and inhibitor.poll() is None;assert record['inhibitorStillRunningThroughMetadata']
  if p is not None:
   assert (raw/'vitest.json').is_file();wj('fixtures-raw-output-pins.json',{'report':str(raw/'vitest.json'),'reportSha256':sha(raw/'vitest.json'),'log':str(raw/'vitest.log'),'logSha256':sha(raw/'vitest.log'),'rawNativeExit':code,'nativeElapsedSeconds':record['nativeElapsedSeconds'],'privateDistDigest':after['repo']['dist']['digest'],'allOtherSelectedInputsStable':True,'actualSelectedSourceDistStable':True,'inhibitorHeldThroughMetadata':True})
except BaseException as error:
 record['setupOrMetadataFailureType']=type(error).__name__;record['setupOrMetadataErrno']=getattr(error,'errno',None)
 raise
finally:
 record['metadataCollectorEndedAtUtc']=now()
 try:
  if inhibitor is not None:
   if inhibitor.poll() is None:inhibitor.terminate()
   record['caffeinateExit']=inhibitor.wait(timeout=10);record['caffeinateReleased']=True
  else:record['caffeinateReleased']='NOT_STARTED'
 finally:
  record['inhibitorReleasedAtUtc']=now() if record.get('caffeinateReleased') is True else None;wj('fixtures-terminal.json',record)
print(json.dumps({'rawNativeExit':code,'nativeElapsedSeconds':record['nativeElapsedSeconds'],'nativePid':record.get('nativePid'),'caffeinatePid':record.get('caffeinatePid'),'caffeinateReleased':record['caffeinateReleased'],'metadataCollectorEndedAtUtc':record['metadataCollectorEndedAtUtc'],'inhibitorReleasedAtUtc':record['inhibitorReleasedAtUtc'],'actualStable':True,'privateDist':after['repo']['dist']['digest'],'generatedCacheOnlyDelta':True}));assert code==0
