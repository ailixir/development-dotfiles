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
    path=Path(path);require(path.is_absolute() and path.is_relative_to(R) and '..' not in path.parts,'READ_SCOPE')
    for parent in [*reversed(path.parents),path]:
        if parent==R or parent.is_relative_to(R):
            st=parent.lstat();require(not stat.S_ISLNK(st.st_mode),'READ_PARENT_OR_LEAF_LINK')
            require(stat.S_ISREG(st.st_mode) if parent==path else stat.S_ISDIR(st.st_mode),'READ_TYPE')
    parent_fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        for part in path.parts[1:-1]:
            next_fd=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent_fd);os.close(parent_fd);parent_fd=next_fd
        fd=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=parent_fd)
    finally:os.close(parent_fd)
    try:
        before=os.fstat(fd);require(stat.S_ISREG(before.st_mode),'READ_FD_TYPE')
        with os.fdopen(fd,'rb',closefd=False) as handle:raw=handle.read()
        after=os.fstat(fd);named=path.lstat();key=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_mode)
        require(key(before)==key(after)==key(named),'READ_CHANGED');return raw
    finally:os.close(fd)

def root_record(relative,want):
    require(isinstance(relative,str) and relative.startswith('docs/qa/evidence/STUDIO-OBS-011/t0/') and '..' not in PurePosixPath(relative).parts,'ROOT_RECORD_SCOPE')
    raw=safe_bytes(R/relative);require(digest(raw)==want,'ROOT_RECORD_HASH');return json.loads(raw)

def continuation(a,manifest_sha):
    require(a.get('authorized') is True and a.get('authorizedBy')=='root' and a.get('decision')=='CONTINUE_SAME_UNCONSUMED_GATEWAY_ADMISSION_ONCE','EXPLICIT_ROOT_CONTINUATION_REQUIRED')
    require(a.get('packetManifestSha256')==manifest_sha and a.get('existingHoldSha256')==HOLD_SHA and a.get('priorFailureSha256')==FAILURE_SHA and a.get('c8ClosureAdoptionSha256')==CLOSURE_SHA,'CONTINUATION_ANCESTRY')
    require(a.get('label')==LABEL and type(a.get('maximumCaptures')) is int and a['maximumCaptures']==1 and a.get('sameWrapperPid')==3720 and type(a.get('sameWrapperPid')) is int and a.get('sameShellPid')==3749 and type(a.get('sameShellPid')) is int,'SAME_CAPTURE_SCOPE')
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
    return hold

def load_driver(buffers):
    contract={};exec(compile(buffers['contracts.py'],'<verified-gateway-contracts>','exec'),contract)
    scope=json.loads(buffers['scope.json']);d=types.ModuleType('_verified_gateway_capture_driver')
    d.__dict__.update(D=P,R=R,SCOPE=scope,W=Path(scope['workspace']),E=Path(scope['runtime']),sha=lambda p:digest(p.read_bytes()),utc=lambda:time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),**{k:contract[k] for k in ('assess','require','transition_allowed')})
    # Verified scope/contract buffers supply these globals. Skip top-level
    # scope rereads/import fallback and all driver/main assignments/actions.
    tree=ast.parse(buffers['run-private.py']);nodes=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom)) and not (isinstance(n,ast.ImportFrom) and n.module=='contracts') or isinstance(n,ast.FunctionDef)]
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<verified-gateway-driver-definitions>','exec'),d.__dict__)
    return d

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
    child=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    require(type(child.pid) is int and child.pid>0,'VERSION_PID_UNKNOWN')
    record={'kind':'WAITED_ADMISSION_TOOL_VERSION','tool':name,'pid':child.pid,'command':command,'executableSha256':A[name+'Sha256'],'terminalWaitConfirmed':False,'actualExit':None,'stderrComplete':False,'stderrEmpty':False,'stdoutComplete':False,'versionOutput':None,'timeoutSignalSent':False}
    try:
        stdout,stderr=child.communicate(timeout=10)
        record.update(terminalWaitConfirmed=type(child.returncode) is int,actualExit=child.returncode,stderrComplete=isinstance(stderr,str),stderrEmpty=stderr=='',stdoutComplete=isinstance(stdout,str))
        if isinstance(stdout,str) and 0<len(stdout.strip())<=4096:record['versionOutput']=stdout.strip()
    finally:d.write_new(d.E/('admission-'+name+'-version.json'),record)
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
    """Only the not-yet-published candidate record is a verified in-memory view."""
    path=d.E/'candidate-baseline.json';raw=(json.dumps(value,indent=2)+'\n').encode();A['candidateBaselineSha256']=digest(raw)
    old_read,old_hash=d.read,d.file_hash
    d.read=lambda p:copy.deepcopy(value) if p==path else old_read(p)
    d.file_hash=lambda p:digest(raw) if p==path else old_hash(p)
    try:return d.boundary(H,C,A)
    finally:d.read,d.file_hash=old_read,old_hash

def capture(d,buffers,manifest_sha,a,continuation_sha):
    continuation(a,manifest_sha);H=existing_hold(d,a)
    require(os.umask(0o077)==0o077,'PARENT_UMASK_ALREADY_077_REQUIRED')
    # Admission-only marker enforces one capture, never consumes a native phase.
    d.write_new(d.E/'admission-capture-attempt.json',{'kind':'SAME_H_ADMISSION_CAPTURE_ONCE','continuationSha256':continuation_sha,'packetManifestSha256':manifest_sha,'holdSha256':HOLD_SHA,'nativeOrPhaseConsumed':False,'automaticRetry':False})
    A=prepare_proposal(d,buffers,manifest_sha,a);C=d.core();d.held(A,C)
    A['actualFreshToolVersions']={name:version(d,A,name) for name in ('node','helm')}
    before=d.guards(A,C);value=candidate(d,C,buffers);resources=pending_boundary(d,H,C,A,value);after=d.guards(A,C);d.held(A,C)
    require(not d.W.exists() and not d.W.is_symlink(),'WORKSPACE_CREATED_DURING_ADMISSION')
    require(d.file_hash(d.E/'hold.json')==HOLD_SHA and A['authorized'] is False,'HOLD_OR_PROPOSAL_CHANGED')
    require(not any((d.E/n).exists() or (d.E/n).is_symlink() for n in ('candidate-baseline.json','root-admission-facts.json','root-authorization.json','prepare.consumed.json','prepare.receipt.json')),'UNEXPECTED_ADMISSION_OR_PHASE_OUTPUT')
    # Candidate/facts publish only AFTER all fresh checks; the old H is never written.
    d.write_new(d.E/'candidate-baseline.json',value)
    require(d.file_hash(d.E/'candidate-baseline.json')==A['candidateBaselineSha256'],'PUBLISHED_CANDIDATE_CHANGED')
    facts={'kind':'ROOT_SAME_H_FRESH_GATEWAY80_ADMISSION_FACTS','packetManifestSha256':manifest_sha,'continuationSha256':continuation_sha,'priorAdmissionFailureSha256':FAILURE_SHA,'holdSha256':HOLD_SHA,'proposedAuthorization':A,'beforeSource':before,'boundary':resources,'afterSource':after,'workspaceAbsent':True,'actualNativeInvocations':0,'authorized':False,'historicalRepairClaim':False,'operatorMustSeparatelyInspectAndAuthorize':True}
    d.write_new(d.E/'root-admission-facts.json',facts);return facts

def main():
    require(len(sys.argv)==4,'USAGE: exact-manifest-sha continuation-relative-path exact-continuation-sha')
    manifest_sha,relative,auth_sha=sys.argv[1:];a=root_record(relative,auth_sha);continuation(a,manifest_sha)
    raw=safe_bytes(P/'manifest.json');require(digest(raw)==manifest_sha,'PACKET_SEAL');manifest=json.loads(raw);buffers={}
    for row in manifest['files']:
        require(isinstance(row['path'],str) and not PurePosixPath(row['path']).is_absolute() and '..' not in PurePosixPath(row['path']).parts and str(PurePosixPath(row['path']))==row['path'],'PACKET_MEMBER_SCOPE')
        path=P/row['path'];data=safe_bytes(path);require(digest(data)==row['sha256'] and len(data)==row['bytes'] and stat.S_IMODE(path.lstat().st_mode)==row['mode'],'PACKET_MEMBER_CHANGED');buffers[row['path']]=data
    for role in ('architecture','qa'):
        item=a['reviews'][role];root_record(item['path'],item['sha256'])
    closure=root_record(a['c8ClosureAdoptionPath'],CLOSURE_SHA)
    require(closure['qualifiedResourceClosureAccepted'] is True and type(closure['actualWrapperExit']) is int and closure['actualWrapperExit']==1 and type(closure['actualPostcloseExit']) is int and closure['actualPostcloseExit']==0 and closure['C8Credit'] is False,'ACTUAL_C8_CLOSURE_REQUIRED')
    failure=root_record(a['priorFailurePath'],FAILURE_SHA);require(failure['actualStatus']==1 and failure['nativePhases']==0 and failure['holdSha256']==HOLD_SHA,'PRIOR_FAILURE_ANCESTRY')
    d=load_driver(buffers);facts=capture(d,buffers,manifest_sha,a,auth_sha)
    print(json.dumps({'status':'FRESH_SAME_H_ADMISSION_FACTS_ONLY','holdSha256':HOLD_SHA,'factsSha256':d.file_hash(d.E/'root-admission-facts.json'),'proposedAuthorized':facts['authorized'],'nativeOrPhaseReleased':False}))
if __name__=='__main__':main()
