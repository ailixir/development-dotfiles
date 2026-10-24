"""One-use evidence producer47. Calls only the pinned original metadata helpers and reviewed copy transaction."""
from pathlib import Path
import datetime, hashlib, json, os, shutil, stat, subprocess, sys

if sys.flags.optimize != 0:
    raise RuntimeError('PYTHON_OPTIMIZATION_FORBIDDEN')
os.umask(0o077)
R = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
N = R/'docs/qa/evidence/STUDIO-OBS-009/recovery-20261020'
P = N/'benchmark-wire-lint-actual-preflight47'
B = N/'benchmark-wire-lint-actual-bound47'
O = N/'benchmark-wire-lint-actual-adoption47'
PREP = N/'benchmark-wire-lint-adoption45-preparation'
C = N/'benchmark-wire-lint-candidate44'
Q = N/'benchmark-wire-lint-source46-independent-review'
F = R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/actual-runner-final-gates01'
targets = {
    'studio-runner/evaluation/observed-authoring/evaluate.mjs': ('15d2bcd0ee2bb227f0b54307b6a50608e720f68e89b6726d6cc57c55beb96523',125912,'b9c95ddcee770fe1b88ea56587627f7bb5c6dc461c9687df08229a786244a518',125913),
    'studio-runner/test/evaluation/harnessSelfTest.test.ts': ('09d68060f6f0c3fafc27dea6a7938d950d050940a1522511a0742065e14b09b7',65996,'9b3c5f987f98f8ec620daa88e2453ff3126551ea5687036bd2384f8c036fca64',66052),
}
steps = []
stage = 'INITIAL'
copy_attempted = False
copy_raw_exit = None
refs = {}
def sha(data):
    return hashlib.sha256(data).hexdigest()
def require(ok, label):
    if not ok:
        raise RuntimeError(label)
def read(path, expected=None):
    path = Path(path)
    fd = os.open(path, os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as f:
        a = os.fstat(f.fileno())
        require(stat.S_ISREG(a.st_mode),'REGULAR_FILE_REQUIRED')
        data = f.read()
        z = os.fstat(f.fileno())
    require((a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns)==(z.st_dev,z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns),'UNSTABLE_READ')
    if expected is not None:
        require(sha(data)==expected,'REFERENCE_HASH_MISMATCH')
    return data
def rel(path):
    return str(Path(path).relative_to(R))
def reference(path, expected=None):
    data = read(path,expected)
    return {'path':rel(path),'sha256':sha(data),'bytes':len(data)}
def load(path, expected=None):
    return json.loads(read(path,expected))
def emit(path,value):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as f:
        f.write((json.dumps(value,indent=2)+'\n').encode());f.flush();os.fsync(f.fileno())
def verified_manifest(path, expected, byte_count=None):
    data=read(path,expected)
    if byte_count is not None:
        require(len(data)==byte_count,'MANIFEST_SIZE_MISMATCH')
    value=json.loads(data)
    for row in value['files']:
        p=Path(row['path'])
        if str(p).startswith('docs/') or str(p).startswith('.aiox/'):
            p=R/p
        else:
            p=path.parent/p
        raw=read(p,row['sha256'])
        require(len(raw)==row['bytes'],'SEALED_ARTIFACT_SIZE_MISMATCH')
    return value
def guarded_code(path, expected, size):
    p=R/path
    q=p
    while q!=R:
        require(not q.is_symlink(),'CODE_SYMLINK_REFUSED');q=q.parent
    raw=read(p,expected)
    require(len(raw)==size and stat.S_IMODE(p.stat().st_mode)==0o644,'CODE_SIZE_OR_MODE_MISMATCH')
    return {'path':path,'sha256':sha(raw),'bytes':len(raw),'mode':'0o644','regular':True,'noSymlinkComponents':True}
def mf_guard():
    return guarded_code('studio-runner/evaluation/observed-authoring/manifest.json','6bc320ac60eebb2dda423ab8e44e66462a5765877991f9bc9000e46d940a9b7b',79287)
def hash_mode(path):
    p=Path(path).resolve(strict=True)
    raw=read(p)
    return {'resolvedPath':str(p),'sha256':sha(raw),'mode':oct(stat.S_IMODE(p.stat().st_mode))}
def runtime_guard(binding, old25, links, env):
    rows=[]
    for row in binding['actualCanonical5Pins']:
        p=R/'studio-runner/node_modules'/row['relativePath']; got=hash_mode(p)
        require(got['sha256']==row['sha256'] and got['mode']==row['mode'],'CANONICAL_GUARD_MISMATCH')
        rows.append({'role':'canonical','path':rel(p),**got})
    for row in binding['protected']:
        p=R/row['path'];got=hash_mode(p)
        require(got['sha256']==row['sha256'] and got['mode']==row['mode'],'PROTECTED_GUARD_MISMATCH')
        rows.append({'role':'protected','path':row['path'],**got})
    measured_env={k:{'present':k in env,'valueSha256':sha(env[k].encode()) if k in env else None} for k in binding['environment']}
    require(measured_env==binding['environment'] and len(measured_env)==11,'ENV11_GUARD_MISMATCH')
    current_links=[]
    require(len(links)==21,'BIN21_REFERENCE_COUNT')
    for row in links:
        p=R/row['path'];s=p.lstat()
        require(stat.S_ISLNK(s.st_mode),'BIN_LINK_REQUIRED')
        got={'path':row['path'],'target':os.readlink(p),'mode':oct(stat.S_IMODE(s.st_mode)),'device':s.st_dev,'inode':s.st_ino}
        require(got==row,'BIN21_GUARD_MISMATCH');current_links.append(got)
    node_path=shutil.which('node',path=env['PATH']);pnpm_path=shutil.which('pnpm',path=env['PATH'])
    require(node_path==binding['nodePathPrefix']+'/node','NODE_PATH_MISMATCH')
    require(pnpm_path==old25['resolvedExistingPnpmPath']=='/opt/homebrew/bin/pnpm','PNPM_PATH_MISMATCH')
    node=hash_mode(node_path);pnpm=hash_mode(pnpm_path)
    require(node['sha256']==old25['nodeBinarySha256']=='9d050fd455b56426e25d4d603c7c501cbb2630348e836cf221dcce748e90588a','NODE_BINARY_MISMATCH')
    require(pnpm['sha256']==old25['resolvedExistingPnpmSha256']=='b276da51dc8ca5b0d3ee3371695b50fc8b3244b281b091c63a3f082a88dadeb9','PNPM_BINARY_MISMATCH')
    require(node['mode']=='0o755' and pnpm['mode']=='0o755','RUNTIME_MODE_MISMATCH')
    return {'node':node,'pnpm':pnpm,'nodeLookupPath':node_path,'pnpmLookupPath':pnpm_path,'canonical5AndProtected11':rows,'environment11':measured_env,'bin21':current_links,'allMatched':True,'nodeOrPnpmVersionCommandRun':False,'sdkBodiesDisclosed':False}
def run_original(argv,prefix,env):
    require(sys.flags.optimize==0 and 'PYTHONOPTIMIZE' not in env,'OPTIMIZATION_GUARD')
    out=Path(str(prefix)+'.stdout.private');err=Path(str(prefix)+'.stderr.private')
    with out.open('xb') as so,err.open('xb') as se:
        result=subprocess.run(argv,cwd=R,env=env,stdout=so,stderr=se)
    row={'argv':argv,'rawExit':result.returncode,'stdoutReference':reference(out),'stderrReference':reference(err)}
    steps.append(row)
    emit(Path(str(prefix)+'.launch.json'),row)
    require(result.returncode==0,'ORIGINAL_COMMAND_NONZERO')
    return result.returncode
def seal():
    files=[]
    for directory in [P,B,O]:
        if not directory.exists():
            continue
        for path in sorted(directory.rglob('*')):
            if path.is_file() and path!=O/'manifest.json':
                files.append(reference(path))
    emit((O if O.exists() else P)/'manifest.json',{'kind':'ACTUAL_TWO_TARGET_LINT_ADOPTION47_PRODUCER_SEAL','pathBase':'repository root','files':files,'fileCount':len(files),'copyAttempted':copy_attempted,'copyRawExit':copy_raw_exit,'executionFurtherCommandsGo':False,'testsRun':False,'corpusMutation':False,'independentReviewPending':True})

try:
    require(not O.exists() and not O.is_symlink(),'ADOPTION47_MUST_BE_FRESH')
    emit(P/'namespace-custody.json',{'allThreeNamespacesAbsentBeforeFirstOwnedWrite':True,'freshPreflightAndBoundCreated0700':True,'adoption47StillAbsent':True,'umask':'077','pythonOptimization':sys.flags.optimize,'rootAttestsNamedPriorJobsAndWrappersTerminal':True,'priorJobHandles':[17379,8955,95212,49718],'allOsAbsenceClaim':False,'soleActualWriter':'producer47 under root delegated conditional admission','runtimeConsumersHeldByRoot':True})
    stage='VERIFY_IMMUTABLE_PREREQUISITES'
    prep=verified_manifest(PREP/'manifest.json','5cdb187400fecd35ece7c359d6a90b1e7878da9754ecd9e2adbe695f81cac6fd',1277)
    candidate=verified_manifest(C/'manifest.json','cd1fca0b83e33d8c9efec515ec4f36f90a65e4cf4fba4facf2c1eba8ae589411',1655)
    qa=verified_manifest(Q/'manifest.json','cf7490277c48f7e99fc9b98183066aae5f638ef26a44315b81a1db64eb8cb7dd',945)
    require(qa['verdict']=='SOURCE_LINT_CANDIDATE44_AND_TWO_TARGET_TRANSACTION45_ACCEPTED_FOR_FUTURE_BOUND_ADOPTION' and qa['findingCount']==0,'SOURCE46_NOT_ACCEPTED')
    sums=read(C/'SHA256SUMS','42a27720d9b88976acea1de6df7fbed266cbbd40049c3d4f704af40f30069b52').decode().splitlines()
    require(len(sums)==6,'CANDIDATE_SUMS_COUNT')
    for line in sums:
        digest,name=line.split(maxsplit=1);name=name.lstrip('*')
        require(sha(read(C/name))==digest,'CANDIDATE_SUMS_MISMATCH')
    commands=load(PREP/'commands.json')
    for label,row in commands['originalCaptureRefs'].items():
        refs[label]=reference(R/row['path'],row['sha256'])
    refs['script']=reference(PREP/'apply-reviewed-two.py.txt','e394437b902251e6b8494b7e9d04cf03b7a02fa6873dfa9af51893046d79e3ad')
    refs['candidateSeal']=reference(C/'manifest.json');refs['sourceQa46']=reference(Q/'manifest.json');refs['preparation45']=reference(PREP/'manifest.json')
    refs['closure011']=reference(R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/final-root-closure20/obs011-source-freeze-release.json','3caf132496885cfdce4e0889366f55c6e926b866afe57b7f2fd282c643e079ad')
    refs['priorQa39']=reference(N/'benchmark-wire-actual-adoption-corpus39-independent-review/manifest.json','5723e2c40a68a12ac268cb25e5f52142ce4e7e6915d8ab9268c4515022f8f4e3')
    for name,source in [('task-context.txt','.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/obs009-wire-lint-actual-adoption47-context.txt'),('model-policy.json','.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/subagent-model-policy-20261021-sol61-high.json')]:
        data=read(R/source)
        fd=os.open(B/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb') as f:f.write(data)
        refs[name]=reference(B/name)
        refs[name]['sourceReference']=reference(R/source)
    binding=load(F/'runtime-input-binding.json','c72b9a8983664bc09d8fdb11c082f00c1d4a78f5d5f191d552902799bdb271ea')
    old25=load(N/'benchmark-wire-actual-preflight25/fresh-metadata25-receipt.json','5502faeeb91a972db159ab0690504d5aa159288f8bd3801a49c1e48531df02ab')
    links=load(F/'initial21-bin-links.json','284ae82a7b4f2c0b0b002d16fdef8cac63ff83d9c9588432772e975df5544ca1')
    refs['runtimeBinding']=reference(F/'runtime-input-binding.json');refs['priorRuntime25']=reference(N/'benchmark-wire-actual-preflight25/fresh-metadata25-receipt.json');refs['bin21']=reference(F/'initial21-bin-links.json')
    baseline_manifest=N/'benchmark-wire-proof-continuation41-execution/manifest.json'
    baseline=load(baseline_manifest,'9f4f9da8ff701fb9aebfa2cb590dcef23915d16f47bde54e3c96eb97946638ea')
    refs['baseline41Manifest']=reference(baseline_manifest)
    baseline_rows={row['path']:row for row in baseline['files']}
    def baseline_by_suffix(suffix):
        matches=[row for row in baseline['files'] if row['path'].endswith(suffix)]
        require(len(matches)==1,'BASELINE41_REFERENCE_AMBIGUOUS')
        row=matches[0];value=load(R/row['path'],row['sha256'])
        require((R/row['path']).stat().st_size==row['bytes'],'BASELINE41_SIZE_MISMATCH')
        return value,dict(row)
    old_source,refs['baseline41LintSource']=baseline_by_suffix('/lint01-guard-after-source.json')
    old_full,refs['baseline41LintFull']=baseline_by_suffix('/lint01-after-full-inputs.json')
    receipt_row=baseline_rows[rel(N/'benchmark-wire-proof-continuation41-execution/receipt.json')]
    refs['baseline41Receipt']=reference(R/receipt_row['path'],'49961f6f3ddd8dd8b33f5981750ad9fe2e05cce6dcd0a9973e0862697ffd0e37')
    before_targets=[guarded_code(path,values[0],values[1]) for path,values in targets.items()]
    before_mf=mf_guard()
    for path,values in targets.items():
        data=read(C/path,values[2]);require(len(data)==values[3] and stat.S_IMODE((C/path).stat().st_mode)==0o644,'CANDIDATE_SIZE_OR_MODE_MISMATCH')
    env=dict(os.environ);env.pop('PYTHONOPTIMIZE',None);env['PATH']=binding['nodePathPrefix']+':'+env.get('PATH','')
    before_runtime=runtime_guard(binding,old25,links,env)
    emit(P/'before-runtime-qualification.json',before_runtime)
    stage='ORIGINAL_BEFORE_CAPTURES'
    for index in [0,1]:
        argv=commands['futureMetadataCommands'][index]['argv']
        require(not Path(argv[-1]).exists(),'FRESH_CAPTURE_PATH_REQUIRED')
        run_original(argv,P/('before-capture'+str(index)),env)
    before_source=load(P/'before-source.json');before_full=load(P/'before-full-inputs.json')
    require(before_source['files']==old_source['files'] and before_source['digest']==old_source['digest']=='0cbbf17558419ee44e1e24a98e437d7a73ff053ec54ac290058efcb0d947c928','FRESH_SOURCE_BASELINE_DRIFT')
    require(before_source['dist']==old_source['dist'] and before_source['dist']['digest']=='e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1','FRESH_DIST_BASELINE_DRIFT')
    require(before_full==old_full,'FRESH_FULL_INPUT_BASELINE_DRIFT')
    require((len(before_source['files']),len(before_source['dist']['files']),len(before_full['copyProfileFiles']),len(before_full['inputFiles']))==(1814,238,13995,13757),'BEFORE_ROW_COUNTS_MISMATCH')
    require(runtime_guard(binding,old25,links,env)==before_runtime,'RUNTIME_DRIFT_DURING_PREFLIGHT')
    require(mf_guard()==before_mf,'MANIFEST_PREFLIGHT_DRIFT')
    for path,values in targets.items():guarded_code(path,values[0],values[1])
    qualified={'kind':'FRESH_ACTUAL_TWO_TARGET_ADOPTION47_PREREQUISITES_QUALIFIED','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'references':refs,'freshBeforeSourceReference':reference(P/'before-source.json'),'freshBeforeFullReference':reference(P/'before-full-inputs.json'),'runtimeReference':reference(P/'before-runtime-qualification.json'),'allOrderedSourceRowsExactLatest41Lint':True,'allOrderedFullInputRowsExactLatest41Lint':True,'sourceRows':1814,'distRows':238,'fullRows':13995,'inputRows':13757,'targetObservations':before_targets,'opaqueManifestGuard':before_mf,'candidateBuffersVerifiedAgainstSealed44':True,'source46AcceptedFindingCount':0,'namedPriorJobsTerminalAndSoleWriterWindowRootAttested':True,'allOsProcessAbsenceClaim':False,'pythonOptimization':sys.flags.optimize,'pythonOptimizeRemovedFromChildEnvironment':True,'noProductRuntimeRun':True,'actualSourceChangedYet':False,'steps':list(steps)}
    emit(P/'fresh-qualification47.json',qualified)
    stage='CONDITIONAL_ROOT_ADMISSION'
    inputs=load(PREP/'inputs-template.json')
    inputs['scope']='BOUND_TWO_TARGET_LINT_ADOPTION47_INPUTS'
    inputs['candidateSealedAndQaAccepted']=True
    for row in inputs['targets']:
        path=row['target'];values=targets[path]
        require(row['sourceBuffer']['path']==rel(C/path),'CANDIDATE_PATH_NOT_EXACT')
        row['sourceBuffer']['sha256']=values[2];row['sourceBuffer']['bytes']=values[3]
        row['sourceBuffer']['mode']='0o644';row['candidateState']='SEALED44_ACCEPTED_SOURCE46'
        row['observationReference']=reference(P/'fresh-qualification47.json');row['notFutureFreshAdmission']=False
    inputs['capturedActualBase']={'sourceDigest':before_source['digest'],'sourceRows':1814,'distDigest':before_source['dist']['digest'],'distRows':238,'provenance':'Fresh original47 captures exactly qualified against sealed41 latest lint baseline','reference':reference(P/'before-source.json')}
    inputs['candidateSealReference']=refs['candidateSeal'];inputs['newLintCandidateQaReference']=refs['sourceQa46'];inputs['futureRuntimeQualificationReference']=reference(P/'fresh-qualification47.json')
    inputs['actualCodeCopyGo']=True;inputs['executionAuthority']=False;inputs['runtimeGo']=False
    emit(B/'inputs.json',inputs)
    admission=commands['rootAdmissionDraft']
    for key in ['releaseActualAdoption','actualCodeCopyGo','onlyTwoTargetsAuthorized','newLintCandidateQaAccepted','soleActualWriter','obs011FormallyClosedAndFreezeReleased','freshRelevantInputQualificationAccepted']:admission[key]=True
    admission['obs011ClosureAndFreezeReleaseReference']=refs['closure011'];admission['acceptedPriorLocalQaReference']={**refs['priorQa39'],'role':'HISTORICAL_ACCEPTED_ADOPTION35_CORPUS26_NOT_NEW_LINT_PROOF'}
    admission['sourceCandidateQaReference']=refs['sourceQa46'];admission['inputsReference']=reference(B/'inputs.json');admission['freshBeforeCapture']=reference(P/'before-source.json');admission['freshTargetModes']={p:'0o644' for p in targets}
    admission['freshRelevantInputQualificationReference']=reference(P/'fresh-qualification47.json');admission['reviewedScriptReference']=refs['script'];admission['preparation45Reference']=refs['preparation45'];admission['candidateSealReference']=refs['candidateSeal'];admission['runtimeQualificationReference']=reference(P/'before-runtime-qualification.json')
    admission['delegatedConditionalRootAuthority']={'contextReference':refs['task-context.txt'],'modelPolicyReference':refs['model-policy.json'],'rootUserYoloConditionalCopyTask':True,'prerequisitesMeasuredBeforeAdmission':True,'independentApprovalByProducer':False,'scope':'ONE_REVIEWED_TWO_CODE_TRANSACTION47_ONLY','noTestsCorpusOrOtherSourceAuthority':True,'runtimeConsumersRemainHeldForSeparate48':True}
    emit(B/'root-release47.json',admission)
    stage='ONCE_REVIEWED_TRANSACTION'
    require(not O.exists(),'ADOPTION47_NOT_FRESH_AT_COPY')
    require(sha(read(PREP/'apply-reviewed-two.py.txt'))==refs['script']['sha256'],'SCRIPT_DRIFT_BEFORE_COPY')
    copy_attempted=True
    argv=['python3',str(PREP/'apply-reviewed-two.py.txt'),str(B/'root-release47.json'),reference(B/'root-release47.json')['sha256']]
    try:
        copy_raw_exit=run_original(argv,B/'copy47',env)
    except Exception:
        copy_raw_exit=steps[-1]['rawExit'] if steps else None
        raise
    applied=load(O/'code-application.json')
    require(applied['allTwoApplied'] is True and len(applied['targets'])==2,'TWO_TARGET_COPY_NOT_CONFIRMED')
    stage='ORIGINAL_AFTER_CAPTURES'
    for index in [2,3]:
        argv=commands['futureMetadataCommands'][index]['argv']
        require(not Path(argv[-1]).exists(),'FRESH_AFTER_CAPTURE_REQUIRED')
        run_original(argv,O/('after-capture'+str(index)),env)
    after_source=load(O/'after-source.json');after_full=load(O/'after-full-inputs.json')
    stage='EXACT_AFTER_QUALIFICATION'
    after_targets=[guarded_code(path,values[2],values[3]) for path,values in targets.items()]
    require(mf_guard()==before_mf,'MANIFEST_AFTER_DRIFT')
    after_runtime=runtime_guard(binding,old25,links,env)
    require(after_runtime==before_runtime,'RUNTIME_AFTER_DRIFT')
    emit(O/'after-runtime-qualification.json',after_runtime)
    def exact_rows(before,after,byte_field):
        require([r['path'] for r in before]==[r['path'] for r in after],'ROW_ORDER_OR_MEMBERSHIP_DRIFT')
        changed=[];unchanged=0
        for old,new in zip(before,after):
            p=old['path']
            if p in targets:
                v=targets[p];expected={**old,'sha256':v[2]}
                require(old['sha256']==v[0],'BEFORE_TARGET_ROW_SHA')
                if byte_field:
                    require(old['bytes']==v[1],'BEFORE_TARGET_ROW_BYTES');expected['bytes']=v[3]
                require(new==expected,'AFTER_TARGET_ROW_NOT_EXACT');changed.append(p)
            else:
                require(new==old,'NON_TARGET_ROW_DRIFT');unchanged+=1
        require(set(changed)==set(targets) and len(changed)==2,'EXACT_TWO_CHANGED_ROWS_REQUIRED')
        return {'rows':len(before),'changedPaths':changed,'changed':2,'allOtherRowsExact':unchanged,'sameMembershipAndOrder':True}
    source_delta=exact_rows(before_source['files'],after_source['files'],False)
    full_delta=exact_rows(before_full['copyProfileFiles'],after_full['copyProfileFiles'],True)
    input_delta=exact_rows(before_full['inputFiles'],after_full['inputFiles'],True)
    require(source_delta['allOtherRowsExact']==1812 and full_delta['allOtherRowsExact']==13993 and input_delta['allOtherRowsExact']==13755,'EXACT_OTHER_ROW_COUNTS')
    require(after_source['dist']==before_source['dist'] and after_full['dist']==before_full['dist'] and len(after_full['dist']['files'])==238,'DIST_AFTER_DRIFT')
    require(after_source['digest']!=before_source['digest'],'HONEST_CHANGED_SOURCE_DIGEST_REQUIRED')
    receipt={'kind':'ACTUAL_EXACT_TWO_TARGET_LINT_ADOPTION47_COMPLETE','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'TWO_TARGET_COPY_AND_FRESH_EXACT_DELTA_QUALIFIED','copyAttemptedExactlyOnce':True,'copyRawExit':copy_raw_exit,'rootAdmissionReference':reference(B/'root-release47.json'),'boundInputsReference':reference(B/'inputs.json'),'freshBeforeQualificationReference':reference(P/'fresh-qualification47.json'),'reviewedScriptReference':refs['script'],'sourceQa46Reference':refs['sourceQa46'],'candidateSeal44Reference':refs['candidateSeal'],'sourceBeforeReference':reference(P/'before-source.json'),'sourceAfterReference':reference(O/'after-source.json'),'fullBeforeReference':reference(P/'before-full-inputs.json'),'fullAfterReference':reference(O/'after-full-inputs.json'),'runtimeBeforeReference':reference(P/'before-runtime-qualification.json'),'runtimeAfterReference':reference(O/'after-runtime-qualification.json'),'sourceDigestBefore':before_source['digest'],'sourceDigestAfter':after_source['digest'],'distDigest':after_source['dist']['digest'],'sourceDelta':source_delta,'fullDelta':full_delta,'inputDelta':input_delta,'distAll238RowsExact':True,'targetModesBeforeAndAfter':'0o644','targetAfterObservations':after_targets,'opaqueManifestGuardBeforeAndAfter':before_mf,'manifestBodyDecoded':False,'runtimeGuardBeforeAfterExact':True,'latest41LegitimateTypedCacheStatePreserved':True,'sdkOrCacheWritesByCodeCopy':False,'steps':steps,'testsTypesLintRun':False,'corpusMutation':False,'strictSourcePinUpdatePerformed':False,'runtimeConsumersHeldUntilSeparateOriginalFreezeFirst48':True,'sourcePinTemporarilyStaleExpected':True,'proof49Authority':False,'independentAcceptanceClaimed':False,'storyLifecycleChanged':False,'nextOperationGo':False}
    emit(O/'receipt.json',receipt)
    stage='SEALED_COMPLETE'
    seal()
    print(json.dumps({'stage':stage,'copyRawExit':copy_raw_exit,'sourceDigestAfter':after_source['digest'],'sourceOtherRowsExact':1812,'fullOtherRowsExact':13993,'inputOtherRowsExact':13755,'distRowsExact':238,'manifest':reference(O/'manifest.json'),'receipt':reference(O/'receipt.json'),'testsOrCorpusRun':False},indent=2))
except Exception as exc:
    output=O if O.exists() else P
    emit(output/'producer47-stop-receipt.json',{'kind':'ACTUAL_ADOPTION47_STOP_CLOSED','stage':stage,'failureClass':type(exc).__name__,'failureLabel':str(exc) if isinstance(exc,RuntimeError) else 'PROGRAMME_EXCEPTION_SEE_ORIGINAL_CUSTODY','copyAttempted':copy_attempted,'copyRawExit':copy_raw_exit,'steps':steps,'noAutomaticRetry':True,'noUnownedRestoration':True,'noFurtherCommandsGo':False,'testsOrCorpusRun':False})
    seal()
    print(json.dumps({'status':'STOP_CLOSED','stage':stage,'failureClass':type(exc).__name__,'failureLabel':str(exc) if isinstance(exc,RuntimeError) else 'PROGRAMME_EXCEPTION','copyAttempted':copy_attempted,'copyRawExit':copy_raw_exit,'stopReceipt':reference(output/'producer47-stop-receipt.json'),'manifest':reference(output/'manifest.json')},indent=2))
    sys.exit(1)
