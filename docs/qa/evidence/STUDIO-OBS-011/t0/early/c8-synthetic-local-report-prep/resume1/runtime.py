"""Concrete synthetic local-report runtime. No main/import-side effects.

P/K/F/M/C are exact verified profile/custody/storage/mode/public-contract modules loaded
by the sealed entry from consumed buffers. They are not identity/evidence providers.
Every actual boundary here is a declared os/subprocess/socket/selector/fcntl call.
"""
import os,sys,time,json,hashlib,stat,subprocess,socket,selectors,struct,fcntl,errno,threading,base64
from pathlib import Path
P=K=F=M=C=None
RETAINED=[]

def need(ok,reason):
    if ok is not True:raise P.Hold(reason)
def scalar_pid(value):return value if type(value) is int and 0<value<2147483648 else None
def self_text(value):
    if type(value) is not str or not value or len(value)>4096 or '\x00' in value:return dict(status='UNKNOWN',bytes=None,sha256=None)
    try:raw=value.encode('utf-8','strict')
    except BaseException:return dict(status='UNKNOWN',bytes=None,sha256=None)
    if len(raw)>4096:return dict(status='UNKNOWN',bytes=None,sha256=None)
    return dict(status='COMPLETE',bytes=len(raw),sha256=F.digest(raw))

class ChildOwner:
    """The sole serial poll/wait/reap owner. No receiver thread exists."""
    def __init__(self,unit):
        self.unit=unit;self.thread=threading.get_ident();self.child=None;self.token=None
        self.record=dict(constructionAttempted=False,constructionState='NOT_STARTED',pid=None,requestSha256=None,
            pollFacts=[],waitReceived=False,nativeStatus=None,directWaited=None,ownedWorkTerminated=False,
            stdoutComplete=False,stderrComplete=False,descriptorsClosed=False,modeEvidence=None,archiveSha256=None)
        self.in_wait=False;self.raw_wait=None
    def serial(self):need(threading.get_ident()==self.thread and not self.in_wait,'OWNERSHIP_UNKNOWN')
    def launch(self,argv,cwd,environment,out,err,maximum_ns):
        self.serial();need(not self.record['constructionAttempted'],'CAP_CONSUMED')
        request=dict(argv=argv,cwd=cwd,environmentSha256=F.digest(F.encoded(environment)),childUmask='022',maximumNs=maximum_ns)
        self.record.update(constructionAttempted=True,constructionState='CONSTRUCTION_ATTEMPTED',requestSha256=F.digest(F.encoded(request)))
        self.token=self.unit.owner.acquire(self,None,self.confirm,'NATIVE_PROCESS')
        self.unit.refs.append(self)
        try:
            child=subprocess.Popen(argv,cwd=cwd,env=environment,stdin=subprocess.DEVNULL,stdout=out['fd'],stderr=err['fd'],umask=0o022)
        except BaseException:
            self.record['constructionState']='UNKNOWN_CONSTRUCTOR_FAILURE';self.token['state']='UNKNOWN'
            self.unit.latch('NATIVE_CONSTRUCTOR_UNKNOWN');self.unit.owner.retain(self);raise
        # Actual returned object is retained before PID validation/any observer/helper call.
        self.child=child;self.token.update(fd=child,handle=child,closer=self.confirm)
        self.record.update(constructionState='ACTUAL_HANDLE_RETURNED',pid=scalar_pid(child.pid))
        need(self.record['pid'] is not None,'NATIVE_UNKNOWN')
        self.unit.event('DIRECT_CHILD_RETURNED',dict(pid=self.record['pid'],requestSha256=self.record['requestSha256']))
    def poll(self):
        self.serial();need(self.child is not None,'NATIVE_UNKNOWN')
        value=self.child.poll()
        valid=value is None or type(value) is int and -2147483648<=value<2147483648
        self.record['pollFacts'].append(dict(live=value is None,terminalStatus=value if type(value) is int and -2147483648<=value<2147483648 else None,qualified=valid))
        need(valid,'NATIVE_UNKNOWN');return value
    def live(self):need(self.poll() is None,'CHANNEL_UNQUALIFIED')
    def wait_terminal(self):
        self.serial();need(self.child is not None,'NATIVE_UNKNOWN')
        if self.record['waitReceived']:return self.record['nativeStatus']
        need(self.poll() is not None,'NATIVE_UNKNOWN')
        self.in_wait=True
        try:
            value=self.child.wait(timeout=0)
            self.raw_wait=value;self.record['waitReceived']=True
            need(type(value) is int and -2147483648<=value<2147483648,'NATIVE_UNKNOWN')
            self.record.update(nativeStatus=value,directWaited=True,ownedWorkTerminated=True)
            return value
        finally:self.in_wait=False
    def confirm(self,unused):
        need(self.record['waitReceived'] is True and self.record['directWaited'] is True and self.record['ownedWorkTerminated'] is True,'OWNERSHIP_UNKNOWN')
    def closed_projection(self):
        value=dict(directPid=self.record['pid'],directWaited=self.record['directWaited'],nativeStatus=self.record['nativeStatus'],
            stdoutComplete=self.record['stdoutComplete'],stderrComplete=self.record['stderrComplete'],
            ownedWorkTerminated=self.record['ownedWorkTerminated'],descriptorsClosed=self.record['descriptorsClosed'],
            requestSha256=self.record['requestSha256'],modeEvidence=self.record['modeEvidence'],archiveSha256=self.record['archiveSha256'])
        return M.native_projection(value)

class Inspector:
    """Concrete bounded utility/current-sample implementation; no identity provider."""
    def __init__(self,unit):
        self.unit=unit;self.records=[];self.pending=[];self.relevance={};self.client=dict(pid=os.getpid(),ppid=os.getppid(),completionCapturedExternally=False)
    def utility(self,role,args,allow=(0,)):
        u=self.unit;binding=u.release['roles'][role]
        need(binding['use']=='OPERATIONAL' and role in ('PS','LSOF'),'ROLE_CONTRACT')
        u.fs.verified(binding['pin']);command=[binding['declaredPath'],*args]
        record=dict(kind='DIRECT_UTILITY',sequence=len(self.records)+1,pid=None,requestSha256=F.digest(F.encoded(command)),
            actualExit=None,waitReturned=False,stdoutComplete=False,stderrComplete=False,signalsSent=False,completion='UNKNOWN')
        self.records.append(record)
        attempt=u.owner.acquire(self,None,lambda child:need(record['waitReturned'] is True,'UTILITY_UNKNOWN'),'UTILITY_PROCESS')
        child=None;pipes=[]
        try:
            child=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                env={'LANG':'C','LC_ALL':'C','PATH':'/usr/bin:/bin:/usr/sbin:/sbin'})
            u.refs.append(child);attempt.update(fd=child,handle=child)
            record['pid']=scalar_pid(child.pid)
            for name in ('stdout','stderr'):
                actual=getattr(child,name)
                if actual is not None:
                    token=u.owner.acquire(self,actual,lambda h:h.close(),'UTILITY_PIPE');token['handle']=actual;pipes.append(token)
            need(record['pid'] is not None,'UTILITY_UNKNOWN')
            out,err=child.communicate(timeout=15)
            record['waitReturned']=True
            need(type(child.returncode) is int and child.returncode in allow and type(out) is bytes and type(err) is bytes
                and len(out)<=16777216 and len(err)<=16777216 and err==b'','UTILITY_UNKNOWN')
            record.update(actualExit=child.returncode,stdoutComplete=True,stderrComplete=True,completion='ACTUAL_DIRECT_WAIT_COMPLETE',
                stdoutBytes=len(out),stderrBytes=len(err),stdoutSha256=F.digest(out),stderrSha256=F.digest(err))
            for token in pipes:u.owner.close(token)
            u.owner.close(attempt);u.fs.verified(binding['pin'])
            return out.decode('utf-8','strict')
        except BaseException:
            if child is None:attempt['state']='UNKNOWN'
            record['completion']='UNKNOWN';self.pending.append(dict(child=child,attempt=attempt,pipes=pipes,record=record))
            u.owner.retain(self,child);u.latch('UTILITY_UNKNOWN');raise
    def scoped(self,pid,column):
        need(scalar_pid(pid) is not None and column in ('lstart','command','comm','ppid','uid'),'CURRENT_SAMPLE_UNKNOWN')
        text=self.utility('PS',['-ww','-p',str(pid),'-o',column+'='],(0,1))
        return text.strip() or None
    def controller_lock(self,postclose=False):
        u=self.unit;h=u.release['holder']
        for name in ('wrapper','shell'):
            expected=h[name];start=self.scoped(expected['pid'],'lstart')
            if postclose:need(start is None or start!=expected['legacyStart'],'HOLDER_OR_LOCK');continue
            need(start==expected['legacyStart'] and self.scoped(expected['pid'],'uid')==str(expected['uid'])
                and F.digest((self.scoped(expected['pid'],'command') or '').encode())==expected['argvSha256'],'HOLDER_OR_LOCK')
        if not postclose:
            need(os.getppid()==h['shell']['pid'] and self.scoped(h['shell']['pid'],'ppid')==str(h['wrapper']['pid']),'HOLDER_OR_LOCK')
        self.client.update(legacyStart=self.scoped(os.getpid(),'lstart'),observedArgvSha256=F.digest((self.scoped(os.getpid(),'command') or '').encode()))
        need(type(self.client['legacyStart']) is str and bool(self.client['legacyStart']),'CURRENT_SAMPLE_UNKNOWN')
        lock=h['lock'];c,name=u.fs.parent(lock['path']);fd=token=None
        try:
            fd,token=c.open_fd(name,os.O_RDWR|os.O_NOFOLLOW,dir_fd=c.fd);info=os.fstat(fd)
            need(stat.S_ISREG(info.st_mode) and (info.st_dev,info.st_ino)==(lock['dev'],lock['inode']),'HOLDER_OR_LOCK')
            if not postclose:
                raw=self.utility('LSOF',['-nP','-a','-p',str(h['wrapper']['pid']),'-F','pfin','--',lock['path']])
                lines=raw.splitlines();need(len(lines)==4 and lines==['p'+str(h['wrapper']['pid']),'f'+str(lock['wrapperFd']),'i'+str(lock['inode']),'n'+lock['path']],'HOLDER_OR_LOCK')
            acquired=False
            try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);acquired=True
            except OSError as error:need(not postclose and error.errno in (errno.EACCES,errno.EAGAIN),'HOLDER_OR_LOCK')
            if acquired:fcntl.flock(fd,fcntl.LOCK_UN)
            need(acquired is postclose,'HOLDER_OR_LOCK')
        finally:
            if token is not None:u.owner.close(token)
            c.close()
    def sample(self,allowed_child=None):
        u=self.unit;text=self.utility('PS',['-ww','-axo','pid=,ppid=,lstart=,command='])
        rows={}
        for line in text.splitlines():
            parts=line.split(None,7);need(len(parts)==8 and parts[0].isdigit() and parts[1].isdigit(),'CURRENT_SAMPLE_UNKNOWN')
            pid,parent=int(parts[0]),int(parts[1]);need(pid>0 and pid not in rows and len(rows)<16384,'CURRENT_SAMPLE_UNKNOWN')
            rows[pid]=dict(pid=pid,ppid=parent,legacyStart=' '.join(parts[2:7]),argvSha256=F.digest(parts[7].encode()))
            related=u.release['workRoot'] in parts[7] or u.release['evidenceRoot'] in parts[7]
            previous=self.relevance.get(pid)
            if related or previous is not None:
                value=dict(rows[pid],wasRelevant=True,identityAuthenticated=False,reuseAmbiguous=previous is not None)
                self.relevance[pid]=value;u.event('SAMPLED_RELEVANCE',value)
        for item in u.release['holder']['inherited']:
            need(item['pid'] in rows and rows[item['pid']]['legacyStart']==item['legacyStart'] and rows[item['pid']]['argvSha256']==item['argvSha256'],'CURRENT_SAMPLE_UNKNOWN')
        allowed={os.getpid(),u.release['holder']['wrapper']['pid'],u.release['holder']['shell']['pid']}
        if allowed_child is not None:allowed.add(allowed_child)
        for pid,value in self.relevance.items():
            if pid in rows and pid not in allowed:raise P.Hold('RELEVANCE_LIVE_OR_AMBIGUOUS')
        u.event('CURRENT_SAMPLE',dict(rowCount=len(rows),relevantCount=len(self.relevance),historicalIdentityUncertainty=True))
        return rows
    def restore(self,history):
        P.fields(history,('client','utilities','relevance','completion'))
        for value in history['relevance']:
            need(type(value) is dict and value.get('wasRelevant') is True and scalar_pid(value.get('pid')) is not None,'CURRENT_SAMPLE_UNKNOWN')
            self.relevance[value['pid']]=dict(value)

class RelayLoop:
    """Single owner serial receiver. No threads, provider, separate poller or force-close."""
    ENDPOINT='/private/tmp/obs011-pub-observe01/r.sock'
    def __init__(self,unit,child,control,control_sha):
        self.unit,self.child,self.control,self.control_sha=unit,child,control,control_sha
        self.selector=self.listener=self.connection=None;self.tokens=[];self.enrollments=0;self.started=False
        self.data_at=None;self.projection=None;self.receipt=dict(ready=False,channelMatched=False,qualified=False,
            enrollmentCount=0,dataCount=0,ackCount=0,commitCount=0,eof=False,receiverThreadCreated=False,receiverLoopComplete=False,
            socketNode=None,shortNamespace=None,projectionSha256=None,callerElapsedNs=None,conservativeElapsedNs=None)
    def own(self,actual,kind):
        token=self.unit.owner.acquire(self,actual,lambda h:h.close(),kind);token['handle']=actual;self.tokens.append(token);return actual
    def construct(self,factory,kind):
        token=self.unit.owner.acquire(self,None,lambda actual:actual.close(),kind);self.tokens.append(token)
        try:actual=factory()
        except BaseException:
            token['state']='UNKNOWN';self.unit.owner.retain(self);raise
        token.update(fd=actual,handle=actual);return actual
    def accepted(self,kind):
        token=self.unit.owner.acquire(self,None,lambda actual:actual.close(),kind);self.tokens.append(token)
        try:actual,unused=self.listener.accept()
        except BlockingIOError:
            # No object returned on the documented nonblocking no-enrollment result.
            token['state']='CLOSED';return None
        except BaseException:
            token['state']='UNKNOWN';self.unit.owner.retain(self);raise
        token.update(fd=actual,handle=actual);return actual
    def prepare(self):
        u=self.unit;need(not self.started,'CAP_CONSUMED');self.started=True
        self.receipt['shortNamespace']=u.fs.mkdir('/private/tmp/obs011-pub-observe01')
        self.selector=self.construct(selectors.DefaultSelector,'SELECTOR')
        self.listener=self.construct(lambda:socket.socket(socket.AF_UNIX,socket.SOCK_STREAM),'SOCKET')
        self.listener.set_inheritable(False);self.listener.setblocking(False);self.listener.bind(self.ENDPOINT);self.listener.listen(1)
        info=u.fs.info(self.ENDPOINT);need(stat.S_ISSOCK(info.st_mode) and info.st_uid==os.getuid(),'CHANNEL_UNQUALIFIED')
        self.receipt.update(socketNode=dict(dev=info.st_dev,inode=info.st_ino,uid=info.st_uid,mode=info.st_mode),ready=True)
        u.output('relay-ready.json',P.claim(**self.receipt))
        # Any already-enrolled peer before the actual owned child is retained consumes/HOLD.
        actual=self.accepted('CONNECTION')
        if actual is None:return
        self.connection=actual;self.enrollments=1;self.receipt['enrollmentCount']=1
        raise P.Hold('EARLY_OR_DUPLICATE_ENROLLMENT')
    def accept(self):
        need(self.enrollments==0 and self.connection is None,'EARLY_OR_DUPLICATE_ENROLLMENT')
        actual=self.accepted('CONNECTION')
        if actual is None:return False
        self.connection=actual;self.enrollments=1;self.receipt['enrollmentCount']=1
        self.connection.set_inheritable(False);self.connection.setblocking(False)
        self.child.live()
        need(sys.platform=='darwin','CHANNEL_UNQUALIFIED')
        credentials=self.connection.getsockopt(0,1,76);pidraw=self.connection.getsockopt(0,2,4)
        need(type(credentials) is bytes and len(credentials)==76 and type(pidraw) is bytes and len(pidraw)==4,'CHANNEL_UNQUALIFIED')
        version,uid,groups=struct.unpack_from('=IIh',credentials);pid=struct.unpack('=i',pidraw)[0]
        need(version==0 and 0<=groups<=16 and uid==os.getuid() and pid==self.child.record['pid'],'PEER_MISMATCH')
        self.child.live();self.receipt['channelMatched']=True
        self.data_at=time.monotonic_ns();return True
    def io(self,events,deadline):
        need(time.monotonic_ns()<deadline,'COMMIT_INVALID')
        try:self.selector.modify(self.connection,events)
        except KeyError:self.selector.register(self.connection,events)
        self.selector.select(min(.1,max(0,(deadline-time.monotonic_ns())/1000000000)))
        need(time.monotonic_ns()<deadline,'COMMIT_INVALID')
    def exact(self,count,deadline):
        need(type(count) is int and 0<=count<=16384,'FRAME_INVALID');out=bytearray()
        while len(out)<count:
            self.io(selectors.EVENT_READ,deadline)
            try:part=self.connection.recv(count-len(out))
            except BlockingIOError:continue
            need(type(part) is bytes and 0<len(part)<=count-len(out),'FRAME_INVALID');out.extend(part)
        return bytes(out)
    def frame(self,cap,deadline):
        size=struct.unpack('!I',self.exact(4,deadline))[0];need(0<size<=cap,'FRAME_INVALID')
        return P.decode(self.exact(size,deadline),cap)
    def send(self,value,cap,deadline):
        raw=json.dumps(value,separators=(',',':'),allow_nan=False).encode();need(0<len(raw)<=cap,'FRAME_INVALID')
        framed=struct.pack('!I',len(raw))+raw;offset=0
        while offset<len(framed):
            self.io(selectors.EVENT_WRITE,deadline)
            try:count=self.connection.send(framed[offset:])
            except BlockingIOError:continue
            need(type(count) is int and 0<count<=len(framed)-offset,'FRAME_INVALID');offset+=count
    def exchange(self):
        u=self.unit;need(self.receipt['channelMatched'] is True,'CHANNEL_UNQUALIFIED');deadline=self.data_at+15000000000
        data=self.frame(16384,deadline);P.fields(data,('protocolVersion','controlSha256','enrollmentNonce','observation','networkAccounting'))
        need(type(data['protocolVersion']) is int and data['protocolVersion']==2 and data['controlSha256']==self.control_sha
            and data['enrollmentNonce']==self.control['enrollmentNonce'],'FRAME_INVALID')
        observation=C.validate_record(data['observation'])
        need(observation['captureStatus']=='NOT_REPRODUCED' and observation['pollState']=='FINALIZING'
            and observation['networkAccounting']==C.network_not_started() and data['networkAccounting']==observation['networkAccounting'],'FRAME_INVALID')
        self.receipt['dataCount']=1;raw=json.dumps(observation,separators=(',',':'),allow_nan=False).encode()+b'\n'
        u.fs.write(u.evidence+'/public-observation.json',raw,16384)
        reread,unused=u.fs.read(u.evidence+'/public-observation.json',mode=0o600,uid=os.getuid(),maximum=16384)
        need(raw==reread,'PROJECTION_CUSTODY');self.projection=observation;projection_sha=F.digest(raw)
        self.receipt['projectionSha256']=projection_sha
        self.send(dict(protocolVersion=2,controlSha256=self.control_sha,projectionSha256=projection_sha,status='WRITTEN_CUSTODIED'),256,deadline);self.receipt['ackCount']=1
        commit=self.frame(512,deadline);P.fields(commit,('protocolVersion','controlSha256','projectionSha256','status','callerElapsedNs'))
        elapsed=commit['callerElapsedNs']
        need(type(commit['protocolVersion']) is int and commit['protocolVersion']==2 and commit['controlSha256']==self.control_sha
            and commit['projectionSha256']==projection_sha and commit['status']=='CALLER_SAW_CUSTODIED_ACK'
            and type(elapsed) is int and 0<=elapsed<15000000000,'COMMIT_INVALID')
        conservative=elapsed+(time.monotonic_ns()-self.data_at);need(0<=conservative<15000000000,'COMMIT_INVALID')
        self.receipt.update(commitCount=1,callerElapsedNs=elapsed,conservativeElapsedNs=conservative)
        self.io(selectors.EVENT_READ,deadline)
        try:extra=self.connection.recv(1)
        except BlockingIOError:raise P.Hold('COMMIT_INVALID')
        need(extra==b'','COMMIT_INVALID');self.receipt['eof']=True
        # A second queued enrollment is never accepted under the one-child capability.
        duplicate=self.accepted('DUPLICATE_CONNECTION')
        if duplicate is not None:raise P.Hold('EARLY_OR_DUPLICATE_ENROLLMENT')
        self.receipt['qualified']=True
    def finish(self):
        for token in reversed(self.tokens):
            if token['state'] in ('OPEN','TRANSFERRED'):self.unit.owner.close(token)
        self.receipt['receiverLoopComplete']=all(token['state']=='CLOSED' for token in self.tokens)
        need(self.receipt['receiverLoopComplete'] is True,'OWNERSHIP_UNKNOWN')

class Unit:
    """Concrete one-operation-per-entry unit. All dependencies are verified code modules."""
    def __init__(self,release,release_sha,manifest_sha,buffers):
        self.owner=K.Ownership();self.owner.owner(self);self.fs=F.Storage(self.owner)
        self.release=P.release(release,manifest_sha);self.release_sha=release_sha;self.manifest_sha=manifest_sha;self.buffers=buffers
        self.work=release['workRoot'];self.evidence=release['evidenceRoot'];self.refs=[];self.inspector=Inspector(self)
        self.primary='NONE';self.cleanup='NONE';self.events=[];self.cap=False;self.current_entry=None;self.generated={}
        self.child=ChildOwner(self);self.relay=None;self.native_received=False;self.native_result=None;self.operator_emitted=False
        self.scope=None;self.hold=None;self.operation=None;self.deadline=None;self.last_clock=None;self.permit=None
    def latch(self,reason):
        if self.primary=='NONE':self.primary=reason
    def event(self,kind,value):
        need(len(self.events)<16384 and len(F.encoded(self.events))+len(F.encoded(value))<8388608,'CURRENT_SAMPLE_UNKNOWN')
        self.events.append(dict(sequence=len(self.events)+1,kind=kind,value=value))
    def output(self,name,value):
        need(type(name) is str and '/' not in name and name.endswith('.json'),'CONTROL_SCHEMA')
        meta=self.fs.document(self.evidence+'/'+name,value);self.generated[name]=meta['sha256'];return meta
    def document(self,spec):return P.decode(self.fs.verified(spec))
    def self_roles(self):
        policy=self.release['selfTextPolicy'];reported=self_text(getattr(sys,'executable',None));arguments=getattr(sys,'orig_argv',None)
        argument=self_text(arguments[0] if type(arguments) is list and arguments else None)
        need(reported['status']=='COMPLETE' and argument['status']=='COMPLETE'
            and (reported['bytes'],reported['sha256'])==(policy['reportedBytes'],policy['reportedSha256'])
            and (argument['bytes'],argument['sha256'])==(policy['origArgv0Bytes'],policy['origArgv0Sha256']),'ROLE_CONTRACT')
        # Never convert either raw memory string into a Path, read, resolve or launcher.
        self.self_report=dict(reported=reported,origArgv0=argument,kind='MEMORY_TEXT_DIGEST_NOT_PATH',requestedLaunch='EXTERNAL_PARENT_ATTESTATION',processIdentityAuthenticated=False)
    def verify_inputs(self):
        budget=F.Budget();facts=[]
        for value in self.release['roles'].values():
            if value['use']=='OPERATIONAL':self.fs.verified(value['pin'],budget)
        for value in self.release['sourceInputs']:facts.append(self.fs.read(value['path'],value,budget=budget,maximum=134217728)[1])
        for value in self.release['phaseInputs'].values():self.fs.verified(value,budget)
        self.event('FINITE_INPUT_EQUALITY',dict(sourceMembers=len(facts),sourceAncestrySha256=self.release['sourceAncestrySha256'],factKind='PER_MEMBER_EQUALITY_TO_PINNED_ANCESTRY',currentFactSha256=F.digest(F.encoded(facts))))
        return facts
    def owners(self):
        review_pins={}
        for role,spec in self.release['codeReviews'].items():
            doc=self.document(spec)
            need(doc.get('reviewer')==role and doc.get('subjectManifestSha256')==self.manifest_sha and doc.get('protocol')==P.PROTOCOL
                and doc.get('mandatoryFindings')==[] and doc.get('sourceOnly') is True,'OWNER_RULINGS_OWED')
            review_pins[role]=spec['sha256']
        role_sha=F.digest(F.encoded(dict(roles=self.release['roles'],selfTextPolicy=self.release['selfTextPolicy'])))
        for role,spec in self.release['ownerRulings'].items():
            doc=P.validate_claim(self.document(spec))
            need(doc.get('owner')==role and doc.get('purpose')=='SYNTHETIC_CONSUMER_TECHNICAL_SECURITY_RULING'
                and doc.get('sourceManifestSha256')==self.manifest_sha and doc.get('profileAuthorized') is True
                and doc.get('operationalAuthority') is False and doc.get('codeReviewPins')==review_pins
                and doc.get('principal')==P.PRINCIPAL and doc.get('roleContractSha256')==role_sha,'OWNER_RULINGS_OWED')
        self.scope=self.document(self.release['rootScope'])
        need(self.scope.get('authorizedBy')=='root' and self.scope.get('purpose')=='ONE_FRESH_SYNTHETIC_UNIT_SCOPE'
            and self.scope.get('protocol')==P.PROTOCOL and self.scope.get('unit')==self.release['unit']
            and self.scope.get('sourceManifestSha256')==self.manifest_sha and self.scope.get('actualUnitAuthorized') is True
            and self.scope.get('businessSourceWindowOpened') is False and self.scope.get('nonIR') is True
            and self.scope.get('expectedArgvSha256')==F.digest(F.encoded(self.release['argv'])),'PROFILE_OR_SCOPE')
        gateway=self.document(self.scope['gatewayClosedRootPin'])
        need(gateway.get('acceptedBy')=='root' and gateway.get('actualQaAccepted') is True and gateway.get('wrapperExit')==1
            and type(gateway.get('wrapperExit')) is int and gateway.get('postcloseExit')==0 and type(gateway.get('postcloseExit')) is int
            and gateway.get('actualOuterCompletionCaptured') is True,'ACTUAL_QA_OWED')
        lease=self.scope['lease'];P.fields(lease,('start','expires','roots','exclusive'))
        now=time.time();need(type(now) in (int,float) and type(lease['start']) in (int,float) and type(lease['expires']) in (int,float)
            and 0<lease['expires']-lease['start']<=43200 and lease['start']<=now<lease['expires'] and lease['exclusive'] is True
            and lease['roots']==[self.work,self.evidence],'PROFILE_OR_SCOPE')
        for row in self.release['holder']['directories']:
            info=self.fs.info(row['path']);need((info.st_dev,info.st_ino,info.st_uid,stat.S_IMODE(info.st_mode))==(row['dev'],row['inode'],row['uid'],row['mode']),'HOLDER_OR_LOCK')
        self.self_roles();self.verify_inputs()
    def current(self,postclose=False):
        self.inspector.controller_lock(postclose);self.verify_inputs()
        child=self.child.record['pid'] if self.child.child is not None and self.child.poll() is None else None
        rows=self.inspector.sample(child)
        for name in ('wrapper','shell'):
            if not postclose:need(self.release['holder'][name]['pid'] in rows,'HOLDER_OR_LOCK')
        return rows
    def matched(self,spec,purpose,operation=None):
        value=P.validate_claim(self.document(spec))
        need(value.get('purpose')==purpose and value.get('unit')==self.release['unit']
            and value.get('releaseSha256')==self.release_sha and value.get('sourceManifestSha256')==self.manifest_sha,'PHASE_ORDER')
        if operation is not None:need(value.get('operation')==operation,'PHASE_ORDER')
        return value
    def capture(self):
        self.owners();before=self.current();after=self.current()
        need(before==after,'CURRENT_SAMPLE_UNKNOWN')
        return P.claim(purpose='C4_CAPTURE2',unit=self.release['unit'],releaseSha256=self.release_sha,
            sourceManifestSha256=self.manifest_sha,holder=self.release['holder'],observations=2,stableSamples=True,
            client=self.inspector.client,relevance=list(self.inspector.relevance.values()),utilities=self.inspector.records,
            completion='OUTER_COMPLETION_OWED',noEvidenceNamespaceWrite=True)
    def history(self,inputs):
        # A utility/client's in-process snapshot never establishes its own outer completion.
        captures=self.matched(inputs['capture'],'C4_CAPTURE2')
        need(captures.get('holder')==self.release['holder'] and captures.get('observations')==2 and type(captures.get('observations')) is int
            and captures.get('stableSamples') is True and captures.get('noEvidenceNamespaceWrite') is True,'PHASE_ORDER')
        completion=self.document(inputs['captureOuter'])
        need(type(completion) is dict and completion.get('authorizedBy')=='root' and completion.get('receiptSha256')==inputs['capture']['sha256']
            and type(completion.get('actualExit')) is int and completion.get('actualExit')==0
            and completion.get('actualOuterCompletionCaptured') is True,'OUTER_COMPLETION_OWED')
        prior=captures['client'];need(type(prior) is dict and scalar_pid(prior.get('pid')) is not None,'CURRENT_SAMPLE_UNKNOWN')
        # Any present PID is ambiguous, including a reused PID. No start-string difference grants reuse.
        rows=self.inspector.sample()
        need(prior['pid'] not in rows,'RELEVANCE_LIVE_OR_AMBIGUOUS')
        for item in captures['utilities']:
            need(type(item) is dict and item.get('completion')=='ACTUAL_DIRECT_WAIT_COMPLETE' and item.get('waitReturned') is True
                and item.get('stdoutComplete') is True and item.get('stderrComplete') is True,'UTILITY_UNKNOWN')
        self.inspector.restore(dict(client=prior,utilities=captures['utilities'],relevance=captures['relevance'],completion=completion))
    def negative(self,inputs):
        self.owners();self.history(inputs);self.current()
        # A separate negative command cannot issue native launch or admission. Root must inspect its actual 2.
        return P.claim(purpose='GUARD_NEGATIVE',unit=self.release['unit'],releaseSha256=self.release_sha,
            sourceManifestSha256=self.manifest_sha,holder=self.release['holder'],operation='negative',nativeLaunchAttempted=False,
            expectedExit=2,admitted=False)
    def preadmit(self,inputs):
        self.owners();self.history(inputs)
        negative=self.matched(inputs['negative'],'GUARD_NEGATIVE','negative');status=self.document(inputs['negativeStatus'])
        need(negative.get('holder')==self.release['holder'] and negative.get('nativeLaunchAttempted') is False and negative.get('admitted') is False
            and status.get('receiptSha256')==inputs['negative']['sha256'] and status.get('inspectedBy')=='root'
            and type(status.get('actualExit')) is int and status.get('actualExit')==2 and status.get('separateInspection') is True
            and status.get('actualOuterCompletionCaptured') is True,'PHASE_ORDER')
        self.current();self.fs.absent(self.work) or need(False,'CAP_CONSUMED');self.fs.absent(self.evidence) or need(False,'CAP_CONSUMED')
    def phase(self):
        r=self.release;inputs=r['phaseInputs'];operation=r['operation'];mode=r['mode']
        if operation=='mode':need(r['nativeBudgetNs']==20000000000,'INPUTS_UNQUALIFIED')
        shared={'JDK_RELEASE','PHASE_AUTHORIZATION'}
        required=shared|({'KEYTOOL','PASSWORD'} if operation=='fixture' else {'JAVAC','CLASSPATH_INDEX','HARNESS_SOURCE'} if operation=='compile'
            else {'JAVA','CLASSPATH_INDEX','CLASSES_INDEX'}|({'FIXTURE','PASSWORD'} if mode.startswith('tls-') else set()))
        need(set(inputs)==required,'INPUTS_UNQUALIFIED')
        authorization=self.document(inputs['PHASE_AUTHORIZATION'])
        need(type(authorization) is dict and authorization.get('acceptedBy')=='root' and authorization.get('protocol')==P.PROTOCOL
            and authorization.get('operation')==operation and authorization.get('mode')==mode and authorization.get('unit')==r['unit']
            and authorization.get('platformPrerequisitesQualified') is True and authorization.get('nativeAttemptCap')==1
            and type(authorization.get('nativeAttemptCap')) is int and authorization.get('jdkReleaseSha256')==inputs['JDK_RELEASE']['sha256']
            and authorization.get('actualPriorUnitQaAccepted') is True,'INPUTS_UNQUALIFIED')
        env=self.document(r['environmentPin']);need(type(env) is dict and all(type(k) is str and type(v) is str for k,v in env.items()),'CONTROL_SCHEMA')
        need(set(env).issubset({'LANG','LC_ALL','PATH','CHECKS_PUBLIC_OBSERVER_CONTROL','CHECKS_PUBLIC_OBSERVER_CONTROL_SHA256','SYNTHETIC_PUBLIC_KEYSTORE_PASSWORD'})
            and env.get('LANG')==env.get('LC_ALL')=='C' and env.get('PATH')=='/usr/bin:/bin:/usr/sbin:/sbin','CONTROL_SCHEMA')
        need(r['ownerUid']==os.getuid(),'ROLE_CONTRACT')
        self.control=self.document(r['launchControlPin']);self.control_sha=r['launchControlPin']['sha256']
        validate_launch_control(self.control)
        if operation=='fixture':
            executable=inputs['KEYTOOL']['path'];self.fixture=self.work+'/fixture.p12'
            password=self.fs.verified(inputs['PASSWORD']);need(inputs['PASSWORD']['mode']==0o600 and 20<=len(password)<=128
                and all(33<=value<=126 for value in password),'INPUTS_UNQUALIFIED')
            need(env.get('SYNTHETIC_PUBLIC_KEYSTORE_PASSWORD')==password.decode('ascii'),'INPUTS_UNQUALIFIED')
            expected=[executable,'-genkeypair','-alias','local-synthetic','-dname','CN=localhost','-ext','SAN=dns:localhost,ip:127.0.0.1',
                '-keyalg','RSA','-keysize','2048','-validity','1','-storetype','PKCS12','-keystore',self.fixture,
                '-storepass:env','SYNTHETIC_PUBLIC_KEYSTORE_PASSWORD','-keypass:env','SYNTHETIC_PUBLIC_KEYSTORE_PASSWORD','-noprompt']
        else:
            index=self.document(inputs['CLASSPATH_INDEX']);P.fields(index,('purpose','members','literal'))
            need(index['purpose']=='FINITE_CLOSED_JACKSON_CLASSPATH' and type(index['members']) is list and 0<len(index['members'])<=64,'INPUTS_UNQUALIFIED')
            for item in index['members']:P.pin(item);self.fs.verified(item)
            need(index['literal']==':'.join(item['path'] for item in index['members']) and all('*' not in item['path'] and ':' not in item['path'] for item in index['members']),'INPUTS_UNQUALIFIED')
            if operation=='compile':
                need(inputs['HARNESS_SOURCE']['sha256']=='82a90d1a0925e8118cb146d652c73bf2a3a748a1df2de89337e7a9e50d73f25f','EXTERNAL_PIN')
                expected=[inputs['JAVAC']['path'],'-cp',index['literal'],'-d',self.work+'/classes',self.work+'/src/ObserverBoundaryHarness.java']
            else:
                classes=self.document(inputs['CLASSES_INDEX']);P.fields(classes,('purpose','root','members','actualCompilerQaRootPin'))
                need(classes['purpose']=='FINITE_CLOSED_EMITTED_CLASSES' and P.safe_absolute(classes['root']) and type(classes['members']) is list
                    and 0<len(classes['members'])<=8192,'INPUTS_UNQUALIFIED')
                prior=self.document(classes['actualCompilerQaRootPin']);need(prior.get('acceptedBy')=='root' and prior.get('actualQaAccepted') is True
                    and prior.get('postcloseExit')==0 and type(prior.get('postcloseExit')) is int,'ACTUAL_QA_OWED')
                for item in classes['members']:
                    P.pin(item);need(item['path'].startswith(classes['root']+'/') and item['path'].endswith('.class'),'INPUTS_UNQUALIFIED');self.fs.verified(item)
                observed=self.fs.inventory(classes['root'])
                need({item['path'][len(classes['root'])+1:] for item in classes['members']}=={item['path'] for item in observed},'INPUTS_UNQUALIFIED')
                expected=[inputs['JAVA']['path'],'-cp',classes['root']+':'+index['literal'],'ObserverBoundaryHarness',mode]
                if mode.startswith('tls-'):
                    need(inputs['FIXTURE']['mode']==0o600 and inputs['PASSWORD']['mode']==0o600,'INPUTS_UNQUALIFIED')
                    password=self.fs.verified(inputs['PASSWORD']);need(20<=len(password)<=128 and all(33<=value<=126 for value in password),'INPUTS_UNQUALIFIED')
                    need(env.get('SYNTHETIC_PUBLIC_KEYSTORE_PASSWORD')==password.decode('ascii'),'INPUTS_UNQUALIFIED')
                    expected.extend([inputs['FIXTURE']['path'],'ROOT_QUALIFIED_LOCAL_SYNTHETIC_ONLY'])
        need(r['argv']==expected,'INPUTS_UNQUALIFIED')
        if operation=='mode' and mode=='relay':
            need(env.get('CHECKS_PUBLIC_OBSERVER_CONTROL')==r['launchControlPin']['path'] and env.get('CHECKS_PUBLIC_OBSERVER_CONTROL_SHA256')==self.control_sha,'CONTROL_SCHEMA')
        return env
    def drain_step(self):
        """No signal, wait-all or constructor retry. True means every known resource is confirmed."""
        if self.child.child is not None and not self.child.record['waitReceived']:
            try:
                if self.child.poll() is not None:self.child.wait_terminal()
            except BaseException as error:self.latch(P.reason(error))
        if self.child.record['waitReceived'] and self.child.record['directWaited'] is True:
            if self.child.token['state'] in ('OPEN','TRANSFERRED'):
                try:self.owner.close(self.child.token)
                except BaseException:self.cleanup='OWNERSHIP_UNKNOWN'
        for pending in self.inspector.pending:
            child=pending['child'];record=pending['record']
            # Constructor-unknown or any returned-but-invalid wait is never retried or called complete.
            if child is None or record['waitReturned']:continue
            try:
                result=child.poll();need(result is None or type(result) is int and -2147483648<=result<2147483648,'UTILITY_UNKNOWN')
                if result is None:continue
                out,err=child.communicate(timeout=0);record['waitReturned']=True
                need(type(child.returncode) is int and type(out) is bytes and type(err) is bytes and len(out)<=16777216 and len(err)<=16777216,'UTILITY_UNKNOWN')
                record.update(actualExit=child.returncode,stdoutComplete=True,stderrComplete=True,completion='ACTUAL_DIRECT_WAIT_COMPLETE',
                    stdoutBytes=len(out),stderrBytes=len(err),stdoutSha256=F.digest(out),stderrSha256=F.digest(err))
                for token in pending['pipes']:
                    if token['state']=='OPEN':self.owner.close(token)
                if pending['attempt']['state']=='OPEN':self.owner.close(pending['attempt'])
            except BaseException:self.cleanup='UTILITY_UNKNOWN'
        known_native=not self.child.record['constructionAttempted'] or self.child.record['directWaited'] is True
        utility_complete=all(item['record']['completion']=='ACTUAL_DIRECT_WAIT_COMPLETE' for item in self.inspector.pending)
        return known_native and utility_complete and not any(item['state']=='UNKNOWN' for item in self.owner.tokens)
    def retain_foreground(self):
        """Concrete foreground owner. Unknown constructors/closers intentionally cannot return.

        This is not drain proof. An exact reviewed external disposition boundary for an
        unrecoverable UNKNOWN remains a prerequisite; interpreter teardown is forbidden.
        """
        RETAINED.append(self);self.owner.retain(self,self.child,self.inspector,self.relay,*self.refs)
        while True:
            self.drain_step()
            # Sticky primary is never erased. No deadline renewal, signal, cleanup retry or exit.
            time.sleep(.1)
    def native(self,inputs):
        need(not self.cap,'CAP_CONSUMED');self.cap=True # memory cap before owners/setup/publication
        self.preadmit(inputs);environment=self.phase()
        self.fs.mkdir(self.work);self.fs.mkdir(self.evidence);self.fs.mkdir(self.release['cwd'])
        self.output('attempt.json',P.claim(purpose='EXCLUSIVE_UNIT_ATTEMPT',unit=self.release['unit'],releaseSha256=self.release_sha,
            sourceManifestSha256=self.manifest_sha,operation=self.release['operation'],attempt=1))
        out=err=None;started=time.monotonic_ns();self.deadline=started+self.release['nativeBudgetNs'];self.last_clock=started
        try:
            if self.release['operation']=='compile':
                self.fs.mkdir(self.work+'/src');self.fs.mkdir(self.work+'/classes')
                self.fs.write(self.work+'/src/ObserverBoundaryHarness.java',self.fs.verified(self.release['phaseInputs']['HARNESS_SOURCE']))
            if self.release['mode']=='relay':
                self.relay=RelayLoop(self,self.child,self.control,self.control_sha);self.relay.prepare()
            out=self.fs.create(self.evidence+'/native.stdout');err=self.fs.create(self.evidence+'/native.stderr')
            self.current();self.child.launch(self.release['argv'],self.release['cwd'],environment,out,err,self.release['nativeBudgetNs'])
            while True:
                now=time.monotonic_ns();need(type(now) is int and now>=self.last_clock,'NATIVE_UNKNOWN');self.last_clock=now
                if now>=self.deadline:self.latch('NATIVE_DEADLINE')
                if self.primary!='NONE':break
                if self.relay is not None and self.relay.connection is None:self.relay.accept()
                if self.relay is not None and self.relay.receipt['channelMatched'] and not self.relay.receipt['qualified']:self.relay.exchange()
                if self.child.poll() is not None:self.child.wait_terminal();break
                time.sleep(.05)
            if self.primary!='NONE':raise P.Hold(self.primary)
            need(self.child.record['nativeStatus']==0,'NATIVE_FAILED')
        except BaseException as error:
            self.latch(P.reason(error));self.hold=error
        finally:
            # Primary is set before fallible cleanup/publication, including exceptions outside launch.
            if not self.drain_step():self.retain_foreground()
            if self.relay is not None:
                try:self.relay.finish()
                except BaseException:self.cleanup='OWNERSHIP_UNKNOWN'
            for sink in (out,err):
                if sink is not None:
                    try:self.fs.close_sink(sink)
                    except BaseException:self.cleanup='OWNERSHIP_UNKNOWN'
            if self.owner.blockers():
                # Directory/file attempts remain retained if their actual close was not confirmed.
                try:self.fs.finish()
                except BaseException:self.cleanup='OWNERSHIP_UNKNOWN'
            if self.cleanup!='NONE':self.retain_foreground()
        try:
            stdout,stdoutmeta=self.fs.read(self.evidence+'/native.stdout',mode=0o600,uid=os.getuid(),maximum=16384)
            stderr,stderrmeta=self.fs.read(self.evidence+'/native.stderr',mode=0o600,uid=os.getuid(),maximum=16777216)
            self.child.record.update(stdoutComplete=True,stderrComplete=True,descriptorsClosed=not bool(self.owner.blockers()))
            need(stderr==b'','NATIVE_FAILED')
            if self.release['operation']=='mode':
                need(M.mode_evidence(self.release['mode'],stdout,C) is True,'MODE_EVIDENCE')
                if self.release['mode']=='relay':need(synthetic_relay_qualified(self.relay.receipt) is True,'CHANNEL_UNQUALIFIED')
                self.child.record['modeEvidence']=stdout
            elif self.release['operation']=='compile':
                classes=self.fs.inventory(self.work+'/classes');need(bool(classes) and all(row['path'].endswith('.class') for row in classes),'INPUTS_UNQUALIFIED')
                self.output('emitted-classes.json',P.claim(purpose='UNQUALIFIED_EMITTED_CLASS_INVENTORY',unit=self.release['unit'],releaseSha256=self.release_sha,sourceManifestSha256=self.manifest_sha,members=classes))
            else:
                raw,meta=self.fs.read(self.fixture,uid=os.getuid(),maximum=134217728)
                need(bool(raw),'INPUTS_UNQUALIFIED')
                self.output('fixture-result.json',P.claim(purpose='UNQUALIFIED_KEYTOOL_RESULT',unit=self.release['unit'],releaseSha256=self.release_sha,sourceManifestSha256=self.manifest_sha,fixture=meta,tlsQualified=False))
            self.current()
        except BaseException as error:self.latch(P.reason(error))
        # Runtime acceptance is a new synthetic claim. It grants no code/profile owner approval.
        result=P.claim(purpose='HELD_UNIT_RESULT',unit=self.release['unit'],releaseSha256=self.release_sha,sourceManifestSha256=self.manifest_sha,
            operation=self.release['operation'],mode=self.release['mode'],primaryReason=self.primary,cleanupReason=self.cleanup,
            nativeWait=self.child.closed_projection(),modeEvidenceAccepted=type(self.child.record['modeEvidence']) is bytes,
            receiver=None if self.relay is None else dict(self.relay.receipt),events=self.events,client=self.inspector.client,
            utilities=self.inspector.records,relevance=list(self.inspector.relevance.values()),actualOuterCompletionCaptured=False)
        self.output('held-result.json',result);return result
    def archive(self,inputs):
        self.owners();self.current();held=self.matched(inputs['held'],'HELD_UNIT_RESULT')
        outer=self.document(inputs['heldOuter']);need(outer.get('inspectedBy')=='root' and outer.get('receiptSha256')==inputs['held']['sha256']
            and type(outer.get('actualExit')) is int and outer.get('actualExit') in (0,1) and outer.get('actualOuterCompletionCaptured') is True,'OUTER_COMPLETION_OWED')
        need(not bool(self.owner.blockers()),'OWNERSHIP_UNKNOWN')
        # Exclude no source artifact. Archive destination is a new sibling fixed by the root scope.
        destination=self.scope['archiveRoot'];need(P.safe_absolute(destination) and destination.startswith(self.release['repoRoot']+'/docs/qa/evidence/STUDIO-OBS-011/t0/runtime/')
            and destination not in (self.work,self.evidence),'ARCHIVE_UNKNOWN')
        self.fs.mkdir(destination);rows={};copied={}
        budget=F.Budget(entries=8192,total=536870912,per_file=134217728)
        for label,root in (('W',self.work),('E',self.evidence)):
            rows[label]=self.fs.inventory(root,budget=budget);copied[label]=self.fs.archive(root,destination+'/'+label,rows[label])
        need(sorted(label+'/'+row['path'] for label in rows for row in rows[label])==sorted(self.release['expectedOutputMembers']),'ARCHIVE_UNKNOWN')
        native=dict(held['nativeWait']);native.pop('shapeValid',None);native.pop('fieldTypesValid',None);native.pop('reason',None)
        native['modeEvidence']=self.fs.read(self.evidence+'/native.stdout',mode=0o600,uid=os.getuid(),maximum=16384)[0]
        native['archiveSha256']=F.digest(F.encoded(copied))
        projected=M.native_projection(native)
        result=P.claim(purpose='FULL_W_E_ARCHIVE',unit=self.release['unit'],releaseSha256=self.release_sha,sourceManifestSha256=self.manifest_sha,
            archiveRoot=destination,heldPin=inputs['held'],heldOuterPin=inputs['heldOuter'],originalMembers=rows,archiveMembers=copied,
            archiveFileMode=0o600,sourceModesPreserved=True,sourceDeleted=False,privateCleanupAuthorized=False,nativeWait=projected)
        self.output('archive-receipt.json',result);return result
    def archive_equal(self,archive):
        need(archive.get('archiveRoot')==self.scope['archiveRoot'],'ARCHIVE_UNKNOWN')
        for label,root in (('W',self.work),('E',self.evidence)):
            current=self.fs.inventory(root,exclude=('archive-receipt.json',) if label=='E' else ())
            need(current==archive['originalMembers'][label],'SOURCE_DRIFT')
            actual=self.fs.inventory(archive['archiveRoot']+'/'+label)
            expected=archive['archiveMembers'][label]
            need([(x['path'],x['sha256'],x['bytes'],x['mode']) for x in actual]==[(x['path'],x['sha256'],x['bytes'],x['archiveMode']) for x in expected],'ARCHIVE_UNKNOWN')
    def final(self,inputs):
        self.owners();self.current();archive=self.matched(inputs['archive'],'FULL_W_E_ARCHIVE');self.archive_equal(archive)
        qa=self.document(inputs['archiveQaRoot']);need(qa.get('acceptedBy')=='root' and qa.get('actualQaAccepted') is True
            and qa.get('archiveReceiptSha256')==inputs['archive']['sha256'] and qa.get('fullPrivateArchiveInspected') is True,'ACTUAL_QA_OWED')
        need(not self.owner.blockers(),'OWNERSHIP_UNKNOWN')
        return P.claim(purpose='FINAL_READINESS',unit=self.release['unit'],releaseSha256=self.release_sha,sourceManifestSha256=self.manifest_sha,
            operation='final',archivePin=inputs['archive'],archiveQaRootPin=inputs['archiveQaRoot'],holder=self.release['holder'],ready=True,
            expectedWrapperExit=0 if qa.get('heldPrimaryReason')=='NONE' else 1,createdAtNs=time.time_ns(),actualOuterCompletionCaptured=False)
    def permit_check(self,permit,readiness_pin,when):
        P.fields(permit,('protocol','purpose','authorizedBy','unit','releaseSha256','readinessPin','createdAtNs','expiresAtNs','attemptCap','expectedWrapperExit'))
        now=time.time_ns();need(type(now) is int and P.integer(permit['createdAtNs'],0,9223372036854775807) and P.integer(permit['expiresAtNs'],0,9223372036854775807)
            and 0<permit['expiresAtNs']-permit['createdAtNs']<=60000000000 and permit['createdAtNs']<=now<permit['expiresAtNs'],'PERMIT_STALE')
        need(permit['protocol']==P.PROTOCOL and permit['purpose']=='ONE_AFTERALLOW_FINAL_GUARD' and permit['authorizedBy']=='root'
            and permit['unit']==self.release['unit'] and permit['releaseSha256']==self.release_sha and permit['readinessPin']==readiness_pin
            and type(permit['attemptCap']) is int and permit['attemptCap']==1 and type(permit['expectedWrapperExit']) is int
            and permit['expectedWrapperExit'] in (0,1),'PERMIT_STALE')
        self.event('PERMIT_'+when,dict(nowNs=now,expiresAtNs=permit['expiresAtNs'],readinessSha256=readiness_pin['sha256']))
    def gate(self,inputs):
        need(not self.cap,'CAP_CONSUMED');self.cap=True
        self.owners();ready=self.matched(inputs['readiness'],'FINAL_READINESS','final')
        inspected=self.document(inputs['readinessStatus']);need(inspected.get('inspectedBy')=='root' and inspected.get('separateInspection') is True
            and inspected.get('receiptSha256')==inputs['readiness']['sha256'] and type(inspected.get('actualExit')) is int and inspected.get('actualExit')==0
            and inspected.get('actualOuterCompletionCaptured') is True and ready.get('ready') is True and ready.get('holder')==self.release['holder'],'READINESS_OWED')
        permit=self.document(inputs['permit']);self.permit_check(permit,inputs['readiness'],'PRE')
        self.current();archive=self.matched(ready['archivePin'],'FULL_W_E_ARCHIVE');self.archive_equal(archive)
        # Fallible allow work is inside, followed by the SAME distinct permit's POST expiry check.
        qa=self.document(ready['archiveQaRootPin']);need(qa.get('actualQaAccepted') is True,'ACTUAL_QA_OWED')
        need(ready['expectedWrapperExit']==permit['expectedWrapperExit'] and type(ready['expectedWrapperExit']) is int,'READINESS_OWED')
        self.permit_check(permit,inputs['readiness'],'POST')
        return P.claim(purpose='FINAL_GUARD_DELIVERY',unit=self.release['unit'],releaseSha256=self.release_sha,sourceManifestSha256=self.manifest_sha,
            operation='gate',allow=True,expectedWrapperExit=ready['expectedWrapperExit'],permitPin=inputs['permit'],readinessPin=inputs['readiness'],
            events=self.events,actualWrapperExitCaptured=False,actualOuterCompletionCaptured=False)
    def postclose(self,inputs):
        self.owners();guard=self.matched(inputs['guard'],'FINAL_GUARD_DELIVERY','gate');outer=self.document(inputs['wrapperOuter'])
        need(outer.get('inspectedBy')=='root' and outer.get('guardReceiptSha256')==inputs['guard']['sha256']
            and type(outer.get('actualWrapperExit')) is int and outer.get('actualWrapperExit')==guard['expectedWrapperExit']
            and outer.get('actualOuterCompletionCaptured') is True,'OUTER_COMPLETION_OWED')
        self.current(postclose=True);ready=self.matched(guard['readinessPin'],'FINAL_READINESS','final')
        archive=self.matched(ready['archivePin'],'FULL_W_E_ARCHIVE');self.archive_equal(archive)
        need(not self.owner.blockers(),'OWNERSHIP_UNKNOWN')
        return P.claim(purpose='POSTCLOSE_RESULT',unit=self.release['unit'],releaseSha256=self.release_sha,sourceManifestSha256=self.manifest_sha,
            operation='postclose',wrapperOuterPin=inputs['wrapperOuter'],wrapperClosedAndOriginalLockFree=True,
            finalSourceEqualitySampled=True,archiveEquality=True,postcloseQualified=True,actualPostcloseOuterCompletionCaptured=False,
            actualQaRootAcceptance='OWED_BEFORE_NEXT_HEAVY_ACTION')
    def dispatch(self,operation,inputs):
        need(operation in ('capture','negative','held','archive','final','gate','postclose'),'CONTROL_SCHEMA')
        return self.capture() if operation=='capture' else self.native(inputs) if operation=='held' else getattr(self,operation)(inputs)
    def finish(self):
        try:
            need(self.drain_step(),'OWNERSHIP_UNKNOWN');self.fs.finish()
        except BaseException as error:
            self.latch(P.reason(error));self.cleanup='OWNERSHIP_UNKNOWN';self.retain_foreground()

def validate_launch_control(value):
    keys=('schemaVersion','protocolVersion','unit','class','method','amendedPlanManifestSha256','loopback','tlsHost','relayPath','enrollmentNonce',
        'workBudgetNs','networkBudgetNs','totalBudgetNs','bodyByteCap','headerByteCap','chunkLineByteCap','trailerByteCap','frameByteCap','ackByteCap','commitByteCap')
    P.fields(value,keys)
    limits=dict(workBudgetNs=12000000000,networkBudgetNs=14000000000,totalBudgetNs=15000000000,bodyByteCap=262144,headerByteCap=16384,
        chunkLineByteCap=128,trailerByteCap=8192,frameByteCap=16384,ackByteCap=256,commitByteCap=512)
    need(type(value['schemaVersion']) is int and value['schemaVersion']==1 and type(value['protocolVersion']) is int and value['protocolVersion']==2
        and all(type(value[key]) is int and value[key]==number for key,number in limits.items()),'CONTROL_SCHEMA')
    need(all(value[key]==C.CONSTANTS[key] for key in ('unit','class','method'))
        and value['amendedPlanManifestSha256']=='d9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e'
        and value['loopback']=='127.0.0.1' and value['tlsHost']=='localhost' and value['relayPath']==RelayLoop.ENDPOINT
        and P.hash_value(value['enrollmentNonce']),'CONTROL_SCHEMA')
    return value

def synthetic_relay_qualified(value):
    need(type(value) is dict,'CHANNEL_UNQUALIFIED')
    need(all(value.get(key) is True for key in ('ready','channelMatched','qualified','eof','receiverLoopComplete'))
        and value.get('receiverThreadCreated') is False
        and all(type(value.get(key)) is int and value[key]==1 for key in ('enrollmentCount','dataCount','ackCount','commitCount'))
        and P.hash_value(value.get('projectionSha256'))
        and type(value.get('callerElapsedNs')) is int and type(value.get('conservativeElapsedNs')) is int
        and 0<=value['callerElapsedNs']<=value['conservativeElapsedNs']<15000000000,'CHANNEL_UNQUALIFIED')
    return True
