"""One-use continuation41; only three previously unrun reviewed commands."""
from pathlib import Path
import os, sys, json, hashlib, stat, subprocess, runpy, math, re, datetime, collections

if sys.flags.optimize:
    raise RuntimeError('PYTHON_OPTIMIZATION_FORBIDDEN')
os.umask(0o077)
R = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
N = R / 'docs/qa/evidence/STUDIO-OBS-009/recovery-20261020'
B = N / 'benchmark-wire-proof-continuation41-bound'
O = N / 'benchmark-wire-proof-continuation41-execution'
CACHE = 'studio-runner/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json'
NODE = Path('/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin/node')
ENV = dict(os.environ, PATH=str(NODE.parent) + ':' + os.environ['PATH'])
CURRENT = '0cbbf17558419ee44e1e24a98e437d7a73ff053ec54ac290058efcb0d947c928'
DIST = 'e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1'
PINS = {
 'studio-runner/evaluation/observed-authoring/evaluate.mjs': ('15d2bcd0ee2bb227f0b54307b6a50608e720f68e89b6726d6cc57c55beb96523',125912),
 'studio-runner/evaluation/observed-authoring/evaluate.d.mts': ('714b60cb2f5c7de01d3504095a8c0340060b3683a3e26e8e296593119fb99f05',23546),
 'studio-runner/test/evaluation/harnessSelfTest.test.ts': ('09d68060f6f0c3fafc27dea6a7938d950d050940a1522511a0742065e14b09b7',65996),
 'studio-runner/test/evaluation/observedCorpus.ts': ('6631c807b5ead597ffa64ac816d2fe90f9694a647afe48be30b814d48f84902e',10728),
 'studio-runner/evaluation/observed-authoring/manifest.json': ('6bc320ac60eebb2dda423ab8e44e66462a5765877991f9bc9000e46d940a9b7b',79287),
 'studio-runner/test/evaluation/benchmarkScoring.test.ts': ('bc49947549e2e9d8d2338cb064ec5f823efc437232f2d0e60d7213d819a2fb1a',None)
}
stages = []
phase = 'binding41'
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
        aa={r['path']:r for r in a[key]};bb={r['path']:r for r in b[key]}
        check(set(aa)==set(bb),'PROFILE_MEMBERSHIP')
        changed=[p for p in aa if aa[p]!=bb[p]]
        check(not changed or (allowCache and changed==[CACHE]),'UNEXPECTED_PROFILE_DELTA')
    check(a['dist']==b['dist'],'FULL_DIST_CHANGED')
def runtime():
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
        check(p.is_symlink() and os.readlink(p)==row['target'] and oct(stat.S_IMODE(p.stat().st_mode))==row['mode'] and s.st_dev==row['device'] and s.st_ino==row['inode'],'BIN_IDENTITY')
    envfacts={key:{'present':key in ENV,'valueSha256':sha(ENV[key].encode()) if key in ENV else None} for key in fresh['environmentEleven']}
    check(envfacts==fresh['environmentEleven'] and envfacts==runtimebinding['environment'],'ENVIRONMENT11')
    return {'nodeBinaryMatched':True,'resolvedExistingPnpmMatched':True,'canonicalFiveMatched':True,'protectedElevenMatched':True,'bin21Exact':True,'environmentEleven':envfacts,'fourCodeAndOpaqueManifestPinsExact':True}
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

try:
    context=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/obs009-wire-proof-continuation41-context.txt'
    refs={}
    for name,path,h in [
      ('commands',N/'benchmark-wire-proof-preparation28/commands.json','7a057233ff90de60b81139f90a348103eddeb539904ffd7df73180a2b75f0fe7'),
      ('adoption',N/'benchmark-wire-actual-bound25/actual-adoption35-root-receipt.json','75ceb79d707d0df087d8e84f3330d6bf0aaeacaad054b482593ea5324858b812'),
      ('corpus',N/'benchmark-corpus-io-execution06/wire-successor26/corpus26-root-receipt.json','e269a112f0ef1b2572ee1103a8985b83355ea9cb1f2580557e22c5bf00c258be'),
      ('fresh',N/'benchmark-wire-actual-preflight25/fresh-metadata25-receipt.json','5502faeeb91a972db159ab0690504d5aa159288f8bd3801a49c1e48531df02ab'),
      ('runtimebinding',R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/actual-runner-final-gates01/runtime-input-binding.json','c72b9a8983664bc09d8fdb11c082f00c1d4a78f5d5f191d552902799bdb271ea'),
      ('links',R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/actual-runner-final-gates01/initial21-bin-links.json','284ae82a7b4f2c0b0b002d16fdef8cac63ff83d9c9588432772e975df5544ca1')]:
        globals()[name]=load(path,h);refs[name]=ref(path)
    for path,h in [
      (N/'benchmark-wire-proof-preparation28/manifest.json','b30163c9b8e98b90c6d93232935bc2183c1ac90cb837cc7d1fd67fb454c3a58d'),
      (N/'benchmark-wire-candidate30/manifest.json','5f9bb7f662104f50d4b6c1c93b238954e7d3ab5e90632c45cc8e62c0a44e6022'),
      (N/'benchmark-wire-candidate33-independent-review/manifest.json','1aedd460fdec26f8242f41aa8a04833b3eb4aeb4fe1225c544f37b6624ca5ed6'),
      (N/'benchmark-wire-prefix-proof32-independent-review/manifest.json','ff77f8ce9a12a5949f8cd8bf336f22f58b8994c399463db29650e7c62f161afa'),
      (N/'benchmark-wire-actual-adoption-corpus39-independent-review/manifest.json','5723e2c40a68a12ac268cb25e5f52142ce4e7e6915d8ab9268c4515022f8f4e3'),
      (N/'benchmark-wire-proof-identity40-independent-review/manifest.json','1fab60f84dae61245e140ccf6701d1b447e6ac181dfece0a0d3168cab3fbc3a2'),
      (N/'benchmark-wire-proof-execution28/manifest.json','70e7084cbe67f41528f3942e4110ec6890cd16d7a37d26390a2c497d6d823439')]:
        load(path,h);refs[str(path.relative_to(N))]=sealmanifest(path)
    for p,h in [
      (N/'benchmark-wire-proof-execution28/receipt.json','6eeed7ee9dd341a1a97c7e8562a46a271045b44e620199359321ee400af508ce'),
      (N/'benchmark-wire-proof-execution28/stop-seal-successor.json','b3cb4a1ba3a40d5f9be9718662c4e1a0d23620642322203ceb56417746331360'),
      (N/'benchmark-wire-proof-execution28/identity-match-counts.json','8ada956913af427ff5d0f22c8575d792f6f2ef4871374bfb232f5da5cffe5e8b')]:
        load(p,h);refs[str(p.relative_to(N))]=ref(p)
    helpers=[('.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py','edeaa3592eb85b60097c79a7577d2025027b53ebc3eba470c092e9c9cf2a009f'),('.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py','cc943d9dfcf1ff07e463cfcc266e906704a5f04ae621b0355c6a5022f75f5e63'),('docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/bootstrap-process-tree-pure-proof-execution01/input-snapshot.py','b6d962a6aaba1c0135e3cee63cb66341bfd42dba3238deef8a7187992ba01849'),('docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/bootstrap-process-tree-pure-proof-execution01/fresh-copy-catalog.json','2624360a76136f37b4e1bc267734eb1954aff16fbd54e56984356ed192eb33a2')]
    for p,h in helpers:check(sha(read(R/p))==h,'ORIGINAL_HELPER_HASH')
    previous=N/'benchmark-wire-proof-execution28'
    baselineSource=load(previous/'harness01-guard-after-source.json')
    baselineFull=load(previous/'harness01-after-full-inputs.json')
    priorCache=load(previous/'harness01-cache-after.private.json')
    snapshot=runpy.run_path(str(R/helpers[2][0]))['snapshot']
    catpath=N/'benchmark-wire-proof-identity40-independent-review/corrected-source-authored-identity-catalogue.json'
    catalogue=load(catpath,'f5ebfbc59a5255bd1bad0d05e4a990519d1660c117500b7e9d2fe1b3958cb82f')
    with (B/'corrected-source-authored-identity-catalogue.json').open('xb') as f:f.write(read(catpath))
    check(sum(x['file']=='test/evaluation/benchmarkScoring.test.ts' for x in catalogue['rows'])==31,'CATALOGUE_SCORING31')
    remaining=commands['sequence'][1:]
    check([x['id'] for x in remaining]==['scoring01','types01','lint01'],'ONLY_REMAINING_THREE')
    for cmd in remaining:
        for key,p in cmd['outputs'].items():
            if p and key not in ('beforeFullInputs','afterFullInputs'):check(not (R/p).exists(),'LABEL_OUTPUT_NOT_FRESH')
        check(not list((R/'docs/qa/evidence/STUDIO-OBS-011/execution').glob(cmd['label']+'*')),'LABEL_PREFIX_NOT_FRESH')
    guards=runtime()
    initialSource=capture(B/'initial-source.json')
    previousFull=full(B/'initial-full-inputs.json');exactfull(baselineFull,previousFull,False)
    initialCache=cache(B/'initial-cache.private.json');check(initialCache==priorCache,'AFTER_HARNESS_CACHE_BASELINE')
    hits=[key for key,value in initialCache['results'] if key.endswith('test/evaluation/benchmarkScoring.test.ts')]
    check(len(hits)==1,'SCORING_CACHE_KEY');cacheKeys={'scoring01':hits[0]}
    release={'kind':'ROOT_CONDITIONAL_CONTINUATION41_CRITERIA_BOUND','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'contextReference':ref(context),'references':refs,'originalHelpers':[ref(R/p) for p,h in helpers],'runtimeGuards':guards,'correctedCatalogueReference':ref(catpath),'frozenAfterHarnessSourceReference':ref(previous/'harness01-guard-after-source.json'),'frozenAfterHarnessFullInputsReference':ref(previous/'harness01-after-full-inputs.json'),'frozenAfterHarnessCacheReference':ref(previous/'harness01-cache-after.private.json'),'currentInitialSourceReference':ref(B/'initial-source.json'),'currentInitialFullInputsReference':ref(B/'initial-full-inputs.json'),'currentInitialCacheReference':ref(B/'initial-cache.private.json'),'onlyMutableCacheKeyByRole':cacheKeys,'allConditionalCriteriaPassed':True,'onlyThreeRemainingReviewedCommandsReleased':True,'harnessRerunForbidden':True,'priorOrchestrationRaw1AndHarnessRaw0Preserved':True,'noOtherRuntimeAuthority':True}
    emit(B/'root-release41.json',release)
    previousCache=initialCache
    for cmd in remaining:
        phase=cmd['id'];role=phase;pre=runtime()
        beforeSource=capture(O/(role+'-guard-before-source.json'))
        beforeFull=full(O/(role+'-before-full-inputs.json'));exactfull(previousFull,beforeFull,False)
        beforeCache=cache(O/(role+'-cache-before.private.json'));check(beforeCache==previousCache,'INTERSTEP_CACHE_DRIFT')
        with (O/(role+'-stdout.private')).open('xb') as out,(O/(role+'-stderr.private')).open('xb') as err:
            process=subprocess.Popen(cmd['wrapperArgv'],cwd=R,env=ENV,stdout=out,stderr=err)
            emit(O/(role+'-launch.json'),{'argv':cmd['wrapperArgv'],'pid':process.pid,'cwd':str(R),'PATHPrefix':str(NODE.parent),'originalLabel':cmd['label']})
            print(json.dumps({'event':'original_wrapper_launched','stage':role,'pid':process.pid}),flush=True)
            raw=process.wait()
        print(json.dumps({'event':'original_wrapper_terminal','stage':role,'rawExit':raw}),flush=True)
        afterSource=capture(O/(role+'-guard-after-source.json'))
        afterFull=full(O/(role+'-after-full-inputs.json'));afterCache=cache(O/(role+'-cache-after.private.json'))
        exactfull(beforeFull,afterFull,role in cacheKeys);delta=cachedelta(beforeCache,afterCache,role)
        post=runtime();result=load(R/cmd['outputs']['result'])
        for key,p in cmd['outputs'].items():
            if p and key not in ('beforeFullInputs','afterFullInputs') and (R/p).is_file():os.chmod(R/p,0o600)
        check(result['sourceStable'] is True and result['testInputStable'] is True and result['distStable'] is True,'WRAPPER_STABILITY_FLAGS')
        for key in ['beforeSourceCapture','afterSourceCapture']:sourceguard(load(R/cmd['outputs'][key]))
        projection=None
        if role=='scoring01':projection=project(R/cmd['outputs']['opaqueVitestJson'],'test/evaluation/benchmarkScoring.test.ts')
        stage={'id':role,'originalPid':process.pid,'originalWrapperRawExit':raw,'wrapperResult':result,'wrapperOutputReferences':[ref(R/p) for key,p in cmd['outputs'].items() if p and key not in ('beforeFullInputs','afterFullInputs') and (R/p).is_file()],'freshFullInputsReferences':[ref(O/(role+'-'+kind+'-full-inputs.json')) for kind in ['before','after']],'cacheDelta':delta,'runtimeBefore':pre,'runtimeAfter':post,'sourceDistExact':True,'onlyAllowedFullProfileDelta':True,'sourceBoundCaseProjection':ref(O/'benchmarkScoring.test.ts.public-cases.json') if projection else None}
        stages.append(stage);emit(O/(role+'-receipt.json'),stage)
        check(raw==0 and result['exit']==0,'ORIGINAL_CHECK_FAILED')
        if projection:check(projection['success'] is True and projection['selectedStatuses']=={'passed':31} and projection['filteredStatuses']=={},'SELECTED_CASE_FAILURE')
        previousFull=afterFull;previousCache=afterCache
        print(json.dumps({'event':'stage_closed_pass','stage':role,'selectedPass':31 if role=='scoring01' else None,'filtered':0 if role=='scoring01' else None,'sourceDistStable':True}),flush=True)
    emit(O/'receipt.json',{'kind':'ACTUAL_WIRE_CONTINUATION41_TERMINAL','allThreeRemainingCommandsPassed':True,'stageReferences':[ref(O/(s['id']+'-receipt.json')) for s in stages],'rootReleaseReference':ref(B/'root-release41.json'),'harnessCarryReference':refs['benchmark-wire-proof-identity40-independent-review/manifest.json'],'originalFailedOrchestrationStopPreserved':True,'originalHarnessNeverRerun':True,'selectedHarnessPassCarriedThroughIndependentQa':61,'harnessIntentionalFilters':15,'scoringPassObserved':31,'combinedSelectedCaseInvocations':92,'combinedPhysicalTestFileInvocations':2,'sourceDigest':CURRENT,'distDigest':DIST,'sourceRows':1814,'distRows':238,'onlyScoringExistingTypedCacheEntryChanged':True,'fullProfileRows':13995,'inputRows':13757,'sourceWritesOrCacheRestore':False,'coverageDisabledFocusedScope':True,'noIndependentApprovalLifecycleOrExternalGateClaim':True,'heavyAndActualInputReadWindowReleased':True})
    print(json.dumps({'event':'continuation_terminal','allThreePassed':True,'heavyAndActualInputReadWindowReleased':True}),flush=True)
except Exception as error:
    allowed=str(error) if type(error) is RuntimeError and re.fullmatch('[A-Z0-9_]+',str(error)) else 'ORCHESTRATION_EXCEPTION'
    emit(O/'stop-receipt.json',{'kind':'BOUNDED_CONTINUATION41_STOP','phase':phase,'closedFailureCode':allowed,'exceptionType':type(error).__name__,'closedStages':[s['id'] for s in stages],'remainingCommandsNotAuthorizedToContinue':True,'harnessRerunSourceFixRetryOrCacheRestorePerformed':False,'heavyAndActualInputReadWindowReleased':True})
    print(json.dumps({'event':'continuation_stopped','phase':phase,'closedFailureCode':allowed,'exceptionType':type(error).__name__}),flush=True)
    sys.exit(1)

