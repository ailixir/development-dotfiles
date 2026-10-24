"""Actual functions, fully fake IO/OS/time/processes. No imported driver/gate mains."""
from pathlib import Path, PurePosixPath
from types import SimpleNamespace
import ast, copy, errno, hashlib, json, stat

D = Path(__file__).resolve().parent
checks = []
def load_functions(filename, ns):
    tree = ast.parse((D / filename).read_text())
    selected = [n for n in tree.body if isinstance(n, ast.FunctionDef)]
    exec(compile(ast.Module(body=selected,type_ignores=[]), '<actual-boundary-functions-fake-io>', 'exec'), ns)
    return ns
# Preserve all50 useful first-packet controls without overwriting their result.
old = ast.parse((D / 'pure-controls.py').read_text()); old.body = old.body[:-2]
oldns = {'__file__': str(D / 'pure-controls.py')}
exec(compile(old, '<prior-50-controls-no-output>', 'exec'), oldns)
assert len(oldns['output']['checks']) == 50
checks += oldns['output']['checks']
contracts = {}; exec(compile((D/'contracts.py').read_text(),'<actual-contracts>','exec'),contracts)
I = json.loads((D/'input-manifest.json').read_text())
G = json.loads((D/'source-guards.json').read_text())
cases = json.loads((D/'case-map.json').read_text())
S = json.loads((D/'scope.json').read_text())

class FS:
    def __init__(self): self.nodes={}; self.nextino=1
    def put(self,p,data=b'',kind='file',mode=0o644,h=None):
        p=str(p)
        if p != '/':
            parent=str(PurePosixPath(p).parent)
            if parent not in self.nodes:self.put(parent,kind='directory',mode=0o700)
        if isinstance(data,dict) or isinstance(data,list):data=(json.dumps(data,sort_keys=True)+'\n').encode()
        if isinstance(data,str):data=data.encode()
        old=self.nodes.get(p,{})
        self.nodes[p]={'data':data,'kind':kind,'mode':mode,'sha':h or hashlib.sha256(data).hexdigest(),
                       'ino':old.get('ino',self.nextino),'dev':1,'uid':42}
        self.nextino+=1
    def obj(self,p):return json.loads(self.nodes[str(p)]['data'])
    def edit(self,p,change):
        obj=self.obj(p);change(obj);self.put(p,obj)
    def path(self,p):return FP(self,str(p))
    def walk(self,root,followlinks=False):
        assert followlinks is False
        root=str(root)
        for p,n in sorted(self.nodes.items()):
            if n['kind']!='directory' or not (p==root or p.startswith(root+'/')):continue
            direct=[(name,obj) for name,obj in self.nodes.items() if str(PurePosixPath(name).parent)==p and name!=p]
            yield p,[PurePosixPath(a).name for a,b in direct if b['kind']=='directory'],[PurePosixPath(a).name for a,b in direct if b['kind']!='directory']
    def clone(self,source,dest):
        source,dest=str(source),str(dest)
        for p,n in list(sorted(self.nodes.items())):
            if p==source or p.startswith(source+'/'):
                self.put(dest+p[len(source):],n['data'],n['kind'],n['mode'],n['sha'])

class FP:
    def __init__(self,fs,p):self.fs,self.p=fs,str(p)
    def __truediv__(self,n):return FP(self.fs,str(PurePosixPath(self.p)/str(n)))
    def __str__(self):return self.p
    def __eq__(self,o):return self.p==str(o)
    def __hash__(self):return hash(self.p)
    @property
    def parts(self):return PurePosixPath(self.p).parts
    @property
    def parent(self):return FP(self.fs,str(PurePosixPath(self.p).parent))
    @property
    def name(self):return PurePosixPath(self.p).name
    def exists(self):return self.p in self.fs.nodes
    def is_file(self):return self.exists() and self.fs.nodes[self.p]['kind']=='file'
    def is_dir(self):return self.exists() and self.fs.nodes[self.p]['kind']=='directory'
    def is_symlink(self):return self.exists() and self.fs.nodes[self.p]['kind']=='symlink'
    def resolve(self):return self
    def read_bytes(self):return self.fs.nodes[self.p]['data']
    def read_text(self):return self.read_bytes().decode()
    def relative_to(self,p):return self.p.removeprefix(str(p)+'/')
    def iterdir(self):return iter(FP(self.fs,p) for p in self.fs.nodes if str(PurePosixPath(p).parent)==self.p and p!=self.p)
    def rglob(self,pat):return [FP(self.fs,p) for p in self.fs.nodes if p.startswith(self.p+'/')]
    def stat(self):
        n=self.fs.nodes[self.p]; kind={'file':stat.S_IFREG,'directory':stat.S_IFDIR,'symlink':stat.S_IFLNK}[n['kind']]
        return SimpleNamespace(st_mode=kind|n['mode'],st_uid=n['uid'],st_dev=n['dev'],st_ino=n['ino'],st_size=len(n['data']),st_mtime_ns=1)
    lstat=stat
    def open(self,mode):
        if mode=='xb':
            assert not self.exists();self.fs.put(self.p,b'',mode=0o600)
        return self
    def __enter__(self):return self
    def __exit__(self,*args):return False

class World:
    def __init__(self):
        self.fs=FS();f=self.fs;P=f.path
        self.S=copy.deepcopy(S);self.S.update(repository='/R',workspace='/W',runtime='/E',node='/NODE',helm='/HELM',dependencies='/DEPS')
        for n in ['/R','/D','/E','/W','/W/tmp','/DEPS']:f.put(n,kind='directory',mode=0o700)
        for r in G['files']:f.put('/R/'+r['path'],h=r['sha256'],mode=r['mode'])
        for r in G['dist']['files']:f.put('/R/studio-runner/dist/'+r['path'],h=r['sha256'])
        for group in G['auxiliaryGroups'].values():
            for n,h in group.items():f.put('/R/'+n,h=h)
        f.put('/NODE',b'FAKE_NODE',mode=0o755);f.put('/HELM',b'FAKE_HELM',mode=0o755)
        for r in [*I['finiteCopies'],I['fixture'],I['config']]:
            h=I['helperBanks']['fixed']['sha256'] if r['destination'].endswith('/_helpers.tpl') else r['sha256']
            f.put('/W/'+r['destination'],h=h,mode=r['mode'])
        f.put('/W/repo/studio-runner/node_modules','/DEPS',kind='symlink',mode=0o777)
        for n,x in [('source-guards.json',G),('input-manifest.json',I),('case-map.json',cases)]:f.put('/D/'+n,x)
        for n in ['verify-final.py','run-private.py','exit-gate.py','final-controls.py']:f.put('/D/'+n,'FAKE_CODE_'+n)
        members=[{'path':n,'sha256':f.nodes['/D/'+n]['sha'],'mode':0o644} for n in ['verify-final.py','run-private.py','exit-gate.py','final-controls.py']]
        f.put('/D/manifest.json',{'files':members})
        lock='/R/.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock';f.put(lock,'FAKE_LOCK')
        self.H={'label':self.S['label'],'wrapper':{'pid':90,'start':'WRAPPER','argvHash':hashlib.sha256(b'WRAPPER_ARGV').hexdigest()},'shell':{'pid':100,'start':'SHELL','argvHash':hashlib.sha256(b'SHELL_ARGV').hexdigest()},'lock':{'path':lock,'dev':1,'ino':f.nodes[lock]['ino']},'baselinePath':'BASELINE','baselineSha256':'BASELINE'}
        f.put('/R/BASELINE',h='BASELINE');f.put('/E/hold.json',self.H)
        f.put('/E/candidate-baseline.json',{'capturedBeforeUnit':True,'label':self.S['label'],'identities':[]})
        self.A={'authorized':True,'independentArchitectureReviewSha256':'ARIA','independentQaReviewSha256':'QA','label':self.S['label'],'sourceDigest':G['sourceDigest'],'sourceWrites':False,'C8':False,'credit':False,'automaticRetry':False,'packetManifestSha256':f.nodes['/D/manifest.json']['sha'],'holdFileSha256':f.nodes['/E/hold.json']['sha'],'candidateBaselineSha256':f.nodes['/E/candidate-baseline.json']['sha'],'distModes':{r['path']:0o644 for r in G['dist']['files']},'auxModes':{n:0o644 for v in G['auxiliaryGroups'].values() for n in v},'nodeSha256':f.nodes['/NODE']['sha'],'helmSha256':f.nodes['/HELM']['sha'],'dependenciesRealpath':'/DEPS','dependencyInventory':[],'safeEnvironment':{'HOME':'/FAKE_HOME','LANG':'C','LC_ALL':'C'},'boundBasePath':'/FAKE_BIN'}
        f.put('/E/root-authorization.json',self.A);self.release=f.nodes['/E/root-authorization.json']['sha']
        self.rows={};self.commands={};self.comms={};self.identities={};self.cwd={};self.boundaryFacts={'inheritedIdentityChanged':[],'incompleteStableIdentities':[],'otherProjectFacts':[],'listeners':[]}
        def pid_text(pid,col):
            if pid in (90,100):return {'lstart':'WRAPPER' if pid==90 else 'SHELL','command':'WRAPPER_ARGV' if pid==90 else 'SHELL_ARGV','ppid':'90' if pid==100 else '1'}.get(col)
            return self.commands.get(pid) if col=='command' else self.rows.get(pid,{}).get('start') if col=='lstart' else self.comms.get(pid) if col=='comm' else None
        def capture(argv):
            if argv[0]=='git':return '\0'.join(r['path'] for r in G['files'])+'\0'
            if argv[0]=='/bin/ps':
                if argv[-1]=='pid=,comm=':return ''.join(str(pid)+' '+comm+'\n' for pid,comm in self.comms.items())
                return ''.join(f"{pid} {row['ppid']} Mon Oct 19 10:00:00 2026 {self.commands[pid]}\n" for pid,row in self.rows.items())
            if argv[0]=='/usr/sbin/lsof':
                if 'cwd' in argv:return 'n'+self.cwd.get(int(argv[argv.index('-p')+1]),'/UNRELATED')+'\n'
                return 'i'+str(self.H['lock']['ino'])+'\n'
            raise AssertionError('Unexpected fake capture '+str(argv))
        self.C={'table':lambda:copy.deepcopy(self.rows),'pid_text':pid_text,'identity':lambda row:copy.deepcopy(self.identities.get(row['pid'])),'capture':capture,'bounded_capture':capture,'boundary_inventory':lambda p:copy.deepcopy(self.boundaryFacts)}
        def flock(handle,flag):
            if flag==3:raise BlockingIOError(errno.EAGAIN,'FAKE_HELD')
        self.ns={'Path':P,'D':P('/D'),'R':P('/R'),'E':P('/E'),'W':P('/W'),'SCOPE':self.S,'hashlib':hashlib,'json':json,'errno':errno,'stat':stat,'require':contracts['require'],'assess':contracts['assess'],'read':lambda p:f.obj(p),'sha':lambda p:f.nodes[str(p)]['sha'],'utc':lambda:'FAKE_TIME','os':SimpleNamespace(walk=f.walk,readlink=lambda p:f.nodes[str(p)]['data'].decode(),getuid=lambda:42,getppid=lambda:100,pathsep=':'),'fcntl':SimpleNamespace(LOCK_EX=2,LOCK_NB=1,LOCK_UN=8,flock=flock)}
        load_functions('run-private.py',self.ns)
        # write_new is actual-IO boundary replaced; no os.open/file descriptor exists.
        self.ns['write_new']=lambda p,v:self.fake_new(p,v)
        self.d=SimpleNamespace(**self.ns)
        self.final=load_functions('final-controls.py',{'hashlib':hashlib,'json':json})
        self.install_receipts()
    def fake_new(self,p,v):
        assert not self.fs.path(p).exists();self.fs.put(str(p),v,mode=0o600)
    def node(self,pid,ppid=1,argv='/DEPS/tinypool/dist/entry/process.js',start=None):
        row={'pid':pid,'ppid':ppid,'start':start or 'NODE_'+str(pid),'argvHash':hashlib.sha256(argv.encode()).hexdigest()}
        self.rows[pid]=row;self.commands[pid]=argv;self.comms[pid]='/NODE';self.cwd[pid]='/W/repo/studio-runner'
        self.identities[pid]={**row,'identityComplete':True,'commHash':'COMM','executableHash':'EXE','executableFileHash':self.A['nodeSha256']}
        return self.identities[pid]
    def install_receipts(self):
        f=self.fs
        for phase,code in [('red',1),('green',0)]:
            report=oldns['report'](phase);f.put('/E/'+phase+'-vitest.json',report);f.put('/W/repo/'+phase+'-vitest.json',report)
            for suffix in ['stdout','stderr','launched.json']:f.put('/E/'+phase+'.'+suffix,{})
        f.clone('/W','/E/complete-workspace-archive');f.clone('/W/repo/helm-chart/put-checks','/E/final-fixed-chart-archive')
        phasepins={}
        for phase in self.S['phaseIds']:
            previous={'prepare':[],'red':['prepare'],'install-fixed':['red'],'green':['install-fixed'],'archive':['green']}[phase]
            decision={'phase':phase,'releaseSha256':self.release,'authorized':True,'precedingReceipts':{p:phasepins[p] for p in previous}}
            f.put('/E/'+phase+'.root-decision.json',decision)
            f.put('/E/'+phase+'.consumed.json',{'phase':phase,'releaseSha256':self.release,'decisionSha256':f.nodes['/E/'+phase+'.root-decision.json']['sha']})
            r={'phase':phase,'releaseSha256':self.release,'accepted':True,'status':'TERMINAL_ACCEPTED_LOCAL_ONLY','stickyFlags':[],'nativeExecuted':phase in ('red','green')}
            if phase=='prepare':r['workspace']=self.d.owned_root_identity()
            if phase in ('red','green'):
                code=1 if phase=='red' else 0
                r['native']={'status':'TERMINAL','timedOut':False,'stickyFlags':[],'automaticRetry':False,'argv':next(x['argv'] for x in self.S['phases'] if x['id']==phase),'cwd':'/W/repo/studio-runner','nativeExit':code,'reportSha256':f.nodes['/E/'+phase+'-vitest.json']['sha'],'stdoutSha256':f.nodes['/E/'+phase+'.stdout']['sha'],'stderrSha256':f.nodes['/E/'+phase+'.stderr']['sha'],'launchSha256':f.nodes['/E/'+phase+'.launched.json']['sha'],'ownedIdentities':[],'candidateObservations':[{'baselineSha256':self.A['candidateBaselineSha256'],'unknownCandidates':[],'currentNative':[]}]}
                r['assessment']=self.d.assess(f.obj('/E/'+phase+'-vitest.json'),phase,code,cases)
            if phase=='archive':r.update(workspace=self.d.owned_root_identity(),workspaceInventory=self.d.inventory(self.d.W),archiveInventory=self.d.inventory(self.d.E/'complete-workspace-archive'),finalChartInventory=self.d.inventory(self.d.W/'repo/helm-chart/put-checks'),finalChartArchiveInventory=self.d.inventory(self.d.E/'final-fixed-chart-archive'),archiveEqual=True,cleanupAuthorized=False)
            f.put('/E/'+phase+'.receipt.json',r);phasepins[phase]=f.nodes['/E/'+phase+'.receipt.json']['sha']
        f.put('/R/docs/qa/evidence/STUDIO-OBS-011/t0/qa/ACTUAL/review.json',h='REVIEW')
        f.put('/E/actual-review.root-adoption.json',{'accepted':True,'releaseSha256':self.release,'phaseReceiptPins':phasepins,'actualReviewPath':'docs/qa/evidence/STUDIO-OBS-011/t0/qa/ACTUAL/review.json','independentActualReviewSha256':'REVIEW'})
    def facts(self):return self.final['final_facts'](self.d,self.A,self.release,self.C)
    def produce(self):return self.final['produce_final'](self.d,self.A,self.release,self.C,lambda:1000)
    def permit(self):return {'authorized':True,'releaseSha256':self.release,'expectedWrapperExit':0,'credit':False,'independentActualReviewSha256':'REVIEW','actualFinalResultInspected':True,'finalVerificationExit':0,'readinessSha256':self.fs.nodes['/E/final-readiness-v1.json']['sha'],'finalResultSha256':self.fs.nodes['/E/final-result-v1.json']['sha'],'verifiedAtEpoch':1001}
    def close(self,p=None,now=1002):return self.final['close_check'](self.d,self.A,self.release,p or self.permit(),self.C,lambda:now)

def positive(name,action):
    action();checks.append({'name':name,'expected':'ACCEPT','actual':'ACCEPT'})
def negative(name,action):
    try:action()
    except (ValueError,KeyError,FileNotFoundError) as e:checks.append({'name':name,'expected':'HOLD','actual':'HOLD','reason':str(e)})
    else:raise AssertionError('Incorrect acceptance: '+name)

w=World();positive('actual.final_facts.valid',w.facts);positive('actual.producer.valid',w.produce);positive('actual.gate.valid',w.close)
negative('actual.producer.no-refresh',w.produce)
for name,mutate in [
 ('missing-readiness',lambda w:w.fs.nodes.pop('/E/final-readiness-v1.json')),
 ('wrong-readiness-hash',lambda w:w.fs.edit('/E/final-readiness-v1.json',lambda r:r.update(label='WRONG'))),
 ('missing-result',lambda w:w.fs.nodes.pop('/E/final-result-v1.json')),
 ('code-drift',lambda w:w.fs.put('/D/run-private.py','CHANGED')),
 ('release-drift',lambda w:w.fs.put('/E/root-authorization.json','CHANGED')),
 ('hold-drift',lambda w:w.fs.put('/E/hold.json','CHANGED')),
 ('source-bytes',lambda w:w.fs.nodes['/R/'+G['files'][0]['path']].update(sha='CHANGED')),
 ('source-mode',lambda w:w.fs.nodes['/R/'+G['files'][0]['path']].update(mode=0o600)),
 ('source-deletion',lambda w:w.fs.nodes.pop('/R/'+G['files'][0]['path'])),
 ('dist-addition',lambda w:w.fs.put('/R/studio-runner/dist/EXTRA.js','EXTRA')),
 ('helm-addition',lambda w:w.fs.put('/R/helm-chart/put-checks/templates/EXTRA-SYNTHETIC.yaml','EXTRA')),
 ('helm-deletion',lambda w:w.fs.nodes.pop('/R/helm-chart/put-checks/Chart.yaml')),
 ('copied-helm-addition',lambda w:w.fs.put('/W/repo/helm-chart/put-checks/templates/EXTRA.yaml','EXTRA')),
 ('copied-helm-deletion',lambda w:w.fs.nodes.pop('/W/repo/helm-chart/put-checks/Chart.yaml')),
 ('separate-red-report',lambda w:w.fs.put('/E/red-vitest.json','CHANGED')),
 ('separate-green-report',lambda w:w.fs.put('/E/green-vitest.json','CHANGED')),
 ('stdout-drift',lambda w:w.fs.put('/E/red.stdout','CHANGED')),
 ('assessment-drift',lambda w:w.fs.edit('/E/red.receipt.json',lambda r:r['assessment'].update(nativeExit=0))),
 ('native-status',lambda w:w.fs.edit('/E/green.receipt.json',lambda r:r['native'].update(nativeExit=1))),
 ('native-timeout',lambda w:w.fs.edit('/E/green.receipt.json',lambda r:r['native'].update(timedOut=True))),
 ('native-sticky',lambda w:w.fs.edit('/E/green.receipt.json',lambda r:r['native'].update(stickyFlags=['TRUE_GAP']))),
 ('receipt-malformed',lambda w:w.fs.edit('/E/green.receipt.json',lambda r:r.pop('native'))),
 ('complete-archive-drift',lambda w:w.fs.put('/E/complete-workspace-archive/EXTRA','CHANGED')),
 ('dedicated-archive-drift',lambda w:w.fs.put('/E/final-fixed-chart-archive/EXTRA','CHANGED')),
 ('workspace-drift',lambda w:w.fs.put('/W/EXTRA','CHANGED')),
 ('inherited-changed',lambda w:w.boundaryFacts['inheritedIdentityChanged'].append({'pid':99})),
 ('unknown-reparented-worker',lambda w:w.node(20)),
 ('historical-candidate-gap',lambda w:w.fs.edit('/E/red.receipt.json',lambda r:r['native']['candidateObservations'][0]['unknownCandidates'].append({'pid':20}))),
]:
    w=World();w.produce();p=w.permit();mutate(w)
    negative('actual.gate:'+name,lambda w=w,p=p:w.close(p))
# Fresh final producer independently rejects these before emitting ANY readiness.
for name,mutate in [
 ('helm-extra',lambda w:w.fs.put('/R/helm-chart/put-checks/templates/EXTRA.yaml','EXTRA')),
 ('report-drift',lambda w:w.fs.put('/E/red-vitest.json','CHANGED')),
 ('dedicated-archive',lambda w:w.fs.put('/E/final-fixed-chart-archive/EXTRA','CHANGED')),
 ('worker-reparented',lambda w:w.node(20)),
]:
    w=World();mutate(w);negative('actual.producer:'+name,w.produce)
    assert '/E/final-readiness-v1.json' not in w.fs.nodes
for label,now,permit_change in [('stale-readiness',1061,None),('future-permit',1002,lambda p:p.update(verifiedAtEpoch=1003)),('permit-before-final',1002,lambda p:p.update(verifiedAtEpoch=999))]:
    w=World();w.produce();p=w.permit()
    if permit_change:permit_change(p)
    negative('actual.gate:'+label,lambda w=w,p=p,now=now:w.close(p,now))
# Actual boundary/worker functions: valid inherited worker is protected, new role UNKNOWN.
w=World();old=w.node(5);w.fs.put('/E/candidate-baseline.json',{'capturedBeforeUnit':True,'label':w.S['label'],'identities':[old]});w.A['candidateBaselineSha256']=w.fs.nodes['/E/candidate-baseline.json']['sha']
positive('actual.worker:inherited-bound',lambda:w.d.worker_candidates(w.A,w.C))
w.identities[5]['argvHash']='CHANGED';negative('actual.worker:inherited-change',lambda:w.d.worker_candidates(w.A,w.C))
w=World();w.node(20);negative('actual.boundary:reviewer-orphan-counterexample',lambda:w.d.boundary(w.H,w.C,w.A))
w=World();w.node(20);w.identities[20]['identityComplete']=False
state=w.d.worker_candidates(w.A,w.C);assert state['unknownCandidates'];checks.append({'name':'actual.worker:UNKNOWN-identity-retained','actual':'HOLD_CANDIDATE'})
# Actual run_native reviewer schedule, fake Popen and output/clock only.
w=World();root=w.node(10,7,argv='/NODE /DEPS/vitest/vitest.mjs');orphan={}
frames=iter([copy.deepcopy(w.rows),{}]);polls=iter([None,0]);calls=[]
def next_table():
    rows=next(frames)
    if not rows:
        w.rows={};w.comms={};w.commands={};w.identities={};w.node(20)
        return copy.deepcopy(w.rows)
    return rows
w.C['table']=next_table
w.ns['subprocess']=SimpleNamespace(DEVNULL=-3,Popen=lambda *a,**kw:calls.append(kw) or SimpleNamespace(pid=10,poll=lambda:next(polls)))
w.ns['time']=SimpleNamespace(monotonic=lambda:0,sleep=lambda n:None)
# Reports may be absent on failure; fake .is_file reads local fake FS only.
for n in ['green-vitest.json','green.stdout','green.stderr','green.launched.json']:
    w.fs.nodes.pop('/E/'+n,None)
w.fs.nodes.pop('/W/repo/green-vitest.json',None)
r=w.ns['run_native']('green',w.A,w.C)
assert r['nativeExit']==0 and r['status']=='HOLD' and 'RESIDENT_REPARENTED_OR_UNKNOWN_CANDIDATE' in r['stickyFlags']
assert calls[0]['umask']==0o022
checks.append({'name':'actual.run_native:reviewer-resident-reparented-worker','actual':'HOLD_NATIVE0_STICKY','noRealPopen':True})
# Additional actual held/source/candidate/timeout controls, all in-memory.
for name,mutate in [
 ('dist-bytes',lambda w:w.fs.nodes['/R/studio-runner/dist/'+G['dist']['files'][0]['path']].update(sha='CHANGED')),
 ('dist-mode',lambda w:w.fs.nodes['/R/studio-runner/dist/'+G['dist']['files'][0]['path']].update(mode=0o600)),
 ('helm-mode',lambda w:w.fs.nodes['/R/helm-chart/put-checks/Chart.yaml'].update(mode=0o600)),
 ('helm-link',lambda w:w.fs.nodes['/R/helm-chart/put-checks/Chart.yaml'].update(kind='symlink')),
 ('dedicated-bytes',lambda w:w.fs.nodes['/E/final-fixed-chart-archive/Chart.yaml'].update(sha='CHANGED')),
 ('dedicated-mode',lambda w:w.fs.nodes['/E/final-fixed-chart-archive/Chart.yaml'].update(mode=0o600)),
 ('complete-linktext',lambda w:w.fs.nodes['/E/complete-workspace-archive/repo/studio-runner/node_modules'].update(data=b'/WRONG_TARGET')),
 ('dependency-change',lambda w:w.fs.put('/DEPS/EXTRA','CHANGED')),
 ('tmp-residue',lambda w:w.fs.put('/W/tmp/RESIDUE','CHANGED')),
 ('malformed-counts',lambda w:w.fs.edit('/E/green-vitest.json',lambda r:r.update(numPassedTests=94))),
]:
    w=World();w.produce();p=w.permit();mutate(w)
    negative('actual.gate:'+name,lambda w=w,p=p:w.close(p))
w=World();oldcapture=w.C['capture'];w.fs.put('/R/backend/EXTRA.java','EXTRA')
w.C['capture']=lambda argv:oldcapture(argv)+'backend/EXTRA.java\0' if argv[0]=='git' else oldcapture(argv)
negative('actual.guards:source-path-addition',lambda:w.d.guards(w.A,w.C))
w=World();w.C['pid_text']=lambda pid,column:None
negative('actual.held:holder-absent',lambda:w.d.held(w.A,w.C))
w=World();w.ns['fcntl'].flock=lambda handle,flag:None
negative('actual.held:kernel-free',lambda:w.d.held(w.A,w.C))
w=World();w.fs.nodes[w.H['lock']['path']]['ino']+=1
negative('actual.held:inode-replaced',lambda:w.d.held(w.A,w.C))
w=World();oldcapture=w.C['capture'];w.C['capture']=lambda argv:'' if argv[0]=='/usr/sbin/lsof' else oldcapture(argv)
negative('actual.held:holder-fd-missing',lambda:w.d.held(w.A,w.C))
w=World();w.boundaryFacts['incompleteStableIdentities']=[{'pid':5}]
negative('actual.boundary:incomplete-inherited',lambda:w.d.boundary(w.H,w.C,w.A))
w=World();w.node(20,argv='/NODE /UNRELATED/app.js');w.cwd[20]='/UNRELATED'
positive('actual.worker:no-global-node-wait',lambda:contracts['require'](not w.d.worker_candidates(w.A,w.C)['unknownCandidates'],'UNRELATED_NODE'))
w=World();w.node(10,7,argv='/NODE /DEPS/vitest/vitest.mjs')
for n in ['green-vitest.json','green.stdout','green.stderr','green.launched.json']:w.fs.nodes.pop('/E/'+n,None)
w.fs.nodes.pop('/W/repo/green-vitest.json',None)
w.ns['subprocess']=SimpleNamespace(DEVNULL=-3,Popen=lambda *a,**kw:SimpleNamespace(pid=10,poll=lambda:None))
clock=iter([0,301]);w.ns['time']=SimpleNamespace(monotonic=lambda:next(clock),sleep=lambda n:None)
r=w.ns['run_native']('green',w.A,w.C)
assert r['timedOut'] is True and r['nativeExit'] is None and r['status']=='HOLD'
checks.append({'name':'actual.run_native:timeout-not-terminal-or-synthetic124','actual':'HOLD_NATIVE_UNKNOWN'})
# Failed final emits no readiness and consumes the exclusive version.
w=World();w.fs.put('/E/red-vitest.json','CHANGED')
negative('actual.producer:failed-v1-no-readiness',w.produce)
assert '/E/final-readiness-v1.json' not in w.fs.nodes and w.fs.obj('/E/final-result-v1.json')['verificationExit']==1
negative('actual.producer:failed-v1-cannot-refresh',w.produce)
# Final read-only proof also requires the separately adopted actual review.
w=World();w.fs.nodes.pop('/E/actual-review.root-adoption.json')
negative('actual.producer:actual-review-missing',w.produce)
w=World();w.produce();p=w.permit();p['actualFinalResultInspected']=False
negative('actual.gate:no-separate-final0-inspection',lambda:w.close(p))
w=World();w.produce();p=w.permit();p['independentActualReviewSha256']='WRONG'
negative('actual.gate:wrong-actual-review',lambda:w.close(p))
w=World();w.produce();p=w.permit();w.fs.nodes['/D/run-private.py']['mode']=0o600
negative('actual.gate:code-mode-drift',lambda:w.close(p))
w=World();w.A['authorized']=False;w.fs.put('/E/root-authorization.json',w.A);w.release=w.fs.nodes['/E/root-authorization.json']['sha']
negative('actual.producer:unreleased-no-attempt-write',w.produce)
assert '/E/final-attempt-v1.json' not in w.fs.nodes
w=World();oldpid=w.C['pid_text'];w.C['pid_text']=lambda pid,column:'WRONG' if pid==100 and column=='ppid' else oldpid(pid,column)
negative('actual.held:parent-mismatch',lambda:w.d.held(w.A,w.C))
# Inherited Node may use a different verified binary; protect its exact baseline.
w=World();old=w.node(5,argv='/OLDER_NODE /UNRELATED/app.js');w.identities[5]['executableFileHash']='INHERITED_OTHER_BINARY';old=copy.deepcopy(w.identities[5]);w.fs.put('/E/candidate-baseline.json',{'capturedBeforeUnit':True,'label':w.S['label'],'identities':[old]});w.A['candidateBaselineSha256']=w.fs.nodes['/E/candidate-baseline.json']['sha']
positive('actual.worker:protected-inherited-other-node-binary',lambda:contracts['require'](not w.d.worker_candidates(w.A,w.C)['unknownCandidates'],'INHERITED_BINARY'))
result={'status':'ACTUAL_BOUNDARY_FUNCTIONS_FAKE_IO_ONLY','checks':checks,'count':len(checks),'allExpected':True,'priorControlsRetained':50,'nativeExecutions':0,'realCensusLockProcessPrivateIO':False,'readiness':False,'released':False}
(D/'boundary-control-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'count':len(checks),'allExpected':True,'nativeExecutions':0}))
