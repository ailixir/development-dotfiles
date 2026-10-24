"""Static source/hash contract checks only. Never imports/runs a gate, producer, observer or execution main."""
from pathlib import Path
import ast,difflib,hashlib,json
O=Path(__file__).resolve().parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def node(source,name):return next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name==name)
def check_calls(source):
 out={}
 for n in ast.walk(ast.parse(source)):
  if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='need' and len(n.args)>1 and isinstance(n.args[1],ast.Constant) and isinstance(n.args[1].value,str):out.setdefault(n.args[1].value,[]).append(ast.get_source_segment(source,n))
 return out
def main():
 i=read(O/'inputs.json')
 for p in i['pins']:assert sha(R/p['path'])==p['sha256'],p['path']
 assert i['executionDependencyStatus'].startswith('PENDING_') and i['privateInputs']==[]
 files=['unlock_gate.py','final_verifier.py','postclose.py','pure_controls.py','verify_static.py']
 for n in files:ast.parse((O/n).read_text())
 oldpath=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-gst-provisional-06/unlock_gate.py';old=oldpath.read_text();new=(O/'unlock_gate.py').read_text()
 assert sha(oldpath)=='55e5d935a0a38bd2b7477cde55f11b39df7c842ce5efc01494dbc7a1c32513a6'
 assert sha(O/'guard-exit.bash')=='bf5782294e00ac1509e6145233fa7c97a5085a14663ec475df8e0698d7135f0c'
 for name in ['identities','fresh','safe_bytes']:assert ast.dump(node(old,name))==ast.dump(node(new,name))
 m=read(O/'55e5-check-map.json');assert m['oldGateSha256']==sha(oldpath) and m['newGateSha256']==sha(O/'unlock_gate.py')
 a,b=check_calls(old),check_calls(new);assert m['oldCodes']==len(a) and m['newCodes']==len(b)
 assert {x['old55e5Code'] for x in m['checks']}==set(a)
 for x in m['checks']:
  assert x['oldPredicateCalls']==a[x['old55e5Code']]
  assert x['newPredicateCalls']==[p for n in x['newCodes'] for p in b[n]]
 diff=''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),'a/'+str(oldpath.relative_to(R)),'b/'+str((O/'unlock_gate.py').relative_to(R))))
 assert (O/'unlock-gate-from-55e5.diff').read_text()==diff
 for item in read(O/'runtime-files.json')['files']:assert sha(O/Path(item['path']).name)==item['sha256']
 assert read(O/'runtime-files.json')['actualInstallation'] is False
 policy=read(O/'policy.json');assert policy['protocol']=='C8_UNLOCK_V1' and policy['maxReadinessAgeSeconds']==60 and policy['phaseNames']==['full-check','compile-reconcile'] and policy['productWriters']==0
 for text in ["r['writers']==[]","'SOURCE_LEASE'","'NO_ARBITRARY_OVERLAY'","'ACTUAL_2774_STATUS_MULTISET'","'RAW_EXIT_LINK'","'RAW_ERROR_LINK'","'ACTUAL_EXECUTED_COMPILE_REQUIRED'","'BUILD_SOURCE_RECEIPT_HASH'","'SEPARATE_RECONCILE_AUTHORITY'","'GREEN_NO_RECONCILE'","'QUALIFICATION_SCOPE'","'PHASE_INVOCATION_ACCOUNTING'","'ACTUAL_ADMISSION_DENIAL'","'SAME_HELD_PREFLIGHT'","'SOURCE_MODE_MEMBERSHIP'","'CURRENT_DIST'","'CURRENT_HELM'","'CURRENT_AUXILIARY'","'WRAPPER_DESCRIPTOR'","'KERNEL_LOCK_NOT_HELD'"]:assert text in new,text
 producer=(O/'final_verifier.py').read_text();post=(O/'postclose.py').read_text()
 assert 'unlock-permit.json' not in producer and 'builtin exit' not in producer
 assert "new('final-resource-boundary.json'" in producer and "new('preunlock-verification.json'" in producer
 assert producer.index('g.current_observation_requirements')<producer.index("new('final-resource-boundary.json'")
 assert "'permitWritten':False" in producer and "'exitInvoked':False" in producer
 assert 'guarded-exit-result.json' in post and "'KERNEL_NOT_FREE'" in post and 'postclose-resource-check.json' in post
 template=read(O/'root-bindings.template.json');assert template['expectedRootReleaseSHA']=='UNBOUND' and template['nativeCommandReleased'] is False and template['readiness'] is False
 contract=read(O/'shared-interface.json');assert contract['executionActualAdmissionAccepted'] is False and contract['release'] is False and contract['readiness'] is False
 result=read(O/'pure-control-results.json');assert result['status']=='PURE_SYNTHETIC_CONTROLS_PASS' and result['count']==61 and len(result['controls'])==61
 assert all(x['expected']==x['observed'] for x in result['controls'])
 assert result['actualGateOrProducerOrObserverOrHelperMainExecuted'] is False and result['readinessOrPermitWritten'] is False
 if (O/'manifest.json').exists():
  for p in read(O/'manifest.json')['files']:assert sha(O/p['path'])==p['sha256']
 print(json.dumps({'status':'STATIC_CONTROL_PREPARATION_PASS_EXECUTION_DEPENDENCY_PENDING','pureControls':61,'oldGateChecksMapped':len(a),'exactOldFunctionAsts':3,'BashExact':True,'actualGateProducerObserverOrExecutionMainRun':False,'readinessOrPermitOrSourceNativeAction':False,'executionSuccessorAcceptanceRequired':True}))
if __name__=='__main__':main()
