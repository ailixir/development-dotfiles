from pathlib import Path
import os,json,subprocess,datetime,hashlib,runpy,sys,shutil
R=Path.cwd();O=Path(__file__).resolve().parent;C=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/bootstrap-process-tree-observation-candidate';S=Path('/private/tmp/obs009-bootstrap-observation-20261020-proof01');E=R/'docs/qa/evidence/STUDIO-OBS-011/execution';P1=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/runner-functional-base-execution01';cache='studio-runner/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json';snap=runpy.run_path(str(O/'input-snapshot.py'))['snapshot']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def wj(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
key=sys.argv[1];allowed=['emit-after01','stamp-after01','types-red01','red01','green01','types-green01','lint01'];assert key in allowed and not (O/(key+'-terminal.json')).exists()
idx=allowed.index(key)
if idx and key!='green01':assert json.loads((O/(allowed[idx-1]+'-terminal.json')).read_text())['rawOuterExit']==0
if key=='green01':assert json.loads((O/'red-reconciliation.json').read_text())['genuineIntendedRed'] and (O/'helper-only-green-application.json').exists()
runner=str(S/'repo/studio-runner');base=['pnpm','--dir='+runner,'--config.package-manager-strict=false','exec'];collector=str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py')
if key=='emit-after01':argv=['python3',collector,'obs009-recovery-20261020-bootstrap-observation-'+key,*base,runner+'/node_modules/typescript/bin/tsc','-p','tsconfig.build.json']
elif key=='stamp-after01':argv=['python3',collector,'obs009-recovery-20261020-bootstrap-observation-'+key,*base,'node','scripts/write-runtime-versions.mjs']
else:argv=next(c['argv'] for c in json.loads((C/'future-proof-plan.json').read_text())['sequence'] if c['id']==key)
label=argv[2];assert not any(E.glob(label+'*'))
before={n:snap(S/n) for n in ['before-repo','repo']};baseline=json.loads((O/'red-start-full-snapshots.json').read_text());assert before['before-repo']==baseline['before-repo']
binding=json.loads((C/'application-binding-unexecuted.json').read_text())
for row in binding['paths']:
 expected=row['afterSha256'] if key in ['green01','types-green01','lint01'] else row['redSha256']
 assert sha(S/'repo'/row['path'])==expected
previous=json.loads((O/(allowed[idx-1]+'-private-after.json')).read_text()) if idx else baseline
if key=='green01':
 expectedRows=[]
 for row in previous['repo']['copyProfileFiles']:
  changed=dict(row)
  if row['path']=='studio-runner/test/helpers/bootstrapProcessTreeObservation.ts':
   green=next(r for r in binding['paths'] if r['path']==row['path']);changed.update(sha256=green['afterSha256'],bytes=(R/green['candidatePath']).stat().st_size)
  expectedRows.append(changed)
 assert before['repo']['copyProfileFiles']==expectedRows and before['repo']['dist']==previous['repo']['dist']
else:assert before==previous
# No implicit exclusions: compare complete actual source/dependency closure and explicitly declared private changes.
actual=snap(R);assert actual==json.loads((O/'actual-initial-full-selected.json').read_text());wj(key+'-private-before.json',before)
(O/'generated-cache').mkdir(exist_ok=True);shutil.copy2(S/'repo'/cache,O/'generated-cache'/(key+'-before.json'))
env=os.environ.copy();env['PATH']='/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin:'+env['PATH'];record={'id':key,'argv':argv,'cwd':str(R),'startedAtUtc':now()}
with (O/(key+'-collector.log')).open('w') as log:
 p=subprocess.Popen(argv,cwd=R,env=env,stdout=log,stderr=subprocess.STDOUT);record['collectorPid']=p.pid;wj(key+'-start.json',record);code=p.wait()
record.update(rawOuterExit=code,endedAtUtc=now());result=json.loads((E/(label+'-results.json')).read_text());record['actualCollectorResult']=result;record['resultSha256']=sha(E/(label+'-results.json'));record['logSha256']=sha(E/(label+'.log'))
after={n:snap(S/n) for n in ['before-repo','repo']};wj(key+'-private-after.json',after);assert after['before-repo']==before['before-repo'];assert snap(R)==actual
shutil.copy2(S/'repo'/cache,O/'generated-cache'/(key+'-after.json'))
x={r['path']:r for r in before['repo']['inputFiles']};y={r['path']:r for r in after['repo']['inputFiles']};assert x.keys()==y.keys();delta=[{'path':k,'before':x[k],'after':y[k]} for k in x if x[k]!=y[k]];assert {r['path'] for r in delta}<={cache};assert not delta or key in ['red01','green01']
if key not in ['emit-after01','stamp-after01']:assert before['repo']['dist']==after['repo']['dist']
assert [r['path'] for r in after['repo']['dist']['files']]==[r['path'] for r in baseline['repo']['dist']['files']]
for field in ['sourceStable','testInputStable','distStable']:assert result[field] is True,(key,field)
assert result['exit']==code
record['privateSourceDependencyDelta']=delta;record['onlyBoundedGeneratedCacheMayChange']=True;record['actualFullSelectedInputsStable']=True;record['beforeCopyUnchanged']=True
if key in ['emit-after01','stamp-after01']:
 kind='tsc-only' if key=='emit-after01' else 'configured-stamped';wj(kind+'-full-dist.json',after['repo']['dist'])
 if key=='stamp-after01':
  accepted=json.loads((P1/'repo-stamped-dist.json').read_text());assert after['repo']['dist']==accepted and after['repo']['dist']['digest']=='e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1';record['full238ProductExactlyMatchesAcceptedCurrentE19']=True
  wj('configured-product-binding.json',{'acceptedFunctionalPhase1AfterFullInventorySha256':sha(P1/'repo-stamped-dist.json'),'newConfiguredFullInventory':after['repo']['dist'],'exact238MembersHashesAndDigest':True,'productionSourcesUnchanged':'Whole src/dependency input binding retained with explicit three test-tier files only; tsconfig.build excludes tests','privateBuildOnly':True,'actualDistNotCopiedOrBuilt':True})
wj(key+'-terminal.json',record)
print(json.dumps({'id':key,'rawOuterExit':code,'rawChildExit':result['exit'],'collectorPid':p.pid,'sourceStable':result['sourceStable'],'testInputStable':result['testInputStable'],'actualDistStable':result['distStable'],'privateDistDigest':after['repo']['dist']['digest'],'privateCatalogFiles':len(after['repo']['copyProfileFiles']),'inputDeltaPaths':[r['path'] for r in delta]}))
assert code==(1 if key=='red01' else 0)
