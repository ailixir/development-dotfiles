from pathlib import Path
import os,json,hashlib,runpy,subprocess,datetime,sys,shutil,math
from collections import Counter
R=Path.cwd();O=Path(__file__).resolve().parent;P=R/'docs/qa/evidence/STUDIO-OBS-009/recovery-20261020/benchmark-report-private-proof-preparation';V=R/'docs/qa/evidence/STUDIO-OBS-009/recovery-20261020/benchmark-report-adoption-lint-correction01';D=Path('/private/tmp/obs009-benchmark-report-adoption-20261020-proof01');E=R/'docs/qa/evidence/STUDIO-OBS-011/execution';cache='studio-runner/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json';snap=runpy.run_path(str(R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/bootstrap-process-tree-pure-proof-execution01/input-snapshot.py'))['snapshot']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def wj(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
def readcache(path):
 doc=json.loads(path.read_text());assert type(doc) is dict and set(doc)=={'version','results'} and doc['version']=='3.2.7';assert type(doc['results']) is list and len(doc['results'])==191;keys=[]
 for pair in doc['results']:
  assert type(pair) is list and len(pair)==2 and type(pair[0]) is str;key,value=pair;keys.append(key);assert type(value) is dict and set(value)=={'duration','failed'} and type(value['failed']) is bool and type(value['duration']) in [int,float] and math.isfinite(value['duration'])
 assert len(set(keys))==191 and all(n==1 for n in Counter(keys).values());return doc,keys,dict(doc['results'])
plan=json.loads((O/'commands.json').read_text());ids=[c['id'] for c in plan['sequence']];key=sys.argv[1];assert key in ids and not (O/(key+'-terminal.json')).exists();idx=ids.index(key);stage=plan['sequence'][idx]
rootBinding=json.loads((O/'execution-admission-binding.json').read_text())
assert rootBinding['status']=='ROOT_BOUND_FOR_EXECUTION04' and rootBinding['executionNamespace']==str(O)==str(R/'docs/qa/evidence/STUDIO-OBS-009/recovery-20261020/benchmark-report-private-proof-execution04')
assert type(rootBinding['path']) is str and Path(rootBinding['path']).parent==R/'docs/qa/evidence/STUDIO-OBS-009/recovery-20261020'
assert type(rootBinding['sha256']) is str and len(rootBinding['sha256'])==64 and set(rootBinding['sha256'])<=set('0123456789abcdef')
authPath=Path(rootBinding['path']);assert sha(authPath)==rootBinding['sha256'];auth=json.loads(authPath.read_text());assert auth['authorized'] and not auth['nativeGo'] and auth['noNewSeedProductEmit'] and auth['ownPrivateRoot']==str(D)
fresh=json.loads((O/'fresh-guards.json').read_text());copyRef=auth['copyComplete']
expectedCopyRef={'path':str(R/'docs/qa/evidence/STUDIO-OBS-009/recovery-20261020/benchmark-report-private-proof-execution02/copy-complete.json'),'sha256':'35b600ee7e2bb80d2b22d356e910a5688a354e9f02cbedd98c7c7c7449f0b6a7'}
# Historical source custody is through COPY only; this never walks the old borrowed namespace.
assert copyRef==expectedCopyRef==fresh['custodyThroughOriginalCopyOnly'] and sha(Path(copyRef['path']))==copyRef['sha256']
assert fresh['rootAdmissionSha256']==rootBinding['sha256'] and fresh['ownPrivateCurrentSnapshot']==auth['ownRestoredPrivateSnapshot'] and sha(Path(auth['ownRestoredPrivateSnapshot']['path']))==auth['ownRestoredPrivateSnapshot']['sha256'] and fresh['actualSource']==auth['expectedActualSourceDigest'] and fresh['actualDist']==auth['expectedActualDistDigest'] and fresh['membersEach']==auth['privateSeedMembers']==13995 and fresh['product238E19']==auth['privateProductDigest'] and all(fresh[field] is True for field in ['ownTwoCopiesExactRestoredSeed','canonical15RuntimeAndBrowserEnvExact','cache191UniqueOrderAndBytesExactSeed','nativeFailedCacheRetained','fresh8LabelsAbsent','metadataFreeze02Absent','noNewSeedCopyOrProductEmit','actualCurrentBindingFromRootAdmission']) and fresh['cacheVersion']=='3.2.7' and fresh['oldBorrowedNativeNamespaceReadWalkedOrForced'] is False
if idx:assert json.loads((O/(ids[idx-1]+'-qualification.json')).read_text())['qualified'] is True
for row in json.loads((P/'manifest.json').read_text())['artifacts']:assert sha(P/row['path'])==row['sha256']
label=stage['label'];assert not list(E.glob(label+'*'))
initial=json.loads((O/'initial-new-private-full-snapshots.json').read_text());before={name:snap(D/name) for name in ['before-repo','repo']};assert before['before-repo']==initial['before-repo']
previous=json.loads((O/(ids[idx-1]+'-private-after.json')).read_text()) if idx else initial
assert before==previous
phase=stage['composition'];phasepath='green' if phase=='green' else phase;bindings=json.loads((V/'source-pins.json').read_text())['files'];field={'green':'greenSha256','v1-delta-red':'v1DeltaRedSha256','red':'redSha256'}[phase]
# Overlays are only between terminal stages and only the ten bound benchmark source bytes.
wanted={row['path']:row[field] for row in bindings};overlay=[]
for row in bindings:
 source=V/phasepath/row['path'];target=D/'repo'/row['path'];assert sha(source)==wanted[row['path']];assert target.is_file() and not target.is_symlink();old=sha(target)
 if old!=wanted[row['path']]:
  originalmode=target.stat().st_mode&0o777;shutil.copyfile(source,target);assert target.stat().st_mode&0o777==originalmode;overlay.append({'path':row['path'],'beforeSha256':old,'afterSha256':sha(target),'bytes':target.stat().st_size})
afteroverlay={name:snap(D/name) for name in ['before-repo','repo']};assert afteroverlay['before-repo']==before['before-repo'] and afteroverlay['repo']['dist']==before['repo']['dist'];x={r['path']:r for r in before['repo']['copyProfileFiles']};y={r['path']:r for r in afteroverlay['repo']['copyProfileFiles']};assert x.keys()==y.keys();delta=[p for p in x if x[p]!=y[p]];assert set(delta)=={r['path'] for r in overlay};assert set(delta)<={r['path'] for r in bindings};assert not idx or len(delta) in [0,3]
wj(key+'-overlay.json',{'phase':phase,'rows':overlay,'fullCatalogExactDeclaredDelta':True});before=afteroverlay;wj(key+'-private-before.json',before)
actual=snap(R);assert actual==json.loads((O/'initial-actual-full-selected.json').read_text())
cli=json.loads((O/'initial-canonical15-and-runtime.json').read_text());runtime=cli['runtime'];env=os.environ.copy();env['PATH']=str(Path(runtime[0]['path']).parent)+':'+env['PATH'];env['STUDIO_EVAL_API_TOKEN']=''
for row in runtime:assert sha(row['path'])==row['sha256']
canonical=[r for r in cli['clis'] if r['tree']==str(R)];canonicalnow=[]
for tree in [R,D/'before-repo',D/'repo']:
 for row in canonical:
  p=tree/'studio-runner/node_modules'/row['relativePath'];assert sha(p)==row['sha256'] and oct(p.stat().st_mode&0o777)==row['mode'];canonicalnow.append({'tree':str(tree),'relativePath':row['relativePath'],'sha256':sha(p),'mode':row['mode']})
wj(key+'-canonical15.json',canonicalnow);browser=json.loads((O/'browser-and-env-binding.json').read_text());assert sha(browser['executable'])==browser['sha256'];assert os.environ.get('IMAGE_TAG')==browser['IMAGE_TAG'] and os.environ.get('PLAYWRIGHT_BROWSERS_PATH')==browser['PLAYWRIGHT_BROWSERS_PATH']
cachebefore=readcache(D/'repo'/cache);assert cachebefore[2][':test/fixtures-tier/observed-bootstrap-process-tree.test.ts']['failed'] is True;shutil.copy2(D/'repo'/cache,O/'generated-cache'/(key+'-before.json'))
record={'id':key,'argv':stage['argv'],'composition':phase,'startedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rootConditionalSha256':rootBinding['sha256'],'correctedProofTask':rootBinding['executionTaskPath']}
with (O/(key+'-collector.log')).open('w') as log:
 p=subprocess.Popen(stage['argv'],cwd=R,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);record['collectorPid']=p.pid;record['ownedProcessGroup']=p.pid;wj(key+'-start.json',record);code=p.wait(timeout=stage['outerTimeoutSeconds'])
record.update(rawOuterExit=code,endedAtUtc=datetime.datetime.now(datetime.timezone.utc).isoformat());result=json.loads((E/(label+'-results.json')).read_text());record.update(actualCollectorResult=result,resultSha256=sha(E/(label+'-results.json')),logSha256=sha(E/(label+'.log')))
after={name:snap(D/name) for name in ['before-repo','repo']};wj(key+'-private-after.json',after);assert after['before-repo']==before['before-repo'];assert after['repo']['dist']==before['repo']['dist']==initial['repo']['dist'];assert after['repo']['dist']['digest']=='e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1';assert snap(R)==actual
shutil.copy2(D/'repo'/cache,O/'generated-cache'/(key+'-after.json'));cacheafter=readcache(D/'repo'/cache);assert cachebefore[1]==cacheafter[1] and Counter(cachebefore[1])==Counter(cacheafter[1]);targets={':test/evaluation/'+n+'.test.ts' for n in ['benchmarkScoring','corpusManifest','harnessSelfTest','budgetAdmission']};changedkeys=[k for k in cachebefore[1] if cachebefore[2][k]!=cacheafter[2][k]];assert set(changedkeys)<=targets;assert cacheafter[2][':test/fixtures-tier/observed-bootstrap-process-tree.test.ts']['failed'] is True
x={r['path']:r for r in before['repo']['inputFiles']};y={r['path']:r for r in after['repo']['inputFiles']};assert x.keys()==y.keys();delta=[{'path':n,'before':x[n],'after':y[n]} for n in x if x[n]!=y[n]];assert {r['path'] for r in delta}<={cache};assert not delta or key in ['v1-c2-red01','c12-red01','green105-01']
for field in ['sourceStable','testInputStable','distStable']:assert result[field] is True
assert result['exit']==code
try:os.killpg(p.pid,0)
except ProcessLookupError:group='ESRCH/GONE'
else:group='PRESENT_UNEXPECTED'
record.update(privateInputDelta=delta,cacheChangedKeys=changedkeys,cacheOther187ValuesExact=True,actualAndOwnPrivateSourcesStable=True,oldBorrowedNamespaceRead=False,privateProduct238Stable=True,ownedProcessGroupSignal0Observation=group,noSignalsGT0=True)
wj(key+'-terminal.json',record);wj(key+'-cache-disposition.json',{'version':'3.2.7','uniqueKeyCount':191,'exactKeyCounterAndOrder':True,'changedKeys':changedkeys,'all187NonTargetValuesExact':True,'failedBootstrapRetained':True,'beforeSha256':sha(O/'generated-cache'/(key+'-before.json')),'afterSha256':sha(O/'generated-cache'/(key+'-after.json')),'fullCatalogUnchangedClaimed':False})
print(json.dumps({'id':key,'rawOuterExit':code,'rawChildExit':result['exit'],'collectorPid':p.pid,'ownedGroup':group,'sourceStable':result['sourceStable'],'testInputStable':result['testInputStable'],'distStable':result['distStable'],'cacheChangedKeys':changedkeys}))
assert group=='ESRCH/GONE'
if code!=stage['expectedRawCollectorAndChildExit']:
 wj(key+'-unexpected.json',{'unexpectedRawExit':code,'expected':stage['expectedRawCollectorAndChildExit'],'action':'STOP_NO_FIX_OR_RETRY'});raise SystemExit(1)
if key in ['types-green01','lint-green01']:
 wj(key+'-qualification.json',{'qualified':True,'kind':'EXACT_STATIC_COMMAND_EXIT0','rawOuterExit':code,'rawChildExit':result['exit'],'sourceAndProductStable':True,'noCacheDelta':not delta})
