"""Static AST/JSON ordering checks only, with output confined to this review directory."""
import ast
import hashlib
import json
from pathlib import Path

ROOT=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
T=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'
P=T/'early/c8-fullcheck-prep'
E=P/'resume4/execution'; C=P/'resume3/control'; O=T/'qa/c8-composed-unit01-review'
checks=[]
def require(name,value,detail):
    assert value,name
    checks.append({'name':name,'passed':True,'sourceEvidence':detail})
def function(path,name):
    source=path.read_text();tree=ast.parse(source)
    node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
    return ast.get_source_segment(source,node),node
assess,a=function(E/'assessor.py','assess')
require('outward-custody-before-report-claim-body',assess.index('report_observation=observe_fixed_public_report(r)')<assess.index("report_bytes=scope['regular'](report)"),'assessor.assess observes outward custody before current-body branch')
require('physical-manifest-before-any-report-copy',assess.index("store(out/'report-manifest-before-archive.json'")<assess.index("scope['archive_original'](p,out/'preserved-jacoco-report'/relative)"),'assessor.assess physical store precedes archive loop')
require('fresh-custody-before-archive',assess.index("current_paths=observe_fixed_public_report(r)['paths']")<assess.index("scope['archive_original'](p,out/'preserved-jacoco-report'/relative)"),'current re-observation and original fact equality precede each archive')
require('cross-coverage-excluded-from-union',"union=set(sessions.get('test',[])+sessions.get('guidedIncrementalTest',[]))" in assess and "'crossReplicaExecMerged':False" in assess,'merged report/session union is default+incremental only')
keeper,k=function(E/'phase_keeper.py','main')
require('preflight-and-negative-before-native',keeper.index("admission=load(d/'guard-admission-negative-result.json')")<keeper.index("code=scope['run_owned']") and keeper.index("held=load(d/'held-preflight.json')")<keeper.index("code=scope['run_owned']"),'actual receipts required before owned run')
require('one-fixed-owned-native-call',sum(isinstance(n,ast.Call) and isinstance(n.func,ast.Subscript) and isinstance(n.func.slice,ast.Constant) and n.func.slice.value=='run_owned' for n in ast.walk(k))==1,'one call site; mutually exclusive explicitly selected phases; no next-phase invocation')
require('hard-admission-before-reconcile-claim',keeper.index('admission_errors=reconcile_admission_errors(previous,assessment)')<keeper.index("owned=d/('owned-'+phase)") and "if admission_errors:raise ValueError('STANDARD_RECONCILE_HARD_HOLD')" in keeper,'prior evidence/ownership/classification gate precedes phase claim/native')
require('single-use-phase-claim',"owned.mkdir(mode=0o700,exist_ok=False)" in keeper and "(d/phase).mkdir(mode=0o700,exist_ok=False)" in keeper,'exclusive never-reused directories before native')
require('exact-compile-only-command',"command=['./gradlew','--offline','compileTestJava','--rerun-tasks','--no-daemon']" in keeper,'no tests or implicit phase retry in reconciliation command')
final,f=function(C/'final_verifier.py','main')
require('final-verifier-no-permit-or-exit',"'permitWritten':False,'exitInvoked':False" in final and "new('unlock-permit.json'" not in final and "new('preunlock-verification.json',ready)" in final,'producer writes only final-resource-boundary and preunlock-verification')
require('final-current-proof-before-readiness-write',final.index('live=g.observe(')<final.index("new('preunlock-verification.json',ready)"),'ready_requirements then live observation/current requirements before exclusive outputs')
gate,gm=function(C/'unlock_gate.py','main')
require('gate-negative-before-packet-load',gate.index("'FINAL_VERIFICATION_REQUIRED'")<gate.index('b=load_packet(expected)'),'readiness required before full packet; supports genuine absent-readiness guard denial')
require('freshness-before-and-after-current-checks',gate.index('fresh(b,time.time())')<gate.index('observe(b,shell)') and 'assess(b,observe(b,shell),time.time(),requested)' in gate,'assess invokes fresh after evaluated observe; max age is 60s')
gate_assess,_=function(C/'unlock_gate.py','assess')
require('assess-rechecks-fresh-current',"requirements(b,requested);fresh(b,now);current_observation_requirements(b,live)" in gate_assess,'current/source/metadata/kernel evidence must satisfy same bound ready/permit')
loader,_=function(C/'unlock_gate.py','load_packet')
require('physical-manifest-loaded-hashed-linked',"('reportManifestBeforeArchive','full-check/report-manifest-before-archive.json')" in loader and 'report_manifest_requirements(proofs[\'reportManifestBeforeArchive\']' in loader,'proof=True adds manifest SHA to evidence; schema and proof crosslinks checked')
require('exact-loader-private-pair',"namespace=load_pure_execution(safe_bytes(module_path),safe_bytes(inventory_path)" in loader,'actual adapter loads pinned execution_checks/report_inventory pair')
ready,_=function(C/'unlock_gate.py','ready_requirements'); permit,_=function(C/'unlock_gate.py','requirements')
require('ready-manifest-evidence-permit-same-state',"v['evidencePins']==b['evidenceHashes']" in ready and "'evidencePins'" in permit and "a[key]==v[key]" in permit,'current loaded manifest hash is in readiness and separate exact permit')
require('hard-errors-not-qualifiable',"set(b['executionErrors'])<=QUALIFIABLE_EXECUTION_ERRORS" in ready,'only two explicitly bounded current/reconcile observation errors can qualify; STANDARD_RECONCILE never included')
post,_=function(C/'postclose.py','main')
require('postclose-separate-actual-exit-proof',"result['actualWrapperExit']==requested" in post and "'OWNED_OR_CONTROLLER_STILL_LIVE'" in post and "'KERNEL_NOT_FREE'" in post,'postclose requires separate result, controller/owned absence-or-reuse, source/boundary, kernel free')
guard=(C/'guard-exit.bash').read_text()
require('guard-installed-before-setup-check',guard.index('readonly -f exit')<guard.index("if [[ $- != *i*"),'HOLD function is installed even if setup fails')
require('builtin-exit-only-after-successful-gate',guard.index('if command python3')<guard.index('builtin exit "$1"')<guard.index("GATE_DENIED_SHELL_RETAINED"),'only explicit numeric requested exit can reach builtin after gate0; readonly function keeps denied shell held')
core,_=function(T/'early/fullcheck-harness/resume3/harness.py','run_owned')
require('baseexception-finally-owned-drain', 'finally:' in core and 'except BaseException:' in core and "ownership_drain_decision(rows, known, child.poll() is not None)" in core,'census-first/sticky class/reparented-known identity functions were hash verified and replayed separately')
template=json.loads((P/'composed-resume1/release-template.json').read_text())
note=json.loads((T/'resume2-c8-actual-release-required-bindings.json').read_text())
require('inactive-template-and-explicit-wrapper-prerequisite',template['nativeCommandReleased'] is False and template['unlockGuard']['enabled'] is False and 'lockWrapperSha256' not in template and note['lockWrapperSha256']=='2846314e3ab12926bff6eb458d7058c406b983092fb40b1fb5c2fa087c2366df','root must create a new actual release including wrapper pin; inactive template remains unchanged')
fields=['authorizedBy','label','nativeCommandReleased','fullAcceptedSuccessorFreshCheckAuthorized','writers','sourceDigest','sourceLease','expectedPlanSha256','expectedCatalogSha256','immutableBasePlanSha256','executionPackagePins','controlPackagePins','phaseKeeperSha256','maximumCollectorInvocations','maximumCompileReconcileInvocations','unlockGuard','lockWrapperSha256']
assert set(fields)-set(template)=={'lockWrapperSha256'}
result={'status':'STATIC_COMPOSED_ORDERING_INSPECTION_PASS','checks':checks,'count':len(checks),
 'requiredActualReleaseConsumedFields':fields,'rootAdditionalBindingObligations':['exact composition manifest','exact independently sealed whole-unit architecture review','exact independently sealed whole-unit QA review','fresh source/modes/aux/tools/resources and unused label','exclusive zero-writer lease','new actual wrapper/shell/argv/start/FD/inode/kernel pin','genuinely absent readiness negative/status1 then SAME-holder preflight'],
 'actualProtectedBodyOrNativeOrOSAction':False,'actualReleaseReadinessPermitCredit':False}
with (O/'ordering-inspection.json').open('x') as out:json.dump(result,out,indent=2);out.write('\n')
print(json.dumps({'status':result['status'],'checks':len(checks)}))
