"""Source04 actual controller/current/effects plus explicitly instrumented cooperative relay.

All filesystem, process, native, clock, socket, thread, ABI and lock boundaries are fakes.
The relay test scheduler inserts exactly one yield after READY, with an AST equality proof;
this is not an unchanged full serve/thread execution or installed-platform qualification.
The separate retained104 suite exercises unchanged relay functions directly.
"""
import ast
import base64
import builtins
import collections
import collections.abc
import copy
import ctypes
import datetime
import errno
import fcntl
import hashlib
import io
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import resource
import selectors
import shlex
import signal
import socket
import stat
import struct
import subprocess
import sys
import threading
import time
import types
import xml.etree.ElementTree
import xml.parsers.expat
from contextlib import ExitStack
from unittest.mock import patch

HERE=Path(__file__).absolute().parent
names=['public_observation_unit.py','unit_policy.py','public_contract.py','public_relay.py',
 'runtime_adapter_checks.py','boundary03_checks.py','test_fixtures.py','runtime-root-release.template.json',
 'launch-control.template.json','guard-public-observe.bash','public-observation.schema.json','public-policy.json',
 'source-binding.json','Replay.preimage.java','Replay.postimage.java','observer.patch','observer.reverse.patch',
 'source03-pure-check-results.json','source03-runtime-adapter-check-results.json','source03-boundary03-check-results.json',
 'pure-check-results.json','runtime-adapter-check-results.json','boundary03-check-results.json']
PRE={n:(HERE/n).read_bytes() for n in names}
CORE_RAW=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py').read_bytes()
assert hashlib.sha256(CORE_RAW).hexdigest()=='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
PLAN_RAW=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-fullcheck-prep/resume4/execution/successor-plan.json').read_bytes()
assert hashlib.sha256(PLAN_RAW).hexdigest()=='9391e76dd403d45a1c8ab09c428ed6884a762c326959cefa63c781633c687313'
A={'__name__':'_actual04_adapter','__file__':'<inactive04>'}
P=types.ModuleType('_actual04_policy');C=types.ModuleType('_actual04_contract');R=types.ModuleType('_actual04_relay')
for filename,ns in [('unit_policy.py',P.__dict__),('public_contract.py',C.__dict__),
                    ('public_observation_unit.py',A),('public_relay.py',R.__dict__)]:
    exec(compile(PRE[filename],'<prepared04-'+filename+'>','exec'),ns)
F={};exec(compile(PRE['test_fixtures.py'],'<prepared04-fixtures>','exec'),F)
def definitions(filename,ns):
    tree=ast.parse(PRE[filename])
    tree.body=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))]
    exec(compile(tree,'<fake-boundary-definitions-'+filename+'>','exec'),ns)
T=dict(globals(),PRELOADED=PRE,RESULTS=[],BLOCKED=[]);definitions('runtime_adapter_checks.py',T)
Q=dict(globals(),A=types.SimpleNamespace(**A),checks=[],blocked_calls=[]);definitions('boundary03_checks.py',Q)
checks=[];blocked_calls=[]
def check(name,value):
    assert value is True,name
    checks.append(dict(name=name,**{'pass':True}))
def denied(name,fn,reason=None):
    try:fn()
    except (A['Hold'],P.Hold,R.RelayHold,ValueError,KeyError,TypeError,OSError,AssertionError) as error:
        check(name,reason is None or str(error)==reason)
    else:raise AssertionError(name)
def blocked(*args,**kwargs):
    blocked_calls.append('REAL_BOUNDARY');raise AssertionError('REAL_BOUNDARY')
def audit(event,args):
    if event in {'subprocess.Popen','os.system','os.fork','os.kill','socket.__new__','socket.connect','socket.bind','ctypes.dlopen'}:
        raise AssertionError('AUDIT_DENIED_'+event)
    if event=='open':
        if type(args[0]) is str and args[0]==str(HERE/'integration04-check-results.json') and ('w' in str(args[1]) or args[2]&os.O_WRONLY):return
        raise AssertionError('AUDIT_DENIED_OPEN')

# One disclosed scheduling yield, immediately after READY; all original statements remain.
tree=ast.parse(PRE['public_relay.py'])
relay_class=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='Relay')
serve=next(n for n in relay_class.body if isinstance(n,ast.FunctionDef) and n.name=='serve')
original_serve=copy.deepcopy(serve)
body=serve.body[0].body
where=next(i for i,n in enumerate(body) if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call)
           and ast.unparse(n.value.func)=='self.ready.set')
body.insert(where+1,ast.Expr(value=ast.Yield(value=ast.Constant('READY_SCHEDULE_POINT'))))
proof=copy.deepcopy(serve);del proof.body[0].body[where+1]
assert ast.dump(proof,include_attributes=False)==ast.dump(original_serve,include_attributes=False)
instrumented=ast.fix_missing_locations(ast.Module(body=[serve],type_ignores=[]))
ns=dict(R.__dict__);exec(compile(instrumented,'<single-yield-test-scheduler-only>','exec'),ns)
COOPERATIVE_SERVE=ns['serve']

class CooperativeThread:
    def __init__(self,callback):self.callback,self.generator,self.alive,self.joins=callback,None,False,[]
    def start(self):
        self.alive=True;self.generator=self.callback()
        assert next(self.generator)=='READY_SCHEDULE_POINT'
    def resume(self):
        if not self.alive:return
        try:next(self.generator)
        except StopIteration:self.alive=False
    def join(self,seconds):
        self.joins.append(seconds)
        self.resume()
    def is_alive(self):return self.alive

class ChainCustody(T['MemoryCustody']):
    def __init__(self,system,path,mode=None):
        super().__init__(system,path,mode)
        self.chain=[(None,'/',1,A['identity_key'](system.dirs['/'])),
                    (1,'leaf',2,A['identity_key'](system.dirs[str(path)]))]
    def members(self):
        names=set(super().members());prefix=self.path+'/'
        names.update(n[len(prefix):] for n in self.s.nodes if n.startswith(prefix) and '/' not in n[len(prefix):])
        return sorted(names)
    def info(self,name):
        self.check();key=self.path+'/'+name
        return self.s.nodes[key] if key in self.s.nodes else super().info(name)

class IntegratedBoundary(Q['Boundary']):
    def __init__(self,system):super().__init__();self.system=system;self.nodes=system.nodes
    def thread(self,callback):return CooperativeThread(callback)
    def mkdir_at(self,parent,name):
        parent.check();path=parent.path+'/'+name
        R.need(path not in self.system.dirs,'EXCLUSIVE_MKDIR')
        self.system.directory(Path(path));self.ids[path]=self.system.dirs[path].st_ino

class IntegratedSystem(T['FakeSystem']):
    def __init__(self):
        super().__init__();self.nodes={};self.effects=None;self.directory(Path('/private/tmp'))
        self.boundary=IntegratedBoundary(self)
    def custody(self,path,mode=None):return ChainCustody(self,path,mode)
    def relay_boundary(self,module):return self.boundary
    def process_identity(self,pid,path):
        A['need'](pid==40001 and path=='/synthetic/jdk/bin/java','FAKE_EXACT_SELECTED_KERNEL')
        return dict(pid=40001,ppid=40000,kernelStartSeconds=100,kernelStartMicroseconds=1,
                    processImage=path,uid=501,kernelIdentityComplete=True)
    def rows(self,utility=None):
        result=super().rows(utility)
        if self.native_live:result[40001]=self.row(40001,40000,'java worker.org.gradle.process.internal.worker.GradleWorkerMain Gradle Test Executor 1','/synthetic/jdk/bin/java')
        return result
    def popen(self,command,**kwargs):
        # Cooperative test scheduler only: let the actual table method first record the
        # selected JVM, then run all unchanged serve tail statements before the next utility.
        e=self.effects
        if e is not None and e.selected_worker is not None and e.relay is not None and e.relay.thread.is_alive():
            e.relay.thread.resume()
        if command[0]=='/synthetic/lsof' and '-U' in command:
            self.events.append(('Popen',list(command),dict(kwargs)));self.next_pid+=1
            return T['Child'](self,self.next_pid,command,'')
        return super().popen(command,**kwargs)

def root(e,name,value):
    raw=A['packed'](value)+b'\n'
    e.sys.put(A['CONTROL']/name,raw)
    # This helper represents the independent synthetic root/operator action, not the reader.
    assert name not in e.generated_control_buffers
    e.external_control_pins[name]=A['sha'](raw)
    return e.external_control_pins[name]

def phase_decision(e,phase,decision,prior):
    return root(e,'root-'+phase+'-decision.json',dict(authorizedBy='root',decision=decision,
        releaseSha256=e.a['releaseSha256'],activeLockSha256=e.a['activeLockSha256'],maximumInvocations=1,
        actualPriorEvidence={n:e.local_hash(n) for n in prior},operatorSeparateDecision=True,
        priorActualToolStatusesSeparatelyCaptured=True,actualToolEvidence=['SYNTHETIC_SEPARATE_TOOL_STATUS']))

def world():
    # Reuse explicit fake source/census/ownership fixtures, never their real helper mains.
    with patch.dict(T,FakeSystem=IntegratedSystem):e=T['current_world']()
    e.sys.effects=e
    a=json.loads(PRE['runtime-root-release.template.json']);a.update(e.a)
    for key in ('rootAuthorized','exactAriaCodeReviewed','exactQaCodePrivacyReviewed','limitedSourceWindowQualified',
                'literalScopeCertifiedNonIr','freshExclusiveSourceLease','gatewayProperlyClosed','newImmutableWrapperAndGuardBound'):
        a[key]=True
    a.update(baseSourceDigest=e.policy.BASE,preimageSha256=A['sha'](b'PRE'),postimageSha256=A['sha'](b'POST'),
             candidateSourceDigest=e.policy.CANDIDATE,adapterSha256='d'*64,guardSha256='e'*64)
    e.a=a;e.mode='selected'
    e.a['metadataScope']={'xml':str(A['XML'].relative_to(A['ROOT'])),'cohortRoot':str(A['COHORTS'].relative_to(A['ROOT'])),
       'cohortMembers':['cohort.json','guard-tally.json'],'canonicalGuard':str(A['CANONICAL_GUARD'].relative_to(A['ROOT'])),
       'newRunOnly':True,'privateBodies':False}
    env=dict(e.sys.env,JAVA_HOME=e.plan['javaHome'],LC_ALL='C')
    env['PATH']=e.plan['nodeBin']+':'+e.plan['javaHome']+'/bin:'+env['PATH'];e.a['nativeEnvironment']=env
    constants={'WRAPPER_SHA':A['sha'](b'wrapper')}
    e.a['nativeExecutablePins']=[]
    for constant,path,raw in [('JAVA_SHA',e.plan['javaHome']+'/bin/java',b'java21'),
        ('JAVA_RELEASE_SHA',e.plan['javaHome']+'/release',b'JAVA_VERSION=21'),('NODE_SHA',e.plan['nodeBin']+'/node',b'node24')]:
        e.sys.put(Path(path),raw);constants[constant]=A['sha'](raw);e.a['nativeExecutablePins'].append(dict(path=path,sha256=A['sha'](raw)))
    for name,raw in [('Replay.preimage.java',b'PRE'),('Replay.postimage.java',b'POST')]:e.sys.put(A['CONTROL']/name,raw)
    e.a['relayCustody']=dict(ownerUid=501,outputChain=[list(x[3]) for x in e.unit.chain],
        shortParentChain=[list(x[3]) for x in e.sys.custody('/private/tmp').chain],createShortExactly0700=True)
    release=b'{"syntheticIndependentRoot":"exact04"}'
    e.sys.put(A['CONTROL']/'root-release.json',release);e.a['releaseSha256']=A['sha'](release)
    e.a['collectorProvenance']['rootReleaseSha256']=e.a['releaseSha256']
    # The existing registration journal is regenerated in this synthetic authority world.
    journal=e.root_document(e.client_name);journal['releaseSha256']=e.a['releaseSha256']
    raw=A['packed'](journal)+b'\n';e.sys.put(A['CONTROL']/e.client_name,raw);e.generated_control_buffers[e.client_name]=raw
    for name,raw in list(e.generated_control_buffers.items()):
        if name.startswith('utility-'):
            value=A['decode'](raw);value['releaseSha256']=e.a['releaseSha256'];raw=A['packed'](value)+b'\n'
            e.sys.put(A['CONTROL']/name,raw);e.generated_control_buffers[name]=raw
    observed=C.record('FINALIZING','NOT_REPRODUCED');projected=R.wire(observed)+b'\n'
    control=A['decode'](base64.urlsafe_b64decode(e.a['launchControlBase64']))
    data=dict(protocolVersion=2,controlSha256=e.a['observerControlSha256'],enrollmentNonce=control['enrollmentNonce'],
        observation=observed,networkAccounting=observed['networkAccounting'])
    commit=dict(protocolVersion=2,controlSha256=e.a['observerControlSha256'],projectionSha256=A['sha'](projected),
        status='CALLER_SAW_CUSTODIED_ACK',callerElapsedNs=1000000)
    e.sys.boundary.incoming=Q['frame'](data)+Q['frame'](commit)
    # Module interpretation remains real; only the explicit test scheduler replaces serve.
    actual_module=e.v.module
    def scheduled_module(path,expected,name):
        module=actual_module(path,expected,name)
        if path.name=='public_relay.py':module.Relay.serve=COOPERATIVE_SERVE
        return module
    e.v.module=scheduled_module
    return e,constants

def run_whole():
    e,constants=world()
    # Controller functions retain original globals; bind only synthetic source constants.
    with patch.dict(A,constants),patch.object(P,'BASE',e.policy.BASE),patch.object(P,'PREIMAGE',e.a['preimageSha256']),patch.object(P,'CANDIDATE',e.policy.CANDIDATE):
        controller=P.Controller(e.a,e)
        # Distinct already-absent negative client, current held-proof client, honest fake facts.
        old=e.root_document(e.client_name);old['mode']='gate';old['identity']=dict(old['identity'],pid=777)
        oldname='client-777-'+A['sha'](old['identity']['start'].encode())[:16]+'.json'
        root(e,oldname,old)
        root(e,'negative-readiness-denial.json',dict(reason='MISSING_READINESS',status=1,
             releaseSha256=e.a['releaseSha256'],activeLockSha256=e.a['activeLockSha256'],shellPid=101,
             readinessAbsent=True,permitAbsent=True,clientJournal=oldname,clientJournalSha256=e.local_hash(oldname)))
        first,second=e.current(),e.current()
        root(e,'held-proof.json',dict(verificationExit=0,releaseSha256=e.a['releaseSha256'],
             negativeDenialSha256=e.local_hash('negative-readiness-denial.json'),clientJournal=e.client_name,
             clientJournalSha256=e.local_hash(e.client_name),first=first,second=second))
        root(e,'root-admission.json',dict(authorizedBy='root',releaseSha256=e.a['releaseSha256'],
             activeLockSha256=e.a['activeLockSha256'],heldProofSha256=e.local_hash('held-proof.json'),
             negativeDenialSha256=e.local_hash('negative-readiness-denial.json'),
             setupActualStatus=0,negativeActualStatus=1,heldProofActualStatus=0,
             setupSeparateStatusCaptured=True,negativeSeparateStatusCaptured=True,heldProofSeparateStatusCaptured=True,
             newReadonlyFunctionInspected=True,sameOriginalHolderAfterDenial=True,configuredLaunchInspected=True,
             configuredLaunch=e.a['pythonRoles']['launch'],exactOperatorCommandEvidence=['FAKE_EXACT_LAUNCH']))
        result=controller.stage()
        check('WHOLE_ACTUAL_STAGE_CURRENT_SOURCE_TRANSFER',result['exit']==0 and e.source()['sourceDisposition']=='CANDIDATE')
        phase_decision(e,'selected','AUTHORIZE_ONE_SELECTED_NATIVE',('stage-result.json','root-admission.json','held-proof.json'))
        result=controller.selected()
        check('WHOLE_ACTUAL_SELECTED_CONTROLLER_CURRENT_RELAY_CORE',result['phaseExit']==0 and result['nativeExit']==0 and e.selected_lifecycle=='TERMINAL')
        check('WHOLE_SELECTED_CAP_CLAIM_BEFORE_ANY_SETUP',e.local_hash('selected-consumed.json')==e.selected_claim_sha and e.relay.result['qualified'] is True)
        check('WHOLE_SELECTED_ACTUAL_NETWORK_PEER_RECORDED',e.relay.result['peerIdentity']['pid']==40001 and e.relay.result['commitCount']==1)
        check('WHOLE_SELECTED_REAL_RELAY_JOIN_CLOSE_RECEIPT',e.relay.thread.is_alive() is False and e.relay.result['threadTerminated'] is True and e.relay.result['descriptorsClosed'] is True)
        denied('WHOLE_SELECTED_NO_RETRY_CAP',controller.selected)
        phase_decision(e,'collect-public','AUTHORIZE_ONE_PUBLIC_RECORD_COLLECTION',('selected-result.json','selected-drain.json'))
        collected=e.collect_public()
        check('WHOLE_ACTUAL_COLLECTION_CURRENT_AND_NATIVE_RELAY_DRAIN',collected['publicObservation']['captureStatus']=='NOT_REPRODUCED' and e.public_observation_status()=='NOT_REPRODUCED')
        phase_decision(e,'restore','AUTHORIZE_EXACT_REPLAY_RESTORE',('selected-result.json','selected-drain.json'))
        result=controller.restore()
        check('WHOLE_ACTUAL_RESTORE_CURRENT_F9',result['exit']==0 and e.source()['sourceDisposition']=='RESTORED')
        phase_decision(e,'compile-restored','AUTHORIZE_ONE_RESTORED_COMPILE_ONLY',('restore-result.json',))
        result=controller.compile_restored()
        check('WHOLE_ACTUAL_RESTORED_COMPILE_CORE_CURRENT',result['phaseExit']==0 and result['nativeExit']==0 and e.root_document('compile-restored-native-result.json')['testsInvoked'] is False)
        names=('selected-result.json','public-collection.json','restore-result.json','compile-restored-result.json',
          'selected-drain.json','compile-restored-drain.json','selected-native-result.json','compile-restored-native-result.json',
          'source-backup.json','root-admission.json','held-proof.json','negative-readiness-denial.json','relay-launch.json','relay-ready.json','relay-drain.json')
        review=b'Independent synthetic source fixture, not actual QA'
        e.sys.put(A['ROOT']/A['ACTUAL_QA_REVIEW'],review)
        root(e,'root-actual-evidence-disposition.json',dict(authorizedBy='root',releaseSha256=e.a['releaseSha256'],
          expectedWrapperExit=0,C8Credit=False,IRCredit=False,actualEvidenceQaReviewed=True,restorationAccepted=True,
          standaloneCompileActualExit=0,selectedActualToolStatus=0,selectedSeparateStatusCaptured=True,
          standaloneCompileSeparateStatusCaptured=True,selectedActualToolEvidence=['FAKE_SELECTED_0'],
          standaloneCompileActualToolEvidence=['FAKE_COMPILE_0'],actualEvidencePins={n:e.local_hash(n) for n in names},
          independentQaRecord=dict(path=A['ACTUAL_QA_REVIEW'],sha256=A['sha'](review))))
        final=controller.final()
        check('WHOLE_ACTUAL_FINAL_TWO_FRESH_CURRENT_CHECKS',final['expectedWrapperExit']==0 and final['first']['snapshots'] and final['second']['snapshots'] and final['C8Credit'] is False)
        root(e,'root-close-permit.json',dict(authorizedBy='root',decision='AUTHORIZE_ONE_PUBLIC_OBSERVATION_UNIT_EXIT',
          releaseSha256=e.a['releaseSha256'],readinessSha256=e.local_hash('preunlock-verification.json'),expectedWrapperExit=0,
          C8Credit=False,issuedAtEpoch=1000,finalActualStatus=0,finalSeparateStatusCaptured=True,
          finalReadinessInspected=True,actualToolEvidence=['FAKE_FINAL_SEPARATE_0']))
        e.explicit_exit=0
        check('WHOLE_ACTUAL_GATE_FRESH_BEFORE_AFTER',controller.gate(0)==0 and e.root_document('guard-allow.json')['exit']==0)
        root(e,'root-wrapper-result.json',dict(releaseSha256=e.a['releaseSha256'],actualWrapperExit=0,separatelyCaptured=True,
             guardAllowSha256=e.local_hash('guard-allow.json'),actualToolResultEvidence='FAKE_OUTER_WRAPPER_TOOL_0'))
        e.sys.postclose=True;e.sys.lock_is_free=True
        check('WHOLE_ACTUAL_OUTER_POSTCLOSE',controller.postclose()['postcloseExit']==0)
        check('WHOLE_JOINED_CUSTODY_DISCHARGED_ONLY_AFTER_PROOF',e.release_custody() is True and e.c.closed and e.unit.closed)
    return e

def pin_tests():
    for mode in A['PHASES']:
        system,release=T['bootstrap_world']()
        name,oldsha,unused=system.entry_args
        value=A['decode'](system.files[str(A['CONTROL']/name)][0]);value['mode']=mode
        raw=A['packed'](value);system.put(A['CONTROL']/name,raw)
        with patch.object(threading,'Lock',T['FakeLock']):
            e=A['load'](system,release,name,A['sha'](raw),mode)
        check('ENTRY_ALL_NINE_CLI_'+mode,e.external_control_pins['active-lock.json']==e.a['activeLockSha256'])
        bad=dict(value,mode='unknown');system.put(A['CONTROL']/name,A['packed'](bad))
        denied('ENTRY_STALE_HASH_BEFORE_PARSE_'+mode,lambda:A['load'](system,release,name,A['sha'](raw),mode),'IMMUTABLE_CONSUMED_BUFFER_CHANGED')
    families=['root-selected-decision.json','root-restore-decision.json','root-compile-restored-decision.json',
      'root-collect-public-decision.json','root-admission.json','selected-drain.json','compile-restored-drain.json',
      'public-collection.json','root-actual-evidence-disposition.json','preunlock-verification.json','root-close-permit.json',
      'root-wrapper-result.json','guard-allow.json','held-proof.json','source-backup.json','negative-readiness-denial.json',
      'client-777-aaaaaaaaaaaaaaaa.json','utility-777-aaaaaaaaaaaaaaaa-1.json','observation-777-aaaaaaaaaaaaaaaa-1.json','native-selected-1.json']
    for name in families:
        e=T['setup']();first=b'{"root":"original"}';second=b'{"root":"substitution"}'
        e.sys.put(A['CONTROL']/name,first)
        denied('FIRST_READ_MISSING_EXTERNAL_'+name,lambda:e.root_document(name),'INDEPENDENT_FIRST_CONTROL_PIN_REQUIRED')
        e.external_control_pins[name]=A['sha'](first)
        check('FIRST_READ_EXACT_EXTERNAL_'+name,e.root_document(name)=={'root':'original'})
        e.sys.put(A['CONTROL']/name,second)
        denied('FIRST_READ_SUBSTITUTION_'+name,lambda:e.root_document(name),'LOCAL_IMMUTABLE_CHANGED')
        e2=T['setup']();e2.sys.put(A['CONTROL']/name,second);e2.external_control_pins[name]=A['sha'](first)
        denied('FRESH_PROCESS_FIRST_SUBSTITUTION_'+name,lambda:e2.root_document(name),'LOCAL_IMMUTABLE_CHANGED')
        e2.external_control_pins[name]=None
        denied('FIRST_READ_NO_SELFPIN_'+name,lambda:e2.root_document(name,A['sha'](second)),'INDEPENDENT_FIRST_CONTROL_PIN_REQUIRED')
    for field,value in [('mode','final'),('authorizedBy','self'),('releaseSha256','0'*64),('kind','UNBOUND'),('schemaVersion',True)]:
        system,release=T['bootstrap_world']();name,oldsha,mode=system.entry_args
        doc=A['decode'](system.files[str(A['CONTROL']/name)][0]);doc[field]=value;raw=A['packed'](doc);system.put(A['CONTROL']/name,raw)
        denied('ENTRY_ROOT_ROLE_BINDING_'+field,lambda:A['load'](system,release,name,A['sha'](raw),mode),'ENTRY_CONTROL_ROOT_ROLE_RELEASE_MODE')
    for defect in ('missing','wronghash','extra','self','wildcard','unexpected-existing'):
        system,release=T['bootstrap_world']();name,oldsha,mode=system.entry_args
        doc=A['decode'](system.files[str(A['CONTROL']/name)][0])
        if defect=='missing':doc['controlPins'].clear()
        if defect=='wronghash':doc['controlPins']['active-lock.json']='0'*64
        if defect=='extra':doc['controlPins']['root-admission.json']='0'*64
        if defect=='self':doc['controlPins'][name]='0'*64
        if defect=='wildcard':doc['controlPins']['*']='0'*64
        if defect=='unexpected-existing':system.put(A['CONTROL']/'selected-drain.json',b'{}')
        raw=A['packed'](doc);system.put(A['CONTROL']/name,raw)
        denied('ENTRY_EXACT_NO_DISCOVERY_GRANT_'+defect,lambda:A['load'](system,release,name,A['sha'](raw),mode))
    e=T['setup']();e.write_once('stage-result.json',{'phase':'stage','exit':0})
    check('CURRENT_INVOCATION_SUCCESSFUL_EXCLUSIVE_BUFFER_TRUSTED',e.root_document('stage-result.json')['exit']==0)
    e.sys.put(A['CONTROL']/'stage-result.json',b'{"phase":"stage","exit":1}')
    denied('CURRENT_GENERATED_SUBSTITUTION_STILL_DENIED',lambda:e.root_document('stage-result.json'),'LOCAL_IMMUTABLE_CHANGED')

def lifecycle_tests():
    for kind in ('unauthorized','wrongmode','differentclient','setupstarted','receipt','relay','terminalrecord','terminal-later'):
        e,constants=world()
        e.claim_once('selected')
        e.external_control_pins['root-selected-decision.json']='9'*64;e.selected_authority_sha='9'*64
        e.selected_lifecycle='AUTHORIZED_PENDING_SETUP'
        if kind=='unauthorized':e.selected_authority_sha=None
        if kind=='wrongmode':e.mode='restore'
        if kind=='differentclient':e.client=dict(e.client,pid=999)
        if kind=='setupstarted':e.selected_lifecycle='SETUP_STARTED'
        if kind=='receipt':e.receipt={'phase':'selected'}
        if kind=='relay':e.relay=object()
        if kind=='terminalrecord':root(e,'selected-drain.json',{'nativeNotStarted':True})
        if kind=='terminal-later':e.selected_lifecycle=None
        denied('PENDING_EXACT_STATE_DENIES_'+kind,e.verify_relay_closed_namespace)
        check('PENDING_DENIAL_CONSUMED_NOT_RESET_'+kind,not e.c.absent('selected-consumed.json') and not any(x[0]=='Popen' and x[1][0]=='./gradlew' for x in e.sys.events))
    for stage in ('READY','serve','fsync','stop','native','setup','BaseException'):
        e=T['setup']();e.register('selected')
        live=types.SimpleNamespace(is_alive=lambda:True)
        e.relay=types.SimpleNamespace(thread=live,result=dict(threadTerminated=False,descriptorsClosed=False,qualified=False,failure=True,stage=stage))
        check('UNRESOLVED_CUSTODY_RETAIN_'+stage,e.release_custody() is False and not e.c.closed and not e.unit.closed and any(x is e for x in A['RETAINED_EFFECTS']))
        check('UNRESOLVED_PARTIAL_RECEIPT_'+stage,any(n.startswith('custody-retained-') for n in e.c.members()) and e.gaps['resourceObservationGap'] is True)
        # Actual main finally must apply the same retention even when operate raises.
        with patch.dict(A,{'__file__':str(A['CONTROL']/'public_observation_unit.py'),'load':lambda *args:e,
                'operate':lambda *args:(_ for _ in ()).throw(KeyboardInterrupt())}),patch.object(e,'register',lambda mode:None),\
                patch.object(e.sys,'stdin_devnull',lambda:True,create=True),patch.object(e.sys,'cwd',lambda:str(A['ROOT']),create=True):
            try:A['main'](['selected','a'*64,'entry-0001-pins.json','b'*64],e.sys)
            except KeyboardInterrupt:pass
        check('ACTUAL_MAIN_FINALLY_RETAINS_'+stage,not e.c.closed and not e.unit.closed)
    e=T['setup']();e.register('selected')
    e.relay=types.SimpleNamespace(thread=types.SimpleNamespace(is_alive=lambda:True),result=dict(threadTerminated=False,descriptorsClosed=False))
    with patch.dict(A,{'__file__':str(A['CONTROL']/'public_observation_unit.py'),'load':lambda *args:e,'operate':lambda *args:0}),patch.object(e,'register',lambda mode:None),\
            patch.object(e.sys,'stdin_devnull',lambda:True,create=True),patch.object(e.sys,'cwd',lambda:str(A['ROOT']),create=True):
        denied('ACTUAL_MAIN_NO_ZERO_WITH_UNRESOLVED_CUSTODY',lambda:A['main'](['selected','a'*64,'entry-0001-pins.json','b'*64],e.sys),'UNRESOLVED_ASYNC_CUSTODY_HELD')
    e=T['setup']();e.relay=types.SimpleNamespace(thread=types.SimpleNamespace(is_alive=lambda:(_ for _ in ()).throw(OSError())),result=dict(threadTerminated=True,descriptorsClosed=True))
    check('THREAD_OBSERVATION_UNKNOWN_RETAINS_ALL_REFERENCES',e.release_custody() is False and not e.unit.closed)
    e=T['setup']();e.relay=types.SimpleNamespace(thread=types.SimpleNamespace(is_alive=lambda:True),
          result=dict(threadTerminated=True,descriptorsClosed=True))
    check('RECEIPT_ALONE_CANNOT_DISCHARGE_ACTUAL_LIVE_THREAD',e.release_custody() is False)
    e=T['setup']();e.relay=types.SimpleNamespace(thread=types.SimpleNamespace(is_alive=lambda:False),
          result=dict(threadTerminated=True,descriptorsClosed=False))
    check('TERMINATED_THREAD_UNCLOSED_DESCRIPTORS_REMAIN_HELD',e.release_custody() is False)
    e=T['setup']();e.relay=types.SimpleNamespace(thread=types.SimpleNamespace(is_alive=lambda:False),
          result=dict(threadTerminated=True,descriptorsClosed=True))
    check('CONFIRMED_TERMINATED_CLOSED_DISCHARGE',e.release_custody() is True and e.c.closed and e.unit.closed)

def tests():
    for name in ('pure-check-results.json','runtime-adapter-check-results.json','boundary03-check-results.json'):
        old=json.loads(PRE['source03-'+name]);now=json.loads(PRE[name])
        check('RETAIN_536_EXACT_IDENTITIES_'+name,[x['name'] for x in old['checks']]==[x['name'] for x in now['checks']] and now['failed']==0)
    check('COOPERATIVE_SCHEDULER_EXACTLY_ONE_READY_YIELD',ast.dump(proof,include_attributes=False)==ast.dump(original_serve,include_attributes=False))
    run_whole();pin_tests();lifecycle_tests()
    check('ZERO_REAL_BOUNDARY_CALLS',blocked_calls==[])

sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,attrs in ((builtins,('open',)),(io,('open',)),
      (Path,('open','read_bytes','read_text','write_bytes','write_text','stat','lstat','mkdir','iterdir','resolve','unlink','glob','rglob')),
      (os,('open','read','write','close','stat','lstat','fstat','listdir','scandir','mkdir','makedirs','unlink','remove','rename','replace','chmod','fsync','kill','fork','system','getpid','getppid','getuid')),
      (subprocess,('Popen','run','call','check_output','check_call')),(socket,('socket','create_connection')),
      (selectors,('DefaultSelector',)),(threading,('Thread','Event','Lock')),(ctypes,('CDLL',)),
      (fcntl,('flock','fcntl','ioctl')),(time,('sleep','time','monotonic','monotonic_ns'))):
        for attr in attrs:
            if hasattr(obj,attr):stack.enter_context(patch.object(obj,attr,T['FakeLock'] if obj is threading and attr=='Lock' else blocked))
    tests()
result=dict(kind='SOURCE04_GUARDED_CONTROL_LIFECYCLE_COMPOSITION',passed=len(checks),failed=0,checks=checks,
 retainedSemanticCases=536,realBoundaryCalls=blocked_calls,JavaOrNativeOrActualNamespaceActions=0,
 cooperativeSchedulerInstrument=dict(delta='ONE_YIELD_IMMEDIATELY_AFTER_READY',astEqualityAfterRemoval=True,
   unchangedFullServeExecutionClaim=False,originalServeStatementsSkippedOrRemoved=0),
 actualJavaThreadDarwinTlsUnixProviderQualification='UNEXECUTED_OWED',executionReady=False)
(HERE/'integration04-check-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
