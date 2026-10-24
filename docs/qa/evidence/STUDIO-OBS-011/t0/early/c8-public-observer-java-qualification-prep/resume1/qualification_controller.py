"""Inactive standalone-JVM qualification controller. Definitions only; no executable main.

An independently admitted ordinary native adapter supplies current holder, input, process,
native wait/output and archival facts. This module grants none of those authorities.
All local effect boundaries are explicit constructor arguments and retained in Invocation.
"""
import hashlib
import json
import re
import stat

PROTOCOL = 'C8_SYNTHETIC_JAVA_QUALIFICATION_V1'
MODES = ('parser','tls-good','tls-oversize','tls-stall-handshake','tls-stall-write',
         'tls-stall-body','tls-stall-trailers','tls-dribble','relay')
CODE_NAMES = frozenset(('qualification_controller.py','qualification_custody.py','qualified_relay.py','public_contract.py'))
RELEASE_FIELDS = frozenset(('schemaVersion','protocol','purpose','authorizedBy','selectedMode','ownerUid',
    'codePins','inputPins','javaRole','classpathEntries','harnessClass','argv','environmentKeys','environmentSha256','outputPath',
    'launchControlSha256','rootCustody','ordinaryAdmissionSha256','gatewayClosedRootSha256','sourceManifestSha256',
    'productionFragmentSha256','limits'))
DECISION_FIELDS = frozenset(('schemaVersion','protocol','purpose','authorizedBy','releaseSha256','mode','cap','attempt','operation'))
PIN_FIELDS = frozenset(('path','sha256','bytes','mode','uid','aliases'))
IDENTITY_FIELDS = frozenset(('pid','ppid','kernelStartSeconds','kernelStartMicroseconds','processImage','uid',
    'kernelIdentityComplete','identityComplete','start','argvHash','executableFileHash'))
NATIVE_FIELDS = frozenset(('directPid','directWaited','nativeStatus','stdoutComplete','stderrComplete',
                          'ownedWorkTerminated','descriptorsClosed','requestSha256','modeEvidence','archiveSha256'))
LIMITS = dict(workBudgetNs=12000000000,networkBudgetNs=14000000000,totalBudgetNs=15000000000,
    frameByteCap=16384,ackByteCap=256,commitByteCap=512,receiverJoinSeconds=5,selectorPollMs=100)
RETAINED = []
REASONS = frozenset(('NONE','CAP_CONSUMED','SCHEMA','PIN','MODE','LIMITS','PURPOSE','ROLE','LAUNCH',
    'INPUTS','CONTROL','ROOT_CUSTODY','EARLY_ENROLLMENT','STANDALONE_IDENTITY','PEER_CHANGED',
    'NATIVE_UNKNOWN','NATIVE_FAILED','MODE_EVIDENCE','RELAY_PROTOCOL','RELAY_DRAIN','LEDGER_UNKNOWN',
    'ADAPTER_PROTOCOL','UNMAPPED_CONTROLLER_FAILURE','CLEANUP_UNCONFIRMED'))

class Hold(Exception):
    pass

def need(value, reason):
    if value is not True:
        raise Hold(reason)

def reason(failure):
    if type(failure) is Hold and len(failure.args)==1 and failure.args[0] in REASONS:
        return failure.args[0]
    return 'UNMAPPED_CONTROLLER_FAILURE'

def hash_value(value):
    return type(value) is str and re.fullmatch('[0-9a-f]{64}',value) is not None

def positive(value):
    return type(value) is int and value>0

def fields(value, names):
    need(type(value) is dict and set(value)==set(names),'SCHEMA')

def strict(raw, cap=1048576):
    need(type(raw) is bytes and 0<len(raw)<=cap,'SCHEMA')
    def pairs(items):
        out={}
        for key,value in items:
            need(key not in out,'SCHEMA');out[key]=value
        return out
    return json.loads(raw.decode('utf-8','strict'),object_pairs_hook=pairs,
        parse_constant=lambda unused: (_ for _ in ()).throw(Hold('SCHEMA')))

def pin(value):
    fields(value,PIN_FIELDS)
    need(type(value['path']) is str and value['path'].startswith('/') and '//' not in value['path']
         and not any(x in ('.','..','') for x in value['path'].split('/')[1:]) and '\x00' not in value['path'],'PIN')
    need(hash_value(value['sha256']) and positive(value['bytes']) and value['bytes']<=16777216,'PIN')
    need(type(value['mode']) is int and 0<=value['mode']<=0o777 and type(value['uid']) is int and value['uid']>=0,'PIN')
    need(type(value['aliases']) is list and all(type(x) is str and x.startswith('/') for x in value['aliases'])
         and len(value['aliases'])<=8 and len(value['aliases'])==len(set(value['aliases'])),'PIN')
    return value

def validate_release(value, relay, contract):
    fields(value,RELEASE_FIELDS)
    need(type(value['schemaVersion']) is int and value['schemaVersion']==1 and value['protocol']==PROTOCOL,'SCHEMA')
    need(value['purpose']=='SYNTHETIC_QUALIFICATION_ONLY' and value['authorizedBy']=='root','PURPOSE')
    need(value['selectedMode'] in MODES and type(value['ownerUid']) is int and value['ownerUid']>=0,'MODE')
    need(value['limits']==LIMITS and all(type(x) is int for x in value['limits'].values()),'LIMITS')
    need(type(value['codePins']) is dict and set(value['codePins'])==CODE_NAMES,'PIN')
    for name,item in value['codePins'].items():
        pin(item);need(item['path'].endswith('/'+name) and item['uid']==value['ownerUid'] and item['mode'] in (0o600,0o644),'PIN')
    inputs=value['inputPins']
    need(type(inputs) is dict and 0<len(inputs)<=128 and all(type(k) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,63}',k) for k in inputs),'INPUTS')
    for item in inputs.values(): pin(item)
    need(sum(item['bytes'] for item in inputs.values())<=67108864,'INPUTS')
    need('ORDINARY_ADAPTER' in inputs,'ROLE')
    need(value['javaRole'] in inputs and type(value['classpathEntries']) is list and bool(value['classpathEntries']),'ROLE')
    classpaths=[]
    for entry in value['classpathEntries']:
        fields(entry,('kind','path','memberRoles'))
        need(entry['kind'] in ('JAR','CLASS_DIRECTORY') and type(entry['path']) is str and entry['path'].startswith('/')
             and ':' not in entry['path'] and type(entry['memberRoles']) is list and entry['memberRoles']
             and len(entry['memberRoles'])==len(set(entry['memberRoles'])) and all(role in inputs for role in entry['memberRoles']),'ROLE')
        if entry['kind']=='JAR':need(len(entry['memberRoles'])==1 and inputs[entry['memberRoles'][0]]['path']==entry['path'],'ROLE')
        else:need(all(inputs[role]['path'].startswith(entry['path']+'/') and inputs[role]['path'].endswith('.class') for role in entry['memberRoles']),'ROLE')
        classpaths.append(entry['path'])
    need(len(classpaths)==len(set(classpaths)),'ROLE')
    paths=[x['path'] for x in list(inputs.values())+list(value['codePins'].values())]
    need(len(paths)==len(set(paths)),'PIN')
    need(value['harnessClass']=='ObserverBoundaryHarness','LAUNCH')
    prefix=[inputs[value['javaRole']]['path'],'-cp',':'.join(classpaths),value['harnessClass'],value['selectedMode']]
    expected=prefix if value['selectedMode'] in ('parser','relay') else prefix+[inputs.get('SYNTHETIC_PKCS12',{}).get('path'),'ROOT_QUALIFIED_LOCAL_SYNTHETIC_ONLY']
    need(type(value['argv']) is list and value['argv']==expected and all(type(x) is str and x and '\x00' not in x for x in value['argv']),'LAUNCH')
    expected_keys={'JAVA_HOME','PATH','LANG','LC_ALL'}
    if value['selectedMode'].startswith('tls-'):expected_keys.add('SYNTHETIC_PUBLIC_KEYSTORE_PASSWORD')
    if value['selectedMode']=='relay':expected_keys|={'CHECKS_PUBLIC_OBSERVER_CONTROL','CHECKS_PUBLIC_OBSERVER_CONTROL_SHA256'}
    need(type(value['environmentKeys']) is list and set(value['environmentKeys'])==expected_keys
         and len(value['environmentKeys'])==len(expected_keys) and hash_value(value['environmentSha256']),'LAUNCH')
    for key in ('ordinaryAdmissionSha256','gatewayClosedRootSha256','launchControlSha256'):need(hash_value(value[key]),'PIN')
    need(value['sourceManifestSha256']=='b5aa1e5d1e602c30b0e134ad21342ec1604ea2b2cf7e31be1b2c7d58a1f4bdf1'
         and value['productionFragmentSha256']=='0153a4d415ebd9e9c98d4230adacc4e807a9ed1dc583d8bf859a2dfaf20ebc66','PIN')
    root=value['rootCustody'];fields(root,('ownerUid','outputChain','shortParentChain','createShortExactly0700'))
    need(root['ownerUid']==value['ownerUid'] and root['createShortExactly0700'] is True,'ROOT_CUSTODY')
    for key in ('outputChain','shortParentChain'):
        need(type(root[key]) is list and root[key] and all(type(row) is list and len(row)==4 and all(type(n) is int and n>=0 for n in row) for row in root[key]),'ROOT_CUSTODY')
    need(type(value['outputPath']) is str and value['outputPath'].startswith('/') and '\x00' not in value['outputPath']
         and '//' not in value['outputPath'] and not any(x in ('','..','.') for x in value['outputPath'].split('/')[1:]),'ROOT_CUSTODY')
    return value

def validate_decision(value, release, release_sha):
    fields(value,DECISION_FIELDS)
    need(type(value['schemaVersion']) is int and value['schemaVersion']==1 and value['protocol']==PROTOCOL
         and value['purpose']=='ONE_SYNTHETIC_MODE_ONLY' and value['authorizedBy']=='root','PURPOSE')
    need(value['releaseSha256']==release_sha and value['mode']==release['selectedMode'] and value['operation']=='invoke','MODE')
    need(type(value['cap']) is int and value['cap']==1 and type(value['attempt']) is int and value['attempt']==1,'CAP_CONSUMED')
    return value

def identity(value, release, process):
    fields(value,IDENTITY_FIELDS)
    need(positive(value['pid']) and value['pid']==process.pid and positive(value['ppid'])
         and type(value['uid']) is int and value['uid']==release['ownerUid'] and type(value['start']) is str and bool(value['start'])
         and value['identityComplete'] is True and value['kernelIdentityComplete'] is True
         and positive(value['kernelStartSeconds']) and type(value['kernelStartMicroseconds']) is int
         and 0<=value['kernelStartMicroseconds']<1000000 and hash_value(value['argvHash']),'STANDALONE_IDENTITY')
    java=release['inputPins'][release['javaRole']]
    need(value['processImage']==java['path'] and value['executableFileHash']==java['sha256'],'STANDALONE_IDENTITY')
    return dict(value)

def mode_evidence(mode, raw, contract):
    """Interpret the same complete bounded stdout buffer; mode return alone is insufficient."""
    value=strict(raw,16384)
    if mode=='parser':
        fields(value,('case','status','originalChecks','addedChecks','checks','nativeBusinessRequests'))
        need(value==dict(case='parser',status='PASS',originalChecks=18,addedChecks=6,checks=24,nativeBusinessRequests=0)
             and all(type(value[k]) is int for k in ('originalChecks','addedChecks','checks','nativeBusinessRequests')),'MODE_EVIDENCE')
        return True
    if mode=='relay':
        fields(value,('case','status','nativeBusinessRequests'))
        need(value==dict(case='relay',status='ROOT_RECEIPT_REQUIRED',nativeBusinessRequests=0)
             and type(value['nativeBusinessRequests']) is int,'MODE_EVIDENCE')
        # This is solely the producer half; Invocation additionally requires the actual
        # qualified receiver/peer/COMMIT/drain result. Never convert this line alone to PASS.
        return True
    fields(value,('case','status','connects','accepted','requests','stage','serverFailure','controllerFailure',
        'serverListenerAcquired','serverPeerAcquired','serverListenerClose','serverPeerClose','cancellationRequested',
        'cancellationCount','productionCancellationSet','networkTerminated','serverTerminated','serverDrainElapsedNs',
        'networkAccounting','elapsedNs','closedProjection'))
    need(mode in MODES and mode.startswith('tls-') and value['case']==mode and value['status']=='PASS','MODE_EVIDENCE')
    for key in ('connects','accepted','requests','cancellationCount','serverDrainElapsedNs','elapsedNs'):
        need(type(value[key]) is int and value[key]>=0,'MODE_EVIDENCE')
    for key in ('serverListenerAcquired','serverPeerAcquired','cancellationRequested','productionCancellationSet','networkTerminated','serverTerminated'):
        need(type(value[key]) is bool,'MODE_EVIDENCE')
    need(value['connects']==value['accepted']==1 and value['networkTerminated'] is True and value['serverTerminated'] is True
         and value['serverListenerAcquired'] is True and value['serverPeerAcquired'] is True
         and value['serverListenerClose']==value['serverPeerClose']=='CLOSED' and value['controllerFailure']=='NONE'
         and value['serverFailure'] in ('NONE','SERVER_INTERRUPTED','SERVER_IO_OR_TLS_FAILURE')
         and value['serverDrainElapsedNs']<=5000000000 and value['elapsedNs']<20000000000,'MODE_EVIDENCE')
    need(value['cancellationCount']==(1 if value['cancellationRequested'] else 0)
         and value['productionCancellationSet']==value['cancellationRequested'],'MODE_EVIDENCE')
    accounting=value['networkAccounting'];fields(accounting,contract.network_not_started())
    for key in ('workerStarted','requestCompleted','deadlineExceeded','callerInterrupted'):need(type(accounting[key]) is bool,'MODE_EVIDENCE')
    for key in ('acquiredSockets','successfulSocketCloses','connectCalls','requestStarts'):
        need(type(accounting[key]) is int and accounting[key]>=0,'MODE_EVIDENCE')
    need(accounting['workerStarted'] is True and accounting['workerTermination']=='TERMINATED'
         and accounting['acquiredSockets']==accounting['successfulSocketCloses']==2 and accounting['connectCalls']==1
         and accounting['callerInterrupted'] is False and type(accounting['networkCompletionElapsedNs']) is int
         and 0<=accounting['networkCompletionElapsedNs']<=14000000000,'MODE_EVIDENCE')
    stages={'tls-good':'GOOD_RESPONSE_SENT','tls-oversize':'OVERSIZE_LENGTH_SENT','tls-stall-handshake':'STALL_HANDSHAKE',
        'tls-stall-write':'STALL_WRITE_FIXTURE','tls-stall-body':'STALL_BODY','tls-stall-trailers':'STALL_TRAILERS','tls-dribble':'DRIBBLE_BODY'}
    need(value['stage']==stages[mode],'MODE_EVIDENCE')
    if mode=='tls-stall-handshake':
        need(value['requests']==accounting['requestStarts']==0 and accounting['requestCompleted'] is False,'MODE_EVIDENCE')
        # TLS wrapper has already been acquired before the intentional handshake stall.
    elif mode=='tls-stall-write':
        need(value['requests']==0 and accounting['requestStarts']==1 and accounting['requestCompleted'] is False,'MODE_EVIDENCE')
    else:need(value['requests']==accounting['requestStarts']==1 and accounting['requestCompleted'] is True,'MODE_EVIDENCE')
    if mode=='tls-good':
        need(value['closedProjection']==dict(captureStatus='CAPTURED',publicOutcomeOrState='FAILED',errorCode='LOGIN_REQUIRED',codeQualified=True)
             and value['closedProjection']['codeQualified'] is True and accounting['networkCompletionElapsedNs']<=12000000000
             and accounting['deadlineExceeded'] is False and value['serverFailure']=='NONE','MODE_EVIDENCE')
    else:
        need(value['closedProjection']=={},'MODE_EVIDENCE')
        if mode!='tls-oversize':need(value['cancellationRequested'] is True or accounting['deadlineExceeded'] is True,'MODE_EVIDENCE')
    return True

class PeerBinding:
    def __init__(self, ordinary, release):
        self.ordinary,self.release,self.process,self.bound,self.consumed=ordinary,release,None,None,False
        self.primary='NONE'
    def bind(self, process):
        need(not self.consumed,'EARLY_ENROLLMENT')
        need(self.process is None,'CAP_CONSUMED')
        self.process=process
        first=identity(self.ordinary.identity(process),self.release,process)
        need(first['ppid']==self.ordinary.controller_pid(),'STANDALONE_IDENTITY')
        second=identity(self.ordinary.identity(process),self.release,process)
        need(first==second,'PEER_CHANGED');self.bound=first
    def __call__(self,pid):
        try:
            need(not self.consumed,'CAP_CONSUMED');self.consumed=True
            need(self.bound is not None and self.process is not None,'EARLY_ENROLLMENT')
            need(type(pid) is int and pid==self.bound['pid'],'STANDALONE_IDENTITY')
            first=identity(self.ordinary.identity(self.process),self.release,self.process)
            second=identity(self.ordinary.identity(self.process),self.release,self.process)
            need(first==second==self.bound,'PEER_CHANGED')
            return dict(self.bound)
        except BaseException as failure:
            self.primary=reason(failure)
            raise

class Resource:
    """Immediate actual-object registration, before fileno/flags/metadata/factory return."""
    def __init__(self, actual, ownership, owner, kind):
        self.actual,self.ownership=actual,ownership
        self.token=ownership.acquire(owner,None,lambda unused:actual.close(),kind)
        ownership.transfer(self.token,actual,lambda unused:actual.close())
    def __getattr__(self,name):return getattr(self.actual,name)
    def close(self):self.ownership.close(self.token)
    def accept(self):
        actual,address=self.actual.accept()
        return Resource(actual,self.ownership,self,'CONNECTION'),address

class ReceiverBoundary:
    def __init__(self, base, ownership):
        self.base,self.ownership,self.created=base,ownership,False
        self.platform=base.platform
    def __getattr__(self,name):return getattr(self.base,name)
    def event(self):
        actual=self.base.event();self.ownership.owner(actual);return actual
    def thread(self,callback):
        actual=self.base.thread(callback);self.ownership.owner(actual);return actual
    def selector(self):return Resource(self.base.selector(),self.ownership,self,'SELECTOR')
    def listener(self):return Resource(self.base.listener(),self.ownership,self,'LISTENER')
    def mkdir_at(self,custody,name):
        # Record exclusive creation before any post-create custody check can fail.
        custody.check()
        custody.os.mkdir(name,0o700,dir_fd=custody.fd)
        self.created=True
        custody.check()

class Invocation:
    def __init__(self, ordinary, modules, filesystem, boundary):
        self.ordinary,self.modules,self.fs,self.base=ordinary,modules,filesystem,boundary
        self.ownership=modules['custody'].Ownership()
        self.ownership.owner(self)
        self.consumed=False;self.callers=[];self.receiver=None;self.process=None;self.process_token=None
        self.peer=None;self.receiver_boundary=None;self.native=None;self.release=None;self.release_sha=None
        self.request_sha=None;self.input_postcheck=False
        self.primary='NONE';self.cleanup='NONE';self.thread_token=None;self.result=None
    def read_bound(self, spec, mode):
        pin(spec);need(spec['mode']==mode,'PIN')
        parent,name=spec['path'].rsplit('/',1)
        custody=self.modules['custody'].Custody(parent or '/',api=self.fs,ownership=self.ownership)
        try:
            raw,info=custody.read(name,mode,min(16777216,spec['bytes']))
            need(info.st_uid==spec['uid'] and info.st_nlink==1 and len(raw)==spec['bytes']
                 and hashlib.sha256(raw).hexdigest()==spec['sha256'],'PIN')
            # Every later interpretation consumes THIS verified immutable byte buffer.
            return raw
        finally:custody.close()
    def invoke(self,release_spec,decision_spec,control_spec,output_path):
        need(not self.consumed,'CAP_CONSUMED');self.consumed=True
        try:
            raw=self.read_bound(release_spec,0o600);release_sha=hashlib.sha256(raw).hexdigest()
            self.release_sha=release_sha
            self.release=validate_release(strict(raw),self.modules['relay'],self.modules['contract'])
            decision=validate_decision(strict(self.read_bound(decision_spec,0o600)),self.release,release_sha)
            control_raw=self.read_bound(control_spec,0o600)
            need(hashlib.sha256(control_raw).hexdigest()==self.release['launchControlSha256'],'CONTROL')
            control=self.modules['relay'].validate_control(strict(control_raw,4096),self.modules['contract'])
            # Complete input/metadata/environment/holder/native-controller checks BEFORE mutation.
            need(self.ordinary.protocol==PROTOCOL,'ADAPTER_PROTOCOL')
            need(self.ordinary.source_sha256==self.release['inputPins']['ORDINARY_ADAPTER']['sha256'],'ADAPTER_PROTOCOL')
            need(output_path==self.release['outputPath'],'ROOT_CUSTODY')
            need(self.ordinary.validate_admission(self.release,decision,control_raw,release_sha) is True,'ADAPTER_PROTOCOL')
            self.verify_inputs()
            need(self.ordinary.consume(decision,release_sha) is True,'CAP_CONSUMED')
            if decision['mode']=='relay':
                self.setup_receiver(control,control_spec['sha256'],control_spec['path'].rsplit('/',1)[0],output_path)
            self.launch()
            self.native=self.ordinary.wait(self.process)
            self.verify_inputs();self.input_postcheck=True
            self.validate_native()
            self.ownership.close(self.process_token)
        except BaseException as failure:
            self.primary=reason(failure)
        finally:
            self.cleanup_owned()
        return self.snapshot()
    def verify_inputs(self):
        for name,item in self.release['codePins'].items():
            loaded_name={'qualification_custody.py':'custody','public_contract.py':'contract','qualified_relay.py':'relay','qualification_controller.py':'controller'}[name]
            need(getattr(self.modules[loaded_name],'__source_sha256__',None)==item['sha256'],'PIN')
            self.read_bound(item,item['mode'])
        for item in self.release['inputPins'].values():self.read_bound(item,item['mode'])
    def setup_receiver(self,control,control_sha,control_path,output_path):
        # No namespace mutation before this point; identity is still deliberately unbound.
        custody=self.modules['custody']
        control_owner=custody.Custody(control_path,0o700,api=self.fs,ownership=self.ownership);self.callers.append(control_owner)
        output=custody.Custody(output_path,0o700,api=self.fs,ownership=self.ownership);self.callers.append(output)
        self.peer=PeerBinding(self.ordinary,self.release)
        self.receiver_boundary=ReceiverBoundary(self.base,self.ownership)
        factory=lambda path,mode=None:custody.Custody(path,mode,api=self.fs,ownership=self.ownership)
        self.receiver=self.modules['relay'].SyntheticRelay(self.receiver_boundary,factory,output,control,control_sha,
            {k:v['sha256'] for k,v in self.release['codePins'].items()},self.modules['contract'],
            lambda raw:hashlib.sha256(raw).hexdigest(),strict,self.peer,self.release['rootCustody'],
            self.ownership.view(control_owner,output))
        self.receiver.start()
        # Boundary.thread already retains the actual thread object before return. Relay's
        # actual joined/is_alive state is a separate closure obligation, not a closeable FD.
        self.ordinary.record_ready(dict(self.receiver.result))
    def launch(self):
        request=dict(protocol=PROTOCOL,releaseSha256=self.release_sha,mode=self.release['selectedMode'],
            argv=self.release['argv'],environmentSha256=self.release['environmentSha256'],
            launchControlSha256=self.release['launchControlSha256'])
        self.request_sha=hashlib.sha256(json.dumps(request,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
        self.process=self.ordinary.launch(self.release)
        self.process_token=self.ownership.acquire(self,self.process,self.confirm_native,'NATIVE_PROCESS')
        if self.peer is not None:self.peer.bind(self.process)
    def confirm_native(self,process):
        need(self.native is not None and self.native['directPid']==process.pid and self.native['directWaited'] is True
             and self.native['ownedWorkTerminated'] is True and self.native['descriptorsClosed'] is True,'NATIVE_UNKNOWN')
    def validate_native(self):
        fields(self.native,NATIVE_FIELDS)
        need(self.native['directPid']==self.process.pid and self.native['directWaited'] is True
             and type(self.native['nativeStatus']) is int and self.native['stdoutComplete'] is True
             and self.native['stderrComplete'] is True and self.native['ownedWorkTerminated'] is True
             and self.native['descriptorsClosed'] is True and self.native['requestSha256']==self.request_sha
             and hash_value(self.native['archiveSha256']),'NATIVE_UNKNOWN')
        need(self.native['nativeStatus']==0,'NATIVE_FAILED')
        need(mode_evidence(self.release['selectedMode'],self.native['modeEvidence'],self.modules['contract']) is True,'MODE_EVIDENCE')
    def cleanup_owned(self):
        # Primary result never becomes success merely because resources later close.
        if self.process is not None and self.process_token is not None and self.process_token['state']=='OPEN':
            try:
                if self.native is None:self.native=self.ordinary.wait(self.process)
                self.confirm_native(self.process);self.ownership.close(self.process_token)
            except BaseException:self.cleanup='CLEANUP_UNCONFIRMED'
        if self.receiver is not None:
            try:
                result=self.receiver.stop()
                result=self.receiver.refresh_closure()
                need(result['threadTerminated'] is True and result['descriptorsClosed'] is True,'RELAY_DRAIN')
                if self.primary=='NONE' and self.peer.primary!='NONE':self.primary=self.peer.primary
                if self.primary=='NONE':need(result['qualified'] is True,'RELAY_PROTOCOL')
                if self.primary=='NONE':
                    projection,unused=self.receiver.output.read('public-observation.json',0o600,16384)
                    need(self.modules['contract'].relay_qualified(result,projection,result['codePins'],
                        self.native is not None and self.native['directWaited'] is True and self.native['ownedWorkTerminated'] is True
                        and self.native['descriptorsClosed'] is True) is True,'RELAY_PROTOCOL')
            except BaseException as failure:
                if self.primary=='NONE':self.primary=reason(failure)
                else:self.cleanup='CLEANUP_UNCONFIRMED'
        if not self.ownership.finish(*self.callers):self.cleanup='CLEANUP_UNCONFIRMED'
        if self.cleanup!='NONE':self.ownership.retain(self,self.receiver,self.process);RETAINED.append(self)
    def snapshot(self):
        closed=not self.ownership.blockers()
        accepted=self.primary=='NONE' and self.cleanup=='NONE' and closed and self.native is not None
        self.result=dict(protocol=PROTOCOL,status='QUALIFICATION_EVIDENCE_COMPLETE_PENDING_QA_ROOT' if accepted else 'HOLD',
            mode=self.release['selectedMode'] if self.release else None,attemptConsumed=self.consumed,
            primaryReason=self.primary,cleanupReason=self.cleanup,canonicalClosed=closed,
            nativeStatus=self.native.get('nativeStatus') if self.native else None,
            nativeWaited=self.native.get('directWaited') if self.native else False,
            requestSha256=self.request_sha,inputPostcheckCompleted=self.input_postcheck,
            releaseSha256=self.release_sha,
            codePins={k:v['sha256'] for k,v in self.release['codePins'].items()} if self.release else {},
            controlSha256=self.release['launchControlSha256'] if self.release else None,
            nativeArchiveSha256=self.native.get('archiveSha256') if self.native else None,
            projectionSha256=self.receiver.result.get('projectionSha256') if self.receiver else None,
            relayReceipt=dict(self.receiver.result) if self.receiver else None,
            relayPrimaryReason=self.receiver.primary_reason if self.receiver else 'NONE',
            ownership=self.ownership.summary(),partialShortCreated=bool(self.receiver_boundary and self.receiver_boundary.created),
            shortNamespace=self.receiver.short_identity if self.receiver else None,
            socketNode=self.receiver.node if self.receiver else None,
            namespaceMetadataState=('QUALIFIED_READY_METADATA' if self.receiver and self.receiver.result['ready'] is True and self.receiver.short_identity is not None
                else 'ACQUIRED_NOT_READY_METADATA' if self.receiver and self.receiver.short_identity is not None
                else 'CREATED_METADATA_UNQUALIFIED' if self.receiver_boundary and self.receiver_boundary.created else 'NOT_CREATED'),
            actualQualificationAcceptanceRequiresIndependentQaRoot=True)
        return dict(self.result)
