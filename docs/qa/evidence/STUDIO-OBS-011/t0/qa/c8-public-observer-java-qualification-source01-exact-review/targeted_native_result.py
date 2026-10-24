"""Independent closed-native-result positive/adverse pair in actual Invocation.
Uses the inspected exact flow effect fakes/audit. The15 required scenarios are
not replayed. One synthetic ordinary-adapter return carries wrong-typed fields.
No subject safety statement or controller/receiver implementation is altered.
"""
import ast,builtins,copy,ctypes,fcntl,hashlib,io,json,os,re,selectors,socket,stat,struct,subprocess,sys,threading,time,types
from pathlib import Path
from contextlib import ExitStack
from unittest.mock import patch
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-public-observer-java-qualification-prep/resume1').absolute();raw=(S/'flow_checks.py').read_bytes();m=json.loads((S/'manifest.json').read_bytes());row=next(x for x in m['files'] if x['path']=='flow_checks.py')
if hashlib.sha256(raw).hexdigest()!=row['sha256']:raise ValueError('EXACT_FLOW_HARNESS_PIN')
tree=ast.parse(raw)
snippet='''
for bad in (False,True):
    model=Model('parser');ordinary=Ordinary(model);original_wait=ordinary.wait
    def wait(process):
        value=original_wait(process)
        if bad:
            value['nativeStatus']='SYNTHETIC_PRIVATE_STATUS_SENTINEL'
            value['archiveSha256']='SYNTHETIC_PRIVATE_ARCHIVE_SENTINEL'
        return value
    ordinary.wait=wait
    custody=types.SimpleNamespace(Ownership=K.Ownership,Custody=lambda path,mode=None,api=None,ownership=None:Directory(model,path,mode,ownership))
    custody.__source_sha256__=K.__source_sha256__
    boundary=types.SimpleNamespace(platform='darwin',clock=model.clock,uid=model.uid,event=model.event,thread=model.thread_factory,selector=model.selector,listener=model.listener,fd_metadata=model.fd_metadata)
    invocation=C.Invocation(ordinary,dict(custody=custody,relay=R,contract=P,controller=C),model,boundary)
    result=invocation.invoke(model.release_spec,model.decision_spec,model.control_spec,'/synthetic/output')
    if bad:
        check('MALFORMED_NATIVE_HOLDS',result['status']=='HOLD' and result['primaryReason']=='NATIVE_UNKNOWN')
        check('MALFORMED_NATIVE_STATUS_EXPORTED_UNCHANGED',result['nativeStatus']=='SYNTHETIC_PRIVATE_STATUS_SENTINEL')
        check('MALFORMED_NATIVE_ARCHIVE_EXPORTED_UNCHANGED',result['nativeArchiveSha256']=='SYNTHETIC_PRIVATE_ARCHIVE_SENTINEL')
    else:
        check('VALID_NATIVE_RESULT_POSITIVE',result['status']=='QUALIFICATION_EVIDENCE_COMPLETE_PENDING_QA_ROOT' and type(result['nativeStatus'])is int and result['nativeStatus']==0 and len(result['nativeArchiveSha256'])==64)
    CASES.append(dict(case='malformed-native-fields' if bad else 'positive-native-fields',status=result['status'],primaryReason=result['primaryReason'],canonicalClosed=result['canonicalClosed'],nativeStatus=result['nativeStatus'],nativeArchiveSha256=result['nativeArchiveSha256'],ordinaryAdapterIsSynthetic=True))
'''
changed=0
for node in ast.walk(tree):
 if isinstance(node,ast.With):
  for child in list(node.body):
   if isinstance(child,ast.For) and isinstance(child.target,ast.Name) and child.target.id=='kind':
    at=node.body.index(child);node.body[at:at+1]=ast.parse(snippet).body;changed+=1
removed=0
for node in list(tree.body):
 if isinstance(node,ast.Expr) and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Attribute) and node.value.func.attr=='write_text':tree.body.remove(node);removed+=1
if changed!=1 or removed!=1:raise ValueError('ONLY_CASE_LOOP_AND_REVIEW_WRITER_ADAPTATION')
ast.fix_missing_locations(tree);ns={'__file__':str(S/'flow_checks.py'),'__name__':'_qa_native_closed_result_pair'}
exec(compile(tree,'<same-guarded-fakes-independent-two-native-result-cases>','exec'),ns)
print(json.dumps({'kind':'INDEPENDENT_ACTUAL_INVOCATION_NATIVE_RESULT_PAIR','checks':len(ns['CHECKS']),'cases':ns['CASES'],'boundaryAttempts':ns['BLOCKED'],'actualActions':0,'subjectControllerOrReceiverSafetyEdits':False,'harnessAdaptation':'Only15case invocation loop replaced by2targeted cases; oneREADYyield/reverseproof and unchanged persistent audit/effect guards retained. Result writer omitted.'},indent=2))
