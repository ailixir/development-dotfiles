from pathlib import Path
import os,json,hashlib,runpy,subprocess,datetime,math
R=Path.cwd();O=Path(__file__).resolve().parent;B=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020';C=B/'bootstrap-owned-scope-optional-chain-correction01';N=B/'bootstrap-process-tree-native-six-execution01';F=B/'bootstrap-owned-scope-pure-proof-execution01';P1=B/'bootstrap-process-tree-pure-proof-execution01';S=Path('/private/tmp/obs009-bootstrap-observation-20261020-proof01');cache='studio-runner/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def w(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
assert not (O/'preflight.json').exists()
pins={B/'bootstrap-owned-scope-pure-root-admission02.json':'e896bdda02de3fc8ec015a8378e674f1df70a2353ed2ec7af81b7627108c1088',C/'manifest.json':'c981f1669c1749e282122a81f2a8a5748e9edbd9f91d3c73aa28e7cb0156c888',C/'independent-qa/review.md':'b441cba049e3578e48a0bc3a3f6caf6fe93a2fafd57a72726b48c3b7e64ae395',C/'independent-qa/readiness.json':'c2c4239c79cab2174acc42cad6c5f1f189c6a7a3fb85ba390ca87837ad67b375',C/'independent-qa/manifest.json':'cf2c30ce75909fe41ce80db244ca30dbd52f73aaba9efea098787505aed62e63',N/'manifest.json':'10ac0d966288a4d0eeb53ee0debad6dfaf39ea3684e70fc8d3e599e153d83220'}
for p,h in pins.items():assert sha(p)==h
for parent in [C,N,F]:
 for row in json.loads((parent/'manifest.json').read_text())['artifacts']:assert sha(parent/row['path'])==row['sha256']
admission=json.loads((B/'bootstrap-owned-scope-pure-root-admission02.json').read_text());assert admission['authorized']
for k in ['resourceQa','priorPartialProof','priorPartialProofQa']:assert sha(admission[k]['path'])==admission[k]['sha256']
assert json.loads((C/'independent-qa/readiness.json').read_text())['legacyEsrchSourceApiCarry']
snap=runpy.run_path(str(P1/'input-snapshot.py'))['snapshot'];initial={n:snap(S/n) for n in ['before-repo','repo']};assert initial==json.loads((F/'terminal-private-full-snapshots.json').read_text());actual=snap(R);assert actual==json.loads((F/'actual-terminal-full-selected.json').read_text());assert len(initial['repo']['copyProfileFiles'])==13995 and len(initial['before-repo']['copyProfileFiles'])==13993 and initial['repo']['dist']['digest']=='e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1'
bindings=json.loads((C/'buffer-and-patch-bindings.json').read_text())['files']
for row in bindings:assert sha(S/'repo'/row['path'])==row['currentPrivateBeforeSha256']
cli=json.loads((N/'canonical-cli-pins.json').read_text())
for row in cli:
 p=Path(row['tree'])/'studio-runner/node_modules'/row['relativePath'];assert sha(p)==row['sha256'] and oct(p.stat().st_mode&0o777)==row['mode']
browser=json.loads((B/'runner-functional-base-execution01/browser-input-after-stamps.json').read_text());assert sha(browser['actualExecutablePath'])==browser['actualExecutableSha256']
env=os.environ.copy();env['PATH']='/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin:'+env['PATH'];node=subprocess.run(['node','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip();pnpm=subprocess.run(['pnpm','--config.package-manager-strict=false','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip();assert node=='v24.20.0' and pnpm=='10.33.0';assert 'GUIDED_CLOSE_BOUND_OUT' not in env
oldenv=json.loads((N/'fixture-host-and-environment.json').read_text())['environment'];envpins={k:{'present':k in env,'valueSha256':hashlib.sha256(env[k].encode()).hexdigest() if k in env else None} for k in oldenv};assert envpins==oldenv
cachevalue=json.loads((S/'repo'/cache).read_text());assert cachevalue['version']=='3.2.7' and len(cachevalue['results'])==191 and len(set(k for k,_ in cachevalue['results']))==191;assert dict(cachevalue['results'])[':test/fixtures-tier/observed-bootstrap-process-tree.test.ts']['failed'] is True
for _,v in cachevalue['results']:assert set(v)=={'duration','failed'} and type(v['failed']) is bool and type(v['duration']) in (int,float) and math.isfinite(v['duration']) and v['duration']>=0
plan=json.loads((C/'future-controlled-proof-plan.json').read_text());E=R/'docs/qa/evidence/STUDIO-OBS-011/execution'
for command in plan['sequence']:assert not any(E.glob(command['argv'][2]+'*'))
cap=['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'),str(O/'actual-before.json')];r=subprocess.run(cap,cwd=R,env=env,capture_output=True,text=True);(O/'actual-before-capture.log').write_text(r.stdout+r.stderr);assert r.returncode==0
root=json.loads((O/'actual-before.json').read_text());assert root['digest']=='3e1801b434eb8a3a1b096b65bd3701cb76859b5607121c5062631d0377facd4f' and root['dist']['digest']=='698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210'
w('initial-partial-green-private-full-snapshots.json',initial);w('actual-initial-full-selected.json',actual);w('runtime-input-binding.json',{'node':node,'pnpm':pnpm,'environment':envpins,'canonical15Pins':cli,'browserExecutableSha256':browser['actualExecutableSha256'],'browserProvenance':browser['provenance'],'newSeedProductEmitNativeProbe':False})
w('preflight.json',{'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'admissionPins':[{'path':str(p.relative_to(R)),'sha256':h} for p,h in pins.items()],'candidate29Native31Partial50ArtifactsVerified':True,'priorPartialQaAndLaneReleaseVerified':True,'sourceQaLegacyCarry':True,'private13995Before13993Exact':True,'actual3eD698Exact':True,'private238E19Exact':True,'allSixLabelsFresh':True,'node':node,'pnpm':pnpm,'cache191OrderedUniqueNativeFailedTrue':True})
patch=C/'private4737-to-newgreen.patch';argv=['patch','-p1','-F','0','--batch','--forward','-i',str(patch)];r=subprocess.run(argv,cwd=S/'repo',capture_output=True,text=True);(O/'green-overlay-patch.log').write_text(r.stdout+r.stderr);assert r.returncode==0 and 'offset' not in r.stdout and 'fuzz' not in r.stdout
for row in bindings:assert sha(S/'repo'/row['path'])==row['greenSha256']
green={n:snap(S/n) for n in ['before-repo','repo']};assert green['before-repo']==initial['before-repo'] and green['repo']['dist']==initial['repo']['dist'];x={r['path']:r for r in initial['repo']['copyProfileFiles']};y={r['path']:r for r in green['repo']['copyProfileFiles']};assert x.keys()==y.keys();delta=[{'path':k,'before':x[k],'after':y[k]} for k in x if x[k]!=y[k]];assert {r['path'] for r in delta}=={'studio-runner/test/helpers/bootstrapProcessTreeObservation.ts'};assert snap(R)==actual
w('green-overlay-application.json',{'argv':argv,'exit':r.returncode,'patchSha256':sha(patch),'changedRows':delta,'allOtherRowsBeforeCopyProductActualExact':True});w('green-start-full-snapshots.json',green)
print(json.dumps({'preflight':True,'greenOverlayHelperOnly':1,'node':node,'pnpm':pnpm,'privateMembers':13995,'private238E19Exact':True,'actual3eD698Exact':True}))
