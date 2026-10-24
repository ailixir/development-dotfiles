"""Complete finite SOURCE02 native-projection pairs in actual Invocation.

Only the inspected flow model's invocation loop and own result filename/kind change.
Every controller/receiver/safety statement and persistent effect/audit guard is retained.
No actual native, Java, thread, socket or current-resource action is performed.
"""
import ast,hashlib,json
from pathlib import Path
HERE=Path(__file__).absolute().parent
raw=(HERE/'flow_checks.py').read_bytes()
prior=json.loads((HERE/'source01-manifest.json').read_bytes())
row=next(x for x in prior['files'] if x['path']=='flow_checks.py')
if hashlib.sha256(raw).hexdigest()!=row['sha256']:raise RuntimeError('EXACT_RETAINED_FLOW_MODEL')
tree=ast.parse(raw)
snippet='''
dispatch=[]
class Hostile:
    def __bool__(self):dispatch.append('bool');raise AssertionError('ARBITRARY_METHOD_DISPATCH')
    def __repr__(self):dispatch.append('repr');raise AssertionError('ARBITRARY_METHOD_DISPATCH')
    def __str__(self):dispatch.append('str');raise AssertionError('ARBITRARY_METHOD_DISPATCH')
    def get(self,*args):dispatch.append('get');raise AssertionError('ARBITRARY_METHOD_DISPATCH')
class HostileDict(dict):
    def __bool__(self):dispatch.append('dict_bool');raise AssertionError('ARBITRARY_METHOD_DISPATCH')
    def get(self,*args):dispatch.append('dict_get');raise AssertionError('ARBITRARY_METHOD_DISPATCH')
cases=('valid0','valid1','status_string','status_bool','status_huge','archive_string','archive_object',
    'wait_string','wait_false','work_false','descriptors_false','stdout_string','stderr_false',
    'request_string','request_wrong_hash','wrong_pid','pid_bool','mode_object','missing_key','extra_key',
    'truthy_list','empty_list','string_container','int_container','null_container','object_container','dict_subclass','foreign_key')
unknown_cases={'wait_string','wait_false','work_false','descriptors_false','wrong_pid','pid_bool',
    'truthy_list','empty_list','string_container','int_container','null_container','object_container','dict_subclass'}
schema_cases={'missing_key','extra_key','truthy_list','empty_list','string_container','int_container',
    'null_container','object_container','dict_subclass','foreign_key'}
for kind in cases:
    model=Model('parser');ordinary=Ordinary(model);original_wait=ordinary.wait;returned=[]
    def wait(process):
        value=original_wait(process)
        changes={'valid1':('nativeStatus',1),'status_string':('nativeStatus','SYNTHETIC_PRIVATE_STATUS_SENTINEL'),
            'status_bool':('nativeStatus',True),'status_huge':('nativeStatus',10**5000),
            'archive_string':('archiveSha256','SYNTHETIC_PRIVATE_ARCHIVE_SENTINEL'),'archive_object':('archiveSha256',Hostile()),
            'wait_string':('directWaited','SYNTHETIC_PRIVATE_WAIT_SENTINEL'),'wait_false':('directWaited',False),
            'work_false':('ownedWorkTerminated',False),'descriptors_false':('descriptorsClosed',False),
            'stdout_string':('stdoutComplete','SYNTHETIC_PRIVATE_STDOUT_SENTINEL'),'stderr_false':('stderrComplete',False),
            'request_string':('requestSha256','SYNTHETIC_PRIVATE_REQUEST_SENTINEL'),'request_wrong_hash':('requestSha256','0'*64),
            'wrong_pid':('directPid',124),'pid_bool':('directPid',True),'mode_object':('modeEvidence',Hostile())}
        if kind in changes:key,item=changes[kind];value[key]=item
        if kind=='missing_key':del value['archiveSha256']
        if kind=='extra_key':value['SYNTHETIC_PRIVATE_EXTRA_KEY']=Hostile()
        if kind=='foreign_key':value[Hostile()]=Hostile()
        if kind=='truthy_list':value=['SYNTHETIC_PRIVATE_LIST_SENTINEL']
        if kind=='empty_list':value=[]
        if kind=='string_container':value='SYNTHETIC_PRIVATE_CONTAINER_SENTINEL'
        if kind=='int_container':value=1
        if kind=='null_container':value=None
        if kind=='object_container':value=Hostile()
        if kind=='dict_subclass':value=HostileDict(value)
        returned.append(value);return value
    ordinary.wait=wait
    custody=types.SimpleNamespace(Ownership=K.Ownership,Custody=lambda path,mode=None,api=None,ownership=None:Directory(model,path,mode,ownership))
    custody.__source_sha256__=K.__source_sha256__
    boundary=types.SimpleNamespace(platform='darwin',clock=model.clock,uid=model.uid,event=model.event,thread=model.thread_factory,
        selector=model.selector,listener=model.listener,fd_metadata=model.fd_metadata)
    invocation=C.Invocation(ordinary,dict(custody=custody,relay=R,contract=P,controller=C),model,boundary)
    result=invocation.invoke(model.release_spec,model.decision_spec,model.control_spec,'/synthetic/output')
    serialized=json.dumps(result,allow_nan=False,sort_keys=True)
    check('TOTAL_SERIALIZABLE_CLOSED_RESULT_'+kind,'SYNTHETIC_PRIVATE' not in serialized)
    check('STATUS_ONLY_BOUNDED_INT_OR_NULL_'+kind,result['nativeStatus'] is None or type(result['nativeStatus']) is int and -2147483648<=result['nativeStatus']<2147483648)
    check('WAIT_ONLY_BOOL_OR_NULL_'+kind,result['nativeWaited'] is None or type(result['nativeWaited']) is bool)
    check('ARCHIVE_ONLY_HASH_OR_NULL_'+kind,result['nativeArchiveSha256'] is None or C.hash_value(result['nativeArchiveSha256']))
    check('CLOSED_PROJECTION_REASON_'+kind,result['nativeProjectionReason'] in ('NONE','ABSENT','SCHEMA','NATIVE_UNKNOWN'))
    check('ACTUAL_RETURN_AND_CAP_PRESERVED_'+kind,invocation.native is returned[0] and invocation.native_received is True and result['nativeResultReceived'] is True and result['attemptConsumed'] is True and ordinary.waits==1)
    if kind=='valid0':
        check('VALID_PENDING_QA_UNCHANGED',result['status']=='QUALIFICATION_EVIDENCE_COMPLETE_PENDING_QA_ROOT' and result['primaryReason']=='NONE' and result['nativeStatus']==0 and len(result['nativeArchiveSha256'])==64)
    else:
        expected='NATIVE_FAILED' if kind=='valid1' else 'SCHEMA' if kind in schema_cases else 'NATIVE_UNKNOWN'
        check('MALFORMED_OR_FAILED_STAYS_HOLD_'+kind,result['status']=='HOLD' and result['primaryReason']==expected)
    if kind in unknown_cases:
        check('UNKNOWN_DRAIN_RETAINED_'+kind,result['canonicalClosed'] is False and result['cleanupReason']=='CLEANUP_UNCONFIRMED' and result['nativeDrainState']=='UNKNOWN' and invocation in C.RETAINED and bool(invocation.ownership.blockers()))
        check('ACTUAL_PROCESS_REFERENCE_RETAINED_'+kind,invocation.process is ordinary.process and invocation.process_token['fd'] is ordinary.process)
    else:
        check('INDEPENDENT_KNOWN_DRAIN_PRESERVED_'+kind,result['canonicalClosed'] is True and result['cleanupReason']=='NONE' and result['nativeWaited'] is True and result['nativeDrainState']=='CONFIRMED')
    if kind in ('status_string','status_bool','status_huge'):check('INVALID_STATUS_NULL_'+kind,result['nativeStatus'] is None)
    if kind in ('archive_string','archive_object','missing_key'):check('INVALID_ARCHIVE_NULL_'+kind,result['nativeArchiveSha256'] is None)
    if kind=='wait_string':check('INVALID_WAIT_NULL',result['nativeWaited'] is None)
    if kind=='wait_false':check('KNOWN_FALSE_WAIT_PRESERVED',result['nativeWaited'] is False)
    before=list(model.sequence)
    try:invocation.invoke(model.release_spec,model.decision_spec,model.control_spec,'/synthetic/output')
    except C.Hold:check('CAP_NEVER_RESET_'+kind,ordinary.waits==1 and model.sequence==before)
    else:check('CAP_NEVER_RESET_'+kind,False)
    CASES.append(dict(name=kind,result=result))
check('NO_ARBITRARY_UPSTREAM_METHODS',dispatch==[])
'''
replaced=0;renamed=0
for node in ast.walk(tree):
    if isinstance(node,ast.With):
        for child in list(node.body):
            if isinstance(child,ast.For) and isinstance(child.target,ast.Name) and child.target.id=='kind':
                index=node.body.index(child);node.body[index:index+1]=ast.parse(snippet).body;replaced+=1
for node in ast.walk(tree):
    if isinstance(node,ast.Constant) and node.value=='flow-check-results.json':node.value='projection02-check-results.json';renamed+=1
    if isinstance(node,ast.Constant) and node.value=='EXACT_CONTROLLER_SYNTHETIC_COOPERATIVE_FLOW':node.value='SOURCE02_TOTAL_NATIVE_PROJECTION_ACTUAL_INVOCATION_PAIRS'
if replaced!=1 or renamed!=2:raise RuntimeError('ONLY_FIXED_CASE_LOOP_AND_OWN_OUTPUT_ADAPTATION')
ast.fix_missing_locations(tree)
exec(compile(tree,'<exact guarded model with finite NativeWait pairs>','exec'),dict(__file__=str(HERE/'flow_checks.py'),__name__='_source02_projection_pairs'))
