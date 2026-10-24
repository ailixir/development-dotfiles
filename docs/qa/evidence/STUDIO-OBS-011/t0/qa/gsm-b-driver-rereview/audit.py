from pathlib import Path
import ast,collections,datetime,errno,fcntl,hashlib,json,os,re,shlex,shutil,stat,subprocess,sys,types,tempfile,xml.etree.ElementTree as ET
ROOT=Path.cwd();BASE=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early';PKG=BASE/'gsm-b-draft/resume2';OUT=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/gsm-b-driver-rereview'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
def lex(s):
    # Preserve literals atomically; discard only comments/whitespace.
    pat = r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\S'
    return [m.group() for m in re.finditer(pat,s) if not m.group().startswith(('//','/*'))]
def balanced(ts, i, a='(',b=')'):
    assert ts[i]==a
    n=0
    for j in range(i,len(ts)):
        n += ts[j]==a
        n -= ts[j]==b
        if n==0:return j
    raise AssertionError('unbalanced')
def tests(s):
    ts=lex(s); out=[]; i=0
    while i<len(ts):
        if ts[i]!='@': i+=1;continue
        j=i+2
        while j+1<len(ts) and ts[j]=='.' and re.match(r'^[\w$]+$',ts[j+1]):j+=2
        kind=''.join(ts[i+1:j])
        if kind.split('.')[-1] not in ('Test','ParameterizedTest'):i+=1;continue
        begin=i
        if ts[j]=='(':j=balanced(ts,j)+1
        ann=[]
        while ts[j]=='@':
            a=j;j+=2
            while j+1<len(ts) and ts[j]=='.' and re.match(r'^[\w$]+$',ts[j+1]):j+=2
            if ts[j]=='(':j=balanced(ts,j)+1
            ann.extend(ts[a:j])
        while ts[j]!='(':j+=1
        name=ts[j-1]; end=balanced(ts,j)
        out.append({'method':name,'headerTokens':ts[begin:end+1], 'parameterized':kind.endswith('ParameterizedTest'),'providerTokens':ann})
        i=end+1
    return out
def assertion_roots(s):
    ts=lex(s);out=[]
    for i,t in enumerate(ts):
        if (t.startswith('assertThat') or t in ('assertThrows','assertEquals','assertTrue','assertFalse','fail')) and i+1<len(ts) and ts[i+1]=='(':
            end=balanced(ts,i+1);out.append(ts[i:end+1])
    return out
def testbody(s,name):
    ts=lex(s)
    for i,t in enumerate(ts):
        if t==name and ts[i+1]=='(':
            end=balanced(ts,i+1);j=end+1
            while j<len(ts) and ts[j] not in ('{',';'):j+=1
            if j<len(ts) and ts[j]=='{':return ts[j+1:balanced(ts,j,'{','}')]
    raise AssertionError(name)
def undo_env(ts):
    members={x['afterPerClassEnvironmentMember']:x['beforeStaticField'] for x in load(BASE/'gs-t2-draft/state-reader-map.json')}
    out=[];i=0
    while i<len(ts):
        if ts[i:i+2]==['ENV','.']:
            out.append(members[ts[i+2]]);i+=3
        else:out.append(ts[i]);i+=1
    return out
def undo_directwaits(ts):
    out=[];i=0
    prefix=['org','.','awaitility','.','Awaitility','.','await','(',')']
    while i<len(ts):
        if ts[i:i+len(prefix)]!=prefix:out.append(ts[i]);i+=1;continue
        j=i+len(prefix);timeout=None;until=None
        while ts[j]=='.':
            method=ts[j+1];assert ts[j+2]=='(';end=balanced(ts,j+2);args=ts[j+3:end]
            if method=='atMost':timeout=args[args.index('ofMillis')+2]
            if method=='until':until=args;j=end+1;break
            j=end+1
        assert until and timeout and ts[j]==';'
        j+=1
        # Original helper final fresh read was expanded at each call site.
        arrow=next(k for k in range(len(until)-1) if until[k:k+2]==['-','>'])
        expr=until[arrow+2:]
        expected=['assertThat','(']+expr+[')', '.', 'isTrue','(',')',';']
        assert ts[j:j+len(expected)]==expected
        out+=['await','(']+until+[',',timeout,')',';'];i=j+len(expected)
    return out
def native_names(case, source):
    if not case['parameterized']: return [case['method']+'()']
    pt=case['providerTokens']; h=case['headerTokens'];start=h.index('(',h.index(case['method']))
    args=h[start+1:-1]; segments=[];last=0
    for i,t in enumerate(args):
        if t==',':segments.append(args[last:i]);last=i+1
    segments.append(args[last:]);params=[x[-1] for x in segments]
    if 'EnumSource' in pt:
        enumname=pt[pt.index('EnumSource')+2]; tokens=lex(source);start=tokens.index(enumname,tokens.index('enum'))+1
        assert tokens[start]=='{';end=tokens.index(';',start) if ';' in tokens[start:balanced(tokens,start,'{','}')+1] else balanced(tokens,start,'{','}')
        vals=[[x] for x in tokens[start+1:end] if re.match(r'^[A-Z_0-9]+$',x)]
    else:
        start=pt.index('{');end=balanced(pt,start,'{','}');content=pt[start+1:end]
        if 'CsvSource' in pt:
            vals=[[v.strip() for v in json.loads(t).split(',')] for t in content if t.startswith('"')]
        else:
            vals=[[json.loads(t) if t.startswith('"') else t] for t in content if t!=',']
    assert all(len(v)==len(params) for v in vals)
    return ['['+str(i+1)+'] '+', '.join(k+'='+v for k,v in zip(params,row)) for i,row in enumerate(vals)]
def apply(patch,base):
    lines=patch.splitlines(keepends=True); result={};i=0
    while i<len(lines):
        if not lines[i].startswith('--- '):i+=1;continue
        old=lines[i][4:].strip();new=lines[i+1][4:].strip();i+=2
        path=new.removeprefix('b/'); src=[] if old=='/dev/null' else base[path].decode().splitlines(keepends=True)
        dst=[];pos=0
        while i<len(lines) and not lines[i].startswith('--- '):
            m=re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@',lines[i])
            if not m:i+=1;continue
            start=int(m[1])-1 if int(m[1]) else 0
            assert start>=pos,(path,start,pos)
            dst+=src[pos:start];pos=start;i+=1
            oldcount=newcount=0
            while i<len(lines) and not lines[i].startswith(('@@','--- ')):
                l=lines[i]
                if l.startswith(' '):assert src[pos]==l[1:];dst.append(l[1:]);pos+=1;oldcount+=1;newcount+=1
                elif l.startswith('-'):assert src[pos]==l[1:];pos+=1;oldcount+=1
                elif l.startswith('+'):dst.append(l[1:]);newcount+=1
                elif l.startswith('\\'):pass
                else:raise AssertionError((path,l))
                i+=1
            assert oldcount==int(m[2] or 1) and newcount==int(m[4] or 1),(path,oldcount,newcount)
        dst+=src[pos:];result[path]=''.join(dst).encode()
    return result

checks=[]
def check(name,condition):
    assert condition,name
    checks.append(name)
snap={str(p.relative_to(PKG)):sha(p.read_bytes()) for p in PKG.rglob('*') if p.is_file()}
expected={'receipt.md':'961d0d50280c7431b1ad8954afba8780d763393f870cfb275ac77be9a5964cc8','manifest.json':'388a38f45f03a7106ba8adc9086f74d30b8122df93dfef65d520a82ed3c5e3d0','driver-plan.json':'150f81dcdec2c6fc5ca464c111b68c10d5df1ffabbc2c7c209f8dff5e164701d','run-unit.py':'166ef32ea81cb6ba9a7e88803e10c0c71c9a85698b3635974a630e2a9ab760b0','driver_support.py':'b506a2c7dc5e3d4c5752ea34e1fd5021ff74c84e157e1863dc3f29f3b663391e'}
for p,h in expected.items():check('exact dispatch digest '+p,sha((PKG/p).read_bytes())==h)
for line in (PKG/'artifact-hashes.sha256').read_text().splitlines():
    h,p=line.split('  ',1);check('sealed artifact '+p,sha((PKG/p).read_bytes())==h)
copy=load(PKG/'sealed-original-copy.json')
for row in copy['files']:
    check('original39 immutable '+row['original'],sha((PKG.parent/row['original']).read_bytes())==row['sha256'])
    check('inert/candidate copy '+row['copy'],sha((PKG/row['copy']).read_bytes())==row['sha256'])
manifest=load(PKG/'manifest.json');old=load(PKG.parent/'manifest.json')
for field in ['files','mutants','proofFiles','unchangedGsTBatons','newCaseNames','sessionBeforeNames','sessionAfterNames']:
    check('Java/case/mutant manifest field unchanged '+field,manifest[field]==old[field])
pre={r['path']:(ROOT/r['baseOrigin']).read_bytes() for r in manifest['files'] if r['baseSha256']}
full={r['path']:(PKG/'repo'/r['path']).read_bytes() for r in manifest['files']}
for row in manifest['files']:
    check('candidate bytes '+row['path'],sha(full[row['path']])==row['draftSha256'])
    if row['baseSha256']:check('bound preimage '+row['path'],sha(pre[row['path']])==row['baseSha256'])
changes=apply((PKG/'part-b.patch').read_text(),pre);composed=dict(pre);composed.update(changes)
check('three-path part-b full composition',composed==full and len(changes)==3)
service='backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java'
final=full[service].decode();base=pre[service].decode()
for name,m in manifest['mutants'].items():
    actual=(PKG/'mutants'/(name+'.java.txt')).read_bytes();check('mutant full bytes '+name,sha(actual)==m['serviceSha256'])
    check('mutant patch reconstruct '+name,apply((PKG/'mutants'/(name+'.patch')).read_text(),{service:full[service]})=={service:actual})
check('seven calls plus declaration',len(re.findall(r'\brequireTranslation\(',final))==8)
check('one translation predicate',final.count('translation != null && translation.exists(id)')==1)
side=testbody(final,'sideEffectConfirmation')
mutant=(PKG/'mutants/delete-side-effect.java.txt').read_text()
check('side-effect deletion seven calls to six',len(re.findall(r'\brequireTranslation\(',mutant))==7)
side_start=final.index('  public JsonNode sideEffectConfirmation(',final.index('  public JsonNode sideEffectConfirmation(')+1)
check('side-effect deletion only exact one operation guard',final[:side_start]+final[side_start:].replace('          requireTranslation(id);\n','',1)==mutant)
# Pin both relevant preimage reads independently: wrapper guard and the old late side-effect if.
check('old wrapper guard source', 'require(translation != null && translation.exists(id), "RUNTIME_INCOMPATIBLE", 409);' in base)
check('old side-effect continuation guarded read',bool(re.search(r'if \(translation != null && translation.exists\(id\)\) \{\s*translation.continuation\(id, prefix \?',base)))
neg=full[next(p for p in full if p.endswith('/GuidedAdmissionWithoutTranslationIT.java'))].decode()
check('all five negative identities', [r['method'] for r in tests(neg)]==manifest['newCaseNames'])
check('two actual composition iterations retained','for (boolean installEmptyStore : List.of(false, true))' in neg)
plan=load(PKG/'driver-plan.json')
for p,h in plan['immutableHelpers'].items():check('actual immutable helper '+p,sha((ROOT/p).read_bytes())==h)
check('current fa90 helper distinguished from old1bba',plan['legacyCollectorBinding']['originalSha256'].startswith('1bba89cc') and plan['legacyCollectorBinding']['actualSha256AtPreparation']==plan['legacyCollectorBinding']['prospectiveSha256']==sha((ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend.py').read_bytes()))

# Only AST definitions are evaluated. Every process/lock/signal call below is replaced by fakes.
def definitions(path,namespace):
    tree=ast.parse(path.read_text());nodes=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))]
    exec(compile(ast.Module(body=nodes,type_ignores=[]),str(path)+'#definitions-only','exec'),namespace)
ns=dict(datetime=datetime,errno=errno,fcntl=fcntl,hashlib=hashlib,json=json,os=os,Path=Path,re=re,shlex=shlex,shutil=shutil,stat=stat,subprocess=subprocess,time=__import__('time'))
definitions(PKG/'driver_support.py',ns)
reference=ast.parse((ROOT/plan['ownershipReference']['path']).read_text())
current=ast.parse((PKG/'driver_support.py').read_text())
for name in ['owned_census_keys','classify_owned','pending_owned','ownership_drain_decision']:
    a=next(n for n in current.body if isinstance(n,ast.FunctionDef) and n.name==name);b=next(n for n in reference.body if isinstance(n,ast.FunctionDef) and n.name==name)
    clean=lambda n:ast.dump(ast.Module(body=n.body[1:] if isinstance(n.body[0],ast.Expr) and isinstance(n.body[0].value,ast.Constant) and isinstance(n.body[0].value.value,str) else n.body,type_ignores=[]),include_attributes=False)
    check('accepted ownership executable AST '+name,clean(a)==clean(b))
row=lambda pid=11,ppid=10,start='S':{'pid':pid,'ppid':ppid,'start':start}
unknown=ns['classify_owned'](row(),None,None,'S');check('missing executable stays UNKNOWN',unknown['executableState']=='UNKNOWN')
check('UNKNOWN blocks terminal child',ns['ownership_drain_decision']({11:row()},{(11,'S'):unknown},True)=='WAIT')
check('census failure cannot close',ns['ownership_drain_decision']({}, {},True,False)=='WAIT')
check('live Popen child cannot close',ns['ownership_drain_decision']({}, {},False)=='WAIT')
java=ns['classify_owned'](row(),None,'/jdk/bin/java','S');java=ns['classify_owned'](row(),java,'/bin/sh','S')
check('proven Java exec does not downgrade',java['executableState']=='JAVA')
check('reparented Java retained', (11,'S') in ns['owned_census_keys']({11:row(ppid=1)},{(11,'S'):java},99,10))
check('reparented Java blocks closure',ns['ownership_drain_decision']({11:row(ppid=1)},{(11,'S'):java},True)=='WAIT')
check('actual absence resolves old Java',ns['ownership_drain_decision']({}, {(11,'S'):java},True)=='RESOLVED')
check('PID reuse resolves only old identity',ns['ownership_drain_decision']({11:row(start='NEW')},{(11,'S'):java},True)=='RESOLVED')
check('unowned JVM excluded',(99,'UNOWNED') not in ns['owned_census_keys']({11:row(),99:row(99,1,'UNOWNED')},{},11,10))
for runs,good in [([],False),([{'suffix':'b01','validatedComplete':True}],False),([{'suffix':x,'validatedComplete':True} for x in ['b01','b02']],False),([{'suffix':x,'validatedComplete':True} for x in ['b01','b02','b03']],True)]:
    check('finalized decision complete ordered count '+str(len(runs)),ns['finalized_keep_allowed']('freeze',True,runs,True,[],False)==good)
complete=[{'suffix':x,'validatedComplete':True} for x in ['b01','b02','b03']]
for name,args in [('late IO',('freeze',True,complete,True,['IO'],False)),('final proof',('freeze',True,complete,False,[],False)),('interrupted',('freeze',True,complete,True,[],True)),('no explicit keep',('freeze',False,complete,True,[],False)),('not freeze',('green',True,complete,True,[],False))]:check('keep disallowed '+name,not ns['finalized_keep_allowed'](*args))

# Command/validator contract: execute only the actual extracted nested run with fake native/capture/assessment.
driver=ast.parse((PKG/'run-unit.py').read_text());main=next(n for n in driver.body if isinstance(n,ast.FunctionDef) and n.name=='main');nested=next(n for n in main.body if isinstance(n,ast.FunctionDef) and n.name=='run')
fakebase=OUT/'fake-scratch';fakebase.mkdir(exist_ok=True);scratch=Path(tempfile.mkdtemp(prefix='independent-',dir=fakebase))
commands=[]
class FakeNative:
    def run(self,command,*args):commands.append(command);return 0
class FakeRecorder:
    def emit(self,*a,**kw):pass
cmdns={'boundary':lambda:None,'folder':scratch,'capture':lambda *a:'FAKE_ONLY','sys':types.SimpleNamespace(executable='/FAKE/python'),'native':FakeNative(),'root':scratch,'execution':scratch,'env':{},'expected':[],'time':types.SimpleNamespace(time=lambda:1000),'validate':lambda *a:{'validatedComplete':True},'proof_facts':lambda:{'same':'proof'},'expected_proof':{'same':'proof'},'receipt':{'runs':[]},'rec':FakeRecorder()}
exec(compile(ast.Module(body=[nested],type_ignores=[]),'actual-nested-run-with-only-fakes','exec'),cmdns)
for suffix in ['b01','b02','b03']:cmdns['run'](suffix,'obs011-independent-fake-'+suffix,['example.CompleteIT'])
command_witness=[]
for command in commands:
    tasks=command[command.index('--test-tasks')+1].split(',');required=command[command.index('--require-exec-tasks')+1].split(',') if '--require-exec-tasks' in command else []
    command_witness.append({'declaredTasks':tasks,'actualRequiredExecOption':required,'immutableCollectorDefaultIfOmitted':[],'validatorRequires':tasks,'contractMatches':required==tasks})
check('reproduced real command/validator mismatch for all three',len(command_witness)==3 and all(not w['contractMatches'] for w in command_witness))

# Read-only archived real native receipt as a provenance witness, never launch/alter it.
real=ROOT/'docs/qa/evidence/STUDIO-OBS-011/execution';label='obs011-diag-start1-full01';sealed=load(real/(label+'-results.json'))
vns={'Counter':collections.Counter,'datetime':datetime,'json':json,'Path':Path,'re':re,'ET':ET,'file_state':ns['file_state'],'safe_path':ns['safe_path']}
definitions(PKG/'validate_collector.py',vns)
actual_failure=None
try:vns['validate'](ROOT,real,label,['com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT'],['test','guidedIncrementalTest'],sealed['testcases'],0,datetime.datetime.fromisoformat(sealed['started']).timestamp()+sealed['elapsedSeconds'])
except ValueError as error:actual_failure=str(error)
check('reproduced strict asset mtime rejection of genuine sealed green native receipt',actual_failure=='ARCHIVE_HASH_SIZE_OR_ORIGINAL_FRESHNESS_INVALID' and sealed['exit']==sealed['gradleExit']==0)
start=datetime.datetime.fromisoformat(sealed['started']).timestamp();oldassets=[{'path':e['path'],'sha256':e['sha256'],'mode':e['mode'],'bytes':e['bytes'],'olderThanStartSeconds':round(start-e['mtimeNs']/1e9,3)} for e in sealed['testHtmlFiles'] if e['mtimeNs']/1e9<start]
check('only six CSS/JS report assets predate native start',len(oldassets)==6 and all(Path(x['path']).suffix in {'.css','.js'} for x in oldassets))
check('old assets actual bytes/hashes/modes still exact',all(sha((ROOT/x['path']).read_bytes())==x['sha256'] and (ROOT/x['path']).stat().st_size==x['bytes'] and oct(stat.S_IMODE((ROOT/x['path']).stat().st_mode))==x['mode'] for x in oldassets))

# Actual parent verifier, with only local dummy files and fake PID/lsof/flock observations.
class OSProxy:
    def __getattr__(self,name):return getattr(os,name)
    def getppid(self):return 321
    def getpid(self):return 10
proxy=OSProxy();realns=dict(ns)
lockroot=scratch/'lock-fixture';lockroot.mkdir();wrapper=lockroot/'with-gradle-lock.py';wrapper.write_bytes(b'IMMUTABLE_FAKE_WRAPPER');lockfile=lockroot/'gradle.lock';lockfile.write_bytes(b'')
info=lockfile.stat();tail=[str(wrapper),sys.executable,str(lockroot/'run-unit.py'),'freeze','obs011-fake','--authorization',str(lockroot/'auth.json'),'--root-proof-barrier-released'];command=[sys.executable,*tail]
for mode in ['valid','marker','wrong-start','wrong-device','split-fd','no-kernel-denial','wrapper-changed']:
    actual=command if mode!='marker' else [sys.executable,'unrelated.py','--marker='+str(wrapper),*tail[1:]]
    pid=lambda p,column:('START' if column=='lstart' else shlex.join(actual))
    dev=info.st_dev+(1 if mode=='wrong-device' else 0)
    observation=f'p321\nf7\nD{hex(dev)}\ni{info.st_ino}\nn{lockfile}\nlW\n'
    if mode=='split-fd':observation=f'p321\nf7\nD{hex(info.st_dev)}\ni0\nn{lockfile}\nf8\nD0x0\ni{info.st_ino}\nn{lockfile}\n'
    def flock(fd,operation):
        if mode!='no-kernel-denial':raise BlockingIOError(errno.EAGAIN,'fake denial only')
    ns.update(os=proxy,pid_text=pid,capture=lambda *a:observation,fcntl=types.SimpleNamespace(flock=flock,LOCK_EX=fcntl.LOCK_EX,LOCK_NB=fcntl.LOCK_NB,LOCK_UN=fcntl.LOCK_UN))
    bound=ns['ParentLock'](lockroot,wrapper,sha(b'IMMUTABLE_FAKE_WRAPPER') if mode!='wrapper-changed' else sha(b'DIFFERENT'),tail,sys.executable)
    if mode=='wrong-start':bound.start='OLD'
    rejected=False
    try:bound.verify()
    except ValueError:rejected=True
    check('actual ParentLock fake '+mode,rejected==(mode!='valid'))
ns.update(realns)

# Actual Popen-owning helper under fake Popen/census/identity/wait and log exceptions.
class FakeRec:
    def __init__(self,fail_emit=False):self.receipt={'errors':[],'events':[]};self.fail_emit=fail_emit;self.naps=0
    def error(self,x):self.receipt['errors'].append(x)
    def emit(self,phase,**kw):
        self.receipt['events'].append(phase)
        if phase=='OWNED_NATIVE_STARTED' and self.fail_emit:self.fail_emit=False;raise OSError('fake IO after retained Popen')
    def nap(self):
        self.naps+=1
        if self.naps>10:raise RuntimeError('independent fake loop must stay bounded')
class FakeLock:
    def verify(self):return {'same':'bound'}
for fault in ['none','census','started-emit','wait']:
    records=[{11:row(11,10,'CHILD'),12:row(12,11,'JAVA')},{12:row(12,1,'JAVA')},{}]
    if fault=='census':records.insert(0,OSError('fake observation gap'))
    def census():
        x=records.pop(0)
        if isinstance(x,BaseException):raise x
        return x
    class Child:
        pid=11;returncode=0;waits=0
        def poll(self):return 0
        def wait(self,timeout):
            self.waits+=1
            if fault=='wait' and self.waits==1:raise KeyboardInterrupt('fake only')
            return 0
    rec=FakeRec(fault=='started-emit');child=Child()
    ns.update(os=proxy,table=census,pid_text=lambda pid,column:('java' if pid==12 else 'python') if column=='comm' else ('JAVA' if pid==12 else 'CHILD'),subprocess=types.SimpleNamespace(Popen=lambda *a,**kw:child,STDOUT=subprocess.STDOUT,TimeoutExpired=subprocess.TimeoutExpired))
    owned=ns['OwnedNative'](FakeLock(),rec);error=None
    try:owned.run(['NEVER_EXECUTED_FAKE_COMMAND'],scratch,{},scratch/('native-'+fault+'.log'),'FAKE')
    except OSError as e:error=e
    check('actual OwnedNative drains reparented Java under '+fault,owned.closed and not records and owned.child_start=='CHILD')
    check('actual OwnedNative error propagated only after drain '+fault,(error is not None)==(fault=='started-emit'))
ns.update(realns)

# Actual source journal operates only on reviewer-owned constant dummy files.
for fault in ['none','user-edit','one-restore-io']:
    jr=scratch/('journal-'+fault);jr.mkdir();jf=jr/'evidence';jf.mkdir()
    a=jr/'a.java';a.write_bytes(b'ORIGINAL_A');a.chmod(0o640);b=jr/'b.java';b.write_bytes(b'ORIGINAL_B');b.chmod(0o644)
    rec=FakeRec();journal=ns['Journal'](jr,jf,{'a.java':b'CANDIDATE_A','b.java':b'CANDIDATE_B','new.java':b'CANDIDATE_NEW'},rec,lambda:None)
    journal.stage()
    if fault=='user-edit':a.write_bytes(b'USER_EDIT')
    if fault=='one-restore-io':
        class FailureOS(OSProxy):
            def replace(self,src,dst):
                if Path(dst)==a:raise OSError('fake one-file restore IO')
                return os.replace(src,dst)
        ns['os']=FailureOS()
    restored=journal.restore();ns.update(realns)
    check('independent Journal restore result '+fault,restored==(fault=='none'))
    check('independent Journal other path/new-file restore despite '+fault,b.read_bytes()==b'ORIGINAL_B' and not (jr/'new.java').exists())
    check('independent Journal bytes/modes/user edit '+fault,a.read_bytes()==(b'ORIGINAL_A' if fault=='none' else b'USER_EDIT' if fault=='user-edit' else b'CANDIDATE_A') and stat.S_IMODE(a.stat().st_mode)==0o640)

# Execute the ACTUAL finalizer AST only, all source/native/lock/signal operations replaced by fakes.
# These new post-compile witnesses differ from the author's caught pre-final proof-read witness.
unit=next(n for n in main.body if isinstance(n,ast.Try) and n.finalbody)
finalizer=ast.FunctionDef(name='actual_finalizer_only',args=ast.arguments(posonlyargs=[],args=[],kwonlyargs=[],kw_defaults=[],defaults=[]),body=unit.finalbody,decorator_list=[])
finally_witnesses=[]
for fault in ['original-second-proof-read','post-terminal-original-compile-exception','post-terminal-second-proof-read']:
    holds=[];trace=[]
    class Hold(BaseException):pass
    class Rec:
        def error(self,code):receipt['errors'].append(code)
        def emit(self,phase,**kw):
            trace.append(phase)
            if phase=='UNIT_TERMINAL' and fault.startswith('post-terminal'):self.error('FAKE_TERMINAL_PERSISTENCE_FAILURE')
        def hold(self,reason,lock):holds.append(reason);raise Hold(reason)
    class Journal:
        def restore(self):trace.append('restore');return True
        def originals_match(self):
            trace.append('post-compile-proof')
            raise OSError('FAKE second original bytes/mode observation failure')
    class Native:
        def drain(self):trace.append('drain')
    def compile_phase(name):
        trace.append(name)
        if fault=='post-terminal-original-compile-exception':raise OSError('FAKE original compile/log exception')
        return 0
    receipt={'errors':[],'runs':complete,'interrupted':False,'finalizedSuccess':fault.startswith('post-terminal'),'originalCompileSucceeded':False}
    finalns={'receipt':receipt,'native':Native(),'boundary':lambda:trace.append('boundary'),'proof_facts':lambda:{'proof':'same'},'expected_proof':{'proof':'same'},'manifest':{'files':[]},'rec':Rec(),'args':types.SimpleNamespace(phase='freeze',keep_successful_freeze_unit=True),'finalized_keep_allowed':ns['finalized_keep_allowed'],'journal':Journal(),'compile_unit':compile_phase,'lock':FakeLock(),'saved_handlers':{}}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[finalizer],type_ignores=[])),'actual-finalizer-AST-all-IO-native-fake','exec'),finalns)
    escaped=None
    try:finalns['actual_finalizer_only']()
    except OSError as error:escaped=type(error).__name__
    except Hold:escaped='HELD'
    check('reproduced premature finalizer unwind '+fault,escaped=='OSError' and not holds and 'restore' in trace)
    finally_witnesses.append({'fault':fault,'observedEscape':escaped,'heldLockDispositionInvoked':bool(holds),'fakeTrace':trace,'actualSourceOrNativeOperations':False})
check('no review mutation of sealed package',snap=={str(p.relative_to(PKG)):sha(p.read_bytes()) for p in PKG.rglob('*') if p.is_file()})
result={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'independent static source and isolated fake-helper/read-only archived receipt witnesses only','checks':checks,'checkCount':len(checks),'commandContractWitness':command_witness,'actualFinallyExceptionWitnesses':finally_witnesses,'staticAssetFalseRejection':{'nativeCollectorSha256':sha((real/(label+'-results.json')).read_bytes()),'actualValidatorException':actual_failure,'oldStaticAssets':oldassets},'wrapperRulingCorrection':{'successfulPresentStateExistsReadCounts':{'old':2,'new':2,'deleteSideEffect':1},'missingStore':0,'installedEmptyStore':1,'sideEffectControlAndExpectedSurvivorSupported':True},'sealedPackageSnapshot':snap,'sourceJavaMutantsCasesAllUnchanged':True,'actualDriverOrNativeExecution':False,'actualCompilerBuildProcessSignalOrSourceMutation':False}
(OUT/'audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'checks':len(checks),'commandContract':command_witness,'realSealedGreenReceiptRejected':actual_failure,'sourceAndOriginalPackageUnchanged':True,'noNativeExecution':True},indent=2))

