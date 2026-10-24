"""Pure source-bound optional IO qualification controls. No helper main/CLI/real IO/old loops."""
from pathlib import Path
from types import SimpleNamespace
import ast,copy,datetime,json,stat,xml.etree.ElementTree as ET
import capture_snapshot as H
O=Path(__file__).resolve().parent;B=O.parents[1]/'order11-existing-evidence-projection/resume2';P=H.P;BASE=copy.deepcopy(P.C)
fixture=next(n for n in ast.parse((B/'contracts_fake.py').read_text()).body if isinstance(n,ast.ClassDef) and n.name=='Fake')
env=dict(P=P,BASE=BASE,OUT=B,copy=copy,json=json,datetime=datetime,ET=ET,sha=P.digest,j=P.canonical)
exec(compile(ast.Module(body=[fixture],type_ignores=[]),'<fixture-class-only>','exec'),env);Legacy=env['Fake']
control_tree=ast.parse((O/'contracts.py').read_text());nodes=[n for n in control_tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in {'packet','resign','PureIO','PureOS'}]
env.update(H=H,O=O,B=B,Legacy=Legacy,SimpleNamespace=SimpleNamespace,stat=stat)
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<source-pure-control-definitions-only>','exec'),env)
packet=env['packet'];resign=env['resign'];PureIO=env['PureIO'];PureOS=env['PureOS'];results=[]
class InjectedIO(PureIO):
 def __init__(self,f,role,kind,label=None):super().__init__(f);self.role=role;self.kind=kind;self.label=label;self.attempts=[]
 def read_child(self,chain,path,cap,role,required_mode=None):
  self.attempts.append(role)
  if role==self.role:
   if self.kind=='Refused':raise P.Refused(self.label)
   if self.kind=='Missing':raise FileNotFoundError('synthetic marker never exported')
   if self.kind=='OSError':raise OSError('synthetic marker never exported')
   if self.kind=='Permission':raise PermissionError('synthetic marker never exported')
   if self.kind=='Unexpected':raise RuntimeError('synthetic marker never exported')
  return super().read_child(chain,path,cap,role,required_mode)

def check(role,kind,label=None,incomplete=True):
 f=packet(optional=True);resign(f);io=InjectedIO(f,role,kind,label);old=P.os;P.os=PureOS()
 try:out,code=H.run(io,f.expected,f.local,f.now)
 finally:P.os=old
 assert code==(2 if incomplete else 0),(role,kind,label,code)
 assert out['snapshot']==H.snapshot_facts(f.inputs['snapshot_initial18'],f.control)
 assert out['snapshot']['errorCode']==f.snapshot['errorCode'] and out['snapshot']['bootstrapPhase']==f.snapshot['bootstrapPhase']
 assert out['optionalCorrelation']['status']=='UNPROVEN' and out['optionalCorrelation']['manifestSha256'] is None
 expected='OPTIONAL_INSTRUMENTATION_FAILED' if incomplete else 'MISSING_OPTIONAL_SOURCE_ARTIFACT' if kind=='Missing' else 'OPTIONAL_PROVENANCE_OR_SHAPE_UNPROVEN'
 assert out['optionalCorrelation']['reason']==expected
 assert [name for name,_ in f.outputs]==['snapshot-facts.json']
 assert io.attempts==(['snapshot_initial18','owned_events'] if role=='owned_events' else ['snapshot_initial18','owned_events','guided_log'])
 assert b'synthetic marker' not in P.canonical(out) and f.sid.encode() not in P.canonical(out) and f.temp.encode() not in P.canonical(out)
 results.append({'role':role,'kind':kind,'sourceLabel':label,'exit':code,'reason':expected,'snapshotFactsAndErrorCodePreserved':True,'onlySnapshotReportWritten':True,'attemptedRoleSequence':io.attempts,'actualPrivateIO':0})
for label in sorted(H.OPTIONAL_IO_FAILURES):
 for role in ['owned_events','guided_log']:check(role,'Refused',label)
for role in ['owned_events','guided_log']:
 for kind in ['OSError','Permission','Unexpected']:check(role,kind)
 check(role,'Missing',incomplete=False)
 for label in ['JOURNAL_GENERATION_AMBIGUOUS','GUIDED_PRODUCER_NOT_UNIQUE_OR_CLOSED','UNKNOWN_OR_MISSING_FIELDS']:check(role,'Refused',label,incomplete=False)
# A valid complete optional source witness still prepares one protected manifest and facts.
f=packet(optional=True);resign(f);old=P.os;P.os=PureOS()
try:out,code=H.run(PureIO(f),f.expected,f.local,f.now)
finally:P.os=old
assert code==0 and out['optionalCorrelation']['status']=='COMPLETE_PROTECTED_MANIFEST_PENDING_SEPARATE_REVIEW' and [n for n,_ in f.outputs]==['correlation-input-manifest.json','snapshot-facts.json']
# No optional read/catch is reachable from false/NONE; all labels are irrelevant there.
f=packet(optional=False);resign(f);io=InjectedIO(f,'owned_events','Refused','INPUT_READ_CHANGED');old=P.os;P.os=PureOS()
try:out,code=H.run(io,f.expected,f.local,f.now)
finally:P.os=old
assert code==0 and out['optionalCorrelation']['status']=='NOT_REQUESTED' and io.attempts==['snapshot_initial18']
# The classification set is finite and every member is an active fixed source label in the exact read path.
core_source=(B/'project_existing.py').read_text();core_ast=ast.parse(core_source);cls=next(n for n in core_ast.body if isinstance(n,ast.ClassDef) and n.name=='ExactIO')
core_names={'_close_chain','_check_chain','_extend','_read_at'};owners={}
def collect(node,path):
 for call in ast.walk(node):
  if isinstance(call,ast.Call) and isinstance(call.func,ast.Name) and call.func.id in {'require','Refused'}:
   i=1 if call.func.id=='require' else 0
   if len(call.args)>i and isinstance(call.args[i],ast.Constant) and isinstance(call.args[i].value,str):owners.setdefault(call.args[i].value,[]).append({'source':path,'function':node.name,'line':call.lineno})
  elif isinstance(call,ast.Call) and isinstance(call.func,ast.Attribute) and call.func.attr=='require' and len(call.args)>1 and isinstance(call.args[1],ast.Constant):owners.setdefault(call.args[1].value,[]).append({'source':path,'function':node.name,'line':call.lineno})
for node in cls.body:
 if isinstance(node,ast.FunctionDef) and node.name in core_names:collect(node,str(B/'project_existing.py'))
helper_ast=ast.parse((O/'capture_snapshot.py').read_text());capture=next(n for n in helper_ast.body if isinstance(n,ast.ClassDef) and n.name=='CaptureIO');collect(next(n for n in capture.body if isinstance(n,ast.FunctionDef) and n.name=='read_child'),str(O/'capture_snapshot.py'))
assert set(H.OPTIONAL_IO_FAILURES)==set(owners),(sorted(set(H.OPTIONAL_IO_FAILURES)-set(owners)),sorted(set(owners)-set(H.OPTIONAL_IO_FAILURES)))
mandatory={'INPUT_READ_CHANGED','INPUT_LEAF_SUBSTITUTED','INPUT_OPENED_IDENTITY_MISMATCH','INPUT_APPROVED_FD_BINDING','DIRECTORY_ENTRY_SUBSTITUTED'}
assert sum(r['sourceLabel'] in mandatory for r in results)==10
report={'scope':'PURE_SOURCE_BOUND_OPTIONAL_IO_CLASSIFICATION_ONLY','helperSha256':P.digest((O/'capture_snapshot.py').read_bytes()),'classificationLabelCount':len(H.OPTIONAL_IO_FAILURES),'classifiedSourceLabels':sorted(H.OPTIONAL_IO_FAILURES),'labelSourceMap':{k:owners[k] for k in sorted(H.OPTIONAL_IO_FAILURES)},'injectedControls':len(results),'incompleteExit2':sum(r['exit']==2 for r in results),'ordinaryUnprovenExit0':sum(r['exit']==0 for r in results),'mandatoryTenReproductionsCorrected':True,'additionalPositiveCompleteAndFalseNoneControls':2,'results':results,'actualPrivateIO':0,'helperMainCli':0,'actualOsIO':0,'authorWitnessLoopsExecuted':False}
(O/'optional-io-contracts.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in {'results','labelSourceMap','classifiedSourceLabels'}}))
