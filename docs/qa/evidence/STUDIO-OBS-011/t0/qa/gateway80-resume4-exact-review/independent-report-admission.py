"""Independent real-function admission checks with faithful in-memory path/FD semantics."""
from pathlib import Path
from types import SimpleNamespace
import ast,json
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume4');O=Path(__file__).resolve().parent
source=ast.parse((D/'boundary-controls.py').read_text());prefix=[]
for node in source.body:
 if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='w' for t in node.targets):break
 prefix.append(node)
ns={'__file__':str((D/'boundary-controls.py').absolute())}
exec(compile(ast.Module(body=prefix,type_ignores=[]),'<inspected-fake-world-only>','exec'),ns)
World=ns['World']
class ReachedFakePopen(RuntimeError):pass
checks=[]
for phase in ['red','green']:
 for case in ['fresh','dangling','existing-link','existing-file','linked-cwd','wrong-parent-type']:
  w=World();w.d.setup_custody(w.A)
  for n in [phase+'-vitest.json',phase+'.stdout',phase+'.stderr',phase+'.launched.json']:
   w.fs.nodes.pop('/E/'+n,None)
  report='/W/repo/'+phase+'-vitest.json';w.fs.nodes.pop(report,None)
  if case=='dangling':w.fs.put(report,'/R/UNCREATED-NATIVE-REPORT',kind='symlink',mode=0o777)
  if case=='existing-link':w.fs.put(report,'/E/root-authorization.json',kind='symlink',mode=0o777)
  if case=='existing-file':w.fs.put(report,'EXISTS')
  if case=='linked-cwd':w.fs.put('/W/repo/studio-runner','/R/studio-runner',kind='symlink',mode=0o777)
  if case=='wrong-parent-type':w.fs.put('/W/repo','REGULAR_FILE')
  called=[]
  def fake_popen(*args,**kwargs):
   called.append((args,kwargs));raise ReachedFakePopen('No actual native child')
  w.ns['subprocess']=SimpleNamespace(DEVNULL=-3,Popen=fake_popen);w.fakeOS.events.clear()
  try:w.ns['run_native'](phase,w.A,w.C)
  except ReachedFakePopen:outcome='ADMITTED_FRESH_ONLY'
  except (ValueError,OSError,KeyError):outcome='HOLD_BEFORE_OUTPUT_AND_NATIVE'
  else:raise AssertionError('Unexpected return')
  assert bool(called)==(case=='fresh')
  if case!='fresh':assert not w.fakeOS.events
  if case=='dangling':assert not w.fs.path(report).exists() and w.fs.path(report).is_symlink()
  checks.append({'phase':phase,'case':case,'result':outcome,'fakePopenCalls':len(called),'denialOutputEvents':len(w.fakeOS.events) if case!='fresh' else None,'actualProcessOrTargetAction':False})
(O/'independent-report-admission-results.json').write_text(json.dumps({'status':'INDEPENDENT_ACTUAL_FUNCTION_PURE_CHECKS_PASS','checks':checks,'count':len(checks),'LINK06NativeLeafCorrected':True,'realMainNativeOSOrC8Action':False},indent=2)+'\n')
print(json.dumps({'independentPairedPrelaunchChecks':len(checks),'allExpected':True,'realActions':False}))
