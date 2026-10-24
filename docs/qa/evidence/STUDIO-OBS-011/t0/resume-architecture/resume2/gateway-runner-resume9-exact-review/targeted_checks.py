"""Aria source09 review: full fake flow and bounded independent changed-path pairs.

Inspected exact definition prefix only; no target safety AST change. All reached
effects are the disclosed in-memory model under its persistent unchanged audit.
No real subject main, subprocess, filesystem, source/tool/baseline observation.
"""
import ast, builtins, collections, copy, datetime, errno, fcntl, hashlib, json, os
import pathlib, re, stat, subprocess, sys, time, types

S = pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume9')
expected = {'runtime.py':'ae0501adeb1eb7a1edf79c87e5dd086c36e5bcff20666f3b8024e0f12c32c108',
 'entry.py':'42bc48ce942ae31152ff2d8bac590cf5087332b4076e411d52f784f9bb9636ba',
 'controls.py':'499bbe1bcb88bf52ce95cc0ba488489ea849ee8046cff7a56342a8ab2f2a8ec5'}
raws = {}
for name, sha in expected.items():
 raw = (S/name).read_bytes()
 if hashlib.sha256(raw).hexdigest() != sha: raise ValueError('EXTERNAL_SOURCE_PIN_'+name)
 raws[name] = raw
control = raws['controls.py']; tree = ast.parse(control)
cut = next(n.lineno for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='whole' for t in n.targets))
lines=control.decode().splitlines(keepends=True); prefix=''.join(lines[:cut-1])
if (prefix+''.join(lines[cut-1:])).encode()!=control:raise ValueError('DEFINITION_PREFIX_REVERSE_PROOF')
sys.argv = ['review-guard',expected['runtime.py'],expected['entry.py']]
ns={'__file__':str(S/'controls.py'),'__name__':'_aria_source09_definition_prefix'}
exec(compile(prefix,'<exact-inspected-guard-definition-prefix>','exec'),ns)
Model=ns['Model'];check=ns['check'];rejects=ns['rejects'];h=lambda b:hashlib.sha256(b).hexdigest()
whole=ns['run_whole']();whole_count=len(ns['RESULTS']);cases=[];serial=12000

def clone(nodes):
 global serial
 m=Model();m.nodes=copy.deepcopy(nodes);m.clock=whole.clock;serial+=1;m.pid=serial
 m.next_ino=max(n['ino'] for n in m.nodes.values())+1
 return m

def author(m,name,value):
 entry={'operation':'author-control','purpose':'ROOT_AUTHOR_REQUEST','authorizedBy':'root',
  'role':'ROOT_ATTESTATION_AUTHOR_ONLY','packetManifestSha256':'a'*64,'outputName':name,
  'runtimeIdentity':{'dev':1,'ino':m.nodes[str(m.E)]['ino']},'document':value}
 ctx=m.context('author-control',entry)
 code=m.ns['author_control'](ctx);ctx.owner.finish();return code

# Whole-flow positives include all five actual functions, final, gate, postclose.
# Independently exercise complete release versus a canonical-role omission at
# the exact pre-author checkpoint, and missing pending input before any E write.
for bad in (False,True):
 m=clone(whole.author_checkpoints['root-authorization.json']);value=copy.deepcopy(whole.json('root-authorization.json'))
 if bad:del value['canonicalPythonRoles']
 writes=len(m.writes)
 if bad:
  rejects('ARIA_RELEASE_MISSING_ROLES_DENY',lambda:author(m,'root-authorization.json',value))
  check('ARIA_RELEASE_DENY_ZERO_WRITE',len(m.writes)==writes and str(m.E/'root-authorization.json') not in m.nodes)
 else:check('ARIA_COMPLETE_RELEASE_AUTHOR0',author(m,'root-authorization.json',value)==0)
m=Model();ctx=m.context('capture');proposal=copy.deepcopy(m.proposal);del proposal['proposedAuthorization']['directoryRoots']
rejects('ARIA_PENDING_MISSING_ROOTS_DENY',lambda:m.ns['capture'](ctx,proposal,h(m.ns['encoded'](proposal)),'--same-shell-once-consumed'))
check('ARIA_PENDING_ZERO_E_AND_OBSERVATION',str(m.E) not in m.nodes and m.observations==[])
cases.append({'category':1,'positive':'complete release author0/full capture0','adverse':'missing canonical roles or pending directoryRoots denies before writes/observations'})

# A control's metadata is freshly enforced even after its identical bytes have
# already been bound. SHA caching cannot waive a later private-mode change.
m=clone(whole.pre_gate_nodes);ctx=m.context('gate');m.ns['bind_entry'](ctx)
name='candidate-baseline.json';saved=ctx.control_raw[name]
check('ARIA_CURRENT_CONTROL_POSITIVE',m.ns['digest'](m.ns['encoded'](ctx.control(name)))==m.ns['digest'](saved))
m.nodes[str(m.E/name)]['mode']=0o644
rejects('ARIA_CONTROL_RECHECK_SAMEHASH_MODE_HOLD',lambda:ctx.control(name),'CONTROL_OPENED_FD_OWNER_MODE_LINK_POLICY')
check('ARIA_IDENTICAL_RAW_DID_NOT_WAIVE_MODE',m.nodes[str(m.E/name)]['data']==saved)
ctx.owner.finish()
cases.append({'category':2,'positive':'current0600 control parses','adverse':'later0644 same raw bytes denies on fresh opened-FD check'})

# Prior relevance survives serialized journal import after the runner vanishes.
m=Model();m.directory(m.E);ctx=m.context('capture');ctx.start_segment('aria-relation')
m.file('/model/tool/node',b'ARIA_NODE',0o755);m.file('/model/tool/helper',b'ARIA_HELPER',0o755)
ctx.release={'nodeSha256':h(b'ARIA_NODE')}
m.rows_extra[777]={'pid':777,'ppid':m.pid,'start':'Mon Oct 19 12:00:02 2026','command':'/model/tool/node','comm':'/model/tool/node'}
m.rows_extra[778]={'pid':778,'ppid':777,'start':'Mon Oct 19 12:00:03 2026','command':'/model/tool/helper','comm':'/model/tool/helper'}
C=m.ns['load_core'](ctx,m.proposal);first=m.ns['sample'](ctx,C,[{'pid':777,'launchId':'red'}])
check('ARIA_HELPER_INITIAL_RELEVANCE',next(x for x in first['currentSampleStates'] if x['pid']==778)['state']=='CURRENT_ATTRIBUTED_WORK_OR_REUSE_AMBIGUITY')
segment=ctx.finish_segment();m.ns['publish_journal'](ctx,'aria-relation',segment)
del m.rows_extra[777];m.rows_extra[778]['ppid']=1
later=m.context('archive');later.release=ctx.release;later.control_raw={'aria-relation.journal.json':m.nodes[str(m.E/'aria-relation.journal.json')]['data']}
m.ns['restore_sample_history'](later);later.start_segment('aria-later')
C=m.ns['load_core'](later,m.proposal)
rejects('ARIA_REPARENTED_PRIOR_RELEVANT_HOLD',lambda:m.ns['boundaries'](later,C),'CURRENT_UNRESOLVED_OR_LIVE_ATTRIBUTED_WORK')
check('ARIA_RELEVANCE_RETAINED_AS_UNAUTHENTICATED',any(x['pid']==778 for x in later.relevance_history) and all(x['identityAuthenticated'] is False for x in later.relevance_history))
cases.append({'category':3,'positive':'first live helper classified relevant','adverse':'new operation with same live reparented helper remains HOLD; no strong identity claimed'})

# Independent actual remaining-total schedule:4+3 fits7;4+4 denies the second
# acquisition before its body. This complements Quinn's stale1->8+8 pair.
for second in (3,4):
 m=Model();ctx=m.context('capture');m.directory('/model/remaining');m.file('/model/remaining/a',b'1234');m.file('/model/remaining/b',b'x'*second)
 Budget=m.ns['Budget'];m.ns['Budget']=lambda **kw:Budget(entries=8,total=7,per_file=7)
 read=m.os.read;acquired=[]
 def reader(fd,amount):
  value=read(fd,amount)
  if m.live(fd)['path'].startswith('/model/remaining/'):acquired.append(len(value))
  return value
 m.os.read=reader
 if second==3:
  rows=m.ns['inventory'](ctx,m.P('/model/remaining'))
  check('ARIA_EXACT_REMAINING7_ACCEPTS7',sum(acquired)==7 and sum(r['bytes'] for r in rows)==7)
 else:
  rejects('ARIA_REMAINING3_DENIES_SECOND4',lambda:m.ns['inventory'](ctx,m.P('/model/remaining')),'FILE_OR_AGGREGATE_CAP_BEFORE_COPY')
  check('ARIA_CAP_DENIAL_ONLY4_ACQUIRED',sum(acquired)==4)
 ctx.owner.finish()
cases.append({'category':4,'positive':'4+3 accepts exact7','adverse':'4+4/cap7 denies second file before body, only4 acquired'})

# First encounter failure still preserves the actual child/wait; independently
# include a real fake-handle timeout so UNKNOWN is never promoted to completion.
for timeout in (False,True):
 m=clone(whole.operation_checkpoints['red']);ctx=m.context('red');messages=[]
 m.ns['print']=lambda text:messages.append(text)
 ens={'__builtins__':dict(m.builtins,print=lambda text,**kw:messages.append(text)),'__name__':'_aria_entry_fakes'}
 exec(compile(raws['entry.py'],'<exact-reviewed-source09-entry>','exec'),ens)
 real_write=m.os.write;real_popen=m.subprocess.Popen
 def writer(fd,value):
  if m.live(fd)['path']==str(m.E/'red.samples.jsonl') and b'"kind":"DIRECT_POPEN_ENCOUNTER_BEFORE_DETAIL"' in value:raise OSError('ARIA_FAKE_LEDGER_UNAVAILABLE')
  return real_write(fd,value)
 def popen(command,**kw):
  child=real_popen(command,**kw)
  if timeout and 'vitest.mjs' in ' '.join(command):
   def wait(timeout):
    m.native_waits+=1
    raise subprocess.TimeoutExpired('SYNTHETIC_REQUEST',timeout)
   child.wait=wait
  return child
 m.os.write=writer;m.subprocess.Popen=popen
 code=ens['execute_context'](ctx,m.ns['dispatch'])
 emitted=[json.loads(v) for v in messages if json.loads(v).get('kind')=='BOUNDED_NATIVE_OPERATOR_FAILURE_LINEAGE']
 check('ARIA_LEDGER_FAILURE_ONCE_OPERATOR_'+str(timeout),code==1 and len(emitted)==1)
 record=emitted[0]['nativeAttemptRecords'][0]
 check('ARIA_CHILD_REQUEST_SURVIVES_'+str(timeout),type(record['actualPid']) is int and len(record['requestSha256'])==64 and len(record['waitRecords'])==1 and record['waitRecords'][0]['kind']=='FALLBACK_WAIT' and m.native_waits==1)
 if timeout:
  check('ARIA_WAIT_UNKNOWN_NOT_COMPLETION',record['directWaitRecord'] is None and record['runnerCompletion']['completed'] is False and record['waitRecords'][0]['terminalWaitConfirmed'] is False and 'TimeoutExpired' in record['cleanupFailureClasses'])
 else:check('ARIA_FALLBACK_ACTUAL_WAIT_CONFIRMED',record['directWaitRecord']['terminalWaitConfirmed'] is True and record['runnerCompletion']['returnedExit']==1)
 check('ARIA_TYPED_RECORD_NO_RAW_'+str(timeout),'ARIA_FAKE_LEDGER_UNAVAILABLE' not in messages[0] and 'MODEL_NATIVE_OUTPUT' not in messages[0] and len(messages[0].encode())<=65536)
cases.append({'category':5,'positive':'one actual fallback wait retained','adverse':'fallback timeout preserves knownPID/request and UNKNOWN completion in once-only bounded operator sink'})
check('ARIA_UNCHANGED_PERSISTENT_AUDIT',ns['denied']==[])
print(json.dumps({'kind':'ARIA_SOURCE09_INDEPENDENT_GUARDED_CHANGED_PATHS','checks':len(ns['RESULTS']),
 'wholeFlowChecks':whole_count,'independentChangedPathChecks':len(ns['RESULTS'])-whole_count,'results':ns['RESULTS'],
 'cases':cases,'category6':'Independent literal source check; no actual shell execution',
 'runtimeSha256':expected['runtime.py'],'entrySha256':expected['entry.py'],'controlsSha256':expected['controls.py'],
 'prefixReverseProof':True,'subjectAstSafetyEdits':False,'boundaryAttempts':ns['denied'],
 'actualTargetActions':0,'limitations':'Synthetic source/tool/controller/baseline authority; real SHA and literal banks/oracle. No host/shell/platform/timing/process-exit/resource/native qualification.'},indent=2))
