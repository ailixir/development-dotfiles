"""Independent archived-runtime audit. No compiler/VM/probe/author code execution."""
from pathlib import Path
import hashlib,json,os,re,stat,struct,io,textwrap,zipfile
from datetime import datetime,timezone

ROOT=Path.cwd();T0=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'
RUN=T0/'runtime/obs011-wait-conformance-20261019-0616-once'
ARC=RUN/'complete-scratch-archive'
ITS=T0/'early/it-s-draft/resume2';BRIDGE=T0/'early/gs-t2-draft/resume2'
OUT=T0/'qa/wait-234-runtime-review';checks=[];facts={}
def check(name,value):
    assert value,name
    checks.append(name)
def read(p):
    for a in [p,*p.parents]:assert not a.is_symlink()
    s=p.lstat();assert stat.S_ISREG(s.st_mode)
    b=p.read_bytes();e=p.lstat()
    assert (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns,s.st_mode)==(e.st_dev,e.st_ino,e.st_size,e.st_mtime_ns,e.st_ctime_ns,e.st_mode)
    record={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'mtimeNs':s.st_mtime_ns,'mode':f'{stat.S_IMODE(s.st_mode):04o}'}
    if p in facts:assert facts[p]==record
    facts[p]=record;return b
def sha(p):return hashlib.sha256(read(p)).hexdigest()
def shatext(t):return hashlib.sha256(t.encode()).hexdigest()
def load(p):return json.loads(read(p))
def write(name,v):
    fd=os.open(OUT/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump(v,f,indent=2);f.write('\n')

context=ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/wait-234-runtime-review-context.txt'
pins=re.findall(r'^(.+) SHA256 ([0-9a-f]{64})$',read(context).decode(),re.M)
for name,digest in pins:check('dispatch pin '+Path(name).name,sha(ROOT/name)==digest)
check('prior independent static review',sha(T0/'qa/bridge-its-drafts-rereview/review.md')=='bf82f3ee582a0725eb8dc324c42a460dade9e615aa4d933522af3279944584a5')
authorization=load(RUN/'root-authorization.json');terminal=load(RUN/'root-terminal-archive.json');identity=load(RUN/'wrapper-identity.json');consumed=load(RUN/'launch-consumed.json');receipt=load(ARC/'receipt.json')
check('authorized one shot',authorization['authorized'] is True and consumed['oneShot'] is True and consumed['automaticRetry'] is False and terminal['automaticRetry'] is False)
check('phase bounds',authorization['phaseBoundsSeconds']==[30,60] and [x['maximumSeconds'] for x in receipt['phases']]==[30,60])
check('both actual exits zero',len(receipt['phases'])==2 and all(x['exit']==0 for x in receipt['phases']) and terminal['wrapperExit']==0)
check('recorded wrapper kernel identity',identity['pid']==terminal['wrapperPid']==41867 and 'Mon Oct 19 02:15:24 2026' in identity['kernelObservation'] and terminal['endPsExit']==1 and terminal['endPsOutput']=='')
check('authorization and launch wrapper binding',identity['authorizationSha256']==sha(RUN/'root-authorization.json') and identity['wrapperSourceSha256']==sha(RUN/'execute_once.py'))
lock=ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py'
launcher=ITS/'conformance/run_later.py'
check('immutable lock and launcher binding',sha(lock)==authorization['lockWrapperSha256'] and sha(launcher)==authorization['launcherSha256'])
check('one exact lock invocation',identity['command'][1:]==[str(lock),identity['command'][0],str(launcher),'--execute','--java-home',authorization['java21Home'],'--scratch-directory',authorization['scratch']])
wrapper_log=read(RUN/'wrapper.stdout').decode()
check('one lock acquired/released',wrapper_log.count('[gradle-lock] acquired')==1 and wrapper_log.count('[gradle-lock] released, exit 0')==1 and read(RUN/'wrapper.stderr')==b'')
launch_source=read(launcher).decode();outer_source=read(RUN/'execute_once.py').decode()
check('exclusive consumed marker and no automatic loop',"(D / 'launch-consumed.json').open('x')" in outer_source and 'process.wait()' in outer_source and 'scratch.mkdir(exist_ok=False)' in launch_source)
check('sequential bounded subprocesses',launch_source.count('subprocess.run(command, capture_output=True, text=True, timeout=timeout)')==1 and 'for index, (command, timeout) in enumerate(commands):' in launch_source and "if process.returncode:\n                break" in launch_source)
archive_files={str(p.relative_to(ARC)):sha(p) for p in sorted(ARC.rglob('*')) if p.is_file() or p.is_symlink()}
check('complete archive matches recorded closed inventory',archive_files==terminal['completeScratchFiles'] and terminal['archiveMatchesScratch'] is True)
for p in ARC.rglob('*'):
    if p.is_file():check('archive protected '+p.name,stat.S_IMODE(p.stat().st_mode)==0o600)
check('empty compiler/error streams',all(read(ARC/name)==b'' for name in ['phase0.stdout','phase0.stderr','phase1.stderr']))
check('exact actual complete stdout',read(ARC/'phase1.stdout')==b'Compared 234 original/delivered observations; native gates remain mandatory\n')
bindings=load(ITS/'conformance/bindings.json');classpath=load(ITS/'conformance/classpath.json')
check('archived Java equals reviewed generated source',sha(ARC/'WaitConformance.java')==sha(ITS/'conformance/WaitConformance.java')==bindings['generatedJavaSha256']==receipt['sourceSha256'])
check('receipt exact bindings',sha(ITS/'conformance/bindings.json')==receipt['bindingSha256'])
cp=os.pathsep.join(x['path'] for x in classpath['jars'])
check('exact compiler command',receipt['phases'][0]['command']==[authorization['java21Home']+'/bin/javac','-cp',cp,'-d',authorization['scratch'],authorization['scratch']+'/WaitConformance.java'])
check('exact runtime command',receipt['phases'][1]['command']==[authorization['java21Home']+'/bin/java','-cp',authorization['scratch']+os.pathsep+cp,'WaitConformance'])
for row in classpath['jars']:check('cached jar '+Path(row['path']).name,sha(Path(row['path']))==row['sha256'])
jdk=Path(authorization['java21Home'])
for name,digest in authorization['jdkFiles'].items():check('cached Java21 '+name,sha(jdk/name)==digest)
check('cached JDK release is21',b'JAVA_VERSION="21.0.10"' in read(jdk/'release'))

source=read(ARC/'WaitConformance.java').decode()
# Preserve literals, erase comments/whitespace for exact structural token containment.
def tokens(s):return re.findall(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[A-Za-z_$][\w$]*|\d+|\S',re.sub(r'/\*[\s\S]*?\*/|//[^\n]*','',s))
def mask(s):
    return re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|/\*[\s\S]*?\*/|//[^\n]*',lambda m:' '*len(m[0]),s)
masked=mask(source)
def method(name):
    m=re.search(r'\bObject '+re.escape(name)+r'\(\) throws Exception\s*\{',masked);assert m,name
    start=masked.index('{',m.start());depth=1;i=start+1
    while depth:
        depth+=(masked[i]=='{')-(masked[i]=='}');i+=1
    return source[start+1:i-1]
def contains(body,fragment):
    b,f=tokens(body),tokens(fragment)
    return any(b[i:i+len(f)]==f for i in range(len(b)-len(f)+1))
ids=json.loads('['+re.search(r'String\[\] ids=\{(.*?)\};',source,re.S)[1]+']')
modes=json.loads('['+re.search(r'String\[\] modes=\{(.*?)\};',source,re.S)[1]+']')
check('exact26site sequence',ids==[x['id'] for x in bindings['cases']] and len(set(ids))==26)
check('exact9mode sequence',modes==['initial-true-preinterrupt','initial-false-preinterrupt','false-sets-interrupt','immediate-runtime','immediate-error','late-true','late-runtime','late-error','timeout-fallthrough'])
check('52 paired emitted method names',set(re.findall(r'\bObject (s\d+_(?:original|delivered))\(\)',source))=={f's{i}_{v}' for i in range(26) for v in ['original','delivered']})
bridge=load(BRIDGE/'loop-edits.json');its=load(ITS/'loop-edits.json');mapping=[]
for index,(row,binding) in enumerate(zip(bridge+its,bindings['cases'])):
    isbridge=index<14;candidate=BRIDGE/'candidates'/row['path'] if isbridge else ITS/'repo'/row['path']
    prior=read(BRIDGE/'preimages'/row['path'] if isbridge else ITS/'preimages'/row['path']).decode()
    new=row['replacement'];check('exact bound delivered literal '+row['id'],shatext(new)==row['newSha256']==binding['deliveredBoundSha256'] and read(candidate).decode().count(new)==1)
    original_body=method(f's{index}_original');delivered_body=method(f's{index}_delivered')
    if isbridge:
        helper=prior[prior.index('  static void await('):prior.rfind('\n}')]
        check('bridge original helper bound '+row['id'],shatext(helper)==binding['originalBoundSha256'])
        check('bridge original body copied '+row['id'],contains(original_body,helper[helper.index('{')+1:helper.rfind('}')]))
        new=new.replace(row['condition'],'condition.getAsBoolean()').replace('TimeUnit.MILLISECONDS.toNanos('+str(row['timeoutMillis'])+')','TimeUnit.MILLISECONDS.toNanos(timeout)')
    else:
        old=row['originalLoop'];check('IT-S original literal bound '+row['id'],shatext(old)==row['oldSha256']==binding['originalBoundSha256'] and old in prior)
        if row['id']=='Transport-actual-stop':old=old.replace('return;','return "COMPLETED";');new=new.replace('return;','return "COMPLETED";')
        check('IT-S original copied '+row['id'],contains(original_body,old))
    check('actual delivered copied with declared seam adaptation '+row['id'],contains(delivered_body,new))
    post=binding['separateOriginalFinalStatement']
    check('final observation post binding '+row['id'],shatext(post)==binding['separateFinalStatementSha256'])
    if post:check('both final observations retained '+row['id'],contains(original_body,post) and contains(delivered_body,post))
    check('cached first tick/terminal latch/failure order '+row['id'],all(x in delivered_body for x in ['if (terminal)', 'initialAwaitTick', 'if (!', '.terminal)', 'failure = caught;', '.pollInSameThread()', '.dontCatchUncaughtExceptions()']))
    mapping.append({'siteIndex':index,'site':row['id'],'path':row['path'],'originalSha256':binding['originalBoundSha256'],'deliveredSha256':binding['deliveredBoundSha256'],'declaredAdaptations':binding['adaptations'],'bothFinalObservationPresent':bool(post),'modes':9})
main=source[source.index('  public static void main'):]
assertions=['assertThat(now.trace()).as(context+" exact read/effect sequence").isEqualTo(old.trace());','assertThat(now.result()).as(context+" result/marker stability").isEqualTo(old.result());','assertThat(now.interrupt()).as(context+" caller interrupt state").isEqualTo(old.interrupt());','if(old.failure()==first)assertThat(now.failure()).as(context+" first Throwable identity").isSameAs(first);','assertThat(now.handlerStable()).as(context+" unrelated thread handler ownership").isTrue();']
for statement in assertions:check('actual independent observable oracle '+statement,statement in main)
check('outcome-class equality oracle','now.failure().getClass()' in main and 'old.failure().getClass()' in main)
check('comparison increments only after assertions',main.index('compared++;')>max(main.index(x) for x in assertions) and 'catch(' not in main and 'catch (' not in main)
check('reflection retains original Throwable cause','failure=wrapped.getCause();' in source and 'Outcome old=run(i,false,ids[i],mode,first),now=run(i,true,ids[i],mode,first);' in source)
check('fresh fixture for each variant','Probe p=new Probe(mode,first);' in source and 'Fixture f=new Fixture(p,id);' in source)
check('interrupt reset and route caller adapter','Thread.interrupted();' in source and 'if(id.startsWith("Transport-route-idle") && failure instanceof InterruptedException)Thread.currentThread().interrupt();' in source)
check('late second read exceeds bounded budget','budgetMillis=mode.equals("timeout-fallthrough")?0:80;' in source and 'TimeUnit.MILLISECONDS.toNanos(170)' in source and 'return raise(second);' in source)
check('no actual business child or database','final class Child extends Process' in source and 'ProcessBuilder' not in source and 'DriverManager' not in source and 'Runtime.getRuntime' not in source)

# Read classfile format/constant pools only, without javap or a Java runtime.
class_info=[]
def classfile(b):
    f=io.BytesIO(b)
    def n(k):x=f.read(k);assert len(x)==k;return x
    def u1():return n(1)[0]
    def u2():return struct.unpack('>H',n(2))[0]
    def u4():return struct.unpack('>I',n(4))[0]
    assert u4()==0xcafebabe;minor=u2();major=u2();count=u2();cp=[None]*count;i=1
    while i<count:
        tag=u1()
        if tag==1:cp[i]=n(u2()).decode('utf8',errors='replace')
        elif tag in [3,4]:n(4)
        elif tag in [5,6]:n(8);i+=1
        elif tag in [7,8,16,19,20]:cp[i]=u2()
        elif tag in [9,10,11,12,17,18]:cp[i]=(u2(),u2())
        elif tag==15:n(3)
        else:raise ValueError('UNKNOWN_CLASSFILE_TAG')
        i+=1
    u2();this=u2();u2();name=cp[cp[this]]
    for _ in range(u2()):u2()
    def members():
        result=[]
        for _ in range(u2()):
            u2();name=cp[u2()];u2();attrs=[]
            for _ in range(u2()):attr=cp[u2()];payload=n(u4());attrs.append((attr,payload))
            result.append((name,attrs))
        return result
    members();methods=members();attrs={}
    for _ in range(u2()):key=cp[u2()];attrs[key]=n(u4())
    return name,major,methods,cp,attrs
for name in archive_files:
    if not name.endswith('.class'):continue
    cname,major,methods,cpool,attrs=classfile(read(ARC/name))
    check('Java21 compiled class '+name,major==65)
    check('compiled class path '+name,cname+'.class'==name)
    check('compiled SourceFile '+name,'SourceFile' in attrs and cpool[struct.unpack('>H',attrs['SourceFile'])[0]]=='WaitConformance.java')
    class_info.append({'file':name,'majorVersion':major,'methodNames':[x[0] for x in methods],'sha256':archive_files[name]})
    if cname=='WaitConformance$Fixture':check('compiled52 actual paired methods',set(x[0] for x in methods if re.fullmatch('s[0-9]+_(original|delivered)',x[0]))=={f's{i}_{v}' for i in range(26) for v in ['original','delivered']})
    if cname=='WaitConformance':
        check('compiled main oracle methods',all(x in cpool for x in ['assertThat','isEqualTo','isSameAs','isTrue','main','run','getCause']))
        code=next(payload for method,attributes in methods if method=='main' for name,payload in attributes if name=='Code')
        code_len=struct.unpack('>I',code[4:8])[0];exceptions=struct.unpack('>H',code[8+code_len:10+code_len])[0]
        check('actual compiled main catches no assertion',exceptions==0)

# Rehash held source/dist independently; do not touch actual build outputs or scratch runtime data.
plan=load(T0/'early/fullcheck-harness/resume3/plan.json')
for row in plan['source']['files']:check('held source '+row['path'],sha(ROOT/row['path'])==row['sha256'])
for row in plan['source']['dist']['files']:check('held dist '+row['path'],sha(ROOT/'studio-runner/dist'/row['path'])==row['sha256'])
check('root retention flags unchanged',all(terminal[x] is True for x in ['original1808SourceBindingsUnchanged','original238DistBindingsUnchanged']) and terminal['sourceApplied'] is False and terminal['IRApplyClockStarted'] is False)
for path,record in list(facts.items()):check('final stable read '+path.name,sha(path)==record['sha256'])
result={'status':'ACTUAL_PARTIAL_DIFFERENTIAL_RUN_SUPPORTED','atUtc':datetime.now(timezone.utc).isoformat(),'checksPassed':len(checks),'checks':checks,'dispatchPinsVerified':len(pins),'archiveFilesVerified':len(archive_files),'compiledClassesVerified':len(class_info),'siteCount':26,'modesPerSite':9,'comparisons':234,'pairedMethodInvocationsImpliedByAuditedMain':468,'actualCompilerExit':0,'actualJavaExit':0,'actualWrapperExit':0,'sameRunRetryObserved':False,'sourceFilesPreserved':1808,'distFilesPreserved':238,'siteBindings':mapping,'compiledClassFacts':class_info,'inputFacts':[{'path':str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else 'PINNED_CACHED_DEPENDENCY/'+p.name,'fact':r} for p,r in facts.items()],'materialLimitations':['Identical synthetic DB/file/process/condition seams and80ms/zero budgets; no application SQL, ownership, cleanup, privacy or timing proof.','No asynchronous interruption during the library interval; the separately reviewed IRQ run owns that axis.','Stdout records aggregate completion only, not per-comparison traces/branch activation. Actual Java assertions compare the observations but do not preserve their raw values.','First-Throwable identity is asserted when the original actually returns that injected Throwable. Generic failure messages and result object identity are not runtime-equality assertions.','Cached-tick/terminal/final-observation behavior is supported by copied source and differential read/effect oracle for the exercised finite modes, not exhaustive scheduling.'],'requiredFindings':[],'newNativeCompilerProbeCalls':0,'actualBuildOutputsReadOrChanged':False,'privateBusinessDataRead':False,'nativeLaneC8CoverageAC5OrLifecycleCredit':False,'original03AssessmentUnchanged':True,'budgetCeilingUsd':500,'actualSpend':'UNAVAILABLE'}
write('audit.json',result)
print(json.dumps({k:result[k] for k in ['status','checksPassed','dispatchPinsVerified','archiveFilesVerified','compiledClassesVerified','comparisons','requiredFindings']}))
