"""One bounded independent GST protocol batch. No source safety logic is modified.

Reuses the complete exact inspected fake-definition prefix, including permanent audit,
same compiled buffers and FakePort/FakeET/FakePath. Only new invocation cases follow.
"""
from pathlib import Path
import ast,hashlib,json
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gst-style-isolated-validation-prep/resume1').absolute()
raw=(S/'fake_flow.py').read_bytes()
if hashlib.sha256(raw).hexdigest()!='ab297ba19297db5ea4c1d4ab5a3f075d0de54f8d6d6394ce87c0f24f17ee4169':raise RuntimeError('EXACT_MODEL_PIN')
tree=ast.parse(raw)
cut=next(node.lineno for node in tree.body if isinstance(node,ast.Assign) and isinstance(node.value,ast.Call)
         and isinstance(node.value.func,ast.Name) and node.value.func.id=='new')
lines=raw.decode().splitlines(keepends=True);prefix=''.join(lines[:cut-1])
if (prefix+''.join(lines[cut-1:])).encode()!=raw:raise RuntimeError('EXACT_PREFIX_REVERSE_PROOF')
ns=dict(__file__=str(S/'fake_flow.py'),__name__='_aria_independent_gst_protocol_cases')
exec(compile(prefix,'<exact inspected fake definitions and permanent audit>','exec'),ns)
new,decision,through=ns['new'],ns['decision'],ns['through']
CHECKS=[];CASES=[]
def check(name,ok):
    if ok is not True:raise RuntimeError(name)
    CHECKS.append(dict(name=name,passed=True))
def ready():
    c,p,scope=new();through(c,p,('prepare','format','verify','regression','archive','final'))
    c.status('final',0,c.last)
    permit=p.control(dict(unit=c.unit,principal='root',finalReceipt=c.last,issued=100,expires=160,exitStatus=0))
    return c,p,permit

# Explicit unimplemented default has no fallback effects and cannot become prepared.
controller,scope=ns['adapter']['build_controller'](ns['raw_source'],ns['source_pin'],ns['raw_plan'],ns['plan_pin'],ns['hashlib'],ns['json'])
receipt=controller.invoke('prepare',b'UNQUALIFIED','0'*64)
check('DEFAULT_OWED_PORT_HOLD',receipt['accepted'] is False and controller.hold is True and controller.caps['prepare']==1)
CASES.append(dict(case='default_owed',receipt=receipt))

c,p,permit=ready();receipt=c.guarded_gate(*decision(c,p,'gate'),*permit)
check('TIMELY_GATE_POSITIVE',receipt['accepted'] is True and c.state=='GATE_OK' and p.time<160)
CASES.append(dict(case='timely_gate',time=p.time,receipt=receipt))

c,p,permit=ready();original=p.gate_probe
def late_post(when,*args):
    original(when,*args)
    if when=='POST':p.time=161
p.gate_probe=late_post
receipt=c.guarded_gate(*decision(c,p,'gate'),*permit)
check('REPRO_POST_WORK_EXPIRED_ACCEPTED',p.time>=160 and receipt['accepted'] is True and receipt['phaseStatus']==0 and c.state=='GATE_OK')
check('REPRO_POST_EXPIRY_CAP_CONSUMED',c.caps['gate']==1)
CASES.append(dict(case='permit_expires_during_post_probe',time=p.time,permitExpires=160,receipt=receipt))

for phase in ('gate','postclose'):
    c,p,permit=ready()
    if phase=='postclose':
        receipt=c.guarded_gate(*decision(c,p,'gate'),*permit);c.status('gate',0,c.last)
    old_finish=p.finish_phase
    def drift_finish(unit,which):
        old_finish(unit,which)
        if which==phase:p.r[0]['sha256']='6'*64
    p.finish_phase=drift_finish
    receipt=c.guarded_gate(*decision(c,p,'gate'),*permit) if phase=='gate' else c.postclose(*decision(c,p,'postclose'))
    r_unchanged=p.r[0]['sha256']==p.plan['finiteCopy']['members'][0]['sha256']
    check('REPRO_R_DRIFT_AFTER_CLOSING_FINALIZER_'+phase,r_unchanged is False and receipt['accepted'] is True and receipt['phaseStatus']==0)
    CASES.append(dict(case='r_drift_during_'+phase+'_finalizer',rUnchanged=r_unchanged,receipt=receipt))

# Paired ordinary invoke checks R after the same outer finish callback and rejects drift.
c,p,scope=new();through(c,p,('prepare',));old_finish=p.finish_phase
def format_drift(unit,phase):
    old_finish(unit,phase);p.r[0]['sha256']='6'*64
p.finish_phase=format_drift
receipt=ns['run'](c,p,'format')
check('FORMAT_FINALLY_R_DRIFT_DENIED',receipt['accepted'] is False and receipt['cleanup']==['FINAL_R_SOURCE_UNKNOWN'] and c.hold is True)
CASES.append(dict(case='r_drift_during_format_finalizer',receipt=receipt))
check('NO_UNEXPECTED_DENY_AUDIT_ATTEMPTS',ns['denied_events']==[])
print(json.dumps(dict(kind='ARIA_GST_SOURCE01_BOUNDED_CRITICAL_PROTOCOL_PAIRS',passed=len(CHECKS),failed=0,checks=CHECKS,cases=CASES,
    exactModelDefinitionPrefix=True,prefixReverseProof=True,subjectSafetyCodeEdited=False,persistentAuditUnchanged=True,
    actualSourceCopyNativeToolPrivateResourceActions=0,actualRuntimeAdapterImplemented=False),indent=2))
