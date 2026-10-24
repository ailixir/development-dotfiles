"""One inspected author suite; no result writes into the sealed subject."""
import ast,builtins,collections,contextlib,copy,ctypes,datetime,errno,fcntl,hashlib,io,json,os,pathlib,re,resource,shlex,shutil,signal,socket,stat,subprocess,sys,time,types,xml.etree.ElementTree
from contextlib import ExitStack
from unittest.mock import patch
if not __debug__:raise RuntimeError('REVIEWER_ASSERTIONS_REQUIRED')
R=pathlib.Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio');T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';D=T/'early/gateway80-failed-red-resource-prep/resume1';O=pathlib.Path(__file__).parent
name=sys.argv[1];which={'checks.py':89,'extra_checks.py':19,'optimized_bootstrap_checks.py':6};assert name in which
# Retained reviewer sink is opened before the subject's persistent deny audit.
sink=(O/(name+'.result.json')).open('x')
allowed_roots=(D,T/'early/gateway80-proof-prep/resume6')
core=T/'early/fullcheck-harness/resume3/harness.py'
def audit(event,args):
 if event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.fork','os.kill','os.system')) or event in ('fcntl.flock','fcntl.lockf'):
  raise AssertionError('REVIEWER_REAL_BOUNDARY_DENIED:'+event)
 if event=='open':
  path,mode,flags=args
  assert isinstance(path,(str,bytes)),'REAL_FD_OPEN_DENIED'
  p=pathlib.Path(path).absolute();assert p==core or any(p==root or root in p.parents for root in allowed_roots),('READ_SCOPE',str(p))
  assert mode is not None and all(c not in mode for c in 'wax+'),'SUBJECT_WRITE_DENIED'
sys.addaudithook(audit)
raw=(D/name).read_bytes();tree=ast.parse(raw)
tree.body=[n for n in tree.body if not (isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and ((isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='write_text') or (isinstance(n.value.func,ast.Name) and n.value.func.id=='print')))]
ns={'__name__':'_aria_guarded_source_only_suite','__file__':str(D/name)}
with contextlib.redirect_stdout(io.StringIO()):builtins.exec(builtins.compile(tree,'<inspected-'+name+'-without-sealed-output-writes>','exec'),ns)
result=ns['result'];assert result['passed']==which[name] and result['failed']==0
sink.write(json.dumps(result,indent=2)+'\n');sink.flush();sink.close()
print(json.dumps({'suite':name,'passed':result['passed'],'actualBoundaryCalls':0}))
