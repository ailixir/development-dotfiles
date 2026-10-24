"""One bounded prospective05 full-helper batch, fake self data/effects only.

Both source literals and nested execution use the same fake os/sys/hash provider;
pure SHA delegates to preloaded hashlib, with size/accounting instrumentation.
No actual helper, self metadata, path/tool lookup or current-resource action.
"""
import builtins,hashlib,io,json,pathlib,re,sys,types
S=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gateway-self-report-fingerprint-disposition-design')
body=(S/'python-self-text.py.txt').read_bytes();bootstrap=(S/'self-text-bootstrap.py.txt').read_bytes();schema=json.loads((S/'record-schema.json').read_bytes())
if hashlib.sha256(body).hexdigest()!='65022489e374d4096adbc2b73b29c8347318ed6bd8be9d3a6b22bfaba7ec5108':raise ValueError('EXACT_BODY')
if hashlib.sha256(bootstrap).hexdigest()!='553b4544dc3515cc0f24746857e512498c8e8954283248b7580a5575eeb901e0':raise ValueError('EXACT_BOOTSTRAP')
compiledBody=compile(body,'<fake-only-self-text-body>','exec');compiledBootstrap=compile(bootstrap,'<fake-only-self-text-bootstrap>','exec');realexec=exec
BIN='/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13'
APP='/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/Resources/Python.app/Contents/MacOS/Python'
OPAQUE='opaque synthetic self text 05';HASHFAIL='opaque synthetic hash failure 05'
# The complete finite plan is fixed before the one run; no later expansion.
plan=[
 ('verified-known','bootstrap',BIN,APP,9000,3749,'COMPLETE'),
 ('other-opaque','body',OPAQUE,APP,9000,3749,'COMPLETE'),
 ('ascii-exact4096','body','x'*4096,APP,9000,3749,'COMPLETE'),
 ('ascii-char-over','body','x'*4097,APP,9000,3749,'CHAR_CAP'),
 ('utf8-exact4096','body',chr(0x1f600)*1024,APP,9000,3749,'COMPLETE'),
 ('utf8-byte-over','body',chr(0xe9)*2049,APP,9000,3749,'BYTE_CAP'),
 ('empty','body','',APP,9000,3749,'EMPTY'),
 ('nul','body','x\0y',APP,9000,3749,'NUL'),
 ('nonstring','body',42,APP,9000,3749,'TYPE'),
 ('surrogate','body',chr(0xd800),APP,9000,3749,'SURROGATE'),
 ('unavailable','body',None,APP,9000,3749,'UNAVAILABLE'),
 ('parent-throws','body',BIN,APP,9000,'THROW','COMPLETE'),
 ('self-throws','body',BIN,APP,'THROW',3749,'COMPLETE'),
 ('tamper-parent-throws','failure',BIN,APP,9000,'THROW','UNAVAILABLE'),
 ('wrong-valid-parent','body',BIN,APP,9000,3748,'COMPLETE'),
 ('other-field-unavailable','body',BIN,None,9000,3749,'COMPLETE'),
 ('hash-failure-known-count','body',HASHFAIL,APP,9000,3749,'HASH_FAILURE'),
]
checks=[];cases=[];denied=[];counts={'body':0,'bootstrap':0}
def check(name,ok):
 if ok is not True:raise ValueError(name)
 checks.append(dict(id=name,passed=True))
def audit(event,args):
 if event=='open' or event.startswith(('os.','subprocess.','socket.','ctypes.','fcntl.','_thread.')):
  denied.append(event);raise AssertionError('REAL_BOUNDARY_DENIED')
sys.addaudithook(audit)
for name,mode,reported,argument,self_value,parent_value,expected_status in plan:
 out=io.StringIO();calls=[];hash_sizes=[];nested_calls=[]
 def getter(which,value):
  calls.append(which)
  if value=='THROW':raise OSError('SYNTHETIC_NOT_PUBLISHED')
  return value
 def sha256(raw):
  if type(raw)is not bytes or len(raw)>4096:raise AssertionError('HASH_BEFORE_BOUND')
  hash_sizes.append(len(raw))
  if name=='hash-failure-known-count' and raw==HASHFAIL.encode('utf-8'):raise ValueError('SYNTHETIC_NOT_PUBLISHED')
  return hashlib.sha256(raw)
 fakeos=types.SimpleNamespace(getpid=lambda:getter('getpid',self_value),getppid=lambda:getter('getppid',parent_value))
 fakesys=types.SimpleNamespace(executable=reported,orig_argv=[] if argument is None else [argument],argv=['synthetic-helper','WRONG_BODY' if mode=='failure' else body.decode('ascii')],stdout=out)
 allowed={'os':fakeos,'sys':fakesys,'hashlib':types.SimpleNamespace(sha256=sha256)}
 def imported(module,*args,**kwargs):
  if module not in allowed:raise AssertionError('UNDECLARED_TARGET_IMPORT')
  return allowed[module]
 fakebuiltins=dict(vars(builtins),__import__=imported)
 def nested(code,globals=None,locals=None):
  counts['body']+=1;nested_calls.append('body')
  target={} if globals is None else globals;target['__builtins__']=fakebuiltins
  return realexec(code,target,target if locals is None else locals)
 fakebuiltins['exec']=nested
 namespace={'__name__':'_prospective05_fake','__builtins__':fakebuiltins}
 try:
  counts['body' if mode=='body' else 'bootstrap']+=1
  realexec(compiledBody if mode=='body' else compiledBootstrap,namespace)
 except SystemExit as done:exit_code=done.code
 else:raise ValueError('EXPLICIT_EXIT_REQUIRED')
 text=out.getvalue();record=json.loads(text)
 expected_self=self_value if type(self_value)is int and 0<self_value<2147483648 else None
 expected_parent=parent_value if type(parent_value)is int and 0<parent_value<2147483648 else None
 good=mode!='failure' and expected_status=='COMPLETE' and argument is not None and expected_self is not None and expected_parent==3749
 check('EXACT_CLOSED_SCHEMA_'+name,set(record)==set(schema['fields']) and len(text.encode())<=1024)
 check('KNOWN_IDS_RETAINED_'+name,record['pid']==expected_self and record['ppid']==expected_parent and calls==['getpid','getppid'])
 check('EXACT_OUTCOME_'+name,exit_code==(0 if good else 1) and record['status']==('METADATA_ONLY' if good else 'HOLD'))
 check('TEXT_KIND_NOT_IDENTITY_'+name,record['digestKind']=='SELF_REPORTED_TEXT_DIGEST' and record['qualified'] is False and record['NFact'] is False and record['postExitLeakProof'] is False)
 check('UNKNOWN_FIELDS_REMAIN_NULL_'+name,all(record[k] is None for k in schema['explicitNull']) and record['descriptorCompletion']=='NOT_OBSERVED')
 check('REPORTED_CLOSED_STATUS_'+name,record['reportedTextStatus']==expected_status)
 if mode=='failure':
  check('TAMPER_NEVER_EXECUTES_BODY',nested_calls==[] and record['reportedTextSha256'] is None and record['origArgv0TextSha256'] is None and record['reason']=='LITERAL_INTEGRITY_OR_EXECUTION_FAILURE')
 else:
  expected_role='UNAVAILABLE' if type(reported)is not str or not reported else 'BIN' if reported==BIN else 'APP' if reported==APP else 'OTHER'
  check('EXACT_ROLE_ONLY_'+name,record['reportedRole']==expected_role)
  if expected_status=='COMPLETE':
   raw=reported.encode('utf-8','strict')
   check('EXACT_REPORTED_TEXT_DIGEST_'+name,record['reportedTextUtf8Bytes']==len(raw) and record['reportedTextSha256']==hashlib.sha256(raw).hexdigest())
  elif expected_status=='HASH_FAILURE':
   check('KNOWN_BYTECOUNT_SURVIVES_HASH_FAILURE',record['reportedTextUtf8Bytes']==len(HASHFAIL.encode('utf-8')) and record['reportedTextSha256'] is None)
  else:check('INVALID_FIELD_HAS_NO_DIGEST_'+name,record['reportedTextUtf8Bytes'] is None and record['reportedTextSha256'] is None)
  if argument is None:check('OTHER_KNOWN_FIELD_SURVIVES',record['reportedTextStatus']=='COMPLETE' and record['origArgv0TextStatus']=='UNAVAILABLE' and record['origArgv0TextSha256'] is None)
  else:check('INDEPENDENT_ARG_FINGERPRINT_'+name,record['origArgv0TextStatus']=='COMPLETE' and record['origArgv0TextUtf8Bytes']==len(APP.encode()) and record['origArgv0TextSha256']==hashlib.sha256(APP.encode()).hexdigest())
 check('NO_RAW_SELF_TEXT_'+name,BIN not in text and APP not in text and OPAQUE not in text and HASHFAIL not in text and 'SYNTHETIC_NOT_PUBLISHED' not in text)
 check('HASH_INPUTS_ALREADY_BYTE_BOUNDED_'+name,all(v<=4096 for v in hash_sizes))
 cases.append(dict(case=name,fakeExit=exit_code,record=record,hashInputBytes=hash_sizes,fakeCalls=calls,realSelfMetadataRead=False))
check('PERSISTENT_DENY_AUDIT_ZERO_REAL',denied==[])
print(json.dumps(dict(kind='PROSPECTIVE05_SELF_TEXT_FINGERPRINT_FAKE_CASES',checks=len(checks),results=checks,cases=cases,literalFakeExecutions=counts,boundaryAttempts=denied,actualDiagnosticOrProcessActions=0,nestedExecUsesSameFakes=True,subjectSafetyEdits=False,priorSuitesReplayed=False),indent=2))
