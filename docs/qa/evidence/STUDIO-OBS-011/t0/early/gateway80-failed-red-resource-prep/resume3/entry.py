"""Verified-buffer bootstrap only. Invoke through externally SHA-pinned loader, never raw."""
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import types

N=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs009-gateway80-offtree03-20261019/failed-red-resource-disposition02')

def root_read(path,cap=16777216,failure_sink=None):
    """Retain each ancestor; inspect owner/fullmode and leaf fd/name before using bytes."""
    if failure_sink is None:raise BootstrapValueError('OUTER_FAILURE_SINK_REQUIRED')
    path=Path(path);fds=[];chain=[]
    def own(fd):fds.append(fd);failure_sink.bootstrap_fds.append(fd)
    key=lambda x:(x.st_dev,x.st_ino,x.st_mode,x.st_uid)
    try:
        fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);own(fd);chain.append((None,'/',fd,key(os.fstat(fd))))
        for name in path.parts[1:-1]:
            parent=fd;fd=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent);own(fd);chain.append((parent,name,fd,key(os.fstat(fd))))
        parent=fd;fd=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=parent);own(fd);before=os.fstat(fd)
        if not(stat.S_ISREG(before.st_mode) and before.st_uid==os.getuid() and stat.S_IMODE(before.st_mode)==0o600 and before.st_nlink==1 and 0<=before.st_size<=cap):raise BootstrapValueError('BOOTSTRAP_LEAF')
        left=before.st_size;parts=[]
        while left:
            raw=os.read(fd,min(left,1048576))
            if type(raw)is not bytes or not 0<len(raw)<=min(left,1048576):raise BootstrapValueError('BOOTSTRAP_SHORT')
            parts.append(raw);left-=len(raw)
        after=os.fstat(fd);named=os.stat(path.name,dir_fd=parent,follow_symlinks=False)
        if key(before)+(before.st_size,before.st_mtime_ns)!=key(after)+(after.st_size,after.st_mtime_ns) or key(after)!=key(named):raise BootstrapValueError('BOOTSTRAP_CHANGED')
        for p,name,handle,want in chain:
            named=os.stat(name,follow_symlinks=False) if p is None else os.stat(name,dir_fd=p,follow_symlinks=False)
            if key(os.fstat(handle))!=want or key(named)!=want:raise BootstrapValueError('BOOTSTRAP_ANCESTOR')
        leaf_parent=os.fstat(parent)
        if stat.S_IMODE(leaf_parent.st_mode)!=0o700 or leaf_parent.st_uid!=os.getuid():raise BootstrapValueError('BOOTSTRAP_N_MODE')
        return b''.join(parts)
    finally:
        primary=sys.exc_info()[1];errors=[]
        for fd in reversed(fds):
            try:os.close(fd);failure_sink.bootstrap_fds.remove(fd)
            except BaseException:errors.append(fd)
        if errors:
            cleanup=BootstrapValueError('BOOTSTRAP_CLOSE_UNCONFIRMED');failure_sink.cleanup(cleanup)
            if primary is None:raise cleanup

def pairs(values):
    out={}
    for key,value in values:
        if key in out:raise BootstrapValueError('DUPLICATE_ROOT_CONTROL')
        out[key]=value
    return out

def execute(mode,auth_sha,control_sha=None,failure_sink=None):
    if failure_sink is None:raise BootstrapValueError('OUTER_FAILURE_SINK_REQUIRED')
    failure_sink.stage='AUTHORITY_BUFFER'
    raw=root_read(N/'root-authorization.json',failure_sink=failure_sink)
    if hashlib.sha256(raw).hexdigest()!=auth_sha:raise BootstrapValueError('EXTERNAL_AUTH_SHA')
    failure_sink.stage='AUTHORITY_SHAPE'
    authority=json.loads(raw.decode('utf-8','strict'),object_pairs_hook=pairs)
    names={'failed_gateway.py','custody.py','protocol.py','guard-failed-red.bash','contract.json','entry.py'}
    if authority.get('authorizedBy')!='root' or authority.get('authorized') is not True or set(authority.get('codePins',{}))!=names:raise BootstrapValueError('CODE_ROOT_PINS')
    buffers={}
    failure_sink.stage='N02_MEMBERSHIP'
    for name in names:
        data=root_read(N/name,failure_sink=failure_sink)
        if hashlib.sha256(data).hexdigest()!=authority['codePins'][name]:raise BootstrapValueError('CODE_VERIFIED_BUFFER')
        buffers[name]=data
    modules={}
    for name in ('custody.py','protocol.py'):
        module=types.ModuleType('_verified_failed_'+name);exec(compile(buffers[name],'<verified-'+name+'>','exec'),module.__dict__);modules[name]=module
    ns={'__name__':'_verified_failed_gateway','Custody':modules['custody.py'].Custody,'P':modules['protocol.py']}
    exec(compile(buffers['failed_gateway.py'],'<verified-failed-gateway>','exec'),ns)
    return ns['run'](mode,auth_sha,control_sha,root_raw=raw,code_buffers=buffers,failure_sink=failure_sink)

if __name__=='__main__':
    raise SystemExit('HOLD: EXTERNALLY HASH-VERIFIED BUFFER ENTRY REQUIRED')
