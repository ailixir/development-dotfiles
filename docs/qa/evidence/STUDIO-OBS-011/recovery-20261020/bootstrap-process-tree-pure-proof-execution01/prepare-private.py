from pathlib import Path
import hashlib,json,subprocess,os,datetime,shutil,stat
R=Path.cwd();O=Path(__file__).resolve().parent;C=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/bootstrap-process-tree-observation-candidate';H=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/runner-functional-base-successor-preparation';P1=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/runner-functional-base-execution01';S=Path('/private/tmp/obs009-bootstrap-observation-20261020-proof01')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def wj(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
assert not S.exists()
pins={C/'manifest.json':'fd551c25e85ce02af8aab375358674c47104dd5850518af08adbf4d0bbe3520b',C/'application-binding-unexecuted.json':'3b4ae8ada2cb514448aba692ab0e96658825885f3ab8b2243c8162bdd6fcace8',C/'independent-qa/review.md':'ff2294c289f0fa13b406ee97ed26f1988139207af7e5a5be753c6ab4f1652358',C/'independent-qa/source-verdict-binding.json':'f40ef825d33f6145abc518697d6708486212b3c215b9e528622ef3d87d930abc',C/'independent-qa/manifest.json':'9f2a3f18a9fbe0d6520a6d82f48ae26950391aec91d2122e733bc599892b6c08',H/'candidate/prepare-current-sandbox.py':'e38a3fd99798d55d2e46bb2fb1ce0d4c3b9a4b799f5d0c8cfdc16d79af5edaef',H/'candidate/copy-back-binding.json':'95427bbdaf0cc709d50341a7c9d2f7d5e223c56ff54bc6c48ec2e52f7a2cf621'}
for p,h in pins.items():assert sha(p)==h,(p,sha(p))
for r in json.loads((C/'manifest.json').read_text())['artifacts']:assert sha(C/r['path'])==r['sha256']
binding=json.loads((C/'application-binding-unexecuted.json').read_text())
for r in binding['paths']:
 p=R/r['path']
 if r['beforeExists']:assert sha(p)==r['beforeSha256']
 else:assert not p.exists()
 assert sha(R/r['redCandidatePath'])==r['redSha256'] and sha(R/r['candidatePath'])==r['afterSha256']
carry=json.loads((H/'selftest-carry.json').read_text())
for r in carry['checkerFixtureAllowanceAndBeforeSourceBindings']:assert sha(R/r['path'])==r['sha256']
for r in carry['dependencyAndCanonicalCliIdentity']:
 p=R/'studio-runner/node_modules'/r['relativePath'];assert sha(p)==r['actualSha256'] and oct(stat.S_IMODE(p.stat().st_mode))==r['mode']
assert sha(R/carry['carry']['resultsPath'])==carry['carry']['resultsSha256']
env=os.environ.copy();env['PATH']='/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin:'+env['PATH'];env['OBS011_RT_FINAL_COMPOSITION']='ALL_PREDECESSORS_APPLIED_LANE_IDLE'
node=subprocess.run(['node','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip();pnpm=subprocess.run(['pnpm','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip();assert node=='v24.20.0' and pnpm=='10.33.0'
capture=['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'),str(O/'actual-before.json')];r=subprocess.run(capture,cwd=R,env=env,capture_output=True,text=True);(O/'actual-before-capture.log').write_text(r.stdout+r.stderr);assert r.returncode==0
actual=json.loads((O/'actual-before.json').read_text());assert actual['digest']=='3e1801b434eb8a3a1b096b65bd3701cb76859b5607121c5062631d0377facd4f' and actual['dist']['digest']=='698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210' and len(actual['dist']['files'])==238
wj('preflight.json',{'atUtc':now(),'sourceQaAccepted':True,'all42CandidateArtifactsExact':True,'actual3PreimagesOrAbsencesExact':True,'sourceActualDigest':actual['digest'],'actualDistDigest':actual['dist']['digest'],'freshDestinationAbsent':True,'node':node,'pnpm':pnpm,'approvalPins':[{'path':str(p.relative_to(R)),'sha256':h} for p,h in pins.items()],'resourceOrNativeGo':False})
helper=str(H/'candidate/prepare-current-sandbox.py');catalog=O/'fresh-copy-catalog.json';argv=['python3',helper,str(R),'capture',str(catalog)];r=subprocess.run(argv,cwd=R,env=env,capture_output=True,text=True);(O/'catalog-capture.log').write_text(r.stdout+r.stderr);wj('catalog-capture-command.json',{'argv':argv,'exit':r.returncode});assert r.returncode==0
fresh=sha(catalog);rows=json.loads(catalog.read_text())['files'];seed=['python3',helper,str(R),'seed',str(catalog),fresh,str(S)]
with (O/'seed.log').open('w') as log:
 p=subprocess.Popen(seed,cwd=R,env=env,stdout=log,stderr=subprocess.STDOUT);wj('seed-start.json',{'argv':seed,'pid':p.pid,'startedAtUtc':now(),'newMeasuredCatalogSha256':fresh,'files':len(rows)});code=p.wait()
wj('seed-terminal.json',{'exit':code,'endedAtUtc':now()});assert code==0;shutil.copy2(S/'seed-receipt.json',O/'seed-receipt.json')
# Existing metadata inventory logic; only its output directory (__file__) and unused sandbox literal change.
snapshot=(P1/'input-snapshot.py').read_text().replace('/private/tmp/obs011-rt-functional-base-20261020-root01',str(S));(O/'input-snapshot.py').write_text(snapshot)
import runpy
snap=runpy.run_path(str(O/'input-snapshot.py'))['snapshot'];initial={n:snap(S/n) for n in ['before-repo','repo']};actualSelected=snap(R);wj('initial-seeded-private-full-snapshots.json',initial);wj('actual-initial-full-selected.json',actualSelected)
assert initial['before-repo']['copyProfileFiles']==rows
for root in [S/'before-repo',S/'repo']:
 assert not any(p.is_symlink() for p in root.rglob('*'))
 for r in carry['dependencyAndCanonicalCliIdentity']:
  p=root/'studio-runner/node_modules'/r['relativePath'];assert sha(p)==r['actualSha256'] and oct(stat.S_IMODE(p.stat().st_mode))==r['mode']
ledger=[]
for r in binding['paths']:
 p=S/'repo'/r['path'];src=R/r['redCandidatePath']
 if r['beforeExists']:assert sha(p)==r['beforeSha256']
 else:assert not p.exists()
 p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,p);assert sha(p)==r['redSha256'];ledger.append({'path':r['path'],'beforeExists':r['beforeExists'],'beforeSha256':r['beforeSha256'],'redSha256':sha(p),'source':r['redCandidatePath']})
red={n:snap(S/n) for n in ['before-repo','repo']};assert red['before-repo']==initial['before-repo'];x={r['path']:r for r in initial['repo']['copyProfileFiles']};y={r['path']:r for r in red['repo']['copyProfileFiles']};assert {p for p in x.keys()|y.keys() if x.get(p)!=y.get(p)}=={r['path'] for r in binding['paths']};wj('red-overlay-ledger.json',ledger);wj('red-start-full-snapshots.json',red)
wj('rt-proof-scoped-successor-binding.json',{'state':'UNCHANGED_RT_CARRY_EXACT_PINS_WITH_EXPLICIT_009_TEST_DELTA','priorPhase1Manifest':'0c7197e087fe3b0d56c2053a5e57e5059414375f778a25e7f345aafd24127711','priorRootEmitDisposition':'899e3b66ba46164bead693d157b78a8fb4cb605f7e761e27e70257e5dcfc07b5','eightCheckerControlsCarriedExact':True,'checkerFixtureAllowanceAndBeforeSourceBindings':carry['checkerFixtureAllowanceAndBeforeSourceBindings'],'canonicalCliTsPins':carry['dependencyAndCanonicalCliIdentity'],'newMeasuredCatalogSha256':fresh,'newMeasuredActualCatalogFiles':len(rows),'privateRedCatalogFiles':len(red['repo']['copyProfileFiles']),'three009TestTierOverlay':ledger,'noOriginalFixtureHashForcedAfterExplicitOverlay':True,'sharedProductionConfigDependenciesUnchanged':True,'freshProduct238Binding':'PENDING_BUILD_AND_STAMP','beforeCompileAstMatrixRerun':False,'nativeGo':False})
wj('runtime-and-browser-inputs.json',{'node':node,'pnpm':pnpm,'pathPrefix':env['PATH'].split(':')[0],'browser':json.loads((P1/'browser-input-after-stamps.json').read_text())['provenance'],'environment':{k:{'present':k in env,'valueSha256':hashlib.sha256(env[k].encode()).hexdigest() if k in env else None} for k in ['HOME','TMPDIR','PLAYWRIGHT_BROWSERS_PATH','NODE_OPTIONS','NODE_DEBUG','DEBUG','PWDEBUG','GUIDED_CLOSE_BOUND_OUT']},'canonicalPins':carry['dependencyAndCanonicalCliIdentity'],'realProcessProbeSignalsNative':False})
print(json.dumps({'seedExit':0,'freshCatalogSha256':fresh,'measuredInitialFiles':len(rows),'redAfterFiles':len(red['repo']['copyProfileFiles']),'seedReceiptSha256':sha(O/'seed-receipt.json'),'redOverlayPaths':len(ledger),'actualSource':actual['digest'],'actualDist':actual['dist']['digest']}))
