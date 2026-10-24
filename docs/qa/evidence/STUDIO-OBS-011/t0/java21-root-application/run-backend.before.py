from pathlib import Path
import subprocess,sys,os,time,datetime,json,hashlib,shutil,xml.etree.ElementTree as ET
root=Path.cwd();label=sys.argv[1];args=sys.argv[2:];exclusion=None
if args and args[0]=='--source-exclusions': exclusion=json.loads(Path(args[1]).read_text());args=args[2:]
excluded=set(exclusion['paths']) if exclusion else set()
out=root/'docs/qa/evidence/STUDIO-OBS-011/execution';manifest=root/'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'
subprocess.run([sys.executable,str(manifest),str(out/f'{label}-before.json')],check=True)
started=time.time();env=dict(os.environ,JAVA_HOME='/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home');command=['caffeinate','-i','./gradlew',*args]
with (out/f'{label}.log').open('w') as log: run=subprocess.run(command,cwd=root/'backend',env=env,stdout=log,stderr=subprocess.STDOUT)
xmlout=out/f'{label}-xml';xmlout.mkdir(exist_ok=True);counts={'total':0,'passed':0,'failed':0,'errors':0,'skipped':0};tests=[];xml=[]
for p in sorted((root/'backend/build/test-results/test').glob('TEST-*.xml')):
 if p.stat().st_mtime < started: continue
 target=xmlout/p.name;shutil.copy2(p,target);s=ET.parse(p).getroot()
 for k,a in [('total','tests'),('failed','failures'),('errors','errors'),('skipped','skipped')]:counts[k]+=int(s.attrib.get(a,0))
 for t in s.iter('testcase'):tests.append({'class':t.attrib.get('classname'),'name':t.attrib['name'],'status':'FAIL' if t.find('failure') is not None or t.find('error') is not None else 'SKIP' if t.find('skipped') is not None else 'PASS'})
 xml.append({'path':str(target.relative_to(root)),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
counts['passed']=counts['total']-counts['failed']-counts['errors']-counts['skipped']
guards=[]
for p in sorted((root/'backend/build/guard-tally').glob('*.json')):
 if p.stat().st_mtime < started: continue
 target=out/f'{label}-guard-tally'/p.name;target.parent.mkdir(exist_ok=True);shutil.copy2(p,target);guards.append({'path':str(target.relative_to(root)),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
subprocess.run([sys.executable,str(manifest),str(out/f'{label}-after.json')],check=True)
before=json.loads((out/f'{label}-before.json').read_text());after=json.loads((out/f'{label}-after.json').read_text());d={'command':command,'cwd':'backend','JAVA_HOME':env['JAVA_HOME'],'started':datetime.datetime.fromtimestamp(started,datetime.timezone.utc).isoformat(),'elapsedSeconds':round(time.time()-started,2),'exit':run.returncode,'counts':counts,'testcases':tests,'xmlFiles':xml,'guardTallies':guards,'logSha256':hashlib.sha256((out/f'{label}.log').read_bytes()).hexdigest(),'sourceStable':before['digest']==after['digest'],'distStable':before.get('dist',{}).get('digest')==after.get('dist',{}).get('digest')}
scopedBefore=[f for f in before['files'] if f['path'] not in excluded];scopedAfter=[f for f in after['files'] if f['path'] not in excluded]
d['testInputStable']=scopedBefore==scopedAfter;d['testInputDigestBefore']=hashlib.sha256(json.dumps(scopedBefore,separators=(',',':')).encode()).hexdigest();d['testInputDigestAfter']=hashlib.sha256(json.dumps(scopedAfter,separators=(',',':')).encode()).hexdigest()
if exclusion:
 d['explicitDisjointValidationExclusions']=exclusion
 d['excludedFileChanges']=[{'path':path,'before':next((f['sha256'] for f in before['files'] if f['path']==path),None),'after':next((f['sha256'] for f in after['files'] if f['path']==path),None)} for path in sorted(excluded)]
(out/f'{label}-results.json').write_text(json.dumps(d,indent=2)+'\n');print(json.dumps({k:d[k] for k in ['exit','counts','sourceStable','testInputStable','distStable','elapsedSeconds']}));raise SystemExit(run.returncode if run.returncode else 0 if d['testInputStable'] and d['distStable'] else 2)
