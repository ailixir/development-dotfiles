"""Concrete retained-FD storage. K is the externally verified custody module, not a provider."""
import os,stat,hashlib,json
from pathlib import Path
K=None

def need(ok,reason):
    if ok is not True:raise RuntimeError(reason)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def encoded(value):return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def absolute(value):
    return type(value) is str and value.startswith('/') and '\x00' not in value and '//' not in value and all(x not in ('','.','..') for x in value.split('/')[1:])
def pin(value):
    need(type(value) is dict and set(value)=={'path','sha256','bytes','mode','uid'},'PIN_SCHEMA')
    need(absolute(value['path']) and type(value['sha256']) is str and len(value['sha256'])==64 and all(x in '0123456789abcdef' for x in value['sha256']),'PIN_PATH_HASH')
    need(type(value['bytes']) is int and 0<=value['bytes']<=134217728 and type(value['mode']) is int and 0<=value['mode']<=0o777 and type(value['uid']) is int and value['uid']>=0,'PIN_METADATA')
    return value

class Budget:
    def __init__(self,entries=32768,total=2147483648,per_file=134217728):
        self.entries,self.remaining,self.per_file=entries,total,per_file
    def reserve(self):
        need(self.entries>0,'ENTRY_CAP_BEFORE_OPEN');self.entries-=1
    def allowed(self,size):
        need(type(size) is int and 0<=size<=self.per_file and size<=self.remaining,'REMAINING_CAP_BEFORE_READ')
    def consume(self,size):
        need(type(size) is int and 0<=size<=self.remaining,'ACTUAL_REMAINING_CAP');self.remaining-=size

class Storage:
    def __init__(self,owner):
        need(K is not None,'VERIFIED_CUSTODY_CODE_REQUIRED')
        self.owner=owner;self.directories=[];self.created=[];self.attempts=[];self.primary=None;self.cleanup=[]
    def failed(self,error):
        if self.primary is None:self.primary=error
        self.owner.retain(self)
    def finalize(self,closers,primary):
        failure=None
        for closer in closers:
            try:closer()
            except BaseException as error:
                self.cleanup.append(error)
                if failure is None:failure=error
        if failure is not None and primary is None:raise failure
    def parent(self,path):
        need(absolute(path),'ABSOLUTE_PATH')
        parent,name=path.rsplit('/',1)
        c=K.Custody(parent or '/',api=os,ownership=self.owner)
        self.directories.append(c)
        return c,name
    def info(self,path):
        c,name=self.parent(path)
        try:return c.info(name)
        finally:c.close()
    def absent(self,path):
        try:self.info(path)
        except FileNotFoundError:return True
        return False
    def read(self,path,expected=None,mode=None,uid=None,budget=None,maximum=16777216):
        budget=Budget(total=maximum,per_file=maximum) if budget is None else budget
        budget.reserve()
        c,name=self.parent(path);fd=token=None;primary=None
        try:
            attempt=dict(path=path,operation='READ',state='BEFORE_OPEN',fd=None);self.attempts.append(attempt)
            fd,token=c.open_fd(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=c.fd)
            attempt.update(state='ACTUAL_FD_RETURNED',fd=fd,token=token['number'])
            before=os.fstat(fd)
            need(stat.S_ISREG(before.st_mode) and before.st_nlink==1,'REGULAR_SINGLE_LINK')
            need((uid is None and before.st_uid in (0,os.getuid())) or before.st_uid==uid,'FILE_OWNER')
            need(mode is None or stat.S_IMODE(before.st_mode)==mode,'FILE_MODE')
            budget.allowed(before.st_size);need(before.st_size<=maximum,'PER_FILE_CAP')
            if expected is not None:
                pin(expected)
                need(expected['path']==path and before.st_size==expected['bytes'] and stat.S_IMODE(before.st_mode)==expected['mode'] and before.st_uid==expected['uid'],'OPENED_PIN_METADATA')
            pieces=[];used=0
            while used<before.st_size:
                remaining=min(65536,before.st_size-used,budget.remaining-used,maximum-used)
                need(remaining>0,'CAP_BEFORE_ACQUISITION')
                piece=os.read(fd,remaining)
                need(type(piece) is bytes and 0<len(piece)<=remaining,'BOUNDED_READ')
                pieces.append(piece);used+=len(piece)
            need(os.read(fd,1)==b'','READ_GROWTH')
            named=c.info(name);after=os.fstat(fd)
            need(K.file_key(before)==K.file_key(after)==K.file_key(named),'READ_STABILITY')
            raw=b''.join(pieces);budget.consume(used)
            if expected is not None:need(digest(raw)==expected['sha256'],'EXTERNAL_PIN_BEFORE_INTERPRETATION')
            return raw,dict(dev=before.st_dev,inode=before.st_ino,uid=before.st_uid,mode=stat.S_IMODE(before.st_mode),bytes=used,sha256=digest(raw))
        except BaseException as error:primary=error;self.failed(error);raise
        finally:
            closers=([lambda:self.owner.close(token)] if token is not None else [])+[c.close]
            self.finalize(closers,primary)
    def verified(self,spec,budget=None):
        pin(spec)
        return self.read(spec['path'],spec,mode=spec['mode'],uid=spec['uid'],budget=budget,maximum=spec['bytes'])[0]
    def mkdir(self,path):
        c,name=self.parent(path)
        try:
            need(c.absent(name),'EXCLUSIVE_DIRECTORY')
            os.mkdir(name,0o700,dir_fd=c.fd)
            record=dict(path=path,state='CREATED_METADATA_UNKNOWN',identity=None);self.created.append(record)
            child=K.Custody(path,0o700,api=os,ownership=self.owner);self.directories.append(child)
            info=os.fstat(child.fd)
            need(stat.S_ISDIR(info.st_mode) and info.st_uid==os.getuid() and stat.S_IMODE(info.st_mode)==0o700,'OWNED_NEW_DIRECTORY')
            identity=dict(dev=info.st_dev,inode=info.st_ino,uid=info.st_uid,mode=0o700)
            record.update(state='OPENED_IDENTITY_CONFIRMED',identity=identity)
            child.close();return identity
        finally:c.close()
    def create(self,path,mode=0o600):
        c,name=self.parent(path);token=None;primary=None
        try:
            attempt=dict(path=path,operation='EXCLUSIVE_CREATE',state='BEFORE_OPEN',fd=None);self.attempts.append(attempt)
            fd,token=c.open_fd(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode,dir_fd=c.fd)
            attempt.update(state='ACTUAL_FD_RETURNED',fd=fd,token=token['number'])
            info=os.fstat(fd)
            need(stat.S_ISREG(info.st_mode) and info.st_uid==os.getuid() and stat.S_IMODE(info.st_mode)==mode and info.st_nlink==1,'EXCLUSIVE_OUTPUT')
            need(K.identity_key(info)==K.identity_key(c.info(name)),'EXCLUSIVE_OUTPUT_NAME')
            self.owner.transfer(token,fd,os.close)
            os.fsync(c.fd)
            return dict(path=path,fd=fd,token=token)
        except BaseException as error:
            primary=error;self.failed(error)
            if token is not None and token['state']=='OPEN':
                try:self.owner.close(token)
                except BaseException:self.owner.retain(self,c)
            raise
        finally:
            # Transferred file is a distinct owner. Close only initialized ancestors here.
            closers=[lambda token=owned:self.owner.close(token) for owned in reversed(c.owned) if owned['kind']=='DIRECTORY' and owned['state']=='OPEN']
            self.finalize(closers,primary)
    def write_fd(self,sink,raw):
        need(type(raw) is bytes and sink['token']['state'] in ('OPEN','TRANSFERRED'),'OWNED_WRITE')
        offset=0
        while offset<len(raw):
            count=os.write(sink['fd'],raw[offset:]);need(type(count) is int and 0<count<=len(raw)-offset,'WRITE_COUNT');offset+=count
        os.fsync(sink['fd'])
    def close_sink(self,sink):self.owner.close(sink['token'])
    def write(self,path,raw,maximum=16777216):
        need(type(raw) is bytes and len(raw)<=maximum,'WRITE_CAP')
        sink=self.create(path)
        try:self.write_fd(sink,raw)
        finally:self.close_sink(sink)
        actual,meta=self.read(path,mode=0o600,uid=os.getuid(),maximum=maximum)
        need(actual==raw,'CLOSED_OUTPUT_REREAD');return meta
    def document(self,path,value):return self.write(path,encoded(value)+b'\n')
    def inventory(self,root,exclude=(),budget=None):
        need(absolute(root),'INVENTORY_ROOT')
        budget=Budget(entries=8192,total=536870912,per_file=134217728) if budget is None else budget
        result=[]
        def visit(path,relative):
            c=K.Custody(path,0o700 if not relative else None,api=os,ownership=self.owner);self.directories.append(c)
            try:
                for name in c.members():
                    rel=name if not relative else relative+'/'+name
                    if rel in exclude:continue
                    info=c.info(name);full=path+'/'+name
                    if stat.S_ISDIR(info.st_mode):visit(full,rel)
                    else:
                        need(stat.S_ISREG(info.st_mode) and info.st_nlink==1,'NO_SYMLINK_OR_SPECIAL_ARCHIVE')
                        raw,meta=self.read(full,mode=stat.S_IMODE(info.st_mode),uid=os.getuid(),budget=budget,maximum=budget.per_file)
                        result.append(dict(path=rel,**meta))
            finally:c.close()
        visit(root,'');return sorted(result,key=lambda row:row['path'])
    def archive(self,source,destination,rows):
        self.mkdir(destination);budget=Budget(entries=8192,total=536870912,per_file=134217728);created={''};copied=[]
        for row in rows:
            relative=row['path'];need(type(relative) is str and all(x not in ('','.','..') for x in relative.split('/')),'ARCHIVE_RELATIVE')
            parent=relative.rsplit('/',1)[0] if '/' in relative else ''
            current=''
            for part in parent.split('/') if parent else ():
                current=part if not current else current+'/'+part
                if current not in created:self.mkdir(destination+'/'+current);created.add(current)
            expected=dict(path=source+'/'+relative,sha256=row['sha256'],bytes=row['bytes'],mode=row['mode'],uid=row['uid'])
            raw,actual=self.read(expected['path'],expected,budget=budget,maximum=budget.per_file)
            archived=self.write(destination+'/'+relative,raw,maximum=budget.per_file)
            need(archived['sha256']==actual['sha256'],'ARCHIVE_BYTES')
            copied.append(dict(path=relative,sha256=actual['sha256'],bytes=actual['bytes'],originalMode=actual['mode'],archiveMode=0o600))
        return copied
    def finish(self):
        failed=False
        for directory in reversed(self.directories):
            try:directory.close()
            except BaseException:failed=True
        if failed or self.owner.blockers():self.owner.retain(self);raise RuntimeError('STORAGE_OWNERSHIP_UNKNOWN')
