"""Exact adopted two-category regressions. Actual functions, all boundaries fake.

Preloads only sealed public prep/source. Persistent deny hook remains installed.
No runtime/OS/process-exit inference. Every body below inspected before first run.
"""
from pathlib import Path
import ast
import builtins
import copy
import ctypes
import errno
import fcntl
import hashlib
import io
import json
import os
import socket
import stat
import subprocess
import sys
import time
import types
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path(__file__).absolute().parent
runner=(HERE/'checks.py').read_bytes();prefix=runner.split(b'\nsys.addaudithook(audit)',1)[0]
ns={'__name__':'_two_category_fake_fixture','__file__':str(HERE/'checks.py')};exec(compile(prefix,'<preloaded-fake-fixtures>','exec'),ns)
A,P,C,Machine,MemPath=map(ns.get,('A','P','C','Machine','MemPath'))
check,denied,build,blocked=map(ns.get,('check','denied','build','blocked'))
guard=ns['SRC']['guard-failed-red.bash'].decode();body=guard.split("-B -c '",1)[1].split("' \"$GATEWAY_FAILED_ENTRY\"",1)[0]
def audit(event,args):
    if event=='open' and type(args[0])is str and args[0]==str(HERE/'code02-check-results.json') and 'w' in str(args[1]):return
    ns['audit'](event,args)

def small():
    s=Machine();s.fs.directory(A.W,0o700);s.fs.directory(A.N,0o700)
    s.fs.put(A.W/'a',b'AAAA',0o600);s.fs.put(A.W/'b',b'BBBBBB',0o600)
    u=A.Unit.__new__(A.Unit);u.s=s;u.k={'limits':dict(maximumArchiveBytes=10,maximumFileBytes=6,maximumArchiveEntries=8)}
    u.d=types.SimpleNamespace(SCOPE=dict(dependencies='/synthetic/dependencies'));u.c=s.custody(A.N,0o700)
    return s,u

def writes(s):return sum(e[2] for e in s.fs.events if e[0]=='write' and e[1].startswith(str(A.N)+'/'))
def reads(s):return sum(e[2] for e in s.fs.events if e[0]=='read' and e[1].startswith(str(A.W)+'/'))
def growth_inventory():
    for budget in ('aggregate','perfile'):
        s,u=small();u.k['limits']['maximumFileBytes']=20 if budget=='aggregate' else 6
        rows=u.bounded_inventory(A.W)
        check('INVENTORY_'+budget+'_EXACT_CAP_CLEAN',sum(r['bytes'] for r in rows)==10 and reads(s)==10)
        u.c.close()
        s,u=small();u.k['limits']['maximumFileBytes']=20 if budget=='aggregate' else 6
        old=s.api.open
        def grow(name,flags,mode=0o600,dir_fd=None):
            path=s.fs.path(name,dir_fd)
            if path==str(A.W/'b') and not flags&os.O_DIRECTORY:s.fs.nodes[path]['raw']+=b'CCCCCC'
            return old(name,flags,mode,dir_fd)
        s.api.open=grow
        denied('INVENTORY_'+budget+'_GROWTH_BEFORE_READ',lambda:u.bounded_inventory(A.W),'FILE_OWNER_MODE_CAP')
        check('INVENTORY_'+budget+'_NO_OVER_BUDGET_ACQUISITION',reads(s)==4 and writes(s)==0)
        u.c.close()
    s,u=small();old=s.api.read
    def during(fd,n):
        out=old(fd,n)
        if s.fs.fds[fd]['path']==str(A.W/'b'):s.fs.nodes[str(A.W/'b')]['raw']+=b'C'
        return out
    s.api.read=during;denied('INVENTORY_GROWTH_DURING_ACQUISITION',lambda:u.bounded_inventory(A.W),'FILE_IDENTITY_CHANGED')
    check('INVENTORY_DURING_READ_CONSUMED_WITHIN_CAP',reads(s)==10);u.c.close()

def growth_copy():
    for budget in ('aggregate','perfile'):
        for phase in ('clean','before-open','during-read'):
            s,u=small();u.k['limits']['maximumFileBytes']=20 if budget=='aggregate' else 6
            rows=u.bounded_inventory(A.W);s.fs.events=[];oldopen=s.api.open;oldread=s.api.read
            def growing_open(name,flags,mode=0o600,dir_fd=None):
                path=s.fs.path(name,dir_fd)
                if phase=='before-open' and path==str(A.W/'b') and not flags&os.O_DIRECTORY:s.fs.nodes[path]['raw']+=b'CCCCCC'
                return oldopen(name,flags,mode,dir_fd)
            def growing_read(fd,n):
                out=oldread(fd,n)
                if phase=='during-read' and s.fs.fds[fd]['path']==str(A.W/'b'):s.fs.nodes[str(A.W/'b')]['raw']+=b'CCCCCC'
                return out
            s.api.open=growing_open;s.api.read=growing_read
            action=lambda:u.copy_tree(MemPath(A.W),MemPath(A.N)/'complete-failed-workspace-archive',rows)
            if phase=='clean':
                actual=action();check('COPY_'+budget+'_EXACT_CAP_CLEAN',P.equivalent(actual)==P.equivalent(rows) and writes(s)==10)
            else:
                denied('COPY_'+budget+'_GROWTH_'+phase,action,'COPY_EXPECTED_METADATA' if phase=='before-open' else 'COPY_SOURCE_CHANGED')
                check('COPY_'+budget+'_NO_OVER_BUDGET_WRITES_'+phase,writes(s)==4 and str(A.N/'complete-failed-workspace-archive/a') in s.fs.nodes)
            u.c.close()
    # Aggregate is shared across archive roots and all four raw files, not reset
    # for a second physical copy. Refusal preserves first archive and partial root.
    s,u=small();rows=u.bounded_inventory(A.W);b=u.copy_budget()
    u.copy_tree(MemPath(A.W),MemPath(A.N)/'complete-failed-workspace-archive',rows,b)
    denied('COPY_SHARED_CUMULATIVE_BUDGET_SECOND_ROOT',lambda:u.copy_tree(MemPath(A.W),MemPath(A.N)/'original-chart-archive',rows,b),'ARCHIVE_TOTAL_BYTE_CAP')
    check('COPY_SHARED_BUDGET_NO_EXTRA_BYTE',writes(s)==10 and b['bytes']==10);u.c.close()
    s,u=small();s.fs.nodes[str(A.W/'a')]['mode']=0o644;rows=u.bounded_inventory(A.W)
    u.copy_tree(MemPath(A.W),MemPath(A.N)/'complete-failed-workspace-archive',rows)
    check('COPY_FD_MODE_PRESERVED_UNDER_077',s.fs.nodes[str(A.N/'complete-failed-workspace-archive/a')]['mode']==0o644);u.c.close()
    s,u=small();rows=u.bounded_inventory(A.W);b=u.copy_budget();b['entryCap']=1
    denied('COPY_ENTRY_BUDGET_BEFORE_CHILD_CREATE',lambda:u.copy_tree(MemPath(A.W),MemPath(A.N)/'complete-failed-workspace-archive',rows,b),'ARCHIVE_ENTRY_CAP')
    check('COPY_ENTRY_DENIAL_ZERO_WRITES',writes(s)==0);u.c.close()

def outer(mode,kind,optimize=0):
    s,k,a,auth,buffers=build();created=[];active=[False]
    if mode=='postclose':
        ns['next_client'](s,True)
        for name in ('gate-allow.json','root-close-permit.json','readiness.json'):s.fs.put(A.N/name,b'SYNTHETIC_PRIOR_PIN_ONLY_NOT_PARSED_BEFORE_QUALIFICATION')
    if mode!='negative':
        role=A.ROLES[mode][1];control,ch=ns['root_control'](s,k,auth,mode,role)
    else:ch=None
    initial=set(s.fs.nodes)
    if kind=='timeout':s.timeout=True
    if kind=='malformed-census':
        popen=s.popen
        def malformed(argv):
            child=popen(argv);child.output='MALFORMED';return child
        s.popen=malformed
    if kind=='constructor-open':
        old=s.api.fstat
        def failing(fd):
            if active[0] and s.fs.fds[fd]['path']==str(A.N):raise OSError('SYNTHETIC_FSTAT_PRIVATE_MESSAGE')
            return old(fd)
        s.api.fstat=failing
    if kind=='constructor-close':
        oldstat=s.api.fstat;oldclose=s.api.close;bad=[]
        def failing(fd):
            if active[0] and s.fs.fds[fd]['path']==str(A.N):bad.append(fd);raise OSError('SYNTHETIC_FSTAT')
            return oldstat(fd)
        def closing(fd):
            if fd in bad:raise OSError('SYNTHETIC_CLOSE_UNCONFIRMED')
            return oldclose(fd)
        s.api.fstat=failing;s.api.close=closing
    if kind=='wait-timeout':
        popen=s.popen
        def wait_timeout(argv):
            child=popen(argv)
            def wait(timeout):raise subprocess.TimeoutExpired(argv,timeout)
            child.wait=wait;return child
        s.popen=wait_timeout
    if kind=='client-fingerprint':s.python=lambda:dict(reported='/synthetic/wrong-bin',observedArgument='/synthetic/python-app')
    if kind=='invalid-child-pid':
        popen=s.popen
        def badpid(argv):
            child=popen(argv);child.pid=None;return child
        s.popen=badpid
    outputs=[];real_exec=builtins.exec
    def track(code,namespace):
        namespace['__builtins__']=dict(vars(builtins),exec=track)
        real_exec(code,namespace)
        if code.co_filename=='<verified-failed-gateway>':
            # Concrete effect provider only; actual runtime functions are unchanged.
            namespace['System']=lambda:s;namespace['MANIFEST06']=s.package_sha;active[0]=True
            created.append(namespace)
    environment={'__name__':'_actual_guard_composition','__builtins__':dict(vars(builtins),exec=track,print=lambda value,**kwargs:outputs.append(json.loads(value)))}
    argv=['-c',str(A.N/'entry.py'),P.sha(buffers['entry.py']),mode,auth]+([ch] if ch else [])
    with ExitStack() as nested:
        for name in ('open','fstat','stat','close','read','getuid','getpid','getppid'):nested.enter_context(patch.object(os,name,getattr(s.api,name)))
        nested.enter_context(patch.object(sys,'argv',argv))
        nested.enter_context(patch.object(fcntl,'flock',lambda fd,flags:(_ for _ in ()).throw(OSError(errno.EAGAIN,'HELD'))))
        try:real_exec(compile(body,'<actual-outer-guard>','exec',optimize=optimize),environment)
        except SystemExit as status:actual=status.code
        else:raise AssertionError('OUTER_STATUS_REQUIRED')
    return s,initial,created,outputs,actual

def sink_checks():
    # Full actual guard -> verified entry -> actual run/constructor/register/table/
    # capture -> same outer sink. There is no fabricated callback replacing policy.
    for mode in ('negative','postclose'):
        for kind in ('timeout','wait-timeout','malformed-census','invalid-child-pid'):
            s,initial,created,outputs,status=outer(mode,kind)
            label='OUTER_'+mode+'_'+kind
            check(label+'_ACTUAL_DISPATCH_REACHED',len(created)==1 and status==1)
            check(label+'_SINGLE_UNQUALIFIED_SINK',len(outputs)==1 and outputs[0]['sink']=='ROOT_OPERATOR_TOOL_TRACE' and outputs[0]['qualified'] is False and outputs[0]['NFact'] is False)
            record=outputs[0];child=record['children'][0]
            check(label+'_EXACT_KNOWN_LINEAGE',record['client']['pid']==s.pid() and record['client']['ppid']==s.ppid() and record['client']['start'] is None and child['command']==['/synthetic/ps','-ww','-axo','pid=,ppid=,lstart=,command='] and child['executableSha256']==P.sha(b'PS') and child['fullFingerprint'] is None and child['start'] is None)
            if kind=='timeout':check(label+'_PARTIAL_UNKNOWN_NOT_TERMINAL',child['pid']==s.probe and child['waited'] is False and child['status'] is None and child['partialStdoutAvailable'] is True and child['partialStderrAvailable'] is True and record['childCompletion']=='UNKNOWN')
            if kind=='wait-timeout':check(label+'_COMMUNICATED_WAIT_UNKNOWN',child['waited'] is False and child['status'] is None and child['stdoutComplete'] is True and child['stderrComplete'] is True and record['childCompletion']=='UNKNOWN')
            if kind=='invalid-child-pid':check(label+'_UNKNOWN_PID_NOT_INVENTED',child['pid'] is None and child['waited'] is False)
            if kind=='malformed-census':check(label+'_ACTUAL_WAIT_RETAINED',child['waited'] is True and child['status']==0 and child['stdoutComplete'] is True)
            check(label+'_NO_UNQUALIFIED_N_WRITE',set(s.fs.nodes)==initial)
            check(label+'_CLOSED_FIELDS_NO_RAW_OUTPUT',not any(x in json.dumps(record) for x in ('PARTIAL','MALFORMED','SYNTHETIC_FSTAT_PRIVATE_MESSAGE','stdoutSha256','failureClass')))
    s,initial,created,outputs,status=outer('negative','client-fingerprint')
    record=outputs[0]
    check('OUTER_PARTIAL_CLIENT_CENSUS_FACTS_RETAINED',status==1 and record['client']['start']=='Mon Oct 19 15:00:00 2026' and record['client']['argvHash']==P.sha(('python synthetic-current '+str(s.current)).encode()) and record['client']['fullFingerprint'] is None)
    check('OUTER_PARTIAL_CLIENT_NO_N_FACT_OR_BACKFILL',set(s.fs.nodes)==initial and record['qualified'] is False and record['children'][0]['startObserved'] is True)
    for kind in ('constructor-open','constructor-close'):
        s,initial,created,outputs,status=outer('negative',kind)
        check('OUTER_'+kind+'_BEFORE_END_RECORD',status==1 and len(outputs)==1 and outputs[0]['children']==[] and outputs[0]['qualified'] is False)
        check('OUTER_'+kind+'_NO_N_WRITE',set(s.fs.nodes)==initial)
        if kind=='constructor-close':check('OUTER_PARTIAL_FD_REFERENCE_RETAINED',outputs[0]['unresolvedDescriptorCount']>0 and outputs[0]['descriptorCompletion']=='UNKNOWN' and len(s.fs.fds)>0)
    # Direct actual run uses the identical FailureSink class and fake named emitter.
    s,k,a,auth,buffers=build();s.timeout=True
    with patch.dict(A.__dict__,MANIFEST06=s.package_sha):
        denied('DIRECT_RUN_QUALIFICATION_TIMEOUT',lambda:A.run('negative',auth,system=s,root_raw=P.packed(a),code_buffers=buffers))
    check('DIRECT_RUN_SAME_CLOSED_OPERATOR_SINK',len(s.operator_records)==1 and s.operator_records[0]['sink']=='ROOT_OPERATOR_TOOL_TRACE' and s.operator_records[0]['children'][0]['pid']==s.probe)
    sink_class=ns['SRC']['protocol.py'].decode().split('class FailureSink:',1)[1].split('# END SINGLE OUTER FAILURE SINK',1)[0]
    records=[];sink=P.FailureSink(records.append,900001,3749)
    owner=types.SimpleNamespace(client=dict(pid=900001,ppid=3749,start='X'*129,argvHash='a'*64),prequalified=False,utilities=[dict(pid=990001,command=['/synthetic/ps'],executableSha256='b'*64,observedStart='X'*129,terminal=False,classification='UNKNOWN_CURRENT_UTILITY')])
    sink.owner=owner;sink.forward(ValueError('SYNTHETIC_PRIVATE_MESSAGE'))
    check('SINK_CLOSED_BOUNDED_OPTIONAL_METADATA',len(records)==1 and records[0]['boundedMetadataOmitted'] is True and records[0]['client']['start'] is None and records[0]['children'][0]['start'] is None and records[0]['children'][0]['pid']==990001 and len(json.dumps(records[0]).encode())<=8388608)
    check('GUARD_PROTOCOL_SINGLE_SINK_DEFINITION_IDENTICAL',('class FailureSink:'+sink_class) in body)
    check('ZERO_REAL_BOUNDARY_CALLS',ns['BLOCKED']==[])

def tests():growth_inventory();growth_copy();sink_checks()
sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),
        (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),
        (socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,blocked))
    tests()
result=dict(kind='CODE02_EXACT_TWO_ADOPTED_CATEGORY_REGRESSIONS',passed=len(ns['RESULTS']),failed=0,checks=ns['RESULTS'],realBoundaryCalls=ns['BLOCKED'],sourcePins={n:P.sha(raw) for n,raw in ns['SRC'].items()},fixtureHarnessSha256=P.sha(runner),actualRuntimeOsOrphanOrProcessExitInference=False,actualBoundaryActions=0)
(HERE/'code02-check-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ('checks','sourcePins')}))
