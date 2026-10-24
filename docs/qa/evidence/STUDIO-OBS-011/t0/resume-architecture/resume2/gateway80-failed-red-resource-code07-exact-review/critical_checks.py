"""Bounded independent Source07 affected path; all target effects fake."""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types,shlex
from contextlib import ExitStack
from unittest.mock import patch
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume7').absolute()
raw_manifest=(S/'manifest.json').read_bytes();assert hashlib.sha256(raw_manifest).hexdigest()=='045c5121ff25966eff78d741894684c776448e35c553cceb7765591ff70dd9b1'
CACHE={r['path']:(S/r['path']).read_bytes() for r in json.loads(raw_manifest)['files']}
assert all(hashlib.sha256(CACHE[r['path']]).hexdigest()==r['sha256'] and len(CACHE[r['path']])==r['bytes'] for r in json.loads(raw_manifest)['files'])
source=CACHE['critical_check.py'];head=source.split(b'RESULT_FD=os.open',1)[0];tail=source.split(b'def check(name,value):',1)[1].split(b'\nfailure=None\nsys.addaudithook',1)[0]
H={'__name__':'_aria07_exact_fake_definitions','__file__':str(S/'critical_check.py')}
exec(compile(head+b'\ndef check(name,value):'+tail,'<exact-fixture-definitions-no-artifact-writer-or-tests>','exec'),H)
A,P,CLI,G,MemPath=[H[n] for n in ('A','P','CLI','G','MemPath')]
checks=[]
def check(n,v):
    if v is not True:raise AssertionError(n)
    checks.append({'id':n,'passed':True,'effects':'FAKE'})
def deny(n,fn,reason):
    try:fn()
    except P.Hold as e:check(n,e.args==(reason,));return
    raise AssertionError('EXPECTED_DENIAL_'+n)
def tests():
    s,k,base,b,path,scope_raw,response,envelope=H['build_scope']();scope=P.decode(scope_raw);scope_sha=P.sha(scope_raw)
    context=dict(base,newCodeRecordPins=scope['reviewPins']);before=copy.deepcopy(s.fs.nodes)
    bad=copy.deepcopy(envelope);bad['actors'][0]['originalTrace']['actualStatus']=1
    br=P.packed(bad);deny('TRACE_MISMATCH_PREMUTATION',lambda:P.initial_actor_facts(br,P.sha(br),context,k,scope_sha,s.pid()),'INITIAL_FACT_TRACE_BINDING')
    bad=copy.deepcopy(envelope);item=copy.deepcopy(bad['actors'][0]);item['ppid']+=1;item['originalTrace']['ppid']+=1;bad['actors'].append(item)
    br=P.packed(bad);deny('CONFLICTING_ORIGINAL_PID_PREMUTATION',lambda:P.initial_actor_facts(br,P.sha(br),context,k,scope_sha,s.pid()),'TYPED_ACTOR_ROSTER_CONFLICT')
    check('ADVERSE_ORIGINAL_FACTS_NO_WRITES',s.fs.nodes==before)
    # Final actual lexical install-loader, actual CLI/factory/installer, exact fake System injection.
    outputs=[];real=exec;injected=[]
    def track(code,env):
        env['__builtins__']=dict(vars(builtins),exec=track,print=lambda v,**kw:outputs.append(json.loads(v)));real(code,env)
        if code.co_filename=='<verified-failed_resource_source07-system>':env['System']=lambda:s;injected.append(True)
    env={'__name__':'_aria07_actual_quoted_installer','__builtins__':dict(vars(builtins),exec=track,print=lambda v,**kw:outputs.append(json.loads(v)))}
    argv=['-c',str(S/'install-cli.py'),P.sha(CACHE['install-cli.py']),str(path),scope_sha,response['sha256'],response['buffer']]
    with ExitStack() as stack:
        for n in ['open','fstat','stat','close','read','getuid','getpid','getppid']:stack.enter_context(patch.object(os,n,getattr(s.api,n)))
        stack.enter_context(patch.object(sys,'argv',argv))
        try:real(compile(H['INSTALL_BODY'],'<actual-source07-final-lexical-install-loader>','exec'),env)
        except SystemExit as end:status=end.code
        else:raise AssertionError('EXPLICIT_STATUS_REQUIRED')
    check('CURRENT_LEXICAL_LOADER_COMPLETE_INSTALL_ZERO',status==0 and injected==[True] and env['sink'].finalized)
    a=P.decode(s.fs.nodes[str(A.N/'root-authorization.json')]['raw']);auth=P.sha(s.fs.nodes[str(A.N/'root-authorization.json')]['raw'])
    result=P.decode(s.fs.nodes[str(path.parent/'installation-result.json')]['raw']);expected={r['pid'] for r in envelope['actors']};rows={r['pid']:r for r in a['typedPriorActors']}
    check('FIRST_COMPLETE_AUTH_ALL_SEVEN_ORIGINAL_FACTS',a['typedActorRosterComplete'] is True and len(expected)==7 and expected<=set(rows))
    check('FIRST_INSTALL_STATE_ALL_SEVEN_ORIGINAL_FACTS',expected<={r['pid'] for r in result['namespaceState']['header']['actorFacts']})
    check('CANONICAL_RAW_FACT_AND_SCOPE_PINS_RETAINED',a['initialActualFactsBuffer']==response['buffer'] and a['initialActualFactsSha256']==response['sha256'] and a['initialInstallScopeSha256']==scope_sha)
    check('OWN_INSTALLER_PENDING_EXTERNAL_ONE_NOT_DIRECTWAIT',rows[s.pid()]['actualStatus'] is None and rows[900089]['actualStatus']==1 and rows[900089]['directWaitClaimed'] is False)
    bad=copy.deepcopy(a);bad['typedPriorActors']=[r for r in bad['typedPriorActors'] if r['pid']!=900090]
    deny('FACTORY_CONSUMER_DERIVED_INCLUSION_DENIES_OMISSION',lambda:P.authority_shape(bad,k),'INITIAL_FACT_DERIVED_ROSTER')
    H['LAST_STATE']=result['namespaceState'];H['LAST_TOOL']=H['fake_tool'](s,0)
    facts=dict(separatelyCaptured=True,oldBindingsUnchanged=True,newBindingsReadonly=True,setupHelperRosterComplete=True,readEofStatus=1,actualBufferVerificationExit=0,actualEvalExit=0,successfulSetupHelpers=[dict(pid=900101,ppid=3749,start=None,fullFingerprint=None,requestedLaunch=a['physicalPythonRoles']['requestedLaunchBIN'],actualForegroundWaitStatus=0,separatelyCaptured=True,toolEvidence=['FAKE_ORIGINAL_SEPARATE_900101'])],actualToolEvidence=['SYNTHETIC_SETUP0'])
    control,h,state,actual=H['creator'](s,k,a,auth,b,H['LAST_STATE'],H['LAST_TOOL'],'SETUP_OWNERSHIP_ADMISSION',facts)
    check('SETUP_PRESERVES_ORIGINAL_ROWS_EXACTLY',all(next(r for r in control['typedPriorActors'] if r['pid']==pid)==rows[pid] for pid in expected))
    status,state,actual=H['phase'](s,k,a,auth,b,'negative',control,h)
    check('FIRST_QUALIFIED_NEGATIVE_ONE_RETAINS_ALL_FACTS',status==1 and actual['actualStatus']==1 and expected<={r['pid'] for r in state['header']['actorFacts']})
    check('NO_TARGET_REAL_BOUNDARY',G['ns']['BLOCKED']==[])

sys.addaudithook(G['ns']['audit'])
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),(socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for n in names:
            if hasattr(obj,n):stack.enter_context(patch.object(obj,n,G['ns']['blocked']))
    tests()
print('ARIA07_DONE:'+json.dumps({'passed':len(checks),'checks':checks,'caseGroups':3,'sourceSafetyEdits':False,'persistentDenyAuditUnchanged':True,'actualTargetEffects':0,'realBoundaryCalls':G['ns']['BLOCKED'],'fixtureBookkeepingNotAdded':len(H['CHECKS']),'sourceHashes':{n:hashlib.sha256(CACHE[n]).hexdigest() for n in H['TARGET']}},separators=(',',':')),flush=True)
