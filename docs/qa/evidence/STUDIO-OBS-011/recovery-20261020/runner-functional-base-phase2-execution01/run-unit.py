from pathlib import Path
import json,hashlib,os,runpy,subprocess,datetime,shutil,stat
R=Path.cwd();O=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/runner-functional-base-phase2-execution01';P1=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/runner-functional-base-execution01';P=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/runner-functional-base-successor-preparation';S=Path('/private/tmp/obs011-rt-functional-base-20261020-root01');E=R/'docs/qa/evidence/STUDIO-OBS-011/execution';C='studio-runner/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def wj(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
pins={'root-measured-emit-disposition.json':'899e3b66ba46164bead693d157b78a8fb4cb605f7e761e27e70257e5dcfc07b5','receipt.md':'b45e6920c1eb2fa66890158727c7fdeb01f9b783bd9aaf5aa5c640eba2e6227d','manifest.json':'0c7197e087fe3b0d56c2053a5e57e5059414375f778a25e7f345aafd24127711','phase1-final-bindings.json':'da9591b79ab1e23b1e6f38d9438a8f1a11c87a69561b18e66a86bec75f2bfb25','fresh-copy-catalog.json':'2624360a76136f37b4e1bc267734eb1954aff16fbd54e56984356ed192eb33a2'}
for n,h in pins.items():assert sha(P1/n)==h
for r in json.loads((P1/'manifest.json').read_text())['artifacts']:assert sha(P1/r['path'])==r['sha256'],r['path']
snap=runpy.run_path(str(P1/'input-snapshot.py'))['snapshot'];start={n:snap(S/n) for n in ['before-repo','repo']};actual=snap(R);baseline=json.loads((P1/'private-terminal-full-snapshots.json').read_text());assert start==baseline;assert actual==json.loads((P1/'actual-selected-after-runtime.json').read_text())
assert start['repo']['dist']['digest']=='e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1'
binding=json.loads((P/'candidate/copy-back-binding.json').read_text())
for r in binding['businessPredecessors']+binding['carriedUntouched']:
 for root in [R,S/'before-repo',S/'repo']:assert sha(root/r['path'])==r['sha256']
for r in binding['paths']:assert sha(R/r['path'])==r['beforeSha256'] and sha(S/'repo'/r['path'])==r['afterSha256']
for r in json.loads((P1/'canonical-cli-final-pins.json').read_text()):assert sha(Path(r['tree'])/'studio-runner/node_modules'/r['relativePath'])==r['sha256']
browser=json.loads((P1/'browser-input-after-stamps.json').read_text());assert sha(browser['actualExecutablePath'])==browser['actualExecutableSha256']
integ=json.loads((R/'docs/qa/evidence/STUDIO-OBS-009/recovery-20261020/business-and-status-integration01/nine-target-application-binding.json').read_text());assert all(sha(r['path'])==r['actualAfterSha256'] for r in integ['rows'])
assert sha(R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/runner-final-current-plan/root-generated-cache-disposition.json')=='07d47a3b7d1d06fb1fe1de23d26ea05085b21de13edaf15cdf8027fd43b63f00'
wj('preflight.json',{'rootNewDispositionVerified':True,'phase1All1085ArtifactsExact':True,'bothPrivateCatalogsExactlyEqualPhase1Terminal':True,'actualSelectedCatalogExact':True,'allNineActualIntegratedTargetBytesExact':True,'fourBusinessIdenticalBothBases':True,'newProtected18Exact':True,'sevenRtAfterExact':True,'canonicalCliBrowserPinsExact':True,'pins':pins,'atUtc':now()})
wj('private-before-unit-full-snapshots.json',start);wj('actual-before-unit-full-selected.json',actual);(O/'generated-cache').mkdir();shutil.copy2(S/'repo'/C,O/'generated-cache/unit-before.json')
c=next(c for c in json.loads((P/'commands-successor.json').read_text())['commands'] if c['id']=='unit01');argv=c['argv'];label=argv[2];assert not any(E.glob(label+'*'))
env=os.environ.copy();env['PATH']='/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin:'+env['PATH'];record={'argv':argv,'cwd':str(R),'startedAtUtc':now()}
with (O/'unit-collector.log').open('w') as log:
 p=subprocess.Popen(argv,cwd=R,env=env,stdout=log,stderr=subprocess.STDOUT);record['collectorPid']=p.pid;wj('unit-start.json',record);code=p.wait()
record.update(outerExit=code,endedAtUtc=now());record['collectorResult']=json.loads((E/(label+'-results.json')).read_text());wj('unit-terminal.json',record)
after={n:snap(S/n) for n in ['before-repo','repo']};actualafter=snap(R);wj('private-after-unit-full-snapshots.json',after);wj('actual-after-unit-full-selected.json',actualafter);shutil.copy2(S/'repo'/C,O/'generated-cache/unit-after.json')
assert actualafter==actual;assert after['before-repo']==start['before-repo'];assert after['repo']['dist']==start['repo']['dist']
x={r['path']:r for r in start['repo']['copyProfileFiles']};y={r['path']:r for r in after['repo']['copyProfileFiles']};assert x.keys()==y.keys();delta=[{'path':k,'before':x[k],'after':y[k]} for k in x if x[k]!=y[k]];assert {r['path'] for r in delta}<={C}
bc=json.loads((O/'generated-cache/unit-before.json').read_text());ac=json.loads((O/'generated-cache/unit-after.json').read_text());assert set(bc)==set(ac)=={'version','results'} and bc['version']==ac['version']=='3.2.7';b=dict(bc['results']);a=dict(ac['results']);assert len(b)==len(a)==190 and b.keys()==a.keys();assert all(set(v)=={'duration','failed'} and isinstance(v['duration'],(int,float)) and isinstance(v['failed'],bool) for v in list(a.values())+list(b.values()))
wj('unit-generated-cache-delta.json',{'exactRootAcceptedPath':C,'rootDisposition':'07d47a3b7d1d06fb1fe1de23d26ea05085b21de13edaf15cdf8027fd43b63f00','delta':delta,'sameMembership':True,'version':'3.2.7','same190KeyMultiset':True,'durationFailedFieldsOnly':True,'beforeSha256':sha(O/'generated-cache/unit-before.json'),'afterSha256':sha(O/'generated-cache/unit-after.json'),'fullCatalogUnchanged':not delta})
print(json.dumps({'unitOuterExit':code,'collectorResult':record['collectorResult'],'generatedCacheOnlyDelta':True,'same190Keys':True,'actualAndDistStable':True,'unitReport':str(E/(label+'-vitest.json'))}));assert code==0
