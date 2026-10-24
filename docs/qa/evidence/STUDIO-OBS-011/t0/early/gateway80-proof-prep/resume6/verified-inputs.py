"""Leaf immutable-byte bootstrap. No main, observer, native work or writes."""
import ast,hashlib,json,os,stat,sys,types
from pathlib import Path,PurePosixPath
R=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
EXPECTED=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume6'
E=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs009-gateway80-offtree03-20261019'

def require(ok, reason):
    if not ok:raise ValueError(reason)

def anchored_raw(path):
    path=Path(path)
    require(path.is_absolute() and '..' not in path.parts,'ABSOLUTE_READER_PATH')
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
        before=os.fstat(leaf);require(stat.S_ISREG(before.st_mode),'VERIFIED_READER_REGULAR')
        with os.fdopen(leaf,'rb',closefd=False) as handle:raw=handle.read()
        after=os.fstat(leaf);named=path.lstat()
        filekey=lambda x:(*key(x),x.st_size,x.st_mtime_ns)
        require(filekey(before)==filekey(after)==filekey(named),'VERIFIED_READER_LEAF_CHANGED')
        for name,old in facts:require(key(name.lstat())==key(old) and stat.S_ISDIR(old.st_mode),'VERIFIED_READER_ANCESTOR_CHANGED')
        return raw
    finally:
        for fd in reversed(descriptors):os.close(fd)

def verified(path,expected):
    require(isinstance(expected,str) and len(expected)==64 and set(expected)<=set('0123456789abcdef'),'EXPECTED_SHA_REQUIRED')
    raw=anchored_raw(path);require(hashlib.sha256(raw).hexdigest()==expected,'BOOTSTRAP_VERIFIED_BUFFER_MISMATCH');return raw

def record(path,expected):return json.loads(verified(path,expected))

def package_buffers(package,manifest_sha):
    require(package==EXPECTED,'EXACT_GENERATION06_PACKAGE_REQUIRED')
    raw=verified(package/'manifest.json',manifest_sha);manifest=json.loads(raw)
    buffers={'manifest.json':raw};seen=set()
    for row in manifest['files']:
        name=row['path'];pp=PurePosixPath(name)
        require(isinstance(name,str) and not pp.is_absolute() and '..' not in pp.parts and str(pp)==name and name not in seen,'PACKET_MEMBER_PATH')
        seen.add(name);data=verified(package/name,row['sha256'])
        require(type(row['bytes']) is int and len(data)==row['bytes'] and type(row['mode']) is int and stat.S_IMODE((package/name).lstat().st_mode)==row['mode'],'PACKET_MEMBER_METADATA')
        buffers[name]=data
    return buffers

def load_driver(package,buffers):
    contract={};exec(compile(buffers['contracts.py'],'<verified-contracts-buffer>','exec'),contract)
    scope=json.loads(buffers['scope.json'])
    require(scope['repository']==str(R) and scope['runtime']==str(E) and scope['preparationGeneration']=='resume6','VERIFIED_SCOPE')
    d=types.ModuleType('_gateway06_verified_driver')
    d.__dict__.update(D=package,R=R,SCOPE=scope,W=Path(scope['workspace']),E=E,
                     IMMUTABLE_BYTES={str(package/name):raw for name,raw in buffers.items()},
                     IMMUTABLE_EXPECTED={str(package/name):hashlib.sha256(raw).hexdigest() for name,raw in buffers.items()},
                     SAFE_READER=anchored_raw,TOOL_READER=anchored_raw,
                     sha=lambda p:hashlib.sha256(anchored_raw(p)).hexdigest(),
                     **{k:contract[k] for k in ('assess','require','transition_allowed')})
    tree=ast.parse(buffers['run-private.py'])
    nodes=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.FunctionDef))]
    # run-private contains stdlib imports only; no unverified Python module import.
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<verified-driver-definitions-buffer>','exec'),d.__dict__)
    d.utc=lambda:__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    return d

def load_functions(filename,buffers):
    ns={};exec(compile(buffers[filename],'<verified-'+filename+'>','exec'),ns);return ns

def bind_controls(d,pins):
    require(isinstance(pins,dict),'EXPLICIT_IMMUTABLE_CONTROL_PINS_REQUIRED')
    for name,h in pins.items():
        require(isinstance(name,str) and PurePosixPath(name).name==name and name.endswith('.json'),'CONTROL_PIN_NAME')
        path=str(E/name);old=d.IMMUTABLE_EXPECTED.get(path)
        require(old is None or old==h,'CONFLICTING_IMMUTABLE_CONTROL_PIN')
        # No parse yet; verified exact bytes will be retained on first consumption.
        require(isinstance(h,str) and len(h)==64 and set(h)<=set('0123456789abcdef'),'CONTROL_PIN_SHA')
        d.IMMUTABLE_EXPECTED[path]=h


def entry(package,kind,argv):
    require(kind in ('phase','final','gate','postclose'),'ENTRY_KIND')
    if kind=='phase':
        require(len(argv)==4,'PHASE_REQUIRES_PHASE_RELEASEPATH_RELEASESHA_DECISIONSHA')
        phase,path,release_sha,decision_sha=argv;require(Path(path)==E/'root-authorization.json','ENTRY_RELEASE_PATH')
    elif kind=='final':
        require(len(argv)==2,'FINAL_REQUIRES_RELEASESHA_ACTUALREVIEWADOPTIONSHA')
        release_sha,review_sha=argv
    elif kind=='gate':
        require(len(argv) in (2,3) and argv[1]=='0','SUCCESS_ONLY_EXPLICIT_GATE_CALL')
        release_sha=argv[0]
        permit_sha=argv[2] if len(argv)==3 else None
    else:
        require(len(argv)==2,'POSTCLOSE_REQUIRES_RELEASESHA_WRAPPERRESULTSHA')
        release_sha,wrapper_sha=argv
    release_raw=verified(E/'root-authorization.json',release_sha);A=json.loads(release_raw)
    require(A['authorized'] is True and A['label']=='obs009-gateway80-offtree03-20261019','ROOT_RELEASE_SCOPE')
    buffers=package_buffers(package,A['packetManifestSha256']);d=load_driver(package,buffers)
    d.IMMUTABLE_BYTES[str(E/'root-authorization.json')]=release_raw
    bind_controls(d,{'root-authorization.json':release_sha,'hold.json':A['holdFileSha256'],'candidate-baseline.json':A['candidateBaselineSha256']})
    if kind=='phase':
        decision_raw=verified(E/(phase+'.root-decision.json'),decision_sha);decision=json.loads(decision_raw)
        d.IMMUTABLE_BYTES[str(E/(phase+'.root-decision.json'))]=decision_raw
        bind_controls(d,{phase+'.root-decision.json':decision_sha})
        bind_controls(d,decision['immutableInputPins'])
        bind_controls(d,{old+'.receipt.json':h for old,h in decision['precedingReceipts'].items()})
        for old,h in decision['precedingReceipts'].items():
            require(old in d.SCOPE['phaseIds'],'PREDECESSOR_PHASE_NAME')
            d.IMMUTABLE_BYTES[str(E/(old+'.receipt.json'))]=verified(E/(old+'.receipt.json'),h)
        return d.main()
    if kind=='final':
        review_raw=verified(E/'actual-review.root-adoption.json',review_sha);review=json.loads(review_raw)
        d.IMMUTABLE_BYTES[str(E/'actual-review.root-adoption.json')]=review_raw
        bind_controls(d,{'actual-review.root-adoption.json':review_sha})
        bind_controls(d,review['immutableInputPins'])
        bind_controls(d,{phase+'.receipt.json':h for phase,h in review['phaseReceiptPins'].items()})
        final=load_functions('final-controls.py',buffers)
        final['produce_final'](d,A,release_sha,d.core(),__import__('time').time);return 0
    if kind=='gate':
        require((E/'final-readiness-v1.json').is_file(),'FINAL_READINESS_AND_RESULT_REQUIRED')
        require(permit_sha is not None,'EXACT_PERMIT_SHA_REQUIRED')
        permit_raw=verified(E/'close.root-permit.json',permit_sha);permit=json.loads(permit_raw)
        d.IMMUTABLE_BYTES[str(E/'close.root-permit.json')]=permit_raw
        bind_controls(d,permit['immutableInputPins'])
        bind_controls(d,{'close.root-permit.json':permit_sha,'final-readiness-v1.json':permit['readinessSha256'],'final-result-v1.json':permit['finalResultSha256']})
        for name,key in [('final-readiness-v1.json','readinessSha256'),('final-result-v1.json','finalResultSha256')]:
            d.IMMUTABLE_BYTES[str(E/name)]=verified(E/name,permit[key])
        proof=json.loads(d.IMMUTABLE_BYTES[str(E/'final-readiness-v1.json')])
        bind_controls(d,proof['facts']['evidencePins'])
        bind_controls(d,{phase+'.receipt.json':h for phase,h in proof['facts']['phaseReceiptPins'].items()})
        bind_controls(d,{'final-attempt-v1.json':proof['attemptSha256']})
        final=load_functions('final-controls.py',buffers)
        result=final['close_check'](d,A,release_sha,permit,d.core(),__import__('time').time)
        result['rootPermitSha256']=permit_sha
        d.write_new(E/('allow-close-'+str(__import__('time').time_ns())+'.json'),result);return 0
    result=record(E/'actual-wrapper-result.json',wrapper_sha)
    require(type(result['actualWrapperExit']) is int and result['actualWrapperExit']==0 and result['separatelyCaptured'] is True and result['releaseSha256']==release_sha and result['label']==d.SCOPE['label'],'ACTUAL_WRAPPER_ZERO_REQUIRED')
    bind_controls(d,result['immutableInputPins'])
    d.setup_custody(A);C=d.core(postclose=True);H=d.read_verified(E/'hold.json',A['holdFileSha256'])
    rows=C['table']();d.bind_observation_client(rows)
    recorded=[]
    for phase in ('red','green'):
        receipt=d.read(E/(phase+'.receipt.json'))
        require(receipt['releaseSha256']==release_sha and receipt['accepted'] is True,'POSTCLOSE_PHASE_RECEIPT')
        for who in receipt['native']['ownedIdentities']:
            require((rows.get(who['pid']) or {}).get('start')!=who['start'],'POSTCLOSE_RECORDED_IDENTITY_SURVIVES')
            recorded.append({'pid':who['pid'],'start':who['start']})
    for role in ('wrapper','shell'):require((rows.get(H[role]['pid']) or {}).get('start')!=H[role]['start'],'ORIGINAL_CONTROLLER_STILL_LIVE')
    lock=Path(H['lock']['path']);st=lock.stat();require((st.st_dev,st.st_ino)==(H['lock']['dev'],H['lock']['ino']),'POSTCLOSE_LOCK_CHANGED')
    d.guard_leaf(lock);parent=d.anchored_parent(lock);fd=None
    try:
        fd=d.os.open(lock.name,d.os.O_RDWR|d.os.O_NOFOLLOW,dir_fd=parent);bound=d.os.fstat(fd)
        require((bound.st_dev,bound.st_ino)==(st.st_dev,st.st_ino),'POSTCLOSE_LOCK_FD_CHANGED')
        d.fcntl.flock(fd,d.fcntl.LOCK_EX|d.fcntl.LOCK_NB);d.fcntl.flock(fd,d.fcntl.LOCK_UN)
    finally:
        if fd is not None:d.os.close(fd)
        d.os.close(parent)
    before=d.guards(A,C);resources=d.boundary(H,C,A);after=d.guards(A,C)
    require({k:v for k,v in before.items() if k!='atUtc'}=={k:v for k,v in after.items() if k!='atUtc'},'POSTCLOSE_SOURCE_CHANGED')
    d.observation_history(C)
    d.enable_observation_writes()
    d.write_new(E/'postclose-v1.json',{'status':'POSTCLOSE_VERIFIED','releaseSha256':release_sha,'wrapperResultSha256':wrapper_sha,'source':after,'resources':resources,'recordedIdentitiesTerminal':recorded,'credit':False});return 0
