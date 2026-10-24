"""Actual phase positive/failure pair with all OS/child effects in inspected fakes.
No required suite replay. Same actual phase checks and ledger logic; only fake OS
write to the first direct-Popen encounter fails in the adverse case.
"""
import ast,builtins,collections,copy,datetime,errno,fcntl,hashlib,json,os,pathlib,re,stat,subprocess,sys,time,types
S=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume8');raw=(S/'controls.py').read_bytes()
assert hashlib.sha256(raw).hexdigest()=='4a4337827bf275acb2ac47ff4307e17172e7b6030caaec8dd7d63e1dd492e72f'
tree=ast.parse(raw);cut=next(n.lineno for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='whole' for t in n.targets))
sys.argv=['pair.py','fa0e8d03cc75f5c855034dd4fe21f09e3bb924c230198a39f47eabb50ef65b97','a1b078b9d8832c78b18ef55c23adea6cab079aa79f9a530a79906a30fc44d26a']
ns={'__file__':str(S/'controls.py'),'__name__':'_qa_definitions_only'};exec(compile('\n'.join(raw.decode().splitlines()[:cut-1]),'<exact-author-definition-prefix>','exec'),ns)
h=lambda b:hashlib.sha256(b).hexdigest()
results=[]
for fail in (False,True):
 m=ns['Model']();ctx=m.context('capture');assert m.ns['capture'](ctx,m.proposal,h(m.ns['encoded'](m.proposal)),'--same-shell-once-consumed')==0;ctx.owner.finish();m.completion('capture');m.release()
 ctx=m.context('negative');assert m.ns['negative_operation'](ctx)==1;ctx.owner.finish()
 m.document('negative-exit.root-status.json',m.ns['claim'](actualNegativeStatus=1,separatelyCaptured=True,sameOriginalHeldShell=True,authorizedBy='root',denialSha256=h(m.nodes[str(m.E/'negative-exit.denial.json')]['data'])))
 ctx=m.context('held-proof');assert m.ns['held_operation'](ctx)==0;ctx.owner.finish();m.completion('held-proof')
 m.document('guard-admission.json',m.ns['claim'](negativeExitActualStatus=1,heldProofActualStatus=0,readonlyParentGuardInspected=True,authorizedBy='root',heldProofSha256=h(m.nodes[str(m.E/'held-proof.json')]['data']),negativeStatusSha256=h(m.nodes[str(m.E/'negative-exit.root-status.json')]['data'])))
 for phase,previous in [('prepare',[]),('red',['prepare'])]:
  m.document(phase+'.root-decision.json',m.ns['claim'](authorized=True,phase=phase,releaseSha256=h(m.nodes[str(m.E/'root-authorization.json')]['data']),precedingReceipts={p:h(m.nodes[str(m.E/(p+'.receipt.json'))]['data']) for p in previous}))
  ctx=m.context(phase)
  if phase=='red':
   native=[];realpopen=m.subprocess.Popen
   def popen(command,**kwargs):
    child=realpopen(command,**kwargs)
    if 'vitest.mjs' in ' '.join(command):native.append(child)
    return child
   m.subprocess.Popen=popen
   realwrite=m.os.write
   def write(fd,b):
    if fail and m.live(fd)['path']==str(m.E/'red.samples.jsonl') and b'"kind":"DIRECT_POPEN_ENCOUNTER_BEFORE_DETAIL"' in b:raise OSError('FAKE_LEDGER_IO_FAILURE')
    return realwrite(fd,b)
   m.os.write=write
  code=m.ns['phase_operation'](ctx,phase);ctx.owner.finish()
  if phase=='prepare':assert code==0;m.completion(phase)
 receipt=m.json('red.receipt.json');journal=m.json('red.journal.json');ledger=m.nodes[str(m.E/'red.samples.jsonl')]['data']
 assert len(native)==1 and m.native_waits==1 and ctx.owner.waited[id(native[0])] is True
 serialized=json.dumps({'receipt':receipt,'journal':journal})
 if fail:
  assert code==1 and receipt['accepted'] is False and receipt['failureCode']=='PHASE_CONTROL_FAILURE'
  assert b'DIRECT_POPEN_ENCOUNTER_BEFORE_DETAIL' not in ledger and 'directWaitRecord' not in receipt and 'runnerCompletion' not in receipt
 else:assert code==0 and receipt['directWaitRecord']['terminalWaitConfirmed'] is True
 results.append({'case':'native-first-encounter-write-failure' if fail else 'positive-native-phase','collectorExit':code,'accepted':receipt['accepted'],'nativePid':native[0].pid,'actualFakeHandleWaitConfirmed':ctx.owner.waited[id(native[0])],'nativeWaits':m.native_waits,'durableDirectWaitRecord':receipt.get('directWaitRecord'),'durableRunnerCompletion':receipt.get('runnerCompletion'),'journalFields':sorted(journal),'directEncounterPersisted':b'DIRECT_POPEN_ENCOUNTER_BEFORE_DETAIL' in ledger,'ownerFinishReturnedNormally':True,'failureCode':receipt.get('failureCode'),'actualActions':0})
assert ns['denied']==[]
print(json.dumps({'kind':'ACTUAL_NATIVE_PHASE_DURABLE_FAILURE_SINK_PAIR','results':results,'boundaryAttempts':ns['denied'],'actualActions':0,'subjectSafetyStatementsRemoved':False,'adaptation':'Definitions only; ordinary fake predecessor setup. Adverse fake OS write fails first native encounter, all actual phase/wait/publication logic unchanged.'},indent=2))
