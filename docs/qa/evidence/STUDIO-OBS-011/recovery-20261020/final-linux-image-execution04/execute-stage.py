from pathlib import Path
import json,hashlib,os,stat,subprocess,sys,runpy,datetime,shutil,re,math,tarfile
R=Path.cwd();B=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020';O=Path(__file__).resolve().parent;P=B/'final-linux-image-preparation03';G=B/'actual-runner-final-gates01';E=R/'docs/qa/evidence/STUDIO-OBS-011/execution'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def w(n,x):(O/n).write_text(json.dumps(x,indent=2)+chr(10))
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
plan=json.loads((P/'commands.json').read_text());build=next(x for x in plan['commands'] if x.get('id')=='final-image-build01');originalBuildArgv=build['argv'].copy();assert build['argv'][2]=='obs011-recovery-20261020-final-runner-image-build01' and build['argv'].count('--network=none')==1;build['argv'][2]='obs011-recovery-20261020-final-runner-image-build02';build['argv'][build['argv'].index('--network=none')]='--network=default';env=os.environ.copy();env['PATH']=plan['env']['PATHPrefix']+':'+env['PATH'];env['PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD']='1';meta=json.loads((G/'runtime-input-binding.json').read_text());snapshot=runpy.run_path(str(B/'bootstrap-process-tree-pure-proof-execution01/input-snapshot.py'))['snapshot'];phase=sys.argv[1]
authorized=['final-base-inspect01','final-tag-absence-guard','reuse-public-context03','final-image-build01','final-image-inspect01','final-image-own-package-lock-hashes','final-image-pins01'];assert phase in ['preflight']+authorized
def host():
 b=subprocess.run(['/usr/bin/pmset','-g','batt'],capture_output=True,text=True,check=True);l=subprocess.run(['/usr/sbin/ioreg','-r','-k','AppleClamshellState','-d1'],capture_output=True,text=True,check=True);s=re.findall(r'"AppleClamshellState"\s*=\s*(Yes|No|true|false)',l.stdout);v={'atUtc':now(),'acPower':"'AC Power'" in b.stdout,'lidOpen':bool(s) and set(s)<={'No','false'},'clamshellStates':s,'rawHostBodiesExported':False,'continuousAwakeClaim':False};assert v['acPower'] and v['lidOpen'];return v
def guarded(n,expected):
 cap=O/(n+'-source.json');p=subprocess.run(['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'),str(cap)],cwd=R,env=env,capture_output=True,text=True);(O/(n+'-capture.log')).write_text(p.stdout+p.stderr);assert p.returncode==0;c=json.loads(cap.read_text());assert c['digest']=='a1f8e1c0eaf02f16834f6c129a2749411ab1bd5462f4daf501dc5182f6ff0ebc' and len(c['files'])==1814 and c['dist']['digest']=='e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1' and len(c['dist']['files'])==238
 a=snapshot(R);w(n+'-full-catalog.json',a);assert a==expected
 for row in meta['actualCanonical5Pins']:
  q=R/'studio-runner/node_modules'/row['relativePath'];assert sha(q)==row['sha256'] and oct(stat.S_IMODE(q.stat().st_mode))==row['mode']
 for row in meta['protected']:assert sha(R/row['path'])==row['sha256'] and oct(stat.S_IMODE((R/row['path']).stat().st_mode))==row['mode']
 bins=[]
 for q in sorted((R/'studio-runner/node_modules/.bin').iterdir()):
  s=q.lstat();assert stat.S_ISLNK(s.st_mode);bins.append({'path':str(q.relative_to(R)),'target':os.readlink(q),'mode':oct(stat.S_IMODE(s.st_mode)),'device':s.st_dev,'inode':s.st_ino})
 assert bins==json.loads((G/'initial21-bin-links.json').read_text());browser=json.loads(Path(meta['browserRef']['path']).read_text());assert sha(browser['actualExecutablePath'])==meta['browserSha256'];assert {k:{'present':k in env,'valueSha256':hashlib.sha256(env[k].encode()).hexdigest() if k in env else None} for k in meta['environment']}==meta['environment']
 cache=R/'studio-runner/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json';assert sha(cache)==sha(G/'generated-cache/host-pins-after.json');v=json.loads(cache.read_text());assert v['version']=='3.2.7' and type(v['results']) is list and len(v['results'])==191 and len(dict(v['results']))==191
 for k,x in v['results']:assert set(x)=={'duration','failed'} and type(x['failed']) is bool and type(x['duration']) in (int,float) and math.isfinite(x['duration'])
 w(n+'-guard.json',{'sourceA1Files':1814,'distE19Files':238,'fullInputExact':True,'cache191Exact':True,'protected21LinksActual5CliBrowserEnvironmentExact':True,'host':host()});return a
if phase=='preflight':
 assert not (O/'preflight.json').exists()
 for folder,digest,key in [(P,'7133e98393c7fd5203cc6e9b6981fde388c01f3cda61be443d8a7e339c4378c2','files'),(G,'345d1004c6ad7759a72b8b6c0afec8fb4ec5c0b1f6fc0b989db5973c27dc4020','artifacts'),(G/'execution-qa','4624779b021f678a017338c85e8b44408529d53b64ec5035f9b0de5edb89e3c7','artifacts')]:
  assert sha(folder/'manifest.json')==digest
  for row in json.loads((folder/'manifest.json').read_text())[key]:
   q=Path(row['path']);q=q if q.is_absolute() else (R/q if (R/q).is_file() else folder/q);assert sha(q)==row['sha256']
 assert sha(B/'final-linux-image-preparation03-root-review.json')=='e2e38e33258ddde77cacb9757bf9aa6353905e41fa2dc59d52cb9a5299aedfdf'
 for row in plan['sourceReferences']:assert sha(R/row['path'])==row['sha256']
 assert all(x is None for x in plan['finalBindings'].values())
 for cmd in plan['commands']:
  if cmd.get('id') in authorized and cmd['argv'][0]=='python3' and len(cmd['argv'])>2 and cmd['argv'][1].endswith('run-runner.py'):assert not any(E.glob(cmd['argv'][2]+'*'))
 assert Path(next(x for x in plan['commands'] if x.get('id')=='final-context03')['argv'][4]).is_file() and not (O/'public-context.json').exists();assert sha(B/'final-linux-image-execution03/manifest.json')=='639d64d8c570e01b98a3bbd975c2c5e03ead42f2c38f44cc44c496e0fb76a4ad'
 for row in json.loads((B/'final-linux-image-execution03/manifest.json').read_text())['artifacts']:assert sha(R/row['path'])==row['sha256']
 w('explicit-new-build-condition.json',{'originalBuildArgv':originalBuildArgv,'newBuildArgv':build['argv'],'onlyChanges':['collector label01→02','Docker BUILD RUN network none→default'],'runtimeContainerNetworkRemainsNone':True,'old03FailurePreserved':True})
 node=subprocess.run(['node','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip();pnpm=subprocess.run(['pnpm','--config.package-manager-strict=false','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip();assert node=='v24.20.0' and pnpm=='10.33.0';a=guarded('preflight',json.loads((G/'host-pins-after-full-catalog.json').read_text()));w('preflight.json',{'atUtc':now(),'acceptedProducer88AndQa4AndPrep3Verified':True,'sourceA1':True,'distE19':True,'cache191Exact':True,'allLabelsFreshAndExistingContextReuseOnly':True,'node':node,'pnpm':pnpm,'preparationNullBindingsUnchanged':True});print(json.dumps({'preflight':True,'sourceFiles':1814,'distFiles':238,'cacheKeys':191}));sys.exit(0)
assert (O/'preflight.json').exists();i=authorized.index(phase)
if i:assert json.loads((O/(authorized[i-1]+'-terminal.json')).read_text())['accepted']
assert not (O/(phase+'-terminal.json')).exists();before=guarded(phase+'-before',json.loads((O/'preflight-full-catalog.json').read_text()))
if phase=='reuse-public-context03':
 old=B/'final-linux-image-execution03';public=json.loads((old/'public-context.json').read_text());tar=Path(next(x for x in plan['commands'] if x.get('id')=='final-context03')['argv'][4]);assert sha(tar)==public['tarSha256']=='8457b7413e543ff88eea95e7fec554d380e5903e839e0f814c46739833bdb886';root=R/'studio-runner';actual={}
 def visit(p):
  st=p.lstat();rel=p.relative_to(root).as_posix();assert not stat.S_ISLNK(st.st_mode)
  if stat.S_ISDIR(st.st_mode):
   actual[rel]={'path':rel,'kind':'directory'}
   for q in sorted(p.iterdir()):visit(q)
  else:
   assert stat.S_ISREG(st.st_mode);fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
   with os.fdopen(fd,'rb') as f:a=os.fstat(f.fileno());data=f.read();b=os.fstat(f.fileno())
   assert (a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_mode)==(b.st_dev,b.st_ino,b.st_size,b.st_mtime_ns,b.st_mode) and (st.st_dev,st.st_ino,st.st_mode)==(a.st_dev,a.st_ino,a.st_mode)
   actual[rel]={'path':rel,'kind':'regular','sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'mode':stat.S_IMODE(st.st_mode)}
 for name in public['roots']:visit(root/name)
 assert [actual[k] for k in sorted(actual)]==public['members'] and len(actual)==111
 with tarfile.open(tar,'r') as tf:
  members=tf.getmembers();assert [m.name for m in members]==sorted(actual)
  for m in members:
   row=actual[m.name];assert (m.isdir() and row['kind']=='directory') or (m.isfile() and row['kind']=='regular')
   if m.isfile():assert m.mode==row['mode'] and m.size==row['bytes'] and hashlib.sha256(tf.extractfile(m).read()).hexdigest()==row['sha256']
 assert sha(tar)==public['tarSha256'];w('public-context.json',public);after=guarded(phase+'-after',before);w(phase+'-terminal.json',{'id':phase,'argv':['python3',str(Path(__file__).resolve()),phase],'pid':os.getpid(),'rawExit':0,'accepted':True,'reusedTarPath':str(tar),'contextTarSha256':public['tarSha256'],'fresh111Membership101RegularHashesModesExact':True,'originalContextAndTarUnchanged':True});print(json.dumps({'id':phase,'rawExit':0,'accepted':True,'members':111,'regular':101}));sys.exit(0)
cmd=next(x for x in plan['commands'] if x.get('id')==phase);argv=cmd['argv'].copy()
if '<MEASURED_FINAL_IMAGE_ID>' in argv:argv=[json.loads((O/'measured-image.json').read_text())['Id'] if x=='<MEASURED_FINAL_IMAGE_ID>' else x for x in argv]
record={'id':phase,'argv':argv,'cwd':str(R),'startedAtUtc':now(),'pid':None,'accepted':False};inhibitor=None
try:
 if phase in ['final-image-build01','final-image-own-package-lock-hashes','final-image-pins01']:
  inhibitor=subprocess.Popen(['/usr/bin/caffeinate','-i'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);assert inhibitor.poll() is None;record.update(caffeinatePid=inhibitor.pid,caffeinateArgv=['/usr/bin/caffeinate','-i'],continuousAwakeClaim=False)
 stdin=open(cmd['stdinFile'],'rb') if 'stdinFile' in cmd else subprocess.DEVNULL
 with (O/(phase+'.log')).open('w') as log:
  p=subprocess.Popen(argv,cwd=R,env=env,stdin=stdin,stdout=log,stderr=subprocess.STDOUT);record['pid']=p.pid;w(phase+'-start.json',record);code=p.wait()
 if 'stdinFile' in cmd:stdin.close()
 record.update(rawExit=code,terminalAtUtc=now());w(phase+'-terminal.json',record)
 after=guarded(phase+'-after',before);text=(O/(phase+'.log')).read_text()
 if phase=='final-tag-absence-guard':assert code==1 and ('No such image:' in text or 'No such object:' in text) and plan['configuredImageReferenceWhenBuilt'] in text
 else:assert code==0
 if argv[0]=='python3' and argv[1].endswith('run-runner.py'):
  result=json.loads((E/(argv[2]+'-results.json')).read_text());assert result['exit']==0 and all(result[x] is True for x in ['sourceStable','testInputStable','distStable']);record.update(collectorResult=result,collectorResultSha256=sha(E/(argv[2]+'-results.json')))
 if phase=='final-base-inspect01':
  v=json.loads(text);assert v['Id']=='sha256:5536bbbd0ffc106a9fdab13fbff6b3abab01418cceff67ff246552b64cf5623d' and v['Os']=='linux' and v['Architecture']=='arm64';w('base-image.json',v)
 if phase=='final-context03':
  v=json.loads((O/'public-context.json').read_text());assert v['publicInputsStable'] and v['sourceSymlinksAccepted']==0 and v['roots']==json.loads((P/'context-contract.json').read_text())['rootsRelativeToStudioRunner'];assert sha(Path(cmd['argv'][4]))==v['tarSha256'];record.update(publicRegularMembers=sum(x['kind']=='regular' for x in v['members']),contextTarSha256=v['tarSha256'])
 if phase=='final-image-inspect01':
  v=json.loads(text);assert v['Id'].startswith('sha256:') and len(v['Id'])==71 and v['Os']=='linux' and v['Architecture']=='arm64' and v['User']=='pwuser' and v['Cmd']==['sh','-c','ulimit -c 0 && exec node dist/main.js'];w('measured-image.json',v)
 if phase=='final-image-own-package-lock-hashes':
  v=json.loads((E/(argv[2]+'.log')).read_text());public=json.loads((O/'public-context.json').read_text());refs={x['path']:x['sha256'] for x in public['members'] if x['kind']=='regular'};assert v=={n:refs[n] for n in ['package.json','package-lock.json']};w('image-own-package-lock.json',v)
 if phase=='final-image-pins01':
  v=json.loads((E/(argv[2]+'.log')).read_text());assert v['ok'] is True and v['failures']==[] and v['notAsserted']==[];w('strict-image-pins.json',v)
 record.update(accepted=True,sourceTestInputDistFullCatalogCache191Protected21CliBrowserEnvStable=True,logSha256=sha(O/(phase+'.log')))
finally:
 if inhibitor:
  record['caffeinateHeldThroughPostguards']=record.get('accepted',False);inhibitor.terminate();record['caffeinateExit']=inhibitor.wait(timeout=10);record['caffeinateReleased']=True;record['caffeinateReleasedAtUtc']=now()
 w(phase+'-terminal.json',record)
print(json.dumps({'id':phase,'pid':record['pid'],'rawExit':record.get('rawExit'),'accepted':record['accepted'],'caffeinatePid':record.get('caffeinatePid'),'caffeinateReleased':record.get('caffeinateReleased')}))
