"""Retained no-follow descriptors; actual acquisition/copy budgets, no import effects."""
import hashlib
import os
from pathlib import Path
import stat
class Hold(Exception):pass
def need(value,reason):
    if value is not True:raise Hold(reason)
def member(name):return type(name)is str and name not in ('','.','..') and '/' not in name and '\x00' not in name
def key(st):return st.st_dev,st.st_ino,st.st_mode,st.st_uid
def filekey(st):return key(st)+(st.st_size,st.st_mtime_ns,st.st_ctime_ns)
def rowkey(row):return row['dev'],row['ino'],stat.S_IFREG|row['mode'],row['uid'],row['bytes'],row['mtimeNs'],row['ctimeNs']
class Custody:
    key=staticmethod(key)
    # Strong references precede the first open and outlive any unconfirmed close.
    OWNED=[]
    def __init__(self,path,mode=None,api=os):
        self.api,self.path,self.chain,self.leaves,self.failed_closes=api,Path(path),[],[],set()
        need(self.path.is_absolute() and '..' not in self.path.parts,'CUSTODY_PATH')
        self.OWNED.append(self)
        try:
            fd=api.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
            self.chain.append((None,'/',fd,None));self.chain[-1]=(None,'/',fd,key(api.fstat(fd)))
            for name in self.path.parts[1:]:
                parent=fd;fd=api.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
                self.chain.append((parent,name,fd,None));self.chain[-1]=(parent,name,fd,key(api.fstat(fd)))
            self.fd=fd;self.check();st=api.fstat(fd)
            need(mode is None or (stat.S_IMODE(st.st_mode)==mode and st.st_uid==api.getuid()),'CUSTODY_OWNER_MODE')
        except BaseException:self.close();raise
    def check(self):
        for parent,name,fd,want in self.chain:
            actual=self.api.fstat(fd)
            named=self.api.stat(name,follow_symlinks=False) if parent is None else self.api.stat(name,dir_fd=parent,follow_symlinks=False)
            need(want is not None and stat.S_ISDIR(actual.st_mode) and key(actual)==want==key(named),'CUSTODY_DIRECTORY_CHANGED')
    def acquire(self,name,flags,mode=0o600):
        need(member(name),'MEMBER');self.check()
        fd=self.api.open(name,flags|os.O_NOFOLLOW,mode,dir_fd=self.fd)
        self.leaves.append(fd)  # Ownership BEFORE any fstat/validation.
        return fd
    def release(self,fd):
        try:self.api.close(fd)
        except BaseException:self.failed_closes.add(fd);raise
        self.leaves.remove(fd)  # Unknown close retains the FD/reference.
    def info(self,name):
        need(member(name),'MEMBER');self.check();st=self.api.stat(name,dir_fd=self.fd,follow_symlinks=False);self.check();return st
    def absent(self,name):
        try:self.info(name)
        except FileNotFoundError:return True
        return False
    def members(self):
        self.check();names=self.api.listdir(self.fd);self.check()
        need(all(member(n) for n in names) and len(names)==len(set(names)),'CUSTODY_MEMBERS');return sorted(names)
    def read(self,name,mode=None,cap=16777216,expected=None):
        need(type(cap)is int and cap>=0,'READ_CAP');fd=self.acquire(name,os.O_RDONLY)
        try:
            before=self.api.fstat(fd)
            need(stat.S_ISREG(before.st_mode) and before.st_uid in (0,self.api.getuid()) and 0<=before.st_size<=cap and (mode is None or stat.S_IMODE(before.st_mode)==mode),'FILE_OWNER_MODE_CAP')
            need(expected is None or filekey(before)==filekey(expected),'READ_EXPECTED_METADATA')
            chunks=[];consumed=0
            while consumed<before.st_size:
                need(filekey(self.api.fstat(fd))==filekey(before),'FILE_IDENTITY_CHANGED')
                limit=min(before.st_size-consumed,cap-consumed,1048576);need(limit>0,'READ_CAP')
                raw=self.api.read(fd,limit)
                need(type(raw)is bytes and 0<len(raw)<=limit and consumed+len(raw)<=cap,'READ_PARTIAL')
                need(filekey(self.api.fstat(fd))==filekey(before),'FILE_IDENTITY_CHANGED')
                chunks.append(raw);consumed+=len(raw)
            need(consumed==before.st_size and filekey(before)==filekey(self.api.fstat(fd))==filekey(self.info(name)),'FILE_IDENTITY_CHANGED')
            self.check();return b''.join(chunks),before
        finally:self.release(fd)
    def output(self,name,mode):
        fd=self.acquire(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode);created=self.api.fstat(fd)
        need(stat.S_ISREG(created.st_mode) and created.st_uid==self.api.getuid() and created.st_nlink==1 and key(created)==key(self.info(name)),'EXCLUSIVE_OUTPUT_CUSTODY')
        self.api.fchmod(fd,mode);before=self.api.fstat(fd)
        need(key(created)[:2]==key(before)[:2],'EXCLUSIVE_OUTPUT_INODE')
        need(stat.S_ISREG(before.st_mode) and stat.S_IMODE(before.st_mode)==mode and before.st_uid==self.api.getuid() and before.st_nlink==1 and key(before)==key(self.info(name)),'EXCLUSIVE_OUTPUT')
        return fd,before
    def write(self,name,raw,mode=0o600):
        need(type(raw)is bytes,'WRITE_BYTES');fd=None
        try:
            fd,before=self.output(name,mode);offset=0
            while offset<len(raw):
                n=self.api.write(fd,raw[offset:]);need(type(n)is int and 0<n<=len(raw)-offset,'WRITE_PARTIAL');offset+=n
            self.api.fsync(fd);need(key(before)==key(self.api.fstat(fd))==key(self.info(name)),'OUTPUT_IDENTITY_CHANGED');self.check();self.api.fsync(self.fd)
        finally:
            if fd is not None:self.release(fd)
    def copy_from(self,source,name,row,budget):
        """Stream expected immutable source into exclusive leaf; retain partial bytes."""
        cap=budget['fileCap'];remaining=budget['byteCap']-budget['bytes']
        need(type(row['bytes'])is int and 0<=row['bytes']<=cap,'ARCHIVE_FILE_CAP_TYPE')
        need(row['bytes']<=remaining,'ARCHIVE_TOTAL_BYTE_CAP')
        source_fd=source.acquire(name,os.O_RDONLY);dest_fd=None
        try:
            before=source.api.fstat(source_fd)
            need(filekey(before)==rowkey(row) and filekey(source.info(name))==rowkey(row),'COPY_EXPECTED_METADATA')
            need(stat.S_ISREG(before.st_mode) and before.st_uid in(0,source.api.getuid()),'COPY_SOURCE_TYPE_OWNER')
            dest_fd,out=self.output(name,row['mode']);digest=hashlib.sha256();consumed=0
            while consumed<row['bytes']:
                need(filekey(source.api.fstat(source_fd))==rowkey(row)==filekey(source.info(name)),'COPY_SOURCE_CHANGED')
                limit=min(1048576,row['bytes']-consumed,cap-consumed,budget['byteCap']-budget['bytes']);need(limit>0,'COPY_BYTE_BUDGET')
                raw=source.api.read(source_fd,limit)
                need(type(raw)is bytes and 0<len(raw)<=limit,'COPY_READ_PARTIAL')
                # A growth detected during read cannot reach destination write.
                need(filekey(source.api.fstat(source_fd))==rowkey(row)==filekey(source.info(name)),'COPY_SOURCE_CHANGED')
                digest.update(raw);offset=0
                while offset<len(raw):
                    need(len(raw)-offset<=budget['byteCap']-budget['bytes'] and consumed+len(raw)<=cap,'COPY_BYTE_BUDGET')
                    n=self.api.write(dest_fd,raw[offset:]);need(type(n)is int and 0<n<=len(raw)-offset,'WRITE_PARTIAL');offset+=n;budget['bytes']+=n
                consumed+=len(raw)
            need(consumed==row['bytes'] and digest.hexdigest()==row['sha256'],'COPY_EXPECTED_BYTES')
            need(filekey(source.api.fstat(source_fd))==rowkey(row)==filekey(source.info(name)),'COPY_SOURCE_CHANGED')
            self.api.fsync(dest_fd)
            after=self.api.fstat(dest_fd)
            need(key(out)==key(after)==key(self.info(name)) and after.st_size==consumed,'COPY_OUTPUT_CHANGED')
            source.check();self.check();self.api.fsync(self.fd)
        finally:
            # Attempt every known close; retain all failed references, never retry.
            errors=[]
            if dest_fd is not None:
                try:self.release(dest_fd)
                except BaseException:errors.append(dest_fd)
            try:source.release(source_fd)
            except BaseException:errors.append(source_fd)
            need(not errors,'COPY_CLOSE_UNCONFIRMED')
    def mkdir(self,name,mode):
        need(member(name),'MKDIR_NAME');self.check();self.api.mkdir(name,0o700,dir_fd=self.fd)
        fd=self.acquire(name,os.O_RDONLY|os.O_DIRECTORY)
        try:self.api.fchmod(fd,mode)
        finally:self.release(fd)
        self.check()
    def symlink(self,name,target):
        need(member(name) and type(target)is str,'LINK_ENTRY');self.check();self.api.symlink(target,name,dir_fd=self.fd);self.check()
    def readlink(self,name):
        st=self.info(name);need(stat.S_ISLNK(st.st_mode),'LINK_ENTRY_TYPE');target=self.api.readlink(name,dir_fd=self.fd);need(filekey(st)==filekey(self.info(name)),'LINK_CHANGED');return target
    def close(self):
        # Each descriptor is attempted at most once per close invocation. Failed FDs
        # stay strongly referenced; callers do not retry this failed ownership.
        errors=[]
        for fd in list(reversed(self.leaves)):
            if fd in self.failed_closes:errors.append(fd);continue
            try:self.release(fd)
            except BaseException:errors.append(fd)
        retained=[]
        for row in reversed(self.chain):
            if row[2] in self.failed_closes:errors.append(row[2]);retained.append(row);continue
            try:self.api.close(row[2])
            except BaseException:self.failed_closes.add(row[2]);errors.append(row[2]);retained.append(row)
        self.chain=list(reversed(retained))
        if not self.chain and not self.leaves and self in self.OWNED:self.OWNED.remove(self)
        need(not errors,'CUSTODY_CLOSE_UNCONFIRMED')
