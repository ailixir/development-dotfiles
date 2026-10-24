from pathlib import Path
import ast,json,hashlib,datetime,os,stat,fcntl,errno
D=Path(__file__).resolve().parent;R=D.parents[6];T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
core=T/'early/fullcheck-harness/resume3/harness.py';assert h(core)=='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
names={'sha','utc','regular','capture','pid_text','table','identity','project_role','boundary_inventory'}
nodes=[n for n in ast.parse(core.read_text()).body if isinstance(n,(ast.Import,ast.ImportFrom)) or isinstance(n,ast.FunctionDef) and n.name in names];s={};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<held-prestage-readonly>','exec'),s);s['ROOT']=R
planpath=T/'early/fullcheck-harness/resume3/plan.json';assert h(planpath)=='576ebf9f01c0025cacc3bc6c7d6f4c747f8f84bb1f118a547cf11e21f7c94673'
plan=json.loads(planpath.read_text());expected={x['path']:x['sha256'] for x in plan['source']['files']}
paths=s['capture'](['git','-C',str(R),'ls-files','--cached','--others','--exclude-standard','-z','--',*plan['captureScope']]).split('\0');actual=sorted({p for p in paths if p and (R/p).is_file() and '.claude' not in Path(p).parts});assert set(actual)==set(expected) and len(actual)==1808
modes=json.loads((T/'runtime/gst-restricted-unit05/original-modes.json').read_text());assert set(modes)==set(expected)
for name in actual:assert not (R/name).is_symlink() and h(R/name)==expected[name] and stat.S_IMODE((R/name).stat().st_mode)==modes[name]
dist=R/'studio-runner/dist';got=[{'path':str(p.relative_to(dist)),'sha256':h(p)} for p in sorted(dist.rglob('*')) if p.is_file()];assert got==plan['source']['dist']['files'] and len(got)==238
for g in ['helm','quotedCurrent','immutableHelpers']:assert all(h(R/n)==v for n,v in plan[g].items())
a=json.loads((D/'root-actual-unit-release.json').read_text())
for name,v in a['unlockGuard']['hashes'].items():assert h(D/name)==v
assert not (D/'preunlock-verification.json').exists() and not (D/'unlock-permit.json').exists() and not (T/'runtime/gst-restricted-unit06').exists()
bound=s['boundary_inventory'](plan);assert len(bound['inheritedMatched'])==6 and not any(bound[k] for k in ['inheritedIdentityChanged','incompleteStableIdentities','otherProjectFacts'])
pin=json.loads((D/'active-lock.json').read_text());rows=s['table']()
for k in ['wrapper','shell']:assert rows[pin[k+'Pid']]['start']==pin[k+'Start']
assert rows[pin['shellPid']]['ppid']==pin['wrapperPid'] and rows[pin['wrapperPid']]['argvHash']==pin['wrapperArgvSha256']
lock=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock';assert h(lock.with_name('with-gradle-lock.py'))==a['lockWrapperSha256']
fd=os.open(lock,os.O_RDONLY|os.O_NOFOLLOW)
try:
 info=os.fstat(fd);assert [info.st_dev,info.st_ino]==pin['lockDevInode']
 fields=s['capture'](['/usr/sbin/lsof','-nP','-a','-p',str(pin['wrapperPid']),'-F','pfnil','--',str(lock)]).splitlines();assert 'p'+str(pin['wrapperPid']) in fields and 'i'+str(info.st_ino) in fields
 try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except OSError as e:assert e.errno in (errno.EAGAIN,errno.EACCES)
 else:
  fcntl.flock(fd,fcntl.LOCK_UN);raise AssertionError('kernel not held')
finally:os.close(fd)
x={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceFiles':1808,'sourceDigest':plan['source']['digest'],'mainResourcesLiteral':506,'distFiles':238,'modesExact':True,'auxiliaryExact':True,'rootReleaseSha256':h(D/'root-actual-unit-release.json'),'activeLockSha256':h(D/'active-lock.json'),'samePinnedHolderParentsArgvDescriptorInodeKernel':True,'readinessAndPermitAbsent':True,'phaseDirectoryAbsent':True,'boundary':bound}
p=D/'held-prestage-resource-boundary.json'
with p.open('x') as f:json.dump(x,f,indent=2);f.write('\n')
os.chmod(p,0o600);print(json.dumps({'verified':True,'recordSha256':h(p),'sourceOriginal':1808,'main':506,'dist':238,'sameHeldKernel':True,'inheritedMatched':6,'otherProjectFacts':0,'stageReleasedByThisScript':False}))
