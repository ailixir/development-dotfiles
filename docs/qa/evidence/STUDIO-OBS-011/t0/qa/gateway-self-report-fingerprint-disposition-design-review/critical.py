"""One minimal independent whole-body/bootstrap batch, all self/hash boundaries fake."""
import builtins,hashlib,io,json,sys,types
from pathlib import Path
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gateway-self-report-fingerprint-disposition-design')
body=(S/'python-self-text.py.txt').read_bytes();boot=(S/'self-text-bootstrap.py.txt').read_bytes();schema=json.loads((S/'record-schema.json').read_bytes())
assert hashlib.sha256(body).hexdigest()=='65022489e374d4096adbc2b73b29c8347318ed6bd8be9d3a6b22bfaba7ec5108'
assert hashlib.sha256(boot).hexdigest()=='553b4544dc3515cc0f24746857e512498c8e8954283248b7580a5575eeb901e0'
B=compile(body,'<exact fake self-text05>','exec');T=compile(boot,'<exact fake bootstrap05>','exec');realexec=exec
APP='/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/Resources/Python.app/Contents/MacOS/Python'
checks=[];cases=[];denied=[];hostile_calls=[]
class HostileString(str):
 def __len__(self):hostile_calls.append('len');raise AssertionError('HOSTILE_CALLBACK')
 def encode(self,*a,**kw):hostile_calls.append('encode');raise AssertionError('HOSTILE_CALLBACK')
 def __str__(self):hostile_calls.append('str');raise AssertionError('HOSTILE_CALLBACK')
hostile=HostileString('private-subclass-text')
def audit(event,args):
 if event=='open' or event.startswith(('os.','subprocess.','socket.','ctypes.','fcntl.','_thread.','threading.','import')):
  denied.append(event);raise AssertionError('REAL_EFFECT_DENIED')
sys.addaudithook(audit)
def check(n,v):
 if v is not True:raise AssertionError(n)
 checks.append({'id':n,'passed':True})
plan=[('verified-opaque-unicode','verified','opaque-e\u0301',APP,3749,'COMPLETE'),('multibyte-over','body','\u20ac'*1366,APP,3749,'BYTE_CAP'),('hash-failure-known-count','hashfail','private-hash-input',APP,3749,'HASH_FAILURE'),('parent-throws-other-invalid','body','opaque-known','bad\x00arg','THROW','COMPLETE'),('bootstrap-nonascii-code','nonascii','opaque-known',APP,3749,'UNAVAILABLE'),('exact-str-subclass-rejected','body',hostile,APP,3749,'TYPE')]
for name,mode,reported,argument,parent,textstatus in plan:
 out=io.StringIO();calls=[];hashed=[];nested_calls=[]
 def getparent():
  calls.append('getppid')
  if parent=='THROW':raise OSError('SYNTHETIC_PRIVATE_EXCEPTION')
  return parent
 def getpid():calls.append('getpid');return 9100
 def fakehash(raw):
  if type(raw) is not bytes or len(raw)>4096:raise AssertionError('HASH_BEFORE_BOUND')
  hashed.append(raw)
  if mode=='hashfail' and raw==b'private-hash-input':raise ValueError('SYNTHETIC_PRIVATE_EXCEPTION')
  return hashlib.sha256(raw)
 fakeos=types.SimpleNamespace(getpid=getpid,getppid=getparent)
 fakesys=types.SimpleNamespace(executable=reported,orig_argv=[argument],argv=['fake',body.decode('ascii')+('\u00e9' if mode=='nonascii' else '')],stdout=out)
 allowed={'os':fakeos,'sys':fakesys,'hashlib':types.SimpleNamespace(sha256=fakehash)}
 def imported(key,*a,**kw):
  if key not in allowed:raise AssertionError('UNDECLARED_IMPORT')
  return allowed[key]
 fb=dict(vars(builtins),__import__=imported)
 def nested(code,g=None,l=None):
  nested_calls.append(True);g={} if g is None else g;g['__builtins__']=fb;return realexec(code,g,g if l is None else l)
 fb['exec']=nested;ns={'__builtins__':fb,'__name__':'_quinn_fake_text05'}
 try:realexec(T if mode in ('verified','nonascii') else B,ns)
 except SystemExit as e:exitcode=e.code
 else:raise AssertionError('EXPLICIT_EXIT_REQUIRED')
 text=out.getvalue();r=json.loads(text)
 check('CLOSED_SCHEMA_'+name,set(r)==set(schema['fields']) and len(text.encode())<=1024)
 check('KNOWN_IDS_'+name,r['pid']==9100 and r['ppid']==(3749 if parent!='THROW' else None) and calls==['getpid','getppid'])
 check('STATUS_'+name,r['reportedTextStatus']==textstatus and exitcode==(0 if mode=='verified' else 1) and r['status']==('METADATA_ONLY' if mode=='verified' else 'HOLD'))
 check('SAME_FAKE_BOOTSTRAP_'+name,len(nested_calls)==(1 if mode=='verified' else 0))
 check('NO_PHYSICAL_PROOF_'+name,r['digestKind']=='SELF_REPORTED_TEXT_DIGEST' and all(r[k] is None for k in schema['explicitNull']) and all(r[k] is False for k in schema['explicitFalse']))
 if textstatus=='COMPLETE':check('EXACT_TEXT_DIGEST_'+name,r['reportedTextUtf8Bytes']==len(reported.encode()) and r['reportedTextSha256']==hashlib.sha256(reported.encode()).hexdigest())
 elif textstatus=='HASH_FAILURE':check('KNOWN_COUNT_NO_DIGEST_'+name,r['reportedTextUtf8Bytes']==len(b'private-hash-input') and r['reportedTextSha256'] is None)
 else:check('INVALID_NO_COUNT_DIGEST_'+name,r['reportedTextUtf8Bytes'] is None and r['reportedTextSha256'] is None)
 if mode=='nonascii':check('BOOTSTRAP_REJECTS_BEFORE_HASH',hashed==[] and r['origArgv0TextSha256'] is None)
 elif name=='parent-throws-other-invalid':check('OTHER_PARTIAL_RETAINED',r['origArgv0TextStatus']=='NUL' and r['origArgv0TextSha256'] is None and r['reportedTextSha256'] is not None)
 else:check('INDEPENDENT_OTHER_FIELD_'+name,r['origArgv0TextStatus']=='COMPLETE' and r['origArgv0TextSha256']==hashlib.sha256(APP.encode()).hexdigest())
 check('NO_RAW_TEXT_'+name,APP not in text and 'opaque-' not in text and 'private-hash-input' not in text and 'SYNTHETIC_PRIVATE_EXCEPTION' not in text)
 if mode=='body' and textstatus=='BYTE_CAP':check('BYTE_CAP_NO_REPORT_HASH',len(hashed)==1 and hashed[0]==APP.encode())
 cases.append({'case':name,'record':r,'fakeExit':exitcode,'hashInputSizes':[len(x) for x in hashed],'nestedBodyExecutions':len(nested_calls)})
check('NO_HOSTILE_STRING_CALLBACKS',hostile_calls==[]);check('ZERO_REAL_BOUNDARIES',denied==[])
print(json.dumps({'kind':'QUINN_MINIMAL_TEXT05_BODY_BOOTSTRAP_PAIRS','checks':len(checks),'cases':len(cases),'results':checks,'caseResults':cases,'actualDiagnosticOrResourceActions':0,'persistentDenyAudit':True,'sameFakeNestedImports':True,'subjectSafetyEdits':False,'boundaryAttempts':denied},indent=2))
