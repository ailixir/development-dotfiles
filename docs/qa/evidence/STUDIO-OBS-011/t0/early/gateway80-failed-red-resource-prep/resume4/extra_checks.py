"""Required additional custody/cap/control cases; actual functions, no real effects."""
from pathlib import Path
import ast
import builtins
import copy
import ctypes
import fcntl
import io
import json
import os
import socket
import subprocess
import time
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path(__file__).absolute().parent
runner=(HERE/'checks.py').read_bytes();prefix=runner.split(b'\nsys.addaudithook(audit)',1)[0]
ns={'__name__':'_required_extra_fake_cases','__file__':str(HERE/'checks.py')};exec(compile(prefix,'<verified-preloaded-fake-fixture-definitions>','exec'),ns)
A,P,C,FS,Machine,MemPath=map(ns.get,('A','P','C','FS','Machine','MemPath'))
check,denied,registered,build,blocked=map(ns.get,('check','denied','registered','build','blocked'))
original_audit=ns['audit']
def audit(event,args):
    if event=='open' and type(args[0])is str and args[0]==str(HERE/'extra-check-results.json') and 'w' in str(args[1]):return
    original_audit(event,args)

def tests():
    s,k,a,auth,buffers=build();s.fs.nodes[str(A.N)]['uid']=502;s.fs.events=[]
    denied('CUSTODY_WRONG_UID_BEFORE_BODY',lambda:s.custody(A.N,0o700),'CUSTODY_OWNER_MODE')
    check('WRONG_UID_NO_BODY_READ',not any(e[0]=='read' for e in s.fs.events))
    s,k,a,auth,buffers=build();p=str(A.N/'protocol.py');s.fs.nodes[p]=dict(s.fs.nodes[p],kind='symlink',target='/private/forbidden');c=s.custody(A.N,0o700);s.fs.events=[]
    denied('NOFOLLOW_LEAF_LINK',lambda:c.read('protocol.py',0o600));check('LINK_TARGET_NOT_OPENED',not any(e[0]=='open' and e[1]=='/private/forbidden' for e in s.fs.events));c.close()
    s,k,a,auth,buffers=build();c=s.custody(A.N,0o700);read=s.api.read;done=[False]
    def replacing(fd,n):
        out=read(fd,n)
        if not done[0] and s.fs.fds[fd]['path']==str(A.N/'protocol.py'):
            done[0]=True;p=str(A.N/'protocol.py');s.fs.nodes[p]=dict(s.fs.nodes[p],ino=s.fs.nodes[p]['ino']+1)
        return out
    s.api.read=replacing
    denied('LEAF_IDENTITY_CHANGED_DURING_READ',lambda:c.read('protocol.py',0o600),'FILE_IDENTITY_CHANGED');c.close()
    s,k,a,auth,buffers,u=registered();u.k['limits']['maximumArchiveEntries']=1
    denied('ARCHIVE_ENTRY_CAP_BEFORE_UNBOUNDED_COPY',lambda:u.bounded_inventory(A.W),'ARCHIVE_ENTRY_CAP');u.close()
    s,k,a,auth,buffers,u=registered();u.k['limits']['maximumFileBytes']=1;s.fs.events=[]
    denied('ARCHIVE_FILE_CAP_BEFORE_BODY',lambda:u.bounded_inventory(A.W),'ARCHIVE_FILE_CAP_TYPE')
    check('OVERSIZE_BODY_NOT_READ',not any(e[0]=='read' and e[1].endswith('/Chart.yaml') for e in s.fs.events));u.close()
    s,k,a,auth,buffers,u=registered();u.k['limits']['maximumArchiveBytes']=1
    denied('ARCHIVE_TOTAL_BYTE_CAP',lambda:u.bounded_inventory(A.W),'ARCHIVE_TOTAL_BYTE_CAP');u.close()
    s,k,a,auth,buffers,u=registered();path=str(A.N/'root-close-permit.json');s.fs.put(path,b'{"role":"SELF_PIN_CANARY"}')
    denied('PREEXISTING_CONTROL_NOT_SELF_PINNED',lambda:u.local('root-close-permit.json'),'EXTERNAL_PIN_REQUIRED')
    denied('PREEXISTING_CONTROL_REQUIRES_ROOT_PIN_MAP',u.check_members,'UNPINNED_PREEXISTING_N_MEMBER');u.close()
    s,k,a,auth,buffers,u=registered();path=a['pythonRoles']['process']['path']
    denied('EXPLICIT_HASH_CANNOT_OVERRIDE_ROOT_PIN',lambda:u.bound(path,'0'*64),'CONFLICTING_EXPLICIT_INPUT_PIN');u.close()
    s,k,a,auth,buffers,u=registered();path=a['pythonRoles']['process']['path'];old=s.fs.nodes[path];s.fs.nodes[path]=dict(old,ino=old['ino']+1)
    denied('SAME_BYTES_MAPPED_BINARY_INODE_CHANGED',lambda:u.bound(path,a['pythonRoles']['process']['sha256']),'IMMUTABLE_FILE_IDENTITY_CHANGED');u.close()
    s,k,a,auth,buffers,u=registered();s.parent=1
    denied('CURRENT_PARENT_CHANGED_HOLD',u.table,'ANCHORED_CURRENT_PARENT');u.close()
    s,k,a,auth,buffers,u=registered();fs=s.fs;before=len(fs.fds);u.prequalified=False
    denied('NO_PUBLISH_BEFORE_CLIENT_HOLDER_CUSTODY',lambda:u.write('readiness.json',{}),'NO_OUTPUT_BEFORE_QUALIFICATION')
    check('NO_UNQUALIFIED_READINESS_CREATED',str(A.N/'readiness.json') not in fs.nodes);u.close()
    guard=ns['SRC']['guard-failed-red.bash'].decode()
    check('READONLY_PREQUAL_CONSUMPTION_ALL_SIX_PHASES',all('readonly GATEWAY_FR03_'+stem+'_STARTED=1' in guard for stem in ('NEGATIVE','HELD','ARCHIVE','FINAL','GATE','POSTCLOSE')))
    check('BOTH_ACTUAL_FRESHNESS_CALLS_BRACKET_OBSERVE',ns['SRC']['failed_gateway.py'].count(b'P.freshness(')==2)
    check('ZERO_REAL_BOUNDARY_CALLS',ns['BLOCKED']==[])

import sys
sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),
        (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),
        (socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,blocked))
    tests()
result=dict(kind='REQUIRED_EXTRA_CUSTODY_CAP_CONTROL_ACTUAL_FUNCTION_CASES',passed=len(ns['RESULTS']),failed=0,checks=ns['RESULTS'],realBoundaryCalls=ns['BLOCKED'],
    consumedProductionPins={n:P.sha(raw) for n,raw in ns['SRC'].items()},fixtureHarnessSha256=P.sha(runner),actualRuntimeNativeBaselineOrOsActions=0)
(HERE/'extra-check-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in('checks','consumedProductionPins')}))
