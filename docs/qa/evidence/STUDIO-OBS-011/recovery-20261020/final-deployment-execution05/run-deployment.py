from pathlib import Path
import json,hashlib,os,stat,subprocess,runpy,datetime,collections,re,math,shutil
R=Path.cwd();B=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020';O=Path(__file__).resolve().parent;P=B/'final-deployment-d2-preparation04';I=B/'final-linux-image-execution04';G=B/'actual-runner-final-gates01';E=R/'docs/qa/evidence/STUDIO-OBS-011/execution';cacheRel='studio-runner/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json';cache=R/cacheRel
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def w(n,x):(O/n).write_text(json.dumps(x,indent=2)+chr(10))
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
assert not (O/'deployment-start.json').exists();plan=json.loads((P/'commands.json').read_text());binding=json.loads((P/'bindings.json').read_text());meta=json.loads((G/'runtime-input-binding.json').read_text());env=os.environ.copy();env['PATH']=plan['env']['PATHPrefix']+':'+env['PATH'];env['PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD']='1';env.update(plan['deployment']['env']);argv=plan['deployment']['argv'];ID=env['STUDIO_RUNNER_IMAGE'];label=argv[2];assert ID=='sha256:bd83d49256b5be0d2c8dc60b26ec92bef0bcf063eaa0a49de3d0db1fd154e753';assert not any(E.glob(label+'*'))
for folder,digest in [(P,'edf04998f3d9e8bffdeab2dff35c391a5b20437c46d5a30095263b3c92eb2734'),(I,'e4d7b082ea8b21ce3b2f4d7223ed6fa609e5722817455246f18ee50fe7d07183'),(I/'execution-qa','cfb01d05a730ea24667445a37041e33e09454f73e7bad77909e1cc98aacf7c6c')]:
 assert sha(folder/'manifest.json')==digest
 for row in json.loads((folder/'manifest.json').read_text())['artifacts']:
  p=Path(row['path']);p=p if p.is_absolute() else (R/p if (R/p).is_file() else folder/p);assert sha(p)==row['sha256']
for row in binding['sourcePinsConfigAndTenFiles']+binding['sourcePinsSelectedHelpers']:assert sha(R/row['path'])==row['sha256'] and oct(stat.S_IMODE((R/row['path']).stat().st_mode))==row['mode']
snapshot=runpy.run_path(str(B/'bootstrap-process-tree-pure-proof-execution01/input-snapshot.py'))['snapshot'];expected=json.loads((I/'final-image-pins01-after-full-catalog.json').read_text());allowed=set(binding['frozenCache']['allowedMutableDeploymentFileKeys']);assert len(allowed)==10
historical=json.loads((B/'runner-baselines/preflight.json').read_text());chartExpected={r['path']:r['sha256'] for r in historical['files'] if r['path'].startswith('helm-chart/')};assert len(chartExpected)==22
quotes=json.loads((B/'runner-baselines/quoted-doc-pins.json').read_text())['files'];docApp=R/'docs/qa/evidence/STUDIO-OBS-009/recovery-20261020/business-and-status-integration01/application.json';approvedDocs={r['path']:r['afterSha256'] for r in json.loads(docApp.read_text())['operations']};quoteExpected={r['path']:approvedDocs.get(r['path'],r['sha256']) for r in quotes}
# Exact prospective quoted-doc succession; original dated B4 expectation remains historical.
engineeringDocRef=B/'final-deployment-doc-successor05/quoted-doc-successor.json'
assert sha(engineeringDocRef)=='53be4c40d9026f2ddd0bb37527f58b16414e35e95cd430ce06922168dfff67e8'
engineeringDoc=json.loads(engineeringDocRef.read_text())
assert engineeringDoc['acceptedForConsumerGuardOnly'] is True and engineeringDoc['target']=='docs/runbooks/studio-inference-rollout.md'
assert engineeringDoc['historicalB4Sha256']=='28f789258453fcfdec2af56f4580046d8cd4f8350cb5b5ef1e1586f61c3d6e4f' and engineeringDoc['acceptedActualSha256']=='10ab0f1361689a2737c8dff3c339a6e58a2f55b57c327daf2ac445e7f6c891f9'
for ref in engineeringDoc['refs']:
 p=R/ref['path'];assert sha(p)==ref['sha256'] and p.stat().st_size==ref['bytes']
assert quoteExpected['docs/runbooks/studio-inference-rollout.md']=='28f789258453fcfdec2af56f4580046d8cd4f8350cb5b5ef1e1586f61c3d6e4f'
quoteExpected['docs/runbooks/studio-inference-rollout.md']='10ab0f1361689a2737c8dff3c339a6e58a2f55b57c327daf2ac445e7f6c891f9'
def host():
 b=subprocess.run(['/usr/bin/pmset','-g','batt'],capture_output=True,text=True,check=True);l=subprocess.run(['/usr/sbin/ioreg','-r','-k','AppleClamshellState','-d1'],capture_output=True,text=True,check=True);s=re.findall(r'"AppleClamshellState"\s*=\s*(Yes|No|true|false)',l.stdout);d={'atUtc':now(),'acPower':"'AC Power'" in b.stdout,'lidOpen':bool(s) and set(s)<={'No','false'},'clamshellStates':s,'rawHostBodiesExported':False,'continuousAwakeClaim':False};assert d['acPower'] and d['lidOpen'];return d
def image(n):
 args=['docker','image','inspect',ID,'--format','{"Id":{{json .Id}},"User":{{json .Config.User}},"Cmd":{{json .Config.Cmd}},"Entrypoint":{{json .Config.Entrypoint}},"Os":{{json .Os}},"Architecture":{{json .Architecture}}}'];p=subprocess.run(args,capture_output=True,text=True);w(n+'-image-command.json',{'argv':args,'exit':p.returncode,'stderr':p.stderr});assert p.returncode==0;v=json.loads(p.stdout);w(n+'-image.json',v);assert v['Id']==ID and v['Os']=='linux' and v['Architecture']=='arm64' and v['User']=='pwuser' and v['Entrypoint'] in [None,[]] and v['Cmd']==['sh','-c','ulimit -c 0 && exec node dist/main.js'];return v
def supplements(n):
 actual=[]
 for p in sorted((R/'helm-chart/put-checks').rglob('*')):
  s=p.lstat();assert not stat.S_ISLNK(s.st_mode)
  if stat.S_ISDIR(s.st_mode):continue
  assert stat.S_ISREG(s.st_mode);rel=str(p.relative_to(R));actual.append({'path':rel,'sha256':sha(p),'mode':oct(stat.S_IMODE(s.st_mode))})
 assert {r['path']:r['sha256'] for r in actual}==chartExpected
 q=[]
 for name,h in quoteExpected.items():
  p=R/name;assert not p.is_symlink() and p.is_file() and sha(p)==h;q.append({'path':name,'sha256':h,'mode':oct(stat.S_IMODE(p.stat().st_mode))})
 record={'chart22':actual,'quoted6':q,'historicalQuotedBinding':str(B/'runner-baselines/quoted-doc-pins.json'),'approvedBoundedDocSuccessorRef':str(docApp),'approvedBoundedDocSuccessorSha256':sha(docApp),'approvedEngineeringDocSuccessorRef':str(engineeringDocRef),'approvedEngineeringDocSuccessorSha256':sha(engineeringDocRef),'quotedHistoricalDeltas':[{'path':r['path'],'historical':r['sha256'],'currentApproved':quoteExpected[r['path']]} for r in quotes if r['sha256']!=quoteExpected[r['path']]]};w(n+'-chart-quotes.json',record)
 if n=='after':assert record==json.loads((O/'before-chart-quotes.json').read_text())
def guard(n):
 cap=O/(n+'-source.json');p=subprocess.run(['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'),str(cap)],cwd=R,env=env,capture_output=True,text=True);(O/(n+'-capture.log')).write_text(p.stdout+p.stderr);assert p.returncode==0;c=json.loads(cap.read_text());assert c['digest']=='a1f8e1c0eaf02f16834f6c129a2749411ab1bd5462f4daf501dc5182f6ff0ebc' and len(c['files'])==1814 and c['dist']['digest']=='e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1' and len(c['dist']['files'])==238;a=snapshot(R);w(n+'-full-catalog.json',a)
 if n=='before':assert a==expected
 else:
  x={r['path']:r for r in expected['inputFiles']};y={r['path']:r for r in a['inputFiles']};assert x.keys()==y.keys() and {k for k in x if x[k]!=y[k]}<={cacheRel} and a['dist']==expected['dist']
 for row in meta['actualCanonical5Pins']:
  p=R/'studio-runner/node_modules'/row['relativePath'];assert sha(p)==row['sha256'] and oct(stat.S_IMODE(p.stat().st_mode))==row['mode']
 for row in meta['protected']:assert sha(R/row['path'])==row['sha256'] and oct(stat.S_IMODE((R/row['path']).stat().st_mode))==row['mode']
 links=[]
 for p in sorted((R/'studio-runner/node_modules/.bin').iterdir()):
  s=p.lstat();assert stat.S_ISLNK(s.st_mode);links.append({'path':str(p.relative_to(R)),'target':os.readlink(p),'mode':oct(stat.S_IMODE(s.st_mode)),'device':s.st_dev,'inode':s.st_ino})
 assert links==json.loads((G/'initial21-bin-links.json').read_text());browser=json.loads(Path(meta['browserRef']['path']).read_text());assert sha(browser['actualExecutablePath'])==meta['browserSha256'];assert {k:{'present':k in env,'valueSha256':hashlib.sha256(env[k].encode()).hexdigest() if k in env else None} for k in meta['environment']}==meta['environment'];supplements(n);w(n+'-guard.json',{'sourceA1Files':1814,'distE19Files':238,'fullInputsOnlyPermittedCacheDelta':True,'protected21CliBrowserEnvironmentExact':True,'controlledRunnerImage':ID,'host':host()});shutil.copy2(cache,O/(n+'-cache.json'));return a
assert subprocess.run(['node','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip()=='v24.20.0';assert subprocess.run(['pnpm','--config.package-manager-strict=false','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip()=='10.33.0';helm=subprocess.run(['helm','version','--short'],env=env,capture_output=True,text=True);w('helm-prerequisite.json',{'argv':['helm','version','--short'],'exit':helm.returncode,'version':helm.stdout.strip(),'stderr':helm.stderr});assert helm.returncode==0
before=guard('before');beforeImage=image('before');bc=json.loads((O/'before-cache.json').read_text());assert sha(O/'before-cache.json')==binding['frozenCache']['sha256'] and bc['version']=='3.2.7' and len(bc['results'])==191;w('preflight.json',{'atUtc':now(),'acceptedPrep3Image116Qa3Verified':True,'sourceA1DistE19Exact':True,'selectedConfigTenTestsFourHelpersExact':True,'chart22Quoted6ExactWithTwoBoundedApprovedDocSuccessors':True,'cache191ExactAndTenKeysAlreadyPresent':True,'freshLabel':True,'immutableImage':ID,'hostReady':True,'node':'v24.20.0','pnpm':'10.33.0'});record={'argv':argv,'cwd':str(R),'startedAtUtc':now(),'driverPid':os.getpid(),'rawCollectorExit':None,'accepted':False,'continuousAwakeClaim':False};inhibitor=None
try:
 inhibitor=subprocess.Popen(['/usr/bin/caffeinate','-i'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);assert inhibitor.poll() is None;record.update(caffeinatePid=inhibitor.pid,caffeinateArgv=['/usr/bin/caffeinate','-i'])
 with (O/'collector-driver.log').open('w') as log:
  p=subprocess.Popen(argv,cwd=R,env=env,stdout=log,stderr=subprocess.STDOUT);record['collectorPid']=p.pid;w('deployment-start.json',record);code=p.wait()
 record.update(rawCollectorExit=code,collectorEndedAtUtc=now());w('deployment-terminal.json',record);result=json.loads((E/(label+'-results.json')).read_text());record.update(rawChildExit=result['exit'],collectorResultSha256=sha(E/(label+'-results.json')));w('deployment-terminal.json',record)
 after=guard('after');afterImage=image('after');assert afterImage==beforeImage;ac=json.loads((O/'after-cache.json').read_text());assert set(bc)==set(ac)=={'version','results'} and ac['version']==bc['version']=='3.2.7';bl=bc['results'];al=ac['results'];assert len(al)==191 and [k for k,v in al]==[k for k,v in bl] and len(dict(al))==191;b=dict(bl);a=dict(al)
 for k,v in bl+al:assert set(v)=={'duration','failed'} and type(v['failed']) is bool and type(v['duration']) in (int,float) and math.isfinite(v['duration']) and v['duration']>=0
 changed=[k for k in b if b[k]!=a[k]];assert set(changed)<=allowed and all(a[k]==b[k] for k in b if k not in allowed);w('cache-reconciliation.json',{'version':'3.2.7','beforeKeys':191,'afterKeys':191,'all191OrderedKeyMembershipExact':True,'newKeys':[],'changedKeys':changed,'allowedMutableKeys':sorted(allowed),'all181NonDeploymentValuesExact':True,'beforeSha256':sha(O/'before-cache.json'),'afterSha256':sha(O/'after-cache.json')})
 report=E/(label+'-vitest.json');d=json.loads(report.read_text());rows=[];files=[];nonemptyFailures=0;suiteMessages=0
 for f in d['testResults']:
  rel=str(Path(f['name']).relative_to(R));suiteMessages+=bool(f.get('message'));files.append({'file':rel,'status':f['status'],'cases':len(f['assertionResults']),'suiteMessageNonempty':bool(f.get('message'))})
  for c in f['assertionResults']:
   nonemptyFailures+=bool(c.get('failureMessages'));rows.append({'file':rel,**{k:c[k] for k in ['ancestorTitles','title','fullName','status']}})
 counts=dict(collections.Counter(x['status'] for x in rows));w('closed-actual-result.json',{'rawCollectorExit':code,'rawChildExit':result['exit'],'success':d.get('success'),'cases':rows,'counts':counts,'files':files,'nonemptyCaseFailureMessageCount':nonemptyFailures,'nonemptySuiteMessageCount':suiteMessages,'rawReportSha256':sha(report)})
 assert code==0 and result['exit']==0 and all(result[k] is True for k in ['sourceStable','testInputStable','distStable']);assert d['success'] and len(rows)==722 and counts=={'passed':722} and len(files)==10 and nonemptyFailures==suiteMessages==0
 key=lambda r:json.dumps(r,sort_keys=True,separators=(',',':'));expectedCases=binding['retainedInventory']['expectedCasesNotExecutionResults'];assert collections.Counter(map(key,rows))==collections.Counter(map(key,expectedCases)) and len(set(map(key,rows)))==722
 def perfile(xs):
  v=collections.defaultdict(list)
  for r in xs:v[r['file']].append(r)
  return dict(v)
 assert perfile(rows)==perfile(expectedCases);log=(E/(label+'.log')).read_text();banners=[v for v in ['Unhandled Errors','Unhandled Rejection','Uncaught Exception'] if v in log];assert not banners;runtime={k:v for k,v in d.items() if re.search('runtime.*error|unhandled',k,re.I)};w('case-reconciliation.json',{'accepted':True,'total':722,'counts':{'passed':722,'failed':0,'skipped':0},'physicalFiles':10,'distinctIdentityStatusKeys':722,'duplicateExcessMultiplicity':0,'perFileCounts':dict(collections.Counter(x['file'] for x in rows)),'exactFullIdentityStatusCounterAndPerFileOrder':True,'onlyExpectedImageTitleReplacement':binding['retainedInventory']['onlyInputDependentTitleReplacement'],'reportedNestedSuiteCounts':{k:v for k,v in d.items() if 'suites' in k.lower()},'allFailureMessagesEmpty':True,'controlledUnhandledBanners':banners,'optionalRuntimeErrorSummary':runtime if runtime else 'NOT_EMITTED','cases':rows,'files':files,'forecastReferenceSha256':sha(P/'bindings.json'),'reportSha256':sha(report)})
 record.update(accepted=True,postguardsAndReconciliationCompletedAtUtc=now(),sourceTestInputDistA1E19Cache191Protected21Chart22Quotes6ImageStable=True)
finally:
 if inhibitor:
  record['caffeinateHeldThroughAllPostguards']=record.get('accepted',False);inhibitor.terminate();record['caffeinateExit']=inhibitor.wait(timeout=10);record['caffeinateReleased']=True;record['caffeinateReleasedAtUtc']=now()
 w('deployment-terminal.json',record)
print(json.dumps({'rawCollectorExit':record['rawCollectorExit'],'rawChildExit':record.get('rawChildExit'),'accepted':record['accepted'],'collectorPid':record.get('collectorPid'),'caffeinatePid':record.get('caffeinatePid'),'caffeinateReleased':record.get('caffeinateReleased'),'total':722,'passed':722,'failed':0,'skipped':0}))
