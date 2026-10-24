"""Full real adapter + reviewed06 functions, all effects on an in-memory fake machine.

No runtime/baseline/OS/tool body is read. Fixture digests are explicitly synthetic;
counts/finite retained joins/case outcomes remain the frozen real contract's semantics.
"""
import ast
import collections
import datetime
import resource
import shlex
import signal
import xml.etree.ElementTree
import builtins
import copy
import ctypes
import errno
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path,PurePosixPath
import re
import shutil
import socket
import stat
import subprocess
import sys
import time
import types
from contextlib import ExitStack
from unittest.mock import patch

HERE=Path(__file__).absolute().parent
SRC={n:(HERE/n).read_bytes() for n in ('failed_gateway.py','custody.py','protocol.py','contract.json','entry.py','guard-failed-red.bash')}
PKG=HERE.parent.parent/'gateway80-proof-prep/resume6'
RAW_MANIFEST=(PKG/'manifest.json').read_bytes();assert hashlib.sha256(RAW_MANIFEST).hexdigest()=='e2e3340b48628c76884d6b243dd69134052e8e2ff3d25f5ab09d94f4e9150585'
LIB={row['path']:(PKG/row['path']).read_bytes() for row in json.loads(RAW_MANIFEST)['files']}
assert all(hashlib.sha256(LIB[row['path']]).hexdigest()==row['sha256'] for row in json.loads(RAW_MANIFEST)['files'])
CORE_RAW=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py').read_bytes();assert hashlib.sha256(CORE_RAW).hexdigest()=='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
C=types.ModuleType('_fake_custody');P=types.ModuleType('_pure_protocol');A=types.ModuleType('_actual_failed_gateway')
exec(compile(SRC['custody.py'],'<verified-custody>','exec'),C.__dict__);exec(compile(SRC['protocol.py'],'<verified-protocol>','exec'),P.__dict__)
A.__dict__.update(Custody=C.Custody,P=P);exec(compile(SRC['failed_gateway.py'],'<actual-failed-gateway>','exec'),A.__dict__)
RESULTS=[];BLOCKED=[]
def check(name,ok):
    assert ok is True,name
    RESULTS.append({'name':name,'pass':True})
def denied(name,action,reason=None):
    try:action()
    except (P.Hold,C.Hold,ValueError,KeyError,FileNotFoundError,FileExistsError,OSError,AssertionError,subprocess.TimeoutExpired) as error:
        check(name,reason is None or str(error)==reason)
    else:raise AssertionError(name)
def blocked(*args,**kwargs):BLOCKED.append('REAL_BOUNDARY');raise AssertionError('REAL_BOUNDARY_DENIED')
def audit(event,args):
    if event in {'subprocess.Popen','os.system','os.fork','os.kill','socket.__new__','socket.connect','ctypes.dlopen'}:raise AssertionError('DENY_AUDIT_'+event)
    if event=='open':
        if type(args[0])is str and args[0]==str(HERE/'check-results.json') and 'w' in str(args[1]):return
        raise AssertionError('DENY_AUDIT_OPEN')

class MemPath(PurePosixPath):
    fs=None
    def lstat(self):return self.fs.info(str(self))
    def stat(self,**kwargs):return self.fs.info(str(self))
    def is_symlink(self):return self.fs.nodes.get(str(self),{}).get('kind')=='symlink'
    def is_file(self):return self.fs.nodes.get(str(self),{}).get('kind')=='file'
    def is_dir(self):return self.fs.nodes.get(str(self),{}).get('kind')=='directory'
    def exists(self):return str(self) in self.fs.nodes
    def resolve(self):return self
    def read_bytes(self):return self.fs.nodes[str(self)]['raw']
    def rglob(self,pattern):
        prefix=str(self)+'/'
        return iter(MemPath(n) for n in sorted(self.fs.nodes) if n.startswith(prefix))

class Handle:
    def __init__(self,fs,fd,mode):self.fs,self.fd,self.mode=fs,fd,mode;self.closed=False
    def read(self,n=-1):return self.fs.read(self.fd,n)
    def write(self,raw):return self.fs.write(self.fd,raw)
    def flush(self):pass
    def fileno(self):return self.fd
    def close(self):
        if not self.closed:self.fs.close(self.fd);self.closed=True
    def __enter__(self):return self
    def __exit__(self,*unused):self.close()

class FS:
    def __init__(self):self.nodes={};self.fds={};self.counter=100;self.fdnum=10;self.events=[];self.uid=501;self.swap=None;self.short_write=False;self.held=True
    def path(self,p,dir_fd=None):
        p=str(p)
        return p if p.startswith('/') else str(MemPath(self.fds[dir_fd]['path'])/p)
    def directory(self,p,mode=0o755,ino=None):
        p=MemPath(p)
        for q in [*reversed(p.parents),p]:
            if str(q) not in self.nodes:self.counter+=1;self.nodes[str(q)]=dict(kind='directory',mode=mode,ino=self.counter,uid=501,dev=16777229,mtime=1000)
        if ino:self.nodes[str(p)]['ino']=ino
    def put(self,p,raw,mode=0o600,ino=None):
        self.directory(MemPath(p).parent);self.counter+=1;self.nodes[str(p)]=dict(kind='file',mode=mode,ino=ino or self.counter,uid=501,dev=16777229,mtime=1000,raw=raw)
    def info(self,p):
        if p not in self.nodes:raise FileNotFoundError(p)
        return self.node_info(self.nodes[p])
    def node_info(self,n):
        typ={'file':stat.S_IFREG,'directory':stat.S_IFDIR,'symlink':stat.S_IFLNK}[n['kind']]
        return types.SimpleNamespace(st_dev=n['dev'],st_ino=n['ino'],st_mode=typ|n['mode'],st_uid=n['uid'],st_size=len(n.get('raw',b'')),st_mtime_ns=n['mtime'],st_ctime_ns=n['mtime'],st_nlink=1)
    def open(self,p,flags,mode=0o600,dir_fd=None):
        p=self.path(p,dir_fd);self.events.append(('open',p,flags))
        if flags&os.O_CREAT:
            if p in self.nodes:raise FileExistsError(p)
            self.put(p,b'',mode&~0o077)
        st=self.info(p)
        if stat.S_ISLNK(st.st_mode):raise OSError(errno.ELOOP,'LINK')
        if flags&os.O_DIRECTORY and not stat.S_ISDIR(st.st_mode):raise NotADirectoryError(p)
        self.fdnum+=1;self.fds[self.fdnum]=dict(path=p,offset=0,node=self.nodes[p]);return self.fdnum
    def fstat(self,fd):return self.node_info(self.fds[fd]['node'])
    def stat(self,p,dir_fd=None,follow_symlinks=False):return self.info(self.path(p,dir_fd))
    def close(self,fd):self.events.append(('close',fd));self.fds.pop(fd)
    def read(self,fd,n):
        f=self.fds[fd];raw=f['node']['raw'];n=len(raw) if n<0 else n;out=raw[f['offset']:f['offset']+n];f['offset']+=len(out);self.events.append(('read',f['path'],len(out),n));return out
    def write(self,fd,raw):
        if self.short_write:return 0
        f=self.fds[fd];node=f['node'];self.events.append(('write',f['path'],len(raw)));offset=f['offset'];node['raw']=node['raw'][:offset]+raw+node['raw'][offset+len(raw):];f['offset']+=len(raw);return len(raw)
    def listdir(self,fd):
        root=self.fds[fd]['path'];prefix=root.rstrip('/')+'/'
        return sorted(n[len(prefix):] for n in self.nodes if n.startswith(prefix) and n!=root and '/' not in n[len(prefix):])
    def mkdir(self,name,mode,dir_fd):
        p=self.path(name,dir_fd)
        if p in self.nodes:raise FileExistsError(p)
        self.directory(p,mode)
    def fchmod(self,fd,mode):self.fds[fd]['node']['mode']=mode
    def fsync(self,fd):pass
    def fdopen(self,fd,mode,closefd=True):return Handle(self,fd,mode)
    def symlink(self,target,name,dir_fd):
        p=self.path(name,dir_fd);self.counter+=1;self.nodes[p]=dict(kind='symlink',mode=0o755,uid=501,dev=16777229,ino=self.counter,mtime=1000,target=target)
    def readlink(self,p,dir_fd=None):return self.nodes[self.path(p,dir_fd)]['target']
    def walk(self,root,followlinks=False):
        root=str(root);prefix=root+'/'
        names=sorted(n[len(prefix):] for n in self.nodes if n.startswith(prefix) and '/' not in n[len(prefix):]);dirs=[];files=[]
        for n in names:
            (dirs if self.nodes[prefix+n]['kind'] in ('directory','symlink') else files).append(n)
        yield root,dirs,files
        for n in dirs:
            if self.nodes[prefix+n]['kind']=='directory':yield from self.walk(prefix+n)
    def getuid(self):return 501

class Child:
    def __init__(self,s,pid,command,output,status=0):self.s,self.pid,self.command,self.output,self.returncode=s,pid,command,output,None;self.status=status
    def communicate(self,timeout):
        assert timeout==15
        if self.s.timeout:raise subprocess.TimeoutExpired(self.command,timeout,output='PARTIAL',stderr='PARTIAL')
        self.returncode=self.status;return self.output,self.s.stderr
    def wait(self,timeout):assert timeout==15;return self.returncode

class Machine:
    def __init__(self):
        self.resources=[];self.operator_records=[];self.fs=FS();MemPath.fs=self.fs;self.current=900001;self.parent=3749;self.probe=990000;self.epoch=1000;self.stderr='';self.timeout=False;self.extra={};self.rows_base={};self.post=False
        self.api=types.SimpleNamespace(**{n:getattr(os,n) for n in ('O_RDONLY','O_WRONLY','O_RDWR','O_CREAT','O_EXCL','O_NOFOLLOW','O_DIRECTORY')},**{name:getattr(self.fs,name) for name in ('open','fstat','stat','close','read','write','listdir','mkdir','fchmod','fsync','fdopen','symlink','readlink','walk','getuid')},getpid=self.pid,getppid=self.ppid)
    path=MemPath
    def pid(self):return self.current
    def ppid(self):return self.parent
    def uid(self):return 501
    def umask(self):return 0o077
    def now(self):return self.epoch
    def python(self):return dict(reported='/synthetic/python-bin',observedArgument='/synthetic/python-app')
    def operator_emit(self,value):self.operator_records.append(value)
    def custody(self,p,mode=None):return A.System.custody(self,p,mode)
    def read(self,p,mode=None,cap=16777216):return A.System.read(self,p,mode,cap)
    def lock_free(self,path,expected):return self.post
    def rows(self,probe=None):
        rows=copy.deepcopy(self.rows_base);rows.update(copy.deepcopy(self.extra))
        rows[self.current]=dict(pid=self.current,ppid=self.parent,start='Mon Oct 19 15:00:00 2026',argv='python synthetic-current '+str(self.current),comm='/synthetic/python-app')
        if self.post:rows[self.parent]=dict(pid=self.parent,ppid=1,start='Mon Oct 19 15:00:00 2026',argv='outer-parent',comm='/bin/bash')
        if probe:rows[probe[0]]=dict(pid=probe[0],ppid=self.current,start='Mon Oct 19 15:00:01 2026',argv=' '.join(probe[1]),comm=probe[1][0])
        return rows
    def popen(self,command):
        self.probe+=1;pid=self.probe;rows=self.rows((pid,command));out='';status=0
        if command[0]=='/synthetic/ps':
            if '-axo' in command and command[-1]=='pid=,ppid=,lstart=,command=':out='\n'.join(str(p)+' '+str(r['ppid'])+' '+r['start']+' '+r['argv'] for p,r in rows.items())
            elif '-axo' in command:out='\n'.join(str(p)+' '+r['comm'] for p,r in rows.items())
            else:
                row=rows.get(int(command[command.index('-p')+1]));column=command[-1][:-1]
                out='' if row is None else str(row['start'] if column=='lstart' else row['argv'] if column=='command' else row['comm'] if column=='comm' else row['ppid'])
                if not row:status=1
        elif command[0]=='/synthetic/git':out='\0'.join(self.source_names)+'\0'
        elif command[0]=='/synthetic/lsof':
            if '-d' in command:
                row=rows[int(command[command.index('-p')+1])];out='n'+(row['comm'] if command[command.index('-d')+1]=='txt' else '/unrelated/cwd')+'\n'
            elif '-iTCP' in command:status=1
            else:out='p3720\nf3\ni215213569\nn'+str(A.R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock')+'\n'
        else:raise AssertionError('NATIVE_OR_UNBOUND_EXECUTABLE')
        return Child(self,pid,command,out,status)


def build():
    s=Machine();fs=s.fs;k=json.loads(SRC['contract.json']);h=dict(label=k['subject']['label'],wrapper=k['subject']['wrapper'],shell=k['subject']['shell'],lock=k['subject']['lock'],baselinePath=k['protectedInputs']['inheritedBaselinePath'],baselineSha256='pending')
    for path in (A.R,A.D,A.E,A.N,A.W,A.PRIOR):fs.directory(path,0o700)
    prior=k['priorNamespaces'][0];fs.nodes[str(A.PRIOR)]['ino']=prior['directory']['ino']
    for row in prior['members']:
        raw=b'SYNTHETIC_FROZEN_PRIOR_'+row['path'].encode();fs.put(A.PRIOR/row['path'],raw,row['mode'],ino=row['ino']);row.update(sha256=P.sha(raw),bytes=len(raw))
    fs.directory(A.W/'tmp',0o700);fs.directory(A.W/'cache',0o700)
    fs.nodes[str(A.W)]['ino']=k['protectedInputs']['ownedWorkspaceBinding']['ino']
    for role in ('wrapper','shell'):
        who=k['subject'][role];s.rows_base[who['pid']]=dict(pid=who['pid'],ppid=1 if role=='wrapper' else 3720,start=who['start'],argv='wrapper original' if role=='wrapper' else '/bin/bash --noprofile --norc -i',comm='/synthetic/python-bin' if role=='wrapper' else '/bin/bash')
        who['argvHash']=P.sha(s.rows_base[who['pid']]['argv'].encode());h[role]=copy.deepcopy(who)
    fs.put(h['lock']['path'],b'lock',0o600,ino=h['lock']['ino'])
    for path,raw in [('/synthetic/python-bin',b'BIN'),('/synthetic/python-app',b'APP'),('/synthetic/ps',b'PS'),('/synthetic/lsof',b'LSOF'),('/synthetic/git',b'GIT'),('/bin/bash',b'BASH')]:fs.put(path,raw,0o755)
    lib=dict(LIB);scope=json.loads(lib['scope.json']);I=json.loads(lib['input-manifest.json'])
    fs.directory(scope['dependencies']);fs.put(MemPath(scope['dependencies'])/'fixture',b'DEPENDENCY',0o644)
    fs.put(scope['node'],b'NODE',0o755);fs.put(scope['helm'],b'HELM',0o755)
    for item in [*I['finiteCopies'],I['fixture'],I['config']]:
        bank=item.get('bank',item.get('preparedSource'))
        if bank not in lib:
            candidates=[n for n,b in lib.items() if P.sha(b)==item['sha256']];assert candidates,item;bank=candidates[0]
        fs.put(MemPath(A.W)/item['destination'],lib[bank],item['mode'])
        if item['destination'].startswith('repo/helm-chart/put-checks/'):
            fs.put(A.R/'helm-chart/put-checks'/item['destination'].split('repo/helm-chart/put-checks/',1)[1],lib[bank],item['mode'])
    parent=MemPath(A.W)/'repo/studio-runner';c=s.custody(parent);c.symlink('node_modules',scope['dependencies']);c.close()
    # Original protected6 plus30 original Node candidates; each expected fingerprint comes
    # from the same synthetic process/binary inputs, never any real baseline body.
    ids=[];nodes=[]
    for pid in [2366,5083,5095,13577,13581,64376,*range(10000,10030)]:
        comm=scope['node'] if pid>=10000 and pid<10030 else '/synthetic/python-bin'
        row=dict(pid=pid,ppid=1,start='Mon Oct 19 10:00:00 2026',argv='node unrelated '+str(pid) if pid>=10000 and pid<10030 else 'inherited '+str(pid),comm=comm);s.rows_base[pid]=row
        who=dict(pid=pid,start=row['start'],commHash=P.sha(comm.encode()),argvHash=P.sha(row['argv'].encode()),executableHash=P.sha(comm.encode()),executableFileHash=P.sha(fs.nodes[comm]['raw']))
        (nodes if 10000<=pid<10030 else ids).append(who)
    baseline=P.packed({'identities':ids});h['baselineSha256']=P.sha(baseline);fs.put(A.R/h['baselinePath'],baseline,0o644)
    candidate=P.packed(dict(capturedBeforeUnit=True,label=k['subject']['label'],identities=nodes))
    source=[]
    for i in range(1808):
        name=('backend/src/main/f'+str(i)) if i<506 else ('backend/src/test/f'+str(i));raw=('SOURCE'+str(i)).encode();fs.put(A.R/name,raw,0o644);source.append(dict(path=name,sha256=P.sha(raw),mode=0o644))
    dist=[]
    for i in range(238):
        name='f'+str(i);raw=name.encode();fs.put(A.R/'studio-runner/dist'/name,raw,0o644);dist.append(dict(path=name,sha256=P.sha(raw)))
    G=dict(sourceDigest=P.SOURCE,captureScope=['backend/src'],files=source,dist={'files':dist},auxiliaryGroups={})
    s.source_names=[r['path'] for r in source];lib['source-guards.json']=P.packed(G)
    # Synthetic package manifest pins changed fixture JSON; all SOURCE06 Python/banks
    # remain literal and are the actual interpreted library functions.
    for name,raw in lib.items():fs.put(A.D/name,raw,0o644)
    package_manifest=P.packed({'files':[dict(path=n,sha256=P.sha(b),bytes=len(b),mode=0o644) for n,b in sorted(lib.items())]});fs.put(A.D/'manifest.json',package_manifest,0o644)
    s.package_sha=P.sha(package_manifest);fs.put(A.CORE,CORE_RAW,0o644)
    old=dict(sourceDigest=P.SOURCE,holdFileSha256=P.sha(P.packed(h)),candidateBaselineSha256=P.sha(candidate),distModes={r['path']:0o644 for r in dist},auxModes={},nodeCanonicalPath=scope['node'],helmCanonicalPath=scope['helm'],nodeSha256=P.sha(b'NODE'),helmSha256=P.sha(b'HELM'),dependenciesRealpath=scope['dependencies'],dependencyInventory=[],directoryRoots={})
    # Compute exact fake dependency inventory and initial42 tree through actual code below.
    dep=fs.info(str(MemPath(scope['dependencies'])/'fixture'));old['dependencyInventory']=[dict(path='fixture',uid=501,mode=0o644,dev=dep.st_dev,ino=dep.st_ino,kind='file',sha256=P.sha(b'DEPENDENCY'),bytes=10)]
    fs.put(A.E/'hold.json',P.packed(h));fs.put(A.E/'candidate-baseline.json',candidate)
    fs.put(A.E/'prepare.receipt.json',P.packed({}))
    for row in k['frozenEvidence']['oldMembers']:
        path=A.E/row['path']
        if str(path) not in fs.nodes:fs.put(path,('SYNTHETIC_FROZEN_'+row['path']).encode(),row['mode'])
    for r in k['frozenEvidence']['rawArtifactRefs']:
        raw=fs.nodes[str(A.E/r['path'])]['raw'];r.update(sha256=P.sha(raw),bytes=len(raw))
    # All root-approved original directory facts, existing literal W only.
    facts=lambda:{n:dict(path=n,uid=v['uid'],dev=v['dev'],ino=v['ino'],mode=v['mode']) for n,v in fs.nodes.items() if v['kind']=='directory'}
    old['directoryRoots']=facts()
    # A temporary actual library definitions scope computes the SAME fixture inventory.
    tmp=types.ModuleType('_fixture_driver');tmp.__dict__.update(require=lambda v,r:P.need(bool(v),r),R=MemPath(A.R),D=MemPath(A.D),E=MemPath(A.E),W=MemPath(A.W),SCOPE=scope,Path=MemPath,os=s.api,stat=stat,hashlib=hashlib,sha=lambda p:P.sha(fs.nodes[str(p)]['raw']))
    tree=ast.parse(LIB['run-private.py']);names={'directory_fact','guard_directory','guard_leaf','file_hash','inventory','immutable_input'}
    exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'<actual-inventory-fixture>','exec'),tmp.__dict__)
    initial=tmp.inventory(MemPath(A.W));assert len(initial)==42
    prepared=dict(workspace=k['protectedInputs']['ownedWorkspaceBinding'],inventory=initial,directoryPins={n:f for n,f in facts().items() if n==str(A.W) or n.startswith(str(A.W)+'/')})
    fs.put(A.E/'prepare.receipt.json',P.packed(prepared));fs.put(A.E/'root-authorization.json',P.packed(old))
    k['subject']['holdSha256']=P.sha(P.packed(h));k['subject']['releaseSha256']=P.sha(P.packed(old))
    k['protectedInputs']['candidateBaselineSha256']=P.sha(candidate)
    k['binaryAncestors']={role:dict(path=scope[role],sha256=P.sha(fs.nodes[scope[role]]['raw'])) for role in ('node','helm')}
    for row in k['frozenEvidence']['oldMembers']:
        node=fs.nodes[str(A.E/row['path'])];row.update(sha256=P.sha(node['raw']),bytes=len(node['raw']))
    extern={}
    for rel,hsh in k['externalSourcePins'].items():
        path=str(A.R/rel)
        raw=CORE_RAW if path==str(A.CORE) else b'SYNTHETIC_PUBLIC_METADATA_'+rel.encode()
        fs.put(path,raw,0o644);extern[path]=P.sha(raw);k['externalSourcePins'][rel]=P.sha(raw)
    buffers=dict(SRC)
    for n,raw in buffers.items():fs.put(A.N/n,raw)
    a=dict(authorizedBy='root',authorized=True,expectedWrapperExit=1,newNativeInvocations=0,sourceWrites=[],cleanup=False,normalRoute='HARD_HOLD',credit=False,subject=k['subject'],retainedFailure=k['retainedFailure'],compileObligation='NONE_NODE_ONLY_UNCHANGED_SOURCE',distinctFailedEntrypointAuthorized=True,sourceDigest=P.SOURCE,limits=k['limits'],rootInputPins={},codePins={n:P.sha(raw) for n,raw in buffers.items()},externalPins=extern,newDirectoryPins={str(A.N):facts()[str(A.N)]},pythonRoles={},observationExecutables={})
    for role,path in [('launch','/synthetic/python-bin'),('reported','/synthetic/python-bin'),('process','/synthetic/python-app'),('observedArgument','/synthetic/python-app')]:a['pythonRoles'][role]=dict(path=path,sha256=P.sha(fs.nodes[path]['raw']))
    for role,path in [('/bin/ps','/synthetic/ps'),('/usr/sbin/lsof','/synthetic/lsof'),('git','/synthetic/git')]:a['observationExecutables'][role]=dict(path=path,sha256=P.sha(fs.nodes[path]['raw']))
    k['expectedPythonRoles']=copy.deepcopy(a['pythonRoles']);k['expectedObservationExecutables']=copy.deepcopy(a['observationExecutables']);buffers['contract.json']=P.packed(k);fs.nodes[str(A.N/'contract.json')]['raw']=buffers['contract.json'];a['codePins']['contract.json']=P.sha(buffers['contract.json'])
    a['binaryModes']={path:fs.nodes[path]['mode'] for path in [*{r['path'] for r in a['pythonRoles'].values()},*{r['path'] for r in a['observationExecutables'].values()},scope['node'],scope['helm']]}
    a['binaryHashes']={path:P.sha(fs.nodes[path]['raw']) for path in a['binaryModes']}
    a['exactIndependentCodeReviewsQualified']=True;a['newCodeRecordPins']={}
    for rel in ['early/gateway80-failed-red-resource-prep/resume4/manifest.json','resume-architecture/resume2/gateway80-failed-red-resource-code04-exact-review/manifest.json','qa/gateway80-failed-red-resource-code04-exact-review/manifest.json']:
        path=str(A.R/'docs/qa/evidence/STUDIO-OBS-011/t0'/rel)
        if rel.startswith('early/'):
            source_rows=[dict(path=n,sha256=P.sha(raw),bytes=len(raw),mode=0o644) for n,raw in buffers.items()]
            data=P.packed(dict(files=source_rows))
        else:data=P.packed(dict(subjectManifestSha256=a['newCodeRecordPins'][str(A.R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume4/manifest.json')],mandatoryFindingCount=0,verdict='CONDITIONAL_EXACT_SOURCE_SUPPORT'))
        fs.put(path,data,0o644);a['newCodeRecordPins'][path]=P.sha(data)
    raw=P.packed(a);auth_sha=P.sha(raw);fs.put(A.N/'root-authorization.json',raw)
    pins={str(A.N/n):P.sha(raw) for n,raw in buffers.items()};pins[str(A.N/'root-authorization.json')]=auth_sha
    setup=dict(authorizedBy='root',role='SETUP_OWNERSHIP_ADMISSION',mode='negative',releaseSha256=auth_sha,credit=False,cleanup=False,subjectHoldSha256=k['subject']['holdSha256'],oldIndexSha256=k['frozenEvidence']['terminalIndexSha256'],retainedFailure=k['retainedFailure'],inputPins=pins,separatelyCaptured=True,oldBindingsUnchanged=True,newBindingsReadonly=True,setupHelperRosterComplete=True,readEofStatus=1,actualBufferVerificationExit=0,actualEvalExit=0,bindingBufferSha256=a['codePins']['guard-failed-red.bash'],bindingBufferBytes=len(buffers['guard-failed-red.bash']),helpers=[dict(pid=900101,ppid=3749,start=None,fullFingerprint=None,requestedLaunch=a['pythonRoles']['launch'],actualForegroundWaitStatus=0,separatelyCaptured=True,toolEvidence=['SYNTHETIC_SEPARATELY_CAPTURED_SETUP_HELPER'])])
    fs.put(A.N/'root-setup-ownership.json',P.packed(setup))
    return s,k,a,auth_sha,buffers


def root_control(s,k,auth_sha,mode,role,**extra):
    name=A.ROLES[mode][0];prefix=str(A.N)+'/'
    pins={n:P.sha(v['raw']) for n,v in s.fs.nodes.items() if n.startswith(prefix) and '/' not in n[len(prefix):] and v['kind']=='file' and n!=str(A.N/name)}
    if mode=='final':
        path=str(A.R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway80-failed-red-resource-actual-archive-review/manifest.json');raw=b'SYNTHETIC_ACTUAL_ARCHIVE_QA';s.fs.put(path,raw,0o644);pins[path]=P.sha(raw);extra.update(independentQaRecord=dict(path=path,sha256=P.sha(raw)),archiveReceiptSha256=pins[str(A.N/'archive-receipt.json')])
    if mode=='gate':extra.update(readinessSha256=pins[str(A.N/'readiness.json')],finalResultSha256=pins[str(A.N/'final-result.json')])
    if mode=='postclose':extra.update(gateAllowSha256=pins[str(A.N/'gate-allow.json')],permitSha256=pins[str(A.N/'root-close-permit.json')],readinessSha256=pins[str(A.N/'readiness.json')])
    value=dict(authorizedBy='root',role=role,mode=mode,releaseSha256=auth_sha,credit=False,cleanup=False,subjectHoldSha256=k['subject']['holdSha256'],oldIndexSha256=k['frozenEvidence']['terminalIndexSha256'],retainedFailure=k['retainedFailure'],inputPins=pins,**extra)
    raw=P.packed(value);s.fs.put(A.N/name,raw);return value,P.sha(raw)

def new_unit(s,a,auth,k,buffers):
    raw=s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw'];return A.Unit(s,a,auth,k,P.decode(raw),P.sha(raw),buffers)
def invoke(s,k,a,auth,buffers,mode,control=None,control_sha=None):
    if mode=='negative':control_sha=P.sha(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw'])
    created=[];real_class=A.Unit
    def record_creation(*args,**kwargs):
        unit=real_class(*args,**kwargs);created.append(unit);return unit
    # Only observe construction; the actual run/constructor/state-machine functions
    # execute unchanged against explicit fake System. No safety method is replaced.
    with patch.object(A,'Unit',record_creation):
        status=A.run(mode,auth,control_sha,system=s,root_raw=P.packed(a),code_buffers=buffers)
    return created[0],status


def next_client(s,post=False):
    s.current+=1;s.post=post
    if post:
        for p in (3720,3749):s.rows_base.pop(p,None)
        s.parent=900000;s.fs.held=False

def root_admission(s,k,a,auth):
    pins={str(A.N/n):P.sha(v['raw']) for n,v in []}
    value=dict(authorizedBy='root',role='FAILED_GUARD_ADMISSION',releaseSha256=auth,credit=False,cleanup=False,subjectHoldSha256=k['subject']['holdSha256'],oldIndexSha256=k['frozenEvidence']['terminalIndexSha256'],retainedFailure=k['retainedFailure'],setupActualStatus=0,negativeActualStatus=1,heldProofActualStatus=0,
        setupInspected=True,negativeSeparateStatusCaptured=True,heldSeparateStatusCaptured=True,sameHolderAfterDenial=True,oldNormalBindingsUnchanged=True,newReadonlyBindingInspected=True,configuredLaunch=a['pythonRoles']['launch'],configuredLaunchOperatorTrace=['SYNTHETIC_SEPARATE_TOOL_TRACE'],
        heldProofSha256=P.sha(s.fs.nodes[str(A.N/'held-proof.json')]['raw']),negativeSha256=P.sha(s.fs.nodes[str(A.N/'negative-denial.json')]['raw']))
    s.fs.put(A.N/'root-guard-admission.json',P.packed(value));return value

def protocol_flow(s,k,a,auth,buffers,until='postclose'):
    u,status=invoke(s,k,a,auth,buffers,'negative');check('INTEGRATED_NEGATIVE_RETURNS_ONE_SAME_HOLD',status==1)
    next_client(s);c,ch=root_control(s,k,auth,'held-proof','NEGATIVE_ACTUAL_STATUS',actualNegativeStatus=1,separatelyCaptured=True,oldNormalBindingsUnchanged=True)
    u,status=invoke(s,k,a,auth,buffers,'held-proof',c,ch);check('INTEGRATED_STANDALONE_HELD_PROOF_ZERO',status==0)
    root_admission(s,k,a,auth);next_client(s);c,ch=root_control(s,k,auth,'archive','ARCHIVE_FAILED_STATE')
    u,status=invoke(s,k,a,auth,buffers,'archive',c,ch);check('INTEGRATED_FAILED_W_AND_ORIGINAL22_ARCHIVE_ZERO',status==0)
    if until=='archive':return u
    next_client(s);c,ch=root_control(s,k,auth,'final','ACTUAL_ARCHIVE_REVIEW',actualArchiveExit=0,actualQaReviewed=True,archiveInspected=True,separatelyCaptured=True)
    u,status=invoke(s,k,a,auth,buffers,'final',c,ch);check('INTEGRATED_ONCE_STANDALONE_FINAL_ZERO',status==0)
    s.final_snapshot=copy.deepcopy(s.fs.nodes);s.final_rows=copy.deepcopy(s.rows_base)
    next_client(s);c,ch=root_control(s,k,auth,'gate','FAILED_EXIT_PERMIT',expectedWrapperExit=1,actualFinalStatus=0,finalSeparateStatusCaptured=True,readinessInspected=True,oldNormalBindingsUnchanged=True,issuedAtEpoch=1001)
    s.epoch=1002;u,status=invoke(s,k,a,auth,buffers,'gate',c,ch);check('INTEGRATED_GATE_ZERO_EXPLICIT_WRAPPER_ONE_ONLY',status==0)
    next_client(s,True);c,ch=root_control(s,k,auth,'postclose','ACTUAL_WRAPPER_RESULT',actualWrapperExit=1,separatelyCaptured=True,actualToolEvidence=['SYNTHETIC_ACTUAL_WRAPPER1'])
    u,status=invoke(s,k,a,auth,buffers,'postclose',c,ch);check('INTEGRATED_SEPARATE_OUTER_POSTCLOSE_ZERO',status==0)
    return u


def tests():
    s,k,a,auth,buffers=build()
    with patch.dict(A.__dict__,MANIFEST06=s.package_sha),patch.object(fcntl,'flock',lambda fd,flags:(_ for _ in ()).throw(OSError(errno.EAGAIN,'HELD'))):
        u=protocol_flow(s,k,a,auth,buffers)
    check('FULL_FLOW_ZERO_NATIVE_OR_COMPILER_ENTRY',all(x['command'][0] in('/synthetic/ps','/synthetic/lsof','/synthetic/git') for x in u.utilities))
    check('FULL_FLOW_RETAINS_ACTUAL_FINITE2253_SEVEN_AND_STARTLESS',k['finiteUnion']['numericCountExcludingControllers']==2255 and len(k['finiteUnion']['historicalPidStartsRequiringAbsentOrReused'])==7 and k['finiteUnion']['startlessCandidate']['pid']==73492)
    stored=P.decode(s.fs.nodes[str(A.N/'postclose.json')]['raw'])
    check('FULL_FLOW_6_INHERITED_AND_30_NODES',len(stored['first']['resources']['inheritedMatched'])==6 and len(stored['first']['resources']['workerCandidates']['inheritedMatched'])==30)
    # No old E/W mutation: archives are separate and dependency link remains ENTRY only.
    check('FULL_FLOW_OLD2263_UNCHANGED',all(P.sha(s.fs.nodes[str(A.E/r['path'])]['raw'])==r['sha256'] for r in k['frozenEvidence']['oldMembers']))
    check('ARCHIVE_DEPENDENCY_ENTRY_NOT_TARGET_COPIED',s.fs.nodes[str(A.N/'complete-failed-workspace-archive/repo/studio-runner/node_modules')]['kind']=='symlink' and not any(n.startswith(str(A.N/'complete-failed-workspace-archive/repo/studio-runner/node_modules')+'/') for n in s.fs.nodes))
    check('FINAL_FAILURE_AND_GAPS_UNCHANGED',P.decode(s.fs.nodes[str(A.N/'readiness.json')]['raw'])['retainedFailure']==k['retainedFailure'])
    for mode in ('prepare','red','green','install-fixed','compile','cleanup'):
        denied('NO_NATIVE_MODE_'+mode,lambda m=mode:A.run(m,auth,root_raw=P.packed(a),code_buffers=buffers,system=s),'EXACT_FAILED_RESOURCE_CLI')
    # Pure joins use actual finite union and never infer reuse of the startless number.
    rows={1:dict(pid=1,ppid=0,start='NOW',gatewayMarkerCandidate=False),2:dict(pid=2,ppid=1,start='PROBE',gatewayMarkerCandidate=False)}
    current=dict(pid=1,start='NOW');probe=dict(pid=2,observedStart='PROBE',terminal=True,status=0,command=['ps'],executableSha256='a'*64)
    check('FINITE_UNION_BASE_ACCEPTS',P.finite_join(rows,k,[current],current,set(),probe)['startlessNumericAbsent'] is True)
    altered=copy.deepcopy(rows);altered[73492]=dict(pid=73492,ppid=0,start='NEW',gatewayMarkerCandidate=False)
    denied('STARTLESS_PRESENT_REUSE_STILL_HOLD',lambda:P.finite_join(altered,k,[current],current,set(),probe),'STARTLESS_NUMERIC_PRESENT_HOLD')
    for index,old in enumerate(k['finiteUnion']['historicalPidStartsRequiringAbsentOrReused']):
        altered=copy.deepcopy(rows);altered[old['pid']]=dict(pid=old['pid'],ppid=0,start=old['start'],gatewayMarkerCandidate=False)
        denied('SEVEN_RECORDED_PAIR_SAMESTART_'+str(index),lambda rr=altered:P.finite_join(rr,k,[current],current,set(),probe),'HISTORICAL_SAME_START_LIVE')
        altered[old['pid']]['start']='DIFFERENT_CURRENT_START';check('SEVEN_REUSE_QUALIFIED_'+str(index),P.finite_join(altered,k,[current],current,set(),probe)['sevenHistoricalPairsAbsentOrReused'] is True)
    altered=copy.deepcopy(rows);altered[3]=dict(pid=3,ppid=1,start='UNBOUND',gatewayMarkerCandidate=False)
    denied('NO_CURRENT_SUBTREE_EXEMPTION',lambda:P.finite_join(altered,k,[current],current,set(),probe),'UNACCOUNTED_DESCENDANTS')
    for value in (-1,60.001):denied('FRESHNESS_DENY_'+str(value),lambda v=value:P.freshness(1000+v,1000,1000))
    gate_adverse_from_final_snapshot(s,k,a,auth,buffers)
    adverse_tests()
    guard=SRC['guard-failed-red.bash'].decode();body=guard.split("-B -c '",1)[1].split("' \"$GATEWAY_FR03_ENTRY\"",1)[0];ast.parse(body)
    check('READONLY_DISTINCT_GUARD_NO_OLD_EXIT_REDEFINITION','readonly -f gateway80_failed_red03_exit' in guard and 'readonly GATEWAY_FR03_FINAL_STARTED=1' in guard and guard.count('builtin exit 1')==1 and '\nexit()' not in guard)
    check('ZERO_REAL_BOUNDARY_CALLS',BLOCKED==[])

def gate_adverse_from_final_snapshot(original,k,a,auth,buffers):
    for kind in ('stale-before','stale-after','repeat-final','wrong-permit-status','changed-old-binding'):
        s=Machine();s.fs.nodes=copy.deepcopy(original.final_snapshot);MemPath.fs=s.fs;s.rows_base=copy.deepcopy(original.final_rows);s.current=900090;s.epoch=1002
        s.package_sha=original.package_sha;s.source_names=list(original.source_names)
        mode='final' if kind=='repeat-final' else 'gate'
        if mode=='final':
            control,ch=root_control(s,k,auth,mode,'ACTUAL_ARCHIVE_REVIEW',actualArchiveExit=0,actualQaReviewed=True,archiveInspected=True,separatelyCaptured=True)
        else:
            if kind=='changed-old-binding':
                path=str(A.N/'root-guard-admission.json');value=P.decode(s.fs.nodes[path]['raw']);value['oldNormalBindingsUnchanged']=False;s.fs.nodes[path]['raw']=P.packed(value)
            control,ch=root_control(s,k,auth,mode,'FAILED_EXIT_PERMIT',expectedWrapperExit=1,actualFinalStatus=True if kind=='wrong-permit-status' else 0,finalSeparateStatusCaptured=True,readinessInspected=True,oldNormalBindingsUnchanged=True,issuedAtEpoch=1001)
        if kind=='stale-before':s.epoch=1062
        if kind=='stale-after':
            calls=[0]
            def clock():calls[0]+=1;return 1002 if calls[0]<4 else 1062
            s.now=clock
        with patch.dict(A.__dict__,MANIFEST06=s.package_sha),patch.object(fcntl,'flock',lambda fd,flags:(_ for _ in ()).throw(OSError(errno.EAGAIN,'HELD'))):
            denied('ACTUAL_PROTOCOL_GATE_'+kind,lambda:invoke(s,k,a,auth,buffers,mode,control,ch))
        check('ACTUAL_PROTOCOL_NO_GATE_ALLOW_'+kind,str(A.N/'gate-allow.json') not in s.fs.nodes)
        if kind=='stale-before':check('STALE_BEFORE_NO_GATE_ATTEMPT_WRITTEN',str(A.N/'gate-attempt.json') not in s.fs.nodes)
        if kind=='stale-after':check('STALE_AFTER_QUALIFICATION_ATTEMPT_RETAINED',str(A.N/'gate-attempt.json') in s.fs.nodes)

def registered():
    s,k,a,auth,buffers=build();unit=new_unit(s,a,auth,k,buffers)
    old=A.MANIFEST06;A.MANIFEST06=s.package_sha
    try:
        with patch.object(fcntl,'flock',lambda fd,flags:(_ for _ in ()).throw(OSError(errno.EAGAIN,'HELD'))):unit.register()
    finally:A.MANIFEST06=old
    return s,k,a,auth,buffers,unit

def adverse_tests():
    # Distinct actual-function cases have fresh fake units; failed journals are never
    # removed/reclassified within a case to obtain a later pass.
    for name,change,reason in [
        ('stderr',lambda s:setattr(s,'stderr','SYNTHETIC_ERROR'),'UTILITY_PARTIAL_OR_NONZERO_OR_STDERR'),
        ('timeout',lambda s:setattr(s,'timeout',True),None)]:
        s,k,a,auth,buffers,u=registered();change(s)
        denied('ACTUAL_UTILITY_'+name,lambda:u.capture(['/bin/ps','-ww','-p','1','-o','command=']),reason)
        newest=u.utilities[-1]
        check('ACTUAL_UTILITY_UNKNOWN_JOURNALED_'+name,newest['classification']=='UNKNOWN_CURRENT_UTILITY' and any(n.startswith(str(A.N/'utility-')) for n in s.fs.nodes))
        if name=='timeout':check('TIMEOUT_NO_FAKE_TERMINAL_OR_SIGNAL',newest['terminal'] is False and u.pending!=[] and newest['partialStdoutAvailable'] is True)
        u.close()
    s,k,a,auth,buffers,u=registered()
    for mode in ('red','green','compile'):
        denied('NO_BOUND_NATIVE_CAPTURE_'+mode,lambda m=mode:u.capture([m]),'UTILITY_CANONICAL_BINDING')
    # Old body/mode, external code/control substitution and unexpected new files.
    original=s.fs.nodes[str(A.E/'hold.json')]['raw'];s.fs.nodes[str(A.E/'hold.json')]['raw']=original+b'X'
    denied('OLD_E_BODY_SUBSTITUTION',u.check_members,'OLD_E_BYTES_CHANGED');s.fs.nodes[str(A.E/'hold.json')]['raw']=original
    s.fs.put(A.N/'unapproved.private',b'SYNTHETIC')
    denied('N_UNKNOWN_MEMBER_BEFORE_READ',u.check_members,'N_STRICT_MEMBER_NAME')
    u.close()
    s,k,a,auth,buffers,u=registered();path=str(A.N/'protocol.py');s.fs.nodes[path]['raw']+=b'\n#CHANGED'
    denied('INSTALLED_CODE_SUBSTITUTION',u.check_members,'VERIFIED_CONSUMED_BUFFER_CHANGED');u.close()
    s,k,a,auth,buffers,u=registered();path=a['pythonRoles']['process']['path'];s.fs.nodes[path]['raw']=b'CHANGED_APP'
    denied('CURRENT_MAPPED_PROCESS_BINARY_CHANGE',lambda:u.client_identity(u.table()[s.pid()]),'VERIFIED_CONSUMED_BUFFER_CHANGED');u.close()
    s,k,a,auth,buffers,u=registered();s.python=lambda:dict(reported='/synthetic/python-app',observedArgument='/synthetic/python-bin')
    denied('BIN_APP_ROLE_SWAP',lambda:u.client_identity(u.table()[s.pid()]),'BIN_APP_ROLE_MISMATCH');u.close()
    # Actual06 strict lsof parser, including association between p/f/i/n fields.
    s,k,a,auth,buffers,u=registered();good='p3720\nf3\ni215213569\nn'+str(A.R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock')+'\n'
    for name,bad in [('wrong-pid',good.replace('p3720','p3721')),('fd-access',good.replace('f3','f3u')),('cross-record',good.replace('i215213569','f4\ni215213569')),('wrong-name',good.replace('gradle.lock','other.lock'))]:
        denied('ACTUAL06_LOCK_'+name,lambda v=bad:u.d.strict_lock_fields(v,3720,215213569,str(A.R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock')))
    check('D_E_ORIGINAL_NEVER_N',str(u.d.E)==str(A.E) and str(u.d.E)!=str(A.N));u.close()
    # Pending/unknown utilities prevent explicit custody cleanup; no observer claims
    # its own terminal state, nor requires future operation terminal facts to start.
    s,k,a,auth,buffers,u=registered();u.pending.append(object());before=len(s.fs.fds);u.close();check('UNRESOLVED_CUSTODY_RETAINED',len(s.fs.fds)==before and u in A.UNRESOLVED)
    # Actual retained-FD custody before body reads, and named-ancestor substitutions.
    s,k,a,auth,buffers=build();c=s.custody(A.N,0o700);original=s.fs.nodes[str(A.N)];s.fs.nodes[str(A.N)]=dict(original,ino=original['ino']+1)
    denied('CUSTODY_ANCESTOR_REPLACEMENT',c.check,'CUSTODY_DIRECTORY_CHANGED');s.fs.nodes[str(A.N)]=original;c.close()
    s,k,a,auth,buffers=build();s.fs.nodes[str(A.N)]['mode']=0o755;s.fs.events=[]
    denied('CUSTODY_MODE_BEFORE_BODY',lambda:s.custody(A.N,0o700),'CUSTODY_OWNER_MODE');check('CUSTODY_MODE_NO_BODY_READ',not any(e[0]=='read' for e in s.fs.events))
    s,k,a,auth,buffers=build();c=s.custody(A.N,0o700);s.fs.short_write=True
    denied('CUSTODY_PARTIAL_WRITE_DENIED',lambda:c.write('partial.json',b'SYNTHETIC'),'WRITE_PARTIAL');c.close()
    s,k,a,auth,buffers,u=registered();parent=s.custody(A.W/'repo/studio-runner');parent.symlink('unexpected-link','/unrelated/private');parent.close();s.fs.events=[]
    denied('ARCHIVE_ONLY_DEPENDENCY_LINK_ENTRY',lambda:u.bounded_inventory(A.W),'ONLY_DEPENDENCY_LINK_ENTRY');check('UNAPPROVED_LINK_TARGET_NEVER_OPENED',not any(e[0]=='open' and e[1]=='/unrelated/private' for e in s.fs.events));u.close()
    s,k,a,auth,buffers,u=registered();helper=str(A.W/'repo/helm-chart/put-checks/templates/_helpers.tpl');s.fs.nodes[helper]['raw']=LIB['banks/fixed-helper.tpl']
    denied('FAILED_ARCHIVE_REQUIRES_ORIGINAL_HELPER',lambda:u.d.workspace_guard('original'),'COPIED_INPUT_CHANGED');u.close()
    s,k,a,auth,buffers,u=registered();s.rows_base.pop(2366)
    resources=u.d.boundary(u.hold,u.C,u.original)
    check('ACTUAL06_INHERITED_ABSENCE_PERMITTED_NOT_SIX_LIVE',len(resources['inheritedMatched'])==5 and len(resources['originalIdentitiesAbsent'])==1);u.close()
    s,k,a,auth,buffers,u=registered();pid=57673
    s.extra[pid]=dict(pid=pid,ppid=1,start='Mon Oct 19 16:00:00 2026',argv='node unrelated-current',comm=u.d.SCOPE['node'])
    state=u.d.worker_candidates(u.original,u.C)
    check('OLD_UTILITY_PID_OCCUPANT_POSITIVELY_UNRELATED_NOT_EXEMPT',len(state['unrelatedVerified'])==1 and not state['unknownCandidates'])
    s.extra[pid]['argv']='node vitest.mjs new-worker'
    denied('OLD_UTILITY_PID_NEW_RELEVANT_NODE_HOLD',lambda:u.d.boundary(u.hold,u.C,u.original),'RESIDENT_WORKER_OR_UNKNOWN_CANDIDATE');u.close()
    s,k,a,auth,buffers,u=registered();s.fs.nodes[str(A.R/s.source_names[0])]['raw']=b'CHANGED_SOURCE'
    denied('ACTUAL06_SOURCE_CHANGED',lambda:u.d.guards(u.original,u.C),'SOURCE_BYTES_OR_MODE_CHANGED');u.close()
    s,k,a,auth,buffers,u=registered();dep=str(MemPath(u.d.SCOPE['dependencies'])/'fixture');s.fs.nodes[dep]['raw']+=b'X'
    denied('ACTUAL06_DEPENDENCY_CHANGED',lambda:u.d.guards(u.original,u.C),'DEPENDENCY_TREE_CHANGED');u.close()
    s,k,a,auth,buffers,u=registered();c=s.custody(A.W/'cache');c.write('generated.bin',b'GENERATED',0o600);c.close()
    rows=u.bounded_inventory(A.W);chart=u.bounded_inventory(MemPath(A.W)/'repo/helm-chart/put-checks')
    u.copy_tree(MemPath(A.W),MemPath(A.N)/'complete-failed-workspace-archive',rows);u.copy_tree(MemPath(A.W)/'repo/helm-chart/put-checks',MemPath(A.N)/'original-chart-archive',chart)
    u.c.mkdir('red-artifact-archive',0o700);dst=s.custody(MemPath(A.N)/'red-artifact-archive');budget=u.copy_budget()
    try:
        for row in k['frozenEvidence']['rawArtifactRefs']:
            st=u.old.info(row['path']);expected=dict(row,dev=st.st_dev,ino=st.st_ino,uid=st.st_uid,mtimeNs=st.st_mtime_ns,ctimeNs=st.st_ctime_ns)
            u.copy_entry(budget);dst.copy_from(u.old,row['path'],expected,budget)
    finally:dst.close()
    u.write('archive-receipt.json',dict(releaseSha256=auth,retainedFailure=k['retainedFailure'],workspaceInventory=rows,chartInventory=chart,rawArtifacts=k['frozenEvidence']['rawArtifactRefs']))
    u.check_archives();check('ARCHIVE_ACTUAL_GENERATED_ENTRIES_NOT_FAKE42_TREE',len(rows)==43)
    s.fs.nodes[str(A.W/'cache/generated.bin')]['raw']+=b'X'
    denied('FAILED_W_GENERATED_OUTPUT_DRIFT',u.check_archives,'ORIGINAL_FAILED_W_ARCHIVE_DRIFT');u.close()
    s,k,a,auth,buffers,u=registered();bad=dict(a,expectedWrapperExit=0)
    denied('ROOT_ZERO_WRAPPER_FORBIDDEN',lambda:P.authority(bad,k),'FAILED_ONLY')
    bad=dict(a,newNativeInvocations=1);denied('ROOT_NATIVE_RETRY_FORBIDDEN',lambda:P.authority(bad,k),'FAILED_ONLY')
    bad=dict(a,credit=True);denied('ROOT_CREDIT_FORBIDDEN',lambda:P.authority(bad,k),'NO_SOURCE_NATIVE_CREDIT')
    denied('MISSING_EXTERNAL_N_CONTROL_PIN',lambda:u.document(A.N/'root-close-permit.json'),'EXTERNAL_PIN_REQUIRED')
    denied('WRONG_ROOT_ROLE',lambda:u.validate_root(dict(authorizedBy='root',role='NORMAL_GATE'),'FAILED_EXIT_PERMIT'),'ROOT_ROLE_OR_SCOPE');u.close()

sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),
        (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),
        (socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,blocked))
    tests()
result=dict(kind='FULL_ACTUAL_FAILED_RESOURCE_AND_VERIFIED06_IN_MEMORY_BOUNDARY_CHECKS',passed=len(RESULTS),failed=0,checks=RESULTS,realBoundaryCalls=BLOCKED,
    sourcePins={n:hashlib.sha256(v).hexdigest() for n,v in SRC.items()},syntheticInputHashesExplicitlyDifferent=True,originalFinite2253NumbersAndSevenPairsAndStartlessPreserved=True,
    protectedBaselineBodyRead=False,actualRuntimeNativeKernelOrNamespaceActions=0,executionReady=False)
(HERE/'check-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in('checks','sourcePins')}))
