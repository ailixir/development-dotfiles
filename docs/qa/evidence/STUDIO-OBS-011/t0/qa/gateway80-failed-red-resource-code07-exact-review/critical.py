"""One independent bounded Source07 changed-path batch; explicit fakes only.

Definitions/preloads are bound to immutable source; no old test tail is executed.
The two operator exchanges run the exact pure helper in V8 memory, never Node.
"""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types,shlex
from contextlib import ExitStack
from unittest.mock import patch
H=Path(__file__).absolute().parent;S=H.parents[1]/'early/gateway80-failed-red-resource-prep/resume7'
raw=(S/'critical_check.py').read_bytes();prefix=raw.split(b'RESULT_FD=os.open',1)[0]
ns={'__name__':'_quinn_preloaded_explicit_fakes','__file__':str(S/'critical_check.py')};exec(compile(prefix,'<source07-fixture-prefix-only>','exec'),ns)
tree=ast.parse(raw);definitions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('check','expect','operator','fake_tool','all_source_graph','build_scope','creator','phase')]
exec(compile(ast.Module(body=definitions,type_ignores=[]),'<source07-explicit-effect-fixtures>','exec'),ns)
ns.update(CHECKS=[],HISTORY=[],DIAGNOSTICS=[],LAST_STATE=None,LAST_TOOL=None,COUNTER=0,CREATED=[],FAULT=None,REAL_EXEC=exec)
# The actual final shell argument, not an intended text slice.
ns['BODY']=shlex.split((S/'guard-failed-red.bash').read_text().split('-B -c ',1)[1])[0]
RESULT_FD=os.open(str(H/'critical-results.json'),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644);WRITE=os.write;CLOSE=os.close
A,P,F,G,MemPath=[ns[n] for n in ('A','P','F','G','MemPath')]
CHECKS=[]
def check(n,v):
    if v is not True:raise AssertionError(n)
    CHECKS.append(dict(id=n,passed=True))
def deny(n,call,reason=None):
    try:call()
    except BaseException as e:
        if isinstance(e,(AssertionError,SystemExit)):raise
        check(n,reason is None or e.args==(reason,));return
    raise AssertionError('EXPECTED_DENIAL:'+n)
def tests():
    s,k,base,b,path,scope_raw,response,envelope=ns['build_scope']();scope_sha=P.sha(scope_raw)
    original=copy.deepcopy(s.fs.nodes)
    # Independent required critical pairs on the actual CLI, before mutation.
    for name in ('raw_pin','forged_boolean','trace_mismatch','current_self','conflict'):
        value=copy.deepcopy(envelope);raw=response['buffer'].encode();pin=response['sha256']
        if name=='raw_pin':pin='0'*64
        elif name=='forged_boolean':value['actors'][0]['actualStatus']=True;value['actors'][0]['originalTrace']['actualStatus']=True
        elif name=='trace_mismatch':value['actors'][0]['originalTrace']['actualStatus']=1
        elif name=='current_self':value['actors'][0]['pid']=s.pid();value['actors'][0]['originalTrace']['pid']=s.pid()
        else:
            row=copy.deepcopy(value['actors'][0]);row['ppid']+=1;row['originalTrace']['ppid']+=1;value['actors'].append(row)
        if name!='raw_pin':raw=P.packed(value);pin=P.sha(raw)
        deny('INITIAL_'+name,lambda:ns['CLI'].execute(str(path),scope_sha,initial_facts_raw=raw,initial_facts_sha=pin,system=s,verified_self_sha=P.sha(ns['TARGET']['install-cli.py'])))
        check('BEFORE_MUTATION_'+name,s.fs.nodes==original)
    output=[];env={};real=ns['REAL_EXEC']
    def track(code,namespace):
        namespace['__builtins__']=dict(vars(builtins),exec=track,print=lambda v,**kw:output.append(json.loads(v)));real(code,namespace)
        if code.co_filename=='<verified-failed_resource_source07-system>':namespace['System']=lambda:s;check('CURRENT_COMPILED_SYSTEM_IS_FAKE',namespace['System']() is s)
    env.update(__name__='_quinn_actual_source07_install_loader',__builtins__=dict(vars(builtins),exec=track,print=lambda v,**kw:output.append(json.loads(v))))
    argv=['-c',str(S/'install-cli.py'),P.sha(ns['TARGET']['install-cli.py']),str(path),scope_sha,response['sha256'],response['buffer']]
    with ExitStack() as stack:
        for n in ('open','fstat','stat','close','read','getuid','getpid','getppid'):stack.enter_context(patch.object(os,n,getattr(s.api,n)))
        stack.enter_context(patch.object(sys,'argv',argv))
        try:real(compile(ns['INSTALL_BODY'],'<quinn-actual-quoted-install-loader>','exec'),env)
        except SystemExit as end:status=end.code
        else:raise AssertionError('INSTALL_EXIT_REQUIRED')
    check('QUOTED_LOADER_INITIAL_INSTALL_ZERO',status==0 and env['sink'].primary_failure is None and env['sink'].cleanup_failures==[])
    result=P.decode(s.fs.nodes[str(path.parent/'installation-result.json')]['raw']);raw=s.fs.nodes[str(A.N/'root-authorization.json')]['raw'];a=P.decode(raw);auth=P.sha(raw)
    expected={r['pid'] for r in envelope['actors']};actual={r['pid']:r for r in a['typedPriorActors']}
    check('FIRST_COMPLETE_AUTHORIZATION_ALL_SEVEN',a['typedActorRosterComplete'] is True and expected<=set(actual))
    check('SAME_BUFFER_RAW_AND_SCOPE_PINS',a['initialActualFactsBuffer']==response['buffer'] and a['initialActualFactsSha256']==response['sha256'] and a['initialInstallScopeSha256']==scope_sha)
    check('CURRENT_INSTALLER_PENDING_NULL',actual[s.pid()]['actualStatus'] is None and a['designatedControlAuthor']['actualStatus'] is None)
    check('NONZERO_EXTERNAL1_NOT_WAIT',actual[900089]['actualStatus']==1 and actual[900089]['directWaitClaimed'] is False)
    check('FIRST_INSTALL_STATE_ALL_SEVEN',expected<={r['pid'] for r in result['namespaceState']['header']['actorFacts']})
    check('CARRIER_ROWS_ARE_SOURCE_DERIVED',all(actual[pid]['evidence'].startswith(str(A.N/'root-authorization.json')+'#SOURCE07_INITIAL_ACTUAL_FACTS:') for pid in expected))
    bad=copy.deepcopy(a);bad['typedPriorActors']=[r for r in bad['typedPriorActors'] if r['pid']!=900090]
    deny('FIRST_CONSUMER_REVALIDATES_INCLUSION',lambda:P.authority_shape(bad,k),'INITIAL_FACT_DERIVED_ROSTER')
    ns['LAST_STATE']=result['namespaceState'];ns['LAST_TOOL']=ns['fake_tool'](s,0)
    facts=dict(separatelyCaptured=True,oldBindingsUnchanged=True,newBindingsReadonly=True,setupHelperRosterComplete=True,readEofStatus=1,actualBufferVerificationExit=0,actualEvalExit=0,successfulSetupHelpers=[dict(pid=900101,ppid=3749,start=None,fullFingerprint=None,requestedLaunch=a['physicalPythonRoles']['requestedLaunchBIN'],actualForegroundWaitStatus=0,separatelyCaptured=True,toolEvidence=['FAKE_ORIGINAL_SEPARATE_900101'])],actualToolEvidence=['FAKE_SETUP0'])
    control,h,state,tool=ns['creator'](s,k,a,auth,b,ns['LAST_STATE'],ns['LAST_TOOL'],'SETUP_OWNERSHIP_ADMISSION',facts)
    check('SETUP_PRESERVES_ORIGINAL_ROWS',all(next(r for r in control['typedPriorActors'] if r['pid']==pid)==actual[pid] for pid in expected))
    status,state,tool=ns['phase'](s,k,a,auth,b,'negative',control,h)
    check('FIRST_NEGATIVE1_RETAINS_ALL_ORIGINAL_FACTS',status==1 and expected<={r['pid'] for r in state['header']['actorFacts']})
    check('NO_TARGET_RESOURCE_CALLS',G['ns']['BLOCKED']==[])
failure=None
sys.addaudithook(G['ns']['audit'])
try:
    with ExitStack() as stack:
        for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),(socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
            for n in names:
                if hasattr(obj,n):stack.enter_context(patch.object(obj,n,G['ns']['blocked']))
        tests()
except BaseException as e:failure=dict(type=type(e).__name__,args=[str(x)[:200] for x in e.args])
result=dict(checks=CHECKS,passed=len(CHECKS),failure=failure,compositionChecks=ns['CHECKS'],operatorSteps=ns['HISTORY'],diagnostics=ns['DIAGNOSTICS'],realBoundaryCalls=G['ns']['BLOCKED'],sourcePins={n:hashlib.sha256(v).hexdigest() for n,v in ns['TARGET'].items()},whole13OrOldSuitesReplayed=False,sourceUnchanged=True,actualTargetEffects=0)
out=(json.dumps(result,indent=2)+'\n').encode();i=0
while i<len(out):i+=WRITE(RESULT_FD,out[i:])
CLOSE(RESULT_FD);print('QUINN_DONE:'+json.dumps(dict(passed=len(CHECKS),compositionChecks=len(ns['CHECKS']),failure=failure,operatorSteps=len(ns['HISTORY']))),flush=True);raise SystemExit(1 if failure else 0)
