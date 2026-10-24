"""Generation06 verified-buffer postclose entry; inactive until separate root admission."""
from pathlib import Path
import hashlib,json,os,stat,sys
sys.dont_write_bytecode=True
D=Path(__file__).absolute().parent
def entry_guard(directory, repository, expected_package):
    if directory != expected_package or repository not in directory.parents:
        raise ValueError('ENTRY_PACKAGE_PATH_CHANGED')
    chain = [repository]
    for part in Path(str(directory.relative_to(repository))).parts:
        chain.append(chain[-1] / part)
    for path in chain:
        if path.is_symlink() or not stat.S_ISDIR(path.lstat().st_mode):
            raise ValueError('ENTRY_PACKAGE_ROOT_OR_PARENT_LINK')
    for name in ('run-private.py', 'final-controls.py'):
        path = directory / name
        if path.is_symlink() or not stat.S_ISREG(path.lstat().st_mode):
            raise ValueError('ENTRY_MODULE_NOT_REGULAR')

def entry_require(ok,reason):
    if not ok:raise ValueError(reason)

def entry_read_bytes(path):
    path=Path(path)
    entry_require(path.is_absolute() and '..' not in path.parts,'ABSOLUTE_READER_PATH')
    descriptors=[];facts=[]
    fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);descriptors.append(fd);facts.append((Path('/'),os.fstat(fd)))
    key=lambda x:(x.st_dev,x.st_ino,x.st_mode,x.st_uid)
    try:
        parent=Path('/')
        for part in path.parts[1:-1]:
            parent=parent/part
            fd=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            descriptors.append(fd);facts.append((parent,os.fstat(fd)))
        leaf=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd);descriptors.append(leaf)
        before=os.fstat(leaf);entry_require(stat.S_ISREG(before.st_mode),'VERIFIED_READER_REGULAR')
        with os.fdopen(leaf,'rb',closefd=False) as handle:raw=handle.read()
        after=os.fstat(leaf);named=path.lstat()
        filekey=lambda x:(*key(x),x.st_size,x.st_mtime_ns)
        entry_require(filekey(before)==filekey(after)==filekey(named),'VERIFIED_READER_LEAF_CHANGED')
        for name,old in facts:entry_require(key(name.lstat())==key(old) and stat.S_ISDIR(old.st_mode),'VERIFIED_READER_ANCESTOR_CHANGED')
        return raw
    finally:
        for fd in reversed(descriptors):os.close(fd)

def trusted_leaf():
    cached=globals().get('_TRUSTED_LEAF_NS')
    if cached is not None:return cached
    package=Path(__file__).absolute().parent
    expected=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume6')
    entry_require(package==expected,'EXACT_GENERATION06_ENTRY_REQUIRED')
    raw=entry_read_bytes(package/'verified-inputs.py')
    entry_require(hashlib.sha256(raw).hexdigest()=='47db173dd0ad632f607a2effeb753754b581db6f601d78bf00e5f619d6e0a45c','LEAF_VERIFIED_BUFFER_CHANGED')
    ns={'__file__':str(package/'verified-inputs.py'),'__name__':'verified_gateway06_leaf'}
    exec(compile(raw,'<same-verified-leaf-buffer>','exec'),ns)
    globals()['_TRUSTED_LEAF_NS']=ns
    return ns


def bootstrap_entry(kind):
    return trusted_leaf()['entry'](Path(__file__).absolute().parent,kind,sys.argv[1:])

if __name__ == '__main__':
    try:sys.exit(bootstrap_entry('postclose'))
    except BaseException as exc:
        if isinstance(exc,SystemExit) and exc.code==0:raise
        msg=str(exc) if isinstance(exc,ValueError) else ''
        code=msg if 0<len(msg)<=96 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_' for c in msg) else 'UNKNOWN_CONTROL_FAILURE'
        print(json.dumps({'status':'HOLD_GATEWAY80','failureClass':type(exc).__name__,'failureCode':code,'credit':False}))
        sys.exit(1)
