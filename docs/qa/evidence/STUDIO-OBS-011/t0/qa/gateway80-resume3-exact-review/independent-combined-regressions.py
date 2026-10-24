"""Independent paired actual-function source checks; only fake boundaries are invoked."""
from pathlib import Path
import ast,copy,json
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume3')
O=Path(__file__).resolve().parent
body=ast.parse((D/'boundary-controls.py').read_text());prefix=[]
for n in body.body:
 if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='w' for t in n.targets):break
 prefix.append(n)
ns={'__file__':str((D/'boundary-controls.py').absolute())}
exec(compile(ast.Module(body=prefix,type_ignores=[]),'<inspected-in-memory-boundary-definitions>','exec'),ns)
World=ns['World']
revision=ast.parse((D/'revision-controls.py').read_text())
selected=[n for n in revision.body if isinstance(n,ast.FunctionDef) and n.name in {'actual_core','monitor_schedule','fresh_native'}]
core_path=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py')
env={'D':D,'ns':ns,'core_path':core_path,'core_source':core_path.read_bytes(),'Path':Path,'ast':ast,'copy':copy,'SimpleNamespace':ns['SimpleNamespace']}
exec(compile(ast.Module(body=selected,type_ignores=[]),'<inspected-pure-process-and-clock-injection>','exec'),env)
records=[]
def rejected(name,action,w):
 w.fakeOS.events.clear()
 try:action()
 except (ValueError,KeyError,FileNotFoundError) as e:
  records.append({'name':name,'result':'HOLD','reason':str(e),'fakeWriteOrTraversalEvents':len(w.fakeOS.events)})
 else:raise AssertionError('Expected HOLD: '+name)
for path,operation in [('/W/repo/helm-chart/put-checks','chart'),('/W/repo','workspace'),('/R/helm-chart','real-chart'),('/E/final-fixed-chart-archive','final')]:
 w=World();w.d.setup_custody(w.A);w.fs.put(path,'/R/helm-chart/put-checks',kind='symlink',mode=0o777)
 fn={'chart':lambda:w.d.chart_guard(w.d.W/'repo/helm-chart/put-checks',True),'workspace':lambda:w.d.workspace_guard('fixed'),'real-chart':lambda:w.d.chart_guard(w.d.R/'helm-chart/put-checks'),'final':w.produce}[operation]
 rejected('priorLINK06:'+path,fn,w);assert not w.fakeOS.events
w=World();w.d.setup_custody(w.A);w.d.inventory(w.d.W)
records.append({'name':'paired-regular-owned-tree-and-dependency-entry','result':'ACCEPT','noDependencyTargetTraversal':not any(e==('walk','/DEPS') for e in w.fakeOS.events)})
for mode in ['global-rc1','global-empty','comm-rc1','comm-empty','cwd-rc1','cwd-empty','txt-rc1','comm-only-late-node']:
 w=World();w.node(20,argv='/NODE /NEUTRAL/app.js' if 'cwd' in mode else '/NODE /DEPS/tinypool/dist/entry/process.js')
 C,calls=env['actual_core'](w,mode)
 rejected('priorRESOURCE02:'+mode,lambda:w.d.boundary(w.H,C,w.A),w)
 assert calls and all(k['timeout']==10 for _,k in calls)
w=World();C,calls=env['actual_core'](w);w.d.boundary(w.H,C,w.A)
records.append({'name':'paired-complete-quiet-observation','result':'ACCEPT','allActualImportedCallsBounded':all(k['timeout']==10 for _,k in calls)})
w=World();w.node(20,argv='/NODE /UNRELATED/app.js');w.cwd[20]='/UNRELATED';C,_=env['actual_core'](w)
assert not w.d.worker_candidates(w.A,C)['unknownCandidates']
records.append({'name':'paired-verified-unrelated-node','result':'ACCEPT_NOT_OWNED'})
root={'ppid':500,'argv':'/NODE /DEPS/vitest/vitest.mjs','start':'A'}
reuse={'ppid':1,'argv':'/NODE /UNRELATED/app.js','start':'B','cwd':'/UNRELATED'}
w=World();r=env['monitor_schedule'](w,[{10:root},{10:reuse}],[0,0],[0,0,0,0])
assert r['status']=='TERMINAL' and {(x['pid'],x['start']) for x in r['ownedIdentities']}=={(10,'A')}
records.append({'name':'priorRESOURCE07:root10A-to-unrelated10B','result':'NO_OWNERSHIP_TRANSFER','nativeExit':r['nativeExit']})
w=World();r=env['monitor_schedule'](w,[{10:reuse}],[0],[0,0])
assert r['status']=='HOLD' and r['initialChildIdentity'] is None and not r['ownedIdentities']
records.append({'name':'priorRESOURCE07:unbound-initial-child','result':'HOLD_NO_MANUFACTURED_OWNER'})
child={'ppid':10,'argv':'/NODE /DEPS/tinypool/dist/entry/process.js','start':'C'}
grandchild={'ppid':20,'argv':'/NODE /DEPS/tinypool/dist/entry/process.js','start':'D'}
w=World();r=env['monitor_schedule'](w,[{10:root,20:child},{20:{**child,'ppid':1},30:grandchild},{}],[0,0,0],[0,0,0,0,0,0])
assert r['status']=='TERMINAL' and {(x['pid'],x['start']) for x in r['ownedIdentities']}=={(10,'A'),(20,'C'),(30,'D')}
records.append({'name':'paired-genuine-reparented-known-lineage','result':'ACCEPT_EXACT_RECORDED_IDENTITIES'})
w=World();orphan={'ppid':1,'argv':'/NODE /DEPS/tinypool/dist/entry/process.js','start':'X'}
r=env['monitor_schedule'](w,[{10:root},{20:orphan}],[None,0],[0,0,0,0])
assert r['status']=='HOLD' and 'RESIDENT_REPARENTED_OR_UNKNOWN_CANDIDATE' in r['stickyFlags']
records.append({'name':'paired-unjoined-resident-role','result':'HOLD_UNKNOWN_NOT_OWNER'})
(O/'independent-combined-results.json').write_text(json.dumps({'kind':'ACTUAL_FUNCTIONS_FAKE_BOUNDARIES_ONLY','checks':records,'count':len(records),'realMainNativeOSPrivateOrSourceAction':False},indent=2)+'\n')
print(json.dumps({'independentPairedChecks':len(records),'allExpected':True,'nativeReportAliasHandledSeparately':True}))
