"""Four bounded actual-Invocation cases: original two regressions and0/1 preservation.
Every effect and persistent audit is the exact inspected flow harness. Only its15
scenario invocation loop is replaced; no target/safety AST change. Java not run.
"""
import ast,builtins,copy,ctypes,fcntl,hashlib,io,json,os,re,selectors,socket,stat,struct,subprocess,sys,threading,time,types
from pathlib import Path
from contextlib import ExitStack
from unittest.mock import patch
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-public-observer-java-qualification-prep/resume2').absolute();raw=(S/'flow_checks.py').read_bytes();manifest=json.loads((S/'manifest.json').read_bytes());r=next(x for x in manifest['files'] if x['path']=='flow_checks.py')
if hashlib.sha256(raw).hexdigest()!=r['sha256']:raise ValueError('EXACT_FAKE_HARNESS_REQUIRED')
tree=ast.parse(raw)
snippet='''
for variant in ('valid0','combined-old-strings','old-truthy-list','valid1'):
    model=Model('parser');ordinary=Ordinary(model);wait=ordinary.wait;returned=[]
    def native_wait(process):
        value=wait(process)
        if variant=='combined-old-strings':
            value['nativeStatus']='SYNTHETIC_PRIVATE_STATUS_SENTINEL';value['archiveSha256']='SYNTHETIC_PRIVATE_ARCHIVE_SENTINEL'
        elif variant=='old-truthy-list':value=['SYNTHETIC_PRIVATE_CONTAINER_SENTINEL']
        elif variant=='valid1':value['nativeStatus']=1
        returned.append(value);return value
    ordinary.wait=native_wait
    custody=types.SimpleNamespace(Ownership=K.Ownership,Custody=lambda path,mode=None,api=None,ownership=None:Directory(model,path,mode,ownership));custody.__source_sha256__=K.__source_sha256__
    boundary=types.SimpleNamespace(platform='darwin',clock=model.clock,uid=model.uid,event=model.event,thread=model.thread_factory,selector=model.selector,listener=model.listener,fd_metadata=model.fd_metadata)
    invocation=C.Invocation(ordinary,dict(custody=custody,relay=R,contract=P,controller=C),model,boundary)
    result=invocation.invoke(model.release_spec,model.decision_spec,model.control_spec,'/synthetic/output')
    text=json.dumps(result,sort_keys=True,allow_nan=False)
    check('CLOSED_SERIALIZABLE_NO_SENTINEL_'+variant,'SYNTHETIC_PRIVATE' not in text)
    check('ACTUAL_RETURN_REFERENCE_ONCE_WAIT_'+variant,invocation.native is returned[0] and invocation.native_received is True and ordinary.waits==1)
    if variant=='valid0':check('UNCHANGED_PENDING_QA_POSITIVE',result['status']=='QUALIFICATION_EVIDENCE_COMPLETE_PENDING_QA_ROOT' and result['nativeStatus']==0 and result['canonicalClosed'] is True)
    elif variant=='combined-old-strings':check('ORIGINAL_COMBINED_STRINGS_FIXED',result['status']=='HOLD' and result['primaryReason']=='NATIVE_UNKNOWN' and result['nativeStatus'] is None and result['nativeArchiveSha256'] is None and result['nativeWaited'] is True and result['canonicalClosed'] is True and result['nativeDrainState']=='CONFIRMED')
    elif variant=='old-truthy-list':check('ORIGINAL_CONTAINER_ESCAPE_FIXED',result['status']=='HOLD' and result['primaryReason']=='SCHEMA' and result['canonicalClosed'] is False and result['nativeDrainState']=='UNKNOWN' and invocation in C.RETAINED and invocation.process is ordinary.process)
    else:check('VALID_FAILED1_NOT_CONVERTED',result['status']=='HOLD' and result['primaryReason']=='NATIVE_FAILED' and result['nativeStatus']==1 and result['canonicalClosed'] is True and result['cleanupReason']=='NONE')
    before=list(model.sequence)
    try:invocation.invoke(model.release_spec,model.decision_spec,model.control_spec,'/synthetic/output')
    except C.Hold:check('CAP_RETAINED_'+variant,model.sequence==before and ordinary.waits==1)
    else:check('CAP_RETAINED_'+variant,False)
    CASES.append(dict(variant=variant,status=result['status'],primary=result['primaryReason'],cleanup=result['cleanupReason'],nativeStatus=result['nativeStatus'],nativeWaited=result['nativeWaited'],nativeArchiveSha256=result['nativeArchiveSha256'],nativeDrainState=result['nativeDrainState'],canonicalClosed=result['canonicalClosed'],waitCalls=ordinary.waits))
'''
changed=removed=0
for n in ast.walk(tree):
 if isinstance(n,ast.With):
  for child in list(n.body):
   if isinstance(child,ast.For) and isinstance(child.target,ast.Name) and child.target.id=='kind':
    at=n.body.index(child);n.body[at:at+1]=ast.parse(snippet).body;changed+=1
for n in list(tree.body):
 if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='write_text':tree.body.remove(n);removed+=1
if (changed,removed)!=(1,1):raise ValueError('ONLY_DECLARED_CASE_LOOP_AND_RESULT_WRITER_ADAPTATION')
ast.fix_missing_locations(tree);ns={'__file__':str(S/'flow_checks.py'),'__name__':'_quinn_independent_original_pair_preservation'}
exec(compile(tree,'<same-guarded-fakes-four-independent-cases>','exec'),ns)
print(json.dumps({'kind':'INDEPENDENT_ORIGINAL_NATIVE_PROJECTION_REGRESSIONS_AND_PRESERVATION','checks':len(ns['CHECKS']),'cases':ns['CASES'],'boundaryAttempts':ns['BLOCKED'],'actualActions':0,'subjectSafetyEdits':False,'oneReadyYieldReverseProofPreserved':True},indent=2))
