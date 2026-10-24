"""Verified-buffer bootstrap only. Invoke through externally SHA-pinned loader, never raw."""
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import types

N=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs009-gateway80-offtree03-20261019/failed-red-resource-disposition01')

def root_read(path,cap=16777216,failure_sink=None):
    """Retain each ancestor; inspect owner/fullmode and leaf fd/name before using bytes."""
    if failure_sink is None:raise ValueError('OUTER_FAILURE_SINK_REQUIRED')
    path=Path(path);fds=[];chain=[]
    def own(fd):fds.append(fd);failure_sink.bootstrap_fds.append(fd)
    key=lambda x:(x.st_dev,x.st_ino,x.st_mode,x.st_uid)
    try:
        fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);own(fd);chain.append((None,'/',fd,key(os.fstat(fd))))
        for name in path.parts[1:-1]:
            parent=fd;fd=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent);own(fd);chain.append((parent,name,fd,key(os.fstat(fd))))
        parent=fd;fd=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=parent);own(fd);before=os.fstat(fd)
        if not(stat.S_ISREG(before.st_mode) and before.st_uid==os.getuid() and stat.S_IMODE(before.st_mode)==0o600 and before.st_nlink==1 and 0<=before.st_size<=cap):raise ValueError('BOOTSTRAP_LEAF')
        left=before.st_size;parts=[]
        while left:
            raw=os.read(fd,min(left,1048576))
            if type(raw)is not bytes or not 0<len(raw)<=min(left,1048576):raise ValueError('BOOTSTRAP_SHORT')
            parts.append(raw);left-=len(raw)
        after=os.fstat(fd);named=os.stat(path.name,dir_fd=parent,follow_symlinks=False)
        if key(before)+(before.st_size,before.st_mtime_ns)!=key(after)+(after.st_size,after.st_mtime_ns) or key(after)!=key(named):raise ValueError('BOOTSTRAP_CHANGED')
        for p,name,handle,want in chain:
            named=os.stat(name,follow_symlinks=False) if p is None else os.stat(name,dir_fd=p,follow_symlinks=False)
            if key(os.fstat(handle))!=want or key(named)!=want:raise ValueError('BOOTSTRAP_ANCESTOR')
        leaf_parent=os.fstat(parent)
        if stat.S_IMODE(leaf_parent.st_mode)!=0o700 or leaf_parent.st_uid!=os.getuid():raise ValueError('BOOTSTRAP_N_MODE')
        return b''.join(parts)
    finally:
        errors=[]
        for fd in reversed(fds):
            try:os.close(fd);failure_sink.bootstrap_fds.remove(fd)
            except BaseException:errors.append(fd)
        if errors:raise ValueError('BOOTSTRAP_CLOSE_UNCONFIRMED')

def pairs(values):
    out={}
    for key,value in values:
        if key in out:raise ValueError('DUPLICATE_ROOT_CONTROL')
        out[key]=value
    return out

def execute(mode,auth_sha,control_sha=None,failure_sink=None):
    if failure_sink is None:raise ValueError('OUTER_FAILURE_SINK_REQUIRED')
    raw=root_read(N/'root-authorization.json',failure_sink=failure_sink)
    if hashlib.sha256(raw).hexdigest()!=auth_sha:raise ValueError('EXTERNAL_AUTH_SHA')
    authority=json.loads(raw.decode('utf-8','strict'),object_pairs_hook=pairs)
    names={'failed_gateway.py','custody.py','protocol.py','guard-failed-red.bash','contract.json','entry.py'}
    if authority.get('authorizedBy')!='root' or authority.get('authorized') is not True or set(authority.get('codePins',{}))!=names:raise ValueError('CODE_ROOT_PINS')
    buffers={}
    for name in names:
        data=root_read(N/name,failure_sink=failure_sink)
        if hashlib.sha256(data).hexdigest()!=authority['codePins'][name]:raise ValueError('CODE_VERIFIED_BUFFER')
        buffers[name]=data
    modules={}
    for name in ('custody.py','protocol.py'):
        module=types.ModuleType('_verified_failed_'+name);exec(compile(buffers[name],'<verified-'+name+'>','exec'),module.__dict__);modules[name]=module
    ns={'__name__':'_verified_failed_gateway','Custody':modules['custody.py'].Custody,'P':modules['protocol.py']}
    exec(compile(buffers['failed_gateway.py'],'<verified-failed-gateway>','exec'),ns)
    return ns['run'](mode,auth_sha,control_sha,root_raw=raw,code_buffers=buffers,failure_sink=failure_sink)

if __name__=='__main__':
    raise SystemExit('HOLD: EXTERNALLY HASH-VERIFIED BUFFER ENTRY REQUIRED')
