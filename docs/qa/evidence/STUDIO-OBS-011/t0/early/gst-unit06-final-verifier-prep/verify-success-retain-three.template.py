"""PREPARED Unit06 final-verification TEMPLATE. Never run during preparation."""
from pathlib import Path
from collections import Counter
import ast, datetime, errno, fcntl, hashlib, json, os, re, stat, subprocess, time

# Root must independently review the exact bound successor before any invocation.
EXPECTED_ROOT_RELEASE_SHA = 'UNBOUND_ROOT_RELEASE_SHA'
EXPECTED_NATIVE_EXIT = None
EXPECTED_WRAPPER_EXIT = None
if not __debug__:
    raise SystemExit('HOLD: optimized assertion execution forbidden')
if not isinstance(EXPECTED_ROOT_RELEASE_SHA,str) or not re.fullmatch('[0-9a-f]{64}',EXPECTED_ROOT_RELEASE_SHA):
    raise SystemExit('HOLD: exact root release SHA is unbound')
if type(EXPECTED_NATIVE_EXIT) is not int or type(EXPECTED_WRAPPER_EXIT) is not int:
    raise SystemExit('HOLD: actual native/wrapper status is unbound')
D=Path(__file__).resolve().parent
R=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
U=T/'runtime/gst-restricted-unit06'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p): return json.loads(p.read_text())
def new(p,value):
    with p.open('x') as f: json.dump(value,f,indent=2);f.write('\n')
    os.chmod(p,0o600)

assert D==T/'runtime/obs011-gst-provisional-06'
assert sha(D/'root-actual-unit-release.json')==EXPECTED_ROOT_RELEASE_SHA
A=read(D/'root-actual-unit-release.json')
assert A['label']=='obs011-gst-provisional-06'
assert A['sourceWriterReleased'] is True and A['nativeCommandReleased'] is True
assert A['phaseKeeperSha256']=='e4a64776e712409867990ce7b848a2db7fbfe84f42ddafe26c499512a30cc3a1'
assert sha(D/'owned_native_phase.py')==A['phaseKeeperSha256']
assert A['unlockGuard']['hashes']=={
    'unlock_gate.py':'55e5d935a0a38bd2b7477cde55f11b39df7c842ce5efc01494dbc7a1c32513a6',
    'guard-exit.bash':'bf5782294e00ac1509e6145233fa7c97a5085a14663ec475df8e0698d7135f0c',
    'policy.json':'727776bd3dccf400f1012c6994a36c5e180e92c7a50ba217fe10bffeb83fcd73'}
proposal_path=T/'runtime/gst-limited-start-proposal06/proposal.json'
assert sha(proposal_path)=='3837adfa81c4c46215e1b9a13f1c2a66b7305acee3886925c916de866f284ea4'
proposal=read(proposal_path)
phase_path=T/'early/gst-restricted-unit-prep/resume6/phase.py'
assert sha(phase_path)=='8bf6af832251d6255e8c48b372ed84c885d9ea9c2bb341909f50126b9898138d'
tests={x['file'] for x in proposal['writerBindings']}
assert len(tests)==3 and {x['file'] for x in A['writers']}==tests
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
SOURCE_DISPOSITION='RETAIN_AUTHORIZED_THREE'
assert EXPECTED_NATIVE_EXIT==0 and EXPECTED_WRAPPER_EXIT==0
archive_path=D/'formatted-candidate-archive/index.json'
archive=read(archive_path)
assert archive['status']=='EXACT_FORMATTED_THREE_ARCHIVED_BEFORE_NATIVE'
assert archive['rootReleaseSha256']==EXPECTED_ROOT_RELEASE_SHA
assert archive['formatExit']==archive['checkFormatExit']==0
assert archive['recordedFormatGapFlags'] is False
assert len(archive['files'])==3 and {x['source'] for x in archive['files']}==tests
assert len({x['archive'] for x in archive['files']})==3
overrides={}
for row in archive['files']:
    path=D/'formatted-candidate-archive'/Path(row['source']).name
    assert R/row['archive']==path and not path.is_symlink()
    assert sha(path)==row['sha256']==sha(R/row['source']) and path.stat().st_size==row['bytes']
    overrides[row['source']]=row['sha256']
assert set(overrides)==tests and set(overrides)<=set(expected)
expected.update(overrides)
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
assert policy['maxReadinessAgeSeconds']==60
assert A['unlockGuard']['enabled'] is True and A['unlockGuard']['protocol']==policy['protocol']
assert set(policy['requiredHistoricalGapCodes'])<=set(A['unlockGuard']['historicalGapCodes'])
owned={}
evidence={'original-modes.json':sha(U/'original-modes.json')}
receipts={}
gaps=set()
assert not (D/'owned-restore-compile/receipt.json').exists()
assert not (U/'restore-compile-exit.json').exists()
phase_state={'format':'TERMINAL','native':'TERMINAL','restore-compile':'NOT_STARTED'}
for phase,code in [('format',0),('native',EXPECTED_NATIVE_EXIT)]:
    path=D/f'owned-{phase}/receipt.json'
    receipt=read(path)
    assert receipt['status']=='NATIVE_PHASE_TERMINAL' and receipt['phase']==phase
    assert type(receipt['collectorExit']) is int and receipt['collectorExit']==code
    assert receipt['rootUnitAuthorizationSha256']==sha(D/'root-actual-unit-release.json')
    assert receipt['lockPin']==pin and receipt['phaseKeeperSha256']==A['phaseKeeperSha256']
    assert receipt['ownershipCoreSha256']==sha(core)
    terminal=[x for x in receipt['phases'] if x['phase']=='NATIVE_PHASE_TERMINAL']
    assert len(terminal)==1 and terminal[0]['exit']==code
    assert not receipt['evidenceErrors'] and not receipt.get('remainingOwnedNonJvmFacts')
    assert receipt.get('interrupted',False) is False
    assert receipt['command']==A['nativePhases'][phase]['argv']
    for key in policy['gapKeys']:
        assert type(receipt.get(key,False)) is bool
        if receipt.get(key,False): gaps.add(key)
    for row in receipt['ownedIdentities']: owned[(row['pid'],row['start'])]=row
    evidence[f'owned-{phase}/receipt.json']=sha(path)
    receipts[phase]=receipt
assert not gaps, 'Current gap requires separate exact independent qualification; keep hold'
assert read(U/'format-exit.json')['exit']==read(U/'native-exit.json')['exit']==0
formatted=read(U/'formatted.json')
format_successor=read(U/'format-successor.json')
assert format_successor['acceptedUnformattedPatchSha256']==proposal['patchSha256']
assert format_successor['formattedSha256']==overrides
assert format_successor['literalTokensExact'] is True and format_successor['otherJavaTokensExact'] is True
assert archive['sourceCheckpointSha256']==sha(U/'formatted.json')
assert archive['sourceDigest']==formatted['digest']
assert archive['formatReceiptSha256']==evidence['owned-format/receipt.json']
label=A['label'];execution=R/'docs/qa/evidence/STUDIO-OBS-011/execution'
result_path=execution/f'{label}-results.json'
result=read(result_path)
identity=lambda x:(x['task'],x['class'],x['name'])
assert Counter(identity(x) for x in result['testcases'])==Counter(identity(x) for x in proposal['expectedCases'])
assert len(result['testcases'])==99 and all(x['status']=='PASS' for x in result['testcases'])
assert result['counts']=={'total':99,'passed':99,'failed':0,'errors':0,'skipped':0}
assert result['exit']==result['gradleExit']==0 and result['validationSucceeded'] is True
assert all(result[k] is True for k in ['sourceStable','distStable','testInputStable','taskCollectionComplete'])
assert not result['taskCollectionErrors']
assert result['explicitTestTasks']==result['requiredFreshExecTasks']==['test']
assert result['expectedHistoricalSkips']==[] and result['historicalSkipSource'] is None
assert result['taskResults']['test']['freshExec'] is True and result['taskResults']['test']['execRequired'] is True
assert result['taskResults']['test']['freshXmlFiles']>0 and result['taskResults']['test']['freshHtmlIndex'] is True
case=read(U/'case-proof.json')
assert case['expected']==case['actual']==99 and case['identityMultisetExact'] is True
assert case['counts']==result['counts'] and case['collectorExit']==case['gradleExit']==0
before=read(execution/f'{label}-before.json')
after=read(execution/f'{label}-after.json')
phase_after=read(U/'after-native.json')
expected_files=[{'path':n,'sha256':expected[n]} for n in sorted(expected)]
for checkpoint in (formatted,before,after,phase_after):
    assert checkpoint['files']==expected_files
    assert checkpoint['dist']==plan['source']['dist']
    assert hashlib.sha256(json.dumps(checkpoint['files'],separators=(',',':')).encode()).hexdigest()==checkpoint['digest']
assert formatted['digest']==before['digest']==after['digest']==phase_after['digest']
assert result['testInputDigestBefore']==result['testInputDigestAfter']==after['digest']
provenance=read(D/'retained-build-source-provenance.json')
gradle_log=execution/f'{label}.log'
assert provenance['sourceDigest']==after['digest'] and provenance['compileTestJavaActuallyExecuted'] is True
assert provenance['sameSourceExactBeforeAndAfterCompile'] is True and provenance['buildSuccessful'] is True
assert provenance['collectorExit']==0 and provenance['flags']=={}
assert provenance['nativeReceiptSha256']==evidence['owned-native/receipt.json']
assert provenance['nativeGradleLogSha256']==result['logSha256']==sha(gradle_log)
assert provenance['sourceBeforeCheckpointSha256']==sha(execution/f'{label}-before.json')
assert provenance['sourceAfterCheckpointSha256']==sha(execution/f'{label}-after.json')
# Project only fixed task/status facts; never export raw log or failure data.
lines=gradle_log.read_text().splitlines()
assert '> Task :compileTestJava' in lines and '> Task :test' in lines
assert any(line.startswith('BUILD SUCCESSFUL in ') for line in lines)
build={'phase':'native','exit':0,'sourceDigest':after['digest'],
       'provenanceSha256':sha(D/'retained-build-source-provenance.json'),
       'preCompileCheckpointSha256':sha(execution/f'{label}-before.json'),
       'postCompileCheckpointSha256':sha(execution/f'{label}-after.json'),
       'compileTestJavaActuallyExecuted':True,
       'resultSha256':sha(result_path),'caseProofSha256':sha(U/'case-proof.json'),
       'phaseAfterNativeSha256':sha(U/'after-native.json'),'archiveIndexSha256':sha(archive_path)}
extra=[]  # Normal full99 success only; no diagnostics or separate target signals assumed.
for row in extra: owned[(row['pid'],row['start'])]=row

boundary=scope['boundary_inventory'](plan)
assert len(boundary['inheritedMatched'])==6
assert not any(boundary[n] for n in ('inheritedIdentityChanged','incompleteStableIdentities','otherProjectFacts'))
rows=scope['table']()
assert all(rows.get(pid,{}).get('start')!=start for pid,start in owned)
assert os.getppid()==pin['shellPid']
for kind in ('wrapper','shell'): assert rows[pin[kind+'Pid']]['start']==pin[kind+'Start']
assert rows[pin['shellPid']]['ppid']==pin['wrapperPid']
assert rows[pin['wrapperPid']]['argvHash']==pin['wrapperArgvSha256']
# Same fixed holder-descendant exclusion as the immutable gate; no unrelated cleanup.
descendants={pin['wrapperPid']};excluded={os.getpid()}
while True:
    more=descendants|{pid for pid,row in rows.items() if row['ppid'] in descendants}
    sub=excluded|{pid for pid,row in rows.items() if row['ppid'] in excluded}
    if more==descendants and sub==excluded:break
    descendants,excluded=more,sub
assert not (descendants-excluded-{pin['wrapperPid'],pin['shellPid']})
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
       'verifiedAtEpoch':time.time(),'expectedWrapperExit':EXPECTED_WRAPPER_EXIT,'retroactiveRepairClaim':False,
       'historicalGapCodes':A['unlockGuard']['historicalGapCodes'],
       'phaseState':phase_state,'evidencePins':evidence,
       'source':{'disposition':SOURCE_DISPOSITION,'overrides':overrides,'digest':after['digest']},
       'build':build,
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
