"""Independent bounded actual CODE05 functions, all effects fake; no suite replay."""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types
from contextlib import ExitStack
from unittest.mock import patch
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume5')
manifest_raw=(S/'manifest.json').read_bytes()
assert hashlib.sha256(manifest_raw).hexdigest()=='bd9da067c9d56545171050373a1926f9cd9d061966847ad35db680841cc8e9aa'
cache={r['path']:(S/r['path']).read_bytes() for r in json.loads(manifest_raw)['files']}
assert all(hashlib.sha256(cache[r['path']]).hexdigest()==r['sha256'] and len(cache[r['path']])==r['bytes'] for r in json.loads(manifest_raw)['files'])
# Exact definition prefix, no audit/test/body/result writer from the author suites.
outer=cache['outer_delivery_checks.py']
prefix=outer.split(b"\nsys.addaudithook(G['ns']['audit'])",1)[0]
assert prefix+outer[len(prefix):]==outer
H={'__name__':'_aria_code05_fake_definitions','__file__':str(S/'outer_delivery_checks.py')}
exec(compile(prefix,'<exact-author-fixture-definitions-only>','exec'),H)
G=H['G'];A,P,C,F,CLI,MemPath=[G[n] for n in ('A','P','C','F','CLI','MemPath')]
checks=[];cases=[]
def check(name, condition):
    if condition is not True:raise AssertionError(name)
    checks.append({'id':name,'passed':True,'effects':'FAKE'})
def denied(name, action, reason=None):
    try:action()
    except (P.Hold,C.Hold,ValueError,OSError,subprocess.TimeoutExpired) as error:
        check(name,reason is None or error.args==(reason,));return error
    raise AssertionError('EXPECTED_DENIAL_'+name)
def test():
    class Hostile(str):
        def encode(self,*a,**k):raise AssertionError('HOSTILE_CALLBACK')
        def __str__(self):raise AssertionError('HOSTILE_CALLBACK')
    positive=P.text_fact('é'*2048);negative=P.text_fact('é'*2049);hostile=P.text_fact(Hostile('abc'))
    check('STRICT_UTF8_4096_BYTE_POSITIVE',positive['status']=='COMPLETE' and positive['utf8Bytes']==4096)
    check('BYTE_OVERFLOW_AND_SUBCLASS_REJECT_BEFORE_ENCODING',negative['status']=='UNAVAILABLE' and negative['utf8Bytes'] is None and hostile['status']=='UNAVAILABLE')
    with patch.object(P,'sha',lambda b:(_ for _ in ()).throw(ValueError('SYNTHETIC_PRIVATE_HASH'))):fact=P.text_fact('abc')
    check('HASH_FAILURE_RETAINS_COUNT_NO_RAW',fact['status']=='HASH_UNAVAILABLE' and fact['utf8Bytes']==3 and fact['textSha256'] is None)
    cases.append('strict-memory-conversion-positive-adverse')

    s,k,a,b,w,r=G['factory_fixture']();before=copy.deepcopy(s.fs.nodes)
    draft=F.preflight(a,k,b,w,r)
    check('PURE_SEVEN_PRECREATION_DRAFT',len(draft['candidate']['binaryWitnesses'])==7 and draft['candidate']['newDirectoryPins']=={} and s.fs.nodes==before)
    badw=copy.deepcopy(w);badw.pop(k['binaryAncestors']['node']['path'])
    denied('MISSING_SEVENTH_DENIES_PREWRITE',lambda:F.preflight(a,k,b,badw,r),'FACTORY_SEVEN_WITNESSES')
    wrong=copy.deepcopy(a);records=dict(r);path=k['typedOwnerPaths']['Aria'];value=P.decode(records[path]);value['unit']='SYNTHETIC_WRONG_UNIT';records[path]=P.packed(value);wrong['typedOwnerRecordPins'][path]=P.sha(records[path])
    denied('WRONG_OWNER_SUBJECT_DENIES_PREWRITE',lambda:F.preflight(wrong,k,b,w,records),'TYPED_OWNER_EXACT_DECISION')
    check('FACTORY_ADVERSE_NO_MUTATION',s.fs.nodes==before)
    cases.append('factory-seven-owner-subject-beforewrite')

    s,k,a,auth,b=G['build']();control=P.decode(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw']);h=P.sha(P.packed(control));rows=control['typedPriorActors'];frozen=copy.deepcopy(rows)
    raw=G['completion'](s,k,h,rows);att=P.completion_attestation(raw,P.sha(raw),h,k);resolved=P.resolve_actor_completions(k,rows,att)
    check('PENDING_AUTHOR_RESOLVED_WITHOUT_MUTATING_CONTROL',rows==frozen and any(r['actualStatus'] is None for r in rows) and all(r['actualStatus'] is not None for r in resolved))
    later=G['actor'](900103,str(A.N/'root-negative-status.json'));both=[*rows,later]
    allraw=G['completion'](s,k,h,both);allatt=P.completion_attestation(allraw,P.sha(allraw),h,k)
    check('ACCUMULATED_PENDING_OLD_AND_CURRENT_BOTH_REQUIRED',len(allatt['actors'])==2 and len(P.resolve_actor_completions(k,both,allatt))==13)
    bad=copy.deepcopy(allatt);bad['actors']=bad['actors'][1:]
    denied('OMITTED_PRIOR_PENDING_AUTHOR_DENIES',lambda:P.resolve_actor_completions(k,both,bad),'ROOT_COMPLETION_EXACT_PENDING_SET')
    denied('CURRENT_CONTROL_CROSSBINDING_DENIES',lambda:P.completion_attestation(raw,P.sha(raw),'f'*64,k),'ROOT_COMPLETION_SOURCE_BINDING')
    check('KNOWN_ELEVEN_HONEST_STATUS_MEANINGS',len(k['knownPostBaseActors'])==11 and next(r for r in k['knownPostBaseActors'] if r['pid']==25986)['actualStatus']==1 and next(r for r in k['knownPostBaseActors'] if r['pid']==26057)['ppid'] is None and not next(r for r in k['knownPostBaseActors'] if r['pid']==9355)['directWaitClaimed'])
    cases.append('finite-accumulated-pending-control-binding')

    # Independently drive the actual whole closing dispatcher once over synthetic files.
    with patch.dict(A.__dict__,MANIFEST06=s.package_sha),patch.object(fcntl,'flock',G['held']):
        unit,status=G['invoke'](s,k,a,auth,b,'negative');check('FULL_NEGATIVE_QUALIFIED_ONE',status==1 and unit.prequalified and P.decode(s.fs.nodes[str(A.N/'negative-denial.json')]['raw'])['reason']=='MISSING_READINESS')
        for mode,role,extra in [('held-proof','NEGATIVE_ACTUAL_STATUS',dict(actualNegativeStatus=1,separatelyCaptured=True,oldNormalBindingsUnchanged=True)),('archive','ARCHIVE_FAILED_STATE',{}),('final','ACTUAL_ARCHIVE_REVIEW',dict(actualArchiveExit=0,actualQaReviewed=True,archiveInspected=True,separatelyCaptured=True)),('gate','FAILED_EXIT_PERMIT',dict(expectedWrapperExit=1,actualFinalStatus=0,finalSeparateStatusCaptured=True,readinessInspected=True,oldNormalBindingsUnchanged=True,issuedAtEpoch=1001)),('postclose','ACTUAL_WRAPPER_RESULT',dict(actualWrapperExit=1,separatelyCaptured=True,actualToolEvidence=['SYNTHETIC_WRAPPER1']))]:
            if mode=='archive':G['root_admission'](s,k,a,auth)
            G['ns']['next_client'](s,mode=='postclose')
            if mode=='gate':s.epoch=1002
            value,pin=G['root_control'](s,k,auth,mode,role,**extra);unit,status=G['invoke'](s,k,a,auth,b,mode,value,pin)
            check('FULL_'+mode+'_ZERO',status==0)
        check('ALL11_AND_DYNAMIC_AUTHORS_RETAINED',len(unit.typed_actors)==17 and {r['pid'] for r in k['knownPostBaseActors']}<={r['pid'] for r in unit.typed_actors})
        check('BOTH_PRIOR_DIRS_LITERAL_UNCHANGED',all(P.sha(s.fs.nodes[str(MemPath(p['directory']['path'])/r['path'])]['raw'])==r['sha256'] for p in k['priorNamespaces'] for r in p['members']))
    cases.append('actual-six-phase-closing-synthetic')

    s,k,a,auth,b=G['build']();prior=k['priorNamespaces'][1];s.fs.put(MemPath(prior['directory']['path'])/'SYNTHETIC_EXTRA',b'x')
    with patch.dict(A.__dict__,MANIFEST06=s.package_sha),patch.object(fcntl,'flock',G['held']):denied('SECOND_PRIOR_EXTRA_DENIES',lambda:G['invoke'](s,k,a,auth,b,'negative'), 'PRIOR_NAMESPACE_EXACT_MEMBERS')
    check('PRIOR_FAILURE_NO_QUALIFIED_CLIENT',not any(MemPath(p).name.startswith('client-') for p in s.fs.nodes if p.startswith(str(A.N)+'/')))
    cases.append('second-prior-adverse-no-fact')

    for failed,late in [(False,False),(True,True)]:
        machine,env,out,status,fds=H['execute_guard'](failed,late)
        check('COMPOSED_GUARD_STATUS_'+str(failed),status==1 and env['sink'].finalized and env['sink'].finalizer_label=='GUARD')
        if failed:
            check('LATE_OUTER_CLEANUP_SAME_FINAL_TRACE',len(out)==1 and out[0]['cleanupFailures']==env['sink'].cleanup_failures and fds[0] in machine.fs.fds)
            check('ORIGINAL_PRIMARY_UNKNOWN_CHILD_NO_RAW',out[0]['primaryFailure']['namespace']=='UNMAPPED_FAILURE' and out[0]['children'][0]['waited'] is False and 'PRIVATE_' not in json.dumps(out[0]))
        else:check('GUARD_CLEAN_NO_FAILURE_EMISSION',out==[] and fds[0] not in machine.fs.fds)
    cases.append('composed-guard-clean-primary-plus-lateclose')
    for late in [False,True]:
        machine,env,out,status,fds=H['execute_loader'](late)
        check('COMPOSED_LOADER_STATUS_'+str(late),status==(1 if late else 0) and env['sink'].finalized)
        check('LOADER_FINAL_CLOSE_ACCOUNTING_'+str(late),(len(out)==1 and out[0]['cleanupFailures']==env['sink'].cleanup_failures and fds[0] in machine.fs.fds) if late else (out==[] and fds[0] not in machine.fs.fds))
    cases.append('composed-installer-clean-lateclose')

    s,k,scope,path,h,outside=G['installer_fixture']();chmod=s.api.fchmod
    def fail_after_mkdir(fd,mode):
        if s.fs.fds[fd]['path']==str(A.N):raise OSError('SYNTHETIC_MKDIR_FCHMOD')
        return chmod(fd,mode)
    s.api.fchmod=fail_after_mkdir
    denied('IN_PRIMITIVE_MKDIR_FCHMOD_FAILURE',lambda:CLI.execute(str(path),h,system=s,verified_self_sha=P.sha(G['EXTRA']['install-cli.py'])))
    check('IMMEDIATE_CREATED_MARKER_NULL_OPENED_IDENTITY',s.operator_records[-1]['namespaceCreation']=={'created':True,'openedIdentity':None} and str(outside/'install-attempt.json') in s.fs.nodes)
    cases.append('partial-mkdir-before-return')
    check('NO_REAL_TARGET_BOUNDARY',G['ns']['BLOCKED']==[])

sys.addaudithook(G['ns']['audit'])
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),(socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,G['ns']['blocked']))
    test()
print(json.dumps({'kind':'ARIA_CODE05_INDEPENDENT_BOUNDED_ACTUAL_FUNCTION_FAKE_BATCH','passed':len(checks),'checks':checks,'cases':cases,'caseGroups':len(cases),'subjectPins':{n:hashlib.sha256(cache[n]).hexdigest() for n in ['failed_gateway.py','protocol.py','factory.py','installer.py','entry.py','install-cli.py','guard-failed-red.bash','install-loader.bash','custody.py','contract.json']},'fixtureDefinitionPrefixSha256':hashlib.sha256(prefix).hexdigest(),'fixturePrefixByteReverseProof':True,'sourceSafetyAstEdits':False,'persistentDenyAuditUnchanged':True,'unexpectedBoundaryEvents':G['ns']['BLOCKED'],'author78Replayed':False,'old313Or332Replayed':False,'actualTargetActions':0},indent=2))
