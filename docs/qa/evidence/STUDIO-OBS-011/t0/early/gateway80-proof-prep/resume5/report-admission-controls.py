"""Actual run_native prelaunch regression, using faithful fake pathlib semantics.
No real driver/helper main, native subprocess, filesystem target, census or lock.
"""
from pathlib import Path
from types import SimpleNamespace
import ast,json
D=Path(__file__).resolve().parent
source=ast.parse((D/'boundary-controls.py').read_text());prefix=[]
for node in source.body:
    if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='w' for t in node.targets):break
    prefix.append(node)
ns={'__file__':str(D/'boundary-controls.py')}
exec(compile(ast.Module(body=prefix,type_ignores=[]),'<inspected-world-definitions-only>','exec'),ns)
World,FP=ns['World'],ns['FP']
class ReachedFakePopen(RuntimeError):pass
results=[]
for phase in ['red','green']:
    for kind in ['fresh','existing-regular','existing-target-link','dangling-link','owned-root-link',
                 'repo-parent-link','native-cwd-link','report-parent-wrongtype','parent-observation-failed','evidence-root-link']:
        w=World();w.d.setup_custody(w.A)
        for name in [phase+'-vitest.json',phase+'.stdout',phase+'.stderr',phase+'.launched.json']:
            w.fs.nodes.pop('/E/'+name,None)
        report='/W/repo/'+phase+'-vitest.json';w.fs.nodes.pop(report,None)
        if kind=='existing-regular':w.fs.put(report,'PREEXISTING_REPORT')
        if kind=='existing-target-link':w.fs.put(report,'/R/helm-chart/put-checks/templates/_helpers.tpl',kind='symlink',mode=0o777)
        if kind=='dangling-link':w.fs.put(report,'/R/UNCREATED-REPORT-ALIAS',kind='symlink',mode=0o777)
        if kind=='owned-root-link':w.fs.put('/W','/R',kind='symlink',mode=0o777)
        if kind=='repo-parent-link':w.fs.put('/W/repo','/R',kind='symlink',mode=0o777)
        if kind=='native-cwd-link':w.fs.put('/W/repo/studio-runner','/R/studio-runner',kind='symlink',mode=0o777)
        if kind=='report-parent-wrongtype':w.fs.put('/W/repo','NOT_A_DIRECTORY')
        if kind=='evidence-root-link':w.fs.put('/E','/R',kind='symlink',mode=0o777)
        called=[];native_target_writes=[]
        def fake_popen(*args,**kwargs):
            called.append({'argv':args[0],'cwd':str(kwargs['cwd']),'umask':kwargs['umask']})
            raise ReachedFakePopen('Admission only; no process or target write exists')
        w.ns['subprocess']=SimpleNamespace(DEVNULL=-3,Popen=fake_popen)
        old_lstat=FP.lstat
        if kind=='parent-observation-failed':
            def failed_lstat(self):
                if self.p=='/W/repo':raise OSError('SYNTHETIC_AMBIGUOUS_PARENT_OBSERVATION')
                return old_lstat(self)
            FP.lstat=failed_lstat
        w.fakeOS.events.clear()
        try:
            try:w.ns['run_native'](phase,w.A,w.C)
            except ReachedFakePopen:outcome='FRESH_ADMISSION'
            except (ValueError,OSError,KeyError):outcome='HOLD_BEFORE_LAUNCH'
            else:raise AssertionError('Unexpected monitor return in prelaunch-only proof')
        finally:FP.lstat=old_lstat
        assert len(called)==(1 if kind=='fresh' else 0),(phase,kind,called)
        assert not native_target_writes
        if kind!='fresh':assert not w.fakeOS.events,(kind,w.fakeOS.events)
        if kind=='dangling-link':
            assert w.fs.path(report).exists() is False and w.fs.path(report).is_symlink() is True
        if kind=='fresh':assert called[0]['umask']==0o022
        results.append({'phase':phase,'case':kind,'actualFunction':'run_native','outcome':outcome,
                        'fakePopenCalls':len(called),'actualNativeExecutions':0,
                        'targetWriteCallbacks':0,'denialsPrecedeOutputAndNativeCallbacks':kind!='fresh'})
# Explicitly distinguish target-following existence from entry-level link identity.
for kind,expected in [('absent',(False,False)),('dangling',(False,True)),('linked-existing',(True,True)),('regular',(True,False))]:
    w=World();path='/E/API_SEMANTICS'
    if kind=='dangling':w.fs.put(path,'/ABSENT_TARGET',kind='symlink',mode=0o777)
    elif kind=='linked-existing':w.fs.put(path,'/E/red-vitest.json',kind='symlink',mode=0o777)
    elif kind=='regular':w.fs.put(path,'REGULAR')
    assert (w.fs.path(path).exists(),w.fs.path(path).is_symlink())==expected
    results.append({'case':'fake-pathlib:'+kind,'exists':expected[0],'is_symlink':expected[1],
                    'modelOnly':True,'actualFilesystemProbe':False})
output={'status':'ACTUAL_PRELAUNCH_FUNCTION_FAKE_IO_ONLY','checks':results,'count':len(results),
        'allExpected':True,'actualNativeExecutions':0,'actualTargetReadWriteOrOSAction':False,
        'runtimeScopeConsumed':False,'readiness':False,'released':False}
(D/'report-admission-control-results.json').write_text(json.dumps(output,indent=2)+'\n')
print(json.dumps({'controls':len(results),'allExpected':True,'nativeExecutions':0}))
