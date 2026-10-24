from pathlib import Path
import ast,datetime,errno,fcntl,hashlib,json,os,stat,sys
D=Path(__file__).resolve().parent;R=D.parents[6];T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';U=T/'runtime/gst-restricted-unit06'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();read=lambda p:json.loads(p.read_text())
def new(p,x):
 with p.open('x') as f:json.dump(x,f,indent=2);f.write('\n')
 os.chmod(p,0o600)
assert sys.argv[1]=='0' and len(sys.argv[2])>0
A=read(D/'root-actual-unit-release.json');pin=read(D/'active-lock.json');ready=read(D/'preunlock-verification.json');permit=read(D/'unlock-permit.json')
assert ready['expectedWrapperExit']==permit['expectedWrapperExit']==0
assert ready['source']['disposition']=='RETAIN_AUTHORIZED_THREE' and permit['retainThreeAuthorized'] is True
assert permit['readinessSha256']==h(D/'preunlock-verification.json') and ready['rootReleaseSha256']==permit['rootReleaseSha256']==h(D/'root-actual-unit-release.json')
assert ready['gaps']==permit['gaps']==[] and ready['retroactiveRepairClaim'] is False
for name,v in ready['evidencePins'].items():assert h(U/name if name=='original-modes.json' else D/name)==v
core=T/'early/fullcheck-harness/resume3/harness.py';assert h(core)=='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
names={'sha','utc','regular','capture','pid_text','table','identity','project_role','boundary_inventory'};nodes=[n for n in ast.parse(core.read_text()).body if isinstance(n,(ast.Import,ast.ImportFrom)) or isinstance(n,ast.FunctionDef) and n.name in names];s={};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<postclose-readonly>','exec'),s);s['ROOT']=R
pp=T/'early/fullcheck-harness/resume3/plan.json';assert h(pp)=='576ebf9f01c0025cacc3bc6c7d6f4c747f8f84bb1f118a547cf11e21f7c94673';plan=read(pp)
expected={x['path']:x['sha256'] for x in plan['source']['files']};assert set(ready['source']['overrides'])=={x['file'] for x in A['writers']};expected.update(ready['source']['overrides']);modes=read(U/'original-modes.json');assert set(modes)==set(expected)
paths=s['capture'](['git','-C',str(R),'ls-files','--cached','--others','--exclude-standard','-z','--',*plan['captureScope']]).split('\0');actual=sorted({p for p in paths if p and (R/p).is_file() and '.claude' not in Path(p).parts});assert set(actual)==set(expected) and len(actual)==1808
for name in actual:assert not (R/name).is_symlink() and h(R/name)==expected[name] and stat.S_IMODE((R/name).stat().st_mode)==modes[name]
files=[{'path':n,'sha256':expected[n]} for n in actual];digest=hashlib.sha256(json.dumps(files,separators=(',',':')).encode()).hexdigest();assert digest==ready['source']['digest']
dist=R/'studio-runner/dist';got=[{'path':str(p.relative_to(dist)),'sha256':h(p)} for p in sorted(dist.rglob('*')) if p.is_file()];assert got==plan['source']['dist']['files'] and len(got)==238
for g in ['helm','quotedCurrent','immutableHelpers']:assert all(h(R/n)==v for n,v in plan[g].items())
bound=s['boundary_inventory'](plan);assert len(bound['inheritedMatched'])==6 and not any(bound[k] for k in ['inheritedIdentityChanged','incompleteStableIdentities','otherProjectFacts'])
rows=s['table']();owned=ready['resources']['recordedOwned'];assert len(owned)==10 and all(rows.get(x['pid'],{}).get('start')!=x['start'] for x in owned)
for k in ['wrapper','shell']:assert rows.get(pin[k+'Pid'],{}).get('start')!=pin[k+'Start']
lock=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock';assert h(lock.with_name('with-gradle-lock.py'))==A['lockWrapperSha256'];fd=os.open(lock,os.O_RDONLY|os.O_NOFOLLOW)
try:
 st=os.fstat(fd);assert [st.st_dev,st.st_ino]==pin['lockDevInode'];fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);fcntl.flock(fd,fcntl.LOCK_UN)
finally:os.close(fd)
new(D/'postclose-resource-boundary.json',bound)
x={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'CLOSED_NATIVE99_PASS_RETAINED_THREE_VERIFIED_GUARDED_RELEASE','label':A['label'],'actualWrapperExit':0,'guardToolOutputChunk':sys.argv[2],'guardDecision':'ALLOW_VERIFIED','rootReleaseSha256':h(D/'root-actual-unit-release.json'),'readinessSha256':h(D/'preunlock-verification.json'),'unlockPermitSha256':h(D/'unlock-permit.json'),'postcloseProducerSha256':h(Path(__file__)),'postcloseResourceBoundarySha256':h(D/'postclose-resource-boundary.json'),'sourceDigest':digest,'sourceFiles':1808,'mainResourcesLiteral':506,'distFiles':238,'modesExact':True,'sourceDisposition':ready['source']['disposition'],'retainedOverrides':ready['source']['overrides'],'actualResultSha256':h(T.parent/'execution/obs011-gst-provisional-06-results.json'),'actualCounts':{'total':99,'passed':99,'failed':0,'errors':0,'skipped':0},'recordedOwnedAbsentOrReused':10,'wrapperAndShellAbsentOrReused':True,'inheritedMatched':6,'otherProjectFacts':0,'kernelFree':True,'historicalGapCodes':ready['historicalGapCodes'],'historicalGapsRepaired':False,'postcloseIndependentReviewOwed':True,'C8OrLaneCredit':False,'generalMainReplayW1Release':False}
new(D/'root-unit-closed.json',x);print(json.dumps({'closedRecordSha256':h(D/'root-unit-closed.json'),'status':x['status'],'kernelFree':True,'recordedOwnedAbsentOrReused':10,'inheritedMatched':6,'sourceDigest':digest,'postcloseIndependentReviewOwed':True,'credit':False}))
