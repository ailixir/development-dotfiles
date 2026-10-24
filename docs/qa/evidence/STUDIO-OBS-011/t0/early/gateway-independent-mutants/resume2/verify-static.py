from pathlib import Path
import json,hashlib,stat,re,ast,copy
O=Path(__file__).resolve().parent;P=O.parent;ROOT=Path.cwd();Q=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway-independent-mutants-review'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rawhash(v):return hashlib.sha256(v.encode()).hexdigest()
def load(p):return json.loads(p.read_text())
def sealcheck(seal):
 for path,row in seal.items():
  p=ROOT/path;assert sha(p)==row['sha256'],path
  assert format(stat.S_IMODE(p.stat().st_mode),'04o')==row['mode'],path
review=load(Q/'audit.json');sealcheck(review['inputSeal']);sealcheck(review['actualInputSeal'])
assert len(review['inputSeal'])==67 and len(review['actualInputSeal'])==29
old=load(P/'manifest.json')
for row in old['artifacts']:
 assert sha(P/row['path'])==row['sha256']
 if row['path'].startswith(('private-repo/helm-chart/','mutants/')) or row['path'] in ['mutations.json','chart-bindings.json','original-80-case-map.json']:
  assert sha(O/row['path'])==row['sha256'],row['path']
  assert format(stat.S_IMODE((O/row['path']).stat().st_mode),'04o')==row['mode']
bound=load(O/'chart-bindings.json')
for row in bound['unchangedRunnerCopies']:
 assert sha(O/'private-repo'/row['path'])==row['sha256']
 assert format(stat.S_IMODE((O/'private-repo'/row['path']).stat().st_mode),'04o')==row['mode']
source=O/'private-repo/studio-runner/test/deployment/gateway-native-observer.ts';s=source.read_text()
# Read exact classifier clauses; do not import/execute JS/TS, Node, the copied harness or author entrypoints.
block=s.split('  const checks: [string, boolean][] = [\n',1)[1].split('\n  ];',1)[0]
clauses=[]
for line in block.splitlines():
 match=re.fullmatch(r"    \['([A-Z_]+)', (.*)\],",line);assert match,line;clauses.append(match.groups())
assert len(clauses)==17
class Undefined: pass
U=Undefined()
class View:
 def __init__(self,v):self.value=v
 def __getattr__(self,k):return view(self.value.get(k,U))
def view(v):return View(v) if isinstance(v,dict) else v

def strictEq(a,b):
 if a is U or b is U:return a is b
 if (isinstance(a,bool)) != (isinstance(b,bool)):return False
 if a is None or b is None:return a is b
 return a==b
class StrictCompare(ast.NodeTransformer):
 def visit_Compare(self,n):
  self.generic_visit(n)
  if len(n.ops)==1 and isinstance(n.ops[0],(ast.Eq,ast.NotEq)):
   call=ast.Call(func=ast.Name(id='strictEq',ctx=ast.Load()),args=[n.left,n.comparators[0]],keywords=[])
   return ast.copy_location(ast.UnaryOp(op=ast.Not(),operand=call) if isinstance(n.ops[0],ast.NotEq) else call,n)
  return n

def transpile(expr):
 expr=expr.replace('!==',' != ').replace('===',' == ').replace('&&',' and ').replace('||',' or ')
 expr=re.sub(r'!(?!=)', ' not ', expr)
 for a,b in [('true','True'),('false','False'),('null','None')]:expr=re.sub(r'\b'+a+r'\b',b,expr)
 expr=expr.replace('Number.isInteger','is_integer')
 expr=re.sub(r'\b(observerErrors)\.length',r'len(\1)',expr)
 tree=StrictCompare().visit(ast.parse(expr.strip(),mode='eval'));ast.fix_missing_locations(tree)
 return compile(tree,'<exact-source-extracted-native-clause>','eval')
compiled=[(name,transpile(expr)) for name,expr in clauses]
def argvhash(v):return rawhash(json.dumps(v,separators=(',',':'),ensure_ascii=False))
def evaluate(observed,expected,accepts):
 if len(observed['frames'])!=1:return False,'ONE_TEMPLATE_INVOCATION'
 env={'f':view(observed['frames'][0]),'outcome':view(observed['outcome']),'expected':view(expected),'accepts':accepts,'observerErrors':observed['observerErrors'],'builtinRestored':observed['builtinRestored'],'strictEq':strictEq,'byteHash':rawhash,'argvHash':argvhash,'is_integer':lambda x:type(x) is int,'len':len}
 for name,code in compiled:
  try:valid=eval(code,{'__builtins__':{}},env)
  except Exception:return False,name+'_MISSING_OR_MALFORMED'
  if valid is not True:return False,name
 return True,'ALL_EXACT_CLAUSES'
argv=['helm','template','release-name','/private/chart','--set','studioRunner.enabled=true','--set-json','backend.configOverrides={"studio.gateway.provider":"override"}']
expected={'argvSha256':argvhash(argv),'cwd':'/private/studio-runner','chartSha256':'a'*64}
intended='configOverrides property studio.gateway.provider is managed by the chart'
def fixture(accepts,status=1):
 stderr=intended;message='Command failed: helm template\n'+intended;merged=stderr+'\n'+message
 frame={'executable':'helm','argv':argv[:],'argvSha256':argvhash(argv),'cwd':expected['cwd'],'optionsMatched':True,'chartBeforeSha256':'a'*64,'chartAfterSha256':'a'*64,'nativeExit':0 if accepts else status,'signal':None,'signalKnown':True,'setupErrorCode':None,'spawnErrorPresent':False,'nativeThrew':not accepts,'stdoutKnown':True,'stdoutSha256':rawhash('manifest' if accepts else ''),'stderrKnown':not accepts,'stderrSha256':None if accepts else rawhash(stderr),'messageKnown':not accepts,'messageSha256':None if accepts else rawhash(message),'mergedErrorSha256':None if accepts else rawhash(merged),'observerComplete':True,'exitSource':'EXECFILESYNC_RETURN' if accepts else 'THROWN_NATIVE_STATUS'}
 return {'frames':[frame],'outcome':{'ok':accepts,'raw':'manifest' if accepts else '', 'error':'' if accepts else merged},'observerErrors':[],'builtinRestored':True}
results=[]
def check(name,obj,accepts,wanted):
 got,reason=evaluate(obj,expected,accepts);assert got==wanted,(name,reason);results.append({'name':name,'expectedAccepted':wanted,'observedAccepted':got,'reason':reason,'kind':'SOURCE_EXTRACTED_PYTHON_FAKE_ONLY_NOT_NATIVE'})
check('native0-success',fixture(True),True,True)
for code in [1,7,255]:check('nonnull-native-refusal-'+str(code),fixture(False,code),False,True)
mutations=[('null-native-exit','nativeExit',None),('negative-native-exit','nativeExit',-1),('fractional-native-exit','nativeExit',1.5),('boolean-is-not-exit','nativeExit',True),('zero-cannot-be-refusal','nativeExit',0),('signalled-with-message','signal','SIGTERM'),('signal-fact-missing','signalKnown',False),('spawn-ENOENT','setupErrorCode','ENOENT'),('timeout-setup','setupErrorCode','ETIMEDOUT'),('buffer-setup','setupErrorCode','ENOBUFS'),('embedded-spawn-error','spawnErrorPresent',True),('missing-stdout','stdoutKnown',False),('missing-stderr','stderrKnown',False),('missing-message','messageKnown',False),('wrong-stdout-hash','stdoutSha256','b'*64),('wrong-stderr-message-binding','mergedErrorSha256','b'*64),('wrong-cwd','cwd','/other'),('wrong-chart-preimage','chartBeforeSha256','b'*64),('wrong-chart-after','chartAfterSha256','b'*64),('null-chart-after','chartAfterSha256',None),('unobserved-frame','observerComplete',False),('changed-native-options','optionsMatched',False),('wrong-native-executable','executable','other-helm'),('wrong-expected-argv','argvSha256','b'*64),('no-native-throw-for-refusal','nativeThrew',False),('wrong-exit-provenance','exitSource','EXECFILESYNC_RETURN')]
for name,key,value in mutations:
 obj=fixture(False);obj['frames'][0][key]=value;check(name,obj,False,False)
for key in ['nativeExit','signal','signalKnown','setupErrorCode','chartBeforeSha256','argv','stdoutSha256']:
 obj=fixture(False);del obj['frames'][0][key];check('missing-'+key,obj,False,False)
obj=fixture(False);obj['frames'][0]['argv']=['helm','template','other'];check('argv-self-hash-mismatch',obj,False,False)
obj=fixture(False);obj['frames'][0]['argv']=['helm','template','other'];obj['frames'][0]['argvSha256']=argvhash(obj['frames'][0]['argv']);check('self-consistent-but-wrong-invocation',obj,False,False)
obj=fixture(False);obj['frames']=[];check('missing-template-call',obj,False,False)
obj=fixture(False);obj['frames']*=2;check('duplicate-template-call',obj,False,False)
obj=fixture(False);obj['observerErrors']=['late chart hash IO error'];check('late-observer-IO',obj,False,False)
obj=fixture(False);obj['builtinRestored']=False;check('builtin-restore-failed',obj,False,False)
obj=fixture(False);obj['outcome']['ok']=True;check('parsed-outcome-disagrees',obj,False,False)
obj=fixture(False);obj['outcome']['raw']='different';check('native-stdout-harness-disagreement',obj,False,False)
obj=fixture(False);obj['outcome']['error']+='unbound error';check('native-error-harness-disagreement',obj,False,False)
obj=fixture(True);obj['outcome']['ok']=False;obj['outcome']['error']=intended;check('native0-parser-error-is-not-refusal',obj,False,False)
obj=fixture(True);obj['frames'][0]['nativeExit']=2;check('nonzero-is-not-success',obj,True,False)
obj=fixture(True);obj['outcome']['error']='parser error';check('success-cannot-carry-error',obj,True,False)
# Complete oracle retains the old diagnostic/property assertions beyond native facts.
obj=fixture(False);obj['outcome']['error']='unrelated provider error';obj['frames'][0]['mergedErrorSha256']=rawhash(obj['outcome']['error']);assert evaluate(obj,expected,False)[0] is True
assert intended not in obj['outcome']['error']
# Structural pass-through reconstruction: original call once with exact this/args, same return/throw.
required=['result = Reflect.apply(original, this, call);','throw nativeError;','return result;','childProcess.execFileSync = original;','syncBuiltinESMExports();','if (!builtinRestored || observerErrors.length > 0) observerPoisoned = true;']
for token in required:assert token in s
assert s.count('result = Reflect.apply(original, this, call);')==1
assert s.count('throw nativeError;')==1
assert s.count('return result;')==1
# Lightweight fake of these explicit pass-through edges, preserving identity under observer IO failure.
class NativeFailure(Exception):pass
for nativeThrows in [False,True]:
 for beforeIO in [False,True]:
  for afterIO in [False,True]:
   calls=[];result=object();failure=NativeFailure('fixture');actualArgs=object();actualThis=object();observerFaults=[]
   def original(this,args):
    calls.append((this,args))
    if nativeThrows:raise failure
    return result
   def edge():
    if beforeIO:observerFaults.append('before')
    try:r=original(actualThis,actualArgs)
    except NativeFailure as e:
     if afterIO:observerFaults.append('after')
     raise e
    if afterIO:observerFaults.append('after')
    return r
   try:assert edge() is result and not nativeThrows
   except NativeFailure as e:assert nativeThrows and e is failure
   assert calls==[(actualThis,actualArgs)] and len(calls)==1
   assert len(observerFaults)==int(beforeIO)+int(afterIO)
# Both one-call observation integration and all original mutation/recovery/source inventories retained.
new=(O/'private-repo/studio-runner/test/deployment/gateway-independent-mutants.test.ts').read_text();oldts=(P/'private-repo/studio-runner/test/deployment/gateway-independent-mutants.test.ts').read_text()
assert new.count('() => renderOutcome({ chartDir: chart.directory, args })')==1
assert new.count("  it('")==oldts.count("  it('")==2
assert new[new.index('    const controls = ['):new.index('    for (const component')] == oldts[oldts.index('    const controls = ['):oldts.index('    for (const component')]
for token in ['validateNativeObservation(observed, expectedNative, accepts);','...observed.nativeErrors, ...observed.observerErrors','expect(outcome.error).toContain(intended)','toMatchObject(control.properties)','toHaveLength(20)','`${id}-restored-chart`']:
 assert token in new
assert len(load(O/'original-80-case-map.json')['ids'])==80
# Reconstruct both exact review-patch targets entirely in memory, with no fuzz/offset or repo apply.
def apply_patch(before,patch):
 lines=before.splitlines(True);delta=patch.splitlines(True);result=[];cursor=0;i=2
 assert delta[0].startswith('--- ') and delta[1].startswith('+++ ')
 while i<len(delta):
  match=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n',delta[i]);assert match,delta[i]
  count=int(match[2] or '1');start=int(match[1])-1 if count else int(match[1]);assert start>=cursor
  result.extend(lines[cursor:start]);cursor=start;i+=1;oldcount=newcount=0
  while i<len(delta) and not delta[i].startswith('@@ '):
   x=delta[i];assert x[0] in ' +-'
   if x[0] in ' -':assert lines[cursor]==x[1:];cursor+=1;oldcount+=1
   if x[0] in ' +':result.append(x[1:]);newcount+=1
   i+=1
  assert oldcount==count and newcount==int(match[4] or '1')
 result.extend(lines[cursor:]);return ''.join(result)
patch=(O/'scratch-exit-observation.patch').read_text();parts=patch.split('--- /dev/null\n');assert len(parts)==2
assert apply_patch(oldts,parts[0])==new
assert apply_patch('','--- /dev/null\n'+parts[1])==s
assert sha(Q/'review.md')=='95aab40df1cff7735f97542488a3f7f830544f6569f3ee9df11201761c0514e0'
commands=load(O/'future-commands.json');assert commands['currentPackageRelativePath']==str(O.relative_to(ROOT))
assert commands['expectedTestCount']==2 and commands['expectedHelmTemplateOutcomes']==40
nativeContracts={'status':'FAKE_CONTRACTS_PASSED_TYPESCRIPT_NATIVE_UNEXECUTED','sourceSha256':sha(source),'exactSourceClauses':[{'name':n,'expression':e} for n,e in clauses],'accepted':sum(x['observedAccepted'] for x in results),'rejected':sum(not x['observedAccepted'] for x in results),'contracts':results,'passThroughIdentityCases':8,'passThroughMethod':'Source-edge reconstruction and Python stubs only; no JS engine/native execution','completeOracleRequiresOriginalDiagnosticAndMountedPropertyAssertions':True}
(O/'native-contracts.json').write_text(json.dumps(nativeContracts,indent=2)+'\n')
(O/'preservation.json').write_text(json.dumps({'originalManifestSha256':sha(P/'manifest.json'),'originalManifestArtifacts':48,'originalReviewInputSeal':review['inputSeal'],'originalReviewActualInputSeal':review['actualInputSeal'],'all67OriginalFilesAnd29ActualInputsMatched':True,'unchangedCopiedRunnerInputs':7,'unchangedPrivateFixedChartFiles':22,'unchangedMutants':2,'original80InventoryChange':0,'scratchCases':2,'plannedMeasurements':40},indent=2)+'\n')
print(json.dumps({'accepted':nativeContracts['accepted'],'rejected':nativeContracts['rejected'],'sourceClauses':len(clauses),'fakePassThroughIdentityCases':8,'allOriginal67AndActual29InputsMatched':True,'nativeCommandsExecuted':0}))
