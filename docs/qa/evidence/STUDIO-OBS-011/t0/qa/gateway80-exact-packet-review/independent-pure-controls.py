"""Review-only AST-extracted pure calls, with every process/IO action replaced.
No driver/gate/helper main or native/census/lock function is imported or invoked.
Only this review directory receives result writes.
"""
from pathlib import Path, PurePosixPath
from types import SimpleNamespace
import ast
import hashlib
import json
import os
import stat

D = Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume1')
O = Path(__file__).resolve().parent
source = (D/'run-private.py').read_text()
tree = ast.parse(source)

def require(valid, reason):
    if not valid:
        raise ValueError(reason)

def functions(names, ns):
    selected = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    assert {n.name for n in selected} == set(names)
    exec(compile(ast.Module(body=selected, type_ignores=[]), '<actual-functions-injected-pure>', 'exec'), ns)
    return ns

# Replay author pure contract controls without their sealed-directory output/print.
controls = ast.parse((D/'pure-controls.py').read_text())
assert isinstance(controls.body[-1], ast.Expr) and isinstance(controls.body[-2], ast.Expr)
assert 'print(' in ast.unparse(controls.body[-1])
assert '.write_text(' in ast.unparse(controls.body[-2])
controls.body = controls.body[:-2]
ns = {'__file__': str((D/'pure-controls.py').absolute())}
exec(compile(controls, '<inspected-author-pure-controls-no-output>', 'exec'), ns)
author = ns['output']
assert len(author['checks']) == 50 and author['allExpected'] is True

# Actual run_native: a root is sampled; a fork appears/reparents before next sample.
# The long-lived orphan is present in the next full table, but outside current ancestry.
class MemoryPath:
    def __init__(self, name): self.name = name
    def __truediv__(self, n): return MemoryPath(self.name+'/'+str(n))
    def __str__(self): return self.name
    def exists(self): return False
    def is_file(self): return False
    def is_symlink(self): return False
    def open(self, mode):
        assert mode == 'xb'
        return self
    def __enter__(self): return self
    def __exit__(self, *args): return False
root = {'pid': 10, 'ppid': 7, 'start': 'ROOT_START', 'argvHash': 'ROOT_ARGV'}
orphan = {'pid': 20, 'ppid': 1, 'start': 'ORPHAN_START', 'argvHash': 'FORK_ARGV'}
frames = iter([{10: root}, {20: orphan}])
polls = iter([None, 0])
child = SimpleNamespace(pid=10, poll=lambda: next(polls))
launches = []
recorded = []
SCOPE = {'phases': [{'id':'green','argv':['/SYNTH_NODE','./node_modules/vitest/vitest.mjs'], 'maximumSeconds':300}], 'node':'/SYNTH_NODE', 'helm':'/SYNTH_HELM'}
env = {'SCOPE':SCOPE,'W':MemoryPath('/SYNTH_WORK'),'E':MemoryPath('/SYNTH_EVIDENCE'), 'Path':PurePosixPath,
       'require':require,'os':SimpleNamespace(pathsep=':'),
       'subprocess':SimpleNamespace(DEVNULL=-3,Popen=lambda *a,**k: launches.append((a,k)) or child),
       'write_new':lambda p,v: recorded.append((str(p),v)), 'utc':lambda:'SYNTHETIC_TIME',
       'time':SimpleNamespace(monotonic=lambda:0,sleep=lambda n:None)}
functions({'run_native'}, env)
r = env['run_native']('green', {'safeEnvironment':{'HOME':'/SYNTH_HOME','LANG':'C','LC_ALL':'C'},'boundBasePath':'/SYNTH_BIN'},
      {'table':lambda:next(frames),'identity':lambda row:{**row,'identityComplete':True}})
assert r['status']=='TERMINAL' and not r['stickyFlags'] and r['nativeExit']==0
assert [x['pid'] for x in r['ownedIdentities']]==[10]
assert len(launches)==1 and launches[0][1]['umask']==0o022

# Actual boundary: the same resident orphan has an ordinary Tinypool argv, not W/config.
facts={'inheritedIdentityChanged':[],'incompleteStableIdentities':[],'otherProjectFacts':[],
       'listeners':[{'pid':20,'port':47111}]}
bns={'require':require,'file_hash':lambda p:'BASELINE_SHA','R':PurePosixPath('/SYNTH_REPO'),
     'W':PurePosixPath('/SYNTH_WORK'),'hashlib':hashlib}
functions({'boundary'},bns)
b=bns['boundary']({'baselinePath':'BASELINE','baselineSha256':'BASELINE_SHA'},
 {'boundary_inventory':lambda p:dict(facts),
  'capture':lambda argv:'20 1 Mon Oct 19 10:00:00 2026 /SYNTH_DEPS/node_modules/tinypool/dist/entry/process.js\n'})
assert b['gatewayMarkerCandidates']==[]

# Actual guards: an added real chart path is outside captureScope and not enumerated.
G=json.loads((D/'source-guards.json').read_text())
files={}
for x in G['files']:
    files['/SYNTH_REPO/'+x['path']]={'sha':x['sha256'],'mode':x['mode']}
for x in G['dist']['files']:
    files['/SYNTH_REPO/studio-runner/dist/'+x['path']]={'sha':x['sha256'],'mode':0o644}
for group in G['auxiliaryGroups'].values():
    for name,h in group.items(): files['/SYNTH_REPO/'+name]={'sha':h,'mode':0o644}
files['/SYNTH_NODE']={'sha':'NODE_HASH','mode':0o755}
files['/SYNTH_HELM']={'sha':'HELM_HASH','mode':0o755}
extra='/SYNTH_REPO/helm-chart/put-checks/templates/EXTRA-SYNTHETIC.yaml'
files[extra]={'sha':'EXTRA_UNEXPECTED_HASH','mode':0o644}
class FakePath:
    def __init__(self,p): self.p=str(p)
    @property
    def parts(self):return PurePosixPath(self.p).parts
    def __truediv__(self,n):return FakePath(self.p+'/'+str(n))
    def __str__(self):return self.p
    def is_file(self):return self.p in files
    def stat(self):return SimpleNamespace(st_mode=files[self.p]['mode'])
    def resolve(self):return self
    def relative_to(self,root):return self.p[len(str(root)) + 1:]
    def rglob(self,pattern):
        assert self.p=='/SYNTH_REPO/studio-runner/dist'
        return [FakePath(self.p+'/'+x['path']) for x in G['dist']['files']]
A={'sourceDigest':G['sourceDigest'],'distModes':{x['path']:0o644 for x in G['dist']['files']},
   'auxModes':{n:0o644 for v in G['auxiliaryGroups'].values() for n in v},
   'nodeSha256':'NODE_HASH','helmSha256':'HELM_HASH','dependenciesRealpath':'/SYNTH_DEPS','dependencyInventory':[]}
accesses=[]
gns={'require':require,'read':lambda p:G,'D':FakePath('/SYNTH_PACKET'),'R':FakePath('/SYNTH_REPO'),
     'Path':FakePath,'stat':stat,'SCOPE':{'node':'/SYNTH_NODE','helm':'/SYNTH_HELM','dependencies':'/SYNTH_DEPS'},
     'inventory':lambda p:[],'utc':lambda:'SYNTHETIC_TIME',
     'file_hash':lambda p:accesses.append(str(p)) or files[str(p)]['sha']}
functions({'guards'},gns)
g=gns['guards'](A,{'capture':lambda argv:'\0'.join(x['path'] for x in G['files'])+'\0'})
assert g['auxiliariesExact'] is True and extra in files and extra not in accesses

# Coverage inventory is structural only; the author suite exercises contracts and AST parsing.
called={n.func.id for n in ast.walk(controls) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name)}
result={'kind':'PURE_FAKE_SOURCE_COUNTEREXAMPLES_NO_RUNTIME',
 'authorControlsReplayed':len(author['checks']),'authorControlsExpected':True,
 'counterexamples':[
  {'id':'G80-RESOURCE-02','actualFunction':'run_native + boundary','result':'TERMINAL/no sticky + boundary ACCEPT with resident orphan PID20 unrecorded',
   'schedule':'Fork starts and root exits between quarter-second samples; orphan remains in next process table with ppid1 and Tinypool entry argv. No actual process was created.'},
  {'id':'G80-FREEZE-03','actualFunction':'guards','result':'auxiliariesExact=true with an extra synthetic Helm template outside the sealed22 paths',
   'reason':'source captureScope omits helm-chart; auxiliary loop verifies listed files but never enumerates actual Helm path set'}],
 'coverage':{'authorExercisesDriverOrGateBoundary':bool(called & {'guards','held','boundary','workspace_guard','archive','run_native','inventory'}),
             'noActualGateMainCalled':True},
 'nativeProcessCensusLockPrivateIO':False,'fakePopenCalls':len(launches),'fakePopenIsReal':False}
(O/'independent-pure-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
