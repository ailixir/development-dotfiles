"""Externally pinned first-read loader. Definitions only; no main or implicit invocation.

The root caller must verify this loader's consumed bytes against an external literal SHA
before compile. All following source specs are external literal arguments, never self-pins.
"""
import hashlib
import stat
import types

NAMES=('qualification_custody.py','public_contract.py','qualified_relay.py','qualification_controller.py')
RETAINED=[]

class BootstrapHold(Exception):
    pass

def need(ok):
    if ok is not True:raise BootstrapHold('FIRST_READ_INTEGRITY')

def key(info):
    return (info.st_dev,info.st_ino,info.st_mode,info.st_uid,info.st_nlink,info.st_size,info.st_mtime_ns,info.st_ctime_ns)

class Load:
    def __init__(self,filesystem):
        self.fs=filesystem;self.records=[];self.owners=[];self.buffers={};self.primary='NONE';self.cleanup='NONE'
    def opened(self,*args,**kwargs):
        fd=self.fs.open(*args,**kwargs)
        record=dict(fd=fd,state='OPEN')
        self.records.append(record)
        return fd
    def close_all(self):
        for record in reversed(self.records):
            if record['state']=='OPEN':
                record['state']='UNKNOWN'
                try:self.fs.close(record['fd'])
                except BaseException:self.cleanup='BOOTSTRAP_CLOSE_UNCONFIRMED'
                else:record['state']='CLOSED'
        if self.cleanup!='NONE':RETAINED.append(self)
    def read(self,spec):
        need(type(spec) is dict and set(spec)=={'path','sha256','bytes','mode','uid','aliases'})
        path=spec['path'];need(type(path) is str and path.startswith('/') and '\x00' not in path)
        parts=path.split('/')[1:];need(parts and len(parts)<128 and all(x not in ('','..','.') for x in parts))
        need(type(spec['bytes']) is int and 0<spec['bytes']<=1048576 and type(spec['mode']) is int and spec['mode'] in (0o600,0o644)
             and type(spec['uid']) is int and spec['uid']>=0 and type(spec['aliases']) is list and spec['aliases']==[])
        need(type(spec['sha256']) is str and len(spec['sha256'])==64 and all(x in '0123456789abcdef' for x in spec['sha256']))
        directory=self.opened('/',self.fs.O_RDONLY|self.fs.O_DIRECTORY|self.fs.O_NOFOLLOW)
        chain=[(None,'/',directory,key(self.fs.fstat(directory))[:4])]
        for part in parts[:-1]:
            parent=directory;directory=self.opened(part,self.fs.O_RDONLY|self.fs.O_DIRECTORY|self.fs.O_NOFOLLOW,dir_fd=parent)
            chain.append((parent,part,directory,key(self.fs.fstat(directory))[:4]))
        def check():
            for parent,name,fd,expected in chain:
                actual=self.fs.fstat(fd)
                named=self.fs.stat(name,follow_symlinks=False) if parent is None else self.fs.stat(name,dir_fd=parent,follow_symlinks=False)
                need(stat.S_ISDIR(actual.st_mode) and key(actual)[:4]==expected==key(named)[:4])
        check()
        fd=self.opened(parts[-1],self.fs.O_RDONLY|self.fs.O_NOFOLLOW,dir_fd=directory)
        before=self.fs.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid==spec['uid'] and before.st_nlink==1
             and stat.S_IMODE(before.st_mode)==spec['mode'] and before.st_size==spec['bytes'])
        pieces=[];remaining=spec['bytes']
        while remaining:
            piece=self.fs.read(fd,min(65536,remaining))
            need(type(piece) is bytes and 0<len(piece)<=remaining)
            pieces.append(piece);remaining-=len(piece)
        need(self.fs.read(fd,1)==b'')
        need(key(before)==key(self.fs.fstat(fd))==key(self.fs.stat(parts[-1],dir_fd=directory,follow_symlinks=False)))
        check();raw=b''.join(pieces)
        need(hashlib.sha256(raw).hexdigest()==spec['sha256'])
        return raw
    def load(self,specs,optimize=0):
        try:
            need(type(specs) is dict and set(specs)==set(NAMES) and type(optimize) is int and optimize in (0,1,2))
            # All raw buffers and every acquired close qualify before ANY source interpretation.
            for name in NAMES:
                need(specs[name]['path'].endswith('/'+name));self.buffers[name]=self.read(specs[name])
        except BaseException:
            self.primary='FIRST_READ_INTEGRITY'
        finally:self.close_all()
        if self.primary!='NONE' or self.cleanup!='NONE':
            RETAINED.append(self);raise BootstrapHold(self.cleanup if self.cleanup!='NONE' else self.primary)
        modules={}
        for name in NAMES:
            module=types.ModuleType('qualified_'+name[:-3]);self.owners.append(module)
            exec(compile(self.buffers[name],specs[name]['path'],'exec',optimize=optimize),module.__dict__)
            module.__source_sha256__=hashlib.sha256(self.buffers[name]).hexdigest()
            modules[{'qualification_custody.py':'custody','public_contract.py':'contract','qualified_relay.py':'relay',
                     'qualification_controller.py':'controller'}[name]]=module
        return modules
