"""One exact SOURCE02 independent bounded protocol batch; unchanged source/audit."""
from pathlib import Path
import ast,hashlib,json
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gst-style-isolated-validation-prep/resume2').absolute()
raw=(S/'fake_flow.py').read_bytes();assert hashlib.sha256(raw).hexdigest()=='111f952234b83aeb49f129717ac66c6a5b98b7fc51dde15bc8c322f62d1da983'
t=ast.parse(raw);cut=next(n.lineno for n in t.body if isinstance(n,ast.Assign) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='new');lines=raw.decode().splitlines(keepends=True);prefix=''.join(lines[:cut-1]);assert (prefix+''.join(lines[cut-1:])).encode()==raw
ns={'__file__':str(S/'fake_flow.py'),'__name__':'_quinn_source02_bounded'};exec(compile(prefix,'<exact inspected source02 fake prefix and persistent audit>','exec'),ns)
new,decision,through,run=ns['new'],ns['decision'],ns['through'],ns['run'];checks=[];cases=[]
def check(n,v):
 if v is not True:raise AssertionError(n)
 checks.append({'id':n,'passed':True})
def save(n,c,r,**extra):cases.append(dict(case=n,state=c.state,hold=c.hold,receipt=r,caps=dict(c.caps),**extra))
def ready():
 c,p,_=new();through(c,p,('prepare','format','verify','regression','archive','final'));c.status('final',0,c.last);permit=p.control(dict(unit=c.unit,principal='root',finalReceipt=c.last,issued=100,expires=160,exitStatus=0));return c,p,permit
c,p,permit=ready();r=c.guarded_gate(*decision(c,p,'gate'),*permit)
check('TIMELY_GATE_POSITIVE',r['accepted'] is True and c.state=='GATE_OK' and c.gate_permit[-1]==permit[1])
c.status('gate',0,c.last);r=c.postclose(*decision(c,p,'postclose'));check('TIMELY_POSTCLOSE_POSITIVE',r['accepted'] is True and c.state=='CLOSED_RESOURCE_ONLY');save('timely_complete',c,r)
# First gate admission consumes a clock before binding the original permit.
c,p,permit=ready();ticks=[];values=[161]
def first_expired_then_recovered():
 value=values.pop(0) if values else 100;ticks.append(value);return value
p.monotonic_lease_time=first_expired_then_recovered
r=c.guarded_gate(*decision(c,p,'gate'),*permit)
check('REPRO_INITIAL_ACTIVE_CLOCK_IGNORED',ticks[0]==161 and ticks[1]==100 and r['accepted'] is True and c.state=='GATE_OK')
check('REPRO_ORIGINAL_PERMIT_AND_CAP_PRESERVED',c.gate_permit[-1]==permit[1] and c.caps['gate']==1)
save('initial_gate_clock_expired_then_recovered',c,r,clockFacts=ticks,issued=100,expires=160)
for fault in ('late-preparation','guard-omitted','false-sha'):
 c,p,permit=ready();publish=p.publish_receipt
 def altered(doc,completion_guard=None):
  if doc['phase']!='gate':return publish(doc,completion_guard=completion_guard)
  if fault=='late-preparation':p.time=161;return publish(doc,completion_guard=completion_guard)
  if fault=='guard-omitted':return hashlib.sha256(json.dumps(doc,sort_keys=True).encode()).hexdigest()
  return False
 p.publish_receipt=altered;r=c.guarded_gate(*decision(c,p,'gate'),*permit)
 check('PUBLICATION_UNKNOWN_HOLD_'+fault,r['accepted'] is False and c.hold is True and c.state=='HOLD' and c.last is None and 'RECEIPT_PUBLICATION_UNKNOWN' in r['cleanup'])
 save('publication_'+fault,c,r)
for phase in ('gate','postclose'):
 c,p,permit=ready()
 if phase=='postclose':c.guarded_gate(*decision(c,p,'gate'),*permit);c.status('gate',0,c.last)
 observation=p.final_source_observation;count=[]
 def unknown_final(unit,which,*args):
  result=observation(unit,which,*args)
  if which==phase:
   count.append(True)
   if phase=='gate':result['completionQualified']=False
   else:result['source'][0]['mode']=0o600
  return result
 p.final_source_observation=unknown_final
 r=c.guarded_gate(*decision(c,p,'gate'),*permit) if phase=='gate' else c.postclose(*decision(c,p,'postclose'))
 check('ONE_OWNED_FINAL_OBSERVATION_'+phase,len(count)==1)
 check('FINAL_PROOF_UNKNOWN_HOLD_'+phase,r['accepted'] is False and c.hold is True and r['cleanup']==['FINAL_R_SOURCE_UNKNOWN'])
 save('final_observation_'+phase,c,r)
for fault in ('none','final-admission-false','partial-lease-false','partial-publication-unknown'):
 c,p,_=new();through(c,p,('prepare',));target=c.plan['overlay'][0]['path'];p.native_edit=lambda rows:next(x for x in rows if x['path']==target).__setitem__('sha256','5'*64);through(c,p,('format',));p.native_edit=None
 accepted=c.project;pending=ns['clone'](c.pending_review);port=c.port;partial=[]
 if fault=='final-admission-false':p.admission_edit=lambda f:f.__setitem__('noncreditCertificate',False)
 elif fault=='partial-lease-false':
  amend=p.verify_lease_amendment_without_extension
  def partial_amend(*args):amend(*args);return False
  p.verify_lease_amendment_without_extension=partial_amend
 elif fault=='partial-publication-unknown':
  publish=p.publish_receipt
  def uncertain(doc,completion_guard=None):
   if doc['phase']=='formatted-source-review':
    partial.append(ns['clone'](doc));raise RuntimeError('SYNTHETIC_UNKNOWN_PARTIAL')
   return publish(doc,completion_guard=completion_guard)
  p.publish_receipt=uncertain
 r=c.adopt_formatted(*decision(c,p,'formatted-source-review'))
 if fault=='none':
  check('ADOPTION_COMMIT_POSITIVE',r['accepted'] is True and c.state=='FORMATTED' and c.project is not accepted and c.pending_review is None)
  through(c,p,('verify',));check('ADOPTION_UNUSED_VERIFY_POSITIVE',c.state=='VERIFIED' and c.caps['format']==c.caps['verify']==1)
 else:
  check('ADOPTION_STICKY_PRESERVATION_'+fault,r['accepted'] is False and c.hold is True and c.state=='HOLD' and c.project is accepted and c.pending_review==pending and c.port is port and not c.adoption_history[-1]['eligibilityCommitted'])
  if fault=='partial-lease-false':check('PARTIAL_LEASE_UNKNOWN_RETAINED',c.adoption_history[-1]['leaseAmendment']=='ATTEMPTED_UNKNOWN')
  if fault=='partial-publication-unknown':check('PARTIAL_PUBLICATION_NOT_AUTHORITY',len(partial)==1 and partial[0]['accepted'] is True and c.last is None and 'RECEIPT_PUBLICATION_UNKNOWN' in r['cleanup'])
  p.admission_edit=None;p.fail=None
  check('ADOPTION_LATER_VERIFY_BLOCKED_'+fault,ns['denied_call'](lambda:run(c,p,'verify')) and c.caps['verify']==0 and c.caps['format']==1)
 save('adoption_'+fault,c,r)
check('ZERO_UNEXPECTED_REAL_BOUNDARIES',ns['denied_events']==[])
print(json.dumps(dict(kind='QUINN_SOURCE02_COMPLETE_BOUNDED_CRITICAL_PAIRS',checks=len(checks),cases=len(cases),results=checks,caseResults=cases,exactModelPrefixReverseProof=True,persistentAuditUnchanged=True,subjectSafetyEdits=False,actualTargetActions=0,ordinaryRuntimePortImplemented=False),indent=2))
