"""Inactive Gateway failed-red-resource adapter. Definitions only; entry.py verifies code.

Old E/R/W remain original. All new writes are N-only. No native/compile/cleanup entry.
"""
import ast
import errno
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time
import types

R=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
E=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs009-gateway80-offtree03-20261019'
N=E/'failed-red-resource-disposition01'
W=Path('/private/tmp/obs009-gateway80-offtree03-20261019')
D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume6'
LEAF_SHA='47db173dd0ad632f607a2effeb753754b581db6f601d78bf00e5f619d6e0a45c'
MANIFEST06='e2e3340b48628c76884d6b243dd69134052e8e2ff3d25f5ab09d94f4e9150585'
CORE=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py'
CORE_SHA='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
OUTPUTS={'negative-denial.json','held-proof.json','archive-attempt.json','archive-receipt.json','final-attempt.json','readiness.json','final-result.json','gate-attempt.json','gate-allow.json','postclose.json'}
CONTROLS={'root-authorization.json','root-negative-status.json','root-guard-admission.json','root-archive-decision.json','root-actual-review-adoption.json','root-close-permit.json','root-wrapper-result.json'}
ARCHIVES={'complete-failed-workspace-archive','original-chart-archive','red-artifact-archive'}
ROLES={'held-proof':('root-negative-status.json','NEGATIVE_ACTUAL_STATUS'),'archive':('root-archive-decision.json','ARCHIVE_FAILED_STATE'),'final':('root-actual-review-adoption.json','ACTUAL_ARCHIVE_REVIEW'),'gate':('root-close-permit.json','FAILED_EXIT_PERMIT'),'postclose':('root-wrapper-result.json','ACTUAL_WRAPPER_RESULT')}
UNRESOLVED=[]

class System:
    """Concrete boundaries; tests replace this object/its API, never safety predicates."""
    api=os
    path=Path
    def custody(self,path,mode=None):return Custody(path,mode,self.api)
    def read(self,path,mode=None,cap=16777216):
        c=self.custody(Path(path).parent)
        try:return c.read(Path(path).name,mode,cap)
        finally:c.close()
    def umask(self):
        before=os.umask(0o077)
        os.umask(before)
        return before
    def now(self):return time.time()
    def monotonic(self):return time.monotonic_ns()
    def pid(self):return os.getpid()
    def ppid(self):return os.getppid()
    def uid(self):return os.getuid()
    def python(self):return dict(reported=sys.executable,observedArgument=sys.orig_argv[0])
    def popen(self,argv):return subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    def lock_free(self,path,expected):
        c=self.custody(Path(path).parent);fd=None
        try:
            c.check();fd=os.open(Path(path).name,os.O_RDWR|os.O_NOFOLLOW,dir_fd=c.fd);st=os.fstat(fd)
            P.need(stat.S_ISREG(st.st_mode) and [st.st_dev,st.st_ino]==expected,'KERNEL_LOCK_INODE')
            P.need(Custody.key(st)==Custody.key(c.info(Path(path).name)),'LOCK_NAMED_FD')
            try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except OSError as error:P.need(error.errno in (errno.EAGAIN,errno.EACCES),'KERNEL_UNKNOWN');answer=False
            else:fcntl.flock(fd,fcntl.LOCK_UN);answer=True
            c.check();return answer
        finally:
            if fd is not None:os.close(fd)
            c.close()

class Unit:
    def __init__(self,system,authority,authority_sha,contract,control,control_sha,code_buffers):
        self.s,self.a,self.auth_sha,self.k,self.control,self.control_sha=system,authority,authority_sha,contract,control,control_sha
        P.authority(authority,contract)
        self.code_buffers=code_buffers
        self.pins={str(N/'root-authorization.json'):authority_sha,**{str(N/n):h for n,h in authority['codePins'].items()}}
        self.merge_pins(authority['rootInputPins'])
        if control is not None:
            P.need(type(control.get('inputPins'))is dict,'EXTERNAL_CONTROL_PIN_MAP')
            self.merge_pins(control['inputPins']);self.merge_pins({str(N/ROLES[control['mode']][0]):control_sha})
        P.need(authority.get('externalPins')=={str(R/path):h for path,h in contract['externalSourcePins'].items()},'EXACT_EXTERNAL_SOURCE_PIN_MAP')
        P.need(all(self.s.path(path).parent==self.s.path(N) for path in authority['rootInputPins']),'N_CONTROL_PIN_SCOPE')
        P.need(set(authority.get('newDirectoryPins',{}))=={str(N)},'N_ONLY_NEW_DIRECTORY_PIN_SCOPE')
        self.owned={};self.buffers={};self.file_facts={};self.utilities=[];self.utility_number=0;self.client=None;self.client_bound=False;self.published=set();self.prequalified=False;self.pending=[]
        self.mode='negative' if control is None else control['mode'];self.d=None;self.C=None;self.last_probe=None
        if control is not None:self.validate_root(control,ROLES[self.mode][1])
        self.oldpins={r['path']:r for r in contract['frozenEvidence']['oldMembers']}
        P.need(len(self.oldpins)==2263,'OLD_EXACT_COUNT')
        self.c=system.custody(N,0o700)
        try:
            self.old=system.custody(E,0o700)
            actual=self.c.chain[-1][3];fact=dict(path=str(N),uid=actual[3],dev=actual[0],ino=actual[1],mode=stat.S_IMODE(actual[2]))
            P.need(authority['newDirectoryPins'][str(N)]==fact,'ROOT_N_OPENED_IDENTITY')
        except BaseException:
            self.c.close()
            if hasattr(self,'old'):self.old.close()
            raise

    def merge_pins(self,pins):
        for path,h in pins.items():
            P.need(type(path)is str and self.s.path(path).is_absolute() and P.pin(h),'CANONICAL_EXTERNAL_PIN')
            P.need(path not in self.pins or self.pins[path]==h,'CONFLICTING_EXTERNAL_PIN')
            self.pins[path]=h

    def bound(self,path,expected=None,mode=None,cap=16777216):
        path=self.s.path(path);wanted=expected or self.pins.get(str(path))
        P.need(P.pin(wanted),'EXTERNAL_PIN_REQUIRED')
        P.need(str(path) not in self.pins or self.pins[str(path)]==wanted,'CONFLICTING_EXPLICIT_INPUT_PIN')
        wanted_mode=self.a.get('binaryModes',{}).get(str(path),mode)
        P.need(mode is None or wanted_mode==mode,'IMMUTABLE_MODE_CONFLICT')
        if path.parent==self.s.path(N):raw,info=self.c.read(path.name,wanted_mode,cap)
        elif path.parent==self.s.path(E):raw,info=self.old.read(path.name,wanted_mode,cap)
        else:raw,info=self.s.read(path,wanted_mode,cap)
        P.need(P.sha(raw)==wanted,'VERIFIED_CONSUMED_BUFFER_CHANGED')
        fact=(info.st_dev,info.st_ino,info.st_mode,info.st_uid,info.st_size,info.st_mtime_ns,info.st_ctime_ns)
        P.need(str(path) not in self.file_facts or self.file_facts[str(path)]==fact,'IMMUTABLE_FILE_IDENTITY_CHANGED')
        self.file_facts[str(path)]=fact  # Continuity only AFTER external SHA authorization; never self-pins bytes.
        if str(path) in self.buffers:P.need(self.buffers[str(path)]==raw,'IMMUTABLE_BUFFER_SUBSTITUTED')
        self.buffers[str(path)]=raw;self.pins[str(path)]=wanted
        return raw
    def document(self,path,expected=None):return P.decode(self.bound(path,expected))
    def local(self,name):
        P.need(name in CONTROLS|OUTPUTS or re.fullmatch(r'(client-[0-9]+-[0-9a-f]{16}|utility-[0-9]+-[0-9a-f]{16}-[0-9]+)\.json',name)is not None,'LOCAL_NAME')
        return self.document(N/name,self.owned.get(name) or self.pins.get(str(N/name)))
    def write(self,name,value):
        P.need(self.prequalified is True,'NO_OUTPUT_BEFORE_QUALIFICATION')
        P.need(name in OUTPUTS or re.fullmatch(r'(client-[0-9]+-[0-9a-f]{16}|utility-[0-9]+-[0-9a-f]{16}-[0-9]+)\.json',name)is not None,'N_ONLY_OUTPUT_NAME')
        raw=P.packed(value)+b'\n';self.c.write(name,raw,0o600);self.owned[name]=P.sha(raw)
        return self.owned[name]
    def validate_root(self,value,role):
        P.need(value.get('authorizedBy')=='root' and value.get('role')==role and value.get('releaseSha256')==self.auth_sha and value.get('credit') is False and value.get('cleanup') is False,'ROOT_ROLE_OR_SCOPE')
        P.need(value.get('subjectHoldSha256')==self.k['subject']['holdSha256'] and value.get('oldIndexSha256')==self.k['frozenEvidence']['terminalIndexSha256'],'ROOT_SUBJECT_PINS')
        P.need(P.packed(value.get('retainedFailure'))==P.packed(self.k['retainedFailure']),'ROOT_NO_HISTORICAL_REPAIR')
    def check_members(self):
        P.need(set(self.old.members())==set(self.oldpins)|{N.name},'OLD_E_MEMBERSHIP_PLUS_N_ONLY')
        for name,row in self.oldpins.items():
            raw,st=self.old.read(name,row['mode'],self.k['limits']['maximumFileBytes'])
            P.need(len(raw)==row['bytes'] and P.sha(raw)==row['sha256'],'OLD_E_BYTES_CHANGED')
        for name in self.c.members():
            st=self.c.info(name)
            if name in ARCHIVES:P.need(stat.S_ISDIR(st.st_mode) and stat.S_IMODE(st.st_mode)==0o700 and st.st_uid==self.s.uid(),'ARCHIVE_ROOT_TYPE_OWNER');continue
            P.need(stat.S_ISREG(st.st_mode) and stat.S_IMODE(st.st_mode)==0o600 and st.st_uid==self.s.uid() and st.st_nlink==1,'N_MEMBER_MODE_OWNER')
            P.need(name in set(self.k['installedCode'])|CONTROLS|OUTPUTS or re.fullmatch(r'(client-[0-9]+-[0-9a-f]{16}|utility-[0-9]+-[0-9a-f]{16}-[0-9]+)\.json',name) is not None,'N_STRICT_MEMBER_NAME')
            expected=self.owned.get(name) or self.pins.get(str(N/name))
            P.need(P.pin(expected),'UNPINNED_PREEXISTING_N_MEMBER')
            self.bound(N/name,expected,0o600,self.k['limits']['maximumFileBytes'])
        self.c.check();self.old.check()

    def load_libraries(self):
        P.need(self.a.get('exactIndependentCodeReviewsQualified') is True and type(self.a.get('newCodeRecordPins'))is dict,'EXACT_NEW_CODE_REVIEWS_OWED')
        expected_records={str(R/'docs/qa/evidence/STUDIO-OBS-011/t0'/rel) for rel in ('early/gateway80-failed-red-resource-prep/resume1/manifest.json','resume-architecture/resume2/gateway80-failed-red-resource-exact-review/manifest.json','qa/gateway80-failed-red-resource-exact-review/manifest.json')}
        P.need(set(self.a['newCodeRecordPins'])==expected_records,'EXACT_THREE_NEW_CODE_RECORDS')
        for path,h in self.a['newCodeRecordPins'].items():
            P.need(str(path).startswith(str(R/'docs/qa/evidence/STUDIO-OBS-011/t0/')) and '/runtime/' not in str(path) and str(path).endswith('/manifest.json'),'NEW_CODE_RECORD_SCOPE')
            self.bound(path,h,0o644)
        # Exact source06 retained-buffer library, never its main/final/success publisher.
        raw=self.bound(D/'verified-inputs.py',LEAF_SHA,0o644)
        leaf=types.ModuleType('_verified_gateway06_leaf');exec(compile(raw,'<verified-leaf>','exec'),leaf.__dict__)
        leaf.Path=self.s.path;leaf.R=self.s.path(R);leaf.E=self.s.path(E);leaf.EXPECTED=self.s.path(D)
        leaf.anchored_raw=lambda path:self.s.read(path,None,134217728)[0]
        buffers=leaf.package_buffers(self.s.path(D),MANIFEST06)
        for path,h in self.a['externalPins'].items():self.bound(path,h)
        self.d=leaf.load_driver(self.s.path(D),buffers);d=self.d
        for name in ('R','E','W','D'):setattr(d,name,self.s.path(getattr(d,name)))
        P.need(str(d.E)==str(E) and str(d.W)==str(W),'ORIGINAL_E_W_NOT_N')
        d.Path=self.s.path;d.os=self.s.api
        d.utc=lambda:datetime.datetime.fromtimestamp(self.s.now(),datetime.timezone.utc).isoformat()
        d.SAFE_READER=lambda path:self.s.read(path,None,134217728)[0]
        d.TOOL_READER=d.SAFE_READER;d.sha=lambda path:P.sha(d.SAFE_READER(path))
        for name,row in self.oldpins.items():d.IMMUTABLE_EXPECTED[str(self.s.path(E)/name)]=row['sha256']
        for path,h in self.a['externalPins'].items():d.IMMUTABLE_EXPECTED[path]=h
        # Seed CORE only from one externally verified consumed buffer before AST.
        d.IMMUTABLE_BYTES[str(CORE)]=self.bound(CORE,CORE_SHA,0o644)
        d.IMMUTABLE_EXPECTED[str(CORE)]=CORE_SHA
        d.observe_capture=self.capture
        original_inventory=d.inventory
        d.inventory=lambda path:self.bounded_inventory(path) if path==self.s.path(W) or self.s.path(W) in path.parents or self.s.path(N) in path.parents else original_inventory(path)
        d.owned_write_path=lambda path:P.need(self.s.path(N) in path.parents,'N_ONLY_LIBRARY_WRITE')
        d.setup_custody(self.document(E/'root-authorization.json',self.k['subject']['releaseSha256']))
        self.C=d.core(postclose=self.mode=='postclose')
        self.C.update(Path=self.s.path,os=self.s.api,ROOT=self.s.path(R),capture=self.capture,bounded_capture=self.capture,table=self.table,utc=d.utc)
        self.original=self.document(E/'root-authorization.json',self.k['subject']['releaseSha256'])
        required_binaries={r['path']:r['sha256'] for r in [*self.a['pythonRoles'].values(),*self.a['observationExecutables'].values()]}
        required_binaries.update({self.original['nodeCanonicalPath']:self.original['nodeSha256'],self.original['helmCanonicalPath']:self.original['helmSha256']})
        P.need(self.a.get('binaryHashes')==required_binaries and set(self.a.get('binaryModes',{}))==set(required_binaries) and all(type(mode)is int and 0<=mode<=0o7777 and bool(mode&0o111) for mode in self.a['binaryModes'].values()),'EXACT_BINARY_MODES_HASHES')
        self.hold=self.document(E/'hold.json',self.k['subject']['holdSha256'])
        # Every source06 old JSON reader is seeded by old2263 externally verified pins.
        d.CUSTODY_PINS.update(self.a['newDirectoryPins'])

    def capture(self,command,allowed=(0,)):
        P.need(type(command)is list and command and type(allowed)is tuple and all(type(x)is int and x in(0,1) for x in allowed),'UTILITY_ARGV')
        binding=self.a['observationExecutables'].get(command[0]);P.need(type(binding)is dict,'UTILITY_CANONICAL_BINDING')
        P.need(command[0] in ('/bin/ps','/usr/sbin/lsof','git'),'NO_NATIVE_TOOL')
        P.need(str(self.s.path(binding['path']).resolve())==binding['path'],'UTILITY_CANONICAL_NO_ALIAS')
        raw=self.bound(binding['path'],binding['sha256']);actual=[binding['path'],*command[1:]]
        self.utility_number+=1
        record=dict(kind='FAILED_RESOURCE_UTILITY',releaseSha256=self.auth_sha,number=self.utility_number,client=self.client,
            pid=None,command=actual,executableSha256=P.sha(raw),terminal=False,status=None,stdoutComplete=False,stderrComplete=False,stderrEmpty=False,allowedStatuses=list(allowed),classification='UNKNOWN_BEFORE_LAUNCH',identityLimitation='POPEN_PID_REQUESTED_ARGV_BINARY_WAIT_BOUND_CHILD_START_UNOBSERVED_UNLESS_CENSUS_JOIN')
        self.utilities.append(record);child=None
        try:
            child=self.s.popen(actual);record['pid']=child.pid;P.need(type(child.pid)is int and child.pid>0,'UTILITY_PID')
            output,error=child.communicate(timeout=15)
            status=child.wait(timeout=15)
            record.update(terminal=type(status)is int,status=status,stdoutComplete=type(output)is str,stderrComplete=type(error)is str,stderrEmpty=error=='',classification='WAITED_POPEN_CHILD')
            if type(output)is str:record.update(stdoutSha256=P.sha(output.encode()),stdoutBytes=len(output.encode()))
            if type(error)is str:record.update(stderrSha256=P.sha(error.encode()),stderrBytes=len(error.encode()))
            P.need(record['terminal'] is True and record['stdoutComplete'] is True and record['stderrComplete'] is True and record['stderrEmpty'] is True and type(status)is int and status in allowed,'UTILITY_PARTIAL_OR_NONZERO_OR_STDERR')
            if status==1:P.need(output=='' and command[0] in('/bin/ps','/usr/sbin/lsof'),'UTILITY_NO_RESULT_ONLY')
            self.bound(binding['path'],binding['sha256']);self.last_probe=record
            return output
        except BaseException as error:
            record['classification']='UNKNOWN_CURRENT_UTILITY';record['failureClass']=type(error).__name__;record['partialStdoutAvailable']=type(getattr(error,'output',None)) in(str,bytes);record['partialStderrAvailable']=type(getattr(error,'stderr',None)) in(str,bytes)
            if child is not None and record['terminal'] is not True:self.pending.append(child);UNRESOLVED.append((self,child))
            raise
        finally:
            if self.prequalified:self.publish()

    def table(self):
        text=self.capture(['/bin/ps','-ww','-axo','pid=,ppid=,lstart=,command=']);probe=self.last_probe;rows={}
        for line in text.splitlines():
            w=line.split(None,7);P.need(len(w)==8 and w[0].isdigit() and w[1].isdigit(),'CENSUS_COMPLETE')
            pid,parent=int(w[0]),int(w[1]);P.need(pid>0 and parent>=0 and pid not in rows,'CENSUS_DUPLICATE')
            rows[pid]=dict(pid=pid,ppid=parent,start=' '.join(w[2:7]),argvHash=P.sha(w[7].encode()),projectMarkerCandidate=any(t in w[7] for t in ('GradleDaemon','GradleWrapperMain','GradleWorkerMain','worker.org.gradle','obs007-joined-','obs015-prefix-sync-','checks-guided-')),gatewayMarkerCandidate=str(W) in w[7] or str(E) in w[7] or 'vitest.gateway80.config.mjs' in w[7])
        me,parent=self.s.pid(),self.s.ppid();P.need(bool(rows) and len(rows)<=16384 and me in rows and parent in rows and rows[me]['ppid']==parent,'ANCHORED_CURRENT_PARENT')
        q=rows.get(probe['pid']);P.need(q is not None and q['ppid']==me and q['argvHash']==P.sha(' '.join(probe['command']).encode()) and probe['terminal'] is True and probe['status']==0,'EXACT_WAITED_CENSUS_PROBE')
        P.need(self.k['finiteUnion']['startlessCandidate']['pid'] not in rows,'STARTLESS_NUMERIC_PRESENT_HOLD')
        P.need(not any(rows.get(who['pid'],{}).get('start')==who['start'] for who in self.k['finiteUnion']['historicalPidStartsRequiringAbsentOrReused']),'HISTORICAL_SAME_START_LIVE')
        exact_controllers=set() if self.mode=='postclose' else {self.k['subject'][role]['pid'] for role in ('wrapper','shell') if rows.get(self.k['subject'][role]['pid'],{}).get('start')==self.k['subject'][role]['start'] and rows[self.k['subject'][role]['pid']]['argvHash']==self.k['subject'][role]['argvHash']}
        P.need(not [row for row in rows.values() if row['gatewayMarkerCandidate'] and row['pid'] not in {me,probe['pid']}|exact_controllers],'CURRENT_GATEWAY_MARKER')
        probe['observedStart']=q['start'];self.census_probe=probe
        if self.client_bound:
            P.need(rows[me]['start']==self.client['start'] and rows[me]['argvHash']==self.client['argvHash'] and rows[me]['ppid']==self.client['ppid'],'CURRENT_CLIENT_REUSED_OR_REPARENTED')
            P.need(rows.get(parent)==self.parent_identity,'CURRENT_PARENT_CENSUS_CHANGED')
        return rows

    def client_identity(self,row):
        roles=self.a['pythonRoles'];P.need(set(roles)=={'launch','reported','process','observedArgument'} and roles['process']==roles['observedArgument'],'PYTHON_FOUR_ROLES')
        P.need(self.s.python()=={'reported':roles['reported']['path'],'observedArgument':roles['observedArgument']['path']},'BIN_APP_ROLE_MISMATCH')
        for item in roles.values():
            P.need(str(self.s.path(item['path']).resolve())==item['path'],'PYTHON_ROLE_CANONICAL')
            self.bound(item['path'],item['sha256'])
        before={k:self.C['pid_text'](row['pid'],k) for k in ('lstart','comm','command')}
        P.need(before['lstart']==row['start'] and before['comm']==roles['process']['path'] and P.sha(before['command'].encode())==row['argvHash'],'CLIENT_PID_START_ARGV_PROCESS')
        for unused in range(2):
            mapping=self.capture(['/usr/sbin/lsof','-nP','-a','-p',str(row['pid']),'-d','txt','-F','n'])
            P.need('n'+roles['process']['path'] in mapping.splitlines(),'CLIENT_IMAGE_MAP')
            self.bound(roles['process']['path'],roles['process']['sha256'])
        after={k:self.C['pid_text'](row['pid'],k) for k in ('lstart','comm','command')};P.need(before==after,'CLIENT_IDENTITY_CHANGED')
        return dict(row,identityComplete=True,commHash=P.sha(before['comm'].encode()),executableHash=P.sha(roles['process']['path'].encode()),executableFileHash=roles['process']['sha256'],configuredLaunch=roles['launch'],reported=roles['reported'],observedArgument=roles['observedArgument'])

    def register(self):
        P.need(self.s.umask()==0o077,'OBSERVER_UMASK_077')
        self.check_members();self.load_libraries();rows=self.table();self.parent_identity=dict(rows[self.s.ppid()]);self.client=self.client_identity(rows[self.s.pid()])
        if self.mode!='postclose':self.d.held(self.original,self.C)
        else:self.postclose_lock(rows)
        # All prequalification observations remain memory-only until exact holder/client proof.
        self.prequalified=True;self.client_bound=True
        token=str(self.client['pid'])+'-'+P.sha(self.client['start'].encode())[:16]
        self.client_name='client-'+token+'.json'
        self.write(self.client_name,dict(kind='FAILED_RESOURCE_CLIENT',mode=self.mode,releaseSha256=self.auth_sha,identity=self.client,parentIdentity=self.parent_identity,parentBinaryFingerprintClaimed=False))
        self.publish()
    def publish(self):
        if not self.prequalified:return
        for record in self.utilities:
            name='utility-'+str(self.client['pid'])+'-'+P.sha(self.client['start'].encode())[:16]+'-'+str(record['number'])+'.json'
            if name not in self.published:
                # Census record gets its observedStart before this publication when used;
                # WAITED record alone is sufficient for non-census finite child accounting.
                value=dict(record,client=self.client)
                self.write(name,value);self.published.add(name)
    def clients(self,rows):
        clients=[]
        for name in self.c.members():
            if name.startswith('client-'):
                item=self.local(name);who=item['identity']
                P.need(type(who.get('pid'))is int and who['pid']>0 and type(who.get('ppid'))is int and who['ppid']>0 and type(who.get('start'))is str and bool(who['start']) and all(P.pin(who.get(k)) for k in ('argvHash','commHash','executableHash','executableFileHash')),'CLIENT_HISTORY_TYPED_IDENTITY')
                P.need(who.get('configuredLaunch')==self.a['pythonRoles']['launch'] and who.get('reported')==self.a['pythonRoles']['reported'] and who.get('observedArgument')==self.a['pythonRoles']['observedArgument'] and who['executableFileHash']==self.a['pythonRoles']['process']['sha256'] and item.get('parentBinaryFingerprintClaimed') is False,'CLIENT_HISTORY_ROLES')
                P.need(item['kind']=='FAILED_RESOURCE_CLIENT' and item['releaseSha256']==self.auth_sha and who.get('identityComplete') is True,'CLIENT_JOURNAL')
                P.need(name=='client-'+str(who['pid'])+'-'+P.sha(who['start'].encode())[:16]+'.json','CLIENT_NAME')
                clients.append(who)
        P.need(self.client in clients,'CURRENT_CLIENT_NOT_RECORDED')
        for name in self.c.members():
            if name.startswith('utility-'):
                item=self.local(name)
                bindings={v['path']:v['sha256'] for v in self.a['observationExecutables'].values()}
                P.need(type(item.get('number'))is int and item['number']>0 and type(item.get('pid'))is int and item['pid']>0 and name=='utility-'+str(item['client']['pid'])+'-'+P.sha(item['client']['start'].encode())[:16]+'-'+str(item['number'])+'.json','UTILITY_HISTORY_NAME_PID')
                command=item.get('command');allowed=item.get('allowedStatuses')
                P.need(type(command)is list and bool(command) and all(type(v)is str for v in command) and command[0] in bindings and item.get('executableSha256')==bindings[command[0]] and type(allowed)is list and bool(allowed) and all(type(v)is int and v in(0,1) for v in allowed),'UTILITY_HISTORY_CANONICAL_COMMAND')
                P.need(all(P.pin(item.get(k)) for k in ('stdoutSha256','stderrSha256')) and all(type(item.get(k))is int and item[k]>=0 for k in ('stdoutBytes','stderrBytes')) and item['stderrBytes']==0 and item['stderrSha256']==P.sha(b''),'UTILITY_HISTORY_COMPLETE_HASHES')
                P.need(item['kind']=='FAILED_RESOURCE_UTILITY' and item['client'] in clients and item['releaseSha256']==self.auth_sha and item['terminal'] is True and type(item['status'])is int and item['status'] in item['allowedStatuses'] and item['stdoutComplete'] is True and item['stderrComplete'] is True and item['stderrEmpty'] is True and item['classification']=='WAITED_POPEN_CHILD','UTILITY_HISTORY_UNKNOWN')
        return clients
    def postclose_lock(self,rows):
        for role in ('wrapper','shell'):
            old=self.k['subject'][role];P.need(rows.get(old['pid'],{}).get('start')!=old['start'],'POSTCLOSE_OLD_CONTROLLER_LIVE')
        lock=self.k['subject']['lock'];P.need(self.s.lock_free(lock['path'],[lock['dev'],lock['ino']]) is True,'POSTCLOSE_KERNEL_NOT_FREE')
    def observe(self,archive=False):
        for path,mode in self.a['binaryModes'].items():
            expected=self.a['binaryHashes'][path];self.bound(path,expected,mode)
        self.check_members();before=self.d.guards(self.original,self.C);first=self.table();probe=self.census_probe
        if self.mode!='postclose':self.d.held(self.original,self.C)
        else:self.postclose_lock(first)
        clients=self.clients(first);controllers=set() if self.mode=='postclose' else {self.k['subject'][r]['pid'] for r in ('wrapper','shell')}
        one=P.finite_join(first,self.k,clients,self.client,controllers,probe)
        resources=self.d.boundary(self.hold,self.C,self.original)
        P.need(not [who for who in resources['workerCandidates']['unrelatedVerified'] if who.get('cwd')==str(E) or who.get('cwd','').startswith(str(E)+'/')],'NEW_NODE_E_RELATED_CWD')
        # Existing06 boundary permits matched/absent/reused protected6; never require all6live.
        P.need(not resources['inheritedIdentityChanged'] and not resources['incompleteStableIdentities'] and not resources['otherProjectFacts'],'INHERITED_BOUNDARY')
        for row in first.values():
            if row['projectMarkerCandidate']:P.need(self.C['project_role'](row['pid']) is not None,'CURRENT_UNKNOWN_PROJECT_ROLE')
        # Old waited utility PID numbers are NOT ownership/listener exemptions or claims.
        relevant=controllers|{self.s.pid()}|{c['pid'] for c in clients if first.get(c['pid'],{}).get('start')==c['start']}
        P.need(not [r for r in resources['listeners'] if r['pid'] in relevant],'FINITE_RELEVANT_LISTENER')
        if archive:self.check_archives()
        after=self.d.guards(self.original,self.C);last=self.table();probe=self.census_probe
        two=P.finite_join(last,self.k,self.clients(last),self.client,controllers,probe)
        P.need({k:v for k,v in before.items() if k!='atUtc'}=={k:v for k,v in after.items() if k!='atUtc'},'SOURCE_BEFORE_AFTER_CHANGED')
        for path,mode in self.a['binaryModes'].items():self.bound(path,self.a['binaryHashes'][path],mode)
        self.check_members()
        P.need(not self.pending and all(r['terminal'] is True and r['classification']=='WAITED_POPEN_CHILD' for r in self.utilities),'CURRENT_UTILITY_UNKNOWN')
        return dict(sourceBefore=before,sourceAfter=after,resources=resources,finiteBefore=one,finiteAfter=two,releaseSha256=self.auth_sha,oldIndexSha256=self.k['frozenEvidence']['terminalIndexSha256'],retainedFailure=self.k['retainedFailure'],quietHost=False,credit=False)

    def bounded_inventory(self,path):
        # Metadata/size caps are checked BEFORE reading any body; links are ENTRY only.
        rows=[];total=0
        def visit(root,prefix=''):
            nonlocal total
            c=self.s.custody(root)
            try:
                for name in c.members():
                    rel=prefix+name;st=c.info(name)
                    P.need(len(rows)<self.k['limits']['maximumArchiveEntries'],'ARCHIVE_ENTRY_CAP')
                    row=dict(path=rel,uid=st.st_uid,mode=stat.S_IMODE(st.st_mode),dev=st.st_dev,ino=st.st_ino)
                    if stat.S_ISLNK(st.st_mode):
                        target=c.readlink(name);P.need(rel=='repo/studio-runner/node_modules' and target==self.d.SCOPE['dependencies'],'ONLY_DEPENDENCY_LINK_ENTRY')
                        row.update(kind='symlink',target=target);rows.append(row)
                    elif stat.S_ISDIR(st.st_mode):row['kind']='directory';rows.append(row);visit(self.s.path(root)/name,rel+'/')
                    else:
                        P.need(stat.S_ISREG(st.st_mode) and 0<=st.st_size<=self.k['limits']['maximumFileBytes'],'ARCHIVE_FILE_CAP_TYPE');total+=st.st_size
                        P.need(total<=self.k['limits']['maximumArchiveBytes'],'ARCHIVE_TOTAL_BYTE_CAP')
                        raw,unused=c.read(name,row['mode'],self.k['limits']['maximumFileBytes']);row.update(kind='file',bytes=len(raw),sha256=P.sha(raw));rows.append(row)
                c.check()
            finally:c.close()
        visit(self.s.path(path));return sorted(rows,key=lambda x:x['path'])
    def copy_tree(self,source,destination,rows):
        self.d.safe_archive_tree(source,destination)
        actual=self.bounded_inventory(destination);P.need(P.equivalent(rows)==P.equivalent(actual),'ARCHIVE_COPY_EQUALITY')
        return actual
    def require_admission(self):
        ad=self.local('root-guard-admission.json');self.validate_root(ad,'FAILED_GUARD_ADMISSION')
        P.need(ad.get('setupActualStatus')==0 and type(ad.get('setupActualStatus'))is int and ad.get('negativeActualStatus')==1 and type(ad.get('negativeActualStatus'))is int and ad.get('heldProofActualStatus')==0 and type(ad.get('heldProofActualStatus'))is int,'ACTUAL_ADMISSION_STATUSES')
        P.need(all(ad.get(k) is True for k in ('setupInspected','negativeSeparateStatusCaptured','heldSeparateStatusCaptured','sameHolderAfterDenial','oldNormalBindingsUnchanged','newReadonlyBindingInspected')),'ADMISSION_INSPECTIONS')
        P.need(ad.get('configuredLaunch')==self.a['pythonRoles']['launch'] and type(ad.get('configuredLaunchOperatorTrace'))is list and bool(ad['configuredLaunchOperatorTrace']),'REQUESTED_LAUNCH_OPERATOR_TRACE')
        P.need(ad.get('heldProofSha256')==self.owned.get('held-proof.json',self.pins.get(str(N/'held-proof.json'))) and ad.get('negativeSha256')==self.owned.get('negative-denial.json',self.pins.get(str(N/'negative-denial.json'))),'ADMISSION_HASH_CHAIN')
        proof=self.local('held-proof.json');P.need(proof.get('verificationExit')==0 and proof.get('negativeSha256')==ad['negativeSha256'],'ADMITTED_HELD_PROOF')
        return ad
    def make_archive(self):
        self.require_admission();self.write('archive-attempt.json',dict(releaseSha256=self.auth_sha,cap=1));before=self.observe()
        self.d.workspace_guard('original');self.d.chart_guard(self.s.path(W)/'repo/helm-chart/put-checks',False)
        P.need(self.d.owned_root_identity()==self.k['protectedInputs']['ownedWorkspaceBinding'],'OWNED_W_IDENTITY')
        rows=self.bounded_inventory(W);self.copy_tree(self.s.path(W),self.s.path(N)/'complete-failed-workspace-archive',rows)
        chart=self.bounded_inventory(self.s.path(W)/'repo/helm-chart/put-checks');P.need(len([r for r in chart if r['kind']=='file'])==22,'ORIGINAL_22_CHART')
        self.copy_tree(self.s.path(W)/'repo/helm-chart/put-checks',self.s.path(N)/'original-chart-archive',chart)
        self.d.safe_mkdir(self.s.path(N)/'red-artifact-archive');raws=[]
        for row in self.k['frozenEvidence']['rawArtifactRefs']:
            self.d.safe_new_copy(self.s.path(E)/row['path'],self.s.path(N)/'red-artifact-archive'/row['path'],row['mode']);raws.append({k:row[k] for k in ('path','sha256','bytes','mode')})
        P.need(self.bounded_inventory(W)==rows,'FAILED_W_CHANGED_DURING_ARCHIVE')
        receipt=dict(releaseSha256=self.auth_sha,oldIndexSha256=self.k['frozenEvidence']['terminalIndexSha256'],workspace=self.k['protectedInputs']['ownedWorkspaceBinding'],workspaceInventory=rows,chartInventory=chart,rawArtifacts=raws,before=before,after=self.observe(),retainedFailure=self.k['retainedFailure'],credit=False,nativeInvocations=0)
        self.write('archive-receipt.json',receipt);self.check_archives();return receipt
    def check_archives(self):
        receipt=self.local('archive-receipt.json');P.need(receipt['releaseSha256']==self.auth_sha and receipt['retainedFailure']==self.k['retainedFailure'],'FAILED_ARCHIVE_RELEASE')
        self.d.workspace_guard('original');self.d.chart_guard(self.s.path(W)/'repo/helm-chart/put-checks',False)
        current=self.bounded_inventory(W);P.need(current==receipt['workspaceInventory'],'ORIGINAL_FAILED_W_ARCHIVE_DRIFT')
        for source,name,rows in [(W,'complete-failed-workspace-archive',current),(self.s.path(W)/'repo/helm-chart/put-checks','original-chart-archive',receipt['chartInventory'])]:
            actual=self.bounded_inventory(self.s.path(N)/name);P.need(P.equivalent(rows)==P.equivalent(actual),'FAILED_ARCHIVE_EQUALITY_DRIFT')
        rawdir=self.s.custody(N/'red-artifact-archive')
        try:
            P.need(set(rawdir.members())=={r['path'] for r in receipt['rawArtifacts']},'RAW_ARCHIVE_SET')
            for row in receipt['rawArtifacts']:
                raw,st=rawdir.read(row['path'],row['mode'],self.k['limits']['maximumFileBytes']);P.need(len(raw)==row['bytes'] and P.sha(raw)==row['sha256'],'RAW_FAILED_ARTIFACT_EQUALITY')
        finally:rawdir.close()

    def require_actual_archive_review(self):
        review=self.local('root-actual-review-adoption.json');self.validate_root(review,'ACTUAL_ARCHIVE_REVIEW')
        P.need(type(review.get('actualArchiveExit'))is int and review['actualArchiveExit']==0 and all(review.get(k) is True for k in ('actualQaReviewed','archiveInspected','separatelyCaptured')),'ACTUAL_ARCHIVE_QA_INSPECTED')
        qa=review.get('independentQaRecord')
        P.need(type(qa)is dict and qa.get('path')==str(R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway80-failed-red-resource-actual-archive-review/manifest.json') and review.get('inputPins',{}).get(qa['path'])==qa.get('sha256'),'INDEPENDENT_ACTUAL_QA_PIN')
        self.bound(qa['path'],qa['sha256'],0o644)
        P.need(review.get('archiveReceiptSha256')==self.pins[str(N/'archive-receipt.json')],'ACTUAL_ARCHIVE_RECEIPT_PIN')
        return review

    def operate(self):
        if self.mode=='negative':
            P.need(self.c.absent('readiness.json') and self.c.absent('root-close-permit.json'),'NEGATIVE_ORDER')
            self.observe();self.write('negative-denial.json',dict(reason='MISSING_READINESS',status=1,releaseSha256=self.auth_sha,shellPid=self.s.ppid(),clientJournal=self.client_name,clientJournalSha256=self.owned[self.client_name],readinessAbsent=True,permitAbsent=True));return 1
        if self.mode=='held-proof':
            P.need(type(self.control.get('actualNegativeStatus'))is int and self.control['actualNegativeStatus']==1 and self.control.get('separatelyCaptured') is True and self.control.get('oldNormalBindingsUnchanged') is True,'SEPARATE_NEGATIVE_STATUS')
            denial=self.local('negative-denial.json');P.need(denial['reason']=='MISSING_READINESS' and denial['status']==1 and type(denial['status'])is int and denial['shellPid']==self.k['subject']['shell']['pid'],'NEGATIVE_DENIAL')
            journal=self.local(denial['clientJournal'])
            P.need(journal.get('mode')=='negative' and journal.get('releaseSha256')==self.auth_sha and denial.get('clientJournalSha256')==self.pins[str(N/denial['clientJournal'])],'NEGATIVE_CLIENT_CHAIN')
            first,second=self.observe(),self.observe()
            self.write('held-proof.json',dict(verificationExit=0,releaseSha256=self.auth_sha,negativeSha256=self.pins[str(N/'negative-denial.json')],first=first,second=second));return 0
        self.require_admission()
        if self.mode=='archive':self.make_archive();return 0
        if self.mode=='final':
            self.require_actual_archive_review()
            self.write('final-attempt.json',dict(releaseSha256=self.auth_sha,cap=1));first=self.observe(True);second=self.observe(True)
            proof=dict(verificationExit=0,attemptSha256=self.owned['final-attempt.json'],expectedWrapperExit=1,releaseSha256=self.auth_sha,oldIndexSha256=self.k['frozenEvidence']['terminalIndexSha256'],retainedFailure=self.k['retainedFailure'],verifiedAtEpoch=self.s.now(),first=first,second=second,actualReviewAdoptionSha256=self.control_sha,credit=False,nativeInvocations=0)
            h=self.write('readiness.json',proof);self.write('final-result.json',dict(verificationExit=0,readinessSha256=h,releaseSha256=self.auth_sha));return 0
        if self.mode=='gate':
            P.need(type(self.control.get('expectedWrapperExit'))is int and self.control['expectedWrapperExit']==1 and type(self.control.get('actualFinalStatus'))is int and self.control['actualFinalStatus']==0 and all(self.control.get(k) is True for k in ('finalSeparateStatusCaptured','readinessInspected','oldNormalBindingsUnchanged')),'SEPARATE_FAILED_PERMIT')
            self.require_actual_archive_review()
            proof=self.local('readiness.json');result=self.local('final-result.json')
            P.need(type(proof.get('verificationExit'))is int and proof['verificationExit']==0 and type(result.get('verificationExit'))is int and result['verificationExit']==0 and type(proof.get('expectedWrapperExit'))is int and proof['expectedWrapperExit']==1 and proof.get('releaseSha256')==self.auth_sha and result.get('releaseSha256')==self.auth_sha,'EXACT_FINAL_RESULT_TYPES')
            P.need(result['readinessSha256']==self.pins[str(N/'readiness.json')] and proof['retainedFailure']==self.k['retainedFailure'] and proof['expectedWrapperExit']==1,'READINESS_PERMIT_CHAIN')
            P.need(self.control.get('readinessSha256')==self.pins[str(N/'readiness.json')] and self.control.get('finalResultSha256')==self.pins[str(N/'final-result.json')] and proof.get('actualReviewAdoptionSha256')==self.pins[str(N/'root-actual-review-adoption.json')],'PERMIT_EXACT_CHAIN_PINS')
            attempt=self.local('final-attempt.json')
            P.need(type(attempt.get('cap'))is int and attempt['cap']==1 and attempt.get('releaseSha256')==self.auth_sha and proof.get('attemptSha256')==self.pins[str(N/'final-attempt.json')],'EXCLUSIVE_FINAL_ATTEMPT_CHAIN')
            issued=self.control['issuedAtEpoch'];before=self.s.now();P.freshness(before,proof['verifiedAtEpoch'],issued)
            self.write('gate-attempt.json',dict(releaseSha256=self.auth_sha,permitSha256=self.control_sha))
            self.observe(True);self.observe(True);after=self.s.now();P.need(after>=before,'NONREVERSING_CLOCK');P.freshness(after,proof['verifiedAtEpoch'],issued)
            self.write('gate-allow.json',dict(gateExit=0,expectedWrapperExit=1,releaseSha256=self.auth_sha,permitSha256=self.control_sha,readinessSha256=self.pins[str(N/'readiness.json')],credit=False));return 0
        P.need(self.mode=='postclose','NO_NATIVE_OR_ALTERNATE_MODE')
        P.need(type(self.control.get('actualWrapperExit'))is int and self.control['actualWrapperExit']==1 and self.control.get('separatelyCaptured') is True and type(self.control.get('actualToolEvidence'))is list and bool(self.control['actualToolEvidence']),'ACTUAL_WRAPPER_ONE')
        P.need(self.control.get('gateAllowSha256')==self.pins[str(N/'gate-allow.json')] and self.control.get('permitSha256')==self.pins[str(N/'root-close-permit.json')] and self.control.get('readinessSha256')==self.pins[str(N/'readiness.json')],'WRAPPER_EXACT_PIN_CHAIN')
        self.require_actual_archive_review()
        allow=self.local('gate-allow.json');P.need(type(allow.get('gateExit'))is int and allow['gateExit']==0 and type(allow.get('expectedWrapperExit'))is int and allow['expectedWrapperExit']==1 and allow.get('permitSha256')==self.pins[str(N/'root-close-permit.json')],'ACTUAL_GATE_WRAPPER_CHAIN')
        first,second=self.observe(True),self.observe(True)
        self.write('postclose.json',dict(postcloseExit=0,expectedWrapperExit=1,releaseSha256=self.auth_sha,wrapperResultSha256=self.control_sha,first=first,second=second,credit=False,ownClientCompletionOwedToOuterTool=True));return 0

    def close(self):
        if self.pending:
            UNRESOLVED.append(self);return  # Retain custody/process references; no clean-close claim.
        self.c.close();self.old.close()

def run(mode,auth_sha,control_sha=None,system=None,root_raw=None,code_buffers=None):
    P.need(mode in P.MODES and P.pin(auth_sha),'EXACT_FAILED_RESOURCE_CLI')
    P.need((mode=='negative')==(control_sha is None),'EXACT_EXTERNAL_CONTROL_ARGUMENT')
    P.need(code_buffers is not None and root_raw is not None and P.sha(root_raw)==auth_sha,'VERIFIED_ENTRY_ONLY')
    authority=P.decode(root_raw);contract=P.decode(code_buffers['contract.json']);control=None
    concrete=System() if system is None else system
    if mode!='negative':
        P.need(P.pin(control_sha),'EXTERNAL_CONTROL_SHA');raw,unused=concrete.read(N/ROLES[mode][0],0o600)
        P.need(P.sha(raw)==control_sha,'EXTERNAL_CONTROL_BEFORE_PARSE');control=P.decode(raw);P.need(control.get('mode')==mode,'CONTROL_MODE')
    unit=Unit(concrete,authority,auth_sha,contract,control,control_sha,code_buffers)
    try:unit.register();return unit.operate()
    finally:unit.close()
