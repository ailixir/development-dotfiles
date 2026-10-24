"""Independent source/explicit-metadata review and six injected predicate cases only."""
import ast
import copy
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode=True
R=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
O=T/'qa/c8-check01-gap-disposition-design-review'
D=T/'resume-architecture/resume2/c8-check01-owned-gap-disposition-proposal'
U=T/'runtime/obs011-t0-c8-check01'
pins={}
allowed_runtime={str(U/name) for name in ('root-actual-unit-release.json','active-lock.json','guard-admission-negative-result.json','execution/execution_checks.py','execution/evidence_classification.py','execution/phase_keeper.py','execution/assessor.py','control/unlock_gate.py','control/guard-exit.bash','control/final_verifier.py','control/postclose.py','control/policy.json')}
audit={'forbiddenActions':0,'unlistedRuntimeOpens':0,'outsideOutputWrites':0}
def guard(event,args):
    if event in ('subprocess.Popen','os.system','os.kill','os.killpg','socket.connect','os.fork','os.exec'):
        audit['forbiddenActions']+=1;raise AssertionError(event)
    if event!='open' or not isinstance(args[0],str):return
    p=Path(args[0]);p=p if p.is_absolute() else R/p
    mode=args[1];writing=isinstance(mode,str) and any(x in mode for x in 'wax+')
    if writing and p.is_relative_to(R) and not p.is_relative_to(O):
        audit['outsideOutputWrites']+=1;raise AssertionError('write scope')
    if p.is_relative_to(T/'runtime') and str(p) not in allowed_runtime:
        audit['unlistedRuntimeOpens']+=1;raise AssertionError('runtime scope')
sys.addaudithook(guard)
def H(data):return hashlib.sha256(data).hexdigest()
def raw(path):
    data=path.read_bytes();pins[str(path.relative_to(R))]={'sha256':H(data),'bytes':len(data)};return data
def read(path):return json.loads(raw(path))
context=read(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/c8-check01-gap-disposition-design-qa-context.json')
assert H(raw(D/'manifest.json'))==context['designManifestSha256']
manifest=read(D/'manifest.json')
for row in manifest['files']:
    data=raw(D/row['path']);assert H(data)==row['sha256'] and len(data)==row['bytes']
assert H(raw(D/'design.md'))==context['designSha256']
for row in read(D/'input-pins.json')['pins']:
    assert H(raw(R/row['path']))==row['sha256']
snapshot=read(T/'early/c8-check01-gap-disposition-input/live-owned-receipt-snapshot.json')
assert snapshot['status']=='RUNNING' and snapshot['ownedIdentityObservationGap'] is True
assert 'ownedIdentities' not in snapshot and snapshot['phases'][-1]['ownedIdentityCount']==136
release=read(U/'root-actual-unit-release.json');pin=read(U/'active-lock.json');admission=read(U/'guard-admission-negative-result.json')
assert pin['rootUnitAuthorizationSha256']==H(raw(U/'root-actual-unit-release.json'))
assert admission['activeLockSha256']==H(raw(U/'active-lock.json')) and admission['sameInteractiveSession']==19501
assert (pin['wrapperPid'],pin['shellPid'])==(45226,45227)
source=raw(U/'execution/execution_checks.py').decode();tree=ast.parse(source)
names={'reconcile_admission_errors','validate_close_evidence'};nodes=[];scope={}
for node in tree.body:
    if isinstance(node,ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id in {'GAPS','ACCEPTED'}:
        scope[node.targets[0].id]=ast.literal_eval(node.value)
    if isinstance(node,ast.FunctionDef) and node.name in names:nodes.append(node)
assert len(nodes)==2
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-pure-admission-close-functions>','exec'),scope)
A=scope['reconcile_admission_errors'];C=scope['validate_close_evidence']
accepted=scope['ACCEPTED']
s={'sourceDigest':accepted,'modesExact':True,'auxiliariesExact':True}
build={'phase':'compile-reconcile','exit':0,'taskStatus':'EXECUTED','buildSuccessful':True,'acceptedSourceEqual':True,'sourceDigest':accepted,**{x:'a'*64 for x in ('taskLogSha256','sourceBeforeSha256','sourceAfterSha256','phaseReceiptSha256')}}
receipt={'phase':'full-check','status':'NATIVE_PHASE_TERMINAL','collectorExit':1,'evidenceErrors':[]}
assessment={'fullGateSucceeded':False,'nativeGradleExit':1,'validationErrors':['ACTUAL_NATIVE_GRADLE_NONZERO'],'evidenceErrors':[],'errorClassificationComplete':True,'unknownClassificationErrors':[]}
base={'fullCheckReceipt':receipt,'assessment':assessment,'buildProvenance':build,'sourceBefore':s,'sourceAfter':copy.deepcopy(s),'reconcileReceipt':{'phase':'compile-reconcile','status':'NATIVE_PHASE_TERMINAL','collectorExit':0},'reconcileAuthorization':{'authorizedBy':'root','maximumInvocations':1,'authorized':True},'expectedWrapperExit':1,'qualification':{'authorized':True}}
results=[]
def record(name,b):
    a=A(b['fullCheckReceipt'],b['assessment']);c=C(b)
    results.append({'case':name,'admissionErrors':a,'closingErrors':c,'syntheticOnly':True});return a,c
a,c=record('fully_evidenced_clean_genuine_validation_failure',copy.deepcopy(base));assert not a and not c
red=copy.deepcopy(base);red['fullCheckReceipt']['ownedIdentityObservationGap']=True;red['assessment']['evidenceErrors']=['CURRENT_STICKY_OWNERSHIP_OR_SOURCE_GAP']
a,c=record('genuine_validation_failure_plus_owned_gap_even_generic_qualification',red)
assert 'STANDARD_RECONCILE_PRIOR_OBSERVATION_GAP_HOLD' in a and 'STANDARD_RECONCILE_ASSESSMENT_EVIDENCE_HOLD' in c
native0=copy.deepcopy(red);native0['fullCheckReceipt']['collectorExit']=0;native0['assessment'].update(nativeGradleExit=0,validationErrors=[])
a,c=record('native_zero_but_owned_gap_not_ordinary_validation_red',native0)
assert 'STANDARD_RECONCILE_REQUIRES_EVIDENCED_VALIDATION_FAILURE' in a
unknown=copy.deepcopy(red);unknown['assessment'].update(errorClassificationComplete=False,unknownClassificationErrors=['UNKNOWN_EVIDENCE'])
a,c=record('unknown_incomplete_evidence_cannot_be_qualified_green',unknown)
assert 'UNCLASSIFIED_RAW_OUTCOME_HOLD' in c and 'STANDARD_RECONCILE_UNKNOWN_CLASSIFICATION_HOLD' in c
running_a=A(snapshot,{'fullGateSucceeded':False,'validationErrors':['INJECTED_CONTROL_FAILURE'],'evidenceErrors':[],'errorClassificationComplete':True,'unknownClassificationErrors':[]})
assert 'STANDARD_RECONCILE_FULLCHECK_NOT_TERMINAL' in running_a and 'STANDARD_RECONCILE_PRIOR_OBSERVATION_GAP_HOLD' in running_a
results.append({'case':'saved_running_snapshot_not_reconcile_admission','admissionErrors':running_a,'snapshotOnly':True,'actualAssessmentNotClaimed':True})
gate=raw(U/'control/unlock_gate.py').decode();gt=ast.parse(gate)
ready=next(n for n in gt.body if isinstance(n,ast.FunctionDef) and n.name=='ready_requirements')
hard=next(n for n in ready.body if isinstance(n,ast.Expr) and 'EXECUTION_PROOF_INCOHERENT' in ast.get_source_segment(gate,n))
qualification=next(n for n in ready.body if isinstance(n,ast.If) and ast.get_source_segment(gate,n).startswith('if gaps:'))
assert hard.lineno<qualification.lineno
g={}
for node in gt.body:
    if isinstance(node,ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id=='QUALIFIABLE_EXECUTION_ERRORS':g[node.targets[0].id]=ast.literal_eval(node.value)
pure=[n for n in gt.body if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name in {'Hold','need'}]
exec(compile(ast.Module(body=pure,type_ignores=[]),'<actual-pure-Hold-need>','exec'),g)
g['b']={'executionErrors':C(red),'qa':{'acceptCurrentQualifiedClosure':True},'rootQualification':{'acceptCurrentQualifiedClosure':True}}
try:exec(compile(ast.Module(body=[hard],type_ignores=[]),'<exact-hard-error-before-qualification>','exec'),g)
except g['Hold'] as error:
    assert str(error)=='EXECUTION_PROOF_INCOHERENT'
    results.append({'case':'actual_gate_hard_error_test_before_qualification','reason':str(error),'qualifiableTokens':sorted(g['QUALIFIABLE_EXECUTION_ERRORS']),'exactExpressionLine':hard.lineno,'qualificationLine':qualification.lineno})
else:raise AssertionError('generic qualification widened old gate')
assert len(results)==6
expected=read(D/'pure-predicate-results.json')['results']
for got,want in zip(results,expected):
    assert got['case']==want['case']
    for key in ('admissionErrors','closingErrors','reason','qualifiableTokens'):
        if key in want:assert got[key]==want[key],(got['case'],key)
keeper=raw(U/'execution/phase_keeper.py').decode()
assert keeper.index('admission_errors=reconcile_admission_errors(previous,assessment)')<keeper.index("decision['decision']=='AUTHORIZE_ONE_COMPILE_RECONCILE'")
assessor=raw(U/'execution/assessor.py').decode()
assert "if any(receipt.get(k,False) for k in GAPS):evidence.append('CURRENT_STICKY_OWNERSHIP_OR_SOURCE_GAP')" in assessor
shell=raw(U/'control/guard-exit.bash').decode()
assert all(x in shell for x in ('readonly -f exit','readonly GST_UNLOCK_DIRECTORY=','readonly GST_UNLOCK_RELEASE_SHA=','readonly GST_UNLOCK_SHELL_PID='))
assert shell.index('if command python3')<shell.index('builtin exit "$1"')
producer=raw(U/'control/final_verifier.py').decode()
assert producer.index('g.ready_requirements(b,requested)')<producer.index("new('preunlock-verification.json',ready)")
for name,value in [('pure-predicate-results.json',{'status':'SIX_INDEPENDENT_ACTUAL_PREDICATE_CASES_PASS','count':6,'results':results,'audit':audit,'actualRuntimeEntryPointOrOSNativeCalls':0,'actualTerminalOrQualificationClaim':False}),('input-pins.json',{'pins':pins,'explicitRuntimeAllowlist':sorted(str(Path(x).relative_to(R)) for x in allowed_runtime),'snapshotOnly':True,'currentNativeTerminalOrOwnedStateObserved':False})]:
    with (O/name).open('x') as f:json.dump(value,f,indent=2);f.write('\n')
print(json.dumps({'status':'SIX_INDEPENDENT_ACTUAL_PREDICATE_CASES_PASS','count':6,'audit':audit}))
