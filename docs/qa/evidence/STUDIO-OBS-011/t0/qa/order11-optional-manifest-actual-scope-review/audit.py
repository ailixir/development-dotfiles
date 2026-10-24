"""Actual optional scope review using SOURCE/PUBLIC bytes and pure guards only.
Never opens private XML/snapshot/journal/log, derives TEMP, or executes helper/descriptor methods.
"""
from pathlib import Path,PurePosixPath
from types import ModuleType
from collections import Counter
import ast,copy,datetime,hashlib,json,os,re,stat,sys,xml.etree.ElementTree as ET
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';D=T/'runtime/obs011-order11-optional-manifest-candidate01';HROOT=T/'early/order11-snapshot-manifest-capture/resume2';CORE=T/'early/order11-existing-evidence-projection/resume2';O=T/'qa/order11-optional-manifest-actual-scope-review'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();sha=lambda b:hashlib.sha256(b).hexdigest();canonical=lambda v:json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
context=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/order11-optional-manifest-actual-scope-review-context.txt';pins=re.findall(r'^(docs/[^\n]+) SHA256 ([a-f0-9]{64})$',context.read_text(),re.M);assert len(pins)==20
for path,digest in pins:assert h(R/path)==digest,path
scope=json.loads((D/'scope.json').read_text());scope_sha=sha(canonical(scope));assert scope_sha=='1dbab6e7ff198e471dcd7eabfa8488376183871832e949fabebb6e5a0a2ecd04'
root=json.loads((D/'root-approval.json').read_text());assert root=={'schemaVersion':1,'role':'ROOT','approved':True,'scopeSha256':scope_sha}
falseauth=json.loads((D/'root-authorization.json').read_text());falseq=json.loads((D/'quinn-approval.json').read_text());assert falseauth['released'] is False and falseauth['scope']==scope and falseq['approved'] is False
assert falseauth['rootApprovalSha256'] is falseauth['quinnApprovalSha256'] is None
assert scope['issuedAtUtc']=='2026-10-19T06:39:11.459110+00:00' and scope['expiresAtUtc']=='2026-10-19T07:34:11.459110+00:00'
issued=datetime.datetime.fromisoformat(scope['issuedAtUtc']);expires=datetime.datetime.fromisoformat(scope['expiresAtUtc']);now=datetime.datetime.now(datetime.timezone.utc);assert issued<=now<expires and (expires-issued).total_seconds()==3300
assert scope['purpose']=='ORDER11_SNAPSHOT_FACTS_MANIFEST_CAPTURE' and scope['optionalCorrelation'] is True and scope['journalAuthority']=='ONE_FIXED_OWNED_JOURNAL_GUIDED_INTERVAL_ONLY'
assert scope['allowedRoles']==['default_xml','guided_log','owned_events','snapshot_initial18']
control_raw=(D/'capture-control.json').read_bytes();control=json.loads(control_raw);assert sha(control_raw)==scope['captureControlSha256'] and control['expectedRoot'] is control['expectedIds'] is None
# SOURCE artifacts only, explicit manifests; never enumerate old actual releases/outputs.
assert h(HROOT/'capture_snapshot.py')==scope['parserSha256']=='6a0156cc2de6a163420fab0d1db4ee2a1150665d18107263694c88bb2f46fec2'
assert h(HROOT/'manifest.json')==scope['packageManifestSha256']=='0aeb9c6549d7ca4e0eff3466866e8a0e97e06256dab3bcc015a53b7ecd65db9d'
assert h(HROOT/'bindings.json')==scope['sourceBindingsSha256'];helper_manifest=json.loads((HROOT/'manifest.json').read_text())
for name,digest in helper_manifest['files'].items():assert h(HROOT/name)==digest
bindings=json.loads((HROOT/'bindings.json').read_text());assert len(bindings)==36
for path,digest in bindings.items():assert '/release/' not in path and '/released-projection-01/' not in path;assert h(R/path)==digest
assert h(T/'qa/order11-manifest-io-fix-review/review.md')=='a1688efb633140b9c5cf785e093819d9979c5e948a09b8d2f03c8812aac0272e'
assert h(T/'resume2-order11-optional-io-static-root-adoption.json')=='846c40d2635efd6859dc4a3e0b6ea2513cc9e940637f957857fb5752b9c65e79'
# Actual original collector/captures and outer receipt are PUBLIC control metadata only.
base=R/'docs/qa/evidence/STUDIO-OBS-011/execution';raw_paths={'receipt':base/'obs011-t0-fresh-check03-results.json','before':base/'obs011-t0-fresh-check03-before.json','after':base/'obs011-t0-fresh-check03-after.json'};raw={k:p.read_bytes() for k,p in raw_paths.items()}
for key,field in [('receipt','rawReceiptSha256'),('before','beforeSha256'),('after','afterSha256')]:assert sha(raw[key])==scope[field]
collector=json.loads(raw['receipt']);before=json.loads(raw['before']);after=json.loads(raw['after'])
assert collector['command']==['caffeinate','-i','./gradlew','--continue','check','--rerun-tasks','--no-daemon'] and sha(canonical(collector['command']))==scope['nativeCommandSha256']
assert collector['exit']==collector['gradleExit']==1 and collector['counts']=={'total':2774,'passed':2764,'failed':1,'errors':0,'skipped':9}
assert before['digest']==after['digest']==scope['sourceDigest'] and before['dist']['digest']==after['dist']['digest']==scope['distDigest'] and before['files']==after['files'] and before['dist']['files']==after['dist']['files']
plan=json.loads((T/'early/fullcheck-harness/resume3/plan.json').read_text());assert len(plan['source']['files'])==1808 and len(plan['source']['dist']['files'])==238
for row in plan['source']['files']:assert h(R/row['path'])==row['sha256']
for row in plan['source']['dist']['files']:assert h(R/'studio-runner/dist'/row['path'])==row['sha256']
for key,count in [('helm',22),('quotedCurrent',20),('immutableHelpers',6)]:
 assert len(plan[key])==count
 for path,digest in plan[key].items():assert h(R/path)==digest
listed_main={x['path'] for x in plan['source']['files'] if x['path'].startswith('backend/src/main/')};actual_main={str(p.relative_to(R)) for p in (R/'backend/src/main').rglob('*') if p.is_file()};assert listed_main==actual_main and len(actual_main)==506
# Closed PUBLIC assessment/seal/adoption and authoritative recorded-identity census.
assert h(T/'qa/fullcheck03-terminal-public/assessment.md')==scope['closedPublicAssessmentSha256']
seal_path=T/'qa/fullcheck03-terminal-public/final-seal.json';assert h(seal_path)==scope['closedPublicSealSha256'];seal=json.loads(seal_path.read_text());assert seal['nativeResult']=='FAIL' and seal['freshCoverageProved'] is False and seal['observationGapPreserved'] is True
assert len(seal['artifacts'])==seal['artifactCount']==21
for row in seal['artifacts']:
 p=seal_path.parent/row['path'];assert h(p)==row['sha256'] and p.stat().st_size==row['bytes'] and f'{stat.S_IMODE(p.stat().st_mode):04o}'==row['mode']
assessment=json.loads((seal_path.parent/'assessment.json').read_text());assert assessment['native']['allPass'] is False and assessment['outer']['ownedIdentityObservationGap'] is True and assessment['disposition']['C8Passed'] is False and assessment['disposition']['rootCauseEstablished'] is False
reference=json.loads((seal_path.parent/'qualified-public-reference-archive.json').read_text());assert reference['originalBytesCopied'] is False and reference['rawHistoricalEvidenceRewritten'] is False and len(reference['records'])==2285 and len({x['alias'] for x in reference['records']})==2285
adoption_path=T/'resume2-fullcheck03-public-assessment-root-adoption.json';assert h(adoption_path)==scope['closedPublicAdoptionSha256'];adoption=json.loads(adoption_path.read_text())
proof_path=R/adoption['references']['terminal']['path'];assert h(proof_path)==scope['closedRootTerminalProofSha256'];proof=json.loads(proof_path.read_text());outer_path=R/proof['receipt']['path'];assert h(outer_path)==scope['rawHarnessReceiptSha256']==proof['receipt']['sha256'];outer=json.loads(outer_path.read_text())
assert outer['collectorInvocations']==1 and outer['sourceWrites']==0 and outer['nativeGradleExit']==outer['primaryCollectorExit']==outer['collectorExit']==1 and outer['ownedIdentityObservationGap'] is True and outer['fullGateSucceeded'] is False and outer['evidenceComplete'] is False
identities=outer['ownedIdentities'];assert len(identities)==2595 and len({(x['pid'],x['start']) for x in identities})==2595 and all(type(x['pid']) is int and x['pid']>0 and x.get('start') not in {None,'','UNAVAILABLE'} for x in identities)
assert len(outer['ownedJvmTerminalProof'])==235 and all(x['proof']=='PID_ABSENT' for x in outer['ownedJvmTerminalProof']) and outer['remainingOwnedNonJvmFacts']==[]
assert proof['ownedRecorded']==2595 and proof['independentlyObservedTerminalCounts']=={'PID_ABSENT':2595} and proof['sameStartOwnedLive']==proof['missingKernelStart']==[] and proof['rootWrapperAbsent'] is proof['collectorAbsent'] is True
prior_census=json.loads((seal_path.parent/'terminal-precondition.json').read_text());assert prior_census['recordedIdentities']==2595 and prior_census['counts']=={'PID_ABSENT':2595} and prior_census['missingRecordedStarts']==0
fresh_path=T/'resume2-order11-optional-manifest-current-inputs.json';assert h(fresh_path)=='320d5cfda079c9b785e27d9a68f847228ae75ca9a2ebad838dac9e7f8f2a1d49';fresh=json.loads(fresh_path.read_text())
assert fresh['atUtc']==scope['issuedAtUtc'] and fresh['recordedOwned']==2595 and fresh['kernelCounts']=={'PID_ABSENT':2590,'PID_REUSED_DIFFERENT_KERNEL_START':5}
assert sum(fresh['kernelCounts'].values())==2595 and fresh['unrecordedOwnershipNotClaimed'] is True and fresh['stickyGapPreserved'] is True and fresh['nativeExitStill1'] is True
for k in ['source1808Unchanged','dist238Unchanged','helm22Quotes20Helpers6Unchanged']:assert fresh[k] is True
assert fresh['mainFileCount']==506 and fresh['productSourceWrites'] is False
fresh_old=T/'resume2-order11-capture-preparation-fresh-inputs.json';assert h(fresh_old)==scope['freshInputsSha256']
terminal_raw=(D/'terminal-proof.json').read_bytes();terminal=json.loads(terminal_raw);public_raw=(D/'public-assessment.json').read_bytes();public=json.loads(public_raw)
assert sha(terminal_raw)==scope['terminalProofSha256'] and sha(public_raw)==scope['publicAssessmentSha256'] and terminal['completedAtUtc']==fresh['atUtc']
assert h(fresh_path) in terminal['authoritativeClosureEvidenceSha256'] and h(proof_path) in terminal['authoritativeClosureEvidenceSha256'] and h(fresh_old) in terminal['authoritativeClosureEvidenceSha256'] and h(seal_path) in terminal['authoritativeClosureEvidenceSha256']
# SOURCE AST extraction only. No loader/main/local_bindings/module input side effects.
core_source=(CORE/'project_existing.py').read_text();ct=ast.parse(core_source);P=ModuleType('scope_review_pure_core');P.__dict__.update(HERE=HROOT,ROOT=R,C=json.loads((CORE/'source-contract.json').read_text()))
cls={'Refused','ClosedArgumentParser','ExactIO'};func={'require','digest','stable_stat','canonical','keys','integer','pairs','decode','uuid_text','scope_contract','preauthorize','authorize','numbers','snapshot','instant_ns','owned_producer','validate_manifest'};const={'SOURCE_PATHS','FQCN','ROLES','SAFE','SHA','OPERATIONS'}
nodes=[n for n in ct.body if isinstance(n,(ast.Import,ast.ImportFrom)) or isinstance(n,ast.ClassDef) and n.name in cls or isinstance(n,ast.FunctionDef) and n.name in func or isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id in const for x in n.targets)];exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-pure-source-core>','exec'),P.__dict__)
P.C['purpose']=scope['purpose'];H=ModuleType('scope_review_helper');H.__dict__.update(P=P,HERE=HROOT,ROOT=R,Path=Path,PurePosixPath=PurePosixPath,argparse=P.argparse,datetime=datetime,hashlib=hashlib,json=json,os=os,re=re,stat=stat,sys=sys,ET=ET)
ht=ast.parse((HROOT/'capture_snapshot.py').read_text());names={'PURPOSE','CONDITIONAL','XML_PATH','SNAPSHOT','TARGET','PINS','BINDING_PATHS','base_scope','OPTIONAL_IO_FAILURES'};nodes=[]
for n in ht.body:
 if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name not in {'main','local_bindings'}:nodes.append(n)
 elif isinstance(n,ast.Assign) and (any(isinstance(x,ast.Name) and x.id in names for x in n.targets) or any(isinstance(x,ast.Attribute) and isinstance(x.value,ast.Name) and x.value.id=='P' and x.attr in {'scope_contract','validate_document'} for x in n.targets)):nodes.append(n)
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-helper-pure-definitions-only>','exec'),H.__dict__)
local={'parserSha256':h(HROOT/'capture_snapshot.py'),'packageManifestSha256':h(HROOT/'manifest.json'),'sourceBindingsSha256':h(HROOT/'bindings.json')}
# Current actual authorization must refuse before any output/control/private method can be called.
class NoPrivateIO:
 def __init__(self):self.public_calls=[]
 def read_public(self,alias):self.public_calls.append(alias);assert alias=='authorization';return (D/'root-authorization.json').read_bytes()
 def __getattr__(self,name):raise AssertionError('Protected/private method forbidden in current guard check: '+name)
io=NoPrivateIO();false_expected={k:sha((D/({'authorization':'root-authorization.json','root_approval':'root-approval.json','quinn_approval':'quinn-approval.json'}[k])).read_bytes()) for k in ['authorization','root_approval','quinn_approval']}
try:H.run(io,false_expected,local,now);raise AssertionError('unreleased packet succeeded')
except P.Refused as error:assert str(error)=='NO_EXECUTION_RELEASE'
assert io.public_calls==['authorization']
# Model final assembly IN MEMORY only; independent approval is not written until the complete audit passes.
quinn={'schemaVersion':1,'role':'QUINN','approved':True,'scopeSha256':scope_sha};qraw=(json.dumps(quinn,indent=2)+'\n').encode();rraw=(D/'root-approval.json').read_bytes();assembled={'schemaVersion':1,'released':True,'scope':scope,'rootApprovalSha256':sha(rraw),'quinnApprovalSha256':sha(qraw)};araw=(json.dumps(assembled,indent=2)+'\n').encode()
guard_public={'authorization':araw,'root_approval':rraw,'quinn_approval':qraw,'terminal':terminal_raw,'assessment':public_raw,**raw};expected={'authorization':sha(araw),'root_approval':sha(rraw),'quinn_approval':sha(qraw)}
permit=P.authorize(guard_public,expected,local,now);assert permit['scope']==scope and permit['rawCollectorExit']==permit['rawGradleExit']==1 and permit['observationGapSticky'] is True
assert H.control(control_raw,permit)==control
# Root approval without independent Quinn approval cannot unlock this actual scope.
false_quinn=(D/'quinn-approval.json').read_bytes();bad=copy.deepcopy(assembled);bad['quinnApprovalSha256']=sha(false_quinn);badraw=(json.dumps(bad,indent=2)+'\n').encode()
try:P.authorize({**guard_public,'authorization':badraw,'quinn_approval':false_quinn},{**expected,'authorization':sha(badraw),'quinn_approval':sha(false_quinn)},local,now);raise AssertionError('false independent approval accepted')
except P.Refused as error:assert str(error)=='MISSING_INDEPENDENT_APPROVAL'
try:P.authorize(guard_public,expected,local,expires+datetime.timedelta(seconds=1));raise AssertionError('expired actual scope accepted')
except P.Refused as error:assert str(error)=='AUTHORIZATION_NOT_FRESH'
# Do not alter candidate false files, assemble actual auth, or inspect private revision release/output.
assert h(D/'scope.json')=='081acaf733965cd9377090052616b2c8d18748bec56ab185e87bceddd6756837' and h(D/'root-authorization.json')=='13fdc1dafd7b288fe13b77c8c365c37d720512ddeaa19843b9323d86f6f1e834'
out=dict(scope='EXACT_ACTUAL_OPTIONAL_MANIFEST_METADATA_SCOPE_REVIEW',scopeSha256=scope_sha,scopeFileSha256=h(D/'scope.json'),dispatchPinsVerified=len(pins),reviewedAtUtc=now.isoformat(),issuedAtUtc=scope['issuedAtUtc'],expiresAtUtc=scope['expiresAtUtc'],sourceFilesIndependentlyRehashed=1808,distFilesIndependentlyRehashed=238,helmQuotesHelperCounts=[22,20,6],mainMembershipVerified=506,sourceBindingsVerified=36,helperArtifactEntriesVerified=len(helper_manifest['files']),closedPublicSealArtifactsVerified=21,qualifiedReferenceRecords=2285,recordedIdentityCountVerified=2595,recordedIdentityKeysUniqueAndStarted=True,originalJvmTerminalProofs=235,freshRootCertifiedKernelCounts=fresh['kernelCounts'],newKernelProcessScanPerformed=False,unrecordedOwnershipClaim=False,historicalObserverGapPreserved=True,originalCollectorCounts=collector['counts'],collectorAndGradleExit=[1,1],coverageAndC8StillUnproved=True,currentActualAuthorizationRefusesBeforePrivate=True,modeledSameScopeFinalPublicGuardsPass=True,rootOnlyApprovalRefuses=True,expiredScopeRefuses=True,controlExpectedRootAndIdsNull=True,actualPrivateEnumerationStatReadGlobCopyExport=0,tempDerived=False,helperLoaderMainDescriptorExecuted=False,candidateFalseFilesChanged=False,actualAuthorizationAssembled=False,firstCaptureRetried=False,newNativeSourceAction=False,quinnApprovalPermittedForExactScope=True)
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))
