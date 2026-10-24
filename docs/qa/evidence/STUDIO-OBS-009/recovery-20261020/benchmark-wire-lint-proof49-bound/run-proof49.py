"""One-use continuation41; only three previously unrun reviewed commands."""
from pathlib import Path
import os, sys, json, hashlib, stat, subprocess, runpy, math, re, datetime, collections

if sys.flags.optimize:
    raise RuntimeError('PYTHON_OPTIMIZATION_FORBIDDEN')
os.umask(0o077)
R = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
N = R / 'docs/qa/evidence/STUDIO-OBS-009/recovery-20261020'
B = N / 'benchmark-wire-lint-proof49-bound'
O = N / 'benchmark-wire-lint-proof49-execution'
CACHE = 'studio-runner/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json'
NODE = Path('/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin/node')
ENV = dict(os.environ, PATH=str(NODE.parent) + ':' + os.environ['PATH'])
ENV.pop('PYTHONOPTIMIZE', None)
CURRENT = 'df860ccc1c6479e62320328b65f5e5bcaa1c431f863c543b7c07005b5654f8d2'
DIST = 'e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1'
PINS = {
 'studio-runner/evaluation/observed-authoring/evaluate.mjs': ('b9c95ddcee770fe1b88ea56587627f7bb5c6dc461c9687df08229a786244a518',125913),
 'studio-runner/evaluation/observed-authoring/evaluate.d.mts': ('714b60cb2f5c7de01d3504095a8c0340060b3683a3e26e8e296593119fb99f05',23546),
 'studio-runner/test/evaluation/harnessSelfTest.test.ts': ('9b3c5f987f98f8ec620daa88e2453ff3126551ea5687036bd2384f8c036fca64',66052),
 'studio-runner/test/evaluation/observedCorpus.ts': ('6631c807b5ead597ffa64ac816d2fe90f9694a647afe48be30b814d48f84902e',10728),
 'studio-runner/evaluation/observed-authoring/manifest.json': ('36a50789c442df65dc27d0a3c2695574b65009ec3e6d844c60edfa7a0355b000',79287),
 'studio-runner/test/evaluation/benchmarkScoring.test.ts': ('bc49947549e2e9d8d2338cb064ec5f823efc437232f2d0e60d7213d819a2fb1a',35575)
}
stages = []
phase = 'binding49'
launches = []
metadataCalls = []
def check(ok, code):
    if not ok:
        raise RuntimeError(code)
def sha(b):
    return hashlib.sha256(b).hexdigest()
def read(p):
    p=Path(p)
    check(not p.is_symlink(), 'READ_SYMLINK')
    with p.open('rb') as f:
        a=os.fstat(f.fileno()); check(stat.S_ISREG(a.st_mode),'READ_NOT_REGULAR')
        data=f.read();z=os.fstat(f.fileno())
    check((a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns)==(z.st_dev,z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns),'READ_CHANGED')
    return data
def ref(p):
    p=Path(p);v=read(p)
    return {'path':str(p.relative_to(R)),'sha256':sha(v),'bytes':len(v)}
def emit(p,v):
    with Path(p).open('x') as f:
        json.dump(v,f,indent=2);f.write('\n')
    os.chmod(p,0o600)
def load(p,h=None):
    data=read(p)
    if h:check(sha(data)==h,'REFERENCE_HASH')
    return json.loads(data)
def pinnedref(row):
    p=R/row['path'];data=read(p)
    check(sha(data)==row['sha256'] and ('bytes' not in row or len(data)==row['bytes']),'PINNED_REFERENCE')
    return json.loads(data)
def sealmanifest(path):
    v=load(path)
    for x in v['files'] if 'files' in v else v['artifacts']:
        p=(R/x['path']) if x['path'].startswith('docs/') else path.parent/x['path'];d=read(p)
        check(sha(d)==x['sha256'] and len(d)==x['bytes'],'SEALED_ARTIFACT')
    return ref(path)
def capture(dest):
    argv=['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'),str(dest)]
    with Path(str(dest)+'.stdout.private').open('xb') as out, Path(str(dest)+'.stderr.private').open('xb') as err:
        s=subprocess.run(argv,cwd=R,env=ENV,stdout=out,stderr=err)
    metadataCalls.append({'kind':'original_source_capture','outputReference':ref(dest) if dest.is_file() else None,'rawExit':s.returncode})
    check(s.returncode==0,'SOURCE_CAPTURE_EXIT')
    v=load(dest);sourceguard(v)
    return v
def sourceguard(v):
    check(v['digest']==CURRENT and len(v['files'])==1814 and v['dist']['digest']==DIST and len(v['dist']['files'])==238,'SOURCE_DIST_BASELINE')
    check(v['files']==baselineSource['files'] and v['dist']==baselineSource['dist'],'SOURCE_DIST_EXACT_ARRAYS')
def full(dest):
    v=snapshot(R);emit(dest,v)
    check(len(v['copyProfileFiles'])==13995 and len(v['inputFiles'])==13757 and v['dist']==baselineFull['dist'],'FULL_PROFILE_SHAPE_DIST')
    return v
def exactfull(a,b,allowCache):
    for key in ['copyProfileFiles','inputFiles']:
        check([r['path'] for r in a[key]]==[r['path'] for r in b[key]],'PROFILE_ORDER')
        aa={r['path']:r for r in a[key]};bb={r['path']:r for r in b[key]}
        check(set(aa)==set(bb),'PROFILE_MEMBERSHIP')
        changed=[p for p in aa if aa[p]!=bb[p]]
        check(not changed or (allowCache and changed==[CACHE]),'UNEXPECTED_PROFILE_DELTA')
    check(a['dist']==b['dist'],'FULL_DIST_CHANGED')
def runtime():
    check(stat.S_IMODE(NODE.stat().st_mode)==0o755 and stat.S_IMODE(Path('/opt/homebrew/bin/pnpm').resolve().stat().st_mode)==0o755,'NODE_PNPM_MODE')
    check(__import__('shutil').which('node',path=ENV['PATH'])==str(NODE) and __import__('shutil').which('pnpm',path=ENV['PATH'])=='/opt/homebrew/bin/pnpm','RUNTIME_PATH')
    check(sha(read(NODE))=='9d050fd455b56426e25d4d603c7c501cbb2630348e836cf221dcce748e90588a','NODE_HASH')
    check(sha(read(Path('/opt/homebrew/bin/pnpm').resolve()))==fresh['resolvedExistingPnpmSha256'],'PNPM_HASH')
    for row in fresh['canonicalFiveAndProtectedEleven']:
        p=R/row['path'];check(sha(read(p))==row['sha256'] and oct(stat.S_IMODE(p.stat().st_mode))==row['mode'],'CANONICAL_PROTECTED')
    for p,(h,size) in PINS.items():
        d=read(R/p);check(sha(d)==h and (size is None or len(d)==size) and stat.S_IMODE((R/p).stat().st_mode)==0o644,'SOURCE_MF_PIN')
    names=sorted(p.name for p in (R/'studio-runner/node_modules/.bin').iterdir())
    check(names==sorted(Path(x['path']).name for x in links),'BIN_MEMBERSHIP')
    for row in links:
        p=R/row['path'];s=p.lstat()
        check(p.is_symlink() and os.readlink(p)==row['target'] and oct(stat.S_IMODE(s.st_mode))==row['mode'] and oct(stat.S_IMODE(p.stat().st_mode))==row['mode'] and s.st_dev==row['device'] and s.st_ino==row['inode'],'BIN_IDENTITY')
    envfacts={key:{'present':key in ENV,'valueSha256':sha(ENV[key].encode()) if key in ENV else None} for key in fresh['environmentEleven']}
    check(envfacts==fresh['environmentEleven'] and envfacts==runtimebinding['environment'],'ENVIRONMENT11')
    return {'nodeBinaryMatched':True,'resolvedExistingPnpmMatched':True,'canonicalFiveMatched':True,'protectedElevenMatched':True,'bin21Exact':True,'environmentEleven':envfacts,'fiveCurrentSourceAndOpaqueManifestPinsExact':True,'nodeMode':'0o755','pnpmMode':'0o755'}
def cache(dest):
    d=read(R/CACHE)
    with Path(dest).open('xb') as f:f.write(d)
    v=json.loads(d)
    check(set(v)=={'version','results'} and v['version']=='3.2.7' and type(v['results']) is list and len(v['results'])==191,'CACHE_SHAPE')
    keys=[]
    for row in v['results']:
        check(type(row) is list and len(row)==2 and type(row[0]) is str and type(row[1]) is dict,'CACHE_ROW')
        keys.append(row[0]);value=row[1]
        check(set(value)=={'duration','failed'} and type(value['duration']) in (int,float) and math.isfinite(value['duration']) and type(value['failed']) is bool,'CACHE_TYPES')
    check(len(set(keys))==191,'CACHE_UNIQUE_KEYS')
    return v
def cachedelta(a,b,role):
    check(a['version']==b['version'] and [x[0] for x in a['results']]==[x[0] for x in b['results']],'CACHE_ORDER_KEYS')
    changed=[x[0] for x,y in zip(a['results'],b['results']) if x!=y]
    check(not changed or (role in cacheKeys and changed==[cacheKeys[role]]),'CACHE_UNOWNED_VALUE_DELTA')
    return {'changedKeys':changed,'allOtherRowsExact':True,'typed191OrderedUniqueRows':True}
def decode_title(s):
    return s.replace("\\'", "'").replace('\\\\','\\')
def project(report,file):
    data=load(report)
    check(type(data['testResults']) is list and len(data['testResults'])==1,'PHYSICAL_FILE_COUNT')
    f=data['testResults'][0];check(f['name']==str(R/'studio-runner'/file),'PHYSICAL_FILE_NAME')
    cases=f['assertionResults'];expected=[x for x in catalogue['rows'] if x['file']==file]
    check(len(cases)==len(expected),'CASE_COUNT')
    # Finite bipartite matching preserves multiplicities even when $0 remains literal.
    owners={}
    def visit(ci,seen):
        c=cases[ci]
        for ei,e in enumerate(expected):
            if ei in seen or c['fullName'] not in e['allowedFullNames'] or c['ancestorTitles']!=e['ancestors']:continue
            seen.add(ei)
            if ei not in owners or visit(owners[ei],seen):owners[ei]=ci;return True
        return False
    check(all(visit(ci,set()) for ci in range(len(cases))),'UNKNOWN_OR_MISSING_SOURCE_IDENTITY')
    rowbycase={ci:expected[ei] for ei,ci in owners.items()};out=[]
    for i,c in enumerate(cases):
        e=rowbycase[i]
        check(c['status'] in ('passed','failed','skipped','pending','todo'),'CASE_STATUS')
        check(e['selected'] or c['status']=='skipped','FILTER_OMISSION_STATUS')
        out.append({'publicAuthoredFullName':c['fullName'],'ancestorTitles':c['ancestorTitles'],'identitySha256':sha(c['fullName'].encode()),'status':c['status'],'selected':e['selected']})
    selected=collections.Counter(c['status'] for c in out if c['selected']);omitted=collections.Counter(c['status'] for c in out if not c['selected'])
    result={'rawReportReference':ref(report),'physicalFiles':1,'file':file,'selectedStatuses':dict(selected),'filteredStatuses':dict(omitted),'sourceBoundIdentityAndMultiplicityMatched':True,'cases':out,'success':data['success'],'reportedCounts':{k:data.get(k) for k in ['numTotalTests','numPassedTests','numFailedTests','numPendingTests','numRuntimeErrorTestSuites']}}
    check(data['numTotalTests']==len(cases),'REPORT_TOTAL')
    emit(O/(file.split('/')[-1]+'.public-cases.json'),result)
    return result


def digest(rows):
    return sha(json.dumps(rows,separators=(',',':')).encode())
def validate_full(v):
    check(v['copyProfileDigest']==digest(v['copyProfileFiles']) and v['inputDigest']==digest(v['inputFiles']) and v['dist']['digest']==digest(v['dist']['files']),'FULL_DIGEST_FIELDS')
def cache_snapshot_row(full_value,private_path):
    row=[r for r in full_value['copyProfileFiles'] if r['path']==CACHE]
    data=read(private_path)
    check(len(row)==1 and row[0]['sha256']==sha(data) and row[0]['bytes']==len(data),'CACHE_SNAPSHOT_BOUNDARY')
def all_sealed(path,expected):
    load(path,expected)
    return sealmanifest(path)
def save_context(source,dest):
    data=read(source)
    with dest.open('xb') as f:f.write(data)
    return {'source':ref(source),'ownedCopy':ref(dest)}
def custody_mode(cmd):
    for p in cmd['outputs'].values():
        if p and (R/p).is_file():os.chmod(R/p,0o600)
def manifest():
    files=[]
    for directory in [B,O]:
        for p in sorted(directory.rglob('*')):
            if p.is_file() and p!=O/'manifest.json':files.append(ref(p))
    for cmd in commands.get('sequence',[]) if 'commands' in globals() else []:
        for p in sorted((R/'docs/qa/evidence/STUDIO-OBS-011/execution').glob(cmd['label']+'*')):
            if p.is_file():os.chmod(p,0o600);files.append(ref(p))
    emit(O/'manifest.json',{'kind':'BOUNDED_LINT_FIX_PROOF49_PRODUCER_SEAL','pathBase':'repository root','files':files,'fileCount':len(files),'closedStages':[s['id'] for s in stages],'launchedStages':[s['id'] for s in launches],'executionFurtherCommandsGo':False,'independentReviewPending':True,'sourceOrCorpusWrites':False,'rawPrivateArtifactsPreserved':True})
try:
    PREP=N/'benchmark-wire-lint-proof49-preparation'
    refs={}
    emit(B/'namespace-custody.json',{'bothRootDirectoriesAndAllFourLabelPrefixesAbsentBeforeFirstOwnedWrite':True,'allFourCommandOutputPathsAbsentBeforeFirstOwnedWrite':True,'directoryMode':'0o700','umask':'0o077','pythonOptimization':sys.flags.optimize,'rootAttestsExclusiveCurrentLaneAndFrozenSource':True,'allOsAbsenceClaim':False})
    refs['preparation49']=all_sealed(PREP/'manifest.json','c504b5573e08009e115badc63925b4fd752d05fd63e50ec740f5500f2f3e014a')
    refs['sourceQa46']=all_sealed(N/'benchmark-wire-lint-source46-independent-review/manifest.json','cf7490277c48f7e99fc9b98183066aae5f638ef26a44315b81a1db64eb8cb7dd')
    qa46=load(N/'benchmark-wire-lint-source46-independent-review/manifest.json')
    check(qa46['findingCount']==0 and qa46['verdict']=='SOURCE_LINT_CANDIDATE44_AND_TWO_TARGET_TRANSACTION45_ACCEPTED_FOR_FUTURE_BOUND_ADOPTION','QA46_ACCEPTANCE')
    refs['actual47']=all_sealed(N/'benchmark-wire-lint-actual-adoption47/manifest.json','6e6da75fa2f6cbfa6fb120df4dda53f15b2a4f3eea541da6ef832ac80a5c8595')
    refs['candidate44']=all_sealed(N/'benchmark-wire-lint-candidate44/manifest.json','cd1fca0b83e33d8c9efec515ec4f36f90a65e4cf4fba4facf2c1eba8ae589411')
    sums_path=N/'benchmark-wire-lint-candidate44/SHA256SUMS'
    check(sha(read(sums_path))=='42a27720d9b88976acea1de6df7fbed266cbbd40049c3d4f704af40f30069b52','CANDIDATE_SUMS_HASH')
    sums=read(sums_path).decode().splitlines();check(len(sums)==6,'CANDIDATE_SUMS_COUNT')
    for line in sums:
        h,p=line.split(maxsplit=1);check(sha(read(sums_path.parent/p.lstrip('*')))==h,'CANDIDATE_SUMS_ENTRY')
    commands=load(PREP/'commands.json','b8b32c8481e7011ceed581f1cc8d5d5f6281e292dca66b55e788595b6c2f8780')
    check([c['id'] for c in commands['sequence']]==['harness01','scoring01','types01','lint01'],'EXACT_FOUR_SEQUENCE')
    refs['commands49']=ref(PREP/'commands.json')
    corpus_path=N/'benchmark-corpus-io-execution06/lint-successor48/corpus48-root-receipt.json'
    corpus=load(corpus_path,'706b889be3bf5a659e7ecf790ab0dc4401e6b088069799ccd70c3895bbeeda98')
    refs['corpus48']=ref(corpus_path)
    check(corpus['actualCliRawExits']==[0,0] and corpus['sourceAfterDigest']==CURRENT and corpus['onlyActualManifestChanged'] is True and corpus['allOtherCodeSdkProductRowsExact'] is True and corpus['actualManifestReference']['sha256']==PINS['studio-runner/evaluation/observed-authoring/manifest.json'][0],'ACTUAL48_STRICT_QUALIFICATION')
    baselineSource=pinnedref(corpus['afterSourceReference']);baselineFull=pinnedref(corpus['afterFullInputsReference'])
    refs['baseline48Source']=corpus['afterSourceReference'];refs['baseline48Full']=corpus['afterFullInputsReference']
    sourceguard(baselineSource);validate_full(baselineFull)
    refs['actual47Receipt']=ref(N/'benchmark-wire-lint-actual-adoption47/receipt.json')
    actual47=load(N/'benchmark-wire-lint-actual-adoption47/receipt.json','9d0c2a99c7f464e873054cb9113f71186a38fbde8aa6093b91799725f114ed5c')
    check(actual47['copyRawExit']==0 and actual47['copyAttemptedExactlyOnce'] is True,'ACTUAL47_COPY')
    fresh_path=N/'benchmark-wire-actual-preflight25/fresh-metadata25-receipt.json'
    fresh=load(fresh_path,'5502faeeb91a972db159ab0690504d5aa159288f8bd3801a49c1e48531df02ab');refs['fresh25Runtime']=ref(fresh_path)
    F=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/actual-runner-final-gates01'
    runtimebinding=load(F/'runtime-input-binding.json','c72b9a8983664bc09d8fdb11c082f00c1d4a78f5d5f191d552902799bdb271ea');refs['runtimeBinding']=ref(F/'runtime-input-binding.json')
    links=load(F/'initial21-bin-links.json','284ae82a7b4f2c0b0b002d16fdef8cac63ff83d9c9588432772e975df5544ca1');refs['bin21']=ref(F/'initial21-bin-links.json')
    helpers=[('.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py','edeaa3592eb85b60097c79a7577d2025027b53ebc3eba470c092e9c9cf2a009f'),('.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py','cc943d9dfcf1ff07e463cfcc266e906704a5f04ae621b0355c6a5022f75f5e63'),('docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/bootstrap-process-tree-pure-proof-execution01/input-snapshot.py','b6d962a6aaba1c0135e3cee63cb66341bfd42dba3238deef8a7187992ba01849'),('docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/bootstrap-process-tree-pure-proof-execution01/fresh-copy-catalog.json','2624360a76136f37b4e1bc267734eb1954aff16fbd54e56984356ed192eb33a2')]
    for p,h in helpers:check(sha(read(R/p))==h,'ORIGINAL_HELPER_HASH')
    snapshot=runpy.run_path(str(R/helpers[2][0]))['snapshot']
    catpath=PREP/'corrected-source-identity-catalogue.json'
    catalogue=load(catpath,'cb08d64c9c64aa34e741b8516095127af5f9e729b99c59f432424898d56d8592')
    predecessor=N/'benchmark-wire-proof-identity40-independent-review/corrected-source-authored-identity-catalogue.json'
    oldcat=load(predecessor,'f5ebfbc59a5255bd1bad0d05e4a990519d1660c117500b7e9d2fe1b3958cb82f')
    check(catalogue['rows']==oldcat['rows'] and len(catalogue['rows'])==107,'ALL107_CATALOGUE_PAYLOAD_ROWS_EXACT_QA40')
    for p,(h,size) in catalogue['sourcePins'].items():check(tuple(PINS[p])==(h,size),'CURRENT_CATALOGUE_SOURCE_PINS')
    check(len(catalogue['sourcePins'])==5,'SOURCE_PINS_FIVE')
    for file,total,selected in [('test/evaluation/harnessSelfTest.test.ts',76,61),('test/evaluation/benchmarkScoring.test.ts',31,31)]:
        rows=[r for r in catalogue['rows'] if r['file']==file]
        check(len(rows)==total and sum(r['selected'] is True for r in rows)==selected,'CATALOGUE_COUNTS')
    with (B/'corrected-source-identity-catalogue.json').open('xb') as f:f.write(read(catpath))
    check(sha(read(B/'corrected-source-identity-catalogue.json'))==sha(read(catpath)),'CATALOGUE_COPY_EXACT')
    refs['catalogue49']=ref(B/'corrected-source-identity-catalogue.json');refs['historicalRowsOnlyQa40']=ref(predecessor)
    refs['context49']=save_context(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/obs009-wire-lint-actual-proof49-context.txt',B/'task-context49.txt')
    refs['modelPolicy']=save_context(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/subagent-model-policy-20261021-sol61-high.json',B/'model-policy.json')
    for cmd in commands['sequence']:
        check(not list((R/'docs/qa/evidence/STUDIO-OBS-011/execution').glob(cmd['label']+'*')),'LABEL_NOT_FRESH')
        for p in cmd['outputs'].values():
            if p:check(not (R/p).exists(),'COMMAND_OUTPUT_NOT_FRESH')
    guards=runtime()
    initialSource=capture(B/'initial-source.json')
    previousFull=full(B/'initial-full-inputs.json');validate_full(previousFull);exactfull(baselineFull,previousFull,False)
    initialCache=cache(B/'initial-cache.private.json');cache_snapshot_row(previousFull,B/'initial-cache.private.json')
    cacheKeys={}
    for role,filename in [('harness01','test/evaluation/harnessSelfTest.test.ts'),('scoring01','test/evaluation/benchmarkScoring.test.ts')]:
        matches=[k for k,v in initialCache['results'] if k.endswith(filename)]
        check(len(matches)==1,'OWN_EXISTING_CACHE_KEY');cacheKeys[role]=matches[0]
    check(len(set(cacheKeys.values()))==2,'CACHE_ROLES_DISTINCT')
    emit(B/'initial-runtime.json',guards)
    emit(B/'root-release49.json',{'kind':'ROOT_CONDITIONAL_ACTUAL_BOUNDED_PROOF49_RELEASE','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'references':refs,'originalHelpers':[ref(R/p) for p,h in helpers],'currentSourceDigest':CURRENT,'currentManifestPin':PINS['studio-runner/evaluation/observed-authoring/manifest.json'],'sourcePins':catalogue['sourcePins'],'initialSourceReference':ref(B/'initial-source.json'),'initialFullInputReference':ref(B/'initial-full-inputs.json'),'initialCacheReference':ref(B/'initial-cache.private.json'),'runtimeReference':ref(B/'initial-runtime.json'),'onlyMutableCacheKeyByRole':cacheKeys,'all191OrderedExistingKeysAndTypedValuesVerified':True,'allConditionalCriteriaPassed':True,'fourUnusedExactReviewedCommandsReleased':True,'noOtherRuntimeAuthority':True,'all107FiniteCatalogueRowsExactQa40':True,'rootAttestsFrozenSourceAndSoleConsumer':True,'producerIndependentQaApproval':False,'originalWrapperArgvUnchanged':True,'actual48FreezeAndStrictValidationVerified':True})
    print(json.dumps({'event':'conditional_release49_bound','allFreshGuards':True,'exactCommands':4}),flush=True)
    previousCache=initialCache
    for cmd in commands['sequence']:
        phase=cmd['id'];role=phase
        pre=runtime()
        beforeSource=capture(O/(role+'-guard-before-source.json'))
        beforeFull=full(O/(role+'-before-full-inputs.json'));validate_full(beforeFull);exactfull(previousFull,beforeFull,False)
        beforeCache=cache(O/(role+'-cache-before.private.json'));check(beforeCache==previousCache,'INTERSTEP_CACHE_DRIFT');cache_snapshot_row(beforeFull,O/(role+'-cache-before.private.json'))
        with (O/(role+'-stdout.private')).open('xb') as out,(O/(role+'-stderr.private')).open('xb') as err:
            process=subprocess.Popen(cmd['wrapperArgv'],cwd=R,env=ENV,stdout=out,stderr=err)
            launch={'id':role,'argv':cmd['wrapperArgv'],'pid':process.pid,'cwd':str(R),'PATHPrefix':str(NODE.parent),'originalLabel':cmd['label']}
            emit(O/(role+'-launch.json'),launch);launches.append(launch)
            print(json.dumps({'event':'original_wrapper_launched','stage':role,'pid':process.pid}),flush=True)
            raw=process.wait()
        print(json.dumps({'event':'original_wrapper_terminal','stage':role,'rawExit':raw}),flush=True)
        # Complete all independent after-boundary captures even on a failed child or guard.
        custodyFailures=[];after={}
        for kind,fn in [('source',lambda:capture(O/(role+'-guard-after-source.json'))),('full',lambda:full(O/(role+'-after-full-inputs.json'))),('cache',lambda:cache(O/(role+'-cache-after.private.json'))),('runtime',runtime)]:
            try:after[kind]=fn()
            except Exception as exc:
                code=str(exc) if type(exc) is RuntimeError and re.fullmatch('[A-Z0-9_]+',str(exc)) else 'AFTER_CUSTODY_EXCEPTION'
                custodyFailures.append({'boundary':kind,'closedCode':code,'exceptionType':type(exc).__name__})
        custody_mode(cmd)
        emit(O/(role+'-after-custody.json'),{'id':role,'wrapperRawExit':raw,'allFourAfterBoundaryMeasurementsAttempted':True,'capturedBoundaryKinds':list(after),'failures':custodyFailures,'metadataCallsSoFar':metadataCalls})
        check(not custodyFailures,'AFTER_BOUNDARY_GUARD_FAILURE')
        afterSource=after['source'];afterFull=after['full'];afterCache=after['cache'];post=after['runtime']
        validate_full(afterFull);cache_snapshot_row(afterFull,O/(role+'-cache-after.private.json'))
        exactfull(beforeFull,afterFull,role in cacheKeys);delta=cachedelta(beforeCache,afterCache,role)
        check(post==pre,'RUNTIME_BEFORE_AFTER_EXACT')
        result=load(R/cmd['outputs']['result'])
        check(result['sourceStable'] is True and result['testInputStable'] is True and result['distStable'] is True,'WRAPPER_STABILITY_FLAGS')
        for key in ['beforeSourceCapture','afterSourceCapture']:sourceguard(load(R/cmd['outputs'][key]))
        projection=None;file=None
        if role in cacheKeys:
            file='test/evaluation/harnessSelfTest.test.ts' if role=='harness01' else 'test/evaluation/benchmarkScoring.test.ts'
            projection=project(R/cmd['outputs']['opaqueVitestJson'],file)
        stage={'id':role,'originalPid':process.pid,'originalWrapperRawExit':raw,'wrapperResult':result,'wrapperOutputReferences':[ref(R/p) for key,p in cmd['outputs'].items() if p and key not in ('beforeFullInputs','afterFullInputs') and (R/p).is_file()],'freshFullInputsReferences':[ref(O/(role+'-'+kind+'-full-inputs.json')) for kind in ['before','after']],'freshSourceReferences':[ref(O/(role+'-guard-'+kind+'-source.json')) for kind in ['before','after']],'cacheBeforeReference':ref(O/(role+'-cache-before.private.json')),'cacheAfterReference':ref(O/(role+'-cache-after.private.json')),'cacheDelta':delta,'runtimeBefore':pre,'runtimeAfter':post,'sourceAll1814DistAll238Exact':True,'fullProfileOther13994InputOther13756Exact':True,'orderedMembershipPreserved':True,'onlyAllowedFullProfileDelta':True,'sourceBoundCaseProjection':ref(O/(file.split('/')[-1]+'.public-cases.json')) if file else None}
        stages.append(stage);emit(O/(role+'-receipt.json'),stage)
        check(raw==0 and result['exit']==0,'ORIGINAL_CHECK_FAILED')
        if projection:
            expectedPassed=61 if role=='harness01' else 31;expectedFiltered={'skipped':15} if role=='harness01' else {}
            check(projection['success'] is True and projection['selectedStatuses']=={'passed':expectedPassed} and projection['filteredStatuses']==expectedFiltered,'SELECTED_CASE_FAILURE')
        previousFull=afterFull;previousCache=afterCache
        print(json.dumps({'event':'stage_closed_pass','stage':role,'selectedPass':(61 if role=='harness01' else 31) if role in cacheKeys else None,'filtered':15 if role=='harness01' else 0 if role=='scoring01' else None,'sourceDistAndInputGuardsPassed':True}),flush=True)
    # Combined custody admits the two exact existing role entries only; all other189 remain exact.
    check([r[0] for r in initialCache['results']]==[r[0] for r in previousCache['results']],'COMBINED_CACHE_ORDER')
    check(all(a==b for a,b in zip(initialCache['results'],previousCache['results']) if a[0] not in cacheKeys.values()),'COMBINED_OTHER189_CACHE_ROWS')
    exactfull(baselineFull,previousFull,True)
    emit(O/'receipt.json',{'kind':'ACTUAL_BOUNDED_LINT_FIX_PROOF49_COMPLETE','allFourReviewedCommandsPassed':True,'stageReferences':[ref(O/(s['id']+'-receipt.json')) for s in stages],'rootReleaseReference':ref(B/'root-release49.json'),'commandReference':refs['commands49'],'catalogueReference':refs['catalogue49'],'corpus48Reference':refs['corpus48'],'actual47Reference':refs['actual47'],'originalWrapperRawExits':[s['originalWrapperRawExit'] for s in stages],'harnessSelectedPassed':61,'harnessIntentionalFiltered':15,'scoringSelectedPassed':31,'scoringFiltered':0,'selectedCaseInstances':92,'physicalTestFileInvocations':2,'distinctAdditionalCoverageClaim':False,'typesRawExit':stages[2]['originalWrapperRawExit'],'lintRawExit':stages[3]['originalWrapperRawExit'],'sourceDigest':CURRENT,'distDigest':DIST,'sourceRows':1814,'distRows':238,'fullRows':13995,'inputRows':13757,'allFourCommandsSourceDistManifestFivePinsRuntimeExact':True,'onlyOwnPerTestTypedExistingCacheEntryDelta':True,'typesAndLintEntireCacheExact':True,'combinedOther189CacheRowsExact':True,'noCacheRestoreResetSourceFixCorpusMutationOrAdditionalCheck':True,'metadataCalls':metadataCalls,'noIndependentApprovalLifecycleOrExternalGateClaim':True,'nextOperationGo':False,'heavyAndActualInputReadWindowReleased':True})
    manifest()
    print(json.dumps({'event':'proof49_complete','allFourPassed':True,'selectedCaseInstances':92,'physicalFileInvocations':2,'manifest':ref(O/'manifest.json'),'receipt':ref(O/'receipt.json'),'heavyAndActualInputReadWindowReleased':True}),flush=True)
except Exception as error:
    code=str(error) if type(error) is RuntimeError and re.fullmatch('[A-Z0-9_]+',str(error)) else 'ORCHESTRATION_EXCEPTION'
    emit(O/'stop-receipt.json',{'kind':'BOUNDED_PROOF49_STOP_CLOSED','phase':phase,'closedFailureCode':code,'exceptionType':type(error).__name__,'closedStages':[s['id'] for s in stages],'launchedStages':launches,'metadataCalls':metadataCalls,'remainingCommandsNotAuthorizedToContinue':True,'sourceFixRetryAdditionalCheckOrCacheRestorePerformed':False,'heavyAndActualInputReadWindowReleased':True})
    manifest()
    print(json.dumps({'event':'proof49_stopped','phase':phase,'closedFailureCode':code,'exceptionType':type(error).__name__,'manifest':ref(O/'manifest.json'),'stopReceipt':ref(O/'stop-receipt.json'),'heavyAndActualInputReadWindowReleased':True}),flush=True)
    sys.exit(1)
