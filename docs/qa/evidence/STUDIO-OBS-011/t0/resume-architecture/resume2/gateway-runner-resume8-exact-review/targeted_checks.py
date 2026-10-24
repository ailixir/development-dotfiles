"""Whole actual source flow and bounded independent concern pairs, synthetic effects only.

Model authority substitutes disclosed source/tool/controller/baseline bytes; actual runtime,
entry, report assessor, bank bytes and all safety statements are unchanged. No AST edits.
"""
import ast,builtins,collections,copy,datetime,errno,fcntl,hashlib,io,json,os,pathlib,re,stat,subprocess,sys,time,types
D=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume8').absolute()
O=pathlib.Path(__file__).absolute().parent
runtime_raw=(D/'runtime.py').read_bytes();entry_raw=(D/'entry.py').read_bytes();control_raw=(D/'controls.py').read_bytes()
if hashlib.sha256(runtime_raw).hexdigest()!='fa0e8d03cc75f5c855034dd4fe21f09e3bb924c230198a39f47eabb50ef65b97' or hashlib.sha256(entry_raw).hexdigest()!='a1b078b9d8832c78b18ef55c23adea6cab079aa79f9a530a79906a30fc44d26a' or hashlib.sha256(control_raw).hexdigest()!='4a4337827bf275acb2ac47ff4307e17172e7b6030caaec8dd7d63e1dd492e72f':raise ValueError('EXACT_SOURCE_PINS_REQUIRED')
external=json.loads((D/'external-inputs.json').read_bytes());buffers={'scope.json':(D/'scope.json').read_bytes()}
for name,row in external['files'].items():
    raw=pathlib.Path(row['path']).read_bytes()
    if hashlib.sha256(raw).hexdigest()!=row['sha256']:raise ValueError('STATIC_PIN_CHANGED')
    buffers[name]=raw
PRELOADED={name:sys.modules[name] for name in ('ast','collections','datetime','errno','fcntl','hashlib','json','os','pathlib','re','stat','subprocess','sys','time','types')}
checks=[];cases=[];denied=[]
def check(name,ok):
    if ok is not True:raise ValueError('CHECK_FAILED_'+name)
    checks.append(dict(name=name,passed=True))
def audit(event,args):
    if event=='open':
        name,mode,flags=args
        if type(name) is str and name==str(O/'targeted-checks.json') and (('w' in str(mode)) or flags&os.O_WRONLY):return
        denied.append(event);raise RuntimeError('REAL_BOUNDARY_DENIED')
    if event.startswith(('os.','subprocess.','socket.','ctypes.','fcntl.','_thread.')):denied.append(event);raise RuntimeError('REAL_BOUNDARY_DENIED')
tree=ast.parse(control_raw)
tree.body=[n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='Model' or isinstance(n,ast.FunctionDef) and n.name=='run_whole']
# Exact model and complete whole-flow function; no safety or subject node changed.
compiled=compile(tree,'<sealed synthetic Model and whole-flow definitions>','exec')
sys.addaudithook(audit)
exec(compiled,globals())
whole=run_whole()
whole_count=len(checks)

def fresh_author(document,name):
    model=Model();model.directory(model.E)
    entry=dict(operation='author-control',packetManifestSha256='a'*64,authorizedBy='root',role='ROOT_ATTESTATION_AUTHOR_ONLY',outputName=name,runtimeIdentity={'dev':1,'ino':model.nodes[str(model.E)]['ino']},document=document)
    ctx=model.context('author-control',entry)
    status=model.ns['author_control'](ctx);ctx.owner.finish()
    return model,status
for name in ('root-authorization.json','red.root-decision.json','close.root-permit.json'):
    model=Model();minimal=model.ns['claim']()
    authored,status=fresh_author(minimal,name)
    check('claim-only document written '+name,status==0 and authored.json(name)==minimal)
    cases.append(dict(case='incomplete-author-document',name=name,status=status,requiredDocumentFactsAbsent=True,written=True))
release=whole.json('root-authorization.json')
authored,status=fresh_author(release,'root-authorization.json')
check('full fixture root release pair preserved',status==0 and authored.json('root-authorization.json')==release)
cases.append(dict(case='full-fixture-author-document',status=status,written=True,productionAuthority=False))

for missing in ('directoryRoots','nodeCanonicalPath'):
    model=Model();ctx=model.context('capture');proposal=copy.deepcopy(model.proposal)
    del proposal['proposedAuthorization'][missing];raw=model.ns['encoded'](proposal);caught=False
    try:model.ns['capture'](ctx,proposal,hashlib.sha256(raw).hexdigest(),'--same-shell-once-consumed')
    except (ValueError,KeyError):caught=True
    e_mutations=[x for x in model.writes if x[1]==str(model.E) or x[1].startswith(str(model.E)+'/')]
    check('malformed factory fails only after E mutation '+missing,caught and bool(e_mutations) and str(model.E/'hold.json') in model.nodes)
    check('malformed factory no native '+missing,model.native_calls==0)
    cases.append(dict(case='capture-missing-proposed-input',missing=missing,denied=True,EWriteCount=len(e_mutations),holdExists=True,nativeCalls=0))

for mode,uid in ((0o600,501),(0o644,501),(0o600,777)):
    model=Model();model.nodes=copy.deepcopy(whole.pre_gate_nodes);model.pid=5000
    model.next_ino=max(n['ino'] for n in model.nodes.values())+1
    path=str(model.E/'candidate-baseline.json');model.nodes[path]['mode']=mode
    original_info=model.info
    def changed_info(name):
        info=original_info(name)
        if name==path:info.st_uid=uid
        return info
    model.info=changed_info;ctx=model.context('final')
    status=model.ns['bind_entry'](ctx);ctx.owner.finish()
    check('unchanged raw control binds despite mode/owner '+str((mode,uid)),status['authorized'] is True and 'candidate-baseline.json' in ctx.control_raw)
    cases.append(dict(case='control-metadata',mode=mode,uid=uid,entryBindingAccepted=True,rawHashUnchanged=True))

model=Model();model.directory(model.E);ctx=model.context('capture');ctx.start_segment('relation')
node=b'MODEL_ATTRIBUTED_NODE';helper=b'MODEL_OBSERVED_HELPER'
model.file('/model/tool/node',node,0o755);model.file('/model/tool/helper',helper,0o755)
ctx.release={'nodeSha256':hashlib.sha256(node).hexdigest()}
model.rows_extra[777]={'pid':777,'ppid':model.pid,'start':'Mon Oct 19 12:00:02 2026','command':'/model/tool/node','comm':'/model/tool/node'}
model.rows_extra[778]={'pid':778,'ppid':777,'start':'Mon Oct 19 12:00:03 2026','command':'/model/tool/helper','comm':'/model/tool/helper'}
launch={'pid':777,'launchId':'red'};C=model.ns['load_core'](ctx,model.proposal)
initial=model.ns['sample'](ctx,C,[launch])
check('initial sampled descendant is current relevant work',next(x for x in initial['currentSampleStates'] if x['pid']==778)['state']=='CURRENT_ATTRIBUTED_WORK_OR_REUSE_AMBIGUITY')
del model.rows_extra[777];model.rows_extra[778]['ppid']=1
proof=model.ns['boundaries'](ctx,C,[launch])
check('known sampled child reparented is accepted unrelated',all(next(x for x in p['currentSampleStates'] if x['pid']==778)['state']=='UNRELATED_SAMPLED_NOT_OWNED' for p in proof))
check('same legacy child remains currently present',model.rows_extra[778]['start']=='Mon Oct 19 12:00:03 2026')
cases.append(dict(case='previously-related-live-child-reparented',initialState='CURRENT_ATTRIBUTED_WORK_OR_REUSE_AMBIGUITY',laterState='UNRELATED_SAMPLED_NOT_OWNED',twoBoundariesAccepted=True,childStillPresent=True,legacyStartUnchanged=True))
check('persistent audit zero real calls',denied==[])
result=dict(count=len(checks),checks=checks,wholeFlowChecks=whole_count,targetedCases=cases,caseCount=len(cases),sourceAstEdited=False,actualActions=0,boundaryAttempts=denied,modelLimit='Synthetic1808/506/source238dist/tool/controller/baseline authority; exact unchanged runtime/entry/banks/report assessor; no actual FD/OS/readonly-shell/native/resource proof.')
(O/'targeted-checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(checks=len(checks),wholeFlowChecks=whole_count,cases=len(cases),actualActions=0)))
