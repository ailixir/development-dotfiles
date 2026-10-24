"""Independent bounded GST SOURCE03 Controller pairs; no actual Port/effects.

Exact inspected definition prefix, immutable verified source/plan/buffer cache,
original permanent deny audit, FakePort/FakeET/name-only FakePath. No safety edit.
"""
import ast,hashlib,json,sys,types,xml.etree.ElementTree as ET
from pathlib import Path
from collections import Counter
from unittest.mock import patch

S=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gst-style-isolated-validation-prep/resume3')
raw=(S/'manifest.json').read_bytes()
if hashlib.sha256(raw).hexdigest()!='35c8502962094fcf16150328e6f4f533f597bbe4674b17d9dd87acd6ce562ec9':raise ValueError('EXTERNAL_MANIFEST')
cache={}
for row in json.loads(raw)['files']:
 p=S/row['path'];b=p.read_bytes()
 if hashlib.sha256(b).hexdigest()!=row['sha256'] or len(b)!=row['bytes']:raise ValueError('SOURCE_PAYLOAD')
 cache[str(p)]=b
flow=cache[str(S/'fake_flow.py')];tree=ast.parse(flow)
cut=next(n.lineno for n in tree.body if isinstance(n,ast.Assign) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='new')
lines=flow.decode().splitlines(keepends=True);prefix=''.join(lines[:cut-1])
if (prefix+''.join(lines[cut-1:])).encode()!=flow:raise ValueError('PREFIX_REVERSE_PROOF')
def same_buffer(path):
 if str(path) not in cache:raise ValueError('UNAPPROVED_FIXTURE_SOURCE_READ')
 return cache[str(path)]
ns={'__file__':str(S/'fake_flow.py'),'__name__':'_quinn_gst_source03_fake_prefix'}
with patch.object(Path,'read_bytes',same_buffer):exec(compile(prefix,'<exact-inspected-fake-definition-prefix>','exec'),ns)
check=ns['check'];new=ns['new'];through=ns['through'];decision=ns['decision'];run=ns['run'];clone=ns['clone'];denied_call=ns['denied_call'];cases=[];callbacks=[]

class HostileClock:
 def __bool__(self):callbacks.append('bool');raise AssertionError('ARBITRARY_CLOCK_CALLBACK')
 def __repr__(self):callbacks.append('repr');raise AssertionError('ARBITRARY_CLOCK_CALLBACK')
 def __str__(self):callbacks.append('str');raise AssertionError('ARBITRARY_CLOCK_CALLBACK')
 def __ge__(self,unused):callbacks.append('ge');raise AssertionError('ARBITRARY_CLOCK_CALLBACK')
 def __le__(self,unused):callbacks.append('le');raise AssertionError('ARBITRARY_CLOCK_CALLBACK')

def ready():
 c,p,_=new();through(c,p,('prepare','format','verify','regression','archive','final'));c.status('final',0,c.last)
 permit=p.control({'unit':c.unit,'principal':'root','finalReceipt':c.last,'issued':100,'expires':160,'exitStatus':0})
 return c,p,permit

def public_history(values):
 return [v if type(v)is int or v is None else 'NONINTEGER_OBJECT_RETAINED' for v in values]

# Five required initial pairs plus one hostile unknown, fixed before execution.
for name,initial,steady,positive in [('timely',110,120,True),('initial-reversal',150,120,False),('initial-expired',161,100,False),('initial-before-issued',99,100,False),('initial-unknown',None,100,False),('initial-hostile',HostileClock(),100,False)]:
 c,p,permit=ready();observed=[];remaining=[initial];permit_reads=[];verified=p.verify_control
 def control(raw,pin):
  if pin==permit[1]:permit_reads.append(pin)
  return verified(raw,pin)
 p.verify_control=control
 def clock():
  value=remaining.pop(0) if remaining else steady;observed.append(value);return value
 p.monotonic_lease_time=clock
 rec=c.guarded_gate(*decision(c,p,'gate'),*permit);history=list(c.gate_clock_facts)
 check('ORIGINAL_FROZEN_SCALARS_AND_PIN_'+name,c.gate_permit[3:5]==(100,160) and c.gate_permit[-1]==permit[1] and permit_reads==[permit[1]])
 check('EVERY_ACTUALLY_CONSUMED_FACT_RETAINED_'+name,len(history)==len(observed) and all(a is b or type(a)is int and type(b)is int and a==b for a,b in zip(history,observed)))
 check('HISTORY_SURVIVES_DEACTIVATION_'+name,c.gate_in_progress is False and c.caps['gate']==1)
 encoded=json.dumps(rec,sort_keys=True)
 check('PUBLIC_RECEIPT_NO_RAW_CLOCK_'+name,'gate_clock_facts' not in encoded and 'ARBITRARY_CLOCK_CALLBACK' not in encoded and 'NONINTEGER_OBJECT_RETAINED' not in encoded)
 if positive:
  check('TIMELY_FULL_GATE_ACCEPTED',rec['accepted'] is True and c.state=='GATE_OK' and observed[:2]==[110,120])
  c.status('gate',0,c.last);closed=c.postclose(*decision(c,p,'postclose'))
  check('TIMELY_POSTCLOSE_PRESERVES_HISTORY',closed['accepted'] is True and c.state=='CLOSED_RESOURCE_ONLY' and c.gate_clock_facts==history)
 else:
  check('INITIAL_FAULT_STICKY_HOLD_'+name,rec['accepted'] is False and c.hold is True and c.state=='HOLD' and not any(v==('publication-completion-guard','gate') for v in p.calls))
  before=len(observed);p.monotonic_lease_time=lambda:100
  check('CLEAN_RETRY_CANNOT_RESET_'+name,denied_call(lambda:c.guarded_gate(*decision(c,p,'gate'),*permit)) and len(observed)==before and len(c.gate_clock_facts)==len(history) and c.gate_clock_facts[0] is initial and c.caps['gate']==1)
  if name in ('initial-expired','initial-before-issued','initial-unknown','initial-hostile'):check('UNOBSERVED_CLEAN_VALUE_NOT_INVENTED_'+name,len(observed)==1)
 cases.append(dict(case=name,receipt=rec,actualConsumedHistory=public_history(history),initialReferenceRetained=history[0] is initial,permitReads=len(permit_reads),gateCap=c.caps['gate'],realClockRead=False))

# Scalar permit is frozen before the first admission callback can mutate its
# previously returned dictionary; original expiry still governs first time161.
c,p,permit=ready();returned=[];verified=p.verify_control;bound_at_admission=[]
def control(raw,pin):
 value=verified(raw,pin)
 if pin==permit[1]:returned.append(value)
 return value
p.verify_control=control
def mutate(facts):
 bound_at_admission.append(c.gate_permit is not None)
 returned[0]['issued']=0;returned[0]['expires']=999
p.admission_edit=mutate;p.time=161
rec=c.guarded_gate(*decision(c,p,'gate'),*permit)
check('BINDING_PRECEDES_FIRST_ADMISSION',bound_at_admission==[True] and len(returned)==1)
check('ORIGINAL_SCALAR_EXPIRY_NOT_MUTABLE_RETURN',rec['accepted'] is False and c.hold is True and c.gate_permit[3:5]==(100,160) and c.gate_permit[-1]==permit[1] and c.gate_clock_facts==[161])
cases.append(dict(case='frozen-before-admission-return-mutation',receipt=rec,history=list(c.gate_clock_facts),originalExpiryRetained=True))

# Preserve the already fixed complete publication boundary.
c,p,permit=ready();published=p.publish_receipt
def late(doc,completion_guard=None):
 if doc['phase']=='gate':p.time=161
 return published(doc,completion_guard=completion_guard)
p.publish_receipt=late;rec=c.guarded_gate(*decision(c,p,'gate'),*permit)
check('LATE_PUBLICATION_GUARD_REJECTED',rec['accepted'] is False and c.hold is True and c.last is None and 'RECEIPT_PUBLICATION_UNKNOWN' in rec['cleanup'] and c.gate_clock_facts[-1]==161)
cases.append(dict(case='late-publication',receipt=rec,history=list(c.gate_clock_facts)))

# Preserve one owned final R proof after drain; no unowned follow-up collector.
c,p,permit=ready();finish=p.finish_phase
def drift(unit,phase):
 finish(unit,phase)
 if phase=='gate':p.r[0]['sha256']='6'*64
p.finish_phase=drift;rec=c.guarded_gate(*decision(c,p,'gate'),*permit)
check('FINAL_OWNED_SOURCE_DRIFT_STAYS_HOLD',rec['accepted'] is False and c.hold is True and rec['cleanup']==['FINAL_R_SOURCE_UNKNOWN'])
check('ONE_FINAL_SOURCE_AFTER_BODY_DRAIN',p.calls.count(('final-source-owned-complete','gate'))==1 and p.calls.index(('finish','gate'))<p.calls.index(('final-source-owned-complete','gate'))<p.calls.index(('receipt','gate')))
cases.append(dict(case='final-owned-source-drift',receipt=rec))

# Preserve staged adoption/partial external lease uncertainty and later blockage.
c,p,_=new();through(c,p,('prepare',));target=c.plan['overlay'][0]['path'];p.native_edit=lambda rows:next(v for v in rows if v['path']==target).__setitem__('sha256','5'*64)
through(c,p,('format',));p.native_edit=None;project=c.project;pending=clone(c.pending_review);port=c.port;amend=p.verify_lease_amendment_without_extension
def partial(*args):amend(*args);raise RuntimeError('SYNTHETIC_PARTIAL_LEASE_NOT_PUBLIC')
p.verify_lease_amendment_without_extension=partial;rec=c.adopt_formatted(*decision(c,p,'formatted-source-review'))
check('PARTIAL_ADOPTION_RETAINS_ACCEPTED_ELIGIBILITY',rec['accepted'] is False and c.hold is True and c.project is project and c.port is port and c.pending_review==pending and c.adoption_history[-1]['leaseAmendment']=='ATTEMPTED_UNKNOWN' and c.adoption_history[-1]['eligibilityCommitted'] is False)
check('PARTIAL_ADOPTION_CANNOT_RESUME_VERIFY',denied_call(lambda:run(c,p,'verify')) and c.caps['verify']==0 and c.caps['format']==1 and c.pending_review==pending)
cases.append(dict(case='partial-lease-adoption',receipt=rec,eligibilityCommitted=False,formatCap=c.caps['format'],verifyCap=c.caps['verify']))
check('NO_ARBITRARY_UNKNOWN_CLOCK_CALLBACKS',callbacks==[])
check('PERMANENT_AUDIT_NO_REAL_EFFECTS',ns['denied_events']==[])
print(json.dumps(dict(kind='GST_SOURCE03_INDEPENDENT_QUINN_CRITICAL_CLOCK_BINDING_PRESERVATION',passed=len(ns['checks']),checks=ns['checks'],cases=cases,fixturePrefixReverseProof=True,subjectSafetyAstEdits=False,author84And27Replayed=False,priorSuitesReplayed=False,unexpectedBoundaryEvents=ns['denied_events'],arbitraryCallbacks=callbacks,actualRuntimeNativeCopyClockActions=0,limitations='2092 fake source/mode rows, admitted Port booleans/time/native/XML/archive/copy all synthetic; no actual Port, interval, process, source or publication implementation proof.'),indent=2))
