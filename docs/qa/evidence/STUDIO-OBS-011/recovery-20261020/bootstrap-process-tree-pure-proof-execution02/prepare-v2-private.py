from pathlib import Path
import os,json,subprocess,hashlib,stat,runpy,shutil,datetime
R=Path.cwd();O=Path(__file__).resolve().parent;V2=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/bootstrap-process-tree-lint-correction01';P1=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/bootstrap-process-tree-pure-proof-execution01';S=Path('/private/tmp/obs009-bootstrap-observation-20261020-proof01')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def wj(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
pins={P1/'manifest.json':'164e0745ca70f237406d76cf204bee07d1c58a84658e7a275d095200f970b767',V2/'manifest.json':'0cc11d42cc7431145c288d0dd32e6064193aba3176a0a99d459e1cb91a9467d4',V2/'independent-qa/review.md':'cebf4ab88bbbb3503a8c77b7c26847f1bb4f0ed9c042709284738d1ae1d96a0b',V2/'independent-qa/source-verdict-binding.json':'282a7a7400d66347ed9ac0083d997dbbbfe5337828b6a52b6f17fde565781902',V2/'independent-qa/manifest.json':'ded482dcc29f6d5c7314009a8893500b18c16703882853d1b8a4f6ea999d40ba'}
for p,h in pins.items():assert sha(p)==h
for parent in [P1,V2]:
 for row in json.loads((parent/'manifest.json').read_text())['artifacts']:assert sha(parent/row['path'])==row['sha256']
snap=runpy.run_path(str(P1/'input-snapshot.py'))['snapshot'];initial={n:snap(S/n) for n in ['before-repo','repo']};assert initial==json.loads((P1/'terminal-private-full-snapshots.json').read_text());actual=snap(R);assert actual==json.loads((P1/'actual-terminal-full-selected.json').read_text());assert initial['repo']['dist']['digest']=='e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1'
source=json.loads((V2/'v2-source-bindings.json').read_text());
for row in source['paths']:
 assert sha(S/'repo'/row['path'])==row['v1Sha256']
 if row['actualBeforeExists']:assert sha(R/row['path'])==row['requiredActualBeforeSha256']
 else:assert not (R/row['path']).exists()
for row in json.loads((P1/'terminal-canonical-cli-pins.json').read_text()):assert sha(Path(row['tree'])/'studio-runner/node_modules'/row['relativePath'])==row['sha256']
rtPhase1=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/runner-functional-base-execution01';browser=json.loads((rtPhase1/'browser-input-after-stamps.json').read_text());assert sha(browser['actualExecutablePath'])==browser['actualExecutableSha256']
env=os.environ.copy();env['PATH']='/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin:'+env['PATH'];node=subprocess.run(['node','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip();pnpm=subprocess.run(['pnpm','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip();assert node=='v24.20.0' and pnpm=='10.33.0'
cap=['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'),str(O/'actual-before.json')];r=subprocess.run(cap,cwd=R,env=env,capture_output=True,text=True);(O/'actual-before-capture.log').write_text(r.stdout+r.stderr);assert r.returncode==0
root=json.loads((O/'actual-before.json').read_text());assert root['digest']=='3e1801b434eb8a3a1b096b65bd3701cb76859b5607121c5062631d0377facd4f' and root['dist']['digest']=='698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210'
plan=json.loads((V2/'future-v2-proof-plan.json').read_text());E=R/'docs/qa/evidence/STUDIO-OBS-011/execution'
for command in plan['sequence']:assert not any(E.glob(command['argv'][2]+'*'))
wj('preflight.json',{'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'all123V1ProofArtifactsAnd51V2CandidateArtifactsExact':True,'v2SourceQaVerified':True,'existingCurrentV1GreenFullCatalogExact':True,'beforeCopyUnchanged':True,'actualGlobal':root['digest'],'actualDist':root['dist']['digest'],'private238E19Exact':True,'fixedCliBrowserPinsExact':True,'node':node,'pnpm':pnpm,'allSixFreshLabelsAbsent':True,'newSeedProductBuildProbeSignalsNative':False,'approvalPins':[{'path':str(p.relative_to(R)),'sha256':h} for p,h in pins.items()]})
wj('initial-v1green-private-full-snapshots.json',initial);wj('actual-initial-full-selected.json',actual)
ledger=[]
for row in source['paths']:
 p=S/'repo'/row['path'];assert sha(p)==row['v1Sha256'];src=V2/'red'/row['path'];assert sha(src)==row['v2RedSha256'];shutil.copy2(src,p);assert sha(p)==row['v2RedSha256'];ledger.append({'path':row['path'],'beforeV1GreenSha256':row['v1Sha256'],'afterV2OldSha256':sha(p),'source':str(src.relative_to(R))})
old={n:snap(S/n) for n in ['before-repo','repo']};assert old['before-repo']==initial['before-repo'] and old['repo']['dist']==initial['repo']['dist'];x={r['path']:r for r in initial['repo']['copyProfileFiles']};y={r['path']:r for r in old['repo']['copyProfileFiles']};assert x.keys()==y.keys();changed=[p for p in x if x[p]!=y[p]];assert set(changed)=={r['path'] for r in source['paths']};assert snap(R)==actual
wj('v1green-to-v2old-overlay.json',{'privateOnly':True,'ledger':ledger,'allOtherMembersAndBeforeCopyProduct238Unchanged':True,'actualSourceUntouched':True});wj('v2old-start-full-snapshots.json',old)
wj('runtime-input-binding.json',{'node':node,'pnpm':pnpm,'pathPrefix':env['PATH'].split(':')[0],'canonicalCliReference':str((P1/'terminal-canonical-cli-pins.json').relative_to(R)),'canonicalCliReferenceSha256':sha(P1/'terminal-canonical-cli-pins.json'),'browserProvenance':browser['provenance'],'actualBrowserExecutableRehashed':True,'environment':{k:{'present':k in env,'valueSha256':hashlib.sha256(env[k].encode()).hexdigest() if k in env else None} for k in ['HOME','TMPDIR','PLAYWRIGHT_BROWSERS_PATH','NODE_OPTIONS','NODE_DEBUG','DEBUG','PWDEBUG','GUIDED_CLOSE_BOUND_OUT']},'newLibraryInstallConfigOrProductChange':False,'noRealProbeSignalNative':True})
print(json.dumps({'preflight':True,'overlayPaths':len(ledger),'currentMembers':len(old['repo']['copyProfileFiles']),'privateDist':old['repo']['dist']['digest'],'newSeedOrProductBuild':False}))
