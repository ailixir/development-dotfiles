"""Minimal independent Design02 ID/integrity pairs. No real self metadata or helper."""
import builtins,hashlib,io,json,sys,types
from pathlib import Path
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gateway-source04-bin-app-failure-disposition-design02')
body=(S/'python-self-roles.py.txt').read_bytes();boot=(S/'self-role-bootstrap.py.txt').read_bytes()
assert hashlib.sha256(body).hexdigest()=='da92b42f22c17742e6a14e3b57ade9f9a486d0edab6ba49953e75b02c5cc69a5'
assert hashlib.sha256(boot).hexdigest()=='38f7c66be84353edbad5bced183feb7236d975ee372af4b2cc5519915050feba'
B=compile(body,'<exact design02 fake body>','exec');T=compile(boot,'<exact design02 fake bootstrap>','exec');realexec=exec
BIN='/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13';APP='/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/Resources/Python.app/Contents/MacOS/Python'
checks=[];cases=[];denied=[]
def audit(event,args):
 if event=='open' or event.startswith(('os.','subprocess.','socket.','ctypes.','fcntl.','_thread.','threading.','multiprocessing.','shutil.','import')):
  denied.append(event);raise AssertionError('REAL_EFFECT_DENIED')
sys.addaudithook(audit)
def check(name,ok):
 if ok is not True:raise AssertionError(name)
 checks.append({'id':name,'passed':True})
for name,mode,pid,ppid,expectedPid,expectedParent in [
 ('verified-bootstrap-positive','verified',9001,3749,9001,3749),
 ('body-upper-bound-parent','body',9001,2147483648,9001,None),
 ('body-bool-self','body',True,3749,None,3749),
 ('bootstrap-bad-body-parent-throws','bad',9001,'THROW',9001,None),
 ('bootstrap-bad-body-self-throws','bad','THROW',3749,None,3749),
]:
 calls=[];out=io.StringIO();nestedCalls=[]
 def getter(key,val):
  calls.append(key)
  if val=='THROW':raise OSError('SYNTHETIC_PRIVATE_ERROR')
  return val
 fakeos=types.SimpleNamespace(getpid=lambda:getter('getpid',pid),getppid=lambda:getter('getppid',ppid))
 fakesys=types.SimpleNamespace(executable=BIN,orig_argv=[APP],argv=['fake',body.decode()+('\n' if mode=='bad' else '')],stdout=out)
 def imported(key,*args,**kw):
  if key not in ('os','sys','hashlib'):raise AssertionError('UNKNOWN_TARGET_IMPORT')
  return {'os':fakeos,'sys':fakesys,'hashlib':hashlib}[key]
 fakebuiltins=dict(vars(builtins),__import__=imported)
 def nested(code,g=None,l=None):
  nestedCalls.append(True);g={} if g is None else g;g['__builtins__']=fakebuiltins
  return realexec(code,g,g if l is None else l)
 fakebuiltins['exec']=nested
 namespace={'__builtins__':fakebuiltins,'__name__':'_quinn_design02_fake'}
 try:realexec(B if mode=='body' else T,namespace)
 except SystemExit as e:status=e.code
 else:raise AssertionError('EXPLICIT_EXIT_REQUIRED')
 text=out.getvalue();r=json.loads(text)
 check('SELF_RETAINED_'+name,r['pid']==expectedPid)
 check('PARENT_RETAINED_'+name,r['ppid']==expectedParent)
 check('READS_ONCE_'+name,calls==['getpid','getppid'])
 check('OUTCOME_'+name,(status,r['status'])==((0,'METADATA_ONLY') if mode=='verified' else (1,'HOLD')))
 check('SAME_FAKE_NESTED_CONTROL_'+name,len(nestedCalls)==(1 if mode=='verified' else 0))
 check('ROLE_OUTPUT_'+name,(r['reportedRole'],r['origArgv0Role'])==(('UNAVAILABLE','UNAVAILABLE') if mode=='bad' else ('BIN','APP')))
 check('UNKNOWN_UNQUALIFIED_'+name,all(r[k] is None for k in ('start','argvHash','fullFingerprint','observedProcessImage','timestamp')) and r['qualified'] is False and r['NFact'] is False and r['postExitLeakProof'] is False)
 check('CLOSED_OUTPUT_'+name,len(text.encode())<=1024 and BIN not in text and APP not in text and 'SYNTHETIC_PRIVATE_ERROR' not in text)
 cases.append({'case':name,'record':r,'fakeExit':status,'fakeCalls':calls,'nestedBodyExecutions':len(nestedCalls)})
check('ZERO_REAL_BOUNDARIES',denied==[])
print(json.dumps({'kind':'QUINN_DESIGN02_MINIMAL_INDEPENDENT_ID_INTEGRITY_PAIRS','checks':len(checks),'cases':len(cases),'results':checks,'caseResults':cases,'persistentDenyAudit':True,'sameFakeNestedNamespace':True,'subjectSafetyEdits':False,'actualDiagnosticOrResourceActions':0,'boundaryAttempts':denied},indent=2))
