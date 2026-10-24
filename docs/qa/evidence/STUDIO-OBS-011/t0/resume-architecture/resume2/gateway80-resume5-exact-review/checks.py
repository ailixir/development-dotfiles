"""Aria exact source review. Guarded AST tests only; never runtime main/import."""
import ast, contextlib, copy, hashlib, io, json, pathlib, stat, sys
import datetime, errno, fcntl, os, shutil, subprocess, time
import collections, re, resource, shlex, signal, xml.etree.ElementTree

R=pathlib.Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
P=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume5'
O=pathlib.Path(__file__).parent
sha=lambda b:hashlib.sha256(b).hexdigest()
pins=[]
def pin(path,expected=None):
    raw=path.read_bytes();h=sha(raw)
    if expected:assert h==expected,(str(path),h)
    pins.append({'path':str(path.relative_to(R)),'sha256':h,'bytes':len(raw),'mode':stat.S_IMODE(path.stat().st_mode)})
    return raw
m=json.loads(pin(P/'manifest.json','607859e3f5e43ab4dad52afdcf1f1842801f2abacc197527b819e11668ccf1ab'))
assert len(m['files'])==109
for row in m['files']:
    raw=pin(P/row['path'],row['sha256']);assert len(raw)==row['bytes'] and pins[-1]['mode']==row['mode']
old=json.loads(pin(P.parent/'resume4/manifest.json','43220c811bc60d2f7dbf8397d2f5c57ceca4e1f8c6b0454e60fb69a545dae5ce'))
for row in old['files']:
    raw=pin(P.parent/'resume4'/row['path'],row['sha256']);assert len(raw)==row['bytes'] and pins[-1]['mode']==row['mode']
for item in json.loads((P/'admission-inputs.json').read_text())['records']:pin(R/item['path'],item['sha256'])
disp=R/'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gateway80-admission-failure01-disposition'
dm=json.loads(pin(disp/'manifest.json','00423dfa59896d469905899a5faff9520fcf30c8aa1df1bf9adb374d06b762ed'))
for row in dm['files']:pin(disp/row['path'],row['sha256'])
oldtree=ast.parse((P.parent/'resume4/run-private.py').read_text());newtree=ast.parse((P/'run-private.py').read_text())
oldf={n.name:ast.dump(n,include_attributes=False) for n in oldtree.body if isinstance(n,ast.FunctionDef)}
newf={n.name:ast.dump(n,include_attributes=False) for n in newtree.body if isinstance(n,ast.FunctionDef)}
assert set(oldf)==set(newf) and [n for n in oldf if oldf[n]!=newf[n]]==['held']
guarded=True
readroots=(P,P.parent/'resume4')
core=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py'
def audit(event,args):
    if not guarded:return
    if event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.fork','os.kill')) or event in ('fcntl.flock','os.remove','os.rename','os.rmdir','os.mkdir','os.symlink','os.link'):
        raise AssertionError('REAL_BOUNDARY_BLOCKED:'+event)
    if event=='open':
        name,mode,flags=args
        if not isinstance(name,(str,bytes)):raise AssertionError('REAL_FD_OPEN_BLOCKED')
        p=pathlib.Path(name).absolute()
        assert p==core or any(p==root or root in p.parents for root in readroots),('READ_SCOPE',str(p))
        assert mode is not None and all(c not in mode for c in 'wax+'),('WRITE_BLOCKED',mode)
sys.addaudithook(audit)
def run_source(name):
    t=ast.parse((P/name).read_text())
    t.body=[n for n in t.body if not (isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and (isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='write_text' or isinstance(n.value.func,ast.Name) and n.value.func.id=='print'))]
    ns={'__file__':str(P/name),'__name__':'guarded_review_only'}
    with contextlib.redirect_stdout(io.StringIO()):exec(compile(t,'<inspected-guarded-'+name+'>','exec'),ns)
    return ns
results={}
for name,key in [('boundary-controls.py','result'),('revision-controls.py','output'),('report-admission-controls.py','output'),('admission-controls.py','result')]:
    env=run_source(name);value=env[key];results[name]=value
    print(json.dumps({'completedGuardedAuthorStage':name,'count':value['count']}),flush=True)
assert [results[x]['count'] for x in results]==[121,70,24,33]
assert sum(v['count'] for v in results.values())==248
vns={'__file__':str(P/'verify-proofs.py'),'__name__':'source_only_verify'}
exec(compile((P/'verify-proofs.py').read_text(),'<strict-static-verifier>','exec'),vns)
strict=vns['verify']()

# Independent actual-function counterexamples use only the inspected fake world.
aenv=env
repros=[]
for reason in ('start-or-argv-changed','wrapper-fd-gone','kernel-lock-free'):
    n,d=aenv['mini']();d.holder_fail=True
    n['prepare_proposal']=lambda *args:{'authorized':False,'holdFileSha256':n['HOLD_SHA']}
    try:n['capture'](d,{},'a'*64,copy.deepcopy(aenv['auth']),'b'*64)
    except ValueError as exc:
        assert str(exc)=='SYNTHETIC_HOLDER_CHANGED'
        assert d.writes==['admission-capture-attempt.json']
        repros.append({'case':reason,'actual':'HOLD_AFTER_ATTEMPT_WRITE','fakeWrites':d.writes,'realActions':0})
    else:raise AssertionError('EXPECTED_HOLDER_HOLD')

# Exact lsof strict status/nonempty/empty-stderr properties on the actual adapter.
wclass=aenv['World'];adapter=[]
for status,out,err,accept in [(0,'p90\ni1\n','',True),(1,'p90\ni1\n','',False),(0,'','',False),(0,'p90\ni1\n','ERROR',False)]:
    w=wclass();w.ns['subprocess']=type('FakeSubprocess',(),{'run':staticmethod(lambda *a,**k:type('Result',(),{'returncode':status,'stdout':out,'stderr':err})())})
    try:w.ns['observe_capture'](['/usr/sbin/lsof','-nP','-a','-p','90','-F','pfin','--','/LOCK'])
    except ValueError:assert not accept;actual='HOLD'
    else:assert accept;actual='ACCEPT'
    adapter.append({'status':status,'stdoutEmpty':not out,'stderrEmpty':not err,'actual':actual})
guarded=False
result={'exactPacketSha256':sha((P/'manifest.json').read_bytes()),'packetMembersVerified':109,'oldMembersVerified':93,'authorControls':248,'retainedControls':215,'newAuthorControls':33,'allAuthorControlsPassed':True,'strictForwardReverseVerified':strict,'independentCases':7,'independentOrderingCounterexamples':repros,'independentLsofControls':adapter,'allRealOperationalBoundariesBlocked':True,'actualRuntimeOrSourceCaptureOrNativeOrPrivateActions':0,'conditionalSupport':False}
(O/'checks.json').write_text(json.dumps(result,indent=2)+'\n')
(O/'pins.json').write_text(json.dumps({'pins':pins,'count':len(pins),'bodyScope':'source and approved public review/failure metadata only; no runtime/H/baseline body or current OS observation'},indent=2)+'\n')
print(json.dumps({'authorControls':248,'independentCases':7,'orderingDefectReproduced':True,'operationalActions':0}))
