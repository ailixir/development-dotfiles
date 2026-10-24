"""Independent narrow source review; no author entrypoint, JS engine or native subprocess."""
import ast
import copy
import hashlib
import json
import re
import stat
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path.cwd()
T0 = ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'
OLD = T0/'early/gateway-independent-mutants'
NEW = OLD/'resume2'
PRIOR = T0/'qa/gateway-independent-mutants-review'
OUT = T0/'qa/gateway-independent-mutants-resume2-review'
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def bh(s): return hashlib.sha256(s.encode()).hexdigest()
def ah(v): return bh(json.dumps(v, separators=(',',':'), ensure_ascii=False))
def load(p): return json.loads(p.read_text())
def mode(p): return f'{stat.S_IMODE(p.stat().st_mode):04o}'
checks=[]
def check(name, valid):
    assert valid, name
    checks.append(name)
check('prior independent review bound', digest(PRIOR/'review.md') == '95aab40df1cff7735f97542488a3f7f830544f6569f3ee9df11201761c0514e0')
check('new manifest bound', digest(NEW/'manifest.json') == '06107221f5863414867f79831e69758253252ff1d991663db460200882a80d54')
check('new receipt bound', digest(NEW/'receipt.md') == '31ca9405c1e7d021e540f3a1da3e39b090a7e5395ee394b9dd707b159a89260f')
check('new checkpoint bound', digest(NEW/'CHECKPOINT.md') == '42361a57d12e0186b2908934c7c255c990d2a0db2d98e0bffc4e29dcd7ccca96')
prior=load(PRIOR/'audit.json')
seals={**prior['inputSeal'],**prior['actualInputSeal']}
for path, seal in seals.items():
    p=ROOT/path
    check('carry exact '+path, digest(p)==seal['sha256'] and mode(p)==seal['mode'])
manifest=load(NEW/'manifest.json')
newseal={}
for row in manifest['artifacts']:
    p=NEW/row['path']
    check('new artifact '+row['path'],digest(p)==row['sha256'] and p.stat().st_size==row['bytes'] and mode(p)==row['mode'])
    newseal[str(p.relative_to(ROOT))]={'sha256':digest(p),'mode':mode(p)}
check('63 sealed artifacts',len(manifest['artifacts'])==63)
preservation=load(NEW/'preservation.json')
check('original seal copied exactly', preservation['originalReviewInputSeal']==prior['inputSeal'])
check('actual seal copied exactly', preservation['originalReviewActualInputSeal']==prior['actualInputSeal'])
for row in load(OLD/'manifest.json')['artifacts']:
    name=row['path']
    if name.startswith(('private-repo/helm-chart/','mutants/')) or name in ('mutations.json','chart-bindings.json','original-80-case-map.json'):
        check('unchanged current carried source '+name,digest(NEW/name)==row['sha256'] and mode(NEW/name)==row['mode'])
for row in load(NEW/'chart-bindings.json')['unchangedRunnerCopies']:
    p=NEW/'private-repo'/row['path']
    check('unchanged runner copy '+row['path'],digest(p)==row['sha256'] and mode(p)==row['mode'])
for row in load(NEW/'review-inputs.json')['references']:
    check('new review reference '+row['path'],digest(ROOT/row['path'])==row['sha256'])

def apply(before,patch):
    src=before.splitlines(keepends=True);lines=patch.splitlines(keepends=True)
    result=[];cursor=0;i=2
    while i<len(lines):
        m=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*\n?',lines[i]);assert m
        oldcount=int(m[2] or 1);start=int(m[1])-1 if oldcount else int(m[1]);assert start>=cursor
        result+=src[cursor:start];cursor=start;i+=1;oc=nc=0
        while i<len(lines) and not lines[i].startswith('@@ '):
            line=lines[i];assert line[0] in ' +-'
            if line[0] in ' -':assert src[cursor]==line[1:];cursor+=1;oc+=1
            if line[0] in ' +':result.append(line[1:]);nc+=1
            i+=1
        assert oc==oldcount and nc==int(m[4] or 1)
    return ''.join(result+src[cursor:])

rel='private-repo/studio-runner/test/deployment/'
observer=(NEW/rel/'gateway-native-observer.ts').read_text()
scratch=(NEW/rel/'gateway-independent-mutants.test.ts').read_text()
oldtest=(OLD/rel/'gateway-independent-mutants.test.ts').read_text()
parts=(NEW/'scratch-exit-observation.patch').read_text().split('--- /dev/null\n')
check('exact existing scratch patch reconstruction',len(parts)==2 and apply(oldtest,parts[0])==scratch)
check('exact added observer patch reconstruction',apply('','--- /dev/null\n'+parts[1])==observer)
check('unchanged controls and loop expansion',oldtest[oldtest.index('    const controls = ['):oldtest.index('    for (const component')] == scratch[scratch.index('    const controls = ['):scratch.index('    for (const component')])
check('unchanged restoration and cleanup body',oldtest[oldtest.index('    try {\n      if (!existsSync(mutant))'):oldtest.index('    writeFileSync(join(evidenceDir, `${id}-receipt.json`)')] == scratch[scratch.index('    try {\n      if (!existsSync(mutant))'):scratch.index('    try {\n      writeFileSync(join(evidenceDir, `${id}-receipt.json`)')])
check('one existing render call site',scratch.count('() => renderOutcome({ chartDir: chart.directory, args })')==1)
check('two identical scratch IDs',re.findall(r"\bit\('([^']+)'",oldtest)==re.findall(r"\bit\('([^']+)'",scratch))
check('40-render native plan retained',load(NEW/'future-commands.json')['expectedHelmTemplateOutcomes']==40)
check('80 published IDs carried unchanged',digest(NEW/'original-80-case-map.json')==digest(OLD/'original-80-case-map.json'))
for text in ['validateNativeObservation(observed, expectedNative, accepts);','expect(outcome.error).toContain(intended);','.toMatchObject(control.properties);','nativeFrames: observed.frames','...observed.nativeErrors, ...observed.observerErrors']:
    check('scratch integration '+text,text in scratch)
for text in ['result = Reflect.apply(original, this, call);','throw nativeError;','return result;']:
    check('single transparent measured edge '+text,observer.count(text)==1)
for text in ["return Reflect.apply(original, this, call);",'childProcess.execFileSync = wrapper;','syncBuiltinESMExports();',"if (esmExecFileSync !== wrapper)",'childProcess.execFileSync = original;','builtinRestored = childProcess.execFileSync === original && esmExecFileSync === original;', 'if (!builtinRestored || observerErrors.length > 0) observerPoisoned = true;']:
    check('observer edge '+text,text in observer)
module_types=ROOT/'studio-runner/node_modules/@types/node/module.d.ts'
child_types=ROOT/'studio-runner/node_modules/@types/node/child_process.d.ts'
check('installed ESM synchronization contract', 'updates all the live bindings' in module_types.read_text() and 'to match the properties of the `CommonJS` exports' in module_types.read_text())
check('installed synchronous return/failure contract','will not\n     * return until the child process has fully closed' in child_types.read_text() and 'non-zero exit code, this method will throw' in child_types.read_text())

# Own source-expression interpreter: no author fake vectors, imports, eval or JS execution.
MISSING=object()
def eq(a,b):
    if a is MISSING or b is MISSING:return a is b
    if type(a) is bool or type(b) is bool:return type(a) is type(b) and a is b
    if a is None or b is None:return a is b
    return a==b
def expression(node,env):
    if isinstance(node,ast.Expression):return expression(node.body,env)
    if isinstance(node,ast.Constant):return node.value
    if isinstance(node,ast.Name):return env[node.id]
    if isinstance(node,ast.Attribute):return expression(node.value,env).get(node.attr,MISSING)
    if isinstance(node,ast.UnaryOp) and isinstance(node.op,ast.Not):return not expression(node.operand,env)
    if isinstance(node,ast.BoolOp):
        if isinstance(node.op,ast.And):return all(expression(n,env) for n in node.values)
        if isinstance(node.op,ast.Or):return any(expression(n,env) for n in node.values)
    if isinstance(node,ast.Compare):
        assert len(node.ops)==1
        a,b=expression(node.left,env),expression(node.comparators[0],env)
        op=node.ops[0]
        if isinstance(op,ast.Eq):return eq(a,b)
        if isinstance(op,ast.NotEq):return not eq(a,b)
        if isinstance(op,ast.GtE):return a>=b
    if isinstance(node,ast.Call):
        assert isinstance(node.func,ast.Name) and node.func.id in ('isInteger','argvHash','byteHash','len')
        args=[expression(x,env) for x in node.args]
        return {'isInteger':lambda x:type(x) is int,'argvHash':ah,'byteHash':bh,'len':len}[node.func.id](*args)
    raise ValueError('unknown source expression '+ast.dump(node))
block=observer.split('const checks: [string, boolean][] = [\n',1)[1].split('\n  ];',1)[0]
clauses=[]
for line in block.splitlines():
    m=re.fullmatch(r"    \['([A-Z_]+)', (.*)\],",line);assert m
    e=m[2].replace('!==',' != ').replace('===',' == ').replace('&&',' and ').replace('||',' or ')
    e=re.sub(r'!(?!=)',' not ',e).replace('Number.isInteger','isInteger').replace('observerErrors.length','len(observerErrors)')
    for a,b in [('true','True'),('false','False'),('null','None')]:e=re.sub(r'\b'+a+r'\b',b,e)
    clauses.append((m[1],m[2],ast.parse(e.strip(),mode='eval')))
check('17 exact source clauses parsed',len(clauses)==17)
argv=['helm','template','release-name','OWNED_CHART','--set-json','backend.configOverrides={}']
expected={'argvSha256':ah(argv),'cwd':'OWNED_CWD','chartSha256':'c'*64}
def fixture(accepts,status=3):
    err='' if accepts else 'configOverrides property studio.gateway.provider is managed by the chart\noriginal native message'
    raw='parsed manifest' if accepts else ''
    f={'executable':'helm','argv':argv[:],'argvSha256':ah(argv),'cwd':expected['cwd'],'optionsMatched':True,'chartBeforeSha256':expected['chartSha256'],'chartAfterSha256':expected['chartSha256'],'nativeExit':0 if accepts else status,'signal':None,'signalKnown':True,'setupErrorCode':None,'spawnErrorPresent':False,'nativeThrew':not accepts,'stdoutKnown':True,'stdoutSha256':bh(raw),'stderrKnown':not accepts,'messageKnown':not accepts,'mergedErrorSha256':bh(err) if not accepts else None,'observerComplete':True,'exitSource':'EXECFILESYNC_RETURN' if accepts else 'THROWN_NATIVE_STATUS'}
    return {'frames':[f],'outcome':{'ok':accepts,'raw':raw,'error':err},'observerErrors':[],'builtinRestored':True}
def classify(o,accepts):
    if len(o['frames'])!=1:return False,'ONE_FRAME'
    env={'f':o['frames'][0],'outcome':o['outcome'],'expected':expected,'accepts':accepts,'observerErrors':o['observerErrors'],'builtinRestored':o['builtinRestored']}
    for name,_,tree in clauses:
        try:valid=expression(tree,env)
        except (TypeError,ValueError,KeyError):return False,name+'_MALFORMED'
        if valid is not True:return False,name
    return True,'ACCEPTED'
vectors=[]
def vector(name,o,accepts,want):
    result,reason=classify(o,accepts);assert result==want,(name,result,reason)
    vectors.append({'name':name,'expectedAccepted':want,'observedAccepted':result,'reason':reason})
vector('returned success',fixture(True),True,True)
for status in (1,3,17,255):vector('refusal status '+str(status),fixture(False,status),False,True)
for field,value in [('nativeExit',None),('nativeExit',-1),('nativeExit',True),('nativeExit',1.25),('nativeExit',0),('signal','SIGTERM'),('signalKnown',False),('setupErrorCode','ENOENT'),('setupErrorCode','ENOBUFS'),('setupErrorCode','ETIMEDOUT'),('spawnErrorPresent',True),('stdoutKnown',False),('stderrKnown',False),('messageKnown',False),('stdoutSha256','bad'),('mergedErrorSha256','bad'),('chartBeforeSha256','bad'),('chartAfterSha256','bad'),('observerComplete',False),('cwd','OTHER'),('executable','OTHER'),('optionsMatched',False),('nativeThrew',False),('exitSource','EXECFILESYNC_RETURN')]:
    o=fixture(False);o['frames'][0][field]=value;vector('reject '+field+' '+str(value),o,False,False)
for field in fixture(False)['frames'][0]:
    o=fixture(False);del o['frames'][0][field];vector('missing field '+field,o,False,False)
for count in (0,2):
    o=fixture(False);o['frames']*=count;vector('frame count '+str(count),o,False,False)
for field,value in [('observerErrors',['late IO']),('builtinRestored',False)]:
    o=fixture(False);o[field]=value;vector('observation '+field,o,False,False)
o=fixture(False);o['frames'][0]['argv']=['other'];o['frames'][0]['argvSha256']=ah(['other']);vector('self-consistent wrong argv',o,False,False)
o=fixture(False);o['outcome']['raw']='different';vector('stdout disagreement',o,False,False)
o=fixture(False);o['outcome']['error']='different';vector('stderr disagreement',o,False,False)
o=fixture(True);o['outcome']['ok']=False;o['outcome']['error']='parser error';vector('native0 parser failure cannot be refusal',o,False,False)
o=fixture(False);o['outcome']['ok']=True;vector('parsed success cannot bind nonzero refusal',o,False,False)
o=fixture(True);o['outcome']['error']='parser error';vector('success cannot carry parser error',o,True,False)

# Python model of the source-audited identity edges, not execution of Node/ESM/TS.
identity=[]
for native_throws in (False,True):
    for fail_at in ('none','before','after','restore'):
        sentinel_result=object();sentinel_error=RuntimeError('original');this=object();args=object();calls=[];faults=[]
        def original(receiver,actual):
            calls.append((receiver,actual))
            if native_throws:raise sentinel_error
            return sentinel_result
        def model():
            if fail_at=='before':faults.append('before')
            try:
                try:r=original(this,args)
                except RuntimeError as native:
                    if fail_at=='after':faults.append('after')
                    raise native
                if fail_at=='after':faults.append('after')
                return r
            finally:
                if fail_at=='restore':faults.append('restore')
        try:check('model exact return '+fail_at,model() is sentinel_result and not native_throws)
        except RuntimeError as e:check('model exact throw '+fail_at,native_throws and e is sentinel_error)
        check('model one exact this/args '+str(native_throws)+fail_at,len(calls)==1 and calls[0][0] is this and calls[0][1] is args)
        identity.append({'nativeThrows':native_throws,'faultAt':fail_at,'originalIdentityRetained':True,'oneOriginalCall':True,'observerPoisonRequired':bool(faults)})

for path,seal in {**seals,**newseal}.items():
    check('final preservation '+path,digest(ROOT/path)==seal['sha256'] and mode(ROOT/path)==seal['mode'])
result={'kind':'INDEPENDENT_NARROW_STATIC_REVIEW_ONLY','timestampUtc':datetime.now(timezone.utc).isoformat(),'checksPassed':len(checks),'checks':checks,'priorInputFilesCarried':len(prior['inputSeal']),'actualInputsPreserved':len(prior['actualInputSeal']),'newManifestArtifactsVerified':len(newseal),'sourceClauses':[{'name':n,'expression':e} for n,e,_ in clauses],'fakeClassifierVectors':vectors,'fakeAccepted':sum(v['observedAccepted'] for v in vectors),'fakeRejected':sum(not v['observedAccepted'] for v in vectors),'sourceEdgeIdentityModels':identity,'installedTypes':[{'path':str(p.relative_to(ROOT)),'sha256':digest(p)} for p in (module_types,child_types)],'nativeCommandsExecuted':0,'typescriptExecuted':False,'sourceApplied':False,'requiredFindings':[],'priorFinding':'GWM-EXIT-01 CLOSED STATICALLY ONLY'}
(OUT/'audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ('checksPassed','priorInputFilesCarried','actualInputsPreserved','newManifestArtifactsVerified','fakeAccepted','fakeRejected','requiredFindings')}))
