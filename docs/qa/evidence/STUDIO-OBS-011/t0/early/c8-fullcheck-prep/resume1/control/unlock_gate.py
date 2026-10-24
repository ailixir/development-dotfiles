"""Prepared C8-only gate. Pure checks are injectable; actual main/observe require new release."""
from pathlib import Path
import ast,errno,fcntl,hashlib,importlib.util,json,math,os,re,stat,subprocess,sys,time
ROOT=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
HERE=Path(__file__).resolve().parent
UNIT=HERE.parent
T0=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'
CORE=T0/'early/fullcheck-harness/resume3/harness.py'
CORE_SHA='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
PLAN=T0/'early/fullcheck-harness/resume3/plan.json'
PLAN_SHA='576ebf9f01c0025cacc3bc6c7d6f4c747f8f84bb1f118a547cf11e21f7c94673'
WRAPPER=ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py'
WRAPPER_SHA='2846314e3ab12926bff6eb458d7058c406b983092fb40b1fb5c2fa087c2366df'
SOURCE='f9cbe66dd1aa700ebbb578203e84f6b24ec329b092e7f78c7ee9e12ab8dc9277'
DIST='698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210'
SUCCESSOR_PLAN_SHA='9391e76dd403d45a1c8ab09c428ed6884a762c326959cefa63c781633c687313'
SUCCESSOR_CATALOG_SHA='d96334bc0559bad126a82d6f84bd91a0ca1442288c713c764588173cec2e04ba'
ACCEPTED_MODES_SHA='86584b3f710109522709cf0195fdc8f20d30f10988e3ba71f80922e00de96036'
SKIPS_SHA='6bd2a808a40a707397757b3ff4f1a78e5eff8ee37666c7b26271582b14457cac'
PHASES=('full-check','compile-reconcile')
OVERLAY={
 'GuidedSessionIT.java':('4d47ad6f8d67bfd3278b0d3f3930085e90f190d0ea500875272082eb97a7754e','0a9cd30bf501089b5cbc17922e1f9809efd5f176c83f42359ad4ba0105a8ac59'),
 'GuidedLifecycleReasonIT.java':('8e5e4473c54e3884008ca63a3c87888ba6dcca514b5165f9dc40f8f20991613b','353bc8ebcf75d373203c58b016ead65648661cfdf47fa950d6230ac238ac7aa5'),
 'GuidedServiceTransportFaultIT.java':('97162010003856cdc7f55f411e286a70f381a664c78c2e5b5cde7d5415784db9','5317d3805950e562da4530433fcfdf660b1744e3b17cf58c5fa3f047b2176b15')}
QUALIFIABLE_EXECUTION_ERRORS={'CURRENT_GAP_REQUIRES_EXACT_QUALIFICATION','RECONCILE_OBSERVATION_NOT_CLEAN'}
class Hold(Exception):pass
def need(ok,code):
    if not ok:raise Hold(code)
def digest(data):return hashlib.sha256(data).hexdigest()
def compact(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def identities(rows):
    need(isinstance(rows,list),'IDENTITY_SET');out=[]
    for x in rows:
        need(type(x.get('pid')) is int and x['pid']>0 and isinstance(x.get('start'),str) and bool(x['start'].strip()),'IDENTITY_SET')
        out.append((x['pid'],x['start']))
    need(len(set(out))==len(out),'IDENTITY_SET');return set(out)
def accepted_files(base):
    values={x['path']:x['sha256'] for x in base['source']['files']}
    need(len(values)==1808 and base['source']['digest']=='061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617','ORIGINAL_PLAN_SOURCE')
    for name,(old,new) in OVERLAY.items():
        path='backend/src/test/java/com/citi/put/checks/studio/guided/session/'+name
        need(values.get(path)==old,'SOURCE_OVERLAY_ANCESTRY');values[path]=new
    result=[{'path':p,'sha256':h} for p,h in sorted(values.items())]
    need(digest(json.dumps(result,separators=(',',':')).encode())==SOURCE,'ACCEPTED_SOURCE_DIGEST');return result

def source_snapshot(b,s):
    need(s['sourceDigest']==SOURCE and s['sourceFiles']==1808 and s['files']==b['expectedFiles'],'SOURCE_CHECKPOINT')
    need(s['distDigest']==DIST and s['distFiles']==238 and s['mainFiles']==506,'SOURCE_DIST_MAIN')
    need(s['modesExact'] is True and s['auxiliariesExact'] is True and s['modes']==b['modes'],'SOURCE_MODES_AUX')

def validation_record(b):
    a=b['proofs']['assessment']
    return {'outcome':a['validationOutcome'],'rawNativeExit':a['nativeGradleExit'],
            'rawCollectorExit':a['collectorExit'],'rawHarnessExit':a['rawHarnessExit'],
            'validationErrors':a['validationErrors'],'evidenceErrors':a['evidenceErrors'],
            'rawFullCheckPhaseExit':b['receipts']['full-check']['phaseExit'],'phaseOutcomes':{k:{f:x[f] for f in ('collectorExit','phaseExit','rawNativePhaseExit')} for k,x in b['receipts'].items()},'phaseValidationErrors':{k:x['validationErrors'] for k,x in b['receipts'].items()},'executionClosureErrors':b['executionErrors'],'phaseEvidenceErrors':{k:x['evidenceErrors'] for k,x in b['receipts'].items()},'phaseObservationFlags':{k:{f:x.get(f,False) for f in ('interrupted','sourceObservationGap')} for k,x in b['receipts'].items()},'assessmentSha256':b['evidenceHashes']['full-check/assessment.json'],
            'catalogProofSha256':b['evidenceHashes']['full-check/catalog-proof.json'],
            'coverageProofSha256':b['evidenceHashes']['full-check/coverage-proof.json'],'C8Credit':False}

def qualification_basis(v):
    keys=('unitLabel','rootReleaseSha256','activeLockSha256','expectedWrapperExit','evidencePins','phaseState','source','build','validation','resources','gaps','historicalGapCodes')
    return digest(compact({k:v[k] for k in keys}))

def ready_requirements(b,requested):
    p,r,v,c=b['policy'],b['release'],b['ready'],b['pin']
    need(p['protocol']=='C8_UNLOCK_V1' and p['maxReadinessAgeSeconds']==60,'POLICY')
    need(re.fullmatch('[0-9a-f]{64}',b['expectedReleaseSha']) is not None and b['releaseSha']==b['expectedReleaseSha'],'RELEASE_HASH')
    label=r['label'];match=re.fullmatch(r'obs011-t0-c8-check(\d{2})',label)
    need(match is not None and int(match[1])>=1 and label==b['installedUnit'],'C8_INSTALLATION')
    need(r['authorizedBy']=='root' and r['immutableBasePlanSha256']==PLAN_SHA and r['sourceDigest']==SOURCE,'ROOT_ACCEPTED_SUBJECT')
    need(r['writers']==[] and r['nativeCommandReleased'] is True and r['fullAcceptedSuccessorFreshCheckAuthorized'] is True,'ZERO_WRITER_AUTHORITY')
    lease=r['sourceLease']
    need(lease=={'exclusive':True,'sourceDigest':SOURCE,'expectedPlanSha256':r['expectedPlanSha256'],'wholeSourceModes':True,'productWrites':False},'SOURCE_LEASE')
    need(type(r['maximumCollectorInvocations']) is int and r['maximumCollectorInvocations']==1 and type(r['maximumCompileReconcileInvocations']) is int and r['maximumCompileReconcileInvocations']==1,'ONE_UNIT_ONLY')
    need(b['planSha']==r['expectedPlanSha256']==SUCCESSOR_PLAN_SHA and b['catalogSha']==r['expectedCatalogSha256']==SUCCESSOR_CATALOG_SHA,'PLAN_CATALOG_BINDING')
    need(b['plan']['source']['files']==b['expectedFiles'] and b['plan']['source']['digest']==SOURCE,'NO_ARBITRARY_OVERLAY')
    need(b['modes']==b['acceptedModes'] and set(b['modes'])=={x['path'] for x in b['expectedFiles']},'WHOLE_SOURCE_MODE_ANCESTRY')
    need(all(type(c.get(k)) is int and c[k]>0 for k in ('wrapperPid','shellPid')) and all(isinstance(c.get(k),str) and c[k].strip() for k in ('wrapperStart','shellStart'))
         and isinstance(c.get('lockDevInode'),list) and len(c['lockDevInode'])==2 and all(type(x) is int and x>=0 for x in c['lockDevInode']),'ACTIVE_LOCK_SHAPE')
    need(c['rootUnitAuthorizationSha256']==b['releaseSha'] and c['kernelExclusiveLockObserved'] is True,'ACTIVE_PIN_AUTHORITY')
    u=r['unlockGuard'];need(u['enabled'] is True and u['protocol']==p['protocol'] and u['hashes']==b['codeHashes'],'GUARD_AUTHORITY_HASH')
    need(v['protocol']=='C8_UNLOCK_V1','READINESS_PROTOCOL')
    need(v['unitLabel']==label and v['rootReleaseSha256']==b['releaseSha'] and v['activeLockSha256']==b['activeSha'],'READINESS_UNIT_BINDING')
    need(type(requested) is int and 0<=requested<=255 and type(v['expectedWrapperExit']) is int and v['expectedWrapperExit']==requested,'EXPECTED_EXIT')
    need(v['status'] in ('VERIFIED','QUALIFIED_VERIFIED') and type(v['verificationExit']) is int and v['verificationExit']==0 and v['retroactiveRepairClaim'] is False,'FINAL_VERIFICATION')
    need(v['producerSha256']==r['controlPackagePins']['control/final_verifier.py'],'PRODUCER_HASH')
    need(v['expectedWrapperExit']==b['closureInput']['expectedWrapperExit'],'ROOT_CLOSE_REQUEST')
    need(set(p['requiredHistoricalGapCodes'])<=set(u['historicalGapCodes']) and v['historicalGapCodes']==u['historicalGapCodes'],'HISTORICAL_GAPS')
    need(v['evidencePins']==b['evidenceHashes'],'EVIDENCE_CHANGED')
    need(set(v['phaseState'])==set(PHASES) and v['phaseState']['full-check']=='TERMINAL','PHASE_ACCOUNTING')
    need(v['manualGaps']==b['closureInput']['manualGaps'] and len(set(v['manualGaps']))==len(v['manualGaps']),'MANUAL_GAP_BINDING')
    owned=set();gaps=set(v['manualGaps']);need(gaps<=set(p['gapKeys']),'GAP_SHAPE')
    for phase in PHASES:
        receipt=b['receipts'].get(phase);state=v['phaseState'][phase]
        need(state in ('TERMINAL','NOT_STARTED'),'PHASE_ACCOUNTING')
        if state=='NOT_STARTED':need(receipt is None,'UNEXPECTED_PHASE_RECEIPT');continue
        need(receipt is not None and receipt['phase']==phase and receipt['status']=='NATIVE_PHASE_TERMINAL'
             and receipt['rootUnitAuthorizationSha256']==b['releaseSha'] and receipt['lockPin']==c
             and receipt['phaseKeeperSha256']==r['phaseKeeperSha256'] and receipt['ownershipCoreSha256']==CORE_SHA
             and all(type(receipt[k]) is int for k in ('collectorExit','phaseExit','rawNativePhaseExit')),'PHASE_TERMINAL_BINDING')
        need(receipt['sourceWrites']==0 and receipt['automaticRetry'] is False,'NO_SOURCE_WRITE_OR_RETRY')
        need(type(receipt['collectorInvocations']) is int and receipt['collectorInvocations']==(1 if phase=='full-check' else 0)
             and type(receipt['compileReconcileInvocations']) is int and receipt['compileReconcileInvocations']==(1 if phase=='compile-reconcile' else 0),'PHASE_INVOCATION_ACCOUNTING')
        terminal=[x for x in receipt['phases'] if x.get('phase')=='NATIVE_PHASE_TERMINAL']
        need(len(terminal)==1 and terminal[0]['exit']==receipt['collectorExit'],'ACTUAL_PHASE_TERMINAL')
        owned|=identities(receipt['ownedIdentities'])
        need(not receipt.get('remainingOwnedNonJvmFacts'),'REMAINING_OWNED_FACTS')
        for extra in ('interrupted','sourceObservationGap'):
            need(type(receipt.get(extra,False)) is bool,'GAP_SHAPE')
            if receipt.get(extra,False):gaps.add('resourceObservationGap')
        for key in p['gapKeys']:
            need(type(receipt.get(key,False)) is bool,'GAP_SHAPE')
            if receipt.get(key,False):gaps.add(key)
    need(v['resources']['foregroundTerminal'] is True and v['resources']['recordedSetComplete'] is True,'RESOURCE_DISPOSITION')
    # Initial C8 scope includes no diagnostic/extra process action; separate adaptation required.
    need(v['resources']['extraOwned']==[],'UNREVIEWED_EXTRA_OWNERSHIP')
    need(identities(v['resources']['recordedOwned'])==owned,'OWNED_UNION')
    ports=v['resources']['ownedPorts'];need(ports==b['closureInput']['ownedPorts'],'OWNED_PORT_BINDING');need(isinstance(ports,list) and len(set(ports))==len(ports) and all(type(x) is int and 0<x<65536 for x in ports),'OWNED_PORTS')
    source=v['source'];need(source=={'disposition':'UNCHANGED_ACCEPTED_SUCCESSOR','digest':SOURCE,'overrides':{},'expectedPlanSha256':r['expectedPlanSha256']},'SOURCE_DISPOSITION')
    need(v['validation']==validation_record(b),'RAW_VALIDATION_PRESERVATION')
    a=b['proofs']['assessment'];need(a['errorClassificationComplete'] is True and a['unknownClassificationErrors']==[],'UNKNOWN_ERROR_CLASSIFICATION')
    need(isinstance(a['validationErrors'],list) and isinstance(a['evidenceErrors'],list),'ERROR_ARRAYS')
    need(set(b['executionErrors'])<=QUALIFIABLE_EXECUTION_ERRORS,'EXECUTION_PROOF_INCOHERENT')
    if a['evidenceErrors'] or b['executionErrors'] or any(x['evidenceErrors'] for x in b['receipts'].values()):gaps.add('resourceObservationGap')
    for s in (b['proofs']['sourceBefore'],b['proofs']['sourceAfter']):source_snapshot(b,s)
    outcome=v['validation']['outcome'];need(outcome in ('PASS','FAIL','INCOMPLETE'),'VALIDATION_OUTCOME')
    phase='full-check' if outcome=='PASS' else 'compile-reconcile'
    if outcome=='PASS':
        need(not a['validationErrors'] and not a['evidenceErrors'] and not b['executionErrors'] and a['fullGateSucceeded'] is True,'C8_GREEN_PROOF')
        need(all(type(a[k]) is int and a[k]==0 for k in ('nativeGradleExit','collectorExit','rawHarnessExit'))
             and b['receipts']['full-check']['phaseExit']==b['receipts']['full-check']['rawNativePhaseExit']==0,'C8_RAW_SUCCESS')
        need(v['phaseState']['compile-reconcile']=='NOT_STARTED' and b['receipts'].get('compile-reconcile') is None,'GREEN_NO_RECONCILE')
        need(requested==0 and not gaps,'GREEN_EXPECTED_EXIT')
    else:
        need(a['fullGateSucceeded'] is False and requested!=0 and v['phaseState']['compile-reconcile']=='TERMINAL','FAILED_C8_NONZERO_RECONCILE')
        auth=b['proofs']['reconcileAuthorization'];need(auth is not None and auth['decision']=='AUTHORIZE_ONE_COMPILE_RECONCILE'
             and auth['rootReleaseSha256']==b['releaseSha'] and auth['activeLockSha256']==b['activeSha']
             and auth['fullCheckReceiptSha256']==b['evidenceHashes']['owned-full-check/receipt.json']
             and auth['assessmentSha256']==b['evidenceHashes']['full-check/assessment.json']
             and type(auth['maximumInvocations']) is int and auth['maximumInvocations']==1 and auth['sourceDigest']==SOURCE
             and auth['authorizedBy']=='root' and auth['authorized'] is True and auth['phase']=='compile-reconcile'
             and auth['preservedEvidenceSha256']==b['evidenceHashes']['full-check/preserved-public-evidence.json']
             and auth['sourceBeforeSha256']==b['evidenceHashes']['full-check/source-before.json']
             and auth['sourceAfterSha256']==b['evidenceHashes']['full-check/source-after.json'],'SEPARATE_RECONCILE_AUTHORITY')
        source_snapshot(b,b['proofs']['reconcileSourceBefore']);source_snapshot(b,b['proofs']['reconcileSourceAfter'])
    build=v['build'];proof=b['proofs']['buildProvenance']
    need(build=={'phase':phase,'exit':0,'sourceDigest':SOURCE,'provenanceSha256':b['evidenceHashes'][phase+'/build-provenance.json']},'BUILD_DISPOSITION')
    need(b['receipts'][phase]['collectorExit']==0 and proof['phase']==phase and proof['exit']==0 and proof['taskStatus']=='EXECUTED'
         and proof['buildSuccessful'] is True and proof['acceptedSourceEqual'] is True and proof['sourceDigest']==SOURCE,'ACTUAL_BUILD_PROOF')
    expected_command=['./gradlew','--offline','compileTestJava','--rerun-tasks','--no-daemon'] if phase=='compile-reconcile' else ['caffeinate','-i','./gradlew','--continue','check','--rerun-tasks','--no-daemon']
    need(proof['command']==expected_command,'FIXED_BUILD_COMMAND')
    need(proof['phaseReceiptSha256']==b['evidenceHashes']['owned-'+phase+'/receipt.json']
         and proof['sourceBeforeSha256']==b['evidenceHashes'][phase+'/source-before.json']
         and proof['sourceAfterSha256']==b['evidenceHashes'][phase+'/source-after.json'],'BUILD_SOURCE_RECEIPT_HASH')
    need(set(v['gaps'])==gaps,'STICKY_GAPS')
    if gaps:
        qa,root=b.get('qa'),b.get('rootQualification');basis=qualification_basis(v)
        need(v['status']=='QUALIFIED_VERIFIED' and qa is not None and root is not None and requested!=0,'QUALIFICATION_REQUIRED')
        for q in (qa,root):
            need(q['unitLabel']==label and q['rootReleaseSha256']==b['releaseSha'] and q['qualificationEvidenceSha256']==basis
                 and q['gaps']==v['gaps'] and q['acceptCurrentQualifiedClosure'] is True and q['historicalRepairClaim'] is False,'QUALIFICATION_SCOPE')
        need(qa['role']=='independent-qa' and qa['independentOfRunner'] is True and root['role']=='root' and root['qaQualificationSha256']==b['qaSha'],'INDEPENDENT_QUALIFICATION')
    else:need(v['status']=='VERIFIED','QUALIFICATION_SHAPE')
    return owned,set(ports),gaps

def requirements(b,requested):
    owned,ports,gaps=ready_requirements(b,requested);a,v=b['permit'],b['ready']
    need(a['decision']=='AUTHORIZE_LOCK_RELEASE' and a['readinessSha256']==b['readinessSha'],'READINESS_HASH')
    for key in ('unitLabel','rootReleaseSha256','activeLockSha256','expectedWrapperExit','evidencePins','phaseState','source','build','validation','resources','gaps','historicalGapCodes'):
        need(a[key]==v[key],'PERMIT_STATE_MISMATCH')
    if gaps:
        need(a['qualificationEvidenceSha256']==qualification_basis(v) and a['qaQualificationSha256']==b['qaSha'] and a['rootQualificationSha256']==b['rootQualificationSha'],'QUALIFICATION_HASH')
    return owned,ports,gaps

def fresh(b,now):
    stamp=b['ready']['verifiedAtEpoch'];need(type(stamp) in (int,float) and math.isfinite(stamp) and 0<=now-stamp<=b['policy']['maxReadinessAgeSeconds'],'STALE_READINESS')
def current_observation_requirements(b,live):
    need(live['observationOk'] and live['parentLockCurrent'],'CURRENT_LOCK_OR_OBSERVATION')
    need(live['sourceDigest']==SOURCE and live['modesMatch'] and live['auxiliaryInputsMatch'] and live['metadataUnchanged'],'CURRENT_SOURCE_OR_EVIDENCE')
    need(not live['liveOwned'] and not live['unexpectedHolderDescendants'] and not live['liveOwnedPorts'],'LIVE_OWNED_RESOURCE')
    need(live['inheritedMatched']==6 and not live['boundaryDefects'],'INHERITED_OR_PROJECT_BOUNDARY')

def assess(b,live,now,requested):
    _,_,gaps=requirements(b,requested);fresh(b,now);current_observation_requirements(b,live)
    return {'decision':'ALLOW_QUALIFIED' if gaps else 'ALLOW_VERIFIED','gapsPreserved':sorted(gaps),'expectedWrapperExit':requested,'C8Credit':False}

def safe_bytes(path):
    path=Path(path);need(path.is_relative_to(ROOT) and not path.is_symlink(),'UNSAFE_METADATA')
    need(all(not p.is_symlink() for p in path.parents if p!=ROOT),'UNSAFE_METADATA')
    before=path.stat();need(stat.S_ISREG(before.st_mode),'UNSAFE_METADATA')
    data=path.read_bytes();after=path.stat()
    need((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==
         (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns),'FILE_CHANGED')
    return data

def observe_source(b,scope):
    need(digest(safe_bytes(PLAN))==PLAN_SHA,'BASELINE_PLAN_HASH');plan=json.loads(safe_bytes(PLAN))
    need(accepted_files(plan)==b['expectedFiles'],'ACCEPTED_PLAN_DERIVATION')
    expected={x['path']:x['sha256'] for x in b['expectedFiles']}
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
    return digest(json.dumps(actual,separators=(',',':')).encode())

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
    need(rows[shell_pid]['ppid']==wrapper and rows[wrapper]['argvHash']==pin['wrapperArgvSha256']
         and rows[shell_pid]['argvHash']==pin['shellArgvSha256'],'HOLDER_ARGV_PARENT')
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
    owned,ports,_=ready_requirements(b,b['requested'])
    source_digest=observe_source(b,scope)
    plan=json.loads(safe_bytes(PLAN))
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
    scope['ROOT']=ROOT
    boundary_scope={}
    tree=ast.parse(safe_bytes(CORE).decode())
    names={'sha','utc','regular','capture','pid_text','table','identity','project_role','boundary_inventory'}
    nodes=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom)) or isinstance(n,ast.FunctionDef) and n.name in names]
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<pinned-boundary-functions>','exec'),boundary_scope)
    boundary_scope['ROOT']=ROOT
    boundary=boundary_scope['boundary_inventory'](plan)
    defects=any(boundary[n] for n in ('inheritedIdentityChanged','incompleteStableIdentities','otherProjectFacts'))
    return {'observationOk':True,'parentLockCurrent':True,'liveOwned':live_owned,
            'unexpectedHolderDescendants':sorted(unexpected),'liveOwnedPorts':live_ports,
            'sourceDigest':source_digest,
            'modesMatch':True,'auxiliaryInputsMatch':True,
            'metadataUnchanged':all(digest(safe_bytes(p))==h for p,h in b['loadedHashes'].items()),
            'inheritedMatched':len(boundary['inheritedMatched']),'boundaryDefects':defects,'boundary':boundary}

def load_packet(expected_release,load_ready=True):
    need(re.fullmatch('[0-9a-f]{64}',expected_release) is not None,'EXACT_ROOT_BINDING_REQUIRED')
    need(HERE.name=='control' and UNIT.parent==T0/'runtime' and re.fullmatch(r'obs011-t0-c8-check\d{2}',UNIT.name),'FUTURE_INSTALLATION_REQUIRED')
    loaded={};evidence={}
    def pairs(rows):
        out={}
        for k,v in rows:need(k not in out,'DUPLICATE_METADATA_KEY');out[k]=v
        return out
    def read(path,proof=False,evidence_key=None):
        data=safe_bytes(path);need(len(data)<=16*1024*1024,'METADATA_BOUND')
        loaded[path]=digest(data)
        if proof:evidence[evidence_key or str(path.relative_to(UNIT))]=loaded[path]
        return json.loads(data,object_pairs_hook=pairs,parse_constant=lambda value: (_ for _ in ()).throw(Hold('NONFINITE_METADATA')))
    release=read(UNIT/'root-actual-unit-release.json')
    need(loaded[UNIT/'root-actual-unit-release.json']==expected_release,'RELEASE_HASH')
    policy=read(HERE/'policy.json');pin=read(UNIT/'active-lock.json');modes=read(UNIT/'input-modes.json',True)
    closure_input=read(UNIT/'closure-input.json',True)
    need(closure_input['unitLabel']==UNIT.name and closure_input['rootReleaseSha256']==expected_release and closure_input['activeLockSha256']==loaded[UNIT/'active-lock.json'],'CLOSURE_INPUT_BINDING')
    for field,prefix in [('executionPackagePins','execution/'),('controlPackagePins','control/')]:
        pins=release[field];need(isinstance(pins,dict) and bool(pins),'PACKAGE_PINS')
        for rel,h in pins.items():
            need(rel.startswith(prefix) and '..' not in Path(rel).parts and not Path(rel).is_absolute(),'PACKAGE_SCOPE')
            path=UNIT/rel;need(digest(safe_bytes(path))==h,'PACKAGE_HASH');loaded[path]=h
    for rel in ['control/unlock_gate.py','control/guard-exit.bash','control/policy.json','control/final_verifier.py','control/postclose.py']:
        need(rel in release['controlPackagePins'],'CONTROL_PACKAGE_MEMBERSHIP')
    for rel in ['execution/execution_checks.py','execution/successor-plan.json','execution/successor-catalog.json']:
        need(rel in release['executionPackagePins'],'EXECUTION_PACKAGE_MEMBERSHIP')
    need(release['phaseKeeperSha256']==release['executionPackagePins']['execution/phase_keeper.py'],'KEEPER_CODE_LINK')
    admission=read(UNIT/'guard-admission-negative-result.json',True);held=read(UNIT/'held-preflight.json',True)
    need(admission['rootUnitAuthorizationSha256']==expected_release and admission['activeLockSha256']==loaded[UNIT/'active-lock.json']
         and admission['denial']=='FINAL_VERIFICATION_REQUIRED' and admission['exitStatus']==1,'ACTUAL_ADMISSION_DENIAL')
    need(held['rootUnitAuthorizationSha256']==expected_release and held['activeLockSha256']==loaded[UNIT/'active-lock.json']
         and held['sameHolderProved'] is True and held['kernelLockHeld'] is True and held['sourceDigest']==SOURCE
         and held['competingHeavyUnitAbsent'] is True,'SAME_HELD_PREFLIGHT')
    plan=read(UNIT/'execution/successor-plan.json');catalog=read(UNIT/'execution/successor-catalog.json')
    need(digest(safe_bytes(PLAN))==PLAN_SHA,'IMMUTABLE_BASE_PLAN');base=json.loads(safe_bytes(PLAN))
    expected=accepted_files(base)
    mode_pin=plan['acceptedModes'];mode_path=ROOT/mode_pin['path']
    need(mode_path==T0/'runtime/gst-restricted-unit06/original-modes.json' and digest(safe_bytes(mode_path))==mode_pin['sha256']==ACCEPTED_MODES_SHA,'ACCEPTED_MODES_HASH')
    accepted_modes=json.loads(safe_bytes(mode_path));loaded[mode_path]=mode_pin['sha256']
    receipts={}
    for phase in PHASES:
        path=UNIT/f'owned-{phase}/receipt.json'
        if path.exists():receipts[phase]=read(path,True)
    proofs={}
    for key,rel in [('outerReceipt','full-check/outer-receipt.json'),('assessment','full-check/assessment.json'),('catalogProof','full-check/catalog-proof.json'),('coverageProof','full-check/coverage-proof.json'),('publicJoinProof','full-check/public-join-proof.json'),('preservedPublicEvidence','full-check/preserved-public-evidence.json'),('sourceBefore','full-check/source-before.json'),('sourceAfter','full-check/source-after.json')]:
        proofs[key]=read(UNIT/rel,True)
    raw_path=ROOT/'docs/qa/evidence/STUDIO-OBS-011/execution'/f'{UNIT.name}-results.json'
    raw=read(raw_path,True,'native-results.json');proofs['rawCollector']=raw
    a=proofs['assessment'];cat=proofs['catalogProof'];preserved=proofs['preservedPublicEvidence']
    need(a['validationOutcome'] in ('PASS','FAIL','INCOMPLETE') and type(a['fullGateSucceeded']) is bool
         and a['fullGateSucceeded']==(a['validationOutcome']=='PASS'),'ASSESSMENT_OUTCOME_CONSISTENCY')
    need(proofs['outerReceipt']==receipts['full-check'],'RAW_OUTER_ENVELOPE_LINK')
    need(a['rawCollectorReceiptSha256']==evidence['native-results.json']==cat['rawCollectorReceiptSha256'],'RAW_COLLECTOR_LINK')
    need(a['catalogProofSha256']==evidence['full-check/catalog-proof.json'] and cat['catalogSha256']==loaded[UNIT/'execution/successor-catalog.json'],'CATALOG_PROOF_LINK')
    need(a['coverageProofSha256']==evidence['full-check/coverage-proof.json']==preserved['coverageProofSha256'],'COVERAGE_PROOF_LINK')
    need(a['publicJoinProofSha256']==evidence['full-check/public-join-proof.json'],'PUBLIC_JOIN_PROOF_LINK')
    need(a['nativeGradleExit']==raw['gradleExit'] and a['collectorExit']==raw['exit'] and a['rawHarnessExit']==receipts['full-check']['collectorExit'],'RAW_EXIT_LINK')
    need(a['validationErrors']==receipts['full-check']['validationErrors'],'PHASE_VALIDATION_ERROR_LINK')
    need(a['rawTaskCollectionErrors']==raw['taskCollectionErrors'] and a['rawHarnessEvidenceErrors']==receipts['full-check']['evidenceErrors'],'RAW_ERROR_LINK')
    for key in policy['gapKeys']+['interrupted','sourceObservationGap']:
        need(a['rawHarnessGapFlags'].get(key,False)==receipts['full-check'].get(key,False),'RAW_GAP_LINK')
    if a['validationOutcome']=='PASS':
        need(a['publicJoinComplete'] is True and proofs['publicJoinProof']['errors']==[],'ACTUAL_PUBLIC_JOINS_REQUIRED')
        need(cat['cases']==2774 and cat['actualTaskCounts']=={'test':2710,'guidedIncrementalTest':62,'crossReplicaTest':2}
             and cat['actualStatusCounts']=={'PASS':2765,'SKIP':9} and cat['noExclusions'] is True,'FULL_CATALOG_COUNTS')
        need(raw['explicitTestTasks']==['test','guidedIncrementalTest','crossReplicaTest']
             and set(raw['requiredFreshExecTasks'])=={'test','guidedIncrementalTest','crossReplicaTest'}
             and all(raw[k] is True for k in ('sourceStable','distStable','testInputStable','taskCollectionComplete')),'ACTUAL_C8_COLLECTION_SCOPE')
    failed=proofs['assessment']['validationOutcome']!='PASS'
    build_phase='compile-reconcile' if failed else 'full-check'
    proofs['buildProvenance']=read(UNIT/build_phase/'build-provenance.json',True)
    proofs['reconcileAuthorization']=None
    if failed:
        proofs['reconcileAuthorization']=read(UNIT/'compile-reconcile-authorization.json',True)
        proofs['reconcileSourceBefore']=read(UNIT/'compile-reconcile/source-before.json',True)
        proofs['reconcileSourceAfter']=read(UNIT/'compile-reconcile/source-after.json',True)
    else:
        need(not (UNIT/'compile-reconcile-authorization.json').exists() and not (UNIT/'owned-compile-reconcile/receipt.json').exists(),'GREEN_RECONCILE_NOT_STARTED')
    # This future read projects only exact task/status facts and exports no raw log content.
    log=UNIT/'owned-compile-reconcile/collector.private.log' if failed else ROOT/'docs/qa/evidence/STUDIO-OBS-011/execution'/f'{UNIT.name}.log'
    data=safe_bytes(log);need(digest(data)==proofs['buildProvenance']['taskLogSha256'],'ACTUAL_BUILD_LOG_HASH')
    lines=data.decode('utf-8').splitlines()
    need(lines.count('> Task :compileTestJava')==1 and any(x.startswith('BUILD SUCCESSFUL in ') for x in lines),'ACTUAL_EXECUTED_COMPILE_REQUIRED')
    if not failed:
        for task in ['test','guidedIncrementalTest','crossReplicaTest','requireFreshGuidedPartitions','jacocoTestReport','jacocoTestCoverageVerification','check']:
            need(lines.count('> Task :'+task)==1,'ACTUAL_EXECUTED_C8_TASK_REQUIRED')
    loaded[log]=digest(data)
    module_path=UNIT/'execution/execution_checks.py'
    code=safe_bytes(module_path);need(digest(code)==release['executionPackagePins']['execution/execution_checks.py'],'EXECUTION_CHECKS_CODE_HASH')
    namespace={'__name__':'c8_exact_execution_checks','__file__':str(module_path)}
    exec(compile(code,str(module_path),'exec'),namespace)
    validation_input={'fullCheckReceipt':receipts.get('full-check'),'assessment':proofs['assessment'],'catalogProof':proofs['catalogProof'],'coverageProof':proofs['coverageProof'],
        'buildProvenance':proofs['buildProvenance'],'reconcileReceipt':receipts.get('compile-reconcile'),'reconcileAuthorization':proofs['reconcileAuthorization'],
        'sourceBefore':proofs['sourceBefore'],'sourceAfter':proofs['sourceAfter'],'evidencePins':evidence,'expectedWrapperExit':1 if failed else 0}
    if not failed:
        skips_path=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/approved-skips.json'
        skips=read(skips_path,True,'approved-skips.json');need(loaded[skips_path]==SKIPS_SHA,'EXACT_SKIP_POLICY_HASH')
        need(namespace['catalog_errors'](raw['testcases'],catalog,skips)==[],'ACTUAL_2774_STATUS_MULTISET')
    execution_errors=namespace['validate_close_evidence'](validation_input)
    need(isinstance(execution_errors,list) and all(isinstance(x,str) for x in execution_errors),'EXECUTION_ERROR_SCHEMA')
    b={'release':release,'policy':policy,'pin':pin,'modes':modes,'acceptedModes':accepted_modes,'expectedFiles':expected,'plan':plan,'catalog':catalog,
       'releaseSha':expected_release,'expectedReleaseSha':expected_release,'activeSha':loaded[UNIT/'active-lock.json'],'installedUnit':UNIT.name,
       'planSha':loaded[UNIT/'execution/successor-plan.json'],'catalogSha':loaded[UNIT/'execution/successor-catalog.json'],
       'receipts':receipts,'proofs':proofs,'executionErrors':execution_errors,'evidenceHashes':evidence,'loadedHashes':loaded,
       'closureInput':closure_input,'codeHashes':{n:digest(safe_bytes(HERE/n)) for n in ['unlock_gate.py','guard-exit.bash','policy.json']}}
    for key,rel in [('qa','independent-unlock-qualification.json'),('rootQualification','root-unlock-qualification.json')]:
        path=UNIT/rel
        if path.exists():b[key]=read(path);b[key+'Sha']=loaded[path]
    if load_ready:
        b['ready']=read(UNIT/'preunlock-verification.json');b['readinessSha']=loaded[UNIT/'preunlock-verification.json'];b['permit']=read(UNIT/'unlock-permit.json')
        read(UNIT/'final-resource-boundary.json')
        need(loaded[UNIT/'final-resource-boundary.json']==b['ready']['resourceBoundarySha256'],'FINAL_BOUNDARY_HASH')
    return b

def main():
    need(len(sys.argv)==4,'INVOCATION');expected,shell,requested=sys.argv[1],int(sys.argv[2]),int(sys.argv[3])
    need(re.fullmatch('[0-9a-f]{64}',expected) is not None,'EXACT_ROOT_BINDING_REQUIRED')
    need(HERE.name=='control' and UNIT.parent==T0/'runtime' and re.fullmatch(r'obs011-t0-c8-check\d{2}',UNIT.name),'FUTURE_INSTALLATION_REQUIRED')
    need((UNIT/'preunlock-verification.json').is_file(),'FINAL_VERIFICATION_REQUIRED')
    b=load_packet(expected);b['requested']=requested
    requirements(b,requested);fresh(b,time.time())
    result=assess(b,observe(b,shell),time.time(),requested)
    print(json.dumps(result));return 0
if __name__=='__main__':
    try:code=main()
    except BaseException as error:
        print(json.dumps({'decision':'HOLD','reason':str(error) if type(error) is Hold else 'MISSING_OR_MALFORMED_PROOF','shellMustRemainHeld':True,'C8Credit':False}));code=1
    sys.exit(code)
