"""Independent pure-definition optional IO qualification controls. No helper imports/main/private IO."""
from pathlib import Path,PurePosixPath
from types import ModuleType,SimpleNamespace
import ast,copy,datetime,hashlib,json,os,re,stat,sys
import xml.etree.ElementTree as ET
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';PKG=T/'early/order11-snapshot-manifest-capture/resume2';CORE=T/'early/order11-existing-evidence-projection/resume2';OUT=T/'qa/order11-manifest-io-fix-review'
sha=lambda b:hashlib.sha256(b).hexdigest()
contract=json.loads((CORE/'source-contract.json').read_text());core_tree=ast.parse((CORE/'project_existing.py').read_text())
classes={'Refused','ClosedArgumentParser','ExactIO'};functions={'require','digest','stable_stat','canonical','keys','integer','pairs','decode','uuid_text','scope_contract','preauthorize','authorize','numbers','snapshot','instant_ns','owned_producer','validate_manifest'};constants={'SOURCE_PATHS','FQCN','ROLES','SAFE','SHA','OPERATIONS'}
P=ModuleType('independent_pure_core');P.__dict__.update(HERE=PKG,ROOT=R,C=copy.deepcopy(contract))
nodes=[n for n in core_tree.body if isinstance(n,(ast.Import,ast.ImportFrom)) or isinstance(n,ast.ClassDef) and n.name in classes or isinstance(n,ast.FunctionDef) and n.name in functions or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in constants for t in n.targets)]
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-core-definitions-no-module-inputs>','exec'),P.__dict__)
P.C['purpose']='ORDER11_SNAPSHOT_FACTS_MANIFEST_CAPTURE';H=ModuleType('independent_corrected_capture');H.__dict__.update(P=P,HERE=PKG,ROOT=R,Path=Path,PurePosixPath=PurePosixPath,argparse=P.argparse,datetime=datetime,hashlib=hashlib,json=json,os=os,re=re,stat=stat,sys=sys,ET=ET)
source=(PKG/'capture_snapshot.py').read_text();tree=ast.parse(source);allowed={'PURPOSE','CONDITIONAL','XML_PATH','SNAPSHOT','TARGET','PINS','BINDING_PATHS','base_scope','OPTIONAL_IO_FAILURES'};nodes=[]
for n in tree.body:
 if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name not in {'main','local_bindings'}:nodes.append(n)
 elif isinstance(n,ast.Assign):
  if any(isinstance(t,ast.Name) and t.id in allowed for t in n.targets):nodes.append(n)
  elif any(isinstance(t,ast.Attribute) and isinstance(t.value,ast.Name) and t.value.id=='P' and t.attr in {'scope_contract','validate_document'} for t in n.targets):nodes.append(n)
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-corrected-helper-definitions-only>','exec'),H.__dict__)
# Reuse only independent prior-review input builder/IO definitions, never that review's loop/writers.
prior_tree=ast.parse((T/'qa/order11-snapshot-manifest-review/audit.py').read_text());wanted={'ForbiddenPrivateOS','IO','packet','sign'}
def read(path):
 assert path.parent==PKG and path.name in {'capture_snapshot.py','manifest.json','bindings.json'}
 return path.read_bytes() # Approved source input only, never an OS operation from the tested core.
env=dict(P=P,H=H,PKG=PKG,ROOT=R,BASE=copy.deepcopy(P.C),sha=sha,read=read,copy=copy,ET=ET,SimpleNamespace=SimpleNamespace,stat=stat)
selected=[n for n in prior_tree.body if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name in wanted]
exec(compile(ast.Module(body=selected,type_ignores=[]),'<prior-independent-input-definitions-only>','exec'),env);IO=env['IO'];packet=env['packet'];sign=env['sign'];P.os=env['ForbiddenPrivateOS']();results=[]
class ChecksIO(IO):
 def __init__(self,f):super().__init__(f);self.attempts=[]
 def read_child(self,chain,path,cap,role,required_mode=None):self.attempts.append(role);return super().read_child(chain,path,cap,role,required_mode)

def vector(name,optional=True,edit=None,code=0,reason=None,refuses=False,only_facts=False,zero_private=False):
 f=packet(optional)
 if edit:edit(f)
 sign(f);io=ChecksIO(f);out=None;actual_code=None;refused=False
 try:out,actual_code=H.run(io,f['expected'],f['local'],datetime.datetime.fromisoformat('2026-10-19T12:00:01+00:00'))
 except P.Refused as error:refused=True;refusal_label=str(error)
 assert refused is refuses,(name,refused)
 if not refuses:
  assert actual_code==code,(name,actual_code)
  assert out['snapshot']['state']==f['snapshot']['state'] and out['snapshot']['errorCode']==f['snapshot']['errorCode'] and out['snapshot']['bootstrapPhase']==f['snapshot']['bootstrapPhase']
  assert out['snapshot']['OTHERMeansNoError'] is False and out['snapshot']['externalUuidJoinProved'] is False and out['cause']==out['firstWriter']==out['chronology']=='UNPROVEN'
  if reason is not None:assert out['optionalCorrelation']['status']=='UNPROVEN' and out['optionalCorrelation']['reason']==reason and out['optionalCorrelation']['manifestSha256'] is None
  if only_facts:assert [n for n,v in f['outputs']]==['snapshot-facts.json']
  encoded=P.canonical(out);assert f['temp'].encode() not in encoded and f['snapshot']['sessionId'].encode() not in encoded and b'SYNTHETIC_PRIVATE_MARKER' not in encoded
 if not optional:assert io.attempts==(['snapshot_initial18'] if not refuses else io.attempts) and 'owned_events' not in io.attempts and 'guided_log' not in io.attempts
 if zero_private:assert io.attempts==[] and 'control' not in f['calls']
 results.append(dict(name=name,optional=optional,exit=actual_code,refused=refused,reason=refusal_label if refuses else out['optionalCorrelation']['reason'],roleAttempts=io.attempts,outputs=[n for n,v in f['outputs']],snapshotFactsPreserved=not refuses,actualPrivateIO=0))
 return f,out
original_five={'INPUT_READ_CHANGED','INPUT_LEAF_SUBSTITUTED','INPUT_OPENED_IDENTITY_MISMATCH','INPUT_APPROVED_FD_BINDING','DIRECTORY_ENTRY_SUBSTITUTED'}
for role in ['owned_events','guided_log']:
 for label in sorted(H.OPTIONAL_IO_FAILURES):
  vector('IO '+role+' '+label,edit=lambda f,r=role,c=label:f['faults'].update({r:P.Refused(c)}),code=2,reason='OPTIONAL_INSTRUMENTATION_FAILED',only_facts=True)
 for exc in [OSError,PermissionError,RuntimeError]:
  vector(exc.__name__+' '+role,edit=lambda f,r=role,e=exc:f['faults'].update({r:e('SYNTHETIC_PRIVATE_MARKER')}),code=2,reason='OPTIONAL_INSTRUMENTATION_FAILED',only_facts=True)
 vector('ordinary missing '+role,edit=lambda f,r=role:f['faults'].update({r:FileNotFoundError('SYNTHETIC_PRIVATE_MARKER')}),reason='MISSING_OPTIONAL_SOURCE_ARTIFACT',only_facts=True)
 for label in ['JOURNAL_GENERATION_AMBIGUOUS','GUIDED_PRODUCER_NOT_UNIQUE_OR_CLOSED','JOURNAL_INTERVAL_UNPROVEN','UNKNOWN_OR_MISSING_FIELDS']:
  vector('ordinary semantic '+role+' '+label,edit=lambda f,r=role,c=label:f['faults'].update({r:P.Refused(c)}),reason='OPTIONAL_PROVENANCE_OR_SHAPE_UNPROVEN',only_facts=True)
for error_code in ['OTHER','RUNTIME_INCOMPATIBLE','BUDGET_EXCEEDED','LOGIN_REQUIRED','SECRET_UNAVAILABLE']:
 for role in ['owned_events','guided_log']:
  def edit(f,e=error_code,r=role):f['snapshot'].update(errorCode=e,bootstrapPhase='CONTEXT_PENDING');f['faults'][r]=P.Refused('INPUT_READ_CHANGED')
  vector('preserved source error '+error_code+' '+role,edit=edit,code=2,reason='OPTIONAL_INSTRUMENTATION_FAILED',only_facts=True)
f,out=vector('complete optional manifest');assert [n for n,v in f['outputs']]==['correlation-input-manifest.json','snapshot-facts.json'] and out['optionalCorrelation']['status']=='COMPLETE_PROTECTED_MANIFEST_PENDING_SEPARATE_REVIEW'
f,out=vector('false NONE snapshot only',optional=False,edit=lambda f:f['faults'].update(owned_events=P.Refused('INPUT_READ_CHANGED')),only_facts=True);assert out['optionalCorrelation']['status']=='NOT_REQUESTED'
for attr in ['released','rootApproved','quinnApproved']:
 vector('false approval '+attr,edit=lambda f,k=attr:f.update({k:False}),refuses=True,zero_private=True)
for flag in ['collectorTerminal','sameStartOwnedJvmTerminal','ownedUnknownTerminal','wholeExecutionClosed']:
 vector('live unknown '+flag,edit=lambda f,k=flag:f.update(terminalEdit={k:False}),refuses=True,zero_private=True)
vector('old NONE cannot authorize optional',edit=lambda f:f.update(scopeEdit={'journalAuthority':'NONE'}),refuses=True,zero_private=True)
for field in ['state','errorCode','bootstrapPhase']:
 vector('required snapshot field '+field+' missing',edit=lambda f,k=field:f['snapshot'].pop(k),refuses=True)
# Unchanged enclosing integrity/output failures still refuse whole operation rather than force a report.
class BrokenOuterIO(ChecksIO):
 def _check_chain(self,chain):raise P.Refused('DIRECTORY_ENTRY_SUBSTITUTED')
class BrokenWriterIO(ChecksIO):
 def write_doc(self,out,filename):raise P.Refused('OUTPUT_CLOSE_FAILURE')
for cls in [BrokenOuterIO,BrokenWriterIO]:
 f=packet(True);sign(f);io=cls(f)
 try:H.run(io,f['expected'],f['local'],datetime.datetime.fromisoformat('2026-10-19T12:00:01+00:00'));raise AssertionError('unsafe success')
 except P.Refused:pass
 assert f['outputs']==[]
 results.append(dict(name=cls.__name__,exit=None,refused=True,reason='UNCHANGED_ENCLOSING_GUARD_REFUSAL_MAIN_NONZERO',roleAttempts=io.attempts,outputs=[],snapshotFactsPreserved=False,actualPrivateIO=0))
# Independently derive exactly the active optional IO label set from reachable method definitions.
core_class=next(n for n in core_tree.body if isinstance(n,ast.ClassDef) and n.name=='ExactIO');core_methods={n.name:n for n in core_class.body if isinstance(n,ast.FunctionDef)}
capture_class=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='CaptureIO');capture_methods={n.name:n for n in capture_class.body if isinstance(n,ast.FunctionDef)}
active={'read_child':capture_methods['read_child']};pending=['read_child']
while pending:
 current=pending.pop()
 for call in ast.walk(active[current]):
  if isinstance(call,ast.Call) and isinstance(call.func,ast.Attribute) and isinstance(call.func.value,ast.Name) and call.func.value.id=='self' and call.func.attr in core_methods and call.func.attr not in active:
   active[call.func.attr]=core_methods[call.func.attr];pending.append(call.func.attr)
labels={};
for name,node in active.items():
 for call in ast.walk(node):
  label=None
  if isinstance(call,ast.Call) and isinstance(call.func,ast.Name) and call.func.id in {'require','Refused'}:
   ix=1 if call.func.id=='require' else 0
   if len(call.args)>ix and isinstance(call.args[ix],ast.Constant):label=call.args[ix].value
  elif isinstance(call,ast.Call) and isinstance(call.func,ast.Attribute) and call.func.attr=='require' and len(call.args)>1 and isinstance(call.args[1],ast.Constant):label=call.args[1].value
  if isinstance(label,str):labels.setdefault(label,[]).append(dict(method=name,line=call.lineno))
assert len(labels)==16 and set(labels)==set(H.OPTIONAL_IO_FAILURES)
assert len([x for x in results if x['name'].startswith('IO ') and x['name'].split()[-1] in original_five and x['exit']==2])==10
for row in results:
 if row['name'].startswith('IO '):
  role=row['name'].split()[1];assert row['roleAttempts']==(['snapshot_initial18','owned_events'] if role=='owned_events' else ['snapshot_initial18','owned_events','guided_log'])
report=dict(scope='INDEPENDENT_PURE_DEFINITIONS_FAKE_IO_ONLY',helperSha256=sha(source.encode()),vectors=len(results),completedExit2=sum(x['exit']==2 for x in results),completedExit0=sum(x['exit']==0 for x in results),wholeOperationRefusals=sum(x['refused'] for x in results),originalTenCounterexamplesNowIncomplete=True,activeIoLabels=sorted(labels),activeIoLabelSourceMap=labels,reachableIoMethods=sorted(active),results=results,actualPrivateEnumerationStatOpenReadGlobCopyExport=0,helperMainLocalBindingsLoaderExecuted=False,authorControlLoopsExecuted=False,actualOptionalScopeApproved=False)
(OUT/'contracts.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ['results','activeIoLabelSourceMap']}))
