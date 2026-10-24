"""Root standalone after-negative proof: only exact reviewed06 library functions, no phase/native."""
import hashlib,json,os,stat,sys
from pathlib import Path
sys.dont_write_bytecode=True
R=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
P=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume6'
E=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs009-gateway80-offtree03-20261019'
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

def main():
    entry_require(len(sys.argv)==2 and sys.argv[1]=='43ff6885ad33d1084a6a60ccb94390a099e097fd31b35496442b46ebce24ce71','EXACT_RELEASE_REQUIRED')
    release_sha=sys.argv[1]
    raw=entry_read_bytes(P/'verified-inputs.py')
    entry_require(hashlib.sha256(raw).hexdigest()=='47db173dd0ad632f607a2effeb753754b581db6f601d78bf00e5f619d6e0a45c','VERIFIED_LEAF_REQUIRED')
    leaf={};exec(compile(raw,'<verified06-leaf>','exec'),leaf)
    release_raw=leaf['verified'](E/'root-authorization.json',release_sha);A=json.loads(release_raw)
    entry_require(A['authorized'] is True and A['packetManifestSha256']=='e2e3340b48628c76884d6b243dd69134052e8e2ff3d25f5ab09d94f4e9150585','EXACT_AUTHORIZED06_REQUIRED')
    buffers=leaf['package_buffers'](P,A['packetManifestSha256']);d=leaf['load_driver'](P,buffers)
    d.IMMUTABLE_BYTES[str(E/'root-authorization.json')]=release_raw
    leaf['bind_controls'](d,A['immutableInputPins'])
    leaf['bind_controls'](d,{'root-authorization.json':release_sha,'hold.json':A['holdFileSha256'],'candidate-baseline.json':A['candidateBaselineSha256']})
    entry_require(os.umask(0o077)==0o077,'PARENT_077_REQUIRED')
    d.setup_custody(A);d.guard_leaf(E/'root-after-negative-held-proof.json',fresh=True)
    C=d.core();H=d.held(A,C);d.bind_observation_client(C['table']())
    before=d.guards(A,C);resources=d.boundary(H,C,A);after=d.guards(A,C)
    entry_require({k:v for k,v in before.items() if k!='atUtc'}=={k:v for k,v in after.items() if k!='atUtc'},'SOURCE_CHANGED')
    d.held(A,C);d.observation_history(C)
    entry_require(not d.W.exists() and not d.W.is_symlink(),'WORKSPACE_MUST_REMAIN_ABSENT')
    entry_require(not any((E/(p+'.consumed.json')).exists() or (E/(p+'.receipt.json')).exists() for p in d.SCOPE['phaseIds']),'PHASE_STATE_ALREADY_PRESENT')
    d.enable_observation_writes()
    d.write_new(E/'root-after-negative-held-proof.json',{'status':'SAME_HOLDER_SOURCE_AFTER_NEGATIVE_VERIFIED','releaseSha256':release_sha,'negativeTool':'a10ee4','separateNegativeStatusTool':'010bee','actualNegativeStatus':1,'beforeSource':before,'resources':resources,'afterSource':after,'originalHoldSha256':A['holdFileSha256'],'workspaceAbsent':True,'nativePhases':0,'observerPid':os.getpid(),'currentObserverCompletion':'Requires separately captured actual toolstatus','credit':False})
    print(json.dumps({'status':'SAME_HOLDER_SOURCE_AFTER_NEGATIVE_VERIFIED','proofSha256':d.file_hash(E/'root-after-negative-held-proof.json'),'nativePhases':0,'credit':False}))

if __name__=='__main__':
    try:main()
    except BaseException as exc:
        msg=str(exc) if isinstance(exc,ValueError) else ''
        code=msg if 0<len(msg)<=96 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_' for c in msg) else 'UNKNOWN_CONTROL_FAILURE'
        print(json.dumps({'status':'HOLD_ROOT_AFTER_NEGATIVE_PROOF','failureClass':type(exc).__name__,'failureCode':code,'credit':False}));sys.exit(1)
