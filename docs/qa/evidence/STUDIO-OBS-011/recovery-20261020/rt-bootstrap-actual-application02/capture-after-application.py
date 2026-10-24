from pathlib import Path
import os,stat,json,hashlib,subprocess,runpy,datetime
R=Path.cwd();B=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020';O=Path(__file__).resolve().parent;P=B/'rt-bootstrap-actual-application-preparation01';S=Path('/private/tmp/obs009-bootstrap-observation-20261020-proof01')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def w(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
binding=json.loads((P/'application-binding.json').read_text());records=[]
for scope,expected in [('code',10),('documentation',2)]:
 path=B/'rt-bootstrap-actual-application01'/(scope+'-application.json');record=json.loads(path.read_text());assert record['status']=='APPLIED_ALL_EXACT_AFTER_HASHES_VERIFIED' and len(record['wrote'])==expected and record['protectedBinDependenciesDistUnchanged'];records.append({'scope':scope,'originalPath':str(path.relative_to(R)),'sha256':sha(path),'status':record['status'],'pathCount':expected})
 for row in binding[scope]:assert sha(R/row['path'])==row['afterSha256'] and oct(stat.S_IMODE((R/row['path']).stat().st_mode))==row['afterMode']
w('original-path-application-receipt-bindings.json',records)
env=os.environ.copy();env['PATH']='/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin:'+env['PATH'];argv=['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'),str(O/'actual-after-application.json')];r=subprocess.run(argv,cwd=R,env=env,capture_output=True,text=True);(O/'actual-after-application-capture.log').write_text(r.stdout+r.stderr);assert r.returncode==0
before=json.loads((O/'actual-before.json').read_text());after=json.loads((O/'actual-after-application.json').read_text());x={r['path']:r for r in before['files']};y={r['path']:r for r in after['files']};delta=[{'path':p,'before':x.get(p),'after':y.get(p)} for p in sorted(x.keys()|y.keys()) if x.get(p)!=y.get(p)];assert {r['path'] for r in delta}=={r['path'] for r in binding['code']};assert len(after['files'])==1814 and after['digest']!=before['digest'];assert after['dist']==before['dist']
snapshot=runpy.run_path(str(B/'bootstrap-process-tree-pure-proof-execution01/input-snapshot.py'))['snapshot'];actual=snapshot(R);prior=json.loads((O/'actual-before-full-catalog.json').read_text());private={n:snapshot(S/n) for n in ['before-repo','repo']};assert private==json.loads((O/'private-before-full-snapshots.json').read_text());x={r['path']:r for r in prior['copyProfileFiles']};y={r['path']:r for r in actual['copyProfileFiles']};catalogDelta=[{'path':p,'before':x.get(p),'after':y.get(p)} for p in sorted(x.keys()|y.keys()) if x.get(p)!=y.get(p)];assert {r['path'] for r in catalogDelta}=={r['path'] for r in binding['code']};assert actual['dist']==prior['dist'];w('actual-after-application-full-catalog.json',actual);w('private-after-application-full-snapshots.json',private)
protected=json.loads((P/'protected-and-tool-source-pins.json').read_text());bins=[]
for p in sorted((R/'studio-runner/node_modules/.bin').iterdir()):
 st=p.lstat();assert stat.S_ISLNK(st.st_mode);bins.append({'path':str(p.relative_to(R)),'target':os.readlink(p),'mode':oct(stat.S_IMODE(st.st_mode)),'device':st.st_dev,'inode':st.st_ino})
assert bins==protected['actualMeasuredBinSymlinks'];w('after-application-21-bin-links.json',bins)
for row in protected['protected']:assert sha(R/row['path'])==row['sha256'] and oct(stat.S_IMODE((R/row['path']).stat().st_mode))==row['mode']
meta=json.loads((O/'runtime-cli-browser-environment.json').read_text())
for row in meta['canonical15Pins']:
 p=Path(row['tree'])/'studio-runner/node_modules'/row['relativePath'];assert sha(p)==row['sha256'] and oct(stat.S_IMODE(p.stat().st_mode))==row['mode']
browser=json.loads(Path(meta['browserRef']['path']).read_text());assert sha(browser['actualExecutablePath'])==meta['browserSha256']
stop=B/'rt-bootstrap-actual-application01/preflight-stop-manifest.json';assert sha(stop)=='8cf236f9cc9c524705cf3e805220de1fec262d7096bf12e5d99d7e76e16c7a93'
for row in json.loads(stop.read_text())['artifacts']:assert sha(stop.parent/row['path'])==row['sha256']
w('application-source-catalog-reconciliation.json',{'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'beforeSourceDigest':before['digest'],'afterSourceDigest':after['digest'],'beforeSourceFiles':len(before['files']),'afterSourceFiles':len(after['files']),'exact10CodeDeltas':delta,'separate2Stories':[{'path':row['path'],'beforeSha256':row['beforeSha256'],'afterSha256':row['afterSha256']} for row in binding['documentation']],'fullActualCatalogDeltas':catalogDelta,'actualDistStillD698':after['dist']['digest'],'actualComplete238DistUnchanged':True,'privateBeforeAndGreenProofCatalogsUnchanged':True,'protectedCliBrowserEnvironmentAnd21LinksPreserved':True,'oldStop3AndSealExact':True,'newActualSourceMeasuredNotForced':True,'sourceFrozenForNextConfiguredBuild':True,'buildExecuted':False})
print(json.dumps({'codeApplied':10,'docsApplied':2,'actualNewSourceDigest':after['digest'],'sourceFileCount':len(after['files']),'actualDistStill':after['dist']['digest'],'allOtherActualInputsAndPrivateProofsStable':True,'readyForOneConfiguredBuild':True}))
