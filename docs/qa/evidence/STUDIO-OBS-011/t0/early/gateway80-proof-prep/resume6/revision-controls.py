"""Resume3 actual-function regressions. All IO/FD/OS/process/time is in memory."""
from pathlib import Path
from types import SimpleNamespace
import ast,copy,hashlib,json
D=Path(__file__).resolve().parent
module=ast.parse((D/'boundary-controls.py').read_text());prefix=[]
for n in module.body:
    if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='w' for t in n.targets):break
    prefix.append(n)
ns={'__file__':str(D/'boundary-controls.py')};exec(compile(ast.Module(body=prefix,type_ignores=[]),'<inspected-fake-definitions>','exec'),ns)
World=ns['World'];results=[]
def hold(name,action,world=None,no_effect=False):
    if world:world.fakeOS.events.clear()
    try:action()
    except (ValueError,KeyError,FileNotFoundError):pass
    else:raise AssertionError('Incorrect acceptance '+name)
    if no_effect:assert not world.fakeOS.events,(name,world.fakeOS.events)
    results.append({'name':name,'actual':'HOLD','noFakeWriteOrTraversal':no_effect})
def accept(name,action):action();results.append({'name':name,'actual':'ACCEPT'})
def mutate_link(w,path,target='/R/helm-chart/put-checks'):
    w.fs.put(path,target,kind='symlink',mode=0o777)

def fresh_native(w,phase='green'):
    for n in [phase+'-vitest.json',phase+'.stdout',phase+'.stderr',phase+'.launched.json']:
        w.fs.nodes.pop('/E/'+n,None)
    w.fs.nodes.pop('/W/repo/'+phase+'-vitest.json',None)

def banks(w):
    for row in [*ns['I']['finiteCopies'],ns['I']['fixture'],ns['I']['config']]:
        w.fs.put('/D/'+row['bank'],(D/row['bank']).read_bytes(),mode=row['mode'])
    for row in ns['I']['helperBanks'].values():w.fs.put('/D/'+row['bank'],(D/row['bank']).read_bytes())

def remove_virtual_tree(w,root):
    for name in list(w.fs.nodes):
        if name==root or name.startswith(root+'/'):w.fs.nodes.pop(name)

# Denials precede ALL fake traversal/write callbacks, not a post-write source check.
for name,path,action in [
 ('chart-root-to-product','/W/repo/helm-chart/put-checks',lambda w:w.d.chart_guard(w.d.W/'repo/helm-chart/put-checks',True)),
 ('chart-repo-parent','/W/repo',lambda w:w.d.workspace_guard('fixed')),
 ('chart-helm-parent','/W/repo/helm-chart',lambda w:w.d.workspace_guard('fixed')),
 ('real-chart-root','/R/helm-chart/put-checks',lambda w:w.d.chart_guard(w.d.R/'helm-chart/put-checks')),
 ('real-chart-parent','/R/helm-chart',lambda w:w.d.chart_guard(w.d.R/'helm-chart/put-checks')),
 ('dedicated-archive-root','/E/final-fixed-chart-archive',lambda w:w.produce()),
 ('archive-repo-parent','/E/complete-workspace-archive/repo',lambda w:w.produce()),
 ('evidence-root','/E',lambda w:w.d.archive()),
 ('owned-root','/W',lambda w:w.d.inventory(w.d.W)),
]:
    w=World();w.d.setup_custody(w.A);mutate_link(w,path)
    hold('actual.custody:'+name,lambda w=w,action=action:action(w),w,True)
# Direct replacement cannot enter the write branch when a copied chart aliases product.
w=World();banks(w);w.d.setup_custody(w.A);mutate_link(w,'/W/repo/helm-chart/put-checks')
hold('actual.install:top-link-before-write',w.d.install_fixed,w,True)
for kind,target in [('file','/R/helm-chart/put-checks/templates/_helpers.tpl'),('dangling','/NO_SUCH')]:
    w=World();w.d.setup_custody(w.A);mutate_link(w,'/E/new-report.json',target)
    hold('actual.copy:destination-'+kind+'-link',lambda:w.d.safe_new_copy(w.d.E/'green-vitest.json',w.d.E/'new-report.json'),w,True)
w=World();w.d.setup_custody(w.A);w.fs.put('/E/existing.json','EXISTS')
hold('actual.copy:existing-regular-destination',lambda:w.d.safe_new_copy(w.d.E/'green-vitest.json',w.d.E/'existing.json'),w,True)
w=World();w.d.setup_custody(w.A)
accept('actual.copy:normal-anchored-exclusive',lambda:w.d.safe_new_copy(w.d.E/'green-vitest.json',w.d.E/'new.json',0o600))
assert w.fs.nodes['/E/new.json']['sha']==w.fs.nodes['/E/green-vitest.json']['sha']
w=World();w.d.setup_custody(w.A)
accept('actual.inventory:allowed-dependency-entry-no-target-traversal',lambda:w.d.inventory(w.d.W))
assert not any('/DEPS'==event[1] for event in w.fakeOS.events if event[0]=='walk')
# Make-copy rejects a dangling top target before mkdir/copy, and normal fresh copy/install works.
w=World();banks(w);remove_virtual_tree(w,'/W');w.fs.nodes.pop('/E/prepare.receipt.json');mutate_link(w,'/W','/NO_SUCH');w.d.setup_custody(w.A)
hold('actual.make_copy:dangling-workspace-target',w.d.make_copy,w,True)
w=World();banks(w);remove_virtual_tree(w,'/W');w.fs.nodes.pop('/E/prepare.receipt.json');w.d.setup_custody(w.A)
prepared=w.d.make_copy();w.fs.put('/E/prepare.receipt.json',prepared);w.ns['IMMUTABLE_EXPECTED']['/E/prepare.receipt.json']=w.fs.nodes['/E/prepare.receipt.json']['sha'];w.ns['IMMUTABLE_BYTES'].pop('/E/prepare.receipt.json',None);w.d.setup_custody(w.A)
accept('actual.make_copy:normal-finite-owned-copy',lambda:w.d.workspace_guard('original'))
w.fakeOS.events.clear();accept('actual.install:normal-original-to-fixed-same-inode',w.d.install_fixed)
assert not any(event[1].startswith('/R/') for event in w.fakeOS.events if event[0] in ('write','create','chmod'))
w.fs.put('/W/generated-cache',kind='directory',mode=0o755);w.fs.put('/W/generated-cache/item','SYNTHETIC_CACHE',mode=0o644)
accept('actual.archive:preserves-native-cache-directory-modes',lambda:w.d.safe_archive_tree(w.d.W,w.d.E/'new-owned-archive'))
assert w.fs.nodes['/E/new-owned-archive/generated-cache']['mode']==0o755
content=lambda rows:[{k:v for k,v in r.items() if k not in ('dev','ino')} for r in rows]
assert content(w.d.inventory(w.d.W))==content(w.d.inventory(w.d.E/'new-owned-archive'))
w=World();w.d.setup_custody(w.A)
hold('actual.copy:product-destination-not-a-write-root',lambda:w.d.safe_new_copy(w.d.E/'green-vitest.json',w.d.R/'NEVER-WRITE.json'),w,True)
for name,path in [('repo','/W/repo'),('helm','/W/repo/helm-chart'),('chart','/W/repo/helm-chart/put-checks'),('helper','/W/repo/helm-chart/put-checks/templates/_helpers.tpl')]:
    w=World();banks(w);w.d.setup_custody(w.A);mutate_link(w,path)
    hold('actual.install:linked-'+name, w.d.install_fixed,w,True)
w=World();w.d.setup_custody(w.A);w.fs.nodes['/W/repo/helm-chart/put-checks']['ino']+=1
hold('actual.custody:retained-directory-replaced',lambda:w.d.workspace_guard('fixed'),w,True)
# Guard the top BEFORE even an injected inventory callback can serve its target.
w=World();w.d.setup_custody(w.A);mutate_link(w,'/W/repo/helm-chart/put-checks')
w.ns['inventory']=lambda root:(_ for _ in ()).throw(AssertionError('Traversal before top custody'))
hold('actual.chart_guard:reviewer-injected-top-follow-reproduction',lambda:w.d.chart_guard(w.d.W/'repo/helm-chart/put-checks',True),w,True)

# Exact actual imported table/identity functions, rebound through bounded adapter.
core_path=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py')
core_source=core_path.read_bytes()
def actual_core(w,mode='ok',postclose=False):
    w.fs.put('/R/'+str(core_path),core_source,h='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae')
    w.fs.put('/R/BASELINE',{'identities':[]})
    calls=[]
    def runner(argv,**kw):
        calls.append((argv,kw));assert kw['timeout']==10
        status,out,err=0,'',''
        if argv[0]=='/bin/ps' and '-axo' in argv:
            if mode=='global-rc1':return SimpleNamespace(returncode=1,stdout='',stderr='')
            if mode=='global-empty':return SimpleNamespace(returncode=0,stdout='',stderr='')
            if argv[-1]=='pid=,comm=':
                out=''.join(str(pid)+' '+comm+'\n' for pid,comm in w.comms.items())
                if mode=='comm-only-late-node':out+='77 /NODE\n'
                if mode=='comm-rc1':status,out=1,''
                if mode=='comm-empty':out=''
            else:
                out=''.join(f"{pid} {row['ppid']} {row['start']} {w.commands[pid]}\n" for pid,row in w.rows.items())
        elif argv[0]=='/bin/ps' and '-p' in argv:
            pid=int(argv[argv.index('-p')+1]);column=argv[-1].removesuffix('=');row=w.rows.get(pid)
            if row is None:status=1
            else:out=str({'lstart':row['start'],'ppid':row['ppid'],'command':w.commands.get(pid),'comm':w.comms.get(pid)}.get(column) or '')+'\n'
        elif argv[0]=='/usr/sbin/lsof':
            if 'cwd' in argv:
                if mode=='cwd-rc1':status=1
                elif mode=='cwd-empty':out=''
                else:out='n'+w.cwd.get(int(argv[argv.index('-p')+1]),'/UNRELATED')+'\n'
            elif 'txt' in argv:
                if mode=='txt-rc1':status=1
                else:out='n/NODE\n'
            elif '-iTCP' in argv:out='p999\nn127.0.0.1:9999\n'
            else:out='i'+str(w.H['lock']['ino'])+'\n'
        elif argv[0]=='git':out='\0'.join(r['path'] for r in ns['G']['files'])+'\0'
        else:raise AssertionError('Unexpected fake command '+str(argv))
        return SimpleNamespace(returncode=status,stdout=out,stderr=err)
    w.ns['ast']=ast;w.ns['subprocess']=SimpleNamespace(run=runner)
    w.ns['observation_binary']=lambda command:(command,'FAKE_BOUND_BINARY')
    w.ns['no_signal_process']=lambda command,binary_sha:runner(command,timeout=10)
    C=w.d.core(postclose=postclose)
    C['Path']=w.fs.path;C['os']=w.fakeOS
    C['datetime']=SimpleNamespace(datetime=SimpleNamespace(now=lambda tz:SimpleNamespace(isoformat=lambda:'FAKE_TIME')),timezone=SimpleNamespace(utc='UTC'))
    return C,calls

for mode in ['global-rc1','global-empty','comm-rc1','comm-empty','cwd-rc1','cwd-empty','txt-rc1','comm-only-late-node']:
    w=World();w.node(20,argv='/NODE /NEUTRAL/app.js' if 'cwd' in mode else '/NODE /DEPS/tinypool/dist/entry/process.js')
    C,calls=actual_core(w,mode)
    hold('actual.imported.boundary:'+mode,lambda:w.d.boundary(w.H,C,w.A))
    hold('actual.imported.final:'+mode,lambda:w.final['final_facts'](w.d,w.A,w.release,C))
    # A valid proof first, then observation fails at the actual close implementation.
    w2=World();w2.produce();p=w2.permit();w2.node(20,argv='/NODE /NEUTRAL/app.js' if 'cwd' in mode else '/NODE /DEPS/tinypool/dist/entry/process.js');C2,_=actual_core(w2,mode)
    hold('actual.imported.gate:'+mode,lambda:w2.final['close_check'](w2.d,w2.A,w2.release,p,C2,lambda:1002))
    assert calls and all(kw['timeout']==10 for _,kw in calls)
# Honest quiet/no-new-role and positively verified unrelated Node remain acceptable.
w=World();C,calls=actual_core(w);accept('actual.imported.boundary:valid-complete-observations',lambda:w.d.boundary(w.H,C,w.A))
w=World();w.node(20,argv='/NODE /UNRELATED/app.js');w.cwd[20]='/UNRELATED';C,_=actual_core(w)
accept('actual.imported.worker:verified-unrelated',lambda:ns['contracts']['require'](not w.d.worker_candidates(w.A,C)['unknownCandidates'],'UNRELATED'))
# Actual postclose observer mode uses a new current parent and proves old holders absent.
for mode in ['ok','global-rc1','global-empty','comm-empty','comm-only-late-node']:
    w=World();w.fakeOS.parent=700
    for pid in (90,100):w.rows.pop(pid);w.commands.pop(pid);w.comms.pop(pid)
    w.rows[500]['ppid']=700;w.rows[700]={'pid':700,'ppid':1,'start':'Mon Oct 19 11:00:00 2026','argvHash':'NEW_PARENT'};w.commands[700]='NEW_PARENT';w.comms[700]='/bin/bash'
    C,_=actual_core(w,mode,True)
    if mode=='ok':accept('actual.imported.postclose:valid-complete-observation',lambda:w.d.boundary(w.H,C,w.A))
    else:hold('actual.imported.postclose:'+mode,lambda:w.d.boundary(w.H,C,w.A))
# Actual monitor: failed observations remain HOLD, raw0 preserved, no artificial124.
for mode in ['global-rc1','global-empty','comm-empty','comm-only-late-node']:
    w=World();fresh_native(w);w.node(10,500,argv='/NODE /DEPS/vitest/vitest.mjs');C,_=actual_core(w,mode)
    current=w.ns['subprocess'];w.ns['subprocess']=SimpleNamespace(run=current.run,DEVNULL=-3,Popen=lambda *a,**kw:SimpleNamespace(pid=10,poll=lambda:0))
    ticks=iter([0,301]);w.ns['time']=SimpleNamespace(monotonic=lambda:next(ticks),sleep=lambda x:None)
    native=w.ns['run_native']('green',w.A,C)
    assert native['status']=='HOLD' and native['nativeExit']==0 and native['stickyFlags']
    results.append({'name':'actual.imported.monitor:'+mode,'actual':'HOLD_RAW_NATIVE0'})

# Original child PID/start remains the only initial seed; unrelated PID reuse is not adopted.
def monitor_schedule(w,snapshots,polls,times):
    fresh_native(w);frames=iter(snapshots);returncodes=iter(polls)
    def table():
        snap=next(frames)
        for pid in [pid for pid in w.rows if pid not in (90,100,500)]:w.rows.pop(pid);w.commands.pop(pid);w.comms.pop(pid);w.identities.pop(pid,None)
        for pid,entry in snap.items():
            w.node(pid,entry['ppid'],entry['argv'],entry['start']);w.cwd[pid]=entry.get('cwd','/W/repo/studio-runner')
        return copy.deepcopy(w.rows)
    w.C['table']=table
    w.ns['subprocess']=SimpleNamespace(DEVNULL=-3,Popen=lambda *a,**kw:SimpleNamespace(pid=10,poll=lambda:next(returncodes)))
    clock=iter(times);w.ns['time']=SimpleNamespace(monotonic=lambda:next(clock),sleep=lambda n:None)
    return w.ns['run_native']('green',w.A,w.C)
root={'ppid':500,'argv':'/NODE /DEPS/vitest/vitest.mjs','start':'ORIGINAL_A'}
unrelated={'ppid':1,'argv':'/NODE /UNRELATED/app.js','start':'REUSED_B','cwd':'/UNRELATED'}
w=World();r=monitor_schedule(w,[{10:root},{10:unrelated}],[0,0],[0,0,0,0])
assert r['status']=='TERMINAL' and r['nativeExit']==0 and not r['stickyFlags'] and {(f['pid'],f['start']) for f in r['ownedIdentities']}=={(10,'ORIGINAL_A')}
results.append({'name':'actual.monitor:reviewer-root10A-to-unrelated10B','actual':'TERMINAL_NO_OWNERSHIP_TRANSFER'})
w=World();r=monitor_schedule(w,[{10:unrelated}],[0],[0,0])
assert r['status']=='HOLD' and not r['ownedIdentities'] and r['initialChildIdentity'] is None
results.append({'name':'actual.monitor:reuse-before-initial-direct-binding','actual':'HOLD_NO_MANUFACTURED_OWNER'})
child={'ppid':10,'argv':'/NODE /DEPS/tinypool/dist/entry/process.js','start':'CHILD_20'}
reparented={**child,'ppid':1};grandchild={'ppid':20,'argv':'/NODE /DEPS/tinypool/dist/entry/process.js','start':'CHILD_30'}
w=World();r=monitor_schedule(w,[{10:root,20:child},{20:reparented,30:grandchild},{}],[0,0,0],[0,0,0,0,0,0])
assert r['status']=='TERMINAL' and {(f['pid'],f['start']) for f in r['ownedIdentities']}=={(10,'ORIGINAL_A'),(20,'CHILD_20'),(30,'CHILD_30')}
results.append({'name':'actual.monitor:known-reparented-root-keeps-real-descendant-closure','actual':'TERMINAL_EXACT_REAL_LINEAGE'})
w=World();orphan={'ppid':1,'argv':'/NODE /DEPS/tinypool/dist/entry/process.js','start':'UNJOINED_20'};r=monitor_schedule(w,[{10:root},{20:orphan}],[None,0],[0,0,0,0])
assert r['status']=='HOLD' and 'RESIDENT_REPARENTED_OR_UNKNOWN_CANDIDATE' in r['stickyFlags']
results.append({'name':'actual.monitor:unjoined-resident-role-is-UNKNOWN-not-owner','actual':'HOLD'})
# Entry guards reject package-root/ancestor/module links before loading governed code.
entry_tree=ast.parse((D/'verify-final.py').read_text());entry=next(n for n in entry_tree.body if isinstance(n,ast.FunctionDef) and n.name=='entry_guard')
for mode in ['normal','parent-link','module-link']:
    w=World();w.fs.put('/R/PACKAGE/run-private.py','FAKE_CODE');w.fs.put('/R/PACKAGE/final-controls.py','FAKE_CODE')
    env={'Path':w.fs.path,'stat':ns['stat']};exec(compile(ast.Module(body=[entry],type_ignores=[]),'<actual-entry-guard>','exec'),env)
    if mode=='parent-link':mutate_link(w,'/R/PACKAGE','/UNAPPROVED')
    if mode=='module-link':mutate_link(w,'/R/PACKAGE/run-private.py','/UNAPPROVED')
    action=lambda:env['entry_guard'](w.fs.path('/R/PACKAGE'),w.fs.path('/R'),w.fs.path('/R/PACKAGE'))
    if mode=='normal':accept('actual.entry:normal-fixed-package',action)
    else:hold('actual.entry:'+mode,action,w,True)
w=World();w.fs.put('/READONLY_NODE_ALIAS','/NODE',kind='symlink',mode=0o777);w.S['node']='/READONLY_NODE_ALIAS'
accept('actual.guards:approved-canonical-readonly-tool-alias',lambda:w.d.guards(w.A,w.C))
w=World();w.A['nodeCanonicalPath']='/WRONG_NODE'
hold('actual.guards:tool-alias-target-drift',lambda:w.d.guards(w.A,w.C))
output={'status':'RESUME3_ACTUAL_BOUNDARY_FAKE_IO_ONLY','checks':results,'count':len(results),'allExpected':True,'nativeExecutions':0,'realOSProcessCensusLockSourceOrScratchAction':False,'released':False,'readiness':False}
(D/'revision-control-results.json').write_text(json.dumps(output,indent=2)+'\n')
print(json.dumps({'checks':len(results),'allExpected':True,'nativeExecutions':0}))
