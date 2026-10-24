"""Prospective sealed physical acquisition/installation; explicit concrete System only.

No diagnostic, runtime observation, source/old member write, reset or cleanup route.
P, F, Custody and fixed R/E/N/SOURCE are supplied from verified same buffers.
"""
import stat

OUTSIDE_NAMES={'pending-draft.json','install-attempt.json','installation-result.json','installation-failure.json'}
OWNER_NAMES={'owner-ruling-Aria.json','owner-ruling-Quinn.json','owner-ruling-root.json'}
def fact(c,path):
    st=c.api.fstat(c.fd)
    return dict(path=str(path),uid=st.st_uid,dev=st.st_dev,ino=st.st_ino,mode=stat.S_IMODE(st.st_mode))
def input_specs(base,k,source):
    specs={}
    def add(path,h,mode):
        P.need(F.canonical(path) and P.pin(h),'INSTALL_INPUT_PIN')
        if path in specs:P.need(specs[path]==(h,mode),'INSTALL_INPUT_CONFLICT')
        specs[path]=(h,mode)
    for name,h in base['codePins'].items():add(str(source/name),h,0o644)
    for path,h in base['externalPins'].items():add(path,h,0o644)
    for path,h in base['newCodeRecordPins'].items():add(path,h,0o644)
    for path,h in base['typedOwnerRecordPins'].items():add(path,h,0o600)
    for row in k['frozenEvidence']['oldMembers']:add(str(E/row['path']),row['sha256'],row['mode'])
    for prior in k['priorNamespaces']:
        for row in prior['members']:add(str(system_path(prior)/row['path']),row['sha256'],row['mode'])
    for path,h in P.binary_requirements(base,k).items():add(path,h,None)
    return specs
def system_path(prior):
    path=prior['directory']['path']
    P.need(F.canonical(path) and str(R) in path and path in {str(E/'failed-red-resource-disposition01'),str(E/'failed-red-resource-disposition02')},'INSTALL_PRIOR_FIXED_DIRECTORY')
    return R.__class__(path)

def acquire(system,base,k,scope,source):
    """All externally approved inputs are bounded/verified before first mutation."""
    F.graph(base,k);specs=input_specs(base,k,source)
    P.need(scope.get('inputPins')=={path:h for path,(h,mode) in specs.items()},'INSTALL_EXACT_APPROVED_READSET')
    raw={};metadata={};remaining=k['limits']['maximumArchiveBytes']
    for path,(h,mode) in sorted(specs.items()):
        data,st=system.read(path,mode,min(k['limits']['maximumFileBytes'],remaining))
        P.need(len(data)==st.st_size and len(data)<=remaining and P.sha(data)==h,'INSTALL_VERIFIED_CONSUMED_INPUT')
        remaining-=len(data);raw[path]=data;metadata[path]=st
    P.prior_index_bindings(k,{path:raw[path] for path in k['priorIndexPins']})
    return raw,metadata

def audit_ancestry(system,k,old,active):
    expected={r['path'] for r in k['frozenEvidence']['oldMembers']}|{system.path(p['directory']['path']).name for p in k['priorNamespaces']}
    if active:expected.add(N.name)
    P.need(set(old.members())==expected,'INSTALL_OLD_E_EXACT_ANCESTRY')
    remaining=k['limits']['maximumArchiveBytes']
    for row in k['frozenEvidence']['oldMembers']:
        raw,st=old.read(row['path'],row['mode'],min(remaining,k['limits']['maximumFileBytes']))
        P.need(len(raw)==row['bytes'] and len(raw)<=remaining and P.sha(raw)==row['sha256'],'INSTALL_OLD_E_UNCHANGED_BYTES_MODES');remaining-=len(raw)
    for prior in k['priorNamespaces']:
        path=system.path(prior['directory']['path']);c=system.custody(path,0o700)
        try:
            P.need(fact(c,path)==prior['directory'] and set(c.members())=={r['path'] for r in prior['members']},'INSTALL_PRIOR_IDENTITY_MEMBERS')
            for row in prior['members']:
                raw,st=c.read(row['path'],row['mode'],min(remaining,k['limits']['maximumFileBytes']))
                P.need((st.st_dev,st.st_ino,st.st_uid)==(row['dev'],row['ino'],row['uid']) and st.st_nlink==1 and len(raw)==row['bytes'] and len(raw)<=remaining and P.sha(raw)==row['sha256'],'INSTALL_PRIOR_MEMBER_IDENTITY');remaining-=len(raw)
            c.check()
        finally:c.close_preserving()
    old.check()

def install(scope,contract,source,system,sink):
    sink.require_finalizer()
    P.need(type(scope)is dict and scope.get('role')=='FAILED_RESOURCE_SOURCE06_INSTALL_ONLY' and scope.get('authorizedBy')=='root' and scope.get('authorized') is True and scope.get('cleanup') is False and scope.get('nativeInvocations')==0 and type(scope.get('nativeInvocations'))is int,'INSTALL_ROOT_SCOPE')
    P.need(str(source)==str(SOURCE) and scope.get('sourceDirectory')==str(SOURCE) and scope.get('destination')==str(N),'INSTALL_FIXED_DESTINATION')
    outside=system.path(scope.get('outsideDirectory',''))
    P.need(outside.parent==system.path(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011') and outside.name=='gateway80-fr04-root-install01' and E not in outside.parents,'INSTALL_OUTSIDE_E_TRACE_SCOPE')
    for key,path in (('oldEDirectory',E),('outsideDirectoryFact',outside)):
        value=scope.get(key)
        P.need(type(value)is dict and set(value)=={'path','uid','dev','ino','mode'} and value['path']==str(path) and all(type(value[n])is int and value[n]>=0 for n in ('uid','dev','ino','mode')) and value['mode']==0o700,'INSTALL_TYPED_DIRECTORY_FACT')
    base=scope.get('candidate');P.need(type(base)is dict,'INSTALL_CANDIDATE_SHAPE')
    # No N02/attempt/draft mutation until complete physical acquisition + pure preflight.
    sink.stage='EXTERNAL_SOURCE_BUFFERS';raw,metadata=acquire(system,base,contract,scope,source)
    buffers={name:raw[str(source/name)] for name in contract['installedCode']}
    P.need(P.decode(buffers['contract.json'])==contract,'INSTALL_CONTRACT_BUFFER')
    required=P.binary_requirements(base,contract);witnesses={}
    for path,h in required.items():
        st=metadata[path]
        witnesses[path]=dict(path=path,sha256=P.sha(raw[path]),mode=stat.S_IMODE(st.st_mode),dev=st.st_dev,ino=st.st_ino,uid=st.st_uid,bytes=st.st_size,mtimeNs=st.st_mtime_ns,ctimeNs=st.st_ctime_ns,acquisition='SAME_BUFFER_NOFOLLOW_FD')
    records={path:raw[path] for path in set(base['newCodeRecordPins'])|set(base['typedOwnerRecordPins'])}
    sink.stage='AUTHORITY_SHAPE';draft=F.preflight(base,contract,buffers,witnesses,records)
    sink.stage='OLD_E_MEMBERSHIP';old=system.custody(E,0o700);out=None;created=None;primary=None;creation=dict(created=False,openedIdentity=None);sink.namespace_state=creation
    try:
        P.need(fact(old,E)==scope.get('oldEDirectory'),'INSTALL_OLD_E_IDENTITY')
        audit_ancestry(system,contract,old,False)
        sink.stage='DIRECTORY_CUSTODY';out=system.custody(outside,0o700);P.need(fact(out,outside)==scope.get('outsideDirectoryFact'),'INSTALL_OUTSIDE_CUSTODY')
        P.need(set(out.members())<=OUTSIDE_NAMES|OWNER_NAMES|{'root-install-scope.json'},'INSTALL_STRICT_OUTSIDE_NAMES')
        for name in out.members():
            st=out.info(name);P.need(stat.S_ISREG(st.st_mode) and stat.S_IMODE(st.st_mode)==0o600 and st.st_uid==system.uid() and st.st_nlink==1,'INSTALL_OUTSIDE_MEMBER_TYPE')
        P.need(all(out.absent(n) for n in OUTSIDE_NAMES),'INSTALL_ONCE_NO_RESET')
        out.write('pending-draft.json',P.packed(draft)+b'\n',0o600)
        out.write('install-attempt.json',P.packed(dict(cap=1,scopeSha256=scope['externalScopeSha256'],draftSha256=P.sha(P.packed(draft))))+b'\n',0o600)
        sink.stage='N03_CUSTODY';old.mkdir(N.name,0o700,creation=creation);created=system.custody(N,0o700)
        physical=fact(created,N);creation['openedIdentity']=dict(physical);candidate=F.finalize(draft,contract,buffers,witnesses,records,physical)
        # SAME validated draft and code buffers; no reopened source/hand-built map.
        sink.stage='N03_MEMBERSHIP'
        for name in contract['installedCode']:created.write(name,buffers[name],0o600)
        auth=P.packed(candidate)+b'\n';created.write('root-authorization.json',auth,0o600)
        P.need(set(created.members())==set(contract['installedCode'])|{'root-authorization.json'},'INSTALL_EXACT_SEVEN_NEW_MEMBERS')
        for name,data in {**buffers,'root-authorization.json':auth}.items():
            read,st=created.read(name,0o600,contract['limits']['maximumFileBytes']);P.need(read==data,'INSTALL_POST_WRITE_EQUALITY')
        P.need(fact(created,N)==physical,'INSTALL_N_IDENTITY_STABLE');audit_ancestry(system,contract,old,True);out.check()
        result=dict(kind='FAILED_RESOURCE_SOURCE06_INSTALLATION_ONLY',typedRoleBinding=P.typed_binding(candidate,contract),installationExit=0,phaseAuthority=False,N=physical,authorizationSha256=P.sha(auth),entrySha256=P.sha(buffers['entry.py']),draftSha256=P.sha(P.packed(draft)),nativeInvocations=0,credit=False,installerClient=dict(pid=system.pid(),ppid=system.ppid(),start=None,fullFingerprint=None,completionOwedToOuterTool=True),namespaceState=state_snapshot(system,contract,P.sha(auth),'INSTALL',0,candidate['typedPriorActors']))
        out.write('installation-result.json',P.packed(result)+b'\n',0o600);return result
    except BaseException as error:
        primary=error;sink.primary(error)
        # Partial namespace/attempt bytes remain; the named operator sink is always
        # available even when writing this outside-E trace cannot complete.
        if out is not None:
            try:out.write('installation-failure.json',P.packed(dict(status='HOLD',partialNamespace=creation['created'],namespaceCreated=creation['created'],openedIdentity=creation['openedIdentity'],attemptConsumed=not out.absent('install-attempt.json'),qualified=False,NFact=False))+b'\n',0o600)
            except BaseException as cleanup:sink.cleanup(cleanup)
        raise
    finally:
        had_primary=primary is not None
        for c in (created,out,old):
            if c is not None:
                try:c.close()
                except BaseException as cleanup:
                    sink.cleanup(cleanup)
                    if primary is None:primary=cleanup
        if primary is not None:
            sink.primary(primary)
            if not had_primary:raise primary
