"""Prospective SAME-H continuation capture. No phase/workspace/release action."""
import ast,copy,hashlib,json,os,stat,subprocess,sys,time,types
from pathlib import Path,PurePosixPath
sys.dont_write_bytecode=True
R=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
P=Path(__file__).absolute().parent
HOLD_SHA='fd58e6a6d34cb9f3c9c0a100a7bb38109a6913322232691d2528701d5825a073'
FAILURE_SHA='78435452fb79a10ba5bbc580f65e405a01a0bd71271854d70039d951f44179cf'
CLOSURE_SHA='14db07064b927666a75f403a2f808b07c90e19cb32a8ee4289ef570969389459'
LABEL='obs009-gateway80-offtree03-20261019'
ROOT01_SHA='49294775837827d66614b1253214db16f8206770a6affbda63929f3d97095d3c'
def require(ok,why):
    if not ok:raise ValueError(why)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def safe_bytes(path):
    path=Path(path)
    require(path.is_absolute() and path.is_relative_to(R) and '..' not in path.parts,'READ_SCOPE')
    return trusted_leaf()['anchored_raw'](path)

def root_record(relative,want):
    require(isinstance(relative,str) and relative.startswith('docs/qa/evidence/STUDIO-OBS-011/t0/') and '..' not in PurePosixPath(relative).parts,'ROOT_RECORD_SCOPE')
    raw=safe_bytes(R/relative);require(digest(raw)==want,'ROOT_RECORD_HASH');return json.loads(raw)

def continuation(a,manifest_sha):
    require(a.get('authorized') is True and a.get('authorizedBy')=='root' and a.get('decision')=='CONTINUE_SAME_UNCONSUMED_GATEWAY_ADMISSION_ONCE','EXPLICIT_ROOT_CONTINUATION_REQUIRED')
    require(a.get('packetManifestSha256')==manifest_sha and a.get('existingHoldSha256')==HOLD_SHA and a.get('priorFailureSha256')==FAILURE_SHA and a.get('c8ClosureAdoptionSha256')==CLOSURE_SHA,'CONTINUATION_ANCESTRY')
    require(a.get('label')==LABEL and type(a.get('maximumCaptures')) is int and a['maximumCaptures']==1 and a.get('sameWrapperPid')==3720 and type(a.get('sameWrapperPid')) is int and a.get('sameShellPid')==3749 and type(a.get('sameShellPid')) is int,'SAME_CAPTURE_SCOPE')
    require(a.get('readonlySameShellOneShotRequired') is True,'READONLY_SAME_SHELL_CAPTURE_CAP_REQUIRED')
    require(a.get('nativeOrPhaseAuthorized') is False and a.get('workspaceCreationAuthorized') is False and a.get('automaticRetry') is False and a.get('historicalRepairClaim') is False,'NO_PHASE_OR_RETRY')
    for role in ('architecture','qa'):
        item=a['reviews'][role];require(isinstance(item['sha256'],str) and len(item['sha256'])==64,'EXACT_NEW_REVIEWS_REQUIRED')

def existing_hold(d,a):
    require(not d.W.exists() and not d.W.is_symlink(),'WORKSPACE_ALREADY_CONSUMED')
    st=d.E.lstat();require(not d.E.is_symlink() and stat.S_ISDIR(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o700,'EXISTING_RUNTIME_CUSTODY')
    d.guard_directory(d.E)
    require({p.name for p in d.E.iterdir()}=={'hold.json'},'EXACT_H_ONLY_RUNTIME_REQUIRED')
    hp=d.E/'hold.json';d.guard_leaf(hp);require(stat.S_IMODE(hp.lstat().st_mode)==0o600,'HOLD_MODE')
    raw=safe_bytes(hp);require(digest(raw)==HOLD_SHA,'IMMUTABLE_EXISTING_HOLD_CHANGED');hold=json.loads(raw)
    require(hold['label']==LABEL,'EXISTING_HOLD_LABEL')
    for role,key in (('wrapper','sameWrapperPid'),('shell','sameShellPid')):
        f=hold[role];require(type(f['pid']) is int and f['pid']==a[key] and isinstance(f['start'],str) and bool(f['start']) and isinstance(f['argvHash'],str) and len(f['argvHash'])==64,'EXISTING_HOLD_IDENTITY')
    require(os.getppid()==hold['shell']['pid'],'NOT_SAME_ORIGINAL_HELD_CHILD')
    d.__dict__.setdefault('IMMUTABLE_BYTES', {})[str(hp)]=raw
    d.__dict__.setdefault('IMMUTABLE_EXPECTED', {})[str(hp)]=HOLD_SHA
    return hold

def load_driver(buffers):
    return trusted_leaf()['load_driver'](P,buffers)

def prepare_proposal(d,buffers,manifest_sha,a):
    A=json.loads(buffers['root-authorization.template.json'])
    A.update(packetManifestSha256=manifest_sha,independentArchitectureReviewSha256=a['reviews']['architecture']['sha256'],independentQaReviewSha256=a['reviews']['qa']['sha256'],holdFileSha256=HOLD_SHA)
    node,helm,deps=(Path(d.SCOPE[k]).resolve() for k in ('node','helm','dependencies'))
    A.update(nodeCanonicalPath=str(node),helmCanonicalPath=str(helm),nodeSha256=digest(node.read_bytes()),helmSha256=digest(helm.read_bytes()),dependenciesRealpath=str(deps),boundBasePath='/usr/bin:/bin:/usr/sbin:/sbin',safeEnvironment={'HOME':str(Path.home()),'LANG':'en_US.UTF-8','LC_ALL':'en_US.UTF-8'})
    require(A['nodeSha256']=='9d050fd455b56426e25d4d603c7c501cbb2630348e836cf221dcce748e90588a','NODE24_CHANGED')
    roots=[R,P,d.E,d.W.parent,R/'helm-chart',R/'helm-chart/put-checks',R/'helm-chart/put-checks/templates',deps,node.parent,helm.parent]
    expanded=list(roots)
    for path in roots:
        if R in path.parents:
            current=R
            for part in path.relative_to(R).parts:current=current/part;expanded.append(current)
    A['directoryRoots']={str(p):d.directory_fact(p) for p in dict.fromkeys(expanded)};d.setup_custody(A)
    A['dependencyInventory']=d.inventory(deps);G=json.loads(buffers['source-guards.json'])
    A['distModes']={r['path']:stat.S_IMODE((R/'studio-runner/dist'/r['path']).lstat().st_mode) for r in G['dist']['files']}
    A['auxModes']={name:stat.S_IMODE((R/name).lstat().st_mode) for group in G['auxiliaryGroups'].values() for name in group}
    require(A['authorized'] is False,'PROPOSAL_MUST_REMAIN_FALSE');return A

def version(d,A,name):
    command=[A[name+'CanonicalPath'],'--version'] if name=='node' else [A[name+'CanonicalPath'],'version','--short']
    record={'kind':'WAITED_ADMISSION_TOOL_VERSION','tool':name,'command':command,'executableSha256':A[name+'Sha256'],'terminalWaitConfirmed':False,'actualExit':None,'stderrComplete':False,'stderrEmpty':False,'stdoutComplete':False,'versionOutput':None,'timeoutSignalSent':False}
    observation_start=len(d.__dict__.get('OBSERVATION_RECORDS',[]))
    try:
        result=d.no_signal_process(command,A[name+'Sha256'],kind='TOOL_VERSION')
        record.update(pid=result.record['childPid'],terminalWaitConfirmed=result.record['terminalWaitConfirmed'],actualExit=result.returncode,stderrComplete=isinstance(result.stderr,str),stderrEmpty=result.stderr=='',stdoutComplete=isinstance(result.stdout,str))
        if isinstance(result.stdout,str) and 0<len(result.stdout.strip())<=4096:record['versionOutput']=result.stdout.strip()
    finally:
        observations=d.__dict__.get('OBSERVATION_RECORDS',[])
        if len(observations)>observation_start:
            observed=observations[observation_start]
            record.update(pid=observed['childPid'],terminalWaitConfirmed=observed['terminalWaitConfirmed'],actualExit=observed['actualExit'],stderrComplete=observed['stderrComplete'],stderrEmpty=observed['stderrEmpty'],stdoutComplete=observed['stdoutComplete'],observationRecordIndex=observation_start+1,observationRecordSha256=digest((json.dumps(observed,indent=2)+'\n').encode()))
        d.write_new(d.E/('admission-'+name+'-version.json'),record)
    require(record['terminalWaitConfirmed'] is True and type(record['actualExit']) is int and record['actualExit']==0 and record['stderrComplete'] is True and record['stderrEmpty'] is True and record['stdoutComplete'] is True and record['versionOutput'] is not None,'VERSION_FAILED_OR_UNKNOWN_NO_SIGNAL')
    return record

def candidate(d,C,buffers):
    rows=C['table']();raw=C['capture'](['/bin/ps','-ww','-axo','pid=,comm=']);comms={}
    for line in raw.splitlines():
        fields=line.strip().split(None,1);require(len(fields)==2 and fields[0].isdigit() and int(fields[0]) not in comms,'COMM_CENSUS');comms[int(fields[0])]=fields[1]
    require(os.getpid() in rows and os.getppid() in rows and os.getpid() in comms and os.getppid() in comms,'CANDIDATE_CURRENT_HOLDER_ANCHOR')
    nodes=[pid for pid,comm in comms.items() if Path(comm).name.lower()=='node'];require(len(nodes)<=64,'NODE_BOUND');identities=[]
    for pid in nodes:
        require(pid in rows,'NODE_TABLE_MISMATCH');who=C['identity'](rows[pid]);require(who and who.get('identityComplete') is True and who['argvHash']==rows[pid]['argvHash'],'BASELINE_NODE_INCOMPLETE');identities.append(who)
    value=json.loads(buffers['candidate-baseline.template.json']);value.update(capturedBeforeUnit=True,capturedAtEpoch=time.time(),identities=identities,rootVerifiedConcreteNodeRolesAndInheritedFacts=True);return value

def pending_boundary(d,H,C,A,value):
    """A verified pending buffer is unpublished and exists only for this call."""
    path=d.E/'candidate-baseline.json';raw=(json.dumps(value,indent=2)+'\n').encode()
    A['candidateBaselineSha256']=digest(raw)
    retained=d.__dict__.setdefault('IMMUTABLE_BYTES',{});require(str(path) not in retained,'PENDING_CANDIDATE_ALREADY_RETAINED')
    retained[str(path)]=raw
    expected=d.__dict__.setdefault('IMMUTABLE_EXPECTED',{});require(str(path) not in expected,'PENDING_CANDIDATE_PIN_EXISTS');expected[str(path)]=digest(raw)
    try:return d.boundary(H,C,A)
    finally:retained.pop(str(path),None);expected.pop(str(path),None)

def capture(d,buffers,manifest_sha,a,continuation_sha):
    continuation(a,manifest_sha);H=existing_hold(d,a)
    require(os.umask(0o077)==0o077,'PARENT_UMASK_ALREADY_077_REQUIRED')
    # Read-only proposal and CORE construction cannot publish provisional records.
    A=prepare_proposal(d,buffers,manifest_sha,a);C=d.core()
    d.held(A,C)
    d.bind_observation_client(C['table']())
    # Recheck custody/H-only after the anchored current census, then holder/kernel.
    require(existing_hold(d,a)==H,'HOLD_CHANGED_DURING_PREQUALIFICATION')
    d.held(A,C)
    # C4 is now qualified. Cap1 was consumed BEFORE child launch by readonly shell state.
    d.write_new(d.E/'admission-capture-attempt.json',{'kind':'SAME_H_ADMISSION_CAPTURE_ONCE','continuationSha256':continuation_sha,'packetManifestSha256':manifest_sha,'holdSha256':HOLD_SHA,'nativeOrPhaseConsumed':False,'automaticRetry':False,'sameShellOneShotConsumedBeforeLaunch':True})
    d.enable_observation_writes()
    A['actualFreshToolVersions']={name:version(d,A,name) for name in ('node','helm')}
    before=d.guards(A,C);value=candidate(d,C,buffers);resources=pending_boundary(d,H,C,A,value);after=d.guards(A,C);d.held(A,C)
    require(not d.W.exists() and not d.W.is_symlink(),'WORKSPACE_CREATED_DURING_ADMISSION')
    require(d.file_hash(d.E/'hold.json')==HOLD_SHA and A['authorized'] is False,'HOLD_OR_PROPOSAL_CHANGED')
    require(not any((d.E/n).exists() or (d.E/n).is_symlink() for n in ('candidate-baseline.json','root-admission-facts.json','root-authorization.json','prepare.consumed.json','prepare.receipt.json')),'UNEXPECTED_ADMISSION_OR_PHASE_OUTPUT')
    d.write_new(d.E/'candidate-baseline.json',value)
    require(d.file_hash(d.E/'candidate-baseline.json')==A['candidateBaselineSha256'],'PUBLISHED_CANDIDATE_CHANGED')
    facts={'kind':'ROOT_SAME_H_FRESH_GATEWAY80_ADMISSION_FACTS','preparationGeneration':'resume6','packetManifestSha256':manifest_sha,'continuationSha256':continuation_sha,'priorAdmissionFailureSha256':FAILURE_SHA,'holdSha256':HOLD_SHA,'proposedAuthorization':A,'beforeSource':before,'boundary':resources,'afterSource':after,'workspaceAbsent':True,'actualNativeInvocations':0,'authorized':False,'historicalRepairClaim':False,'operatorMustSeparatelyInspectAndAuthorize':True}
    d.write_new(d.E/'root-admission-facts.json',facts);return facts

def main():
    require(len(sys.argv)==5 and sys.argv[4]=='--same-shell-once-consumed','EXACT_READONLY_SAME_SHELL_ONE_SHOT_LAUNCH_REQUIRED')
    manifest_sha,relative,auth_sha=sys.argv[1:4];a=root_record(relative,auth_sha);continuation(a,manifest_sha)
    buffers=trusted_leaf()['package_buffers'](P,manifest_sha)
    for role in ('architecture','qa'):
        item=a['reviews'][role];root_record(item['path'],item['sha256'])
    closure=root_record(a['c8ClosureAdoptionPath'],CLOSURE_SHA)
    require(closure['qualifiedResourceClosureAccepted'] is True and type(closure['actualWrapperExit']) is int and closure['actualWrapperExit']==1 and type(closure['actualPostcloseExit']) is int and closure['actualPostcloseExit']==0 and closure['C8Credit'] is False,'ACTUAL_C8_CLOSURE_REQUIRED')
    failure=root_record(a['priorFailurePath'],FAILURE_SHA);require(failure['actualStatus']==1 and failure['nativePhases']==0 and failure['holdSha256']==HOLD_SHA,'PRIOR_FAILURE_ANCESTRY')
    d=load_driver(buffers);globals()['CAPTURE_DRIVER']=d;facts=capture(d,buffers,manifest_sha,a,auth_sha)
    print(json.dumps({'status':'FRESH_SAME_H_ADMISSION_FACTS_ONLY','holdSha256':HOLD_SHA,'factsSha256':d.file_hash(d.E/'root-admission-facts.json'),'proposedAuthorized':facts['authorized'],'nativeOrPhaseReleased':False}))
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

if __name__=='__main__':
    try:main()
    except BaseException as exc:
        # Closed metadata only. No arbitrary exception/rawstderr/source/private bodies.
        d=globals().get('CAPTURE_DRIVER');records=[] if d is None else d.__dict__.get('OBSERVATION_RECORDS',[])
        unknown=[{'childPid':r['childPid'],'clientPid':r['client']['pid'],'commandSha256':digest(json.dumps(r['command']).encode()),'executableSha256':r['executableSha256'],'actualExit':r['actualExit'],'terminalWaitConfirmed':r['terminalWaitConfirmed'],'stdoutComplete':r['stdoutComplete'],'stderrComplete':r['stderrComplete'],'classification':r['classification'],'signalSent':False} for r in records if r['classification']!='WAITED_POPEN_CHILD']
        print(json.dumps({'status':'HOLD_ADMISSION_CAPTURE','failureClass':type(exc).__name__,'unknownObservations':unknown,'automaticRetry':False,'sameShellCaptureConsumed':True,'nativeOrPhaseReleased':False}))
        sys.exit(1)
