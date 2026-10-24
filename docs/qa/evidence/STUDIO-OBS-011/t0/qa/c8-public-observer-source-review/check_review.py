"""Independent finite metadata/pure-policy review. Never Java/HTTP/runtime execution."""
import ast,copy,difflib,hashlib,json,pathlib,re,stat
D=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-public-evidence-prep/resume1');O=pathlib.Path(__file__).parent
checks=[];pins=[];cases=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def check(name,ok):assert ok,name;checks.append({'name':name,'passed':True})
def pin(p,want=None):
 p=pathlib.Path(p);b=p.read_bytes()
 if want is not None:assert sha(b)==want,str(p)
 pins.append({'path':str(p),'sha256':sha(b),'bytes':len(b),'mode':stat.S_IMODE(p.stat().st_mode)});return b
m=json.loads(pin(D/'manifest.json','8949bd8b929db701e4da798db04ddc1d025c8cb7d3e831eb155a307d10ddebe7'))
for r in m['files']:
 b=pin(D/r['path'],r['sha256']);check('sealed '+r['path'],len(b)==r['bytes'] and stat.S_IMODE((D/r['path']).stat().st_mode)==r['mode'])
check('exact25 members',len(m['files'])==25)
inputs=json.loads((D/'input-pins.json').read_text())['inputs']
for r in inputs:
 b=pin(r['path'],r['sha256']);check('public input '+r['path'],len(b)==r['bytes'] and stat.S_IMODE(pathlib.Path(r['path']).stat().st_mode)==r['mode'])
check('exact27 public inputs',len(inputs)==27)
# Inspected author tests block OS/filesystem/process/socket/fcntl/sleep while tested boundaries run.
# The only source change to their AST removes the final output write into the sealed packet.
t=ast.parse((D/'pure_checks.py').read_text());removed=[];body=[];reuse=(O/'author-check-results.json').exists()
for n in t.body:
 if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='write_text':removed.append(n);continue
 if reuse and (isinstance(n,ast.With) or isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='result' for x in n.targets) or isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='print'):continue
 body.append(n)
check('only sealed-result write removed',len(removed)==1)
ns={'__file__':str(D/'pure_checks.py'),'__name__':'quinn_guarded_checks','print':lambda *a,**kw:None}
exec(compile(ast.Module(body=body,type_ignores=[]),'<inspected fully guarded author controls>','exec'),ns)
if reuse:ns['result']=json.loads((O/'author-check-results.json').read_text())
check('311 expected zero effects',ns['result']['passed']==311 and ns['result']['failed']==0 and ns['BLOCKED_CALLS']==[])
(O/'author-check-results.json').write_text(json.dumps(ns['result'],indent=2)+'\n')
C=ns['CONTRACT'];P=ns['CONTROL'];Effects=ns['Effects'];auth=ns['auth']
prov={x:'a'*64 for x in C['PROVENANCE_FIELDS']}
def independent(name,raw,want):
 value=C['collect_records'](raw,prov,dict(prov))
 assert value['publicObservation']['captureStatus']==want
 assert value['originalCause']==value['runtimeStage']=='UNKNOWN' and value['C8Credit'] is False
 cases.append({'case':name,'status':want,'passed':True})
good=C['project']('FAILED',{'outcome':'FAILED','errorCode':'LOGIN_REQUIRED'})
independent('valid failed closed code',[json.dumps(good).encode()],'CAPTURED')
for name,change in [('raw extra',{'message':'PRIVATE_CANARY'}),('wrong constant',{'method':'wrong'}),('qualified unknown',{'errorCode':'UNKNOWN','codeQualified':True}),('mismatch qualified',{'captureStatus':'MISMATCH','publicOutcomeOrState':'EXPIRED'}),('schema bool',{'schemaVersion':True})]:
 independent(name,[json.dumps({**good,**change}).encode()],'INVALID')
independent('duplicate closed key',[json.dumps(good).replace('"schemaVersion": 1','"schemaVersion": 1, "schemaVersion": 1').encode()],'INVALID')
independent('two records never select',[json.dumps(good).encode()]*2,'AMBIGUOUS')
independent('no record honest unknown',[],'UNAVAILABLE')
independent('non200 public unknown', [json.dumps(C['record']()).encode()],'UNAVAILABLE')
# A fake logical send can hide any number of transport attempts: demonstrate test abstraction only.
p=C['ProducerReference']();subject='00000000-0000-0000-0000-000000000001';p.bind(subject,'synthetic');transport=[];writes=[]
def send(s,c,budget):
 transport.extend(['attempt1-connect-failure','attempt2-success']);return 200,ns['wire']()
out=p.observe(subject,'FAILED','synthetic',{subject:'synthetic'},send,lambda r:writes.append(r))
cases.append({'case':'logical fake send hides transport retry','captureStatus':out['captureStatus'],'logicalSends':1,'syntheticTransportEvents':transport,'actualJavaOrHttp':False})
check('one fake send cannot prove no retry',out['captureStatus']=='CAPTURED' and len(transport)==2 and len(writes)==1)
# Real pure controller uses only the injected in-memory Effects. No adapter/main is imported.
e=Effects(auth());c=P['Controller'](auth(),e);c.stage();e.native_exit=0;e.native_change={'collectionComplete':False};r=c.selected()
check('actual0 with missing collection remains red',r['nativeExit']==0 and r['phaseExit']==1 and r['disposition']=='HOLD')
e.source='RESTORED';e.files['restore-result.json']={'exit':0};e.files['compile-restored-result.json']={'nativeExit':0,'phaseExit':0};e.public_status='INVALID';e.wrapper_exit=0
try:c.final()
except P['Hold']:cases.append({'case':'invalid observation denies wrapper0','passed':True})
else:raise AssertionError('INVALID_GOT_GREEN_WRAPPER')
pre=(D/'Replay.preimage.java').read_text();post=(D/'Replay.postimage.java').read_text();fragment=(D/'observer-fragment.java.txt').read_text();source=json.loads((D/'source-binding.json').read_text())
for direction,a,b,prefixa,prefixb in [('forward',pre,post,'a/','b/'),('reverse',post,pre,'a/','b/')]:
 expected=''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile=prefixa+source['path'],tofile=prefixb+source['path']))
 name='observer.patch' if direction=='forward' else 'observer.reverse.patch'
 check('strict exact '+direction,expected==(D/name).read_text() and ns['strict_apply'](a,expected)==b)
check('full fragment inserted once',post.count(fragment)==1 and fragment not in pre)
check('original assertion one unchanged',pre.count('assertThat(state).as("second explicit learning; logs %s", TEMP).isEqualTo("FINALIZING");')==post.count('assertThat(state).as("second explicit learning; logs %s", TEMP).isEqualTo("FINALIZING");')==1)
check('observer before assertion',post.index('p3PublicObservation.observe(id, state);')<post.index('assertThat(state).as("second explicit learning; logs %s", TEMP).isEqualTo("FINALIZING");'))
check('selected method and original p3Case',post.count('@org.junit.jupiter.api.Order(17)\n  void actualPublishedWrongPasswordAnnotatesEarlierSecretFill()')==1 and 'p3PublishedLogin(P3Mode.LOGIN, true);' in post)
check('postcollection length check',fragment.index('.send(request, HttpResponse.BodyHandlers.ofByteArray())')<fragment.index('response.body().length > 262144'))
check('no total body deadline machinery',all(x not in fragment for x in ['BodySubscriber','System.nanoTime','sendAsync','cancel(','awaitTermination','shutdown','try (HttpClient']))
writer=fragment[fragment.index('private static void p3WritePublicObservation'):]
check('nofollow exclusive output but no identity/owner check','SecureDirectoryStream' in writer and 'CREATE_NEW' in writer and 'getFileAttributeView' not in writer and 'readAttributes' not in writer and 'getOwner' not in writer and 'fileKey' not in writer)
schema=json.loads((D/'public-observation.schema.json').read_text());policy=json.loads((D/'public-policy.json').read_text())
check('schema exact closed fieldset',set(schema['required'])==set(schema['properties'])==C['FIELDS'] and schema['additionalProperties'] is False)
check('schema policy constant enum agreement',all(schema['properties'][k]['const']==v for k,v in C['CONSTANTS'].items()) and set(schema['properties']['errorCode']['enum'])==C['CODES']==set(policy['codes']) and set(schema['properties']['pollState']['enum'])==C['STATES'])
plan=json.loads(pathlib.Path(source['sourcePlanPath']).read_text());check('plan public JSON',type(plan) is dict)
# Record virtual rows shape rather than invent a live source inventory.
def find_rows(value):
 if isinstance(value,list) and len(value)==1808 and all(isinstance(x,dict) and 'path' in x and 'sha256' in x for x in value):return value
 if isinstance(value,dict):
  for x in value.values():
   r=find_rows(x)
   if r is not None:return r
 if isinstance(value,list):
  for x in value:
   r=find_rows(x)
   if r is not None:return r
rows=find_rows(plan);assert rows is not None
check('base digest ordered1808',sha(json.dumps(rows,separators=(',',':')).encode())==source['acceptedWholeSourceDigest'])
after=copy.deepcopy(rows);matches=[x for x in after if x['path']==source['path']];assert len(matches)==1 and matches[0]['sha256']==source['preimageSha256'];matches[0]['sha256']=source['postimageSha256']
check('candidate one-row virtual digest',sha(json.dumps(after,separators=(',',':')).encode())==source['candidateVirtualWholeSourceDigest'])
result={'sourceChecks':checks,'independentCases':cases,'authorGuardedChecks':311,'authorEffects':0,'JavaHttpRuntimeOsPrivateActions':0,'actualCurrentSourceOrBaselineReadStatHash':False,'primaryJavaApiBehaviorNotExecuted':True}
(O/'checks.json').write_text(json.dumps(result,indent=2)+'\n');(O/'pins.json').write_text(json.dumps({'pins':pins,'pinCount':len(pins)},indent=2)+'\n')
print(json.dumps({'sourceChecks':len(checks),'independentCases':len(cases),'authorChecks':311,'actualActions':0},indent=2))
