"""Pure in-memory contracts. Synthetic identities/paths/bytes only; no private file reader or CLI.
Only source-contract's two known PUBLIC byte hashes are substituted IN MEMORY for synthetic XML.
All actual source files/public facts remain immutable; this is not terminal/private/native proof.
"""
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import importlib.util,copy,json,hashlib,datetime,xml.etree.ElementTree as ET,ast
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('order11_projection_pure',OUT/'project_existing.py');P=importlib.util.module_from_spec(spec);spec.loader.exec_module(P)
BASE=copy.deepcopy(P.C);sha=P.digest;j=P.canonical
class Fake:
 def __init__(self):
  P.C=copy.deepcopy(BASE);self.calls=[];self.native_reads=0;self.private_manifest_reads=0
  self.sid='00000000-0000-4000-8000-000000000018';self.temp='/synthetic/obs007-joined-closedfake'
  self.snapshot={'schemaVersion':1,'sessionId':self.sid,'testId':'00000000-0000-4000-8000-000000000004','testMethod':P.C['method'],
   'state':'FAILED','errorCode':'OTHER','bootstrapPhase':'ALLOCATED','publicationSnapshotPresent':False,'publicationRevisionPresent':False,'materializationPresent':True,
   'counters':{},'coordinate':{},'observationCounts':{},'acquisition':{},'activeAcquisition':{},'fixtureModelHttpCalls':1,'fixturePhysicalProviderReads':0,'fixtureProviderFailures':0,
   'fixtureModelKinds':{'SOURCE_PLAN':1,'NEXT_ACTION':0,'VERIFY_STEP':0},'actions':[],'obligationAdmissions':[],'modelAttempts':[]}
  self.event={'operation':'context','session':sha(json.dumps(self.sid,separators=(',',':')).encode())[:16],'elapsedMs':12001,
   'links':[{'name':'GuidedStartFailure','code':'CONTEXT_LOST','phase':'LAUNCH'},{'name':'GuidedLaunchFailure','code':'CONTEXT_LOST','phase':'PROCESS'},{'name':'Error','code':'TIMEOUT','kind':'TIMEOUT'}]}
  warning={'timestamp':P.C['publicFacts']['warningTimestampUtc'],'logger':'com.citi.put.checks.studio.guided.bridge.GuidedRunnerClient',
   'message':f'Guided runner refused the context for session {self.sid} (contextHash '+('a'*64)+'): CONTEXT_LOST'}
  warning_line=json.dumps(warning,separators=(',',':'))
  tree=ET.Element('testsuite',tests='46',failures='1',errors='0');case=ET.SubElement(tree,'testcase',classname=P.FQCN,name=P.C['method']+'()')
  failure=ET.SubElement(case,'failure',type='org.opentest4j.AssertionFailedError',message='[second explicit learning; logs '+self.temp+'] ')
  failure.text='fake source-guard failure';ET.SubElement(tree,'system-out').text=warning_line+'\n'
  self.xml=ET.tostring(tree);P.C['publicFacts']['xmlSha256']=sha(self.xml);P.C['publicFacts']['warningLineSha256']=sha(warning_line.encode())
  common={'role':'guided','generation':2,'pid':123,'started':'2026-10-19T00:00:00Z','wrapperSha256':'b'*64,'configSha256':'c'*64,'commandSha256':'d'*64,'poolSize':1,'readinessNonceHash':'e'*64,'readyPort':4000,'ownedTemp':self.temp}
  self.events=[dict(common,event='SPAWN',alive=True),dict(common,event='READY',alive=True),dict(common,event='EXIT_CONFIRMED',alive=False)]
  self.log=None;self.inputs={};self.manifest={'schemaVersion':1,'executionLabel':P.C['executionLabel'],'root':{'path':self.temp,'dev':1,'ino':2,'uid':123,'mode':448},'generation':2,'wrapperSha256':'b'*64,'configSha256':'c'*64,'files':[]}
  self.before={'digest':P.C['sourceDigest'],'dist':{'digest':P.C['distDigest']},'files':[]};self.after=copy.deepcopy(self.before)
  self.receipt={'command':['caffeinate','-i','./gradlew','check','--continue','--rerun-tasks','--no-daemon'],'sourceStable':True,'distStable':True,'testInputStable':True,
   'explicitTestTasks':['test','guidedIncrementalTest','crossReplicaTest'],'exit':1,'gradleExit':1,'taskCollectionComplete':True,
   'testcases':[{'task':'test','class':P.FQCN,'name':P.C['method']+'()','status':'FAIL'}]}
  self.local={'parserSha256':sha((OUT/'project_existing.py').read_bytes()),'packageManifestSha256':'1'*64,'sourceBindingsSha256':sha((OUT/'source-bindings.json').read_bytes())}
  self.terminal={'schemaVersion':1,'executionLabel':P.C['executionLabel'],'rawReceiptSha256':'0'*64,'nativeCommandSha256':'0'*64,'sourceDigest':P.C['sourceDigest'],'distDigest':P.C['distDigest'],'originalProtocolSha256':P.C['originalProtocolSha256'],
   'collectorTerminal':True,'sameStartOwnedJvmTerminal':True,'ownedUnknownTerminal':True,'wholeExecutionClosed':True,'terminalInferredFromTimeout':False,'sourceHoldVerified':True,'quotesHelmHelpersHeld':True,'observationGapSticky':True,'authoritativeClosureEvidenceSha256':['f'*64],'completedAtUtc':'2026-10-19T11:59:00+00:00'}
  self.assessment={'schemaVersion':1,'executionLabel':P.C['executionLabel'],'rawReceiptSha256':'0'*64,'nativeCommandSha256':'0'*64,'sourceDigest':P.C['sourceDigest'],'distDigest':P.C['distDigest'],'terminalProofSha256':'0'*64,
   'wholePublicArchiveFrozen':True,'wholePublicAssessmentComplete':True,'rawFailPreserved':True,'observationGapPreserved':True,'noLaneApproval':True}
  self.released=True;self.root_approved=True;self.quinn_approved=True;self.issued='2026-10-19T12:00:00+00:00';self.expires='2026-10-19T12:30:00+00:00';self.now=datetime.datetime.fromisoformat('2026-10-19T12:00:01+00:00');self.rebind()
 def rebind(self):
  self.inputs={'default_xml':self.xml,'snapshot_initial18':j(self.snapshot),'guided_log':self.log if self.log is not None else b'GUIDED_START_FAILED '+j(self.event)+b'\n','owned_events':b''.join(j(r)+b'\n' for r in self.events)}
  if not self.manifest['files']:
   paths={'default_xml':f"docs/qa/evidence/STUDIO-OBS-011/execution/{P.C['executionLabel']}-task-outputs/test/xml/TEST-{P.FQCN}.xml",'snapshot_initial18':f"failed-test-state-test-12-{P.C['method']}-singleton-18-initial.json",'guided_log':'owned-generations/generation-2/guided.log','owned_events':'owned-worker-generations.jsonl'}
   self.manifest['files']=[{'role':r,'path':paths[r],'sha256':sha(raw),'bytes':len(raw),'mode':384,'dev':1,'ino':i+3,'uid':123} for i,(r,raw) in enumerate(self.inputs.items())]
  else:
   for row in self.manifest['files']:
    if row['role'] in self.inputs:row.update(sha256=sha(self.inputs[row['role']]),bytes=len(self.inputs[row['role']]))
  self.manifest_raw=j(self.manifest)
  scope={'purpose':P.C['purpose'],'executionLabel':P.C['executionLabel'],**self.local,'sourceDigest':P.C['sourceDigest'],'distDigest':P.C['distDigest'],
   'nativeCommandSha256':sha(j(self.receipt['command'])),'rawReceiptSha256':sha(j(self.receipt)),'beforeSha256':sha(j(self.before)),'afterSha256':sha(j(self.after)),
   'terminalProofSha256':'0'*64,'publicAssessmentSha256':'0'*64,'privateManifestSha256':sha(self.manifest_raw),'originalProtocolSha256':self.terminal['originalProtocolSha256'],'allowedRoles':sorted(P.ROLES),'issuedAtUtc':self.issued,'expiresAtUtc':self.expires}
  self.terminal.update(rawReceiptSha256=scope['rawReceiptSha256'],nativeCommandSha256=scope['nativeCommandSha256'])
  scope['terminalProofSha256']=sha(j(self.terminal));self.assessment.update(rawReceiptSha256=scope['rawReceiptSha256'],nativeCommandSha256=scope['nativeCommandSha256'],terminalProofSha256=scope['terminalProofSha256'])
  scope['publicAssessmentSha256']=sha(j(self.assessment));request=sha(j(scope))
  root={'schemaVersion':1,'role':'ROOT','approved':self.root_approved,'scopeSha256':request};quinn={'schemaVersion':1,'role':'QUINN','approved':self.quinn_approved,'scopeSha256':request}
  auth={'schemaVersion':1,'released':self.released,'scope':scope,'rootApprovalSha256':sha(j(root)),'quinnApprovalSha256':sha(j(quinn))}
  self.public={k:j(v) for k,v in {'authorization':auth,'root_approval':root,'quinn_approval':quinn,'terminal':self.terminal,'assessment':self.assessment,'receipt':self.receipt,'before':self.before,'after':self.after}.items()}
  self.expected={k:sha(self.public[k]) for k in ['authorization','root_approval','quinn_approval']}
 def read_public(self,alias):self.calls.append('public:'+alias);return self.public[alias]
 def claim_output(self,permit):
  self.calls.append('fresh_output_claim')
  if getattr(self,'output_exists',False):raise P.Refused('SYNTHETIC_OUTPUT_ALREADY_EXISTS')
 def read_manifest(self,permit):self.calls.append('private_manifest');self.private_manifest_reads+=1;return self.manifest_raw
 def read_default_xml(self,permit,row):self.calls.append('default_xml');return self.inputs['default_xml']
 def read_inputs(self,permit,m,xml_raw):self.calls.append('native_root_exact_files');self.native_reads+=1;return self.inputs
 def run(self):return P.run(self,self.expected,self.local,self.now)
results=[]
def test(name,change=None,accepted=False,no_private=False,no_native=False):
 f=Fake()
 if change:change(f)
 f.rebind()
 try:out=f.run();ok=True;reason='BOUNDED_CANDIDATE_NOT_CAUSE'
 except P.Refused as e:out=None;ok=False;reason=str(e)
 assert ok is accepted,(name,ok,reason)
 if no_private:assert f.private_manifest_reads==f.native_reads==0,(name,f.calls)
 if no_native:assert f.native_reads==0,(name,f.calls)
 if out:
  encoded=j(out);assert f.sid.encode() not in encoded and f.temp.encode() not in encoded
  assert out['cause']=='UNPROVEN' and out['diagnosticCandidate']['association']=='CANONICAL_PREFIX_MATCH_ONLY_UNPROVEN_EXACT_SESSION'
 results.append({'name':name,'accepted':ok,'expected':accepted,'reason':reason,'privateManifestReads':f.private_manifest_reads,'nativeRootReadCalls':f.native_reads,'fakeOnly':True})
 return out
baseline=test('valid-wholly-synthetic-release-and-source-shaped-inputs',accepted=True)
def qualified_red(f):
 f.receipt.update(taskCollectionComplete=False,nativePass=False,coveragePass=False,cohortPass=False,outerPass=False,observationGap=True,qualification='QUALIFIED_INCOMPLETE')
qualified=test('terminal-red-qualified-outer-negative-flags-retained-no-C8-pass-required',qualified_red,accepted=True)
f=Fake();qualified_red(f);f.rebind();assert qualified['rawReceiptSha256']==sha(f.public['receipt']) and qualified['rawTaskCollectionComplete'] is False and qualified['observationGapSticky'] is True
test('fresh-output-collision-zero-private-reads',lambda f:setattr(f,'output_exists',True),no_private=True)
test('unknown-owned-Java-not-terminal',lambda f:f.terminal.update(sameStartOwnedJvmTerminal=False),no_private=True)
test('unknown-owned-UNKNOWN-not-terminal',lambda f:f.terminal.update(ownedUnknownTerminal=False),no_private=True)
test('live-collector-no-private-access',lambda f:f.terminal.update(collectorTerminal=False),no_private=True)
for flag in ['collectorTerminal','sameStartOwnedJvmTerminal','ownedUnknownTerminal','wholeExecutionClosed','sourceHoldVerified','quotesHelmHelpersHeld','observationGapSticky']:
 test('guard-'+flag+'-false',lambda f,k=flag:f.terminal.update({k:False}),no_private=True)
 test('guard-'+flag+'-missing',lambda f,k=flag:f.terminal.pop(k),no_private=True)
test('unreleased-zero-private-reads',lambda f:setattr(f,'released',False),no_private=True)
test('root-not-approved',lambda f:setattr(f,'root_approved',False),no_private=True)
test('quinn-not-approved',lambda f:setattr(f,'quinn_approved',False),no_private=True)
test('timeout-is-not-terminal',lambda f:f.terminal.update(terminalInferredFromTimeout=True),no_private=True)
test('sticky-gap-no-recovery-proof',lambda f:f.terminal.update(authoritativeClosureEvidenceSha256=[]),no_private=True)
for flag in ['wholePublicArchiveFrozen','wholePublicAssessmentComplete','rawFailPreserved','observationGapPreserved','noLaneApproval']:
 test('guard-assessment-'+flag+'-false',lambda f,k=flag:f.assessment.update({k:False}),no_private=True)
test('expired-authorization-no-private-read',lambda f:setattr(f,'expires','2026-10-19T12:00:00+00:00'),no_private=True)
test('future-authorization-no-private-read',lambda f:setattr(f,'issued','2026-10-19T12:01:00+00:00'),no_private=True)
test('release-before-owned-terminal-proof',lambda f:f.terminal.update(completedAtUtc='2026-10-19T12:01:00+00:00'),no_private=True)
test('original-protocol-binding-cannot-change',lambda f:f.terminal.update(originalProtocolSha256='9'*64),no_private=True)
test('raw-receipt-green-is-not-gate',lambda f:f.receipt.update(exit=0),no_private=True)
test('partial-default-only-is-not-whole',lambda f:f.receipt.update(explicitTestTasks=['test']),no_private=True)
test('source-capture-changed',lambda f:f.after.update(digest='9'*64),no_private=True)
test('wrong-inherited-root-refused-before-native-root-read',lambda f:f.manifest['root'].update(path='/synthetic/obs007-joined-inherited'),no_native=True)
test('wrong-source-snapshot-path',lambda f:next(r for r in f.manifest['files'] if r['role']=='snapshot_initial18').update(path='../inherited.json'),no_native=True)
test('unknown-input-role',lambda f:f.manifest['files'].append(dict(f.manifest['files'][0],role='provider_payload')),no_native=True)
test('snapshot-identity-mismatch',lambda f:f.snapshot.update(sessionId='00000000-0000-4000-8000-000000000019'))
test('snapshot-post-cleanup-is-not-cause',accepted=True)
test('snapshot-free-message-field-rejected',lambda f:f.snapshot.update(message='SECRET_MARKER_SHOULD_NEVER_EXPORT'))
test('snapshot-free-code-rejected',lambda f:f.snapshot.update(errorCode='SECRET_MARKER_SHOULD_NEVER_EXPORT'))
test('snapshot-unrecorded-timestamp-rejected',lambda f:f.snapshot.update(timestamp='2026-01-01T00:00:00Z'))
test('duplicate-start-record',lambda f:setattr(f,'log',b'GUIDED_START_FAILED '+j(f.event)+b'\nGUIDED_START_FAILED '+j(f.event)+b'\n'))
test('missing-start-record',lambda f:setattr(f,'log',b'opaque unrelated bytes\n'))
test('missing-runtime-phase',lambda f:f.event['links'][0].pop('phase'))
test('unknown-phase-not-START_SETTLE-inferred',lambda f:f.event['links'][0].update(phase='START_SETTLE'))
test('missing-launch-phase',lambda f:f.event['links'][1].pop('phase'))
test('first-start-name-unbound',lambda f:f.event['links'][0].update(name='SecretMarkerName'))
test('startup-identity-field-rejected',lambda f:f.event.update(sessionId=f.sid))
test('startup-message-rejected',lambda f:f.event['links'][0].update(message='SECRET_MARKER_SHOULD_NEVER_EXPORT'))
test('startup-path-rejected',lambda f:f.event['links'][1].update(path='/secret/private'))
test('startup-stack-rejected',lambda f:f.event['links'][1].update(stack='secret stack'))
test('startup-link-bound',lambda f:f.event['links'].extend([{'name':'Error'}]*6))
test('elapsed-not-integer',lambda f:f.event.update(elapsedMs=1.25))
test('elapsed-no-new12second-cutoff',lambda f:f.event.update(elapsedMs=120001),accepted=True)
test('unbound-generation',lambda f:f.manifest.update(generation=3))
test('wrong-producer-wrapper',lambda f:f.manifest.update(wrapperSha256='8'*64))
test('unconfirmed-guided-exit',lambda f:f.events[-1].update(alive=True))
test('duplicate-producer-spawn',lambda f:f.events.append(copy.deepcopy(f.events[0])))
test('unknown-owned-record-field',lambda f:f.events[0].update(secret='SECRET_MARKER'))
# Unknown syntactically producer-bounded scalars are redacted, never echoed or scalar-hashed.
marker='SECRET_MARKER_NESTED'
def unknown(f):f.event['links'][2].update(name='SecretMarkerName',code=marker,errno='ESECRETMARKER',exitCode=1,signal='SIGSECRET')
out=test('syntactic-secret-markers-redacted',unknown,accepted=True)
assert marker.encode() not in j(out) and sha(marker.encode()).encode() not in j(out) and b'SecretMarkerName' not in j(out) and b'ESECRETMARKER' not in j(out)
# Source/parser/package pins are not recaptured when the executing code/input changes.
for key in ['parserSha256','packageManifestSha256','sourceBindingsSha256']:
 f=Fake();f.local[key]='9'*64
 try:f.run();raise AssertionError('changed local binding accepted')
 except P.Refused as e:assert str(e)=='PARSER_OR_PACKAGE_CHANGED'
 assert f.private_manifest_reads==f.native_reads==0
 results.append({'name':'guard-local-'+key+'-changed','accepted':False,'expected':False,'reason':'PARSER_OR_PACKAGE_CHANGED','privateManifestReads':0,'nativeRootReadCalls':0,'fakeOnly':True})
# Pure schema/guard primitives; no OS or actual private file operations.
for raw in [b'{"x":1,"x":2}',b'{"x":NaN}',b'{"x":Infinity}']:
 try:P.decode(raw,1000);raise AssertionError('malformed synthetic JSON accepted')
 except P.Refused:pass
for mutate in [lambda o:o.update(privatePath='/secret'),lambda o:o['snapshot'].update(secret='marker'),lambda o:o['diagnosticCandidate'].update(sessionHash='a'*16),lambda o:o['inputBindings'][0].update(sessionId='marker')]:
 forged=copy.deepcopy(baseline);mutate(forged)
 try:P.validate_output(forged);raise AssertionError('unknown output field accepted')
 except P.Refused:pass
# No actual file-system reader is called anywhere in this contract file.
report={'scope':'PURE_IN_MEMORY_SYNTHETIC_CONTRACTS_NO_ACTUAL_PRIVATE_INPUTS','parserSha256':sha((OUT/'project_existing.py').read_bytes()),'results':results,
 'accepted':sum(r['accepted'] for r in results),'rejected':sum(not r['accepted'] for r in results),'extraJsonSchemaRejections':7,
 'guardFailuresHaveZeroPrivateManifestAndNativeRootReads':all(r['privateManifestReads']==r['nativeRootReadCalls']==0 for r in results if r['name'].startswith('guard-') or r['name'] in ['unreleased-zero-private-reads','root-not-approved','quinn-not-approved','timeout-is-not-terminal','sticky-gap-no-recovery-proof','raw-receipt-green-is-not-gate','partial-default-only-is-not-whole','source-capture-changed']),
 'syntheticPublicHashSubstitution':'Only module memory public XML/warning digests differ so synthetic bytes can exercise exact hash gates; real contract/source files never changed.',
 'secretMarkerAndScalarHashAbsentFromOutput':True,'actualPrivateEnumerationReadsGlobsExports':0,'actualExecutionRelease':False,'nativeCompilerProbe':False}
(OUT/'fake-contracts.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['scope','parserSha256','accepted','rejected','guardFailuresHaveZeroPrivateManifestAndNativeRootReads','actualPrivateEnumerationReadsGlobsExports','actualExecutionRelease']}))
