"""Independent-shaped source-derived synthetic controls; no private filesystem or CLI/main."""
from pathlib import Path
from types import SimpleNamespace
import ast,copy,datetime,hashlib,importlib.util,json,stat,xml.etree.ElementTree as ET
import capture_snapshot as H
O=Path(__file__).resolve().parent;B=O.parent/'order11-existing-evidence-projection/resume2';P=H.P;BASE=copy.deepcopy(P.C)
# Reuse only fixture/model class definitions; no prior author loops or entrypoints execute.
fixture=next(n for n in ast.parse((B/'contracts_fake.py').read_text()).body if isinstance(n,ast.ClassDef) and n.name=='Fake')
env=dict(P=P,BASE=BASE,OUT=B,copy=copy,json=json,datetime=datetime,ET=ET,sha=P.digest,j=P.canonical)
exec(compile(ast.Module(body=[fixture],type_ignores=[]),'<source-fixture-class-only>','exec'),env);Legacy=env['Fake']
models=[n for n in ast.parse((B/'contracts_fs.py').read_text()).body if isinstance(n,ast.ClassDef) and n.name in {'Node','FS'}]
import os as flags
modelenv=dict(SimpleNamespace=SimpleNamespace,PurePosixPath=H.PurePosixPath,stat=stat,flags=flags)
exec(compile(ast.Module(body=models,type_ignores=[]),'<source-fs-model-classes-only>','exec'),modelenv);FS=modelenv['FS']

def packet(optional=False,warning='absent'):
 f=Legacy();f.local={'parserSha256':P.digest((O/'capture_snapshot.py').read_bytes()),'packageManifestSha256':'1'*64,'sourceBindingsSha256':P.digest((O/'bindings.json').read_bytes())}
 xml=ET.fromstring(f.xml)
 for n in list(xml.findall('system-out')):xml.remove(n)
 if warning=='unrelated':ET.SubElement(xml,'system-out').text='unrelated warning for a different synthetic session; no startup record'
 f.xml=ET.tostring(xml);P.C['publicFacts']['xmlSha256']=P.digest(f.xml)
 f.control={'schemaVersion':1,'target':copy.deepcopy(H.TARGET),'provenanceBasis':H.CONDITIONAL,'expectedRoot':None,'expectedIds':None}
 f.optional=optional;f.journal=None;f.missing=set();f.calls=[];f.read_tags=[];f.outputs=[];f.claimed=False;f.control_reads=0;f.native_reads=0
 resign(f);return f

def resign(f):
 f.rebind();f.control_raw=P.canonical(f.control)
 auth=P.decode(f.public['authorization'],65536);scope=auth['scope'];scope.pop('privateManifestSha256');scope.update(H.PINS)
 scope.update(captureControlSha256=P.digest(f.control_raw),optionalCorrelation=f.optional,journalAuthority='ONE_FIXED_OWNED_JOURNAL_GUIDED_INTERVAL_ONLY' if f.optional else 'NONE')
 scope.update(getattr(f,'scopeEdit',{}))
 request=P.digest(P.canonical(scope));root={'schemaVersion':1,'role':'ROOT','approved':f.root_approved,'scopeSha256':request};quinn={'schemaVersion':1,'role':'QUINN','approved':f.quinn_approved,'scopeSha256':request}
 f.public.update(root_approval=P.canonical(root),quinn_approval=P.canonical(quinn));auth.update(scope=scope,rootApprovalSha256=P.digest(f.public['root_approval']),quinnApprovalSha256=P.digest(f.public['quinn_approval']));f.public['authorization']=P.canonical(auth)
 f.expected={k:P.digest(f.public[k]) for k in ['authorization','root_approval','quinn_approval']}

class PureIO:
 def __init__(self,f):self.f=f
 def read_public(self,a):self.f.calls.append('public:'+a);return self.f.public[a]
 def claim_output(self,permit):
  P.require(not self.f.claimed,'SYNTHETIC_OUTPUT_REUSED');self.f.claimed=True;self.f.calls.append('claim')
 def read_control(self,permit):self.f.control_reads+=1;self.f.calls.append('control');return self.f.control_raw
 def read_xml(self,permit):return self.f.xml,dict(next(r for r in self.f.manifest['files'] if r['role']=='default_xml'))
 def _dirs(self,path):P.require(path==self.f.temp,'SYNTHETIC_EXACT_ROOT');return [{'fd':9}]
 def _extend(self,chain,parts):return chain
 def _check_chain(self,chain):pass
 def _close_chain(self,chain):pass
 def read_child(self,chain,path,cap,role,required_mode=None):
  self.f.native_reads+=1;self.f.read_tags.append(role)
  if role in self.f.missing:raise FileNotFoundError()
  raw=self.f.inputs[role]
  if role=='owned_events' and self.f.journal is not None:raw=self.f.journal
  P.require(len(raw)<=cap,'SYNTHETIC_ROLE_CAP')
  row=dict(next(r for r in self.f.manifest['files'] if r['role']==role));row.update(path=path,sha256=P.digest(raw),bytes=len(raw));return raw,row
 def write_doc(self,out,name):H.validate_document(out);self.f.outputs.append((name,copy.deepcopy(out)))
class PureOS:
 def getuid(self):return 123
 def fstat(self,fd):return SimpleNamespace(st_dev=1,st_ino=2,st_uid=123,st_mode=stat.S_IFDIR|448)
results=[]
def check(name,edit=None,accept=False,optional=False,warning='absent',zero_private=False,correlation=None,expected_code=0):
 f=packet(optional,warning)
 if edit:edit(f)
 resign(f);old=P.os;P.os=PureOS();ok=False;reason='NOT_RUN';out=None
 try:out,code=H.run(PureIO(f),f.expected,f.local,f.now);ok=True;reason=out['status'];assert code==expected_code
 except P.Refused as e:reason=str(e)
 finally:P.os=old
 assert ok is accept,(name,ok,reason)
 if zero_private:assert f.control_reads==f.native_reads==0,(name,f.calls)
 if out:
  public=P.canonical(out);assert f.sid.encode() not in public and f.temp.encode() not in public and P.digest(P.canonical(f.sid)).encode() not in public
  assert out['snapshot']['identityProvenance']==H.CONDITIONAL and out['snapshot']['externalUuidJoinProved'] is False and out['snapshot']['OTHERMeansNoError'] is False and out['cause']=='UNPROVEN'
  if correlation:assert out['optionalCorrelation']['status']==correlation,(name,out['optionalCorrelation'])
 results.append({'name':name,'accepted':ok,'expected':accept,'reason':reason,'syntheticProtectedControlReads':f.control_reads,'syntheticNativeRoleReads':f.read_tags,'actualPrivateIO':0})
 return out
check('snapshot-facts-with-no-warning-or-startup',accept=True)
check('snapshot-facts-with-unrelated-warning-and-no-startup',accept=True,warning='unrelated')
check('source-OTHER-is-not-no-error',accept=True)
check('missing-numeric-values-stay-omitted-not-zero',lambda f:f.snapshot['counters'].clear(),accept=True)
check('wellformed-opaque-IDs-not-independent-external-join',lambda f:f.snapshot.update(sessionId='00000000-0000-4000-8000-000000000099'),accept=True)
check('partial-missing-errorCode-refuses',lambda f:f.snapshot.pop('errorCode'))
check('partial-source-translation-group-refuses',lambda f:f.snapshot.update(continuation='STOPPED'))
check('captureFailure-refuses',lambda f:f.snapshot.update(captureFailure=True))
check('wrong-method-refuses',lambda f:f.snapshot.update(testMethod='anotherMethod'))
check('wrong-ordinal-control-refuses',lambda f:f.control['target'].update(sessionOrdinal=19))
check('wrong-invocation-control-refuses',lambda f:f.control['target'].update(invocationOrdinal=13))
check('malformed-session-identity-refuses',lambda f:f.snapshot.update(sessionId='not-a-uuid'))
check('malformed-test-identity-refuses',lambda f:f.snapshot.update(testId='not-a-uuid'))
def known_mismatch(f):f.control['expectedIds']={'sessionId':'00000000-0000-4000-8000-000000000099','testId':f.snapshot['testId']}
check('optional-separately-known-identity-mismatch-refuses',known_mismatch)
check('snapshot-unknown-private-field-refuses',lambda f:f.snapshot.update(message='PRIVATE_MARKER'))
check('snapshot-unknown-code-refuses',lambda f:f.snapshot.update(errorCode='PRIVATE_MARKER'))
check('snapshot-array-bound-refuses',lambda f:f.snapshot['actions'].extend([{}]*4097))
check('snapshot-source-file-byte-bound',lambda f:f.snapshot.update(message='X'*1048576))
for flag in ['collectorTerminal','sameStartOwnedJvmTerminal','ownedUnknownTerminal','wholeExecutionClosed']:
 check('live-or-unknown-'+flag,lambda f,k=flag:f.terminal.update({k:False}),zero_private=True)
check('unreleased-refuses-before-control',lambda f:setattr(f,'released',False),zero_private=True)
check('root-not-approved',lambda f:setattr(f,'root_approved',False),zero_private=True)
check('quinn-not-approved',lambda f:setattr(f,'quinn_approved',False),zero_private=True)
check('timeout-is-not-terminal',lambda f:f.terminal.update(terminalInferredFromTimeout=True),zero_private=True)
check('closed-public-assessment-required',lambda f:f.assessment.update(wholePublicAssessmentComplete=False),zero_private=True)
check('freshness-expired',lambda f:setattr(f,'expires','2026-10-19T12:00:00+00:00'),zero_private=True)
check('terminal-red-qualified-outer-no-C8-pass',lambda f:f.receipt.update(taskCollectionComplete=False,nativePass=False,coveragePass=False,cohortPass=False,outerPass=False),accept=True)
check('unique-generation-manifest-with-no-startup-record',lambda f:setattr(f,'log',b'opaque worker log without startup record\n'),optional=True,accept=True,correlation='COMPLETE_PROTECTED_MANIFEST_PENDING_SEPARATE_REVIEW')
check('missing-journal-preserves-independent-snapshot',lambda f:f.missing.add('owned_events'),optional=True,accept=True,correlation='UNPROVEN')
check('missing-selected-log-preserves-independent-snapshot',lambda f:f.missing.add('guided_log'),optional=True,accept=True,correlation='UNPROVEN')
check('ambiguous-generation-preserves-independent-snapshot',lambda f:f.events.append(copy.deepcopy(f.events[0])),optional=True,accept=True,correlation='UNPROVEN')
check('empty-journal-preserves-independent-snapshot',lambda f:setattr(f,'journal',b''),optional=True,accept=True,correlation='UNPROVEN')
check('unconfirmed-generation-preserves-independent-snapshot',lambda f:f.events[-1].update(alive=True),optional=True,accept=True,correlation='UNPROVEN')
def later(f):
 for row in list(f.events):
  newer=copy.deepcopy(row);newer.update(generation=3,started='2026-10-19T06:00:00Z',pid=124);f.events.append(newer)
check('unique-earlier-generation-exact-archive-path',later,optional=True,accept=True,correlation='COMPLETE_PROTECTED_MANIFEST_PENDING_SEPARATE_REVIEW')
check('old-purpose-does-not-authorize-new-capture',lambda f:setattr(f,'scopeEdit',{'purpose':'ORDER11_EXISTING_PRIVATE_PROJECTION'}),zero_private=True)
check('old-no-journal-authority-does-not-authorize-new-structured-read',lambda f:setattr(f,'scopeEdit',{'journalAuthority':'NONE'}),optional=True,zero_private=True)
check('wrong-closed-public-pin-refuses-before-control',lambda f:setattr(f,'scopeEdit',{'closedPublicAssessmentSha256':'0'*64}),zero_private=True)
def partial_manifest(f):
 for row in f.events:row['wrapperSha256']='not-a-whole-artifact-hash'
check('partial-manifest-validation-preserves-snapshot',partial_manifest,optional=True,accept=True,correlation='UNPROVEN')
# FD-bound complete new-helper pipeline uses only modeled OS nodes, no actual paths.
fsresults=[]
def fscheck(name,edit=None,accept=False,optional=False,guard=False,alias=False):
 f=packet(optional)
 if alias:
  f.temp='/var/folders/owned/obs007-joined-closedfake'
  for row in f.events:row['ownedTemp']=f.temp
  xml=ET.fromstring(f.xml);xml.find('testcase/failure').set('message','[second explicit learning; logs '+f.temp+'] ');f.xml=ET.tostring(xml);P.C['publicFacts']['xmlSha256']=P.digest(f.xml);resign(f)
 fs=FS()
 if alias:fs.add('/private/var',mode=493,uid=0);fs.add('/var','link',target='private/var',mode=511,uid=0)
 rootpath='/private'+f.temp if alias else f.temp;root=fs.add(rootpath,mode=448);root.ino=2
 fs.add(H.HERE/'release',mode=448)
 for a,n in P.ExactIO.PUBLIC_FILES.items():fs.add(H.HERE/'release'/n,'file',mode=384,data=f.public[a])
 fs.add(H.HERE/'release/capture-control.json','file',mode=384,data=f.control_raw).tag='control'
 for a,suffix in [('receipt','results'),('before','before'),('after','after')]:fs.add(H.ROOT/'docs/qa/evidence/STUDIO-OBS-011/execution'/f"{P.C['executionLabel']}-{suffix}.json",'file',mode=384,data=f.public[a])
 fs.add(H.ROOT/H.XML_PATH,'file',mode=384,data=f.xml)
 for role,path in [('snapshot_initial18',H.SNAPSHOT),('owned_events','owned-worker-generations.jsonl'),('guided_log','guided.log')]:fs.add(rootpath+'/'+path,'file',mode=384,data=f.inputs[role]).tag=role
 private_reads=[]
 def observer(fs,op,n,node):
  if op=='read' and hasattr(node,'tag'):private_reads.append(node.tag)
 fs.hook=observer
 if edit:edit(f,fs,observer)
 old=P.os;P.os=fs;reader=H.CaptureIO();ok=False;reason='NOT_RUN'
 try:out,code=H.run(reader,f.expected,f.local,f.now);reader.close();ok=True;reason=out['optionalCorrelation']['status'];assert code==0
 except (P.Refused,OSError) as e:
  reason=str(e) if isinstance(e,P.Refused) else 'SAFE_OS_REFUSAL'
  try:reader.close()
  except (P.Refused,OSError):pass
 finally:P.os=old
 assert ok is accept,(name,ok,reason)
 if guard:assert not private_reads,(name,private_reads)
 assert fs.alternate_writes==0
 fsresults.append({'name':name,'accepted':ok,'expected':accept,'reason':reason,'syntheticProtectedReadTags':private_reads,'syntheticWriteCalls':fs.writes,'actualOsIO':0})
fscheck('actual-new-helper-retained-FD-snapshot-positive',accept=True)
fscheck('actual-new-helper-retained-FD-full-manifest-positive',accept=True,optional=True)
fscheck('actual-new-helper-approved-macos-alias-positive',accept=True,alias=True)
def root_link(f,fs,observer):fs.add(f.temp,'link',target='/synthetic/other')
fscheck('root-substitution-refuses',root_link)
def leaf_swap(f,fs,observer):
 def hook(fs,op,n,node):
  observer(fs,op,n,node)
  if op=='before-open' and n==H.SNAPSHOT:node.uid=999
 fs.hook=hook
fscheck('snapshot-opened-owner-swap-before-content',leaf_swap)
def output_swap(f,fs,observer):
 def hook(fs,op,n,node):
  observer(fs,op,n,node)
  if op=='after-write' and n=='snapshot-facts.json':fs.add(H.HERE/'released-projection-01',mode=448)
 fs.hook=hook
fscheck('retained-output-parent-swap-no-alternate-write',output_swap)
def live_guard(f,fs,observer):
 f.terminal.update(collectorTerminal=False);resign(f)
 for a,n in P.ExactIO.PUBLIC_FILES.items():fs.locate(H.HERE/'release'/n).data=f.public[a]
fscheck('live-guard-before-protected-control-or-native-read',live_guard,guard=True)
def write_fail(f,fs,observer):
 def hook(fs,op,n,node):
  observer(fs,op,n,node)
  if op=='before-write' and n=='snapshot-facts.json':raise OSError('synthetic secret marker never exported')
 fs.hook=hook
fscheck('adapted-fixed-writer-failure-no-success',write_fail)
report={'scope':'SOURCE_AND_APPROVED_PUBLIC_PLUS_IN_MEMORY_SYNTHETIC_ONLY','helperSha256':P.digest((O/'capture_snapshot.py').read_bytes()),'semanticChecks':len(results),'semanticAccepted':sum(r['accepted'] for r in results),'semanticRejected':sum(not r['accepted'] for r in results),'semanticResults':results,'fdChecks':len(fsresults),'fdAccepted':sum(r['accepted'] for r in fsresults),'fdRejected':sum(not r['accepted'] for r in fsresults),'fdResults':fsresults,'oldAuthorLoopsExecuted':False,'actualPrivateEnumerationStatReadGlobCopyExport':0,'actualHelperMainCli':0,'actualOsIo':0,'conditionalSourceFileProvenanceNotExternalUuidJoin':True,'noWarningOrStartupRequiredForSnapshotFacts':True}
(O/'contracts.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in {'semanticResults','fdResults'}}))
