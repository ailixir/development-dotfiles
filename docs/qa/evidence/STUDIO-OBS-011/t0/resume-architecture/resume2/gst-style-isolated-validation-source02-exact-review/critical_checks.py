"""One finite independent SOURCE02 protocol batch, actual controller/all fake effects.

No target safety AST edits. Exact inspected fixture prefix includes permanent unchanged
audit, Same-buffer controller/selected definitions, FakePort/FakeET/name-only FakePath.
"""
from pathlib import Path
import ast,hashlib,json
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gst-style-isolated-validation-prep/resume2').absolute()
raw=(S/'fake_flow.py').read_bytes()
if hashlib.sha256(raw).hexdigest()!='111f952234b83aeb49f129717ac66c6a5b98b7fc51dde15bc8c322f62d1da983':raise RuntimeError('FIXTURE_PIN')
tree=ast.parse(raw)
cut=next(n.lineno for n in tree.body if isinstance(n,ast.Assign) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='new')
lines=raw.decode().splitlines(keepends=True);prefix=''.join(lines[:cut-1])
if (prefix+''.join(lines[cut-1:])).encode()!=raw:raise RuntimeError('PREFIX_REVERSE')
ns=dict(__file__=str(S/'fake_flow.py'),__name__='_aria_source02_independent_batch')
exec(compile(prefix,'<exact inspected SOURCE02 fake prefix>','exec'),ns)
new,decision,through,run=ns['new'],ns['decision'],ns['through'],ns['run']
CHECKS=[];CASES=[]
def check(name,ok):
    if ok is not True:raise RuntimeError(name)
    CHECKS.append(dict(name=name,passed=True))
def ready():
    c,p,_=new();through(c,p,('prepare','format','verify','regression','archive','final'));c.status('final',0,c.last)
    permit=p.control(dict(unit=c.unit,principal='root',finalReceipt=c.last,issued=100,expires=160,exitStatus=0))
    return c,p,permit
def keep(name,c,p,receipt,**facts):
    CASES.append(dict(case=name,receipt=receipt,state=c.state,hold=c.hold,caps=dict(c.caps),**facts))

c,p,permit=ready();receipt=c.guarded_gate(*decision(c,p,'gate'),*permit)
check('TIMELY_GATE_COMPLETE',receipt['accepted'] is True and c.state=='GATE_OK' and p.calls.count(('publication-completion-guard','gate'))==1)
c.status('gate',0,c.last);receipt=c.postclose(*decision(c,p,'postclose'))
check('TIMELY_POSTCLOSE_COMPLETE',receipt['accepted'] is True and c.state=='CLOSED_RESOURCE_ONLY')
check('ONE_OWNED_FINAL_OBSERVATION_AFTER_BODY',p.calls.index(('finish','postclose'))<p.calls.index(('final-source-owned-complete','postclose'))<p.calls.index(('receipt','postclose')) and p.calls.count(('final-source-owned-complete','postclose'))==1)
keep('timely_complete',c,p,receipt)

# All samples fit the signed original interval, but the first active-gate admission
# read150 is followed by PRE120. _gates consumed150 before gate_permit existed.
c,p,permit=ready();clock_values=[150,120];clock_history=[]
def initial_reversed_clock():
    value=clock_values.pop(0) if clock_values else 120;clock_history.append(value);return value
p.monotonic_lease_time=initial_reversed_clock
receipt=c.guarded_gate(*decision(c,p,'gate'),*permit)
check('REPRO_INITIAL_ACTIVE_GATE_CLOCK_REVERSAL_ACCEPTED',clock_history[:2]==[150,120] and receipt['accepted'] is True and c.state=='GATE_OK' and receipt['phaseStatus']==0)
check('REPRO_SAME_ORIGINAL_PERMIT_CAP',c.gate_permit[-1]==permit[1] and c.caps['gate']==1)
keep('initial_active_gate_clock_reversal',c,p,receipt,clockHistory=clock_history,permitWindow=[100,160])

c,p,permit=ready();probe=p.gate_probe
def late_post(when,*args):
    probe(when,*args)
    if when=='POST':p.time=161
p.gate_probe=late_post
receipt=c.guarded_gate(*decision(c,p,'gate'),*permit)
check('POST_BOUND_WORK_EXPIRY_REJECTED',receipt['accepted'] is False and c.hold is True and c.state=='HOLD' and c.gate_permit[-1]==permit[1])
keep('post_work_expiry_denied',c,p,receipt)

for phase,failure in (('gate','drift'),('postclose','drift'),('gate','ownership-incomplete')):
    c,p,permit=ready()
    if phase=='postclose':c.guarded_gate(*decision(c,p,'gate'),*permit);c.status('gate',0,c.last)
    finish=p.finish_phase
    def late_finish(unit,current):
        finish(unit,current)
        if current==phase and failure=='drift':p.r[0]['sha256']='6'*64
    p.finish_phase=late_finish
    observation=p.final_source_observation
    def final_observation(unit,current,*args):
        value=observation(unit,current,*args)
        if current==phase and failure=='ownership-incomplete':value['completionQualified']=False
        return value
    p.final_source_observation=final_observation
    receipt=c.guarded_gate(*decision(c,p,'gate'),*permit) if phase=='gate' else c.postclose(*decision(c,p,'postclose'))
    check('FINAL_SOURCE_OWNED_FAILURE_'+phase+'_'+failure,receipt['accepted'] is False and c.hold is True and receipt['cleanup']==['FINAL_R_SOURCE_UNKNOWN'])
    check('ONE_FINAL_OBSERVATION_'+phase+'_'+failure,p.calls.count(('final-source-owned-complete',phase))==1)
    keep('final_source_'+phase+'_'+failure,c,p,receipt)

for publication in ('guard-not-called','guard-expired'):
    c,p,permit=ready();publish=p.publish_receipt
    def changed_publish(doc,completion_guard=None):
        if doc['phase']=='gate':
            if publication=='guard-not-called':return '7'*64
            p.time=161
        return publish(doc,completion_guard=completion_guard)
    p.publish_receipt=changed_publish
    receipt=c.guarded_gate(*decision(c,p,'gate'),*permit)
    check('PUBLICATION_GUARD_REQUIRED_'+publication,receipt['accepted'] is False and c.last is None and c.hold is True and receipt['cleanup']==['RECEIPT_PUBLICATION_UNKNOWN'])
    check('PUBLICATION_FAILURE_CAP_UNCHANGED_'+publication,c.caps['gate']==1 and c.gate_permit[-1]==permit[1])
    keep(publication,c,p,receipt)

for failure in ('none','lease-false','final-observation-unknown','publication-failure'):
    c,p,_=new();through(c,p,('prepare',));target=c.plan['overlay'][0]['path']
    p.native_edit=lambda rows:next(x for x in rows if x['path']==target).__setitem__('sha256','5'*64)
    through(c,p,('format',));p.native_edit=None
    original_project=c.project;pending=ns['clone'](c.pending_review);original_port=c.port
    if failure=='lease-false':
        amend=p.verify_lease_amendment_without_extension
        def amend_false(*args):amend(*args);return False
        p.verify_lease_amendment_without_extension=amend_false
    elif failure=='final-observation-unknown':
        observation=p.final_source_observation
        def unknown_observation(unit,phase,*args):
            value=observation(unit,phase,*args)
            if phase=='formatted-source-review':value['ownershipComplete']=False
            return value
        p.final_source_observation=unknown_observation
    elif failure=='publication-failure':p.fail='publish'
    receipt=c.adopt_formatted(*decision(c,p,'formatted-source-review'))
    if failure=='none':
        check('ADOPTION_COMMIT_AFTER_COMPLETE_PROOF',receipt['accepted'] is True and c.project is not original_project and c.pending_review is None and c.adoption_history[-1]['eligibilityCommitted'] is True)
        through(c,p,('verify',));check('ADOPTION_POSITIVE_SEPARATE_UNUSED_VERIFY',c.state=='VERIFIED' and c.caps['format']==c.caps['verify']==1)
    else:
        check('ADOPTION_STAGE_HISTORY_PORT_PRESERVED_'+failure,receipt['accepted'] is False and c.hold is True and c.project is original_project and c.pending_review==pending and c.port is original_port and c.adoption_history[-1]['eligibilityCommitted'] is False)
        p.fail=None;p.admission_edit=None
        check('ADOPTION_REPAIRED_FACTS_CANNOT_REOPEN_'+failure,ns['denied_call'](lambda:run(c,p,'verify')) and c.caps['verify']==0 and c.caps['format']==1)
    keep('adoption_'+failure,c,p,receipt,adoptionHistory=c.adoption_history)
check('NO_UNEXPECTED_BOUNDARY_ATTEMPTS',ns['denied_events']==[])
print(json.dumps(dict(kind='ARIA_GST_SOURCE02_COMPLETE_BOUNDED_PROTOCOL_BATCH',passed=len(CHECKS),failed=0,checks=CHECKS,cases=CASES,
    exactFakeDefinitionPrefix=True,prefixReverseProof=True,subjectSafetyAstEdited=False,persistentAuditUnchanged=True,
    old43Or74SuitesReplayed=False,author74And20Attributed=True,actualResourceNativeSourceActions=0),indent=2))
