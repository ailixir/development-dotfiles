"""One bounded six-case model. Proposed helper never executes against real self data.
Every target os/sys import and nested exec namespace uses the same closed fakes.
Pure SHA retained; persistent audit denies all real effect fallthrough.
"""
import builtins,hashlib,io,json,os,pathlib,sys,types
S=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gateway-source04-bin-app-failure-disposition-design')
body=(S/'python-self-roles.py.txt').read_bytes();bootstrap=(S/'self-role-bootstrap.py.txt').read_bytes()
assert hashlib.sha256(body).hexdigest()=='c4d32e5d7c060901e241b105761f87399f98843a730544ed880d40785e27c7db'
assert hashlib.sha256(bootstrap).hexdigest()=='71d55bdb48c6ae92108578e3bc0fe8c4f3a668757b2743c2e663c33669a8f685'
compiledBody=compile(body,'<fake-only-self-role-body>','exec');compiledBootstrap=compile(bootstrap,'<fake-only-bootstrap>','exec');realexec=exec
BIN='/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13';APP='/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/Resources/Python.app/Contents/MacOS/Python'
denied=[];checks=[];cases=[]
def check(name,ok):
 if not ok:raise ValueError(name)
 checks.append({'id':name,'passed':True})
def audit(event,args):
 if event=='open' or event.startswith(('os.','subprocess.','socket.','ctypes.','fcntl.','_thread.')):
  denied.append(event);raise AssertionError('REAL_BOUNDARY_DENIED')
sys.addaudithook(audit)
for kind in ['bootstrap-positive','body-other','body-wrong-parent','body-missing-role','body-invalid-parent','bootstrap-integrity-and-parent-failure']:
 calls=[];out=io.StringIO();parent=3748 if kind=='body-wrong-parent' else None if kind=='body-invalid-parent' else 3749
 def pid():calls.append(('getpid',9000));return 9000
 def ppid():
  calls.append(('getppid','RAISE' if kind=='bootstrap-integrity-and-parent-failure' else parent))
  if kind=='bootstrap-integrity-and-parent-failure':raise OSError('SYNTHETIC_NOT_PUBLISHED')
  return parent
 fakeos=types.SimpleNamespace(getpid=pid,getppid=ppid)
 fakesys=types.SimpleNamespace(executable='/synthetic/OTHER-not-published' if kind=='body-other' else None if kind=='body-missing-role' else BIN,orig_argv=[APP],argv=['synthetic-helper',body.decode() if kind!='bootstrap-integrity-and-parent-failure' else 'WRONG_BODY'],stdout=out)
 allowed={'os':fakeos,'sys':fakesys,'hashlib':hashlib}
 def imported(name,*args,**kwargs):
  if name not in allowed:raise AssertionError('UNDECLARED_TARGET_IMPORT')
  return allowed[name]
 fakebuiltins=dict(vars(builtins),__import__=imported)
 def nested(code,globals=None,locals=None):
  target={} if globals is None else globals;target['__builtins__']=fakebuiltins
  return realexec(code,target,target if locals is None else locals)
 fakebuiltins['exec']=nested
 ns={'__name__':'_quinn_fake_only','__builtins__':fakebuiltins}
 try:realexec(compiledBootstrap if kind.startswith('bootstrap') else compiledBody,ns)
 except SystemExit as e:status=e.code
 else:raise AssertionError('EXPECTED_EXPLICIT_EXIT')
 text=out.getvalue();record=json.loads(text)
 check('CLOSED_OUTPUT_'+kind,len(text.encode())<=1024 and record['reportedRole'] in ('BIN','APP','OTHER','UNAVAILABLE') and record['origArgv0Role'] in ('BIN','APP','OTHER','UNAVAILABLE'))
 check('NO_RAW_OUTPUT_'+kind,BIN not in text and APP not in text and 'SYNTHETIC_NOT_PUBLISHED' not in text and '/synthetic/' not in text)
 check('NO_QUALIFIED_FACTS_'+kind,record['qualified'] is False and record['NFact'] is False and record['start'] is None and record['fullFingerprint'] is None and record['observedProcessImage'] is None and record['timestamp'] is None)
 if kind in ('bootstrap-positive','body-other'):check('METADATA_ONLY_'+kind,status==0 and record['status']=='METADATA_ONLY' and record['pid']==9000)
 else:check('HOLD_'+kind,status==1 and record['status']=='HOLD')
 if kind in ('body-invalid-parent','bootstrap-integrity-and-parent-failure'):check('KNOWN_PID_LOST_'+kind,('getpid',9000) in calls and record['pid'] is None)
 if kind=='body-wrong-parent':check('VALID_WRONG_PARENT_PID_PRESERVED',record['pid']==9000 and record['ppid']==3748)
 cases.append({'case':kind,'fakeExit':status,'record':record,'fakeCalls':calls,'realSelfMetadataRead':False})
check('NO_REAL_BOUNDARIES',denied==[])
print(json.dumps({'kind':'SIX_CLOSED_FAKE_SELF_METADATA_CASES','checks':len(checks),'results':checks,'cases':cases,'boundaryAttempts':denied,'actualDiagnosticOrProcessActions':0,'modelOnly':True,'nestedExecUsesSameFakeImports':True},indent=2))
