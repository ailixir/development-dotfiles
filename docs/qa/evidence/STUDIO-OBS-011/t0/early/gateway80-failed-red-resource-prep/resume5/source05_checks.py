"""One bounded actual-function fake batch. Every target effect stays in memory.

Preload approved source/stdlib, then install the unchanged inherited deny audit.
The original fixture is bound literally; only synthetic fixture construction is
adapted to the new typed subjects. No actual self-text preimage is used or guessed.
"""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path(__file__).absolute().parent;OLD=HERE.parent/'resume4'
raw=(OLD/'checks.py').read_bytes();prefix=raw.split(b'\nsys.addaudithook(audit)',1)[0]
prefix=prefix.replace(b'gateway80-failed-red-resource-prep/resume4/manifest.json',b'gateway80-failed-red-resource-prep/resume5/manifest.json').replace(b'code04-exact-review',b'code05-exact-review')
# Read new six payloads through the old, literal fixture's existing preload code.
ns={'__name__':'_source05_inherited_fixture','__file__':str(HERE/'checks.py')}
exec(compile(prefix,'<literal-source04-fixture-definitions>','exec'),ns)
A,P,C,Machine,MemPath=[ns[n] for n in ('A','P','C','Machine','MemPath')]
EXTRA={n:(HERE/n).read_bytes() for n in ('factory.py','installer.py','install-cli.py','install-loader.bash')}
F=types.ModuleType('_actual_source05_factory');F.__dict__.update(P=P,R=A.R,N=A.N);exec(compile(EXTRA['factory.py'],'<actual-source05-factory>','exec'),F.__dict__)
I=types.ModuleType('_actual_source05_installer');I.__dict__.update(P=P,F=F,Custody=C.Custody,R=A.R,E=A.E,N=A.N,SOURCE=MemPath(HERE));exec(compile(EXTRA['installer.py'],'<actual-source05-installer>','exec'),I.__dict__)
CLI=types.ModuleType('_actual_source05_install_cli');exec(compile(EXTRA['install-cli.py'],'<actual-source05-cli>','exec'),CLI.__dict__)
RESULTS=[]
def check(name,value):
    if value is not True:raise AssertionError(name)
    RESULTS.append(dict(name=name,pass_=True))
def deny(name,action,reason=None):
    try:action()
    except BaseException as error:
        if isinstance(error,AssertionError):raise
        if not isinstance(error,(P.Hold,C.Hold,ValueError,OSError,subprocess.TimeoutExpired)):raise
        check(name,reason is None or error.args==(reason,))
        return error
    raise AssertionError('EXPECTED_DENIAL_'+name)
def held(*args):raise OSError(errno.EAGAIN,'SYNTHETIC_HELD')
def actor(pid,evidence):return dict(pid=pid,ppid=17932,kind='EXTERNAL_ROOT_CONTROL_AUTHOR',start=None,argvHash=None,fullFingerprint=None,completionKind='ACTUAL_EXTERNAL_TOOL_EXIT',actualStatus=None,directWaitClaimed=False,qualified=False,requiredDisposition='NUMERIC_ABSENCE_EVERY_APPLICABLE_COMPLETE_TABLE_AND_BOTH_FINITE_JOINS',evidence=evidence)
def sample(self,app):return dict(reported=P.text_fact('SYNTHETIC_OPAQUE_MEMORY_VALUE'),origArgv0=P.text_fact(app),origArgv0LiteralAppSatisfied=True)
Machine.python=sample
def completion(s,k,h,rows):
    pending={r['pid']:r for r in rows if r['actualStatus'] is None}
    value=dict(kind='ROOT_OPERATOR_ATTESTATION',unit=k['subject']['label'],controlSha256=h,roleContractSha256=P.sha(P.packed(k['typedRoleContract'])),readonlyBuffer=True,separatelyCaptured=True,actors=[dict(pid=r['pid'],ppid=r['ppid'],completionKind=r['completionKind'],actualStatus=0,toolEvidence=[dict(toolCallId='SYNTHETIC_EXTERNAL_TOOL',separateStatusCaptured=True,actualStatus=0)]) for r in pending.values()])
    return P.packed(value)
def populate_owners(s,k,a):
    a['typedOwnerRecordPins']={}
    for who,path in k['typedOwnerPaths'].items():
        data=P.packed(P.owner_expected(a,k,who));s.fs.put(path,data,0o600);a['typedOwnerRecordPins'][path]=P.sha(data)
def refresh_sources(s,k,a,b):
    b['contract.json']=P.packed(k)
    for n,data in b.items():s.fs.put(A.N/n,data)
    a['codePins']={n:P.sha(data) for n,data in b.items()}
    for path in a['newCodeRecordPins']:
        if '/early/' in path:data=P.packed(dict(files=[dict(path=n,sha256=P.sha(data),bytes=len(data),mode=0o644) for n,data in b.items()]))
        else:data=P.packed(dict(subjectManifestSha256=next(h for p,h in a['newCodeRecordPins'].items() if '/early/' in p),mandatoryFindingCount=0,verdict='CONDITIONAL_EXACT_SOURCE_SUPPORT'))
        s.fs.put(path,data,0o644);a['newCodeRecordPins'][path]=P.sha(data)
    populate_owners(s,k,a)
def build():
    s,k,a,auth,b=ns['build']();fs=s.fs
    # Namespace02 is a second immutable prior, distinct from active03.
    prior=k['priorNamespaces'][1];path=MemPath(prior['directory']['path']);fs.directory(path,0o700,ino=prior['directory']['ino'])
    for row in prior['members']:
        data=b'SYNTHETIC_PRIOR02_'+row['path'].encode();fs.put(path/row['path'],data,row['mode'],ino=row['ino']);row.update(sha256=P.sha(data),bytes=len(data),mtimeNs=1000,ctimeNs=1000)
    old=a.pop('pythonRoles');a['physicalPythonRoles']={new:old[oldkey] for new,oldkey in [('requestedLaunchBIN','launch'),('sampledProcessAPP','process'),('origArgv0CanonicalAPP','observedArgument')]}
    k.pop('expectedPythonRoles',None);k['expectedPhysicalPythonRoles']=copy.deepcopy(a['physicalPythonRoles'])
    k['typedRoleContract']['physicalPythonRoles']=k['expectedPhysicalPythonRoles']
    for key,text in [('reported','SYNTHETIC_OPAQUE_MEMORY_VALUE'),('origArgv0','/synthetic/python-app')]:
        expected=k['typedRoleContract']['selfTextConstraints'][key];expected['expectedUtf8Bytes']=len(text.encode());expected['expectedTextSha256']=P.sha(text.encode())
        if key=='origArgv0':expected['independentLiteralEqualityRequired']=text
    for i,(path,h) in enumerate(k['priorIndexPins'].items()):
        p=k['priorNamespaces'][i];data=P.packed(dict(N=p['directory'],members=p['members']))
        fs.put(path,data,0o644);k['priorIndexPins'][path]=P.sha(data);a['externalPins'][path]=P.sha(data);k['externalSourcePins'][str(MemPath(path).relative_to(A.R))]=P.sha(data)
    k['typedMetadataPins']={p:a['externalPins'][p] for p in k['typedMetadataPins']}
    a.update(typedRoleContract=k['typedRoleContract'],roleContractSha256=P.sha(P.packed(k['typedRoleContract'])),legacyReportedCanonicalPredicateSatisfied=False,priorNamespaces=k['priorNamespaces'],oldIndexSha256=k['frozenEvidence']['terminalIndexSha256'])
    refresh_sources(s,k,a,b);auth=P.sha(P.packed(a));fs.put(A.N/'root-authorization.json',P.packed(a))
    setup=P.decode(fs.nodes[str(A.N/'root-setup-ownership.json')]['raw']);setup['successfulSetupHelpers']=setup.pop('helpers');setup['successfulSetupHelpers'][0]['requestedLaunch']=a['physicalPythonRoles']['requestedLaunchBIN']
    setup.update(releaseSha256=auth,typedRoleBinding=P.typed_binding(a,k),typedActorRosterComplete=True,typedPriorActors=[*copy.deepcopy(k['knownPostBaseActors']),actor(900102,str(A.N/'root-setup-ownership.json'))],typedActorEvidencePins=k['typedMetadataPins'],bindingBufferSha256=a['codePins']['guard-failed-red.bash'],bindingBufferBytes=len(b['guard-failed-red.bash']))
    setup['inputPins']={str(A.N/n):P.sha(data) for n,data in b.items()};setup['inputPins'][str(A.N/'root-authorization.json')]=auth
    fs.put(A.N/'root-setup-ownership.json',P.packed(setup));s.fixture_a=a;s.fixture_k=k;s.author_counter=900200
    return s,k,a,auth,b
def root_control(s,k,auth,mode,role,**extra):
    value,h=ns['root_control'](s,k,auth,mode,role,**extra);a=s.fixture_a;s.author_counter+=1
    setup=P.decode(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw'])
    value.update(typedRoleBinding=P.typed_binding(a,k),typedActorRosterComplete=True,typedPriorActors=[*setup['typedPriorActors'],actor(s.author_counter,str(A.N/A.ROLES[mode][0]))],typedActorEvidencePins=k['typedMetadataPins'])
    raw=P.packed(value);s.fs.put(A.N/A.ROLES[mode][0],raw);return value,P.sha(raw)
def invoke(s,k,a,auth,b,mode,control=None,control_sha=None):
    if mode=='negative':control=P.decode(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw']);control_sha=P.sha(P.packed(control))
    allactors=[]
    for p,node in s.fs.nodes.items():
        if MemPath(p).parent==MemPath(A.N) and MemPath(p).name in A.CONTROLS-{'root-authorization.json'}:allactors.extend(P.decode(node['raw'])['typedPriorActors'])
    raw=completion(s,k,control_sha,allactors)
    created=[];actual=A.Unit
    def construction(*args,**kwargs):
        unit=actual(*args,**kwargs);created.append(unit);return unit
    with patch.object(A,'Unit',construction):status=A.run(mode,auth,control_sha,system=s,root_raw=P.packed(a),code_buffers=b,completion_raw=raw,completion_sha=P.sha(raw))
    return created[0],status
def root_admission(s,k,a,auth):
    legacy=dict(a,pythonRoles={'launch':a['physicalPythonRoles']['requestedLaunchBIN']})
    value=ns['root_admission'](s,k,legacy,auth);value['requestedLaunch']=value.pop('configuredLaunch');value['requestedLaunchOperatorTrace']=value.pop('configuredLaunchOperatorTrace');value['typedRoleBinding']=P.typed_binding(a,k);value.update(typedActorRosterComplete=True,typedPriorActors=k['knownPostBaseActors'],typedActorEvidencePins=k['typedMetadataPins']);s.fs.put(A.N/'root-guard-admission.json',P.packed(value));return value
# These are fixture callbacks only; the actual adapter/state-machine functions
# and source06 definitions are unchanged in their SAME compiled namespaces.
ns['build']=build if False else ns['build']
ns['invoke']=invoke;ns['root_control']=root_control if False else ns['root_control']
ns['root_admission']=root_admission if False else ns['root_admission']
def flow(s,k,a,auth,b):
    u,status=invoke(s,k,a,auth,b,'negative');check('FRESH_NEGATIVE_MISSING_READINESS_ONE',status==1)
    ns['next_client'](s);v,h=root_control(s,k,auth,'held-proof','NEGATIVE_ACTUAL_STATUS',actualNegativeStatus=1,separatelyCaptured=True,oldNormalBindingsUnchanged=True)
    u,status=invoke(s,k,a,auth,b,'held-proof',v,h);check('SAME_HOLDER_STANDALONE_HELD_ZERO',status==0)
    root_admission(s,k,a,auth);ns['next_client'](s);v,h=root_control(s,k,auth,'archive','ARCHIVE_FAILED_STATE');u,status=invoke(s,k,a,auth,b,'archive',v,h);check('FULL_FAILED_W_ORIGINAL22_RAW4_ARCHIVE_ZERO',status==0)
    ns['next_client'](s);v,h=root_control(s,k,auth,'final','ACTUAL_ARCHIVE_REVIEW',actualArchiveExit=0,actualQaReviewed=True,archiveInspected=True,separatelyCaptured=True);u,status=invoke(s,k,a,auth,b,'final',v,h);check('ONCE_FINAL_ZERO_AND_READINESS_BOUND',status==0)
    ns['next_client'](s);v,h=root_control(s,k,auth,'gate','FAILED_EXIT_PERMIT',expectedWrapperExit=1,actualFinalStatus=0,finalSeparateStatusCaptured=True,readinessInspected=True,oldNormalBindingsUnchanged=True,issuedAtEpoch=1001);s.epoch=1002;u,status=invoke(s,k,a,auth,b,'gate',v,h);check('DISTINCT_60S_GATE_ZERO_FOR_WRAPPER_ONE',status==0)
    ns['next_client'](s,True);v,h=root_control(s,k,auth,'postclose','ACTUAL_WRAPPER_RESULT',actualWrapperExit=1,separatelyCaptured=True,actualToolEvidence=['SYNTHETIC_ACTUAL_WRAPPER1']);u,status=invoke(s,k,a,auth,b,'postclose',v,h);check('OUTER_POSTCLOSE_ZERO_COMPLETION_STILL_EXTERNAL',status==0)
    check('ALL_CURRENT_RECORDS_BIND_TYPED_SUBJECT_AND_OWNERS',all(P.decode(n['raw']).get('typedRoleBinding')==P.typed_binding(a,k) for p,n in s.fs.nodes.items() if p.startswith(str(A.N)+'/') and n['kind']=='file' and MemPath(p).name not in set(k['installedCode'])|{'root-authorization.json'} and '/' not in p[len(str(A.N))+1:]))
    check('KNOWN11_PLUS_ALL_LATER_AUTHORS_NEVER_COERCED_TO_HELPER0',len(u.typed_actors)==17 and {r['pid'] for r in k['knownPostBaseActors']}<={r['pid'] for r in u.typed_actors})
    return u
def factory_fixture():
    s,k,a,auth,b=build();a=copy.deepcopy(a);a['newDirectoryPins']={}
    for n in ('binaryHashes','binaryModes','binaryWitnesses'):a.pop(n,None)
    witnesses={}
    for path,h in P.binary_requirements(a,k).items():
        st=s.fs.info(path);witnesses[path]=dict(path=path,sha256=h,mode=stat.S_IMODE(st.st_mode),uid=st.st_uid,dev=st.st_dev,ino=st.st_ino,bytes=st.st_size,mtimeNs=st.st_mtime_ns,ctimeNs=st.st_ctime_ns,acquisition='SAME_BUFFER_NOFOLLOW_FD')
    records={p:s.fs.nodes[p]['raw'] for p in set(a['newCodeRecordPins'])|set(a['typedOwnerRecordPins'])}
    return s,k,a,b,witnesses,records
def installer_fixture():
    s,k,a,b,w,r=factory_fixture()
    s.fs.nodes={p:n for p,n in s.fs.nodes.items() if p!=str(A.N) and not p.startswith(str(A.N)+'/')}
    payload={**b,**{n:EXTRA[n] for n in ('factory.py','installer.py','install-cli.py')}}
    for n,data in payload.items():s.fs.put(MemPath(HERE)/n,data,0o644)
    source=str(MemPath(HERE)/'manifest.json');data=P.packed(dict(files=[dict(path=n,sha256=P.sha(data),bytes=len(data),mode=0o644) for n,data in payload.items()]));s.fs.put(source,data,0o644);a['newCodeRecordPins'][source]=P.sha(data)
    for path in a['newCodeRecordPins']:
        if path==source:continue
        raw=P.packed(dict(subjectManifestSha256=P.sha(data),mandatoryFindingCount=0,verdict='CONDITIONAL_EXACT_SOURCE_SUPPORT'));s.fs.put(path,raw,0o644);a['newCodeRecordPins'][path]=P.sha(raw)
    populate_owners(s,k,a)
    outside=MemPath(next(iter(k['typedOwnerPaths'].values()))).parent
    def fact(p):
        st=s.fs.info(str(p));return dict(path=str(p),uid=st.st_uid,dev=st.st_dev,ino=st.st_ino,mode=stat.S_IMODE(st.st_mode))
    s.fs.nodes[str(outside)]['mode']=0o700
    scope=dict(role='SOURCE05_INSTALL_ONLY',authorizedBy='root',authorized=True,cleanup=False,nativeInvocations=0,sourceDirectory=str(HERE),destination=str(A.N),outsideDirectory=str(outside),outsideDirectoryFact=fact(outside),oldEDirectory=fact(A.E),candidate=a,sourceManifestSha256=P.sha(data),reviewPins=a.pop('newCodeRecordPins'),ownerPins=a.pop('typedOwnerRecordPins'),readsetPolicy='EXACT_SOURCE05_CONTRACT_REVIEWS_OWNERS_TYPED_METADATA_BOTH_PRIORS_AND_SEVEN_CANONICAL_BINARIES')
    a.pop('codePins');path=outside/'root-install-scope.json';raw=P.packed(scope);s.fs.put(path,raw);return s,k,scope,path,P.sha(raw),outside
def tests():
    for name,value,complete in [('ascii','abc',True),('utf8','é'*2048,True),('byte_over','é'*2049,False),('char_over','x'*4097,False),('empty','',False),('nul','x\0y',False),('surrogate','\ud800',False),('not_str',123,False)]:
        fact=P.text_fact(value);check('SELF_TEXT_'+name,(fact['status']=='COMPLETE') is complete and set(fact)=={'kind','status','encoding','normalization','utf8Bytes','textSha256'} and 'path' not in fact)
    with patch.object(P,'sha',lambda raw:(_ for _ in ()).throw(ValueError('SYNTHETIC_HASH'))):fact=P.text_fact('abc')
    check('SELF_HASH_FAILURE_RETAINS_KNOWN_COUNT_NO_RAW',fact==dict(kind='SELF_REPORTED_TEXT_DIGEST',status='HASH_UNAVAILABLE',encoding='STRICT_UTF8',normalization='NONE',utf8Bytes=3,textSha256=None))
    s,k,a,auth,b=build()
    with patch.dict(A.__dict__,MANIFEST06=s.package_sha),patch.object(fcntl,'flock',held):u=flow(s,k,a,auth,b)
    check('FULL_FLOW_NO_NATIVE_OR_COMPILER',all(r['command'][0] in ('/synthetic/ps','/synthetic/lsof','/synthetic/git') for r in u.utilities))
    check('BOTH_PRIORS_UNCHANGED',all(P.sha(s.fs.nodes[str(MemPath(p['directory']['path'])/r['path'])]['raw'])==r['sha256'] for p in k['priorNamespaces'] for r in p['members']))
    # Typed role, count, owner and completion failures are prequalification; no client write.
    for kind in ('wrong_text','wrong_orig_literal','missing_owner','cross_profile','missing_completion','wrong_completion_parent','completion_extra','known_actor_live'):
        s,k,a,auth,b=build();setup=P.decode(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw']);h=P.sha(P.packed(setup));raw=completion(s,k,h,setup['typedPriorActors']);v=P.decode(raw)
        if kind=='wrong_text':s.python=lambda app:dict(sample(s,app),reported=P.text_fact('DIFFERENT_SYNTHETIC_TEXT'))
        if kind=='wrong_orig_literal':s.python=lambda app:dict(sample(s,app),origArgv0LiteralAppSatisfied=False)
        if kind=='missing_owner':s.fs.nodes[next(iter(a['typedOwnerRecordPins']))]['raw']+=b'X'
        if kind=='cross_profile':a['typedRoleContract']=dict(a['typedRoleContract'],kind='GATEWAY_LOCAL_RUNNER_REPORT_SAMPLED_OBSERVATIONS_V1');auth=P.sha(P.packed(a))
        if kind=='missing_completion':v['actors']=[]
        if kind=='wrong_completion_parent':v['actors'][0]['ppid']=3749
        if kind=='completion_extra':v['actors'].append(dict(v['actors'][0],pid=900999))
        if kind=='known_actor_live':s.extra[25986]=dict(pid=25986,ppid=1,start='DIFFERENT_CURRENT_START',argv='unrelated',comm='/synthetic/python-app')
        raw=P.packed(v)
        with patch.dict(A.__dict__,MANIFEST06=s.package_sha),patch.object(fcntl,'flock',held):deny('PREQUAL_'+kind,lambda:A.run('negative',auth,h,system=s,root_raw=P.packed(a),code_buffers=b,completion_raw=raw,completion_sha=P.sha(raw)))
        check('PREQUAL_'+kind+'_NO_CLIENT_N_FACT',not any(MemPath(p).name.startswith('client-') for p in s.fs.nodes if p.startswith(str(A.N)+'/')) and s.operator_records[-1]['qualified'] is False)
    s,k,a,b,w,r=factory_fixture();before=copy.deepcopy(s.fs.nodes);draft=F.preflight(a,k,b,w,r);check('SEVEN_BEFORE_MUTATION_PURE_DRAFT',len(draft['candidate']['binaryWitnesses'])==7 and draft['candidate']['newDirectoryPins']=={} and s.fs.nodes==before)
    for kind in ('five','wrong_owner','wrong_review_path','bool_mode','extra_witness','owner_extra_field','authority_extra_field'):
        aa=copy.deepcopy(a);ww=copy.deepcopy(w);rr=dict(r)
        if kind=='five':ww.pop(k['binaryAncestors']['node']['path']);ww.pop(k['binaryAncestors']['helm']['path'])
        if kind=='wrong_owner':rr[next(iter(aa['typedOwnerRecordPins']))]=P.packed(dict(kind='INERT_UNIT_SPECIFIC_TYPED_ROLE_TECHNICAL_OWNER_DECISION_TEMPLATE'))
        if kind=='wrong_review_path':aa['newCodeRecordPins']={p.replace('code05-exact-review','source05-exact-review'):h for p,h in aa['newCodeRecordPins'].items()}
        if kind=='bool_mode':next(iter(ww.values()))['mode']=True
        if kind=='extra_witness':ww['/synthetic/extra']=next(iter(ww.values()))
        if kind=='owner_extra_field':
            path=next(iter(aa['typedOwnerRecordPins']));v=P.decode(rr[path]);v['unrecognizedField']=True;rr[path]=P.packed(v);aa['typedOwnerRecordPins'][path]=P.sha(rr[path])
        if kind=='authority_extra_field':aa['unrecognizedField']=True
        deny('FACTORY_'+kind,lambda:F.preflight(aa,k,b,ww,rr));check('FACTORY_'+kind+'_NO_MUTATION',s.fs.nodes==before)
    # Actual CLI/installer source with synthetic canonical readset and two prior dirs.
    for fail in (False,True):
        s,k,scope,path,h,outside=installer_fixture();oldstat=s.api.fstat
        if fail:
            def metadata(fd):
                if s.fs.fds[fd]['path']==str(A.N):raise OSError('SYNTHETIC_POST_MKDIR')
                return oldstat(fd)
            s.api.fstat=metadata
        if fail:
            deny('INSTALL_POST_MKDIR_HOLD',lambda:CLI.execute(str(path),h,system=s,verified_self_sha=P.sha(EXTRA['install-cli.py'])))
            trace=s.operator_records[-1];check('PARTIAL_CREATED_IMMEDIATE_NULL_IDENTITY',trace['namespaceCreation']==dict(created=True,openedIdentity=None) and trace['qualified'] is False and str(outside/'install-attempt.json') in s.fs.nodes)
        else:
            result=CLI.execute(str(path),h,system=s,verified_self_sha=P.sha(EXTRA['install-cli.py']));check('INSTALL_CLI_SEVEN_BOTH_PRIORS_ZERO',result['installationExit']==0 and len(P.decode(s.fs.nodes[str(A.N/'root-authorization.json')]['raw'])['binaryWitnesses'])==7)
    # Literal retained finalizer/publication bodies are exercised with fake effects.
    s,k,a,auth,b=build();v=P.decode(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw']);v['unrecognizedField']=True;deny('CONTROL_EXTRA_FIELD_CLOSED_SCHEMA',lambda:P.control_shape(v,k),'CONTROL_UNKNOWN_FIELD')
    good=sample(s,'/synthetic/python-app')
    for kind in ('digest','count','bool_count','unknown_field'):
        bad=copy.deepcopy(good)
        if kind=='digest':bad['reported']['textSha256']='0'*64
        if kind=='count':bad['reported']['utf8Bytes']+=1
        if kind=='bool_count':bad['reported']['utf8Bytes']=True
        if kind=='unknown_field':bad['reported']['path']='/synthetic/never-read'
        deny('STRICT_SAME_SAMPLE_'+kind,lambda:P.require_self_sample(bad,k))
    records=[];sink=P.FailureSink(records.append,1,2);token=sink.claim_finalizer('CALLER');primary=P.Hold('SELF_TEXT_DIGEST_COUNT_MISMATCH');sink.primary(primary);sink.cleanup(OSError('RAW_NOT_EXPORTED'));check('BORROWED_SINK_NO_EARLY_EMIT',records==[]);sink.finalize(token);check('OUTER_FINALIZER_PRESERVES_PRIMARY_AND_CLEANUP',len(records)==1 and records[0]['primaryFailure']['reason']=='SELF_TEXT_DIGEST_COUNT_MISMATCH' and len(records[0]['cleanupFailures'])==1 and 'RAW_NOT_EXPORTED' not in json.dumps(records));deny('FINALIZER_ONCE',lambda:sink.finalize(token))
    check('NO_REAL_TARGET_BOUNDARY',ns['BLOCKED']==[])
sys.addaudithook(ns['audit'])
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),(socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,ns['blocked']))
    tests()
result=dict(kind='SOURCE05_BOUNDED_ACTUAL_FUNCTION_FAKE_BATCH',passed=len(RESULTS),failed=0,checks=RESULTS,realBoundaryCalls=ns['BLOCKED'],sourcePins={n:hashlib.sha256(v).hexdigest() for n,v in {**ns['SRC'],**EXTRA}.items()},fixtureHarnessSha256=hashlib.sha256(raw if False else prefix).hexdigest(),syntheticTextExplicitlyDifferent=True,actualTargetActions=0)
# Inherited audit allows ONLY this original named result artifact after patches.
(HERE/'check-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(passed=len(RESULTS),failed=0,realBoundaryCalls=ns['BLOCKED'])))
