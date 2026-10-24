"""Selected C8code04 retained-FD patterns, explicit API and bounded binary IO.

No main/import effects. Parameterized for NEW Gateway N, never old C8 authority.
"""
import json
import os
from pathlib import Path
import stat

class Hold(Exception):pass
def need(value,reason):
    if value is not True:raise Hold(reason)
def member(name):return type(name)is str and name not in ('','.','..') and '/' not in name and '\x00' not in name

def key(st):return st.st_dev,st.st_ino,st.st_mode,st.st_uid
def filekey(st):return key(st)+(st.st_size,st.st_mtime_ns,st.st_ctime_ns)

class Custody:
    key=staticmethod(key)
    def __init__(self,path,mode=None,api=os):
        self.api,self.path,self.chain=api,Path(path),[]
        need(self.path.is_absolute() and '..' not in self.path.parts,'CUSTODY_PATH')
        try:
            fd=api.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
            self.chain.append((None,'/',fd,key(api.fstat(fd))))
            for name in self.path.parts[1:]:
                parent=fd;fd=api.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
                self.chain.append((parent,name,fd,key(api.fstat(fd))))
            self.fd=fd;self.check();st=api.fstat(fd)
            need(mode is None or (stat.S_IMODE(st.st_mode)==mode and st.st_uid==api.getuid()),'CUSTODY_OWNER_MODE')
        except BaseException:self.close();raise
    def check(self):
        for parent,name,fd,want in self.chain:
            actual=self.api.fstat(fd)
            named=self.api.stat(name,follow_symlinks=False) if parent is None else self.api.stat(name,dir_fd=parent,follow_symlinks=False)
            need(stat.S_ISDIR(actual.st_mode) and key(actual)==want==key(named),'CUSTODY_DIRECTORY_CHANGED')
    def info(self,name):
        need(member(name),'MEMBER');self.check();st=self.api.stat(name,dir_fd=self.fd,follow_symlinks=False);self.check();return st
    def absent(self,name):
        try:self.info(name)
        except FileNotFoundError:return True
        return False
    def members(self):
        self.check();names=self.api.listdir(self.fd);self.check()
        need(all(member(n) for n in names) and len(names)==len(set(names)),'CUSTODY_MEMBERS');return sorted(names)
    def read(self,name,mode=None,cap=16777216):
        need(member(name),'MEMBER');self.check();fd=self.api.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=self.fd)
        try:
            before=self.api.fstat(fd)
            need(stat.S_ISREG(before.st_mode) and before.st_uid in (0,self.api.getuid()) and 0<=before.st_size<=cap and (mode is None or stat.S_IMODE(before.st_mode)==mode),'FILE_OWNER_MODE_CAP')
            chunks=[];left=before.st_size
            while left:
                raw=self.api.read(fd,min(left,1048576));need(type(raw)is bytes and 0<len(raw)<=left,'READ_PARTIAL');chunks.append(raw);left-=len(raw)
            need(self.api.read(fd,1)==b'','READ_GROWTH')
            need(filekey(before)==filekey(self.api.fstat(fd))==filekey(self.info(name)),'FILE_IDENTITY_CHANGED');self.check();return b''.join(chunks),before
        finally:self.api.close(fd)
    def write(self,name,raw,mode=0o600):
        need(member(name) and type(raw)is bytes,'WRITE_BYTES');self.check()
        fd=self.api.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode,dir_fd=self.fd)
        try:
            before=self.api.fstat(fd)
            need(stat.S_ISREG(before.st_mode) and stat.S_IMODE(before.st_mode)==mode and before.st_uid==self.api.getuid() and before.st_nlink==1 and key(before)==key(self.info(name)),'EXCLUSIVE_OUTPUT')
            offset=0
            while offset<len(raw):
                n=self.api.write(fd,raw[offset:]);need(type(n)is int and 0<n<=len(raw)-offset,'WRITE_PARTIAL');offset+=n
            self.api.fsync(fd);need(key(before)==key(self.api.fstat(fd))==key(self.info(name)),'OUTPUT_IDENTITY_CHANGED');self.check();self.api.fsync(self.fd)
        finally:self.api.close(fd)
        self.check()
    def mkdir(self,name,mode):
        need(member(name),'MKDIR_NAME');self.check();self.api.mkdir(name,0o700,dir_fd=self.fd)
        fd=self.api.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=self.fd)
        try:self.api.fchmod(fd,mode)
        finally:self.api.close(fd)
        self.check()
    def symlink(self,name,target):
        need(member(name) and type(target)is str,'LINK_ENTRY');self.check();self.api.symlink(target,name,dir_fd=self.fd);self.check()
    def readlink(self,name):
        st=self.info(name);need(stat.S_ISLNK(st.st_mode),'LINK_ENTRY_TYPE');target=self.api.readlink(name,dir_fd=self.fd);need(key(st)==key(self.info(name)),'LINK_CHANGED');return target
    def close(self):
        errors=[]
        for _,_,fd,_ in reversed(self.chain):
            try:self.api.close(fd)
            except BaseException:errors.append(fd)
        self.chain=[row for row in self.chain if row[2] in errors]
        need(not errors,'CUSTODY_CLOSE_UNCONFIRMED')
