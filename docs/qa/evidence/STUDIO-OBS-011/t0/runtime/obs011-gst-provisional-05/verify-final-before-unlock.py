"""Unit05 final read-only verification. Creates readiness only; never a permit or exit."""
from pathlib import Path
import ast, datetime, errno, fcntl, hashlib, json, os, stat, subprocess, time

D=Path(__file__).resolve().parent
R=D.parents[6]
T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
U=T/'runtime/gst-restricted-unit05'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p): return json.loads(p.read_text())
def new(p,value):
    with p.open('x') as f: json.dump(value,f,indent=2);f.write('\n')
    os.chmod(p,0o600)

assert sha(D/'root-actual-unit-release.json')=='da402a685c7de417d61263fe78b7fe06992f323397437c6332435f626783252f'
A=read(D/'root-actual-unit-release.json')
pin=read(D/'active-lock.json')
core=T/'early/fullcheck-harness/resume3/harness.py'
assert sha(core)=='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
names={'sha','utc','regular','capture','pid_text','table','identity','project_role','boundary_inventory'}
nodes=[n for n in ast.parse(core.read_text()).body if isinstance(n,(ast.Import,ast.ImportFrom))
       or isinstance(n,ast.FunctionDef) and n.name in names]
scope={}
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<pinned-readonly-final-check>','exec'),scope)
scope['ROOT']=R
plan_path=T/'early/fullcheck-harness/resume3/plan.json'
assert sha(plan_path)=='576ebf9f01c0025cacc3bc6c7d6f4c747f8f84bb1f118a547cf11e21f7c94673'
plan=read(plan_path)
expected={x['path']:x['sha256'] for x in plan['source']['files']}
paths=scope['capture'](['git','-C',str(R),'ls-files','--cached','--others','--exclude-standard','-z','--',*plan['captureScope']]).split('\0')
actual=sorted({p for p in paths if p and (R/p).is_file() and '.claude' not in Path(p).parts})
assert set(actual)==set(expected) and len(actual)==1808
modes=read(U/'original-modes.json')
assert set(modes)==set(expected)
for name in actual:
    assert not (R/name).is_symlink() and sha(R/name)==expected[name]
    assert stat.S_IMODE((R/name).stat().st_mode)==modes[name]
assert len([n for n in actual if n.startswith('backend/src/main/')])==506
dist=R/'studio-runner/dist'
got=[{'path':str(p.relative_to(dist)),'sha256':sha(p)} for p in sorted(dist.rglob('*')) if p.is_file()]
assert got==plan['source']['dist']['files'] and len(got)==238
for group in ('helm','quotedCurrent','immutableHelpers'):
    assert all(sha(R/n)==h for n,h in plan[group].items())
for name,h in A['unlockGuard']['hashes'].items(): assert sha(D/name)==h

policy=read(D/'policy.json')
owned={}
evidence={'original-modes.json':sha(U/'original-modes.json')}
receipts={}
gaps=set()
for phase,code in [('format',0),('native',1),('restore-compile',0)]:
    path=D/f'owned-{phase}/receipt.json'
    receipt=read(path)
    assert receipt['status']=='NATIVE_PHASE_TERMINAL' and receipt['collectorExit']==code
    assert receipt['rootUnitAuthorizationSha256']==sha(D/'root-actual-unit-release.json')
    assert receipt['lockPin']==pin and receipt['phaseKeeperSha256']==A['phaseKeeperSha256']
    assert receipt['ownershipCoreSha256']==sha(core)
    terminal=[x for x in receipt['phases'] if x['phase']=='NATIVE_PHASE_TERMINAL']
    assert len(terminal)==1 and terminal[0]['exit']==code
    assert not receipt['evidenceErrors'] and not receipt.get('remainingOwnedNonJvmFacts')
    for key in policy['gapKeys']:
        assert type(receipt.get(key,False)) is bool
        if receipt.get(key,False): gaps.add(key)
    for row in receipt['ownedIdentities']: owned[(row['pid'],row['start'])]=row
    evidence[f'owned-{phase}/receipt.json']=sha(path)
    receipts[phase]=receipt
assert not gaps, 'Current gap requires separate exact independent qualification; keep hold'
assert read(U/'restore-compile-exit.json')['exit']==0
before=read(U/'restored.json')
after=read(U/'after-restore-compile.json')
assert before['files']==after['files']==plan['source']['files']
assert before['digest']==after['digest']==plan['source']['digest']
assert before['dist']==after['dist']==plan['source']['dist']
provenance=read(D/'restored-build-source-provenance.json')
assert provenance['sourceDigest']==after['digest'] and provenance['compileTestJavaActuallyExecuted'] is True
assert provenance['sameSourceExactBeforeAndAfterCompile'] is True and provenance['buildSuccessful'] is True
assert provenance['restoreCompileReceiptSha256']==evidence['owned-restore-compile/receipt.json']
assert provenance['restoreCompileLogSha256']==sha(U/'restore-compile.log')
assert provenance['sourceCheckpointSha256']==sha(U/'restored.json')
# Only fixed safe task/status lines are inspected, never failed raw output or private bodies.
lines=(U/'restore-compile.log').read_text().splitlines()
assert '> Task :compileTestJava' in lines and any(s.startswith('BUILD SUCCESSFUL in ') for s in lines)
extra=[]  # Unit05 completed normally; no diagnostic client or target signal was used.
for row in extra: owned[(row['pid'],row['start'])]=row

boundary=scope['boundary_inventory'](plan)
assert len(boundary['inheritedMatched'])==6
assert not any(boundary[n] for n in ('inheritedIdentityChanged','incompleteStableIdentities','otherProjectFacts'))
rows=scope['table']()
assert all(rows.get(pid,{}).get('start')!=start for pid,start in owned)
for kind in ('wrapper','shell'): assert rows[pin[kind+'Pid']]['start']==pin[kind+'Start']
assert rows[pin['shellPid']]['ppid']==pin['wrapperPid']
assert rows[pin['wrapperPid']]['argvHash']==pin['wrapperArgvSha256']
lock=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock'
assert sha(lock.with_name('with-gradle-lock.py'))==A['lockWrapperSha256']
fd=os.open(lock,os.O_RDONLY|os.O_NOFOLLOW)
try:
    info=os.fstat(fd)
    assert [info.st_dev,info.st_ino]==pin['lockDevInode']
    fields=scope['capture'](['/usr/sbin/lsof','-nP','-a','-p',str(pin['wrapperPid']),'-F','pfnil','--',str(lock)]).splitlines()
    assert 'p'+str(pin['wrapperPid']) in fields and 'i'+str(info.st_ino) in fields
    try: fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except OSError as error: assert error.errno in (errno.EAGAIN,errno.EACCES)
    else:
        fcntl.flock(fd,fcntl.LOCK_UN)
        raise AssertionError('Kernel lock no longer held; no readiness')
finally: os.close(fd)
new(D/'final-resource-boundary.json',boundary)
ready={'unitLabel':A['label'],'rootReleaseSha256':sha(D/'root-actual-unit-release.json'),
       'activeLockSha256':sha(D/'active-lock.json'),'status':'VERIFIED','verificationExit':0,
       'verifiedAtEpoch':time.time(),'expectedWrapperExit':1,'retroactiveRepairClaim':False,
       'historicalGapCodes':A['unlockGuard']['historicalGapCodes'],
       'phaseState':{x:'TERMINAL' for x in receipts},'evidencePins':evidence,
       'source':{'disposition':'RESTORED','overrides':{},'digest':after['digest']},
       'build':{'phase':'restore-compile','exit':0,'sourceDigest':after['digest'],
                'provenanceSha256':sha(D/'restored-build-source-provenance.json'),
                'preCompileCheckpointSha256':sha(U/'restored.json'),
                'postCompileCheckpointSha256':sha(U/'after-restore-compile.json'),
                'compileTestJavaActuallyExecuted':True},
       'resources':{'foregroundTerminal':True,'recordedSetComplete':True,'extraOwned':extra,
                    'recordedOwned':[{'pid':pid,'start':start} for pid,start in sorted(owned)],'ownedPorts':[]},
       'manualGaps':[],'gaps':[],
       'producerSha256':sha(Path(__file__)),'resourceBoundarySha256':sha(D/'final-resource-boundary.json')}
new(D/'preunlock-verification.json',ready)
print(json.dumps({'verificationExit':0,'readinessSha256':sha(D/'preunlock-verification.json'),
                  'sourceFiles':1808,'mainFiles':506,'distFiles':238,'modesExact':True,
                  'buildActuallyExecuted':True,'recordedOwnedAbsentOrReused':len(owned),
                  'inheritedMatched':6,'otherProjectFacts':0,'sameKernelLockHeld':True,
                  'currentGaps':[],'historicalGapsPreserved':ready['historicalGapCodes'],
                  'permitWritten':False,'exitInvoked':False}))
