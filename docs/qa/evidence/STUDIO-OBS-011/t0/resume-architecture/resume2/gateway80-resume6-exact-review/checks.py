"""Aria06 source-only exact review; operational boundaries fail closed."""
import ast,contextlib,copy,hashlib,io,json,pathlib,stat,sys,datetime,errno,fcntl,os,shutil,subprocess,time,types
import collections,re,resource,shlex,signal,xml.etree.ElementTree
R=pathlib.Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
P=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume6'
O=pathlib.Path(__file__).parent
core=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py'
pins=[];checks=[];sha=lambda b:hashlib.sha256(b).hexdigest()
def pin(path,expected=None):
    path=path.absolute()
    raw=path.read_bytes();h=sha(raw)
    if expected:assert h==expected,(str(path),h)
    pins.append({'path':str(path.relative_to(R)),'sha256':h,'bytes':len(raw),'mode':stat.S_IMODE(path.stat().st_mode)})
    return raw
def check(name,condition):
    assert condition,name
    checks.append({'case':name,'passed':True})
m=json.loads(pin(P/'manifest.json','e2e3340b48628c76884d6b243dd69134052e8e2ff3d25f5ab09d94f4e9150585'))
check('exact137members',len(m['files'])==137)
for row in m['files']:
    raw=pin(P/row['path'],row['sha256']);check('member:'+row['path'],len(raw)==row['bytes'] and pins[-1]['mode']==row['mode'])
for generation,expected,count in [('resume5','607859e3f5e43ab4dad52afdcf1f1842801f2abacc197527b819e11668ccf1ab',109),('resume4','43220c811bc60d2f7dbf8397d2f5c57ceca4e1f8c6b0454e60fb69a545dae5ce',93)]:
    base=P.parent/generation;old=json.loads(pin(base/'manifest.json',expected));check('old-count:'+generation,len(old['files'])==count)
    for row in old['files']:
        raw=pin(base/row['path'],row['sha256']);check('preserved:'+generation+'/'+row['path'],len(raw)==row['bytes'] and pins[-1]['mode']==row['mode'])
for row in json.loads((P/'input-pins06.json').read_text())['records']:pin(pathlib.Path(row['path']),row['sha256'])
for relative,expected in [('resume-architecture/resume2/gateway80-resume5-exact-review','7d195dc52ecb3d74a677b4aa3adada4eb1e0dc5e5fe9a494f03ff1f386da1efd'),('qa/gateway80-resume5-exact-review','9fbd0f926bb0d9907a561fb4da74e70b8af63b926091d41f05b636b23b639b6b'),('resume-architecture/resume2/gateway80-admission-failure01-disposition','00423dfa59896d469905899a5faff9520fcf30c8aa1df1bf9adb374d06b762ed')]:
    b=R/'docs/qa/evidence/STUDIO-OBS-011/t0'/relative;v=json.loads(pin(b/'manifest.json',expected))
    for row in v['files']:pin(b/row['path'],row['sha256'])
pin(R/'docs/qa/evidence/STUDIO-OBS-011/t0/resume2-gateway80-resume5-findings-root-adoption.json','448b1896730f77740e52561c12065ec315e85d336089be1097be72fe1e89fd4d')
readroots=(P,P.parent/'resume5',P.parent/'resume4')
readfiles={core,*[pathlib.Path(row['path']).absolute() for row in json.loads((P/'input-pins06.json').read_text())['records']]}
guarded=True;blocked=[]
def audit(event,args):
    if not guarded:return
    if event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.fork','os.kill')) or event in ('fcntl.flock','os.remove','os.rename','os.rmdir','os.mkdir','os.symlink','os.link'):
        blocked.append(event);raise AssertionError('REAL_BOUNDARY_BLOCKED:'+event)
    if event=='open':
        name,mode,flags=args
        assert isinstance(name,(str,bytes)),'REAL_FD_OPEN_BLOCKED'
        p=pathlib.Path(name).absolute()
        assert p in readfiles or any(p==root or root in p.parents for root in readroots),('READ_SCOPE',str(p))
        assert mode is not None and all(c not in mode for c in 'wax+'),('WRITE_BLOCKED',mode)
sys.addaudithook(audit)
def run_source(name):
    tree=ast.parse((P/name).read_text())
    tree.body=[n for n in tree.body if not (isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and (isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='write_text' or isinstance(n.value.func,ast.Name) and n.value.func.id=='print'))]
    ns={'__file__':str(P/name),'__name__':'source_review_guarded'}
    with contextlib.redirect_stdout(io.StringIO()):exec(compile(tree,'<inspected-guarded-'+name+'>','exec'),ns)
    return ns
results={};envs={}
for name,key,count in [('boundary-controls.py','result',121),('revision-controls.py','output',70),('report-admission-controls.py','output',24),('admission-controls.py','result',33),('revision06-controls.py','out',85)]:
    ns=run_source(name);envs[name]=ns;v=ns[key];check('guarded-controls:'+name,v['count']==count and v['allExpected'] is True);results[name]=v
    print(json.dumps({'guardedAuthorSuite':name,'count':count}),flush=True)
ns={'__file__':str(P/'verify-proofs.py'),'__name__':'guarded_source_proofs'}
exec(compile((P/'verify-proofs.py').read_text(),'<inspected-source-proof-verifier>','exec'),ns)
strict=ns['verify']();check('strict47forwardreverse',strict['strictForwardFiles']==strict['strictReverseFiles']==47)
# Independent actual-function tests use the same inspected fake namespace.
World=envs['boundary-controls.py']['World'];independent=[]
def outcome(name,fn,hold=False):
    try:fn()
    except (ValueError,KeyError,FileNotFoundError):
        assert hold,name;result='HOLD'
    else:assert not hold,name;result='ACCEPT'
    independent.append({'case':name,'result':result,'realActions':0})
for label,mutate in [('valid',None),('missing-map',lambda w:w.ns['IMMUTABLE_EXPECTED'].pop('/E/prepare.receipt.json')),('wrong-map',lambda w:w.ns['IMMUTABLE_EXPECTED'].__setitem__('/E/prepare.receipt.json','0'*64))]:
    w=World()
    if mutate:mutate(w)
    outcome('actual-read-control:'+label,lambda:w.d.read(w.d.E/'prepare.receipt.json'),label!='valid')
for label,raw in [('valid','p90\nf8\ni1\nn/LOCK\n'),('wrong-process','p91\nf8\ni1\nn/LOCK\n'),('detached-inode','p90\nf8\nn/LOCK\ni1\n'),('fd-access-suffix','p90\nf8u\ni1\nn/LOCK\n')]:
    w=World();outcome('actual-lock-associated:'+label,lambda:w.d.strict_lock_fields(raw,90,1,'/LOCK'),label!='valid')
for label,mutate in [('valid',None),('wrong-actual-review',lambda p:p.update(independentActualReviewSha256='WRONG')),('uninspected-final',lambda p:p.update(actualFinalResultInspected=False)),('wrong-release',lambda p:p.update(releaseSha256='WRONG'))]:
    w=World();w.produce();permit=w.permit()
    if mutate:mutate(permit)
    outcome('actual-final-gate:'+label,lambda:w.close(permit),label!='valid')
# Actual bootstrap control registration cannot overwrite external root pins.
leaf={'require':lambda ok,msg:None if ok else (_ for _ in ()).throw(ValueError(msg)),'PurePosixPath':pathlib.PurePosixPath,'E':pathlib.PurePosixPath('/E')}
node=next(n for n in ast.parse((P/'verified-inputs.py').read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='bind_controls')
exec(compile(ast.Module(body=[node],type_ignores=[]),'<actual-bind-controls-only>','exec'),leaf)
for name,h,hold in [('root-authorization.json','a'*64,False),('root-authorization.json','b'*64,True),('../outside.json','a'*64,True),('unnamed','a'*64,True)]:
    d=types.SimpleNamespace(IMMUTABLE_EXPECTED={'/E/root-authorization.json':'a'*64})
    outcome('actual-bind-pins:'+name+':'+h[:1],lambda:leaf['bind_controls'](d,{name:h}),hold)
check('zero-unfaked-boundaries',not blocked)
guarded=False
report={'exactPacketSha256':sha((P/'manifest.json').read_bytes()),'membersVerified':137,'old05MembersVerified':109,'old04MembersVerified':93,'sourceChecks':checks,'sourceCheckCount':len(checks),'authorControls':333,'retainedControls':248,'new06Controls':85,'guardedAuthorSuites':results,'strictProofs':strict,'independentCases':independent,'independentCaseCount':len(independent),'blockedUnexpectedRealBoundaries':blocked,'actualRuntimeProcessLockBaselinePrivateNativeSourceCaptureOrSharedWrites':0}
(O/'checks.json').write_text(json.dumps(report,indent=2)+'\n')
(O/'pins.json').write_text(json.dumps({'pins':pins,'count':len(pins),'bodyScope':'source and approved public review/failure metadata only; no actual baseline/H/runtime/tool/OS body observations'},indent=2)+'\n')
print(json.dumps({'authorControls':333,'independentCases':len(independent),'sourceChecks':len(checks),'strictForwardReverseFiles':47,'actualOperationalActions':0}))
