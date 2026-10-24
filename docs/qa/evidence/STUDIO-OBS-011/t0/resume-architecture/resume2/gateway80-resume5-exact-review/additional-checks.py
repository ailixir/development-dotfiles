"""Finite reached-boundary follow-up; no 248-control replay or operational calls."""
import ast,contextlib,hashlib,inspect,io,json,pathlib,subprocess,types
P=pathlib.Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume5')
O=pathlib.Path(__file__).parent
t=ast.parse((P/'boundary-controls.py').read_text());prefix=[]
for n in t.body:
    if isinstance(n,ast.Assign) and any(isinstance(v,ast.Name) and v.id=='w' for v in n.targets):break
    prefix.append(n)
ns={'__file__':str(P/'boundary-controls.py')}
exec(compile(ast.Module(body=prefix,type_ignores=[]),'<inspected-fake-definitions>','exec'),ns)
cases=[]
for name,pidline in [('correct-pid','p90\n'),('wrong-pid','p999\n'),('missing-pid','')]:
    w=ns['World']();old=w.C['capture']
    w.C['capture']=lambda cmd:pidline+'i'+str(w.H['lock']['ino'])+'\n' if cmd[0]=='/usr/sbin/lsof' else old(cmd)
    w.d.held(w.A,w.C)
    cases.append({'case':'actual-held-'+name,'actual':'ACCEPT','fakeOnly':True,'defect':name!='correct-pid'})

# Installed stdlib run() timeout behavior, with an entirely fake Popen object.
source=inspect.getsource(subprocess.run);events=[]
class Child:
    args=['/SYNTHETIC/LSOF']
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def communicate(self,*args,**kw):events.append('communicate-timeout');raise subprocess.TimeoutExpired(self.args,10)
    def kill(self):events.append('kill-called-on-fake-only')
    def wait(self):events.append('wait-fake-only')
g={'Popen':lambda *a,**kw:Child(),'PIPE':-1,'TimeoutExpired':subprocess.TimeoutExpired,'_mswindows':False,'CalledProcessError':subprocess.CalledProcessError,'CompletedProcess':subprocess.CompletedProcess}
exec(compile(ast.parse(source),'<installed-stdlib-run-fake-Popen>','exec'),g)
w=ns['World']();w.ns['subprocess']=types.SimpleNamespace(run=g['run'])
try:w.ns['observe_capture'](['/usr/sbin/lsof','-F','pfin','--','/FAKELOCK'])
except subprocess.TimeoutExpired:pass
else:raise AssertionError('TIMEOUT_REQUIRED')
assert events==['communicate-timeout','kill-called-on-fake-only','wait-fake-only']
cases.append({'case':'actual-observe-capture-installed-stdlib-timeout','actual':events,'realProcessOrSignal':False,'defect':True})

tree=ast.parse((P/'run-private.py').read_text());f={n.name:n for n in tree.body if isinstance(n,ast.FunctionDef)}
def code(name):return ast.get_source_segment((P/'run-private.py').read_text(),f[name])
assert "file_hash(p)" in code('core') and 'ast.parse(p.read_text())' in code('core')
assert "file_hash(R / H['baselinePath'])" in code('boundary') and "C['boundary_inventory']" in code('boundary')
assert 'file_hash(baseline_path)' in code('worker_candidates') and 'baseline = read(baseline_path)' in code('worker_candidates')
for name in ('core','boundary','worker_candidates'):cases.append({'case':'separate-verified-consumed-buffers-'+name,'kind':'SOURCE_AST_PATH_CHECK','defect':True})
scope=json.loads((P/'scope.json').read_text());assert scope['preparationGeneration']=='resume4' and 'never created or consumed' in scope['prospectiveOnly'] and scope['admissionState']['existingRuntimeHoldOnly'] is True
cases.append({'case':'current-scope-generation-and-E-state-contradiction','kind':'SOURCE_JSON_CHECK','defect':True})
out={'count':len(cases),'cases':cases,'realProcessSignalLockRuntimeSourceCapturePrivateActions':0,'stdlibRunSourceSha256':hashlib.sha256(source.encode()).hexdigest(),'packetSha256':hashlib.sha256((P/'manifest.json').read_bytes()).hexdigest(),'scope':'Exact reached source/AST + actual held/adapter and installed stdlib run with wholly fake IO/Popen only'}
(O/'additional-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'supplementaryCases':len(cases),'operationalActions':0}))
