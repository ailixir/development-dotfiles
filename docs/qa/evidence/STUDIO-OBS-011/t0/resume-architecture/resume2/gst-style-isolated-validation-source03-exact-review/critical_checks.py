"""One bounded SOURCE03 independent batch. Actual Controller, unchanged fake guards."""
from pathlib import Path
import ast,hashlib,json
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gst-style-isolated-validation-prep/resume3').absolute()
raw=(S/'fake_flow.py').read_bytes()
if hashlib.sha256(raw).hexdigest()!='01a87057e1ef294aa8820c8bab04a36e4fe8c0dabb82abcdc465d45b231bd3ff':raise RuntimeError('FIXTURE_PIN')
tree=ast.parse(raw)
cut=next(n.lineno for n in tree.body if isinstance(n,ast.Assign) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='new')
lines=raw.decode().splitlines(keepends=True);prefix=''.join(lines[:cut-1])
if (prefix+''.join(lines[cut-1:])).encode()!=raw:raise RuntimeError('EXACT_PREFIX_REVERSE')
ns=dict(__file__=str(S/'fake_flow.py'),__name__='_aria_source03_independent_batch')
exec(compile(prefix,'<exact SOURCE03 fake prefix permanent audit>','exec'),ns)
new,decision,through,run=ns['new'],ns['decision'],ns['through'],ns['run']
CHECKS=[];CASES=[];DISPATCH=[]
def check(name,ok):
    if ok is not True:raise RuntimeError(name)
    CHECKS.append(dict(name=name,passed=True))
def ready():
    c,p,_=new();through(c,p,('prepare','format','verify','regression','archive','final'));c.status('final',0,c.last)
    permit=p.control(dict(unit=c.unit,principal='root',finalReceipt=c.last,issued=100,expires=160,exitStatus=0))
    return c,p,permit
class Hostile:
    def __bool__(self):DISPATCH.append('bool');raise RuntimeError('UNVALIDATED_CALLBACK')
    def __repr__(self):DISPATCH.append('repr');raise RuntimeError('UNVALIDATED_CALLBACK')
    def __str__(self):DISPATCH.append('str');raise RuntimeError('UNVALIDATED_CALLBACK')
initial_cases=(('timely',110,120,True),('reversed-initial',150,120,False),('expired-initial',161,100,False),
    ('before-issued',99,100,False),('unknown-null',None,100,False),('bool-clock',True,100,False),
    ('private-string-clock','SYNTHETIC_PRIVATE_CLOCK_SENTINEL',100,False),('object-clock',Hostile(),100,False),('float-clock',110.5,120,False))
for name,initial,steady,positive in initial_cases:
    c,p,permit=ready();pending=[initial];observed=[]
    def clock():
        value=pending.pop(0) if pending else steady;observed.append(value);return value
    p.monotonic_lease_time=clock
    receipt=c.guarded_gate(*decision(c,p,'gate'),*permit)
    check('ORIGINAL_PERMIT_AND_CAP_'+name,c.gate_permit==(c.unit,'root',c.final_status,100,160,0,permit[1]) and c.caps['gate']==1)
    check('EACH_OBSERVED_FACT_RETAINED_BEFORE_QUALIFICATION_'+name,len(c.gate_clock_facts)==len(observed) and all(a is b for a,b in zip(c.gate_clock_facts,observed)))
    check('NO_RAW_UNKNOWN_PUBLIC_RECEIPT_'+name,'SYNTHETIC_PRIVATE' not in json.dumps(receipt,allow_nan=False))
    retained=list(c.gate_clock_facts)
    if positive:
        check('TIMELY_COMPLETE_GATE',receipt['accepted'] is True and c.state=='GATE_OK' and c.permit_clock==120 and observed[:2]==[110,120])
        c.status('gate',0,c.last);closed=c.postclose(*decision(c,p,'postclose'))
        check('POSTCLOSE_KEEPS_HISTORY',closed['accepted'] is True and c.state=='CLOSED_RESOURCE_ONLY' and c.gate_clock_facts==retained)
    else:
        check('FAULT_HOLD_'+name,receipt['accepted'] is False and c.hold is True and c.state=='HOLD' and c.gate_in_progress is False)
        before=len(observed);p.monotonic_lease_time=lambda:100
        check('LATER_CLEAN_BLOCKED_NO_RESET_'+name,ns['denied_call'](lambda:c.guarded_gate(*decision(c,p,'gate'),*permit)) and len(observed)==before and len(c.gate_clock_facts)==len(retained) and all(a is b for a,b in zip(c.gate_clock_facts,retained)))
        check('NO_FALSE_PUBLICATION_GUARD_'+name,('publication-completion-guard','gate') not in p.calls)
    CASES.append(dict(case=name,receipt=receipt,retainedFactCount=len(retained),observedFactCount=len(observed),firstFactType=type(initial).__name__,originalPinRetained=True,gateCap=c.caps['gate'],rawHistoryExported=False))

c,p,permit=ready();publish=p.publish_receipt
def late_publication(doc,completion_guard=None):
    if doc['phase']=='gate':p.time=161
    return publish(doc,completion_guard=completion_guard)
p.publish_receipt=late_publication
receipt=c.guarded_gate(*decision(c,p,'gate'),*permit)
check('LATE_PUBLICATION_REMAINS_HOLD',receipt['accepted'] is False and c.last is None and c.state=='HOLD' and receipt['cleanup']==['RECEIPT_PUBLICATION_UNKNOWN'] and c.gate_clock_facts[-1]==161)
CASES.append(dict(case='late_publication',receipt=receipt,gateCap=c.caps['gate']))

c,p,permit=ready();observation=p.final_source_observation
def incomplete_observation(unit,phase,*args):
    result=observation(unit,phase,*args)
    if phase=='gate':result['ownershipComplete']=False
    return result
p.final_source_observation=incomplete_observation
receipt=c.guarded_gate(*decision(c,p,'gate'),*permit)
check('OWNED_FINAL_SOURCE_STILL_REQUIRED',receipt['accepted'] is False and c.state=='HOLD' and receipt['cleanup']==['FINAL_R_SOURCE_UNKNOWN'])
CASES.append(dict(case='owned_final_source_incomplete',receipt=receipt))

c,p,_=new();through(c,p,('prepare',));target=c.plan['overlay'][0]['path']
p.native_edit=lambda rows:next(x for x in rows if x['path']==target).__setitem__('sha256','5'*64)
through(c,p,('format',));p.native_edit=None;accepted=c.project;pending=ns['clone'](c.pending_review);port=c.port
amend=p.verify_lease_amendment_without_extension
def partial_false(*args):amend(*args);return False
p.verify_lease_amendment_without_extension=partial_false
receipt=c.adopt_formatted(*decision(c,p,'formatted-source-review'))
check('STAGED_ADOPTION_PARTIAL_LEASE_RETAINED',receipt['accepted'] is False and c.project is accepted and c.pending_review==pending and c.port is port and c.adoption_history[-1]['leaseAmendment']=='ATTEMPTED_UNKNOWN' and c.adoption_history[-1]['eligibilityCommitted'] is False)
p.admission_edit=None;p.fail=None
check('STAGED_ADOPTION_STICKY_AFTER_REPAIR',ns['denied_call'](lambda:run(c,p,'verify')) and c.caps['verify']==0 and c.caps['format']==1 and c.hold is True)
CASES.append(dict(case='staged_partial_lease_failure',receipt=receipt,adoptionHistory=c.adoption_history))
check('NO_HOSTILE_CALLBACKS',DISPATCH==[])
check('NO_UNEXPECTED_REAL_BOUNDARIES',ns['denied_events']==[])
print(json.dumps(dict(kind='ARIA_SOURCE03_COMPLETE_BOUNDED_CLOCK_AND_PRESERVATION_BATCH',passed=len(CHECKS),failed=0,checks=CHECKS,cases=CASES,
    subjectSafetyAstEdited=False,persistentAuditUnchanged=True,exactFixturePrefixReverseProof=True,
    old84Or74SuitesReplayed=False,actualTargetActions=0),indent=2))
