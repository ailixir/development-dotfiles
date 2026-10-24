"""Combined exact-six source regression suite. Inspect before executing.

Loads the unchanged-audit definition prefix of the current controls, excluding
only its suite invocation. No subject AST or safety statement is instrumented.
Source/tool/controller/baseline byte authority remains the declared synthetic
fixture domain. Real SHA logic and literal banks/native oracle remain unchanged.
"""
import ast,builtins,collections,copy,datetime,errno,fcntl,hashlib,json,os,pathlib,re,stat,subprocess,sys,time,types
D=pathlib.Path(__file__).parent
control_raw=(D/'controls.py').read_bytes()
runtime_raw=(D/'runtime.py').read_bytes()
entry_raw=(D/'entry.py').read_bytes()
if len(sys.argv)!=3 or hashlib.sha256(runtime_raw).hexdigest()!=sys.argv[1] or hashlib.sha256(entry_raw).hexdigest()!=sys.argv[2]:
    raise ValueError('EXTERNAL_CURRENT_SOURCE_PINS_BEFORE_INTERPRETATION')
tree=ast.parse(control_raw)
cut=next(n.lineno for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='whole' for t in n.targets))
prefix='\n'.join(control_raw.decode().splitlines()[:cut-1])+'\n'
# The prefix is byte-exact; the reverse proof reconstructs the complete harness.
if (prefix+'\n'.join(control_raw.decode().splitlines()[cut-1:])+'\n').encode()!=control_raw:
    raise ValueError('PREFIX_REVERSE_PROOF')
ns={'__file__':str(D/'controls.py'),'__name__':'_source9_definition_prefix'}
exec(compile(prefix,'<exact-current-definition-prefix>','exec'),ns)
Model=ns['Model'];check=ns['check'];rejects=ns['rejects']
h=lambda b:hashlib.sha256(b).hexdigest()
whole=ns['run_whole']()
whole_checks=len(ns['RESULTS'])
cases=[]
serial=[11000]


def cloned(nodes):
    m=Model();m.nodes=copy.deepcopy(nodes);m.clock=whole.clock
    serial[0]+=1;m.pid=serial[0];m.next_ino=max(n['ino'] for n in m.nodes.values())+1
    return m


def author(m,name,document):
    request={'operation':'author-control','packetManifestSha256':'a'*64,'authorizedBy':'root',
        'purpose':'ROOT_AUTHOR_REQUEST','role':'ROOT_ATTESTATION_AUTHOR_ONLY','outputName':name,
        'runtimeIdentity':{'dev':1,'ino':m.nodes[str(m.E)]['ino']},'document':document}
    ctx=m.context('author-control',request)
    return m.ns['author_control'](ctx),ctx


# Complete per-role positives and missing/mistyped pairs use actual workflow
# checkpoints. No completed operation is reset or backfilled by subject code.
families=[('root-authorization.json','canonicalPythonRoles','authorized',1),
    *[(p+'.root-decision.json','releaseSha256','authorized',1) for p in ns['Model']().ns['PHASES']],
    ('capture.actual-completion.json','actualToolReference','actualCollectorExit',False),
    ('owner-ruling-Aria.json','independentCodeReviewPins','profileAuthorized',1),
    ('owner-ruling-Quinn.json','independentCodeReviewPins','profileAuthorized',1),
    ('owner-ruling-root.json','independentCodeReviewPins','profileAuthorized',1),
    ('negative-exit.root-status.json','denialSha256','actualNegativeStatus',True),
    ('guard-admission.json','heldProofActualCompletionSha256','heldProofActualStatus',False),
    ('actual-qa-review.json','immutableTuple','mandatoryFindings',{}),
    ('actual-review.root-adoption.json','actualQaReviewSha256','actualPhaseAndArchiveQaAdopted',1),
    ('close.root-permit.json','readinessSha256','actualFinalStatus',False),
    ('actual-wrapper.root-result.json','gateActualCompletionSha256','actualWrapperExit',False)]
for name,missing,mistyped,bad in families:
    document=whole.json(name)
    checkpoint=whole.author_checkpoints[name]
    m=cloned(checkpoint);code,ctx=author(m,name,copy.deepcopy(document));ctx.owner.finish()
    check('FACTORY_VALID_'+name,code==0 and m.json(name)==document)
    for kind in ('missing','wrong-type','claim-only'):
        m=cloned(checkpoint)
        value=copy.deepcopy(document)
        if kind=='missing':del value[missing]
        elif kind=='wrong-type':value[mistyped]=bad
        else:value=m.ns['claim']()
        before=len(m.writes)
        rejects('FACTORY_'+kind.upper().replace('-','_')+'_'+name,lambda:author(m,name,value))
        check('FACTORY_ZERO_WRITE_'+kind+'_'+name,len(m.writes)==before and str(m.E/name) not in m.nodes)
    cases.append({'family':name,'completePositive':True,'missingAndWrongTypeBeforeWrite':True,'claimOnlyDenied':True})

m=cloned(whole.operation_checkpoints['postclose'])
code,ctx=author(m,'postclose.entry.json',{'operation':'postclose'});ctx.owner.finish()
check('FACTORY_VALID_OPERATION_ENTRY',code==0)
for document in ({},{'operation':True},{'operation':'red'}):
    m=cloned(whole.operation_checkpoints['postclose']);before=len(m.writes)
    rejects('FACTORY_BAD_OPERATION_'+str(document),lambda:author(m,'postclose.entry.json',document))
    check('FACTORY_BAD_OPERATION_ZERO_WRITE_'+str(document),len(m.writes)==before)

# Complete pending factory and the exact two missing fields from both reviewers,
# plus required role/tool/owner fields and mistyped pairs before any E mutation.
pending_fields=('directoryRoots','nodeCanonicalPath','helmCanonicalPath','nodeSha256','helmSha256',
    'dependenciesRealpath','safeEnvironment','boundBasePath','canonicalPythonRoles',
    'independentCodeReviewPins','pendingOwnerRulingRefs','previousFailedUnitClosure')
m=Model();ctx=m.context('capture')
m.ns['authorization_factory'](ctx,m.proposal['proposedAuthorization'],pending=True)
check('PENDING_COMPLETE_FACTORY_NO_PHYSICAL_FACTS',str(m.E) not in m.nodes)
for field in pending_fields:
    for kind in ('missing','wrong-type'):
        m=Model();ctx=m.context('capture');proposal=copy.deepcopy(m.proposal)
        if kind=='missing':del proposal['proposedAuthorization'][field]
        else:proposal['proposedAuthorization'][field]=False
        before=len(m.writes)
        rejects('PENDING_'+kind.upper().replace('-','_')+'_'+field,lambda:m.ns['capture'](ctx,proposal,h(m.ns['encoded'](proposal)),'--same-shell-once-consumed'))
        check('PENDING_ZERO_E_MUTATION_'+kind+'_'+field,len(m.writes)==before and str(m.E) not in m.nodes)
for field in ('holdFileSha256','candidateBaselineSha256','dependencyInventory','distModes','auxModes','actualFreshToolVersions','ownerRulingPins'):
    m=Model();ctx=m.context('capture');proposal=copy.deepcopy(m.proposal)
    proposal['proposedAuthorization'][field]='INVENTED_PRECREATION_FACT'
    rejects('PENDING_DERIVED_NOT_INVENTED_'+field,lambda:m.ns['capture'](ctx,proposal,h(m.ns['encoded'](proposal)),'--same-shell-once-consumed'))
    check('PENDING_DERIVED_ZERO_WRITE_'+field,str(m.E) not in m.nodes)

# Same-hash metadata is rejected on the acquired FD before target bytes.
for mode,uid,links,good in ((0o600,501,1,True),(0o644,501,1,False),(0o600,777,1,False),(0o600,501,2,False)):
    m=cloned(whole.pre_gate_nodes);target=str(m.E/'candidate-baseline.json')
    m.nodes[target]['mode']=mode;original_info=m.info;original_read=m.os.read;reads=[]
    def info(path):
        result=original_info(path)
        if path==target:result.st_uid=uid;result.st_nlink=links
        return result
    def read(fd,count):
        result=original_read(fd,count)
        if m.live(fd)['path']==target:reads.append(len(result))
        return result
    m.info=info;m.os.read=read;ctx=m.context('final')
    if good:
        m.ns['bind_entry'](ctx);check('CONTROL_PRIVATE_METADATA_POSITIVE',sum(reads)>0)
    else:
        rejects('CONTROL_METADATA_DENY_'+str((mode,uid,links)),lambda:m.ns['bind_entry'](ctx))
        check('CONTROL_METADATA_BEFORE_TARGET_BODY_'+str((mode,uid,links)),sum(reads)==0)

# Bootstrap root-authority and operational-entry metadata uses its own exact
# acquired-FD guard; public source policy remains separately0644.
for optimize in (0,1):
    m=Model(optimize);ens={'__builtins__':m.builtins,'__name__':'_entry_metadata_unit'}
    exec(compile(entry_raw,'<actual-source9-bootstrap>', 'exec',optimize=optimize),ens)
    m.file('/model/exterior-root.json',b'{}',0o600)
    check('BOOT_PRIVATE_POSITIVE_O'+str(optimize),ens['bootstrap_read'](m.P('/model/exterior-root.json'),h(b'{}'))==b'{}')
    m.nodes['/model/exterior-root.json']['mode']=0o644
    rejects('BOOT_PRIVATE_SAMEHASH_MODE_DENY_O'+str(optimize),lambda:ens['bootstrap_read'](m.P('/model/exterior-root.json'),h(b'{}')))
    check('BOOT_PUBLIC_SEPARATE_POLICY_O'+str(optimize),ens['bootstrap_read'](m.P('/model/exterior-root.json'),h(b'{}'),0o644)==b'{}')

# Exact4+4/cap10 and stale1->8+8 inventory counterexample. Only budget constants
# are reduced; actual enumeration/open/read/accounting safety statements run.
for grow in (False,True):
    m=Model();ctx=m.context('capture');m.directory('/model/inventory')
    for name in ('a','b'):m.file('/model/inventory/'+name,b'x' if grow else b'1234',0o644)
    realBudget=m.ns['Budget'];m.ns['Budget']=lambda **kw:realBudget(entries=8,total=10,per_file=10)
    opened=m.os.open;read=m.os.read;consumed=[]
    def opener(path,flags,mode=0o600,dir_fd=None):
        full=m.path(path,dir_fd)
        if grow and full in ('/model/inventory/a','/model/inventory/b'):
            m.nodes[full]['data']=b'12345678';m.nodes[full]['mtime']+=1
        return opened(path,flags,mode,dir_fd)
    def reader(fd,count):
        result=read(fd,count)
        if m.live(fd)['path'].startswith('/model/inventory/'):consumed.append(len(result))
        return result
    m.os.open=opener;m.os.read=reader
    if grow:
        rejects('INVENTORY_STALE_GROWTH_DENIED_BEFORE_BODY',lambda:m.ns['inventory'](ctx,m.P('/model/inventory')))
        check('INVENTORY_GROWTH_NO16_BYTE_ACQUISITION',sum(consumed)==0)
    else:
        rows=m.ns['inventory'](ctx,m.P('/model/inventory'))
        check('INVENTORY_4_PLUS4_CAP10_POSITIVE',sum(consumed)==8 and sum(r['bytes'] for r in rows)==8)
    ctx.owner.finish()

# Persist previously sampled relevance across reparenting and another operation;
# no observed PID/start/argv/image is promoted to authenticated identity.
m=Model();m.directory(m.E);ctx=m.context('capture');ctx.start_segment('relation')
node=b'MODEL_ATTRIBUTED_NODE';helper=b'MODEL_OBSERVED_HELPER'
m.file('/model/tool/node',node,0o755);m.file('/model/tool/helper',helper,0o755)
ctx.release={'nodeSha256':h(node)}
m.rows_extra[777]={'pid':777,'ppid':m.pid,'start':'Mon Oct 19 12:00:02 2026','command':'/model/tool/node','comm':'/model/tool/node'}
m.rows_extra[778]={'pid':778,'ppid':777,'start':'Mon Oct 19 12:00:03 2026','command':'/model/tool/helper','comm':'/model/tool/helper'}
C=m.ns['load_core'](ctx,m.proposal);launch={'pid':777,'launchId':'red'}
first=m.ns['sample'](ctx,C,[launch])
check('RELEVANCE_INITIAL_RELATED_HELPER',next(r for r in first['currentSampleStates'] if r['pid']==778)['state']=='CURRENT_ATTRIBUTED_WORK_OR_REUSE_AMBIGUITY')
del m.rows_extra[777];m.rows_extra[778]['ppid']=1
rejects('REPARENTED_SAME_LEGACY_HELPER_CURRENT_HOLD',lambda:m.ns['boundaries'](ctx,C,[launch]))
segment=ctx.finish_segment();m.ns['publish_journal'](ctx,'relation',segment)
nextctx=m.context('archive');nextctx.release={'nodeSha256':h(node)}
nextctx.control_raw={'relation.journal.json':m.nodes[str(m.E/'relation.journal.json')]['data']}
m.ns['restore_sample_history'](nextctx);nextctx.start_segment('next-operation')
C=m.ns['load_core'](nextctx,m.proposal)
rejects('REPARENTING_RELEVANCE_SURVIVES_OPERATION',lambda:m.ns['boundaries'](nextctx,C))
check('RELEVANCE_RETAINED_NOT_STRONG_IDENTITY',bool(nextctx.relevance_history) and all(r['identityAuthenticated'] is False for r in nextctx.relevance_history))


def before_red(m):
    ctx=m.context('capture');m.ns['capture'](ctx,m.proposal,h(m.ns['encoded'](m.proposal)),'--same-shell-once-consumed');ctx.owner.finish();m.completion('capture');m.release()
    ctx=m.context('negative');m.ns['negative_operation'](ctx);ctx.owner.finish()
    m.document('negative-exit.root-status.json',m.ns['claim'](actualNegativeStatus=1,separatelyCaptured=True,sameOriginalHeldShell=True,authorizedBy='root',denialSha256=h(m.nodes[str(m.E/'negative-exit.denial.json')]['data'])))
    ctx=m.context('held-proof');m.ns['held_operation'](ctx);ctx.owner.finish();m.completion('held-proof')
    m.document('guard-admission.json',m.ns['claim'](negativeExitActualStatus=1,heldProofActualStatus=0,readonlyParentGuardInspected=True,authorizedBy='root',heldProofSha256=h(m.nodes[str(m.E/'held-proof.json')]['data']),negativeStatusSha256=h(m.nodes[str(m.E/'negative-exit.root-status.json')]['data'])))
    m.document('prepare.root-decision.json',m.ns['claim'](authorized=True,phase='prepare',releaseSha256=h(m.nodes[str(m.E/'root-authorization.json')]['data']),precedingReceipts={}))
    ctx=m.context('prepare');code=m.ns['phase_operation'](ctx,'prepare');ctx.owner.finish()
    if code!=0:raise ValueError('NATIVE_PAIR_PREPARE_FAILED')
    m.completion('prepare')
    m.document('red.root-decision.json',m.ns['claim'](authorized=True,phase='red',releaseSha256=h(m.nodes[str(m.E/'root-authorization.json')]['data']),precedingReceipts={'prepare':h(m.nodes[str(m.E/'prepare.receipt.json')]['data'])}))
    return m.context('red')


# Actual phase and actual entry fallthrough sink, including ledger and E sinks.
for fail,sink_fail in ((False,False),(True,False),(True,True)):
    m=Model();ctx=before_red(m);messages=[]
    m.ns['print']=lambda text:messages.append(text)
    ens={'__builtins__':dict(m.builtins,print=lambda text,**kw:messages.append(text)),'__name__':'_actual_entry_sink'}
    exec(compile(entry_raw,'<actual-source9-entry-sink>','exec'),ens)
    real_write=m.os.write
    def writer(fd,raw):
        path=m.live(fd)['path']
        if fail and path==str(m.E/'red.samples.jsonl') and b'"kind":"DIRECT_POPEN_ENCOUNTER_BEFORE_DETAIL"' in raw:
            raise OSError('FAKE_LEDGER_IO_FAILURE')
        if sink_fail and path in (str(m.E/'red.journal.json'),str(m.E/'red.receipt.json')):
            raise OSError('FAKE_E_SINK_UNAVAILABLE')
        return real_write(fd,raw)
    m.os.write=writer
    code=ens['execute_context'](ctx,m.ns['dispatch'])
    if not fail:
        check('NATIVE_PHASE_POSITIVE_DURABLE_WAIT',code==0 and m.json('red.receipt.json')['directWaitRecord']['terminalWaitConfirmed'] is True)
        check('NATIVE_POSITIVE_NO_FAILURE_FALLBACK',messages==[])
    else:
        emitted=[json.loads(s) for s in messages if json.loads(s).get('kind')=='BOUNDED_NATIVE_OPERATOR_FAILURE_LINEAGE']
        check('NATIVE_HANDLED_FAILURE_COLLECTOR1_'+str(sink_fail),code==1 and len(emitted)==1)
        record=emitted[0]['nativeAttemptRecords'][0]
        check('NATIVE_KNOWN_PID_REQUEST_AND_ONCE_WAIT_'+str(sink_fail),type(record['actualPid']) is int
            and len(record['requestSha256'])==64 and len(record['waitRecords'])==1
            and record['waitRecords'][0]['kind']=='FALLBACK_WAIT'
            and record['directWaitRecord']['terminalWaitConfirmed'] is True and m.native_waits==1)
        check('NATIVE_OPERATOR_FALLBACK_BOUND_NO_RAW_'+str(sink_fail),len(messages[0].encode())<=65536
            and 'MODEL_NATIVE_OUTPUT' not in messages[0] and 'FAKE_LEDGER_IO_FAILURE' not in messages[0])
        if not sink_fail:
            receipt=m.json('red.receipt.json');journal=m.json('red.journal.json')
            check('NATIVE_HANDLED_FAILURE_DURABLE_RECEIPT_AND_JOURNAL',receipt['accepted'] is False
                and receipt['nativeAttemptRecords'][0]['actualPid']==record['actualPid']
                and journal['nativeAttemptRecords'][0]['directWaitRecord']['terminalWaitConfirmed'] is True)

check('SIX_FIX_PERSISTENT_AUDIT_NO_REAL_BOUNDARIES',ns['denied']==[])
print(json.dumps({'kind':'SOURCE9_COMBINED_SIX_CATEGORY_GUARDED_CONTROLS','checks':len(ns['RESULTS']),
    'wholeFlowChecks':whole_checks,'newTargetedChecks':len(ns['RESULTS'])-whole_checks,'results':ns['RESULTS'],
    'factoryFamilies':cases,'wholeFlowSemanticIdsReexecutedNotNew':True,
    'runtimeSha256':h(runtime_raw),'entrySha256':h(entry_raw),'prefixReverseProof':True,
    'subjectAstSafetyStatementEdits':False,'actualOsToolNativeProviderPrivateActions':0,
    'boundaryAttempts':ns['denied'],'limitations':'Synthetic source/tool/controller/baseline authority; no installed-host, timing, shell, orphan/exit or stronger identity proof.'},indent=2))
