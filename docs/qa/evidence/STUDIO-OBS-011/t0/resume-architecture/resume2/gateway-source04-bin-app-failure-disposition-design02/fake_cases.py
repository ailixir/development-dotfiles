"""One complete bounded Design02 known-ID preservation batch; all target effects fake.

No proposed helper runs against actual self data. Actual body/bootstrap statements
and nested code use the same fake os/sys under a persistent unchanged deny audit.
"""
import builtins,hashlib,io,json,pathlib,sys,types
S=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gateway-source04-bin-app-failure-disposition-design02')
body=(S/'python-self-roles.py.txt').read_bytes();bootstrap=(S/'self-role-bootstrap.py.txt').read_bytes()
if hashlib.sha256(body).hexdigest()!='da92b42f22c17742e6a14e3b57ade9f9a486d0edab6ba49953e75b02c5cc69a5':raise ValueError('EXACT_CORRECTED_BODY')
if hashlib.sha256(bootstrap).hexdigest()!='38f7c66be84353edbad5bced183feb7236d975ee372af4b2cc5519915050feba':raise ValueError('EXACT_CORRECTED_BOOTSTRAP')
compiledBody=compile(body,'<fake-only-design02-body>','exec');compiledBootstrap=compile(bootstrap,'<fake-only-design02-bootstrap>','exec');realexec=exec
BIN='/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13'
APP='/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/Resources/Python.app/Contents/MacOS/Python'
# This finite list is fixed before the one run. None/THROW are synthetic failures.
plan=[
 ('body-valid-both','body',9000,3749,False),
 ('bootstrap-verified-body','bootstrap',9000,3749,False),
 ('body-invalid-parent','body',9000,None,False),
 ('body-throwing-parent','body',9000,'THROW',False),
 ('body-invalid-self','body',None,3749,False),
 ('body-throwing-self','body','THROW',3749,False),
 ('bootstrap-integrity-invalid-parent','failure',9000,None,False),
 ('bootstrap-integrity-throwing-parent','failure',9000,'THROW',False),
 ('bootstrap-integrity-invalid-self','failure',None,3749,False),
 ('bootstrap-integrity-throwing-self','failure','THROW',3749,False),
 ('body-wrong-valid-parent','body',9000,3748,False),
 ('body-unavailable-role','body',9000,3749,True),
]
denied=[];checks=[];cases=[];executionCounts={'body':0,'bootstrap':0}
def check(name,ok):
 if ok is not True:raise ValueError(name)
 checks.append(dict(id=name,passed=True))
def audit(event,args):
 if event=='open' or event.startswith(('os.','subprocess.','socket.','ctypes.','fcntl.','_thread.')):
  denied.append(event);raise AssertionError('REAL_BOUNDARY_DENIED')
sys.addaudithook(audit)
for name,mode,self_value,parent_value,missing_role in plan:
 calls=[];out=io.StringIO()
 def getter(kind,value):
  calls.append(kind)
  if value=='THROW':raise OSError('SYNTHETIC_NOT_PUBLISHED')
  return value
 fakeos=types.SimpleNamespace(getpid=lambda:getter('getpid',self_value),getppid=lambda:getter('getppid',parent_value))
 fakesys=types.SimpleNamespace(executable=None if missing_role else BIN,orig_argv=[APP],argv=['synthetic-helper','WRONG_BODY' if mode=='failure' else body.decode()],stdout=out)
 allowed={'os':fakeos,'sys':fakesys,'hashlib':hashlib}
 def imported(module,*args,**kwargs):
  if module not in allowed:raise AssertionError('UNDECLARED_TARGET_IMPORT')
  return allowed[module]
 fakebuiltins=dict(vars(builtins),__import__=imported)
 def nested(code,globals=None,locals=None):
  executionCounts['body']+=1
  target={} if globals is None else globals;target['__builtins__']=fakebuiltins
  return realexec(code,target,target if locals is None else locals)
 fakebuiltins['exec']=nested
 namespace={'__name__':'_design02_fake_only','__builtins__':fakebuiltins}
 try:
  executionCounts['body' if mode=='body' else 'bootstrap']+=1
  realexec(compiledBody if mode=='body' else compiledBootstrap,namespace)
 except SystemExit as done:status=done.code
 else:raise ValueError('EXPLICIT_EXIT_REQUIRED')
 text=out.getvalue();record=json.loads(text)
 expected_self=self_value if type(self_value)is int and 0<self_value<2147483648 else None
 expected_parent=parent_value if type(parent_value)is int and 0<parent_value<2147483648 else None
 good=mode!='failure' and expected_self is not None and expected_parent==3749 and not missing_role
 check('KNOWN_SELF_RETAINED_'+name,record['pid']==expected_self)
 check('KNOWN_PARENT_RETAINED_'+name,record['ppid']==expected_parent)
 check('INDEPENDENT_READS_ONCE_'+name,calls==['getpid','getppid'])
 check('CLOSED_OUTCOME_'+name,status==(0 if good else 1) and record['status']==('METADATA_ONLY' if good else 'HOLD'))
 check('NO_UNSUPPORTED_PROOF_'+name,record['qualified'] is False and record['NFact'] is False and record['postExitLeakProof'] is False and all(record[k] is None for k in ('start','argvHash','fullFingerprint','observedProcessImage','timestamp')))
 check('CLOSED_NO_RAW_OUTPUT_'+name,len(text.encode())<=1024 and BIN not in text and APP not in text and 'SYNTHETIC_NOT_PUBLISHED' not in text)
 if mode=='failure':check('NO_BODY_FALLTHROUGH_'+name,record['reportedRole']==record['origArgv0Role']=='UNAVAILABLE' and record['reason']=='LITERAL_INTEGRITY_OR_EXECUTION_FAILURE')
 else:check('OTHER_KNOWN_ROLE_RETAINED_'+name,record['reportedRole']==('UNAVAILABLE' if missing_role else 'BIN') and record['origArgv0Role']=='APP')
 cases.append(dict(case=name,fakeExit=status,record=record,fakeCalls=calls,realSelfMetadataRead=False))
check('PERSISTENT_DENY_AUDIT_ZERO_REAL',denied==[])
print(json.dumps(dict(kind='DESIGN02_INDEPENDENT_KNOWN_ID_RETENTION_FAKE_CASES',checks=len(checks),results=checks,cases=cases,literalFakeExecutions=executionCounts,boundaryAttempts=denied,
 actualDiagnosticOrProcessActions=0,nestedExecUsesSameFakeImports=True,subjectSafetyEdits=False,unchanged756And1020Replayed=False),indent=2))
