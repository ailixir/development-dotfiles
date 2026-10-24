"""Closed-report/control/SOURCE review only; no raw native input or private-manifest stat/read."""
from pathlib import Path
from types import ModuleType
import ast,hashlib,json,re,datetime,stat,os
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';D=T/'runtime/obs011-order11-optional-manifest-candidate01';HROOT=T/'early/order11-snapshot-manifest-capture/resume2';CORE=T/'early/order11-existing-evidence-projection/resume2';O=T/'qa/order11-optional-manifest-runtime-review'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();sha=lambda b:hashlib.sha256(b).hexdigest();canonical=lambda v:json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
ctx=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/order11-optional-manifest-runtime-review-context.txt';pins=re.findall(r'^(docs/[^\n]+) SHA256 ([a-f0-9]{64})$',ctx.read_text(),re.M);assert len(pins)==30
for path,digest in pins:assert h(R/path)==digest,path
scope=json.loads((D/'scope.json').read_text());scope_hash=sha(canonical(scope));assert scope_hash=='1dbab6e7ff198e471dcd7eabfa8488376183871832e949fabebb6e5a0a2ecd04'
release=json.loads((D/'root-final-release.json').read_text());terminal=json.loads((D/'actual-helper-terminal.json').read_text());consumed=json.loads((D/'actual-execution-consumed.json').read_text());assert release['scopeSha256']==terminal['scopeSha256']==consumed['scopeSha256']==scope_hash
assert release['independentReviewSha256']==h(T/'qa/order11-optional-manifest-actual-scope-review/review.md')=='97527f52185128441c2a71cd1de9245e0cba294b76ac4aa3ca3fd1f1bc058c9c'
assert set(release['releaseFiles'])=={'capture-control.json','terminal-proof.json','public-assessment.json','root-approval.json','quinn-approval.json','root-authorization.json'}
for name,digest in release['releaseFiles'].items():assert h(HROOT/'release'/name)==digest and stat.S_IMODE((HROOT/'release'/name).stat().st_mode)==384
released=json.loads((HROOT/'release/root-authorization.json').read_text());root=json.loads((HROOT/'release/root-approval.json').read_text());quinn=json.loads((HROOT/'release/quinn-approval.json').read_text())
assert released['released'] is True and released['scope']==scope and root=={'schemaVersion':1,'role':'ROOT','approved':True,'scopeSha256':scope_hash} and quinn=={'schemaVersion':1,'role':'QUINN','approved':True,'scopeSha256':scope_hash}
assert released['rootApprovalSha256']==release['releaseFiles']['root-approval.json'] and released['quinnApprovalSha256']==release['releaseFiles']['quinn-approval.json']
assert h(HROOT/'release/quinn-approval.json')==h(T/'qa/order11-optional-manifest-actual-scope-review/quinn-approval.json')=='b592fc3e20ae45dada8026fb6baa23ac4d05e5796c36e0a84f588f12982399b1'
assert release['argv']==['/opt/homebrew/opt/python@3.13/bin/python3.13',str(HROOT/'capture_snapshot.py'),'--expected-authorization-sha',release['releaseFiles']['root-authorization.json'],'--expected-root-approval-sha',release['releaseFiles']['root-approval.json'],'--expected-quinn-approval-sha',release['releaseFiles']['quinn-approval.json']]
issued=datetime.datetime.fromisoformat(scope['issuedAtUtc']);expires=datetime.datetime.fromisoformat(scope['expiresAtUtc']);start=datetime.datetime.fromisoformat(consumed['atUtc']);end=datetime.datetime.fromisoformat(terminal['atUtc']);assert issued<=start<=end<=expires
assert terminal['exit']==0 and terminal['outputClaimConsumed'] is True and terminal['automaticRetry'] is consumed['automaticRetry'] is False
assert terminal['stdoutSha256']==h(D/'actual-helper.stdout') and terminal['stderrSha256']==h(D/'actual-helper.stderr') and (D/'actual-helper.stderr').stat().st_size==0
stdout=json.loads((D/'actual-helper.stdout').read_text());assert stdout=={'status':'SNAPSHOT_FACTS_VALID_CONDITIONAL_SOURCE_PROVENANCE','optionalCorrelation':'UNPROVEN','cause':'UNPROVEN','privateRawExported':False,'nativeOrLaneCredit':False}
# These two explicit CLOSED reports are approved inputs. Never open their raw inputBindings' artifacts.
report_path=HROOT/'released-projection-01/snapshot-facts.json';old_path=HROOT.parent/'released-projection-01/snapshot-facts.json';report=json.loads(report_path.read_text());old=json.loads(old_path.read_text())
assert h(report_path)=='80a1d99646bf4139610c78c0f3dec17bbc003403fb915a69eef341024d079fdb' and h(old_path)=='8c614f55800d99f619aa570a9ad0395506f444dae53bd19601bd0e5af7773445'
assert stat.S_IMODE(report_path.stat().st_mode)==stat.S_IMODE(old_path.stat().st_mode)==384
assert report['snapshot']==old['snapshot']=={'phase':'AFTER_P3_INNER_CLEANUP','state':'FAILED','errorCode':'OTHER','bootstrapPhase':'CONTEXT_PENDING','identityProvenance':'SOURCE_ORDERED_MAP_FIXED_FILENAME_PUBLIC_ORDINALS_CONDITIONAL','externalUuidJoinProved':False,'OTHERMeansNoError':False}
assert report['optionalCorrelation']=={'status':'UNPROVEN','reason':'OPTIONAL_PROVENANCE_OR_SHAPE_UNPROVEN','manifestSha256':None}
assert old['optionalCorrelation']=={'status':'NOT_REQUESTED','reason':'NONE','manifestSha256':None}
assert report['inputBindings'][:2]==old['inputBindings'] and [x['role'] for x in report['inputBindings']]==['default_xml','snapshot_initial18','owned_events']
assert report['inputBindings'][1]=={'bytes':2650,'mode':384,'role':'snapshot_initial18','sha256':'546c0fbd9e05c8fa04e3b378c928cc946d224fe696b11a9c178d836fa18b8579'}
assert report['inputBindings'][2]['bytes']<=8388608 and report['inputBindings'][2]['mode']==384 and len(report['inputBindings'][2]['sha256'])==64
assert report['rawCollectorExit']==report['rawGradleExit']==1 and report['observationGapSticky'] is True and report['privateRawExported'] is report['nativeOrLaneCredit'] is False
assert all(report[k]==old[k]=='UNPROVEN' for k in ['firstWriter','chronology','cause'])
assert report['rawReceiptSha256']==scope['rawReceiptSha256'] and report['rawHarnessReceiptSha256']==scope['rawHarnessReceiptSha256']
# Exact code and static correction binding; explicit SOURCE files only, no package/release enumeration.
source=(HROOT/'capture_snapshot.py').read_text();tree=ast.parse(source);assert h(HROOT/'capture_snapshot.py')==scope['parserSha256']=='6a0156cc2de6a163420fab0d1db4ee2a1150665d18107263694c88bb2f46fec2'
assert h(HROOT/'manifest.json')==scope['packageManifestSha256']=='0aeb9c6549d7ca4e0eff3466866e8a0e97e06256dab3bcc015a53b7ecd65db9d'
for name,digest in json.loads((HROOT/'manifest.json').read_text())['files'].items():assert h(HROOT/name)==digest
bindings=json.loads((HROOT/'bindings.json').read_text());assert len(bindings)==36
for path,digest in bindings.items():assert '/release/' not in path and '/released-projection-01/' not in path;assert h(R/path)==digest
assert h(T/'qa/order11-manifest-io-fix-review/review.md')=='a1688efb633140b9c5cf785e093819d9979c5e948a09b8d2f03c8812aac0272e'
# Validate CLOSED report using only actual pure closed-schema definitions.
contract=json.loads((CORE/'source-contract.json').read_text());ct=ast.parse((CORE/'project_existing.py').read_text());P=ModuleType('closed_report_core');P.__dict__.update(C=contract)
nodes=[n for n in ct.body if isinstance(n,(ast.Import,ast.ImportFrom)) or isinstance(n,ast.ClassDef) and n.name=='Refused' or isinstance(n,ast.FunctionDef) and n.name in {'require','keys','integer'} or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in {'SAFE','SHA','ROLES'} for t in n.targets)];exec(compile(ast.Module(body=nodes,type_ignores=[]),'<closed-report-schema-only>','exec'),P.__dict__)
H=ModuleType('closed_helper_schema');H.__dict__.update(P=P,PURPOSE=scope['purpose'],CONDITIONAL=report['snapshot']['identityProvenance'])
pins_node=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PINS' for t in n.targets));validator=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='validate_report');exec(compile(ast.Module(body=[pins_node,validator],type_ignores=[]),'<actual-closed-report-validator-only>','exec'),H.__dict__);H.validate_report(report);H.validate_report(old)
# Source progression proof only: no raw journal is supplied, parsed or used to identify a predicate.
run=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='run');optional=next(n for n in ast.walk(run) if isinstance(n,ast.If) and "optionalCorrelation" in ast.unparse(n.test));block=next(n for n in optional.body if isinstance(n,ast.Try))
steps=[ast.unparse(n) for n in block.body]
assert "io.read_child(chain, 'owned-worker-generations.jsonl', 8388608, 'owned_events')" in steps[0] and steps[1]=='bindings.append(journal_fact)'
assert 'select_generation(journal, temp)' in steps[2] and "io.read_child(chain, path, 16777216, 'guided_log')" in steps[3] and steps[4]=='bindings.append(log_fact)'
assert 'manifest = ' in steps[5]
constant=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='OPTIONAL_IO_FAILURES' for t in n.targets));labels=ast.literal_eval(constant.value.args[0]);assert len(labels)==16
assert "incomplete = str(failure) in OPTIONAL_IO_FAILURES" in ast.unparse(block)
assert "except OSError:" in ast.unparse(block) and "incomplete = True" in ast.unparse(block)
# Core retained reader reachable failures were closed by a168; read_child contains only two local fixed labels.
cap=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='CaptureIO');read_child=next(n for n in cap.body if isinstance(n,ast.FunctionDef) and n.name=='read_child')
local_refusals={n.args[1].value for n in ast.walk(read_child) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='require'};assert local_refusals<=labels
assert "if manifest is not None:\n        io.write_doc(manifest, 'correlation-input-manifest.json')" in ast.unparse(run)
# Reverify held SOURCE/Helm/quotes/helpers; no raw report input, native TEMP or private manifest stat/read.
plan=json.loads((T/'early/fullcheck-harness/resume3/plan.json').read_text())
for row in plan['source']['files']:assert h(R/row['path'])==row['sha256']
for row in plan['source']['dist']['files']:assert h(R/'studio-runner/dist'/row['path'])==row['sha256']
for key in ['helm','quotedCurrent','immutableHelpers']:
 for path,digest in plan[key].items():assert h(R/path)==digest
out=dict(scope='ACTUAL_ONE_OPTIONAL_METADATA_ATTEMPT_QUALIFIED_NEGATIVE_CLOSURE',dispatchPinsVerified=len(pins),scopeSha256=scope_hash,authorizationSha256=release['releaseFiles']['root-authorization.json'],quinnApprovalSha256=release['releaseFiles']['quinn-approval.json'],helperSha256=h(HROOT/'capture_snapshot.py'),packageManifestSha256=h(HROOT/'manifest.json'),executionConsumedAtUtc=consumed['atUtc'],terminalAtUtc=terminal['atUtc'],actualExit=0,stderrBytes=0,completedBeforeOriginalExpiry=True,reportSha256=h(report_path),priorReportSha256=h(old_path),sameClosedSnapshotBinding=True,sameSnapshotFacts=True,snapshotEnums={'state':'FAILED','errorCode':'OTHER','bootstrapPhase':'CONTEXT_PENDING'},conditionalProvenanceAndNoUuidJoin=True,actualRoles=[x['role'] for x in report['inputBindings']],optionalResult=report['optionalCorrelation'],journalWholeReadAndBindingEstablished=True,generationQualificationNotCompleted=True,guidedLogReadNotReachedByExactSourceFlow=True,failedPredicateIdentified=False,manifestProducedByThisExecution=False,manifestFilesystemPresenceInspected=False,sourceUnchangedCounts=[1808,238,22,20,6],rawNegativeExitsAndStickyGapPreserved=True,actualBoundedAttemptMayCloseQualifiedUnproven=True,remainingAuthorizedReadInConsumedScope=False,optionalManifestAndCauseGoalMet=False,preservationRequired=['immutable collector/PUBLIC archives and seals','both closed reports and all release/control/source bindings','original native TEMP inputs without cleanup'],specificAdditionalPrivateReadPrerequisiteIdentified=False,sourceOrGsTWriterReleased=False,rawSnapshotJournalLogOrManifestStatRead=0,tempDerived=False,helperOrNativeExecutedByReviewer=False)
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
