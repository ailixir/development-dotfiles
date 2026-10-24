"""Actual run_native admission with an entirely fake filesystem/FD/Popen.
Correct the fixture's dangling-link exists/is_symlink semantics; no real main or IO.
"""
from pathlib import Path, PurePosixPath
from types import SimpleNamespace
import ast,json
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume3')
O=Path(__file__).resolve().parent
body=ast.parse((D/'boundary-controls.py').read_text());prefix=[]
for n in body.body:
 if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='w' for t in n.targets):break
 prefix.append(n)
ns={'__file__':str((D/'boundary-controls.py').absolute())}
exec(compile(ast.Module(body=prefix,type_ignores=[]),'<inspected-fake-world-only>','exec'),ns)
FP=ns['FP'];World=ns['World']
def exists(self):
 n=self.fs.nodes.get(self.p)
 if n is None:return False
 if n['kind']=='symlink':
  target=n['data'].decode();target=str(PurePosixPath(self.p).parent/target) if not target.startswith('/') else target
  return self.fs.path(target).exists()
 return True
def is_symlink(self):
 return self.p in self.fs.nodes and self.fs.nodes[self.p]['kind']=='symlink'
FP.exists=exists;FP.is_symlink=is_symlink
class ReachedFakePopen(RuntimeError):pass
results=[]
for kind in ['normal-absent','dangling-link','existing-regular','link-existing-target']:
 w=World();w.d.setup_custody(w.A)
 for name in ['green-vitest.json','green.stdout','green.stderr','green.launched.json']:
  w.fs.nodes.pop('/E/'+name,None)
 w.fs.nodes.pop('/W/repo/green-vitest.json',None)
 report=w.d.W/'repo/green-vitest.json'
 if kind=='dangling-link':w.fs.put(str(report),'/R/helm-chart/put-checks/templates/NEW-REPORT-ALIAS.yaml',kind='symlink',mode=0o777)
 if kind=='existing-regular':w.fs.put(str(report),'PREEXISTING')
 if kind=='link-existing-target':w.fs.put(str(report),'/R/helm-chart/put-checks/templates/_helpers.tpl',kind='symlink',mode=0o777)
 called=[]
 def fake_popen(*args,**kwargs):
  called.append({'argv':args[0],'cwd':str(kwargs['cwd']),'childUmask':kwargs['umask']})
  raise ReachedFakePopen('No actual process or target write')
 w.ns['subprocess']=SimpleNamespace(DEVNULL=-3,Popen=fake_popen)
 before={'exists':report.exists(),'is_symlink':report.is_symlink()}
 try:w.ns['run_native']('green',w.A,w.C)
 except ReachedFakePopen:outcome='PASSES_UNSAFE_NATIVE_LAUNCH_BOUNDARY' if kind=='dangling-link' else 'EXPECTED_NATIVE_LAUNCH_ADMISSION'
 except ValueError as error:outcome='HOLD_BEFORE_NATIVE:'+str(error)
 assert bool(called)==(kind in ['normal-absent','dangling-link'])
 results.append({'case':kind,'pathSemantics':before,'actualFunction':'run_native','fakePopenReached':bool(called),'outcome':outcome,'actualProcessOrTargetWrite':False})
(O/'native-report-alias-results.json').write_text(json.dumps({'finding':'G80-LINK-06','kind':'PURE_ACTUAL_FUNCTION_COUNTEREXAMPLE','results':results,'realOSProcessPrivateOrSourceAction':False},indent=2)+'\n')
print(json.dumps(results))
