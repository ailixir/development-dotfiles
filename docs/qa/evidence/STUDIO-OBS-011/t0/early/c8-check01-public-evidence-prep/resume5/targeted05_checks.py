"""Only the two source04 findings: actual optimized loader and partial start/stop/main.

Prepared source only. All adapter execution/FD/path/OS/process/thread/socket boundaries are
fakes; actual loader bytes are compiled in-memory with optimize0/1. No Python child executes.
"""
import ast
import base64
import builtins
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
from pathlib import Path,PurePosixPath
import re
import shlex
import selectors
import socket
import stat
import struct
import subprocess
import sys
import threading
import time
import types
import xml.parsers.expat
from contextlib import ExitStack
from unittest.mock import patch

HERE=Path(__file__).absolute().parent
PRE={n:(HERE/n).read_bytes() for n in ('entry-loader.py.txt','guard-public-observe.bash','public_observation_unit.py','public_relay.py')}
A={'__name__':'_source05_actual_adapter','__file__':'<inactive05>'};R=types.ModuleType('_source05_actual_relay')
exec(compile(PRE['public_observation_unit.py'],'<prepared05-adapter>','exec'),A)
exec(compile(PRE['public_relay.py'],'<prepared05-relay>','exec'),R.__dict__)
checks=[];loader_cases=[];custody_cases=[];blocked_calls=[]
def sha(raw):return hashlib.sha256(raw).hexdigest()
def check(name,value):
    if value is not True:raise AssertionError(name)
    checks.append(dict(name=name,**{'pass':True}))
def blocked(*args,**kwargs):
    blocked_calls.append('REAL_BOUNDARY');raise AssertionError('REAL_BOUNDARY')
def audit(event,args):
    if event=='open':
        if type(args[0]) is str and args[0]==str(HERE/'targeted05-check-results.json') and ('w' in str(args[1]) or args[2]&os.O_WRONLY):return
        raise AssertionError('AUDIT_DENIED_OPEN')
    if event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.fork','os.kill','os.system')):
        raise AssertionError('AUDIT_DENIED_'+event)

class LoaderOS:
    O_RDONLY=os.O_RDONLY;O_DIRECTORY=os.O_DIRECTORY;O_NOFOLLOW=os.O_NOFOLLOW
    def __init__(self,raw,case):self.raw,self.case,self.fd,self.offset,self.calls,self.closed=raw,case,0,0,0,[]
    def open(self,path,flags,dir_fd=None):self.fd+=1;return self.fd
    def fstat(self,fd):
        self.calls+=1
        return types.SimpleNamespace(st_mode=(stat.S_IFDIR if self.case=='nonregular' else stat.S_IFREG)|(0o644 if self.case=='wrongmode' else 0o600),
            st_uid=502 if self.case=='wronguid' else 501,st_size=1048577 if self.case=='oversize' else len(self.raw),
            st_dev=1,st_ino=8 if self.case=='changedidentity' and self.calls>1 else 7,st_mtime_ns=10,st_ctime_ns=11)
    def read(self,fd,count):
        if self.case=='shortread':return b''
        piece=self.raw[self.offset:self.offset+count];self.offset+=len(piece);return piece
    def close(self,fd):self.closed.append(fd)
    def getuid(self):return 501

def loader_tests():
    loader=PRE['entry-loader.py.txt'].decode();guard=PRE['guard-public-observe.bash'].decode()
    check('COMMON_LITERAL_ALL_ENTRY_PATHS_EQUAL',guard.split("readonly C8_PUBLIC_CONTROL_LOADER='\n",1)[1].split("\n'\nexit()",1)[0]+'\n'==loader)
    check('NO_REMOVABLE_BOOTSTRAP_ASSERT_NODES',not any(isinstance(n,ast.Assert) for n in ast.walk(ast.parse(loader))))
    for opt in (0,1):
        for case in ('valid','wrongsha','wronguid','wrongmode','nonregular','oversize','changedidentity','shortread','traversal','unknownmode','missingarguments'):
            payload=b'raise RuntimeError("INTERCEPTED_SYNTHETIC_ADAPTER_NEVER_RUN")\n'
            api=LoaderOS(payload,case);calls=[]
            argv=['-c','/owned/control/public_observation_unit.py','0'*64 if case=='wrongsha' else sha(payload),'selected','a'*64,'entry-0001-pins.json','b'*64]
            if case=='traversal':argv[1]='/owned/../control.py'
            if case=='unknownmode':argv[3]='unreviewed'
            if case=='missingarguments':argv=argv[:3]
            fsys=types.SimpleNamespace(argv=argv)
            modules={'os':api,'stat':stat,'sys':fsys,'hashlib':hashlib}
            def fakeimport(name,*args,**kwargs):
                if name not in modules:raise AssertionError('UNEXPECTED_IMPORT')
                return modules[name]
            def intercept_compile(raw,path,mode):calls.append(('compile',raw,path,mode));return ('INTERCEPTED',raw)
            def intercept_exec(code,namespace):calls.append(('exec',code))
            safe=dict(vars(builtins),__import__=fakeimport,compile=intercept_compile,exec=intercept_exec)
            try:exec(compile(loader,'<actual-source05-loader-fake-boundaries>','exec',optimize=opt),{'__builtins__':safe})
            except (RuntimeError,ValueError,TypeError):accepted=False
            else:accepted=True
            check('LOADER_OPT'+str(opt)+'_'+case,accepted==(case=='valid') and bool(calls)==(case=='valid'))
            check('LOADER_ALL_OPENED_CUSTODY_CLOSED_OPT'+str(opt)+'_'+case,api.closed==list(range(api.fd,0,-1)))
            if case=='valid':check('LOADER_SAME_BUFFER_AND_MODE_FORWARD_OPT'+str(opt),calls[0][1]==payload and fsys.argv==argv[1:2]+argv[3:])
            loader_cases.append(dict(optimize=opt,case=case,accepted=accepted,adapterCompileRequested=bool(calls),adapterExecutionIntercepted=True))

class Event:
    def set(self):pass
    def wait(self,seconds):return True
    def is_set(self):return False
class Custody:
    def __init__(self,tag,key):self.tag,self.chain,self.closed,self.nodes=tag,[(None,'/',1,key)],False,{}
    def check(self):pass
    def absent(self,name):return name not in self.nodes
    def info(self,name):return self.nodes[name]
    def members(self):return list(self.nodes)
    def close(self):self.closed=True

def custody_tests():
    for case in ('joined-closed','closed-protocol-failure','parent-chain-rejected','poststart-output-check-failed',
                 'parent-close-failed','short-close-failed','live-thread','unknown-thread','join-failed','ready-unconfirmed'):
        key=(1,7,stat.S_IFDIR|0o700,501)
        output=Custody('output',key);parent=Custody('parent',key);short=Custody('short',key)
        root=dict(ownerUid=501,outputChain=[list(key)],shortParentChain=[list(key)],createShortExactly0700=True)
        if case=='parent-chain-rejected':root['shortParentChain']=[[9,9,stat.S_IFDIR|0o700,501]]
        class Boundary:
            def uid(self):return 501
            def event(self):return Event()
            def mkdir_at(self,c,name):c.nodes[name]=types.SimpleNamespace(st_dev=1,st_ino=7,st_mode=stat.S_IFDIR|0o700,st_uid=501)
            def thread(self,callback):
                class Thread:
                    def start(self):relay.result['ready']=case!='ready-unconfirmed'
                    def join(self,seconds):
                        if case=='join-failed':raise OSError('SYNTHETIC_JOIN_UNKNOWN')
                    def is_alive(self):
                        if case=='unknown-thread':raise OSError('SYNTHETIC_THREAD_OBSERVATION_UNKNOWN')
                        return case in ('live-thread','ready-unconfirmed')
                return Thread()
        control=dict(schemaVersion=1,protocolVersion=2,unit='u',**{'class':'c','method':'m'},
            amendedPlanManifestSha256='d9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e',
            loopback='127.0.0.1',tlsHost='localhost',relayPath=R.ENDPOINT,enrollmentNonce='a'*64,**R.LIMITS)
        contract=types.SimpleNamespace(CONSTANTS={'unit':'u','class':'c','method':'m'})
        relay=R.Relay(Boundary(),lambda path,mode=None:parent if str(path)=='/private/tmp' else short,
                      output,control,'b'*64,{},contract,sha,lambda raw:{},lambda pid:{},root)
        e=A['Effects'].__new__(A['Effects']);e.relay=relay;e.c=Custody('control',key);e.unit=output
        e.gaps={};e.client={'pid':500,'start':'FAKE_START','identityComplete':True};e.a={'releaseSha256':'a'*64}
        e.registration_complete=True;e.custody_retained=False;e.records=[]
        def write_once(name,value):e.records.append((name,copy.deepcopy(value)));e.c.nodes[name]=value
        e.write_once=write_once;e.register=lambda mode:None
        e.sys=types.SimpleNamespace(stdin_devnull=lambda:True,cwd=lambda:str(A['ROOT']))
        def operate(effects,mode,arg):
            try:relay.start()
            except R.RelayHold:pass
            if case=='poststart-output-check-failed':
                def failcheck():raise R.RelayHold('SYNTHETIC_CHANGED_OUTPUT_CHAIN')
                output.check=failcheck
            if case in ('parent-close-failed','short-close-failed'):
                def failclose():raise OSError('SYNTHETIC_CLOSE_UNKNOWN')
                (parent if case=='parent-close-failed' else short).close=failclose
            if case=='closed-protocol-failure':relay.result.update(failure=True,qualified=False)
            # Reproduce the stale-flag eligibility explicitly; actual stop MUST reset it.
            if case in ('parent-chain-rejected','poststart-output-check-failed'):
                relay.result.update(threadTerminated=True,descriptorsClosed=True)
            effects.stop_relay()
            return 0 if case=='joined-closed' else 1
        with patch.dict(A,{'__file__':str(A['CONTROL']/'public_observation_unit.py'),'load':lambda *args:e,'operate':operate}):
            try:status=A['main'](['selected','a'*64,'entry-0001-pins.json','b'*64],e.sys);held=False
            except A['Hold']:status=1;held=True
        receipt=next(v['receipt'] for n,v in e.records if n=='relay-drain.json')
        clean=case in ('joined-closed','closed-protocol-failure')
        check('ACTUAL_START_STOP_MAIN_'+case,(not held and e.c.closed and output.closed and parent.closed and short.closed) if clean else
              (held and not e.c.closed and not output.closed and any(x is e for x in A['RETAINED_EFFECTS'])))
        check('CANONICAL_PUBLISHED_COMPLETE_CLOSURE_AGREE_'+case,receipt['descriptorsClosed'] is clean and relay.result['descriptorsClosed'] is clean and
              receipt['threadTerminated']==relay.result['threadTerminated'])
        if not clean:check('PARTIAL_RECEIPT_AND_STRONG_REFERENCE_'+case,any(n.startswith('custody-retained-') for n,v in e.records) and e.gaps['resourceObservationGap'] is True)
        if case=='parent-chain-rejected':check('EXACT_PARTIAL_START_PARENT_STILL_OWNED',relay.thread is None and relay.parent is parent and not parent.closed and relay.result['descriptorsClosed'] is False)
        if case=='closed-protocol-failure':check('CLEAN_FAILED_PROTOCOL_TEARDOWN_NOT_PERMANENTLY_RETAINED',status==1 and not any(x is e for x in A['RETAINED_EFFECTS']) and relay.result['failure'] is True)
        custody_cases.append(dict(case=case,status=status,held=held,controlClosed=e.c.closed,outputClosed=output.closed,
             parentClosed=parent.closed,shortClosed=short.closed,actualOwnedResult=copy.deepcopy(relay.result),publishedDrain=receipt,
             effectsStronglyRetained=any(x is e for x in A['RETAINED_EFFECTS']),actualThreadOrServeExecution=False))

sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','write_text','stat','lstat','mkdir','iterdir','resolve','unlink')),
      (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','unlink','fsync','kill','fork','system','getpid','getppid','getuid')),
      (subprocess,('Popen','run','call','check_output','check_call')),(socket,('socket','create_connection')),(selectors,('DefaultSelector',)),
      (threading,('Thread','Event','Lock')),(ctypes,('CDLL',)),(fcntl,('flock','fcntl','ioctl')),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,blocked))
    loader_tests();custody_tests();check('ZERO_REAL_BOUNDARY_CALLS',blocked_calls==[])
result=dict(kind='SOURCE05_ONLY_TWO_FINDING_CATEGORIES_TARGETED_FAKE_CHECKS',passed=len(checks),failed=0,checks=checks,
    loaderCases=loader_cases,custodyCases=custody_cases,realBoundaryCalls=blocked_calls,
    actualAdapterJavaNativeThreadSocketRuntimeOrNamespaceActions=0,actualJavaAndPlatformQualification='UNEXECUTED_OWED',executionReady=False)
(HERE/'targeted05-check-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(passed=len(checks),failed=0,loaderCases=len(loader_cases),custodyCases=len(custody_cases),actualActions=0)))
