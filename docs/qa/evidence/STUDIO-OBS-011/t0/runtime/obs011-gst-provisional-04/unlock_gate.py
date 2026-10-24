"""Future-unit read-only exit gate. Preparation runs only injected pure controls."""
from pathlib import Path
import ast, errno, fcntl, hashlib, json, math, os, re, stat, subprocess, sys, time
ROOT=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
HERE=Path(__file__).resolve().parent
T0=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'
CORE=T0/'early/fullcheck-harness/resume3/harness.py'
CORE_SHA='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
PLAN=T0/'early/fullcheck-harness/resume3/plan.json'
PLAN_SHA='576ebf9f01c0025cacc3bc6c7d6f4c747f8f84bb1f118a547cf11e21f7c94673'
WRAPPER=ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py'
WRAPPER_SHA='2846314e3ab12926bff6eb458d7058c406b983092fb40b1fb5c2fa087c2366df'
PHASES=('format','native','restore-compile')
TESTS={f'backend/src/test/java/com/citi/put/checks/studio/guided/session/{n}.java'
       for n in ('GuidedSessionIT','GuidedLifecycleReasonIT','GuidedServiceTransportFaultIT')}
class Hold(Exception): pass
def need(ok,code):
    if not ok: raise Hold(code)
def digest(data): return hashlib.sha256(data).hexdigest()
def identities(rows):
    need(isinstance(rows,list),'IDENTITY_SET');out=[]
    for x in rows:
        need(type(x.get('pid')) is int and x['pid']>0 and isinstance(x.get('start'),str)
             and bool(x['start'].strip()),'IDENTITY_SET')
        out.append((x['pid'],x['start']))
    need(len(set(out))==len(out),'IDENTITY_SET')
    return set(out)

def requirements(b,requested):
    p,r,a,v,c=b['policy'],b['release'],b['permit'],b['ready'],b['pin']
    need(p['protocol']=='GST_UNLOCK_V1','POLICY')
    need(b['releaseSha']==b['expectedReleaseSha'],'RELEASE_HASH')
    label=r['label'];match=re.fullmatch(r'obs011-gst-provisional-(\d{2})',label)
    need(bool(match) and int(match[1])>=p['minimumFutureUnit']
         and label==b['installedUnit'],'FUTURE_UNIT_REQUIRED')
    need(all(type(c.get(k)) is int and c[k]>0 for k in ('wrapperPid','shellPid'))
         and all(isinstance(c.get(k),str) and c[k].strip() for k in ('wrapperStart','shellStart'))
         and isinstance(c.get('lockDevInode'),list) and len(c['lockDevInode'])==2
         and all(type(x) is int and x>=0 for x in c['lockDevInode']),'ACTIVE_LOCK_SHAPE')
    u=r['unlockGuard']
    need(len(r['writers'])==3 and {x['file'] for x in r['writers']}==TESTS,'RELEASE_SOURCE_SCOPE')
    need(u['enabled'] is True and u['protocol']==p['protocol'],'ROOT_GUARD_AUTHORITY')
    need(u['hashes']==b['codeHashes'],'GUARD_HASH')
    for record in (a,v):
        need(record['unitLabel']==label and record['rootReleaseSha256']==b['releaseSha'],'UNIT_BINDING')
        need(record['activeLockSha256']==b['activeSha'],'ACTIVE_LOCK_HASH')
    need(a['decision']=='AUTHORIZE_LOCK_RELEASE' and a['readinessSha256']==b['readinessSha'],'READINESS_HASH')
    need(type(requested) is int and type(a['expectedWrapperExit']) is int
         and type(v['expectedWrapperExit']) is int and 0<=requested<=255
         and requested==a['expectedWrapperExit']==v['expectedWrapperExit'],'EXPECTED_EXIT')
    need(v['status'] in ('VERIFIED','QUALIFIED_VERIFIED')
         and type(v['verificationExit']) is int and v['verificationExit']==0,'FINAL_VERIFICATION')
    need(v['retroactiveRepairClaim'] is False,'NO_RETROACTIVE_REPAIR')
    history=u['historicalGapCodes']
    need(set(p['requiredHistoricalGapCodes'])<=set(history)
         and a['historicalGapCodes']==v['historicalGapCodes']==history,'HISTORICAL_GAPS')
    need(a['evidencePins']==v['evidencePins']==b['evidenceHashes'],'EVIDENCE_CHANGED')
    need(set(v['phaseState'])==set(PHASES) and a['phaseState']==v['phaseState'],'PHASE_ACCOUNTING')
    owned=set();gaps=set()
    for phase in PHASES:
        receipt=b['receipts'].get(phase);state=v['phaseState'][phase]
        need(state in ('TERMINAL','NOT_STARTED'),'PHASE_ACCOUNTING')
        if state=='NOT_STARTED':
            need(receipt is None,'UNEXPECTED_PHASE_RECEIPT');continue
        need(receipt is not None and receipt['status']=='NATIVE_PHASE_TERMINAL'
             and receipt['rootUnitAuthorizationSha256']==b['releaseSha']
             and receipt['lockPin']==c
             and receipt['phase']==phase and type(receipt['collectorExit']) is int
             and receipt['phaseKeeperSha256']==r['phaseKeeperSha256']
             and receipt['ownershipCoreSha256']==CORE_SHA,'PHASE_TERMINAL_BINDING')
        owned |= identities(receipt['ownedIdentities'])
        for key in p['gapKeys']:
            need(type(receipt.get(key,False)) is bool,'GAP_SHAPE')
            if receipt.get(key,False): gaps.add(key)
    resource=v['resources']
    need(resource['foregroundTerminal'] is True and resource['recordedSetComplete'] is True,'RESOURCE_DISPOSITION')
    owned |= identities(resource['extraOwned'])
    need(identities(resource['recordedOwned'])==owned,'OWNED_UNION')
    ports=resource['ownedPorts']
    need(isinstance(ports,list) and all(type(x) is int and 0<x<65536 for x in ports)
         and len(set(ports))==len(ports) and a['ownedPorts']==ports,'OWNED_PORTS')
    source=v['source'];overrides=source['overrides']
    need(source['disposition'] in ('RESTORED','RETAIN_AUTHORIZED_THREE')
         and a['sourceOverrides']==overrides,'SOURCE_DISPOSITION')
    need((source['disposition']=='RESTORED' and overrides=={})
         or (source['disposition']=='RETAIN_AUTHORIZED_THREE' and set(overrides)==TESTS
             and a.get('retainThreeAuthorized') is True and {x['file'] for x in r['writers']}==TESTS),
         'SOURCE_OVERRIDE_SCOPE')
    need(all(isinstance(h,str) and re.fullmatch('[0-9a-f]{64}',h) for h in overrides.values()),'SOURCE_HASH')
    build=v['build'];phase=build['phase']
    need(phase in ('native','restore-compile') and v['phaseState'][phase]=='TERMINAL'
         and type(build['exit']) is int and build['exit']==0
         and build['sourceDigest']==source['digest'],'BUILD_DISPOSITION')
    terminal=[x for x in b['receipts'][phase]['phases'] if x.get('phase')=='NATIVE_PHASE_TERMINAL']
    need(len(terminal)==1 and type(terminal[0]['exit']) is int and terminal[0]['exit']==0
         and b['receipts'][phase]['collectorExit']==0,'BUILD_TERMINAL')
    need(source['disposition']!='RESTORED' or phase=='restore-compile','ORIGINAL_COMPILE_REQUIRED')
    need(set(v['manualGaps'])<=set(p['gapKeys']),'GAP_SHAPE')
    gaps |= set(v['manualGaps'])
    need(set(v['gaps'])==gaps and a['gaps']==v['gaps'],'STICKY_GAPS')
    if gaps:
        qa,root=b.get('qa'),b.get('rootQualification')
        need(v['status']=='QUALIFIED_VERIFIED' and qa is not None and root is not None,'QUALIFICATION_REQUIRED')
        need(a['qaQualificationSha256']==b['qaSha'] and a['rootQualificationSha256']==b['rootQualificationSha'],'QUALIFICATION_HASH')
        basis=digest(json.dumps({key:v[key] for key in ('unitLabel','rootReleaseSha256','activeLockSha256',
            'expectedWrapperExit','evidencePins','phaseState','source','build','resources','gaps','historicalGapCodes')},
            sort_keys=True,separators=(',',':')).encode())
        need(a['qualificationEvidenceSha256']==basis,'QUALIFICATION_BASIS')
        for q in (qa,root):
            need(q['unitLabel']==label and q['rootReleaseSha256']==b['releaseSha']
                 and q['qualificationEvidenceSha256']==basis and q['gaps']==v['gaps']
                 and q['acceptCurrentQualifiedClosure'] is True and q['historicalRepairClaim'] is False,
                 'QUALIFICATION_SCOPE')
        need(qa['role']=='independent-qa' and qa['independentOfRunner'] is True
             and root['role']=='root' and root['qaQualificationSha256']==b['qaSha'],'INDEPENDENT_QUALIFICATION')
    else: need(v['status']=='VERIFIED','QUALIFICATION_SHAPE')
    required={'format','native'} | ({'restore-compile'} if source['disposition']=='RESTORED' else set())
    incomplete=bool(gaps) or any(v['phaseState'][x]!='TERMINAL' for x in required) \
        or any(x['collectorExit']!=0 for x in b['receipts'].values())
    need(not incomplete or requested!=0,'INCOMPLETE_EXIT_MUST_BE_NONZERO')
    return owned,set(ports),gaps

def fresh(b,now):
    stamp=b['ready']['verifiedAtEpoch']
    need(type(stamp) in (int,float) and math.isfinite(stamp)
         and 0<=now-stamp<=b['policy']['maxReadinessAgeSeconds'],'STALE_READINESS')

def assess(b,live,now,requested):
    _,_,gaps=requirements(b,requested);fresh(b,now)
    need(live['observationOk'] and live['parentLockCurrent'],'CURRENT_LOCK_OR_OBSERVATION')
    need(live['sourceDigest']==b['ready']['source']['digest'] and live['modesMatch']
         and live['auxiliaryInputsMatch'] and live['metadataUnchanged'],'CURRENT_SOURCE_OR_EVIDENCE')
    need(not live['liveOwned'] and not live['unexpectedHolderDescendants'] and not live['liveOwnedPorts'],'LIVE_OWNED_RESOURCE')
    return {'decision':'ALLOW_QUALIFIED' if gaps else 'ALLOW_VERIFIED',
            'gapsPreserved':sorted(gaps),'expectedWrapperExit':requested,'nativeOrLaneCredit':False}

def safe_bytes(path):
    path=Path(path);need(path.is_relative_to(ROOT) and not path.is_symlink(),'UNSAFE_METADATA')
    need(all(not p.is_symlink() for p in path.parents if p!=ROOT),'UNSAFE_METADATA')
    before=path.stat();need(stat.S_ISREG(before.st_mode),'UNSAFE_METADATA')
    data=path.read_bytes();after=path.stat()
    need((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==
         (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns),'FILE_CHANGED')
    return data

def observe(b,shell_pid):
    # Only these existing pinned read-only functions, never harness globals/main/runner.
    need(digest(safe_bytes(CORE))==CORE_SHA,'OWNERSHIP_CORE_HASH')
    tree=ast.parse(safe_bytes(CORE).decode());scope={'hashlib':hashlib,'subprocess':subprocess}
    nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'sha','capture','pid_text','table'}]
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<pinned-readonly-census>','exec'),scope)
    rows=scope['table']();pin=b['pin'];wrapper=pin['wrapperPid']
    need(os.getppid()==shell_pid==pin['shellPid']
         and rows.get(shell_pid,{}).get('start')==pin['shellStart']
         and rows.get(wrapper,{}).get('start')==pin['wrapperStart'],'HOLDER_IDENTITY')
    cursor=os.getpid();seen=set()
    while cursor!=wrapper:
        need(cursor in rows and cursor not in seen,'HOLDER_CHAIN')
        seen.add(cursor);cursor=rows[cursor]['ppid']
    lock=WRAPPER.with_name('gradle.lock')
    need(digest(safe_bytes(WRAPPER))==WRAPPER_SHA and b['release']['lockWrapperSha256']==WRAPPER_SHA,'WRAPPER_HASH')
    info=lock.stat(follow_symlinks=False)
    need(not lock.is_symlink() and stat.S_ISREG(info.st_mode)
         and [info.st_dev,info.st_ino]==pin['lockDevInode'],'LOCK_IDENTITY')
    fields=scope['capture'](['/usr/sbin/lsof','-nP','-a','-p',str(wrapper),'-F','pfnil','--',str(lock)]).splitlines()
    need('p'+str(wrapper) in fields and 'i'+str(info.st_ino) in fields,'WRAPPER_DESCRIPTOR')
    fd=os.open(lock,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        need((os.fstat(fd).st_dev,os.fstat(fd).st_ino)==(info.st_dev,info.st_ino),'LOCK_IDENTITY')
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError as error:need(error.errno in (errno.EAGAIN,errno.EACCES),'KERNEL_LOCK_UNKNOWN')
        else:
            fcntl.flock(fd,fcntl.LOCK_UN);raise Hold('KERNEL_LOCK_NOT_HELD')
    finally:os.close(fd)
    owned,ports,_=requirements(b,b['requested'])
    need(digest(safe_bytes(PLAN))==PLAN_SHA,'BASELINE_PLAN_HASH');plan=json.loads(safe_bytes(PLAN))
    expected={x['path']:x['sha256'] for x in plan['source']['files']}
    expected.update(b['ready']['source']['overrides'])
    paths=scope['capture'](['git','-C',str(ROOT),'ls-files','--cached','--others','--exclude-standard','-z','--',*plan['captureScope']]).split('\0')
    names=sorted({p for p in paths if p and (ROOT/p).is_file() and '.claude' not in Path(p).parts})
    need(set(names)==set(expected) and len(names)==1808,'SOURCE_MEMBERSHIP')
    modes=b['modes'];need(set(modes)==set(expected),'SOURCE_MODE_MEMBERSHIP');actual=[]
    for name in names:
        need(digest(safe_bytes(ROOT/name))==expected[name]
             and stat.S_IMODE((ROOT/name).stat().st_mode)==modes[name],'CURRENT_SOURCE')
        actual.append({'path':name,'sha256':expected[name]})
    dist=ROOT/'studio-runner/dist'
    got=[{'path':str(p.relative_to(dist)),'sha256':digest(safe_bytes(p))}
         for p in sorted(dist.rglob('*')) if p.is_file() or p.is_symlink()]
    need(got==plan['source']['dist']['files'] and len(got)==238,'CURRENT_DIST')
    helm={str(p.relative_to(ROOT)):digest(safe_bytes(p)) for p in sorted((ROOT/'helm-chart').rglob('*')) if p.is_file() or p.is_symlink()}
    need(helm==plan['helm'],'CURRENT_HELM')
    for name,h in {**plan['quotedCurrent'],**plan['immutableHelpers']}.items():need(digest(safe_bytes(ROOT/name))==h,'CURRENT_AUXILIARY')
    fresh=scope['table']()
    need(fresh.get(wrapper,{}).get('start')==pin['wrapperStart']
         and fresh.get(shell_pid,{}).get('start')==pin['shellStart'],'HOLDER_IDENTITY')
    live_owned=[x for x in owned if fresh.get(x[0],{}).get('start')==x[1]]
    descendants={wrapper};excluded={os.getpid()}
    while True:
        more=descendants|{pid for pid,row in fresh.items() if row['ppid'] in descendants}
        sub=excluded|{pid for pid,row in fresh.items() if row['ppid'] in excluded}
        if more==descendants and sub==excluded:break
        descendants,excluded=more,sub
    unexpected=descendants-excluded-{wrapper,shell_pid}
    final_listeners=scope['capture'](['/usr/sbin/lsof','-nP','-iTCP','-sTCP:LISTEN','-F','pn'],(0,1))
    live_ports=[int(s.rsplit(':',1)[-1]) for s in final_listeners.splitlines()
                   if s.startswith('n') and s.rsplit(':',1)[-1].isdigit()
                   and int(s.rsplit(':',1)[-1]) in ports]
    return {'observationOk':True,'parentLockCurrent':True,'liveOwned':live_owned,
            'unexpectedHolderDescendants':sorted(unexpected),'liveOwnedPorts':live_ports,
            'sourceDigest':digest(json.dumps(actual,separators=(',',':')).encode()),
            'modesMatch':True,'auxiliaryInputsMatch':True,
            'metadataUnchanged':all(digest(safe_bytes(p))==h for p,h in b['loadedHashes'].items())}

def main():
    need(len(sys.argv)==4 and re.fullmatch('[0-9a-f]{64}',sys.argv[1]),'INVOCATION')
    expected_release,shell,requested=sys.argv[1],int(sys.argv[2]),int(sys.argv[3])
    need(re.fullmatch(r'obs011-gst-provisional-\d{2}',HERE.name)
         and HERE.parent==T0/'runtime','FUTURE_INSTALLATION_REQUIRED')
    loaded={}
    def no_duplicates(pairs):
        result={}
        for key,value in pairs:
            need(key not in result,'DUPLICATE_METADATA_KEY');result[key]=value
        return result
    def read(path):
        data=safe_bytes(path);need(len(data)<=4*1024*1024,'METADATA_BOUND')
        loaded[path]=digest(data);return json.loads(data,object_pairs_hook=no_duplicates)
    release=read(HERE/'root-actual-unit-release.json')
    policy=read(HERE/'policy.json')
    need((HERE/'preunlock-verification.json').is_file(),'FINAL_VERIFICATION_REQUIRED')
    ready=read(HERE/'preunlock-verification.json');permit=read(HERE/'unlock-permit.json');pin=read(HERE/'active-lock.json')
    suffix=HERE.name.rsplit('-',1)[-1];modes_path=T0/f'runtime/gst-restricted-unit{suffix}/original-modes.json'
    modes=read(modes_path);receipts={};evidence={'original-modes.json':loaded[modes_path]}
    for phase in PHASES:
        path=HERE/f'owned-{phase}/receipt.json'
        if path.exists():
            receipts[phase]=read(path);evidence[f'owned-{phase}/receipt.json']=loaded[path]
    b={'policy':policy,'release':release,'permit':permit,'ready':ready,'pin':pin,'modes':modes,
       'releaseSha':loaded[HERE/'root-actual-unit-release.json'],'expectedReleaseSha':expected_release,
       'activeSha':loaded[HERE/'active-lock.json'],'readinessSha':loaded[HERE/'preunlock-verification.json'],
       'receipts':receipts,'evidenceHashes':evidence,'requested':requested,'loadedHashes':loaded,'installedUnit':HERE.name,
       'codeHashes':{name:digest(safe_bytes(HERE/name)) for name in ('unlock_gate.py','guard-exit.bash','policy.json')}}
    if ready.get('gaps'):
        for key,name in [('qa','independent-unlock-qualification.json'),('rootQualification','root-unlock-qualification.json')]:
            b[key]=read(HERE/name);b[key+'Sha']=loaded[HERE/name]
    for name,h in b['codeHashes'].items():loaded[HERE/name]=h
    requirements(b,requested)
    fresh(b,time.time())
    result=assess(b,observe(b,shell),time.time(),requested)
    print(json.dumps(result));return 0
if __name__=='__main__':
    try:code=main()
    except BaseException as error:
        print(json.dumps({'decision':'HOLD','reason':str(error) if type(error) is Hold else 'MISSING_OR_MALFORMED_PROOF',
                          'shellMustRemainHeld':True,'nativeOrLaneCredit':False}))
        code=1
    sys.exit(code)
