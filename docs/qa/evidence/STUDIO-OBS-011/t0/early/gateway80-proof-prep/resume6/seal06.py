"""Source-only proof/seal author. Writes THIS preparation directory only."""
from pathlib import Path
import difflib,hashlib,json,sys
D=Path(__file__).resolve().parent;P=D.parent/'resume5'
GENERATED={'manifest.json','SHA256SUMS','successor-diff.json','strict-successor.diff.patch','strict-successor.reverse.patch','diff-validation.json','static-checks.json','pure-control-results.json','boundary-control-results.json','revision-control-results.json','admission-control-results.json','report-admission-control-results.json','revision06-control-results.json','preseal-check-history.json','retained-control-preservation.json','final-test-source-pins.json'}
RUNTIME={'contracts.py','run-private.py','capture-admission.py','verified-inputs.py','verify-final.py','exit-gate.py','postclose.py','final-controls.py','capture-once.bash','guard-exit.bash'}
INACTIVE={'rewrite06.py','capture-fixes06.py','metadata-fixtures06.py','entry-generation06.py','observation-functions.inc'}
sha=lambda b:hashlib.sha256(b).hexdigest()
def write(name,value):
    path=D/name
    if path.parent!=D:raise AssertionError('TOP_LEVEL_GENERATED_NAME_REQUIRED')
    path.write_text(json.dumps(value,indent=2)+'\n')
def info(path):
    if not path.exists():return None
    b=path.read_bytes();return {'sha256':sha(b),'bytes':len(b),'mode':path.stat().st_mode&0o777}
def role(name):
    if name in GENERATED:return 'GENERATED_PROOF_FINAL_MANIFEST_HASH_AUTHORITY'
    if name in RUNTIME:return 'CURRENT06_RUNTIME_SOURCE_INACTIVE_PENDING_AUTHORITY'
    if name in INACTIVE:return 'HISTORICAL06_AUTHORING_SOURCE_FRAGMENT_NOT_A_RUNTIME_ENTRY'
    if name.startswith('history/'):return 'EXPLICIT_HISTORICAL_SOURCE_OR_PROOF'
    if name.endswith('controls.py'):return 'GUARDED_PURE_TEST_SOURCE'
    if name in ('verify-proofs.py','seal06.py'):return 'SOURCE_ONLY_PROOF_TOOL'
    return 'SOURCE_OR_AUTHORED_METADATA'
def make_diff():
    old=json.loads((P/'manifest.json').read_text());oldnames={r['path'] for r in old['files']}
    names={str(p.relative_to(D)) for p in D.rglob('*') if p.is_file()}|oldnames
    source=[];generated=[];forward=[];reverse=[];changed=0
    for name in sorted(names-{'manifest.json','SHA256SUMS'}):
        a=info(P/name);b=info(D/name)
        if name in GENERATED:
            generated.append({'path':name,'role':role(name),'oldHistoricalPin':a,'currentHashAuthority':'manifest.json files exact hash/bytes/mode; no old hash is asserted as current equality'})
            continue
        source.append({'path':name,'role':role(name),'old':a,'new':b,'status':'UNCHANGED_EXACT' if a==b else 'ADDED' if a is None else 'REMOVED' if b is None else 'CHANGED_EXACT'})
        if a==b:continue
        changed+=1;aa='' if a is None else (P/name).read_text();bb='' if b is None else (D/name).read_text()
        forward.extend(difflib.unified_diff(aa.splitlines(True),bb.splitlines(True),fromfile='/dev/null' if a is None else 'resume5/'+name,tofile='/dev/null' if b is None else 'resume6/'+name,n=3))
        reverse.extend(difflib.unified_diff(bb.splitlines(True),aa.splitlines(True),fromfile='/dev/null' if b is None else 'resume6/'+name,tofile='/dev/null' if a is None else 'resume5/'+name,n=3))
    (D/'strict-successor.diff.patch').write_text(''.join(forward));(D/'strict-successor.reverse.patch').write_text(''.join(reverse))
    write('successor-diff.json',{'kind':'HONEST_SOURCE_VS_GENERATED_06_SUCCESSOR','currentPreparationGeneration':'resume6','subjectPreviousGeneration':'resume5','priorManifestSha256':sha((P/'manifest.json').read_bytes()),'sourceRecords':source,'generatedRecords':generated,'changedSourceRecords':changed,'strictPatchPolicy':'All changed/added/removed non-generated source, authored metadata and explicit history files; no fuzz/offset; generated proof bytes bound by final manifest only.','selfHashCycle':False,'currentRuntimeOrNativeActions':0})
    print(json.dumps({'changedSourceRecords':changed,'sourceRecords':len(source),'generatedRoles':len(generated)}))
def seal():
    files=[]
    for path in sorted(D.rglob('*')):
        if path.is_symlink():raise AssertionError('NO_PREPARATION_SYMLINK')
        if not path.is_file() or path.name=='manifest.json' and path.parent==D or path.name=='SHA256SUMS' and path.parent==D:continue
        name=str(path.relative_to(D));files.append({'path':name,**info(path),'role':role(name)})
    value={'schemaVersion':1,'status':'SOURCE06_PREPARED_PENDING_EXACT_INDEPENDENT_REVIEWS','preparationGeneration':'resume6','immediatePriorManifestSha256':'607859e3f5e43ab4dad52afdcf1f1842801f2abacc197527b819e11668ccf1ab','rootSourceOnlyFindingsAdoptionSha256':'448b1896730f77740e52561c12065ec315e85d336089be1097be72fe1e89fd4d','files':files,'memberCount':len(files),'controls':{'retained':248,'new06':85,'all':333,'allPassedPureSourceOnly':True},'interpretationSites':84,'inputClasses':14,'publicInputPins':25,'preservedOld05Members':109,'preservedOld04Members':93,'nativeLabel':'obs009-gateway80-offtree03-20261019','suppliedCurrentRuntimeState':'E_CREATED_HONLY_W_ABSENT_ADMISSION01_FAILED_NATIVE0_SAME_HOLDER_NOT_OBSERVED_BY_AUTHOR','actualNativeRuntimePrivateOSSignalLockSourceCaptureOrSharedApplyActions':0,'actualProtectedBaselineReadStatHash':False,'conditionalExactSourceSupport':'OWED_FROM_NEW_ARCHITECTURE_AND_QA','actualContinuationAuthorityIssued':False,'readiness':False,'permit':False,'credit':False,'C8SourceMainIRLaneLifecycleReleased':False,'sealRule':'Exact declared payload bytes/modes; manifest and checksum exclude themselves; generated proof metadata uses only final manifest authority, no reciprocal self hash.'}
    write('manifest.json',value)
    (D/'SHA256SUMS').write_text(''.join(r['sha256']+'  '+r['path']+'\n' for r in files)+sha((D/'manifest.json').read_bytes())+'  manifest.json\n')
    print(json.dumps({'memberCount':len(files),'manifestSha256':sha((D/'manifest.json').read_bytes())}))
if __name__=='__main__':
    if sys.argv[1:] == ['diff']:make_diff()
    elif sys.argv[1:] == ['seal']:seal()
    else:raise ValueError('SOURCE_ONLY_diff_OR_seal_REQUIRED')
