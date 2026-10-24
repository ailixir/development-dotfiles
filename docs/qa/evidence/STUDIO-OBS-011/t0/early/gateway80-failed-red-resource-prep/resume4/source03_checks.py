"""Bounded source03 factory/installer/history/reason/delivery actual-function fakes.

All source and fixtures inspected before first execution. No target main/import/effect.
Persistent audit is the inherited deny hook, with only this new result file allowed.
"""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path(__file__).absolute().parent
harness=(HERE/'checks.py').read_bytes();prefix=harness.split(b'\nsys.addaudithook(audit)',1)[0]
ns={'__name__':'_source04_explicit_fakes','__file__':str(HERE/'checks.py')};exec(compile(prefix,'<source03-fake-fixtures>','exec'),ns)
A,P,C,Machine,MemPath=map(ns.get,('A','P','C','Machine','MemPath'))
check,original_denied,build,blocked=map(ns.get,('check','denied','build','blocked'))
def denied(name,action,reason=None):
    try:action()
    except BaseException as error:
        if isinstance(error,AssertionError) or not (getattr(type(error),'namespace',None) in ('CUSTODY_HOLD','PROTOCOL_HOLD','BOOTSTRAP_VALUE_ERROR') or isinstance(error,(ValueError,OSError))):raise
        check(name,reason is None or str(error)==reason)
    else:raise AssertionError(name)
EXTRA={n:(HERE/n).read_bytes() for n in ('factory.py','installer.py','install-cli.py','shell-buffer-verify.py','binding-wrapper.bash','binding-functions.bash','install-loader.bash','buffer-bootstrap-inline.py','buffer-verifier-inline.py')}
reg_source=(HERE/'code02_checks.py').read_bytes();reg_prefix=reg_source.split(b'\nsys.addaudithook(audit)',1)[0]
REG={'__name__':'_source04_actual_outer_cases','__file__':str(HERE/'code02_checks.py')};exec(compile(reg_prefix,'<source03-outer-fixture-definitions>','exec'),REG)
F=types.ModuleType('_actual_source04_factory');F.__dict__.update(P=P,R=A.R,N=A.N);exec(compile(EXTRA['factory.py'],'<actual-factory>','exec'),F.__dict__)
I=types.ModuleType('_actual_source04_installer');I.__dict__.update(P=P,F=F,Custody=C.Custody,R=A.R,E=A.E,N=A.N,SOURCE=MemPath(HERE));exec(compile(EXTRA['installer.py'],'<actual-installer>','exec'),I.__dict__)
CLI=types.ModuleType('_actual_install_cli');exec(compile(EXTRA['install-cli.py'],'<actual-install-cli>','exec'),CLI.__dict__)
V=types.ModuleType('_actual_buffer_verifier');exec(compile(EXTRA['shell-buffer-verify.py'],'<actual-buffer-verifier>','exec'),V.__dict__)
BASE_AUDIT=ns['audit']
def audit(event,args):
    if event=='open' and type(args[0])is str and args[0]==str(HERE/'source03-check-results.json') and 'w' in str(args[1]):return
    BASE_AUDIT(event,args)

def fixture():
    s,k,a,auth,buffers=build();a['priorNamespaces']=copy.deepcopy(k['priorNamespaces']);a['oldIndexSha256']=k['frozenEvidence']['terminalIndexSha256']
    a['newDirectoryPins']={}
    for key in ('binaryHashes','binaryModes','binaryWitnesses'):a.pop(key,None)
    witnesses={}
    for path,h in P.binary_requirements(a,k).items():
        st=s.fs.info(path);witnesses[path]=dict(path=path,sha256=h,mode=stat.S_IMODE(st.st_mode),uid=st.st_uid,dev=st.st_dev,ino=st.st_ino,bytes=st.st_size,mtimeNs=st.st_mtime_ns,ctimeNs=st.st_ctime_ns,acquisition='SAME_BUFFER_NOFOLLOW_FD')
    records={path:s.fs.nodes[path]['raw'] for path in a['newCodeRecordPins']}
    return s,k,a,buffers,witnesses,records

def factory_checks():
    s,k,a,b,w,r=fixture();before=copy.deepcopy(s.fs.nodes);draft=F.preflight(a,k,b,w,r)
    check('FACTORY_SEVEN_POSITIVE_ZERO_SIDE_EFFECTS',len(draft['candidate']['binaryHashes'])==7 and s.fs.nodes==before and draft['NFact'] is False and draft['authority'] is False and draft['candidate']['newDirectoryPins']=={})
    modes={p:x['mode'] for p,x in w.items()};check('FACTORY_DERIVES_ALL_MODES_FROM_SEVEN_FAKE_WITNESSES',draft['candidate']['binaryModes']==modes)
    for variant in ('five','extra','conflict','bool-mode','wrong-mode','alias','bad-review','bad-code','precreate-fact'):
        aa=copy.deepcopy(a);ww=copy.deepcopy(w);bb=dict(b);rr=dict(r)
        if variant=='five':
            for path in (k['binaryAncestors']['node']['path'],k['binaryAncestors']['helm']['path']):ww.pop(path)
        if variant=='extra':ww['/synthetic/extra']=copy.deepcopy(next(iter(ww.values())))
        if variant=='conflict':aa['pythonRoles']['reported']=dict(aa['pythonRoles']['reported'],sha256='0'*64)
        if variant=='bool-mode':next(iter(ww.values()))['mode']=True
        if variant=='wrong-mode':next(iter(ww.values()))['mode']='0755'
        if variant=='alias':aa['observationExecutables']['git']['path']='/synthetic/../synthetic/git'
        if variant=='bad-review':rr[next(iter(rr))]+=b'X'
        if variant=='bad-code':bb['entry.py']+=b'X'
        if variant=='precreate-fact':aa['newDirectoryPins']={str(A.N):dict(path=str(A.N),uid=501,dev=1,ino=999,mode=0o700)}
        denied('FACTORY_'+variant+'_BEFORE_ANY_MUTATION',lambda:F.preflight(aa,k,bb,ww,rr))
        check('FACTORY_'+variant+'_ZERO_SIDE_EFFECTS',s.fs.nodes==before)
    physical=dict(path=str(A.N),uid=501,dev=16777229,ino=777777,mode=0o700)
    final=F.finalize(draft,k,b,w,r,physical)
    check('FACTORY_N_FACT_ONLY_FINALIZE_AFTER_CREATE',final['newDirectoryPins']=={str(A.N):physical} and draft['candidate']['newDirectoryPins']=={})
    changed=copy.deepcopy(draft);changed['candidate']['expectedWrapperExit']=0
    denied('FACTORY_FINALIZE_REVALIDATES_SAME_DRAFT',lambda:F.finalize(changed,k,b,w,r,physical))

def install_fixture():
    s,k,a,b,w,r=fixture()
    # Prospective N02 does not exist in this fake installation fixture. This is
    # synthetic fixture construction, never a production cleanup operation.
    s.fs.nodes={path:v for path,v in s.fs.nodes.items() if path!=str(A.N) and not path.startswith(str(A.N)+'/')}
    for name,raw in {**b,**{key:EXTRA[key] for key in ('factory.py','installer.py')}}.items():s.fs.put(MemPath(HERE)/name,raw,0o644)
    outside=A.R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gateway80-fr03-root-install01';s.fs.directory(outside,0o700)
    def fact(path):
        st=s.fs.info(str(path));return dict(path=str(path),uid=st.st_uid,dev=st.st_dev,ino=st.st_ino,mode=stat.S_IMODE(st.st_mode))
    scope=dict(role='SOURCE04_INSTALL_ONLY',authorizedBy='root',authorized=True,cleanup=False,nativeInvocations=0,sourceDirectory=str(HERE),destination=str(A.N),outsideDirectory=str(outside),outsideDirectoryFact=fact(outside),oldEDirectory=fact(A.E),candidate=a,loaderPins={name:P.sha(raw) for name,raw in {**b,**{key:EXTRA[key] for key in ('factory.py','installer.py')}}.items()})
    source_path=str(MemPath(HERE)/'manifest.json')
    rows=[dict(path=n,sha256=P.sha(raw),bytes=len(raw),mode=0o644) for n,raw in {**b,**{key:EXTRA[key] for key in ('factory.py','installer.py','install-cli.py')}}.items()]
    source=P.packed(dict(files=rows));s.fs.put(source_path,source,0o644);a['newCodeRecordPins'][source_path]=P.sha(source)
    for reviewpath in a['newCodeRecordPins']:
        if reviewpath==source_path:continue
        raw=P.packed(dict(subjectManifestSha256=P.sha(source),mandatoryFindingCount=0,verdict='CONDITIONAL_EXACT_SOURCE_SUPPORT'));s.fs.put(reviewpath,raw,0o644);a['newCodeRecordPins'][reviewpath]=P.sha(raw)
    scope['sourceManifestSha256']=P.sha(source)
    scope['reviewPins']=a.pop('newCodeRecordPins');a.pop('codePins')
    scope.pop('loaderPins');scope['readsetPolicy']='EXACT_SOURCE04_CONTRACT_REVIEWS_AND_SEVEN_CANONICAL_BINARIES'
    scopepath=outside/'root-install-scope.json';raw=P.packed(scope);s.fs.put(scopepath,raw,0o600)
    return s,k,scope,scopepath,P.sha(raw),outside

def cli_execute(*args,**kwargs):return CLI.execute(*args,verified_self_sha=P.sha(EXTRA['install-cli.py']),**kwargs)

def installer_checks():
    s,k,scope,path,h,outside=install_fixture();beforeprior={n:copy.deepcopy(v) for n,v in s.fs.nodes.items() if n.startswith(str(A.PRIOR)+'/')}
    result=cli_execute(str(path),h,system=s)
    check('INSTALL_ACTUAL_SEALED_CLI_POSITIVE',result['installationExit']==0 and result['phaseAuthority'] is False and result['N']['ino']==s.fs.info(str(A.N)).st_ino)
    installed=P.decode(s.fs.nodes[str(A.N/'root-authorization.json')]['raw'])
    check('INSTALL_ACTUAL_COMPLETE_SEVEN_MAP',len(installed['binaryHashes'])==7 and len(installed['binaryModes'])==7 and len(installed['binaryWitnesses'])==7)
    draft=P.decode(s.fs.nodes[str(outside/'pending-draft.json')]['raw'])
    check('INSTALL_DRAFT_HAS_NO_N_PHYSICAL_FACT',draft['NFact'] is False and draft['candidate']['newDirectoryPins']=={})
    check('INSTALL_EXACT_SIX_CODE_AUTH_600_N700',s.fs.info(str(A.N)).st_mode&0o7777==0o700 and {str(MemPath(n).name) for n in s.fs.nodes if str(MemPath(n).parent)==str(A.N)}==set(k['installedCode'])|{'root-authorization.json'} and all(s.fs.info(str(A.N/n)).st_mode&0o7777==0o600 for n in [*k['installedCode'],'root-authorization.json']))
    check('INSTALL_PRIOR_NAMESPACE_UNTOUCHED',beforeprior=={n:v for n,v in s.fs.nodes.items() if n.startswith(str(A.PRIOR)+'/')})
    denied('INSTALL_ATTEMPT_CANNOT_RESET_OR_RETRY',lambda:cli_execute(str(path),h,system=s))
    s,k,scope,path,h,outside=install_fixture();old=s.api.write
    def partial(fd,raw):
        if s.fs.fds[fd]['path']==str(A.N/'custody.py'):return 0
        return old(fd,raw)
    s.api.write=partial
    denied('INSTALL_PARTIAL_PHYSICAL_WRITE_HELD',lambda:cli_execute(str(path),h,system=s))
    check('INSTALL_PARTIAL_AND_ATTEMPT_PRESERVED',str(A.N) in s.fs.nodes and str(A.N/'custody.py') in s.fs.nodes and str(outside/'install-attempt.json') in s.fs.nodes and str(A.N/'root-authorization.json') not in s.fs.nodes)
    check('INSTALL_PARTIAL_CLOSED_OPERATOR_TRACE',len(s.operator_records)==1 and s.operator_records[0]['qualified'] is False and s.operator_records[0]['NFact'] is False)
    s,k,scope,path,h,outside=install_fixture();before=set(s.fs.nodes)
    denied('INSTALL_ROOT_SCOPE_SHA_BEFORE_INTERPRETATION',lambda:cli_execute(str(path),'0'*64,system=s))
    check('INSTALL_BAD_SHA_ZERO_MUTATIONS',set(s.fs.nodes)==before and str(A.N) not in s.fs.nodes)

def prior_and_join_checks():
    for kind in ('clean','extra','link','body','inode'):
        s,k,a,auth,b=build();u=ns['new_unit'](s,a,auth,k,b)
        if kind=='extra':s.fs.put(A.PRIOR/'extra',b'UNEXPECTED')
        if kind=='link':s.fs.nodes[str(A.PRIOR/'custody.py')]=dict(s.fs.nodes[str(A.PRIOR/'custody.py')],kind='symlink',target='/forbidden/not-opened')
        if kind=='body':s.fs.nodes[str(A.PRIOR/'custody.py')]['raw']+=b'X'
        if kind=='inode':s.fs.nodes[str(A.PRIOR)]['ino']+=1
        if kind=='clean':u.check_members();check('TYPED_PRIOR7_OLD2263_N02_EXACT2265',len(u.old.members())==2265)
        else:denied('TYPED_PRIOR7_DENY_'+kind,u.check_prior)
        u.close()
    for pid in (73492,86096,96486):
        s,k,a,auth,b=build();u=ns['new_unit'](s,a,auth,k,b)
        s.extra[pid]=dict(pid=pid,ppid=1,start='Mon Oct 19 17:00:00 2026',argv='unrelated apparently reused',comm='/unrelated')
        denied('EVERY_CURRENT_TABLE_NUMERIC_ABSENCE_'+str(pid),u.table,'STARTLESS_NUMERIC_PRESENT_HOLD');u.close()
    check('EXACT2255_UNION_NO_HISTORICAL_REPAIR',len(k['finiteUnion']['numericIds'])==2255 and k['finiteUnion']['numericOnlyAbsent']==[73492,86096,96486] and len(k['finiteUnion']['historicalPidStartsRequiringAbsentOrReused'])==7 and k['priorFirstHoldReason']=='UNKNOWN_NOT_RETROACTIVELY_ESTABLISHED')

def reason_and_delivery_checks():
    for error,namespace,reason in ((C.Hold('CUSTODY_PATH'),'CUSTODY_HOLD','CUSTODY_PATH'),(P.Hold('ROOT_AUTHORITY'),'PROTOCOL_HOLD','ROOT_AUTHORITY'),(ValueError('RAW_PRIVATE_UNLISTED'),'UNMAPPED_FAILURE','UNMAPPED_FAILURE'),(P.BootstrapValueError('FAILED_BOOTSTRAP_INTEGRITY'),'BOOTSTRAP_VALUE_ERROR','FAILED_BOOTSTRAP_INTEGRITY')):
        records=[];sink=P.FailureSink(records.append,900001,3749);token=sink.claim_finalizer('CALLER');sink.stage='AUTHORITY_SHAPE';sink.primary(error);sink.cleanup(C.Hold('CUSTODY_CLOSE_UNCONFIRMED'));sink.forward(error);sink.finalize(token)
        record=records[0];check('CLOSED_REASON_'+namespace,record['primaryFailure']==dict(stage='AUTHORITY_SHAPE',namespace=namespace,reason=reason) and record['cleanupFailures'][0]['namespace']=='CUSTODY_HOLD' and record['descriptorSnapshotIsPostExitLeakProof'] is False and 'RAW_PRIVATE_UNLISTED' not in json.dumps(record))
    source_known=ValueError('EXPECTED_SHA_REQUIRED');source_known.namespace='SOURCE06_VALUE_ERROR'
    for error,namespace in ((source_known,'SOURCE06_VALUE_ERROR'),(OSError('PRIVATE_OS_MESSAGE'),'OS_ERROR')):
        records=[];sink=P.FailureSink(records.append);token=sink.claim_finalizer('CALLER');sink.stage='SOURCE06_LEAF';sink.forward(error);sink.finalize(token)
        check('CLOSED_FUTURE_NAMESPACE_'+namespace,records[0]['primaryFailure']['namespace']==namespace and 'PRIVATE_OS_MESSAGE' not in json.dumps(records[0]))
    _,_,_,outputs,status=REG['outer']('negative','constructor-close')
    check('ACTUAL_RUN_PRIMARY_CLEANUP_SEPARATE',status==1 and outputs[0]['primaryFailure']['namespace']=='OS_ERROR' and any(row['namespace']=='CUSTODY_HOLD' for row in outputs[0]['cleanupFailures']) and outputs[0]['oldFirstHoldReason']=='UNKNOWN_NOT_RETROACTIVELY_ESTABLISHED' and outputs[0]['descriptorSnapshotIsPostExitLeakProof'] is False)
    source=ValueError('OLD_E_BYTES_CHANGED');source.namespace='SOURCE06_VALUE_ERROR';records=[];sink=P.FailureSink(records.append);token=sink.claim_finalizer('CALLER');sink.stage='OLD_RELEASE_METADATA';sink.forward(source);sink.finalize(token)
    # The registry uses actual source06 literal codes only, no raw-code fallback.
    check('SOURCE06_UNKNOWN_LITERAL_STAYS_UNMAPPED',records[0]['primaryFailure']['namespace']=='UNMAPPED_FAILURE')
    buffer=EXTRA['binding-functions.bash'].decode();expected=P.sha(buffer.encode());count=len(buffer.encode())
    positive=V.verify(buffer,expected,count,True,1);check('ACTUAL_READONLY_BUFFER_VERIFIER_POSITIVE',positive['verificationExit']==0 and positive['readEofStatus']==1)
    for variant in ('sha','bytes','readonly','eof'):
        evaluated=[]
        def invoke():
            V.verify(buffer,'0'*64 if variant=='sha' else expected,count+1 if variant=='bytes' else count,False if variant=='readonly' else True,0 if variant=='eof' else 1)
            evaluated.append(buffer)  # Fake eval boundary, never actual Bash/eval.
        try:invoke()
        except V.BindingError:pass
        else:raise AssertionError('BUFFER_MUST_DENY')
        check('ACTUAL_READONLY_BUFFER_'+variant+'_NO_EVAL',evaluated==[])
    wrapper=EXTRA['binding-wrapper.bash'].decode();check('REVIEWED_SMALL_WRAPPER_SAME_BUFFER_ONLY',wrapper.count('eval "$GATEWAY_FR03_BINDING_BUFFER"')==1 and 'GATEWAY_FR03_BUFFER_VERIFY_STATUS-' in wrapper and 'readonly -f gateway80_fr03_eval_reviewed_buffer' in wrapper)
    guard=ns['SRC']['guard-failed-red.bash'].decode();check('NEW_READONLY03_NAMES_AND_OLD_NAMESPACE_UNTOUCHED','gateway80_failed_red03_invoke' in guard and 'GATEWAY_FR03_NEGATIVE_STARTED' in guard and 'GATEWAY_FAILED_' not in guard and '\ngateway80_failed_red_exit()' not in guard)
    check('ZERO_REAL_BOUNDARY_CALLS',ns['BLOCKED']==[])

def loader_checks():
    loader=EXTRA['install-loader.bash'].decode();body=loader.split("-B -c '",1)[1].split("\n' '/Users/",1)[0]
    check('INSTALL_LOADER_LITERAL_QUOTE_SAFE',"'" not in body)
    for optimize in (0,1):
        for valid in (True,False):
            s,k,scope,path,h,outside=install_fixture();s.fs.put(MemPath(HERE)/'install-cli.py',EXTRA['install-cli.py'],0o644)
            outputs=[];compiled=[];real_exec=builtins.exec
            def track(code,namespace):
                namespace['__builtins__']=dict(vars(builtins),exec=track)
                real_exec(code,namespace)
                if code.co_filename=='<verified-source04-system>':namespace['System']=lambda:s
                compiled.append(code.co_filename)
            env={'__name__':'_actual_install_loader','__builtins__':dict(vars(builtins),exec=track,print=lambda value,**kwargs:outputs.append(json.loads(value)))}
            argv=['-c',str(MemPath(HERE)/'install-cli.py'),P.sha(EXTRA['install-cli.py']) if valid else '0'*64,str(path),h]
            with ExitStack() as guards:
                for name in ('open','fstat','stat','close','read','getuid','getpid','getppid'):guards.enter_context(patch.object(os,name,getattr(s.api,name)))
                guards.enter_context(patch.object(sys,'argv',argv))
                try:real_exec(compile(body,'<actual-sealed-install-loader>','exec',optimize=optimize),env)
                except SystemExit as result:status=result.code
                else:raise AssertionError('INSTALL_LOADER_EXIT_REQUIRED')
            if valid:check('INSTALL_LOADER_OPT'+str(optimize)+'_COMPLETE_BUFFER_CLI',status==0 and str(A.N/'root-authorization.json') in s.fs.nodes and '<verified-source04-factory>' in compiled and outputs==[])
            else:check('INSTALL_LOADER_OPT'+str(optimize)+'_BAD_SHA_BEFORE_COMPILE',status==1 and compiled==[] and str(A.N) not in s.fs.nodes and len(outputs)==1 and outputs[0]['qualified'] is False)

def setup_checks():
    s,k,a,auth,b=build();u=ns['new_unit'](s,a,auth,k,b);u.require_setup();check('SETUP_EXTERNAL_CONTROL_BOUND_NO_AUTH_CYCLE',u.setup_helpers[0]['pid']==900101 and a['rootInputPins']=={})
    s.extra[900101]=dict(pid=900101,ppid=1,start='Mon Oct 19 17:00:00 2026',argv='apparently reused helper',comm='/unrelated')
    denied('SETUP_HELPER_NUMERIC_ABSENCE_EVERY_TABLE',u.table,'STARTLESS_NUMERIC_PRESENT_HOLD');u.close()
    s,k,a,auth,b=build();raw=s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw'];value=P.decode(raw);value['helpers'][0]['actualForegroundWaitStatus']=127;raw=P.packed(value);s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw']=raw
    u=ns['new_unit'](s,a,auth,k,b);denied('SETUP_WAIT127_NEVER_INVENTS_TERMINALITY',u.require_setup,'SETUP_HELPER_ACTUAL_COMPLETION');u.close()
    s,k,a,auth,b=build();before=set(s.fs.nodes)
    denied('SETUP_EXTERNAL_SHA_BEFORE_CONTROL_PARSE',lambda:A.run('negative',auth,'0'*64,system=s,root_raw=P.packed(a),code_buffers=b),'EXTERNAL_CONTROL_BEFORE_PARSE')
    check('SETUP_BAD_SHA_ZERO_N_WRITES',set(s.fs.nodes)==before)
    for name in ('buffer-bootstrap-inline.py','buffer-verifier-inline.py'):
        for valid in (True,False):
            s,k,a,auth,b=build();buffer=EXTRA['binding-functions.bash'].decode();expected=P.sha(buffer.encode()) if valid else '0'*64
            argv=['-c',buffer,expected,str(len(buffer.encode()))] if name=='buffer-bootstrap-inline.py' else ['-c',expected,str(len(buffer.encode())),'readonly','1',buffer]
            outputs=[];environment={'__name__':'_actual_inline_buffer_verifier','__builtins__':dict(vars(builtins),print=lambda value:outputs.append(json.loads(value)))}
            with patch.object(os,'getpid',s.pid),patch.object(os,'getppid',s.ppid),patch.object(sys,'argv',argv):
                try:exec(compile(EXTRA[name],'<actual-'+name+'>','exec'),environment)
                except SystemExit as status:code=status.code
                else:raise AssertionError('BUFFER_STATUS_REQUIRED')
            check(name+('_POSITIVE_KNOWN_HELPER' if valid else '_BAD_SHA_CLOSED_HOLD'),code==(0 if valid else 1) and len(outputs)==1 and outputs[0]['helper']['pid']==s.pid() and outputs[0]['helper']['start'] is None and outputs[0]['helper']['fullFingerprint'] is None and outputs[0]['qualified'] is False)

def tests():factory_checks();installer_checks();prior_and_join_checks();reason_and_delivery_checks();loader_checks();setup_checks()
sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),
        (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),
        (socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,blocked))
    tests()
result=dict(kind='SOURCE04_EXACT_CHANGED_BOUNDARY_ACTUAL_FUNCTION_FAKES',passed=len(ns['RESULTS']),failed=0,checks=ns['RESULTS'],realBoundaryCalls=ns['BLOCKED'],sourcePins={**{n:P.sha(raw) for n,raw in ns['SRC'].items()},**{n:P.sha(raw) for n,raw in EXTRA.items()}},fixtureHarnessSha256=P.sha(harness),actualSubjectOperations=0,actualBashOrPlatformCompatibilityProved=False)
(HERE/'source03-check-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ('checks','sourcePins')}))
