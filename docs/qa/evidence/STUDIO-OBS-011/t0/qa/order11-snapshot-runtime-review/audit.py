"""Independent closed-export/release audit. No raw TEMP/locator derivation or helper execution."""
from pathlib import Path
from types import ModuleType
import ast,datetime,hashlib,json,os,re,stat

ROOT=Path.cwd();T0=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'
CAND=T0/'runtime/obs011-order11-snapshot-capture-candidate01'
PKG=T0/'early/order11-snapshot-manifest-capture'
CORE=T0/'early/order11-existing-evidence-projection/resume2'
OUT=T0/'qa/order11-snapshot-runtime-review';SCOPE='3db69ef3657428b7fd8780c9aa0fab93afb2f9187f9a5764636c7a94107c57f7'
checks=[];facts={}
def check(name,value):assert value,name;checks.append(name)
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):
    # Every caller path is an explicit repository source, release or approved closed export.
    assert p.is_relative_to(ROOT)
    for x in [p,*p.parents]:assert not x.is_symlink()
    a=p.stat();assert stat.S_ISREG(a.st_mode)
    b=p.read_bytes();z=p.stat()
    assert (a.st_dev,a.st_ino,a.st_uid,a.st_mode,a.st_size,a.st_mtime_ns,a.st_ctime_ns)==(z.st_dev,z.st_ino,z.st_uid,z.st_mode,z.st_size,z.st_mtime_ns,z.st_ctime_ns)
    f={'sha256':sha(b),'bytes':len(b),'mode':f'{stat.S_IMODE(a.st_mode):04o}','uid':a.st_uid,'mtimeNs':a.st_mtime_ns}
    if p in facts:assert facts[p]==f
    facts[p]=f;return b
def load(p):return json.loads(read(p))
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
def write(name,obj):
    fd=os.open(OUT/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump(obj,f,indent=2);f.write('\n')
ctx=read(ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/order11-snapshot-runtime-review-context.txt').decode()
for path,digest in re.findall(r'^(.+) SHA256 ([0-9a-f]{64})$',ctx,re.M):check('pinned '+Path(path).name,sha(read(ROOT/path))==digest)
final=load(CAND/'root-final-release.json');terminal=load(CAND/'actual-helper-terminal.json');consumed=load(CAND/'actual-execution-consumed.json')
scope=load(CAND/'scope.json');auth=load(PKG/'release/root-authorization.json');root=load(PKG/'release/root-approval.json');quinn=load(PKG/'release/quinn-approval.json')
check('exact approved scope everywhere',sha(canonical(scope))==SCOPE and auth['scope']==scope and all(x['scopeSha256']==SCOPE for x in [final,terminal,consumed,root,quinn]))
check('actual release exactly root+independent Quinn',auth['released'] is True and root=={'schemaVersion':1,'role':'ROOT','approved':True,'scopeSha256':SCOPE} and quinn=={'schemaVersion':1,'role':'QUINN','approved':True,'scopeSha256':SCOPE})
check('external approval pins bound',auth['rootApprovalSha256']==sha(read(PKG/'release/root-approval.json')) and auth['quinnApprovalSha256']==sha(read(PKG/'release/quinn-approval.json')))
check('same prior independent scope approval',sha(read(PKG/'release/quinn-approval.json'))==sha(read(T0/'qa/order11-snapshot-actual-scope-review/quinn-approval.json'))=='18f64fb0edf752910c1414d35ec0d3c8f442c3be514c570346cad4978ac13745')
for name,digest in final['releaseFiles'].items():
    p=PKG/'release'/name;check('exact actual release file '+name,sha(read(p))==digest and facts[p]['mode']=='0600' and facts[p]['uid']==os.getuid())
check('six protected release inputs',set(final['releaseFiles'])=={'capture-control.json','terminal-proof.json','public-assessment.json','root-approval.json','quinn-approval.json','root-authorization.json'})
check('release directory protected',stat.S_IMODE((PKG/'release').stat().st_mode)==0o700 and (PKG/'release').stat().st_uid==os.getuid())
argv=final['argv']
check('actual helper and external triple-pin argv',argv[1:]==[str(PKG/'capture_snapshot.py'),'--expected-authorization-sha',final['releaseFiles']['root-authorization.json'],'--expected-root-approval-sha',final['releaseFiles']['root-approval.json'],'--expected-quinn-approval-sha',final['releaseFiles']['quinn-approval.json']])
check('helper-package-source bound at reviewed versions',sha(read(PKG/'capture_snapshot.py'))==scope['parserSha256']=='a619c4463f6e7f1aa4bcbb0ee8ca21a90b3d01e1de193f1f61029c9473d325cc' and sha(read(PKG/'manifest.json'))==scope['packageManifestSha256'] and sha(read(PKG/'bindings.json'))==scope['sourceBindingsSha256'])
for name,digest in load(PKG/'manifest.json')['files'].items():check('sealed helper file '+name,sha(read(PKG/name))==digest)
for path,digest in load(PKG/'bindings.json').items():check('current bound source/PUBLIC '+path,sha(read(ROOT/path))==digest)
check('no optional authority',scope['optionalCorrelation'] is False and scope['journalAuthority']=='NONE' and final['optionalFindingHeld']=='SNAP-MANIFEST-IO-01')
control=load(PKG/'release/capture-control.json');check('conditional control no opaque invented identities',control['expectedRoot'] is None and control['expectedIds'] is None and control['target']['sessionOrdinal']==18 and control['target']['invocationOrdinal']==12 and control['target']['scopeOrdinal']==4 and control['provenanceBasis']=='SOURCE_ORDERED_MAP_FIXED_FILENAME_PUBLIC_ORDINALS_CONDITIONAL')
issued=datetime.datetime.fromisoformat(scope['issuedAtUtc']);expires=datetime.datetime.fromisoformat(scope['expiresAtUtc']);started=datetime.datetime.fromisoformat(consumed['atUtc']);ended=datetime.datetime.fromisoformat(terminal['atUtc'])
check('actual execution inside original unrefreshed window',issued<=datetime.datetime.fromisoformat(final['atUtc'])<=started<=ended<=expires)
check('single consumed attempt no retry',consumed['automaticRetry'] is False and terminal['automaticRetry'] is False and terminal['outputClaimConsumed'] is True and terminal['exit']==0)
stdout=read(CAND/'actual-helper.stdout');stderr=read(CAND/'actual-helper.stderr')
check('actual output streams pinned',sha(stdout)==terminal['stdoutSha256'] and sha(stderr)==terminal['stderrSha256'] and stderr==b'')
console=json.loads(stdout)
check('console fixed and sanitized',console=={'status':'SNAPSHOT_FACTS_VALID_CONDITIONAL_SOURCE_PROVENANCE','optionalCorrelation':'NOT_REQUESTED','cause':'UNPROVEN','privateRawExported':False,'nativeOrLaneCredit':False})
output=PKG/'released-projection-01/snapshot-facts.json';raw=read(output);out=json.loads(raw)
check('actual approved closed export hash',sha(raw)=='8c614f55800d99f619aa570a9ad0395506f444dae53bd19601bd0e5af7773445')
check('closed output owner/mode',facts[output]['uid']==os.getuid() and facts[output]['mode']=='0600')
check('claimed output directory owner/mode',stat.S_IMODE(output.parent.stat().st_mode)==0o700 and output.parent.stat().st_uid==os.getuid())
check('closed output original mtime inside actual attempt',started.timestamp()<=facts[output]['mtimeNs']/1e9<=ended.timestamp()+2)
check('canonical complete export bytes',raw==canonical(out)+b'\n')

# Compile only closed-output grammar primitives/validator. No private reader, locator or run function.
tree=ast.parse(read(CORE/'project_existing.py'));P=ModuleType('closed_output_validation_only');P.__dict__.update(C=load(CORE/'source-contract.json'))
functions={'require','digest','canonical','keys','integer'};constants={'ROLES','SAFE','SHA'}
nodes=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom)) or isinstance(n,ast.ClassDef) and n.name=='Refused' or isinstance(n,ast.FunctionDef) and n.name in functions or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in constants for t in n.targets)]
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<closed-export-primitives-only>','exec'),P.__dict__)
P.C['purpose']=scope['purpose'];H=ModuleType('closed_export_only');H.__dict__.update(P=P)
tree=ast.parse(read(PKG/'capture_snapshot.py'));nodes=[]
for n in tree.body:
    if isinstance(n,ast.FunctionDef) and n.name=='validate_report':nodes.append(n)
    elif isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in {'PURPOSE','CONDITIONAL','PINS'} for t in n.targets):nodes.append(n)
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<closed-export-validator-only>','exec'),H.__dict__)
check('no raw input/main/locator capability compiled',all(x not in H.__dict__ for x in ['source_temp','run','main','CaptureIO','snapshot_facts']) and 'ExactIO' not in P.__dict__)
H.validate_report(out);check('closed source-defined output schema',True)
check('only actual source enums with correct phase/provenance',out['snapshot']=={'OTHERMeansNoError':False,'bootstrapPhase':'CONTEXT_PENDING','errorCode':'OTHER','externalUuidJoinProved':False,'identityProvenance':'SOURCE_ORDERED_MAP_FIXED_FILENAME_PUBLIC_ORDINALS_CONDITIONAL','phase':'AFTER_P3_INNER_CLEANUP','state':'FAILED'})
check('no writer/cause/chronology inference',all(out[k]=='UNPROVEN' for k in ['cause','chronology','firstWriter']))
check('only two snapshot-only input roles',len(out['inputBindings'])==2 and {r['role'] for r in out['inputBindings']}=={'default_xml','snapshot_initial18'} and out['optionalCorrelation']=={'manifestSha256':None,'reason':'NONE','status':'NOT_REQUESTED'})
check('raw private export and credit both false',out['privateRawExported'] is False and out['nativeOrLaneCredit'] is False)
check('negative native and raw harness preserved',out['rawCollectorExit']==out['rawGradleExit']==1 and out['rawReceiptSha256']==scope['rawReceiptSha256'] and out['rawHarnessReceiptSha256']==scope['rawHarnessReceiptSha256'] and out['observationGapSticky'] is True)
forged=dict(out,rawPath='/synthetic/private-marker')
try:H.validate_report(forged);raise AssertionError('extra raw field accepted')
except P.Refused:check('closed validator rejects added raw field',True)
source_text=read(PKG/'capture_snapshot.py').decode();core_text=read(CORE/'project_existing.py').decode()
check('optional reads syntactically unreachable',"if permit['scope']['optionalCorrelation']:" in source_text and "scope.get('journalAuthority')==('ONE_FIXED_OWNED_JOURNAL_GUIDED_INTERVAL_ONLY' if scope['optionalCorrelation'] else 'NONE')" in source_text)
check('exclusive source-defined one-shot output claim',"os.mkdir('released-projection-01',0o700,dir_fd=parent)" in core_text and 'os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW' in core_text)
check('success only after final close','finally:io.close()' in source_text and source_text.index('finally:io.close()')<source_text.index("print(json.dumps({'status':out['status']"))
plan=load(T0/'early/fullcheck-harness/resume3/plan.json')
for row in plan['source']['files']:check('held source '+row['path'],sha(read(ROOT/row['path']))==row['sha256'])
for row in plan['source']['dist']['files']:check('held dist '+row['path'],sha(read(ROOT/'studio-runner/dist'/row['path']))==row['sha256'])
for group in ['helm','quotedCurrent','immutableHelpers']:
    for path,digest in plan[group].items():check('held '+group+' '+path,sha(read(ROOT/path))==digest)
harness=load(T0/'early/fullcheck-harness/resume3/runs/obs011-t0-fresh-check03/receipt.json')
check('original full03 qualification unchanged',harness['ownedIdentityObservationGap'] is True and harness['fullGateSucceeded'] is False and all(harness['requiredTaskStatuses'][k]=='ABSENT' for k in ['requireFreshGuidedPartitions','jacocoTestReport','jacocoTestCoverageVerification','check']))
for p,fact in list(facts.items()):check('final closed/source read stable '+p.name,sha(read(p))==fact['sha256'])
result={'decision':'ACTUAL_FIRST_SNAPSHOT_ONLY_CAPTURE_COMPLETE','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scopeSha256':SCOPE,'checksPassed':len(checks),'checks':checks,'actualExit':0,'actualOutputSha256':sha(raw),'outputEnums':out['snapshot'],'firstWriter':'UNPROVEN','chronology':'UNPROVEN','cause':'UNPROVEN','inputRolesOnly':[r['role'] for r in out['inputBindings']],'optionalReadsSupportedZeroByExactFalseNoneCodeBranch':True,'optionalSystemCallTracingClaimed':False,'initialCaptureHoldDischargedForThisCompletedScopeOnly':True,'newPrivatePurposeOrProjectionReleased':False,'optionalFindingStillHeld':'SNAP-MANIFEST-IO-01','originalBackendOutputOrSourceWriterHoldReleased':False,'rawNativeTempStatOpenReadOrLocatorDerivation':0,'journalOrLogRead':0,'helperMainOrNativeCommandExecutedByReviewer':False,'sourceApplied':False,'nativeLaneC8CoverageLifecycleCredit':False,'noRawIdentityPathProviderSecretExport':'Closed output grammar and two exact role bindings verified','budgetCeilingUsd':500,'actualSpend':'UNAVAILABLE','closedSourceReleaseFacts':[{'path':str(p.relative_to(ROOT)),'fact':v} for p,v in facts.items()]}
write('audit.json',result)
print(json.dumps({k:result[k] for k in ['decision','checksPassed','actualExit','initialCaptureHoldDischargedForThisCompletedScopeOnly','optionalFindingStillHeld']}))
