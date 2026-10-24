from pathlib import Path
D=Path(__file__).parent;p=D/'capture-admission.py';s=p.read_text()
a=s.index('def safe_bytes(');b=s.index('\ndef root_record',a)
s=s[:a]+'''def safe_bytes(path):
    path=Path(path)
    require(path.is_absolute() and path.is_relative_to(R) and '..' not in path.parts,'READ_SCOPE')
    return trusted_leaf()['anchored_raw'](path)
''' +s[b:]
a=s.index('def load_driver(');b=s.index('\ndef prepare_proposal',a)
s=s[:a]+'''def load_driver(buffers):
    return trusted_leaf()['load_driver'](P,buffers)
''' +s[b:]
s=s.replace("    return hold\n\ndef load_driver", "    d.__dict__.setdefault('IMMUTABLE_BYTES', {})[str(hp)]=raw\n    return hold\n\ndef load_driver")
a=s.index('def version(');b=s.index('\ndef candidate',a)
s=s[:a]+'''def version(d,A,name):
    command=[A[name+'CanonicalPath'],'--version'] if name=='node' else [A[name+'CanonicalPath'],'version','--short']
    record={'kind':'WAITED_ADMISSION_TOOL_VERSION','tool':name,'command':command,'executableSha256':A[name+'Sha256'],'terminalWaitConfirmed':False,'actualExit':None,'stderrComplete':False,'stderrEmpty':False,'stdoutComplete':False,'versionOutput':None,'timeoutSignalSent':False}
    try:
        result=d.no_signal_process(command,A[name+'Sha256'],kind='TOOL_VERSION')
        record.update(pid=result.record['childPid'],terminalWaitConfirmed=result.record['terminalWaitConfirmed'],actualExit=result.returncode,stderrComplete=isinstance(result.stderr,str),stderrEmpty=result.stderr=='',stdoutComplete=isinstance(result.stdout,str))
        if isinstance(result.stdout,str) and 0<len(result.stdout.strip())<=4096:record['versionOutput']=result.stdout.strip()
    finally:d.write_new(d.E/('admission-'+name+'-version.json'),record)
    require(record['terminalWaitConfirmed'] is True and type(record['actualExit']) is int and record['actualExit']==0 and record['stderrComplete'] is True and record['stderrEmpty'] is True and record['stdoutComplete'] is True and record['versionOutput'] is not None,'VERSION_FAILED_OR_UNKNOWN_NO_SIGNAL')
    return record
''' +s[b:]
a=s.index('def pending_boundary(');b=s.index('\ndef main():',a)
s=s[:a]+'''def pending_boundary(d,H,C,A,value):
    """A verified pending buffer is unpublished and exists only for this call."""
    path=d.E/'candidate-baseline.json';raw=(json.dumps(value,indent=2)+'\\n').encode()
    A['candidateBaselineSha256']=digest(raw)
    retained=d.__dict__.setdefault('IMMUTABLE_BYTES',{});require(str(path) not in retained,'PENDING_CANDIDATE_ALREADY_RETAINED')
    retained[str(path)]=raw
    try:return d.boundary(H,C,A)
    finally:retained.pop(str(path),None)

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
''' +s[b:]
s=s.replace("require(len(sys.argv)==4,'USAGE: exact-manifest-sha continuation-relative-path exact-continuation-sha')", "require(len(sys.argv)==5 and sys.argv[4]=='--same-shell-once-consumed','EXACT_READONLY_SAME_SHELL_ONE_SHOT_LAUNCH_REQUIRED')")
s=s.replace('manifest_sha,relative,auth_sha=sys.argv[1:]','manifest_sha,relative,auth_sha=sys.argv[1:4]')
a=s.index("    raw=safe_bytes(P/'manifest.json')");b=s.index("    for role in ('architecture','qa'):",a)
s=s[:a]+"    buffers=trusted_leaf()['package_buffers'](P,manifest_sha)\n"+s[b:]
s=s.replace('d=load_driver(buffers);facts=capture(d,buffers,manifest_sha,a,auth_sha)', "d=load_driver(buffers);globals()['CAPTURE_DRIVER']=d;facts=capture(d,buffers,manifest_sha,a,auth_sha)")
s=s.replace("if __name__=='__main__':main()",'''if __name__=='__main__':
    try:main()
    except BaseException as exc:
        # Closed metadata only. No arbitrary exception/rawstderr/source/private bodies.
        d=globals().get('CAPTURE_DRIVER');records=[] if d is None else d.__dict__.get('OBSERVATION_RECORDS',[])
        unknown=[{'childPid':r['childPid'],'clientPid':r['client']['pid'],'commandSha256':digest(json.dumps(r['command']).encode()),'executableSha256':r['executableSha256'],'actualExit':r['actualExit'],'terminalWaitConfirmed':r['terminalWaitConfirmed'],'stdoutComplete':r['stdoutComplete'],'stderrComplete':r['stderrComplete'],'classification':r['classification'],'signalSent':False} for r in records if r['classification']!='WAITED_POPEN_CHILD']
        print(json.dumps({'status':'HOLD_ADMISSION_CAPTURE','failureClass':type(exc).__name__,'unknownObservations':unknown,'automaticRetry':False,'sameShellCaptureConsumed':True,'nativeOrPhaseReleased':False}))
        sys.exit(1)''')
p.write_text(s)
