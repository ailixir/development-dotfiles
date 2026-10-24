"""Independent actual PUBLIC packet review. No private locator derivation/IO or helper main."""
from pathlib import Path
from types import ModuleType
import ast,copy,datetime,hashlib,json,os,re,stat

ROOT=Path.cwd();T0=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'
CAND=T0/'runtime/obs011-order11-snapshot-capture-candidate01'
PKG=T0/'early/order11-snapshot-manifest-capture'
CORE=T0/'early/order11-existing-evidence-projection/resume2'
OUT=T0/'qa/order11-snapshot-actual-scope-review'
EXPECTED_SCOPE='3db69ef3657428b7fd8780c9aa0fab93afb2f9187f9a5764636c7a94107c57f7'
facts={};checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
def read(path):
    assert path.is_relative_to(ROOT)
    for p in [path,*path.parents]:assert not p.is_symlink()
    a=path.stat();assert stat.S_ISREG(a.st_mode)
    raw=path.read_bytes();b=path.stat()
    assert (a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns,a.st_mode)==(b.st_dev,b.st_ino,b.st_size,b.st_mtime_ns,b.st_ctime_ns,b.st_mode)
    value={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'mode':f'{stat.S_IMODE(a.st_mode):04o}'}
    if path in facts:assert value==facts[path]
    facts[path]=value;return raw
def sha(raw):return hashlib.sha256(raw).hexdigest()
def load(path):return json.loads(read(path))
def canonical(obj):return json.dumps(obj,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
def write(name,obj):
    fd=os.open(OUT/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump(obj,f,indent=2);f.write('\n')
context=read(ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/order11-snapshot-actual-scope-review-context.txt').decode()
for path,digest in re.findall(r'^(.+) SHA256 ([0-9a-f]{64})$',context,re.M):check('exact dispatch pin '+Path(path).name,sha(read(ROOT/path))==digest)
scope=load(CAND/'scope.json');check('exact canonical scope',sha(canonical(scope))==EXPECTED_SCOPE)
check('snapshot-only exact authority',scope['optionalCorrelation'] is False and scope['journalAuthority']=='NONE')
check('fixed purpose and execution',scope['purpose']=='ORDER11_SNAPSHOT_FACTS_MANIFEST_CAPTURE' and scope['executionLabel']=='obs011-t0-fresh-check03')
root=load(CAND/'root-approval.json');pending_quinn=load(CAND/'quinn-approval.json');unreleased=load(CAND/'root-authorization.json')
check('exact existing independent ROOT approval',root=={'schemaVersion':1,'role':'ROOT','approved':True,'scopeSha256':EXPECTED_SCOPE})
check('candidate still unreleased',unreleased['released'] is False and unreleased['scope']==scope and unreleased['rootApprovalSha256'] is None and unreleased['quinnApprovalSha256'] is None)
check('candidate Quinn still false',pending_quinn=={'schemaVersion':1,'role':'QUINN','approved':False,'scopeSha256':EXPECTED_SCOPE})
static=load(T0/'resume2-order11-snapshot-only-static-root-adoption.json')
check('root narrow static scope matches',static['scopeSha256']==EXPECTED_SCOPE and static['optionalFindingWaived'] is False)
for name,key in [('capture_snapshot.py','parserSha256'),('manifest.json','packageManifestSha256'),('bindings.json','sourceBindingsSha256')]:check('scope package binding '+name,sha(read(PKG/name))==scope[key])
for path,digest in load(PKG/'manifest.json')['files'].items():check('sealed package '+path,sha(read(PKG/path))==digest)
bindings=load(PKG/'bindings.json')
for path,digest in bindings.items():check('actual source/public helper input '+path,sha(read(ROOT/path))==digest)
control_raw=read(CAND/'capture-control.json');control=json.loads(control_raw)
check('exact actual control hash',sha(control_raw)==scope['captureControlSha256'])
check('no invented opaque ID/root facts',control['expectedRoot'] is None and control['expectedIds'] is None)
target={'task':'test','class':'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT','method':'actualCoreGuidedSameSecretIdStaysWithinPersistedScope','invocationOrdinal':12,'variant':'singleton','variantOrdinal':0,'sessionOrdinal':18,'scopeOrdinal':4}
check('exact initial18 target',control['target']==target and control['provenanceBasis']=='SOURCE_ORDERED_MAP_FIXED_FILENAME_PUBLIC_ORDINALS_CONDITIONAL')
collector_path=ROOT/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-fresh-check03-results.json'
before_path=collector_path.with_name('obs011-t0-fresh-check03-before.json');after_path=collector_path.with_name('obs011-t0-fresh-check03-after.json')
collector_raw=read(collector_path);before_raw=read(before_path);after_raw=read(after_path)
collector=json.loads(collector_raw);before=json.loads(before_raw);after=json.loads(after_raw)
for raw,key in [(collector_raw,'rawReceiptSha256'),(before_raw,'beforeSha256'),(after_raw,'afterSha256')]:check('original exact bytes '+key,sha(raw)==scope[key])
check('actual native command exact',collector['command']==['caffeinate','-i','./gradlew','--continue','check','--rerun-tasks','--no-daemon'] and sha(canonical(collector['command']))==scope['nativeCommandSha256'])
check('actual raw whole failed collector',collector['exit']==collector['gradleExit']==1 and collector['counts']=={'total':2774,'passed':2764,'failed':1,'errors':0,'skipped':9} and set(collector['explicitTestTasks'])=={'test','guidedIncrementalTest','crossReplicaTest'})
harness_path=T0/'early/fullcheck-harness/resume3/runs/obs011-t0-fresh-check03/receipt.json';harness=load(harness_path)
check('exact raw harness and negative preserved',sha(read(harness_path))==scope['rawHarnessReceiptSha256'] and harness['ownedIdentityObservationGap'] is True and harness['fullGateSucceeded'] is False and harness['status']=='TERMINAL_INCOMPLETE_EVIDENCE')
check('coverage absent remains negative',all(harness['requiredTaskStatuses'][x]=='ABSENT' for x in ['requireFreshGuidedPartitions','jacocoTestReport','jacocoTestCoverageVerification','check']))
first_path=T0/'resume2-fullcheck03-root-terminal-proof.json';fresh_path=T0/'resume2-order11-capture-preparation-fresh-inputs.json'
first=load(first_path);fresh=load(fresh_path)
check('exact first root closure record',sha(read(first_path))==scope['closedRootTerminalProofSha256'])
check('exact subsequent root input/closure record',sha(read(fresh_path))==scope['freshInputsSha256'])
check('all2595 recorded identities closure evidence',len(harness['ownedIdentities'])==first['ownedRecorded']==fresh['recordedOwned']==2595 and first['independentlyObservedTerminalCounts']=={'PID_ABSENT':2595} and fresh['currentKernelCounts']=={'PID_ABSENT':2593,'PID_REUSED_DIFFERENT_KERNEL_START':2} and first['sameStartOwnedLive']==fresh['sameStartOwnedLive']==[])
check('recorded ownership scope and gap are qualified',first['noHistoricalGapResolutionClaim'] is True and fresh['stickyObservationGapPreserved'] is True and fresh['unrecordedOwnershipNotClaimed'] is True)
check('raw235 JVM and remaining ownership facts',len(harness['ownedJvmTerminalProof'])==235 and not harness['remainingOwnedNonJvmFacts'] and all(x.get('start') for x in harness['ownedIdentities']))
terminal_raw=read(CAND/'terminal-proof.json');assessment_raw=read(CAND/'public-assessment.json');terminal=json.loads(terminal_raw);certificate=json.loads(assessment_raw)
check('exact terminal and PUBLIC certificate hashes',sha(terminal_raw)==scope['terminalProofSha256'] and sha(assessment_raw)==scope['publicAssessmentSha256'])
check('terminal evidence contains exact authoritative proofs',{scope['closedRootTerminalProofSha256'],scope['freshInputsSha256'],scope['closedPublicSealSha256']}<=set(terminal['authoritativeClosureEvidenceSha256']))
check('terminal timestamp grounded in fresh record',terminal['completedAtUtc']==fresh['atUtc'])
check('terminal booleans match recorded evidence',all(terminal[x] is True for x in ['collectorTerminal','sameStartOwnedJvmTerminal','ownedUnknownTerminal','wholeExecutionClosed','sourceHoldVerified','quotesHelmHelpersHeld','observationGapSticky']) and terminal['terminalInferredFromTimeout'] is False)
public_paths={'closedPublicAssessmentSha256':T0/'qa/fullcheck03-terminal-public/assessment.md','closedPublicSealSha256':T0/'qa/fullcheck03-terminal-public/final-seal.json','closedPublicAdoptionSha256':T0/'resume2-fullcheck03-public-assessment-root-adoption.json','originalProtocolSha256':T0/'resume2-report-static-protocol-root-adoption.json'}
for key,path in public_paths.items():check('actual closed PUBLIC/protocol '+key,sha(read(path))==scope[key])
closed=load(T0/'qa/fullcheck03-terminal-public/assessment.json');seal=load(public_paths['closedPublicSealSha256'])
check('closed assessment independently negative',closed['native']['failed']==1 and closed['scope']['identityMultisetExact'] is True and closed['coverage']['freshCoverageProved'] is False and closed['outer']['ownedIdentityObservationGap'] is True and seal['newSourceExecutionOrPrivateAccessRelease'] is False)
for row in seal['artifacts']:check('closed PUBLIC archive sealed '+row['path'],sha(read(T0/'qa/fullcheck03-terminal-public'/row['path']))==row['sha256'])
plan=load(T0/'early/fullcheck-harness/resume3/plan.json')
current=[]
for row in plan['source']['files']:
    digest=sha(read(ROOT/row['path']));check('current held source '+row['path'],digest==row['sha256']);current.append({'path':row['path'],'sha256':digest})
check('exact1808 source digest and before-after membership',len(current)==1808 and sha(json.dumps(current,separators=(',',':')).encode())==scope['sourceDigest'] and before['files']==after['files']==plan['source']['files'])
dist=[]
for p in sorted((ROOT/'studio-runner/dist').rglob('*')):
    if p.is_file() or p.is_symlink():dist.append({'path':str(p.relative_to(ROOT/'studio-runner/dist')),'sha256':sha(read(p))})
check('exact238 dist membership and digest',len(dist)==238 and dist==plan['source']['dist']['files']==before['dist']['files']==after['dist']['files'] and sha(json.dumps(dist,separators=(',',':')).encode())==scope['distDigest'])
helm={str(p.relative_to(ROOT)):sha(read(p)) for p in sorted((ROOT/'helm-chart').rglob('*')) if p.is_file() or p.is_symlink()}
check('all22 Helm inputs held',len(helm)==22 and helm==plan['helm'])
for group in ['quotedCurrent','immutableHelpers']:
    for path,digest in plan[group].items():check('held '+group+' '+path,sha(read(ROOT/path))==digest)
check('20quotes and6helpers',len(plan['quotedCurrent'])==20 and len(plan['immutableHelpers'])==6)
now=datetime.datetime.now(datetime.timezone.utc);issued=datetime.datetime.fromisoformat(scope['issuedAtUtc']);expires=datetime.datetime.fromisoformat(scope['expiresAtUtc'])
check('actual fixed55minute scope still fresh',0<(expires-issued).total_seconds()==3300 and issued<=now<=expires and datetime.datetime.fromisoformat(terminal['completedAtUtc'])<=issued)

# Compile only pure scope/guard/control definitions. No ExactIO, source_temp, main or private parser.
core_tree=ast.parse(read(CORE/'project_existing.py'));P=ModuleType('actual_packet_pure_guard');P.__dict__.update(C=load(CORE/'source-contract.json'))
function_names={'require','digest','canonical','keys','integer','pairs','decode','uuid_text','scope_contract','preauthorize','authorize'}
constant_names={'FQCN','ROLES','SAFE','SHA'}
nodes=[n for n in core_tree.body if isinstance(n,(ast.Import,ast.ImportFrom)) or isinstance(n,ast.ClassDef) and n.name=='Refused' or isinstance(n,ast.FunctionDef) and n.name in function_names or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in constant_names for t in n.targets)]
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-public-packet-pure-guards-only>','exec'),P.__dict__);P.C['purpose']=scope['purpose']
H=ModuleType('actual_packet_control_only');H.__dict__.update(P=P)
helper_tree=ast.parse(read(PKG/'capture_snapshot.py'));nodes=[]
for n in helper_tree.body:
    if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in {'PURPOSE','CONDITIONAL','TARGET','PINS','base_scope'} for t in n.targets):nodes.append(n)
    elif isinstance(n,ast.FunctionDef) and n.name in {'capture_scope','control'}:nodes.append(n)
    elif isinstance(n,ast.Assign) and any(isinstance(t,ast.Attribute) and t.attr=='scope_contract' for t in n.targets):nodes.append(n)
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-control-and-scope-only>','exec'),H.__dict__)
check('no private reader/parser/main compiled',all(name not in P.__dict__ for name in ['ExactIO','run','main']) and all(name not in H.__dict__ for name in ['CaptureIO','run','main','source_temp','snapshot_facts']))
local={key:scope[key] for key in ['parserSha256','packageManifestSha256','sourceBindingsSha256']}
actual_public={'authorization':read(CAND/'root-authorization.json'),'root_approval':read(CAND/'root-approval.json'),'quinn_approval':read(CAND/'quinn-approval.json'),'terminal':terminal_raw,'assessment':assessment_raw}
actual_expected={k:sha(actual_public[k]) for k in ['authorization','root_approval','quinn_approval']}
try:P.preauthorize(actual_public,actual_expected,local,now);raise AssertionError('unreleased actual packet unexpectedly accepted')
except P.Refused as e:check('actual unreleased packet refuses',str(e)=='NO_EXECUTION_RELEASE')
approval={'schemaVersion':1,'role':'QUINN','approved':True,'scopeSha256':EXPECTED_SCOPE}
approval_bytes=(json.dumps(approval,indent=2)+'\n').encode()
proposed=copy.deepcopy(unreleased);proposed.update(released=True,rootApprovalSha256=sha(actual_public['root_approval']),quinnApprovalSha256=sha(approval_bytes))
guard_public=dict(actual_public,authorization=(json.dumps(proposed,indent=2)+'\n').encode(),quinn_approval=approval_bytes,receipt=collector_raw,before=before_raw,after=after_raw)
expected={k:sha(guard_public[k]) for k in ['authorization','root_approval','quinn_approval']}
permit=P.authorize(guard_public,expected,local,now)
check('same-scope prospective final assembly passes exact actual PUBLIC guard',permit['scope']==scope and permit['rawCollectorExit']==permit['rawGradleExit']==1 and permit['observationGapSticky'] is True)
check('exact actual control passes without private witness',H.control(control_raw,permit)==control)
for path,record in list(facts.items()):check('final stable public/source read '+path.name,sha(read(path))==record['sha256'])
final_now=datetime.datetime.now(datetime.timezone.utc)
check('not expired at independent approval',issued<=final_now<=expires)
write('quinn-approval.json',approval)
result={'decision':'APPROVE_EXACT_FIRST_SNAPSHOT_ONLY_SCOPE','scopeSha256':EXPECTED_SCOPE,'atUtc':final_now.isoformat(),'issuedAtUtcUnchanged':scope['issuedAtUtc'],'expiresAtUtcUnchanged':scope['expiresAtUtc'],'approvalSha256':sha(read(OUT/'quinn-approval.json')),'scopeCanonicalHashVerified':True,'checksPassed':len(checks),'checks':checks,'actualReleasedAuthorizationRemainsFalse':True,'actualCandidateApprovalNotOverwritten':True,'finalAuthorizationAssemblyEvaluatedInMemoryOnly':True,'currentSourceFiles':1808,'currentDistFiles':238,'currentHelmFiles':22,'currentQuotedFiles':20,'currentHelpers':6,'recordedOwnedResolved':2595,'historicalObservationGapPreserved':True,'unrecordedOwnershipClaimed':False,'newKernelCensusPerformed':False,'nativeFailedCoverageAbsentPreserved':True,'optionalCorrelation':False,'journalAuthority':'NONE','optionalFindingWaived':False,'expectedIdsOrRootFabricated':False,'actualPrivateEnumerationStatOpenReadGlobCopyExport':0,'actualPrivateLocatorDerived':False,'helperCLIOrMainExecuted':False,'newNativeCommandOrSourceAction':False,'packageExecutionPerformed':False,'laneC8CoverageLifecycleCredit':False,'budgetCeilingUsd':500,'actualSpend':'UNAVAILABLE','sourceAndPublicFacts':[{'path':str(p.relative_to(ROOT)),'fact':r} for p,r in facts.items()]}
write('audit.json',result)
print(json.dumps({k:result[k] for k in ['decision','scopeSha256','approvalSha256','checksPassed','expiresAtUtcUnchanged']}))
