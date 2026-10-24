"""Inspected exact code02 source controls; all subject effects remain faked."""
import ast,builtins,collections,contextlib,copy,ctypes,datetime,errno,fcntl,hashlib,io,json,os,pathlib,re,resource,shlex,shutil,signal,socket,stat,subprocess,sys,time,types,xml.etree.ElementTree
from contextlib import ExitStack
from unittest.mock import patch
if not __debug__:raise RuntimeError('REVIEWER_ASSERTIONS_REQUIRED')
R=pathlib.Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
D=T/'early/gateway80-failed-red-resource-prep/resume2'
O=pathlib.Path(__file__).parent
mode=sys.argv[1]
if mode not in ('focused','flow'):raise ValueError('REVIEW_MODE')
sink=(O/(mode+'-results.json')).open('x')
manifest_raw=(D/'manifest.json').read_bytes()
if hashlib.sha256(manifest_raw).hexdigest()!='aaeb967ecc7eb279c70fb50e69218898295094b96fea23f7fdf82c99ce224558':raise ValueError('EXTERNAL_SUBJECT_SHA')
manifest=json.loads(manifest_raw)
for row in manifest['files']:
    p=D/row['path'];raw=p.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=row['sha256'] or len(raw)!=row['bytes'] or stat.S_IMODE(p.stat().st_mode)!=row['mode']:raise ValueError('EXACT_SUBJECT_MEMBER')
allowed=(D,T/'early/gateway80-proof-prep/resume6')
core=T/'early/fullcheck-harness/resume3/harness.py'
def audit(event,args):
    if event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.fork','os.kill','os.system')) or event in ('fcntl.flock','fcntl.lockf'):raise AssertionError('REVIEWER_REAL_BOUNDARY_DENIED:'+event)
    if event=='open':
        path,access,flags=args
        if not isinstance(path,(str,bytes)):raise AssertionError('REAL_FD_OPEN_DENIED')
        p=pathlib.Path(path).absolute()
        if not (p==core or any(p==root or root in p.parents for root in allowed)):raise AssertionError('READ_SCOPE:'+str(p))
        if access is None or any(c in access for c in 'wax+'):raise AssertionError('SUBJECT_WRITE_DENIED')
sys.addaudithook(audit)
name='code02_checks.py' if mode=='focused' else 'checks.py'
raw=(D/name).read_bytes();tree=ast.parse(raw)
tree.body=[n for n in tree.body if not (isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and ((isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='write_text') or (isinstance(n.value.func,ast.Name) and n.value.func.id=='print')))]
ns={'__name__':'_aria_guarded_exact_code02','__file__':str(D/name)}
if mode=='flow':
    # Keep the unchanged author boundary-patching block; invoke only its complete
    # protocol flow, leaving unchanged adverse controls to the exact QA replay.
    for node in tree.body:
        if isinstance(node,ast.With):
            call=node.body[-1]
            if isinstance(call,ast.Expr) and isinstance(call.value,ast.Call) and isinstance(call.value.func,ast.Name) and call.value.func.id=='tests':call.value.func.id='review_flow'
    def review_flow():
        s,k,a,auth,buffers=ns['build']()
        with patch.dict(ns['A'].__dict__,MANIFEST06=s.package_sha),patch.object(fcntl,'flock',lambda fd,flags:(_ for _ in ()).throw(OSError(errno.EAGAIN,'HELD'))):
            ns['protocol_flow'](s,k,a,auth,buffers)
    ns['review_flow']=review_flow
with contextlib.redirect_stdout(io.StringIO()):builtins.exec(builtins.compile(tree,'<inspected-code02-'+mode+'>','exec'),ns)
result=ns['result'];expected=83 if mode=='focused' else 6
if result['passed']!=expected or result['failed']!=0:raise AssertionError('RESULT_COUNT')
result['independentAriaReplayMode']=mode
result['subjectManifestSha256']=hashlib.sha256(manifest_raw).hexdigest()
result['subjectMembersVerifiedBeforeExecution']=len(manifest['files'])
sink.write(json.dumps(result,indent=2)+'\n');sink.flush();sink.close()
print(json.dumps({'mode':mode,'passed':result['passed'],'actualOperationalActions':0}))
