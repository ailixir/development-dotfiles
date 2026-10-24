from pathlib import Path
import os,stat,json,hashlib,subprocess,runpy,datetime,sys,shutil,math
R=Path.cwd();B=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020';O=Path(__file__).resolve().parent;P=B/'actual-runner-final-gates-preparation01';E=R/'docs/qa/evidence/STUDIO-OBS-011/execution';cache=R/'studio-runner/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json';cacheRel=str(cache.relative_to(R));snapshot=runpy.run_path(str(B/'bootstrap-process-tree-pure-proof-execution01/input-snapshot.py'))['snapshot']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def w(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
plan=json.loads((P/'commands.json').read_text());ids=[r['phase'] for r in plan['commands']];phase=sys.argv[1];assert phase in ids and not (O/(phase+'-terminal.json')).exists();idx=ids.index(phase)
if idx:assert json.loads((O/(ids[idx-1]+'-terminal.json')).read_text())['rawOuterExit']==0
if phase=='contracts':assert json.loads((O/'unit-reconciliation.json').read_text())['accepted'] and json.loads((O/'coverage-reconciliation.json').read_text())['allOriginalThresholdsPassed']
if phase=='host-pins':assert json.loads((O/'contracts-reconciliation.json').read_text())['accepted']
argv=next(r['argv'] for r in plan['commands'] if r['phase']==phase);label=argv[2];assert not any(E.glob(label+'*'));before=snapshot(R);expected=json.loads((O/(ids[idx-1]+'-after-full-catalog.json')).read_text()) if idx else json.loads((O/'actual-initial-full-catalog.json').read_text());assert before==expected;w(phase+'-before-full-catalog.json',before);shutil.copy2(cache,O/'generated-cache'/(phase+'-before.json'))
meta=json.loads((O/'runtime-input-binding.json').read_text());env=os.environ.copy();env['PATH']=plan['nodePathPrefix']+':'+env['PATH'];envPins={k:{'present':k in env,'valueSha256':hashlib.sha256(env[k].encode()).hexdigest() if k in env else None} for k in meta['environment']};assert envPins==meta['environment']
for row in meta['actualCanonical5Pins']:
 p=R/'studio-runner/node_modules'/row['relativePath'];assert sha(p)==row['sha256'] and oct(stat.S_IMODE(p.stat().st_mode))==row['mode']
browser=json.loads(Path(meta['browserRef']['path']).read_text());assert sha(browser['actualExecutablePath'])==meta['browserSha256']
record={'phase':phase,'argv':argv,'cwd':str(R),'startedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceExclusions':None,'node':meta['node'],'pnpm':meta['pnpm']}
with (O/(phase+'-collector.log')).open('w') as log:
 p=subprocess.Popen(argv,cwd=R,env=env,stdout=log,stderr=subprocess.STDOUT);record['collectorPid']=p.pid;w(phase+'-start.json',record);code=p.wait()
record.update(rawOuterExit=code,endedAtUtc=datetime.datetime.now(datetime.timezone.utc).isoformat());result=json.loads((E/(label+'-results.json')).read_text());record.update(actualCollectorResult=result,resultSha256=sha(E/(label+'-results.json')),logSha256=sha(E/(label+'.log')),postGuardComplete=False);w(phase+'-terminal.json',record)
after=snapshot(R);w(phase+'-after-full-catalog.json',after);shutil.copy2(cache,O/'generated-cache'/(phase+'-after.json'));assert after['dist']==before['dist'] and after['dist']['digest']=='e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1'
x={r['path']:r for r in before['inputFiles']};y={r['path']:r for r in after['inputFiles']};delta=[{'path':n,'before':x.get(n),'after':y.get(n)} for n in sorted(x.keys()|y.keys()) if x.get(n)!=y.get(n)];assert x.keys()==y.keys();assert {r['path'] for r in delta}<={cacheRel};assert not delta or phase=='unit'
bc=json.loads((O/'generated-cache'/(phase+'-before.json')).read_text());ac=json.loads((O/'generated-cache'/(phase+'-after.json')).read_text());assert set(bc)==set(ac)=={'version','results'} and bc['version']==ac['version']=='3.2.7';bl=bc['results'];al=ac['results'];assert type(bl)==type(al)==list and len(set(k for k,_ in bl))==len(bl) and len(set(k for k,_ in al))==len(al);b=dict(bl);a=dict(al);newKeys=a.keys()-b.keys();assert not b.keys()-a.keys();changed=[k for k in b if b[k]!=a[k]]
for _,v in bl+al:assert set(v)=={'duration','failed'} and type(v['failed']) is bool and type(v['duration']) in (int,float) and math.isfinite(v['duration']) and v['duration']>=0
if phase=='unit':
 exp=json.loads((P/'expected-unit-cases.json').read_text());allowed={':'+r['file'].removeprefix('studio-runner/') for r in exp['cases']};helper=':test/run/bootstrapProcessTreeObservation.test.ts';assert newKeys==({helper} if helper not in b else set());assert [k for k,_ in al if k in b]==[k for k,_ in bl];assert set(changed)<=allowed and all(a[k]==b[k] for k in b if k not in allowed)
else:assert bl==al
w(phase+'-cache-reconciliation.json',{'version':'3.2.7','beforeKeyCount':len(bl),'afterKeyCount':len(al),'uniqueKeyCounterAndExistingOrderPreserved':True,'newKeys':sorted(newKeys),'changedExistingKeys':changed,'nonUnitFileKeysUnchanged':True,'onlyExecutedFileJobsFiniteDurationFailedAndExactHelperAddition':phase=='unit','fullCatalogUnchanged':not delta,'beforeSha256':sha(O/'generated-cache'/(phase+'-before.json')),'afterSha256':sha(O/'generated-cache'/(phase+'-after.json'))})
for key in ['sourceStable','testInputStable','distStable']:assert result[key] is True
assert result['exit']==code
for row in meta['protected']:assert sha(R/row['path'])==row['sha256'] and oct(stat.S_IMODE((R/row['path']).stat().st_mode))==row['mode']
bins=[]
for path in sorted((R/'studio-runner/node_modules/.bin').iterdir()):
 st=path.lstat();assert stat.S_ISLNK(st.st_mode);bins.append({'path':str(path.relative_to(R)),'target':os.readlink(path),'mode':oct(stat.S_IMODE(st.st_mode)),'device':st.st_dev,'inode':st.st_ino})
assert bins==json.loads((O/'initial21-bin-links.json').read_text());assert sha(browser['actualExecutablePath'])==meta['browserSha256']
record.update(postGuardComplete=True,actualInputDelta=delta,fullSourceDependenciesDistProtected21LinksActualCliBrowserEnvStable=True);w(phase+'-terminal.json',record)
print(json.dumps({'phase':phase,'rawOuterExit':code,'rawChildExit':result['exit'],'collectorPid':p.pid,'sourceStable':True,'testInputStable':True,'distStable':True,'knownCacheOnlyDelta':[r['path'] for r in delta],'cacheKeysBefore':len(bl),'cacheKeysAfter':len(al)}));assert code==0
