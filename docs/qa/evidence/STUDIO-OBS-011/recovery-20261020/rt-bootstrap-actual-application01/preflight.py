from pathlib import Path
import os,stat,json,hashlib,subprocess,runpy,datetime
R=Path.cwd();B=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020';O=Path(__file__).resolve().parent;P=B/'rt-bootstrap-actual-application-preparation01';N=B/'bootstrap-process-tree-native-six-execution02';S=Path('/private/tmp/obs009-bootstrap-observation-20261020-proof01')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def w(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
assert not (O/'preflight.json').exists();admission=B/'rt-bootstrap-actual-root-admission01.json';assert sha(admission)=='518c65f7d05f557053dc73fe5a268645161f02141a5db85c736fe9beec1865fc';a=json.loads(admission.read_text());assert a['authorized'] and a['exclusiveActualSourceWindowAccepted'] and a['singleHeavyLaneOwner']=='gateway_implementation'
for key in ['preparation','applicationBinding','tenCodePins','applyScript','buildPlan','protectedAndToolPins','nativeProducer','nativeQa','rootQualifiedComposition','pureProducer','pureQa']:assert sha(a[key]['path'])==a[key]['sha256'],key
for parent in [P,N,B/'bootstrap-owned-scope-pure-proof-execution02']:
 for row in json.loads((parent/'manifest.json').read_text())['artifacts']:assert sha(parent/row['path'])==row['sha256']
binding=json.loads((P/'application-binding.json').read_text());assert [r['path'] for r in binding['code']]==a['declaredCodePaths'];assert [r['path'] for r in binding['documentation']]==a['separateDocumentationPaths']
for row in binding['code']+binding['documentation']:
 p=R/row['path'];assert os.path.lexists(p)==row['beforeExists']
 if row['beforeExists']:assert stat.S_ISREG(p.lstat().st_mode) and sha(p)==row['beforeSha256'] and oct(stat.S_IMODE(p.stat().st_mode))==row['beforeStat']['mode']
 assert sha(P/row['stagedAfter'])==row['afterSha256']
for row in binding['code']:assert sha(S/'repo'/row['path'])==row['afterSha256']
protected=json.loads((P/'protected-and-tool-source-pins.json').read_text())
for row in protected['protected']:assert sha(R/row['path'])==row['sha256'] and oct(stat.S_IMODE((R/row['path']).stat().st_mode))==row['mode']
bins=[]
for p in sorted((R/'studio-runner/node_modules/.bin').iterdir()):
 st=p.lstat();assert stat.S_ISLNK(st.st_mode);bins.append({'path':str(p.relative_to(R)),'target':os.readlink(p),'mode':oct(stat.S_IMODE(st.st_mode)),'device':st.st_dev,'inode':st.st_ino})
assert bins==protected['actualMeasuredBinSymlinks'] and len(bins)==21;w('before-21-bin-links.json',bins)
cli=json.loads((N/'canonical-cli-pins.json').read_text())
for row in cli:
 p=Path(row['tree'])/'studio-runner/node_modules'/row['relativePath'];assert sha(p)==row['sha256'] and oct(stat.S_IMODE(p.stat().st_mode))==row['mode']
nativeAdmission=json.loads((B/'bootstrap-native-six02-root-admission.json').read_text());browserRef=nativeAdmission['references']['browserInput'];assert sha(browserRef['path'])==browserRef['sha256'];browser=json.loads(Path(browserRef['path']).read_text());assert sha(browser['actualExecutablePath'])==browser['actualExecutableSha256'];runtimeRef=nativeAdmission['references']['runtimeInputBinding'];assert sha(runtimeRef['path'])==runtimeRef['sha256'];runtime=json.loads(Path(runtimeRef['path']).read_text());env=os.environ.copy();env['PATH']='/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin:'+env['PATH'];envPins={k:{'present':k in env,'valueSha256':hashlib.sha256(env[k].encode()).hexdigest() if k in env else None} for k in runtime['environment']};assert envPins==runtime['environment']
node=subprocess.run(['node','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip();pnpm=subprocess.run(['pnpm','--config.package-manager-strict=false','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip();assert node=='v24.20.0' and pnpm=='10.33.0';w('runtime-cli-browser-environment.json',{'node':node,'pnpm':pnpm,'nodePathPrefix':env['PATH'].split(':')[0],'canonical15Pins':cli,'browserRef':browserRef,'browserSha256':browser['actualExecutableSha256'],'browserProvenance':browser['provenance'],'environment':envPins})
plan=json.loads((P/'matching-actual-build-plan.json').read_text());label=plan['argv'][2];E=R/'docs/qa/evidence/STUDIO-OBS-011/execution';assert not any(E.glob(label+'*'))
cap=['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'),str(O/'actual-before.json')];r=subprocess.run(cap,cwd=R,env=env,capture_output=True,text=True);(O/'actual-before-capture.log').write_text(r.stdout+r.stderr);assert r.returncode==0;root=json.loads((O/'actual-before.json').read_text());assert root['digest']==a['actualSourceBefore'] and len(root['files'])==1812 and root['dist']['digest']==a['actualDistBefore'] and len(root['dist']['files'])==238
snapshot=runpy.run_path(str(B/'bootstrap-process-tree-pure-proof-execution01/input-snapshot.py'))['snapshot'];actual=snapshot(R);assert actual==json.loads((N/'actual-after-fixtures-full-selected.json').read_text());private={n:snapshot(S/n) for n in ['before-repo','repo']};assert private==json.loads((N/'private-after-fixtures-full-snapshots.json').read_text());w('actual-before-full-catalog.json',actual);w('private-before-full-snapshots.json',private)
w('preflight.json',{'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rootAdmissionSha256':sha(admission),'prep36Native36Pure117Verified':True,'nativeQaAndQualifiedRootCompositionVerified':True,'tenCodeAndTwoStoryPreimagesModeRegularityExact':True,'eightExistingTwoLexicallyAbsent':True,'privateAfterTenSourcesAndComplete238E19Exact':True,'actualSource':root['digest'],'actualSourceFiles':1812,'actualDist':root['dist']['digest'],'actualDistFiles':238,'beforeAndActualFullCatalogsExactAcceptedBaselines':True,'actual21LinksTargetsModesInodesExact':True,'protectedDirtyGovernancePackageConfigReplayExact':True,'aiNotTraversedOrTouched':True,'node':node,'pnpm':pnpm,'browserEnvironmentAnd15CliPinsExact':True,'buildLabelFresh':True,'actualSourceMutationSoFar':False})
print(json.dumps({'preflight':True,'actualBeforeSource':root['digest'],'actualDist':root['dist']['digest'],'codePaths':10,'docs':2,'binLinks':21,'privateE19Exact':True,'node':node,'pnpm':pnpm}))
