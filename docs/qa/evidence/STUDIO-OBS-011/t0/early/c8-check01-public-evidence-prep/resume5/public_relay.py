"""Prospective Darwin-only sole-writer relay. Import has no effects. No executable main.

All effects enter Boundary/Custody explicitly. Only one owned thread and one enrollment.
The fixed short socket node is archived as metadata, never opened, hashed or unlinked.
"""
import json
import os
import re
import selectors
import socket
import stat
import struct
import sys
import threading
import time

SHORT = '/private/tmp/obs011-pub-observe01'
ENDPOINT = SHORT + '/r.sock'
CONTROL_FIELDS = frozenset(('schemaVersion','protocolVersion','unit','class','method','amendedPlanManifestSha256','loopback','tlsHost','relayPath','enrollmentNonce','workBudgetNs','networkBudgetNs','totalBudgetNs','bodyByteCap','headerByteCap','chunkLineByteCap','trailerByteCap','frameByteCap','ackByteCap','commitByteCap'))
LIMITS = dict(workBudgetNs=12000000000, networkBudgetNs=14000000000, totalBudgetNs=15000000000,
              bodyByteCap=262144, headerByteCap=16384, chunkLineByteCap=128, trailerByteCap=8192,
              frameByteCap=16384, ackByteCap=256, commitByteCap=512)


class RelayHold(Exception):
    pass


def need(value, reason):
    if value is not True:
        raise RelayHold(reason)


def wire(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def validate_control(value, contract):
    need(type(value) is dict and set(value) == CONTROL_FIELDS, 'CONTROL_FIELDS')
    need(type(value['schemaVersion']) is int and value['schemaVersion'] == 1 and
         type(value['protocolVersion']) is int and value['protocolVersion'] == 2, 'CONTROL_VERSION')
    need(all(type(value.get(k)) is int and value[k] == v for k,v in LIMITS.items()), 'CONTROL_LIMITS')
    need(all(value.get(k) == contract.CONSTANTS[k] for k in ('unit','class','method')), 'CONTROL_IDENTITY')
    need(value['amendedPlanManifestSha256'] == 'd9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e'
         and value['loopback'] == '127.0.0.1' and value['tlsHost'] == 'localhost' and value['relayPath'] == ENDPOINT,
         'CONTROL_FIXED_TRANSPORT')
    need(type(value['enrollmentNonce']) is str and re.fullmatch('[0-9a-f]{64}',value['enrollmentNonce']) is not None, 'CONTROL_NONCE')
    return value


def peer_credentials(sock, platform):
    need(platform == 'darwin', 'DARWIN_PEER_ABI_REQUIRED')
    credential = sock.getsockopt(0, 1, 76)
    pidraw = sock.getsockopt(0, 2, 4)
    need(type(credential) is bytes and len(credential) == 76 and type(pidraw) is bytes and len(pidraw) == 4, 'PEER_ABI_SIZE')
    version, uid, groups = struct.unpack_from('=IIh',credential)
    pid = struct.unpack('=i',pidraw)[0]
    need(version == 0 and 0 <= groups <= 16 and pid > 0, 'PEER_ABI_VALUES')
    return uid,pid


def metadata(info):
    return dict(dev=info.st_dev, inode=info.st_ino, mode=info.st_mode, uid=info.st_uid)


class Boundary:
    platform = sys.platform
    def clock(self): return time.monotonic_ns()
    def uid(self): return os.getuid()
    def event(self): return threading.Event()
    def thread(self, callback): return threading.Thread(target=callback,name='public-observer-output-relay',daemon=False)
    def selector(self): return selectors.DefaultSelector()
    def listener(self): return socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
    def fd_metadata(self, fd): return metadata(os.fstat(fd))
    def mkdir_at(self, custody, name):
        custody.check()
        os.mkdir(name,0o700,dir_fd=custody.fd)
        custody.check()


class Relay:
    def __init__(self, boundary, custody_factory, output, control, control_sha, code_pins,
                 contract, digest, decode, peer_verifier, root_custody):
        self.b,self.custody_factory,self.output = boundary,custody_factory,output
        self.control,self.control_sha,self.pins = validate_control(control,contract),control_sha,code_pins
        self.contract,self.digest,self.decode,self.peer_verifier,self.root_custody = contract,digest,decode,peer_verifier,root_custody
        self.stop_event,self.ready,self.thread = self.b.event(),self.b.event(),None
        self.listener,self.connection,self.selector,self.short,self.parent = None,None,None,None,None
        self.fd_identities,self.close_outcomes,self.node,self.short_identity = {},{},None,None
        self.result = dict(protocolVersion=2, controlSha256=control_sha, codePins=code_pins,
                           ready=False, custodyConfirmed=False, enrollmentCount=0, dataCount=0, ackCount=0,
                           commitCount=0, callerAckConfirmed=False, callerElapsedNs=None, conservativeElapsedNs=None,
                           peerEofObserved=False, qualified=False, threadTerminated=False, descriptorsClosed=False,
                           stopRequested=False, failure=False, projectionSha256=None, peerIdentity=None,
                           shortNamespace=None, socketNode=None, fdIdentities={}, closeOutcomes={})
        self.data_at = None
        self.join_confirmed = False

    def check_custody(self):
        self.output.check()
        # Actual retained ancestor identities must equal the separately root-approved chain.
        actual = [list(entry[3]) for entry in self.output.chain]
        need(actual == self.root_custody['outputChain'], 'ROOT_OUTPUT_CHAIN')
        need(self.b.uid() == self.root_custody['ownerUid'], 'ROOT_OWNER')
        if self.parent is not None:
            self.parent.check()
            need([list(entry[3]) for entry in self.parent.chain] == self.root_custody['shortParentChain'], 'ROOT_SHORT_PARENT_CHAIN')
        if self.short is not None:
            self.short.check()
            need(metadata(self.parent.info('obs011-pub-observe01')) == self.short_identity, 'SHORT_NAME_CHANGED')
        if self.node is not None:
            need(metadata(self.short.info('r.sock')) == self.node, 'SOCKET_NODE_CHANGED')

    def start(self):
        need(self.thread is None, 'ONE_RELAY_THREAD')
        self.check_custody()
        self.parent = self.custody_factory('/private/tmp')
        self.check_custody()
        need(self.root_custody.get('createShortExactly0700') is True and self.parent.absent('obs011-pub-observe01'), 'UNUSED_SHORT_NAMESPACE')
        self.b.mkdir_at(self.parent,'obs011-pub-observe01')
        self.short = self.custody_factory(SHORT,0o700)
        self.short_identity = metadata(self.parent.info('obs011-pub-observe01'))
        need(stat.S_ISDIR(self.short_identity['mode']) and stat.S_IMODE(self.short_identity['mode']) == 0o700
             and self.short_identity['uid'] == self.b.uid() and self.short.members() == [], 'NEW_SHORT_CUSTODY')
        self.check_custody()
        self.thread = self.b.thread(self.serve)
        self.thread.start()
        need(self.ready.wait(5) is True and self.result['ready'] is True, 'RELAY_READY_NOT_CONFIRMED')
        self.check_custody()
        return dict(self.result)

    def wait_io(self, stream, events, deadline):
        need(not self.stop_event.is_set() and self.b.clock() < deadline, 'RELAY_STOP_OR_DEADLINE')
        try: self.selector.modify(stream,events)
        except KeyError: self.selector.register(stream,events)
        left = deadline-self.b.clock()
        need(left > 0, 'RELAY_DEADLINE')
        self.selector.select(min(0.1,left/1e9))
        self.check_custody()
        need(not self.stop_event.is_set() and self.b.clock() < deadline, 'RELAY_IO_OVERRUN')

    def exact_read(self, amount, deadline):
        need(type(amount) is int and 0 <= amount <= 16384, 'READ_CAP')
        out=bytearray()
        while len(out)<amount:
            self.wait_io(self.connection,selectors.EVENT_READ,deadline)
            try: piece=self.connection.recv(amount-len(out))
            except BlockingIOError: continue
            need(type(piece) is bytes and 0<len(piece)<=amount-len(out), 'FRAME_EOF')
            out.extend(piece)
        return bytes(out)

    def read_frame(self, cap, deadline):
        size=struct.unpack('!I',self.exact_read(4,deadline))[0]
        need(0<size<=cap, 'FRAME_CAP')
        return self.decode(self.exact_read(size,deadline))

    def write_frame(self, value, cap, deadline):
        raw=wire(value); need(0<len(raw)<=cap,'FRAME_WRITE_CAP')
        framed=struct.pack('!I',len(raw))+raw
        offset=0
        while offset<len(framed):
            self.wait_io(self.connection,selectors.EVENT_WRITE,deadline)
            try: count=self.connection.send(framed[offset:])
            except BlockingIOError: continue
            need(type(count) is int and 0<count<=len(framed)-offset,'FRAME_SHORT_WRITE')
            offset+=count
        need(self.b.clock()<deadline,'FRAME_WRITE_LATE')

    def validate_data(self,data):
        need(type(data) is dict and set(data)=={'protocolVersion','controlSha256','enrollmentNonce','observation','networkAccounting'},'DATA_FIELDS')
        need(type(data['protocolVersion']) is int and data['protocolVersion']==2
             and data['controlSha256']==self.control_sha and data['enrollmentNonce']==self.control['enrollmentNonce'],'DATA_BINDING')
        observation=self.contract.validate_record(data['observation'])
        need(data['networkAccounting']==observation['networkAccounting'],'DATA_ACCOUNTING')
        return observation

    def validate_commit(self,commit,projection_sha):
        need(type(commit) is dict and set(commit)=={'protocolVersion','controlSha256','projectionSha256','status','callerElapsedNs'},'COMMIT_FIELDS')
        need(type(commit['protocolVersion']) is int and commit['protocolVersion']==2 and commit['controlSha256']==self.control_sha
             and commit['projectionSha256']==projection_sha and commit['status']=='CALLER_SAW_CUSTODIED_ACK'
             and type(commit['callerElapsedNs']) is int and 0<=commit['callerElapsedNs']<15000000000,'COMMIT_BINDING')
        # Conservative duration adds the FULL root DATA->COMMIT interval to the caller's
        # elapsed assertion. It overcounts earlier handoff time rather than admitting late send.
        bound=commit['callerElapsedNs']+(self.b.clock()-self.data_at)
        need(0<=bound<15000000000,'CONSERVATIVE_COMMIT_DEADLINE')
        return bound

    def serve(self):
        try:
            self.check_custody()
            self.selector=self.b.selector()
            self.listener=self.b.listener(); self.listener.set_inheritable(False); self.listener.setblocking(False)
            self.fd_identities['listener']=self.b.fd_metadata(self.listener.fileno())
            self.listener.bind(ENDPOINT)
            self.node=metadata(self.short.info('r.sock'))
            need(stat.S_ISSOCK(self.node['mode']) and self.node['uid']==self.b.uid(),'SOCKET_NODE_TYPE_OWNER')
            self.listener.listen(1)
            need(self.listener.getsockname()==ENDPOINT,'LISTENER_NAME')
            self.check_custody(); self.result['ready']=True; self.ready.set()
            # No-record native runs can exceed15s. Each readiness poll is <=100ms and
            # the native BaseException finally requests stop. A connection has one15s cap.
            while not self.stop_event.is_set():
                self.wait_io(self.listener,selectors.EVENT_READ,self.b.clock()+1000000000)
                try: self.connection,unused=self.listener.accept()
                except BlockingIOError: continue
                break
            if self.connection is None: return
            self.result['enrollmentCount']=1
            self.connection.set_inheritable(False); self.connection.setblocking(False)
            self.fd_identities['connection']=self.b.fd_metadata(self.connection.fileno())
            self.check_custody()
            uid,pid=peer_credentials(self.connection,self.b.platform)
            need(uid==self.root_custody['ownerUid'],'PEER_UID')
            self.result['peerIdentity']=self.peer_verifier(pid)
            self.check_custody()
            self.data_at=self.b.clock(); deadline=self.data_at+15000000000
            data=self.read_frame(16384,deadline)
            observation=self.validate_data(data); self.result['dataCount']=1
            raw=wire(observation)+b'\n'; projection_sha=self.digest(raw)
            self.check_custody(); self.output.write('public-observation.json',raw,0o600); self.check_custody()
            # Custody.write returns only after fsync/close; re-read same fixed public
            # regular member with custody to bind the actual closed bytes/name.
            read,unused=self.output.read('public-observation.json',0o600,16384)
            need(read==raw,'CLOSED_PROVISIONAL_CHANGED')
            self.check_custody(); self.result['custodyConfirmed']=True; self.result['projectionSha256']=projection_sha
            ack=dict(protocolVersion=2,controlSha256=self.control_sha,projectionSha256=projection_sha,status='WRITTEN_CUSTODIED')
            self.write_frame(ack,256,deadline); self.result['ackCount']=1
            commit=self.read_frame(512,deadline)
            bound=self.validate_commit(commit,projection_sha)
            self.result.update(commitCount=1,callerAckConfirmed=True,callerElapsedNs=commit['callerElapsedNs'],conservativeElapsedNs=bound)
            self.wait_io(self.connection,selectors.EVENT_READ,deadline)
            try: extra=self.connection.recv(1)
            except BlockingIOError: raise RelayHold('COMMIT_EOF_NOT_CONFIRMED')
            need(extra==b'','EXTRA_FRAME_OR_BYTES')
            self.result['peerEofObserved']=True
            self.contract.validate_network(observation['networkAccounting'],observation)
            need(self.contract.network_closed(observation['networkAccounting']),'NETWORK_UNRESOLVED')
            self.check_custody(); self.result['qualified']=True
        except BaseException:
            self.result['failure']=not (self.stop_event.is_set() and self.result['enrollmentCount']==0)
            self.result['qualified']=False
        finally:
            for name in ('connection','listener','selector'):
                resource=getattr(self,name)
                if resource is not None:
                    try: resource.close(); self.close_outcomes[name]=True
                    except BaseException: self.close_outcomes[name]=False
            try: self.check_custody()
            except BaseException: self.result['failure']=True; self.result['qualified']=False
            self.result.update(shortNamespace=self.short_identity,socketNode=self.node,fdIdentities=self.fd_identities,closeOutcomes=dict(self.close_outcomes))
            self.ready.set()

    def refresh_closure(self):
        # Complete closure covers EVERY actually acquired resource, including directory
        # custody. Neither an empty socket subset nor a copied error receipt is proof.
        try:
            terminated = self.thread is None or (self.join_confirmed is True and self.thread.is_alive() is False)
        except BaseException:
            terminated = False
        acquired = [name for name in ('connection','listener','selector','short','parent')
                    if getattr(self,name) is not None]
        closed = terminated and all(self.close_outcomes.get(name) is True for name in acquired)
        self.result.update(threadTerminated=terminated, descriptorsClosed=closed,
                           closeOutcomes=dict(self.close_outcomes),shortNamespace=self.short_identity,
                           socketNode=self.node,fdIdentities=dict(self.fd_identities))
        if not terminated or not closed:
            self.result.update(failure=True,qualified=False)
        return dict(self.result)

    def stop(self):
        self.result.update(stopRequested=True,descriptorsClosed=False)
        self.stop_event.set()
        try:
            if self.thread is not None:
                self.thread.join(5)
                self.join_confirmed = self.thread.is_alive() is False
            else:
                self.join_confirmed = True
            # Only the owning serve thread closes sockets/selector. Caller never forces
            # another thread's resources closed, even after an unsuccessful bounded join.
            socket_names = [n for n in ('connection','listener','selector') if getattr(self,n) is not None]
            if not self.join_confirmed or not all(self.close_outcomes.get(n) is True for n in socket_names):
                self.result.update(failure=True,qualified=False)
                return self.refresh_closure()
            self.check_custody()
            for name in ('short','parent'):
                resource = getattr(self,name)
                if resource is not None:
                    try:
                        resource.close()
                        self.close_outcomes[name] = True
                    except BaseException:
                        self.close_outcomes[name] = False
                        self.result.update(failure=True,qualified=False)
            return self.refresh_closure()
        except BaseException:
            # Update the ACTUAL owned object before any outer error snapshot/publication.
            self.result.update(failure=True,qualified=False)
            self.refresh_closure()
            raise
