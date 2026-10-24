"""One bounded independent protocol batch. Exact fake prefix/audit, unchanged target code."""
from pathlib import Path
import ast,hashlib,json
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gst-style-isolated-validation-prep/resume1').absolute()
raw=(S/'fake_flow.py').read_bytes()
assert hashlib.sha256(raw).hexdigest()=='ab297ba19297db5ea4c1d4ab5a3f075d0de54f8d6d6394ce87c0f24f17ee4169'
t=ast.parse(raw); cut=next(n.lineno for n in t.body if isinstance(n,ast.Assign) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='new')
lines=raw.decode().splitlines(keepends=True);prefix=''.join(lines[:cut-1]);assert (prefix+''.join(lines[cut-1:])).encode()==raw
ns={'__file__':str(S/'fake_flow.py'),'__name__':'_quinn_exact_gst_model'}
exec(compile(prefix,'<inspected exact fake prefix permanent audit>','exec'),ns)
new,decision,through,run=ns['new'],ns['decision'],ns['through'],ns['run']
CHECKS=[]; CASES=[]
def check(name,value):
 if value is not True:raise AssertionError(name)
 CHECKS.append({'id':name,'passed':True})
def ready():
 c,p,_=new();through(c,p,('prepare','format','verify','regression','archive','final'));c.status('final',0,c.last)
 permit=p.control(dict(unit=c.unit,principal='root',finalReceipt=c.last,issued=100,expires=160,exitStatus=0))
 return c,p,permit
def record(name,c,rec,**extra):CASES.append(dict(case=name,state=c.state,hold=c.hold,caps=c.caps,receipt=rec,**extra))
# Timely complete positive through closing, with the exact unchanged source controller.
c,p,permit=ready();rec=c.guarded_gate(*decision(c,p,'gate'),*permit);check('TIMELY_GATE_ACCEPTED',rec['accepted'] is True)
c.status('gate',0,c.last);rec=c.postclose(*decision(c,p,'postclose'));check('TIMELY_POSTCLOSE_ACCEPTED',rec['accepted'] is True and c.state=='CLOSED_RESOURCE_ONLY');record('timely_complete',c,rec)
# Same original permit expires in outer accounted finish, after PRE and POST.
c,p,permit=ready();finish=p.finish_phase
def late_finish(unit,phase):
 finish(unit,phase)
 if phase=='gate':p.time=161
p.finish_phase=late_finish
rec=c.guarded_gate(*decision(c,p,'gate'),*permit)
check('REPRO_PERMIT_EXPIRED_AT_FINISH_ACCEPTED',p.time==161 and rec['accepted'] is True and c.state=='GATE_OK')
check('EXPIRED_GATE_CAP_CONSUMED',c.caps['gate']==1);record('permit_expiry_during_gate_finish',c,rec,time=p.time,expires=160)
# Final shared R drift after the gate and postclose body is not checked.
for phase in ('gate','postclose'):
 c,p,permit=ready()
 if phase=='postclose':
  c.guarded_gate(*decision(c,p,'gate'),*permit);c.status('gate',0,c.last)
 finish=p.finish_phase
 def drift_finish(unit,which):
  finish(unit,which)
  if which==phase:p.r[0]['sha256']='6'*64
 p.finish_phase=drift_finish
 rec=c.guarded_gate(*decision(c,p,'gate'),*permit) if phase=='gate' else c.postclose(*decision(c,p,'postclose'))
 check('REPRO_LATE_R_DRIFT_ACCEPTED_'+phase,rec['accepted'] is True and p.r[0]['sha256']!=p.plan['finiteCopy']['members'][0]['sha256']);record('late_R_'+phase,c,rec)
# Existing invoke final guard provides the paired rejection.
c,p,_=new();through(c,p,('prepare',));finish=p.finish_phase
def drift_format(unit,phase):finish(unit,phase);p.r[0]['sha256']='6'*64
p.finish_phase=drift_format
rec=run(c,p,'format');check('FORMAT_FINAL_R_DRIFT_HOLD',rec['accepted'] is False and c.hold is True and rec['cleanup']==['FINAL_R_SOURCE_UNKNOWN']);record('format_R_guard_control',c,rec)
# Target changes pause correctly. Then compare successful and failed final adoption gates.
for fail in (False,True):
 c,p,_=new();through(c,p,('prepare',));target=c.plan['overlay'][0]['path']
 p.native_edit=lambda rows:next(x for x in rows if x['path']==target).__setitem__('sha256','5'*64)
 rec=run(c,p,'format');check('FORMAT_TARGET_PAUSES_'+str(fail),c.state=='FORMAT_REVIEW_REQUIRED' and c.pending_review is not None and c.caps['verify']==0)
 p.native_edit=None
 if fail:p.admission_edit=lambda facts:facts.__setitem__('noncreditCertificate',False)
 error=None
 try:c.adopt_formatted(*decision(c,p,'formatted-source-review'))
 except BaseException as e:error=type(e).__name__
 if fail:
  check('REPRO_FAILED_ADOPTION_DOES_NOT_HOLD',error=='Hold' and c.hold is False and c.state=='FORMATTED' and c.pending_review is None)
  failedState=dict(state=c.state,hold=c.hold,pendingReview=c.pending_review,errorType=error)
  p.admission_edit=None;rec=run(c,p,'verify')
  check('REPRO_LATER_VERIFY_ACCEPTED_WITHOUT_NEW_ADOPTION',rec['accepted'] is True and c.state=='VERIFIED' and c.caps['verify']==1)
  record('failed_adoption_final_gate_then_verify',c,rec,failedAdoption=failedState)
 else:
  check('ADOPTION_POSITIVE',error is None and c.state=='FORMATTED' and c.pending_review is None)
  rec=run(c,p,'verify');check('ADOPTION_POSITIVE_VERIFY',rec['accepted'] is True);record('adoption_positive',c,rec)
check('ZERO_UNEXPECTED_REAL_BOUNDARIES',ns['denied_events']==[])
print(json.dumps({'kind':'QUINN_BOUNDED_GST_SOURCE01_CRITICAL_PAIRS','checks':len(CHECKS),'cases':len(CASES),'results':CHECKS,'caseResults':CASES,'exactFakePrefixReverseProof':True,'subjectSafetyCodeEdited':False,'persistentAuditUnchanged':True,'actualTargetActions':0,'ordinaryRuntimeAdapterImplemented':False},indent=2))
