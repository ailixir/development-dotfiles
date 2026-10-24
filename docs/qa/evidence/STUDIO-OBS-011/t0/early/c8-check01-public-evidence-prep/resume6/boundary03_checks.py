"""Actual source03 functions under fake filesystem/socket/thread/clock boundaries.

Java parser/worker source is inspected, never executed. Native Java/TLS/provider proof
is expressly unexecuted. Original semantic case sets are checked without renaming cases.
"""
import ast
import base64
import builtins
import copy
import ctypes
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import selectors
import socket
import stat
import struct
import subprocess
import sys
import threading
import time
import types
from contextlib import ExitStack
from unittest.mock import patch

HERE=Path(__file__).absolute().parent
PRE={n:(HERE/n).read_bytes() for n in ('public_relay.py','public_contract.py','public_observation_unit.py','unit_policy.py',
    'test_fixtures.py','launch-control.template.json','observer-fragment.java.txt','pure-check-results.json','runtime-adapter-check-results.json')}
OLD={n:json.loads((HERE.parent/'resume2'/n).read_bytes()) for n in ('pure-check-results.json','runtime-adapter-check-results.json')}
R=types.ModuleType('_actual_relay03');C=types.ModuleType('_actual_contract03');A=types.ModuleType('_actual_adapter03');F={}
for name,module in [('public_relay.py',R),('public_contract.py',C),('public_observation_unit.py',A)]:
    exec(compile(PRE[name],'<prepared-'+name+'>','exec'),module.__dict__)
exec(compile(PRE['test_fixtures.py'],'<v2-fixtures>','exec'),F)
checks=[];blocked_calls=[]
def check(name, ok):
    assert ok is True,name
    checks.append(dict(name=name,pass_=True))
def denied(name, fn, reason=None):
    try: fn()
    except (ValueError,TypeError,KeyError,R.RelayHold,A.Hold,OSError) as error:
        check(name,reason is None or str(error)==reason)
    else: raise AssertionError(name)
def blocked(*args,**kwargs):
    blocked_calls.append('REAL_BOUNDARY');raise AssertionError('REAL_BOUNDARY')
def audit(event,args):
    if event in {'subprocess.Popen','os.system','os.fork','os.kill','socket.__new__','socket.connect','socket.bind','ctypes.dlopen'}:
        raise AssertionError('AUDIT_DENIED_'+event)
    if event=='open':
        target=args[0]
        if type(target) is str and target==str(HERE/'boundary03-check-results.json') and ('w' in str(args[1]) or args[2] & os.O_WRONLY): return
        raise AssertionError('AUDIT_DENIED_OPEN')


def info(inode,mode,uid=501):
    return types.SimpleNamespace(st_dev=1,st_ino=inode,st_mode=mode,st_uid=uid)
class Event:
    def __init__(self): self.value=False
    def set(self): self.value=True
    def is_set(self): return self.value
    def wait(self,seconds): return self.value
class Thread:
    def __init__(self, fn): self.fn=fn;self.alive=False;self.joins=[]
    def start(self): self.alive=True;self.fn();self.alive=False
    def join(self,seconds): self.joins.append(seconds)
    def is_alive(self): return self.alive
class Directory:
    def __init__(self,b,path):
        self.b,self.path,self.closed=b,path,False
        self.chain=[(None,'/',1,(1,1,stat.S_IFDIR|0o755,0)),(1,'leaf',2,(1,b.ids[path],stat.S_IFDIR|0o700,501))]
    def check(self):
        R.need(not self.closed and self.path not in self.b.swaps,'CUSTODY_SUBSTITUTION')
    def absent(self,name):
        self.check();return self.path+'/'+name not in self.b.nodes and self.path+'/'+name not in self.b.ids and self.path+'/'+name not in self.b.files
    def members(self):
        self.check();prefix=self.path+'/'
        return sorted(n[len(prefix):] for n in [*self.b.nodes,*self.b.files] if n.startswith(prefix) and '/' not in n[len(prefix):])
    def info(self,name):
        self.check();p=self.path+'/'+name
        if p in self.b.nodes:return self.b.nodes[p]
        if p in self.b.ids:return info(self.b.ids[p],stat.S_IFDIR|0o700)
        raise FileNotFoundError(p)
    def write(self,name,raw,mode=0o600):
        self.check();R.need(self.absent(name),'EXCLUSIVE_WRITE')
        self.b.files[self.path+'/'+name]=raw;self.b.writes.append((name,mode))
        if self.b.swap_on_write:self.b.swaps.add(self.path)
        self.check()
    def read(self,name,mode=None,cap=16777216):
        self.check();raw=self.b.files[self.path+'/'+name];R.need(len(raw)<=cap,'READ_CAP')
        return raw,info(900,stat.S_IFREG|mode)
    def close(self):
        if self.path in self.b.close_fail:raise OSError('CLOSE_FAIL')
        self.closed=True
class Selector:
    def __init__(self,b):self.b,self.entries=b,{}
    def modify(self,sock,event):
        if sock not in self.entries:raise KeyError()
        self.entries[sock]=event
    def register(self,sock,event):self.entries[sock]=event
    def select(self,seconds):
        R.need(0<seconds<=0.1,'SELECT_FINITE')
        self.b.now+=100
        return []
    def close(self):
        if 'selector' in self.b.close_fail:raise OSError('CLOSE_FAIL')
class Sock:
    def __init__(self,b,kind):self.b,self.kind,self.sent,self.closed=b,kind,bytearray(),False
    def setblocking(self,value):R.need(value is False,'NONBLOCKING')
    def set_inheritable(self,value):R.need(value is False,'NONINHERITABLE')
    def fileno(self):return 7 if self.kind=='listener' else 8
    def bind(self,path):
        R.need(path==R.ENDPOINT,'FIXED_ENDPOINT');self.b.nodes[path]=info(300,stat.S_IFSOCK|0o700)
    def listen(self,backlog):R.need(backlog==1,'ONE_BACKLOG')
    def getsockname(self):return R.ENDPOINT
    def accept(self):
        if self.b.accepted:raise BlockingIOError()
        self.b.accepted=True;return self.b.conn,None
    def getsockopt(self,level,name,size):
        R.need(level==0,'DARWIN_LEVEL')
        if name==1:return self.b.credentials
        if name==2:return self.b.pidraw
        raise OSError('OPTION')
    def recv(self,n):
        if self.b.read_block_once:self.b.read_block_once=False;raise BlockingIOError()
        out=self.b.incoming[:min(n,self.b.read_piece)]
        self.b.incoming=self.b.incoming[len(out):]
        return out
    def send(self,raw):
        if self.b.send_block_once:self.b.send_block_once=False;raise BlockingIOError()
        count=min(len(raw),self.b.write_piece);self.sent.extend(raw[:count]);return count
    def close(self):
        if self.kind in self.b.close_fail:raise OSError('CLOSE_FAIL')
        self.closed=True
class Boundary:
    platform='darwin'
    def __init__(self):
        self.now=1000;self.ids={'/private/tmp':10,'/output':11};self.nodes={};self.files={};self.writes=[]
        self.swaps=set();self.close_fail=set();self.swap_on_write=False
        self.credentials=struct.pack('=IIh2x16I',0,501,1,*([20]+[0]*15));self.pidraw=struct.pack('=i',40001)
        self.incoming=b'';self.accepted=False;self.read_piece=7;self.write_piece=5;self.read_block_once=True;self.send_block_once=True
        self.conn=Sock(self,'connection')
    def uid(self):return 501
    def clock(self):return self.now
    def event(self):return Event()
    def thread(self,fn):return Thread(fn)
    def selector(self):return Selector(self)
    def listener(self):return Sock(self,'listener')
    def fd_metadata(self,fd):return dict(dev=2,inode=fd,mode=stat.S_IFSOCK|0o700,uid=501)
    def mkdir_at(self,parent,name):
        parent.check();p=parent.path+'/'+name;R.need(p not in self.ids,'EXCLUSIVE_MKDIR');self.ids[p]=12
    def custody(self,path,mode=None):
        path=str(path)
        if path not in self.ids:raise FileNotFoundError(path)
        return Directory(self,path)

def control():
    value=json.loads(PRE['launch-control.template.json']);value['enrollmentNonce']='a'*64;return value

def make(observation=None):
    b=Boundary();output=b.custody('/output');parent=b.custody('/private/tmp')
    provenance={k:'c'*64 for k in C.PROVENANCE_FIELDS}
    r=R.Relay(b,b.custody,output,control(),'9'*64,provenance,C,A.sha,A.decode,
        lambda pid: dict(F['receipt'](b'',provenance)['peerIdentity']) if pid==40001 else (_ for _ in ()).throw(R.RelayHold('WRONG_SELECTED_PEER')),
        dict(ownerUid=501,outputChain=[list(x[3]) for x in output.chain],shortParentChain=[list(x[3]) for x in parent.chain],createShortExactly0700=True), A.Ownership().view())
    value=C.project('FAILED',{'outcome':'FAILED','errorCode':'LOGIN_REQUIRED'}) if observation is None else observation
    data=dict(protocolVersion=2,controlSha256='9'*64,enrollmentNonce='a'*64,observation=value,networkAccounting=value['networkAccounting'])
    projection=R.wire(value)+b'\n'
    commit=dict(protocolVersion=2,controlSha256='9'*64,projectionSha256=A.sha(projection),status='CALLER_SAW_CUSTODIED_ACK',callerElapsedNs=1000000)
    b.incoming=frame(data)+frame(commit)
    return b,r,data,commit,projection,provenance

def frame(value):
    raw=R.wire(value);return struct.pack('!I',len(raw))+raw

class Lock:
    def __enter__(self):return self
    def __exit__(self,*unused):return False

def effects_world():
    b=Boundary();b.ids[str(A.UNIT)]=20;b.ids[str(A.CONTROL)]=21
    provenance={k:'c'*64 for k in C.PROVENANCE_FIELDS}
    raw_control=A.packed(control());pin=A.sha(raw_control)
    observation=C.record('FINALIZING','NOT_REPRODUCED');raw=R.wire(observation)+b'\n'
    data=dict(protocolVersion=2,controlSha256=pin,enrollmentNonce='a'*64,observation=observation,networkAccounting=observation['networkAccounting'])
    commit=dict(protocolVersion=2,controlSha256=pin,projectionSha256=A.sha(raw),status='CALLER_SAW_CUSTODIED_ACK',callerElapsedNs=1000000)
    b.incoming=frame(data)+frame(commit)
    kernel=dict(pid=40001,ppid=40000,kernelStartSeconds=100,kernelStartMicroseconds=1,processImage='/synthetic/jdk/bin/java',uid=501,kernelIdentityComplete=True)
    class System:
        def custody(self,path,mode=None):return b.custody(str(path),mode)
        def read(self,path,mode=None,cap=16777216):return self.custody(Path(path).parent).read(Path(path).name,mode,cap)
        def relay_boundary(self,module):return b
        def process_identity(self,pid,path):return dict(kernel)
        def uid(self):return 501
    e=A.Effects.__new__(A.Effects);e.sys=System();e.v=A.Verified(e.sys);e.c=b.custody(str(A.CONTROL));e.unit=b.custody(str(A.UNIT))
    e.ownership=A.Ownership();e.loaded_local={};e.external_control_pins={};e.generated_control_buffers={};e.selected_lifecycle='SETUP_STARTED';e.selected_claim_sha=None;e.selected_authority_sha=None;e.custody_retained=False;e.relay=None;e.peer_lock=Lock();e.contract=C;e.plan=dict(javaHome='/synthetic/jdk')
    e.selected_worker=dict(kernel,identityComplete=True,testWorkerCandidate=True,start='synthetic-start',argvHash='4'*64,executableFileHash='5'*64)
    e.gaps=dict(resourceObservationGap=False)
    e.a=dict(releaseSha256='c'*64,launchControlBase64=base64.urlsafe_b64encode(raw_control).decode(),observerControlSha256=pin,
        artifactPins={'public_relay.py':A.sha(PRE['public_relay.py'])},collectorProvenance=provenance,
        relayCustody=dict(ownerUid=501,outputChain=[list(x[3]) for x in e.unit.chain],shortParentChain=[list(x[3]) for x in b.custody('/private/tmp').chain],createShortExactly0700=True))
    b.files[str(A.CONTROL/'public_relay.py')]=PRE['public_relay.py']
    b.files[str(A.CONTROL/'selected-consumed.json')]=A.packed(dict(phase='selected',releaseSha256=e.a['releaseSha256'],attemptCap=1))
    e.external_control_pins['selected-consumed.json']=A.sha(b.files[str(A.CONTROL/'selected-consumed.json')])
    e.utility=lambda *args: ('',dict(terminal=True,status=0))
    return b,e,kernel

def tests():
    # Existing 432 identities survive literal names, while schema2 fixtures are amended.
    for filename in OLD:
        old_names=[x['name'] for x in OLD[filename]['checks']]
        now=json.loads(PRE[filename]);names=[x['name'] for x in now['checks']]
        check('RETAIN_EXACT_SEMANTIC_IDENTITIES_'+filename,old_names==names and now['failed']==0)
    b,r,data,commit,raw,prov=make();ready=r.start();receipt=r.stop()
    check('ACTUAL_RELAY_END_TO_END_PROVISIONAL_ACK_COMMIT_DRAIN',ready['ready'] is True and receipt['qualified'] is True and receipt['threadTerminated'] is True)
    check('ACTUAL_RELAY_ONLY_ROOT_EXCLUSIVE0600_OUTPUT',b.writes==[('public-observation.json',0o600)] and b.files['/output/public-observation.json']==raw)
    check('ACTUAL_RELAY_COLLECTOR_REQUIRES_MATCHING_COMPLETE_RECEIPT',C.relay_qualified(receipt,raw,prov,True) is True)
    ack_size=struct.unpack('!I',b.conn.sent[:4])[0];ack=A.decode(bytes(b.conn.sent[4:]))
    check('ACTUAL_ACK_BOUNDED_EXACT_FIELDS',ack_size<=256 and set(ack)=={'protocolVersion','controlSha256','projectionSha256','status'} and ack['projectionSha256']==A.sha(raw))
    check('SOCKET_NODE_AND_FD_IDENTITIES_DISTINCT',receipt['socketNode']['inode']!=receipt['fdIdentities']['listener']['inode'])
    check('NO_SOCKET_BODY_READ_OR_UNLINK',set(b.files)=={'/output/public-observation.json'} and R.ENDPOINT in b.nodes)
    for status in ('NOT_REPRODUCED','NO_DECISION'):
        o=C.record('FINALIZING' if status=='NOT_REPRODUCED' else 'UNKNOWN',status)
        b,r,*unused=make(o);r.start();receipt=r.stop()
        check('ACTUAL_ZERO_REQUEST_'+status,receipt['qualified'] is True and C.validate_record(o)['networkAccounting']==C.network_not_started())
    # Feed malformed semantic inputs to the actual parser/validators, not detached constants.
    b,r,data,commit,raw,prov=make()
    for key,value in [('protocolVersion',True),('controlSha256','0'*64),('enrollmentNonce','b'*64),('extra','PRIVATE')]:
        altered=dict(data);altered[key]=value
        denied('ACTUAL_DATA_REJECT_'+key,lambda v=altered:r.validate_data(v))
    altered=copy.deepcopy(data);altered['networkAccounting']=C.network_not_started()
    denied('ACTUAL_DATA_REJECT_DISAGREEMENT',lambda:r.validate_data(altered))
    for key,value in [('schemaVersion',True),('protocolVersion',True),('loopback','::1'),('relayPath','/tmp/alternate'),('enrollmentNonce','business-id'),('frameByteCap',16385),('totalBudgetNs',15000000001),('extra','PRIVATE')]:
        altered=control();altered[key]=value
        denied('ACTUAL_CONTROL_REJECT_'+key,lambda v=altered:R.validate_control(v,C))
    for key,value in [('protocolVersion',True),('controlSha256','0'*64),('projectionSha256','0'*64),('status','ACK_ONLY'),('callerElapsedNs',True),('callerElapsedNs',15000000000),('callerElapsedNs',-1),('extra','PRIVATE')]:
        altered=dict(commit);altered[key]=value;r.data_at=b.now
        denied('ACTUAL_COMMIT_REJECT_'+key+'_'+str(value),lambda v=altered:r.validate_commit(v,A.sha(raw)))
    r.data_at=0;b.now=14999999999
    denied('ACTUAL_COMMIT_ADDS_ROOT_DURATION_CONSERVATIVELY',lambda:r.validate_commit(commit,A.sha(raw)),'CONSERVATIVE_COMMIT_DEADLINE')
    for rawbad in (b'{"x":1,"x":2}',b'\xff',b'{}{}',b'NaN'):
        denied('STRICT_PROTOCOL_JSON_'+str(rawbad),lambda v=rawbad:A.decode(v))
    for cap in (0,16385,4294967295):
        b,r,*unused=make();b.incoming=struct.pack('!I',cap);r.connection=b.conn;r.selector=b.selector()
        denied('ACTUAL_FRAME_REJECT_CAP_'+str(cap),lambda:r.read_frame(16384,b.now+1000000000),'FRAME_CAP')
    b,r,*unused=make();b.incoming=struct.pack('!I',10)+b'{}';r.connection=b.conn;r.selector=b.selector()
    denied('ACTUAL_FRAME_PARTIAL_EOF',lambda:r.read_frame(16384,b.now+1000000000),'FRAME_EOF')
    for badkind in ('uid','pid','size','groups','version','platform'):
        b,r,*unused=make()
        if badkind=='uid':b.credentials=struct.pack('=IIh2x16I',0,502,1,*([0]*16))
        if badkind=='pid':b.pidraw=struct.pack('=i',40002)
        if badkind=='size':b.credentials=b'x'
        if badkind=='groups':b.credentials=struct.pack('=IIh2x16I',0,501,17,*([0]*16))
        if badkind=='version':b.credentials=struct.pack('=IIh2x16I',1,501,1,*([0]*16))
        if badkind=='platform':b.platform='linux'
        r.start();receipt=r.stop()
        check('ACTUAL_PEER_REJECT_'+badkind,receipt['qualified'] is False and receipt['enrollmentCount']==1 and not b.writes)
    for kind in ('missing-commit','extra-frame','bad-nonce','bad-commit-hash','unresolved-network','bad-custody'):
        b,r,data,commit,raw,prov=make()
        if kind=='missing-commit':b.incoming=frame(data)
        if kind=='extra-frame':b.incoming+=b'X'
        if kind=='bad-nonce':data['enrollmentNonce']='b'*64;b.incoming=frame(data)+frame(commit)
        if kind=='bad-commit-hash':commit['projectionSha256']='0'*64;b.incoming=frame(data)+frame(commit)
        if kind=='unresolved-network':
            data['observation']['networkAccounting']['workerTermination']='UNRESOLVED';data['observation']['networkAccounting']['networkCompletionElapsedNs']=None;b.incoming=frame(data)+frame(commit)
        if kind=='bad-custody':b.swap_on_write=True
        try:
            r.start();receipt=r.stop()
        except R.RelayHold:receipt=dict(r.result,qualified=False)
        check('ACTUAL_PROTOCOL_FAIL_CLOSED_'+kind,receipt['qualified'] is False and C.relay_qualified(receipt,raw,prov,True) is False)
    for close in ('connection','listener','selector',R.SHORT,'/private/tmp'):
        b,r,*unused=make();b.close_fail.add(close);r.start()
        try:receipt=r.stop()
        except R.RelayHold:receipt=dict(r.result,qualified=False)
        check('ACTUAL_CLOSE_FAILURE_'+close,receipt['qualified'] is False or receipt.get('descriptorsClosed') is False)
    b,r,*unused=make();r.parent=b.custody('/private/tmp');b.mkdir_at(r.parent,'obs011-pub-observe01');r.short=b.custody(R.SHORT,0o700);r.short_identity=R.metadata(r.parent.info('obs011-pub-observe01'))
    r.stop_event.set();r.serve();receipt=r.stop()
    check('ACTUAL_NO_RECORD_NORMAL_STOP_FINITE_NO_CAPTURE',receipt['enrollmentCount']==0 and receipt['qualified'] is False and receipt['failure'] is False and receipt['descriptorsClosed'] is True)
    b,r,*unused=make();r.thread=Thread(lambda:None);r.thread.alive=True;receipt=r.stop()
    check('ACTUAL_UNRESOLVED_THREAD_RETAINED_HOLD',r.thread.is_alive() is True and r.thread.joins==[5] and receipt['threadTerminated'] is False and receipt['qualified'] is False)
    # Complete receipt fails on any missing/late/unclosed/foreign provenance fact.
    b,r,data,commit,raw,prov=make();r.start();receipt=r.stop()
    for key,value in [('callerAckConfirmed',False),('peerEofObserved',False),('threadTerminated',False),('descriptorsClosed',False),('qualified',False),('failure',True),('commitCount',0),('enrollmentCount',2),('callerElapsedNs',True),('conservativeElapsedNs',15000000000),('projectionSha256','0'*64),('codePins',{})]:
        bad=copy.deepcopy(receipt);bad[key]=value
        check('ACTUAL_COLLECTOR_DENY_'+key,C.relay_qualified(bad,raw,prov,True) is False)
    check('ACTUAL_COLLECTOR_NO_NATIVE_DRAIN',C.relay_qualified(receipt,raw,prov,False) is False)
    check('ACTUAL_PROVISIONAL_FILE_ALONE_UNAVAILABLE',C.collect_records([raw],prov,dict(prov))['publicObservation']['captureStatus']=='UNAVAILABLE')
    for key,value in [('workerTermination','UNRESOLVED'),('acquiredSockets',3),('successfulSocketCloses',1),('connectCalls',0),('requestStarts',True),('requestCompleted',False),('deadlineExceeded',True),('callerInterrupted',True),('networkCompletionElapsedNs',None)]:
        observation=C.project('FAILED',{'outcome':'FAILED','errorCode':'LOGIN_REQUIRED'});observation['networkAccounting'][key]=value
        denied('ACTUAL_NETWORK_DENY_'+key,lambda v=observation:C.validate_record(v))
    b,e,kernel=effects_world();e.start_relay();receipt=e.stop_relay();e.verify_relay_closed_namespace()
    check('ACTUAL_ADAPTER_RELAY_LAUNCH_AND_STOP_COMPOSITION',receipt['qualified'] is True and e.gaps['resourceObservationGap'] is False and str(A.CONTROL/'relay-ready.json') in b.files and str(A.CONTROL/'relay-drain.json') in b.files)
    check('ACTUAL_ADAPTER_PEER_RETURNS_EXACT_CURRENT_KERNEL',e.relay_peer(40001)['kernelStartSeconds']==100)
    denied('ACTUAL_ADAPTER_NO_ANY_JAVA_PEER',lambda:e.relay_peer(40002),'EXACT_SELECTED_PEER_NOT_RECORDED')
    e.selected_worker['kernelStartMicroseconds']=2
    denied('ACTUAL_ADAPTER_PEER_PID_REUSE_DENIED',lambda:e.relay_peer(40001),'SELECTED_PEER_KERNEL_REUSED')
    b,e,kernel=effects_world();e.a['observerControlSha256']='0'*64
    denied('ACTUAL_ADAPTER_LAUNCH_PIN_CHECKED_BEFORE_RELAY',e.start_relay,'LAUNCH_CONTROL_PIN')
    check('ACTUAL_ADAPTER_BAD_PIN_NO_SHORT_DIRECTORY',R.SHORT not in b.ids)
    b,e,kernel=effects_world();del b.files[str(A.CONTROL/'selected-consumed.json')]
    denied('ACTUAL_ADAPTER_SELECTED_SETUP_CAP_BEFORE_START',e.start_relay)
    b,e,kernel=effects_world();e.start_relay();e.stop_relay();b.nodes[R.ENDPOINT]=info(999,stat.S_IFSOCK|0o700)
    denied('ACTUAL_ADAPTER_CLOSED_SOCKET_METADATA_REPLACEMENT',e.verify_relay_closed_namespace,'CLOSED_SOCKET_NODE_METADATA')
    b,e,kernel=effects_world();e.start_relay();e.stop_relay();e.utility=lambda *args: ('p40001\nf3\nn'+R.ENDPOINT,dict(terminal=True,status=0))
    denied('ACTUAL_ADAPTER_POSTCLOSE_ACTIVE_UNIX_DESCRIPTOR',e.verify_relay_closed_namespace,'RELAY_SOCKET_DESCRIPTOR_STILL_OPEN')
    lock='p102\nf3\ni20\nlW\nn/owned/gradle.lock\n'
    check('ACTUAL_LOCK_ASSOCIATED_PID_FD_INODE_NAME',A.validate_lock_fields(lock,102,3,20,'/owned/gradle.lock') is True)
    for name,bad in [('wrong-pid',lock.replace('p102','p103')),('fd-access-suffix',lock.replace('f3','f3u')),('cross-file',lock.replace('i20','f4\ni20')),('wrong-name',lock.replace('/owned/gradle.lock','/other')),('duplicate-inode',lock+'i20\n'),('missing-fd',lock.replace('f3\n',''))]:
        denied('ACTUAL_LOCK_ASSOCIATION_REJECT_'+name,lambda v=bad:A.validate_lock_fields(v,102,3,20,'/owned/gradle.lock'))
    # Java source checks are explicit SOURCE/API checks, never native parser/timeout proof.
    java=PRE['observer-fragment.java.txt'].decode()
    check('JAVA_RAW_SOCKET_SINGLE_CONNECT_REQUEST_NO_HTTPCLIENT',java.count('raw.connect(')==1 and java.count('requests++;')==1 and 'HttpClient' not in java and 'new java.net.Socket(java.net.Proxy.NO_PROXY)' in java)
    check('JAVA_CAPS_PRECEDE_ARRAYCOPY',java.index('n > body.length - count')<java.index('System.arraycopy(transfer') and 'new byte[262144]' in java and 'new byte[8192]' in java and 'ByteArrayOutputStream' not in java and 'readAllBytes' not in java)
    check('JAVA_ACTUAL_THREAD_JOIN_NO_ASSERTION_SOCKET_CLOSE',java.count('thread.join(')==1 and '!worker.isAlive()' in java and 'exchange.closes == exchange.acquired' in java and 'P3_PUBLIC_OWNED.add(exchange)' in java and 'cancellation.compareAndSet(false,true)' in java)
    check('JAVA_NO_FILESYSTEM_OUTPUT_AND_COMMIT_AFTER_ACK', 'Files.' not in java and 'p3WritePublicObservation' not in java and java.index('JsonNode ack =')<java.index('ObjectNode commit =') and 'networkClosed' in java)
    check('JAVA_SAME_DEADLINE_BOUNDED_UNIX_IO','15000000000L - (System.nanoTime() - start)' in java and 's.select(Math.max(1,Math.min(100,' in java and 'StandardProtocolFamily.UNIX' in java and 'COMMIT_LATE' in java)
    check('ZERO_REAL_BOUNDARY_CALLS',blocked_calls==[])

# Audit remains installed through result output. All actual boundaries are denied too.
sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','write_bytes','write_text')),
        (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','unlink','fsync','kill','fork','system','getpid','getppid','getuid')),
        (socket,('socket','create_connection')),(selectors,('DefaultSelector',)),(threading,('Thread','Event','Lock')),
        (subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,blocked))
    tests()
result=dict(kind='SOURCE03_ACTUAL_RELAY_AND_CONTRACT_GUARDED_FUNCTION_CHECKS',passed=len(checks),failed=0,
    checks=[dict(name=x['name'],**{'pass':x['pass_']}) for x in checks],sourceSha256Pins={k:hashlib.sha256(v).hexdigest() for k,v in PRE.items()},realBoundaryCalls=blocked_calls,
    JavaOrNativeExecuted=False,actualSourceRuntimePrivateKernelOrNamespaceActions=0,
    JavaBoundaryCompatibilityAndNativeQualification='UNEXECUTED_OWED',executionReady=False)
(HERE/'boundary03-check-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
