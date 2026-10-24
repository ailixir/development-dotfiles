"""Finite source/guarded-fake Gateway05 review. No target runtime or OS action."""
import ast,builtins,copy,difflib,hashlib,inspect,json,pathlib,stat,subprocess
D=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume5');B=D.parent/'resume4'
O=pathlib.Path(__file__).parent
def safe_path(p):assert not str(p).endswith('preexisting-baseline.json'),'ACTUAL_BASELINE_BODY_ACCESS_FORBIDDEN'
def sha(p):safe_path(p);return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def read(p):safe_path(p);return json.loads(pathlib.Path(p).read_text())
checks=[];pins=[];evidence=[]
def check(label,value):assert value,label;checks.append({'check':label,'passed':True})
check('exact05 manifest',sha(D/'manifest.json')=='607859e3f5e43ab4dad52afdcf1f1842801f2abacc197527b819e11668ccf1ab')
for folder in [D,B]:
 for f in read(folder/'manifest.json')['files']:
  p=folder/f['path'];check('sealed member '+str(p),sha(p)==f['sha256'] and p.stat().st_size==f['bytes'] and stat.S_IMODE(p.stat().st_mode)==f['mode']);pins.append({'path':str(p),**{k:v for k,v in f.items() if k!='path'}})
for f in read(D/'admission-inputs.json')['records']:check('admission ancestry '+f['path'],sha(f['path'])==f['sha256']);pins.append(f)
hold=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs009-gateway80-offtree03-20261019/hold.json')
check('public H ancestry only',sha(hold)=='fd58e6a6d34cb9f3c9c0a100a7bb38109a6913322232691d2528701d5825a073');pins.append({'path':str(hold),'sha256':sha(hold)})
# Run each retained suite once. Its repeated definition-prefix loaders reuse
# the already-passed pure50 environment, avoiding gratuitous control replay.
cache={};contexts={}
def guarded_exec(code,ns=None,locals=None):
 if ns is not None:ns.setdefault('exec',guarded_exec)
 if getattr(code,'co_filename','')=='<prior-50-controls-no-output>':
  if cache:ns.update(cache);return
  builtins.exec(code,ns,locals);cache.update(ns);return
 return builtins.exec(code,ns,locals)
for name in ['boundary-controls.py','revision-controls.py','report-admission-controls.py','admission-controls.py']:
 tree=ast.parse((D/name).read_text())
 tree.body=[x for x in tree.body if not (isinstance(x,ast.Expr) and isinstance(x.value,ast.Call) and isinstance(x.value.func,ast.Attribute) and x.value.func.attr=='write_text')]
 ns={'__file__':str(D/name),'exec':guarded_exec};builtins.exec(compile(tree,'<inspected guarded synthetic '+name+'>','exec'),ns);contexts[name]=ns
counts={name:len(ns['checks'] if name=='boundary-controls.py' else ns['results']) for name,ns in contexts.items()}
check('retained215 and new33',sum(counts.values())==248 and counts['admission-controls.py']==33 and sum(v for k,v in counts.items() if k!='admission-controls.py')==215)

# Actual capture's failed-holder schedule still emits the marker first.
ac=contexts['admission-controls.py'];n,d=ac['mini']();a=copy.deepcopy(ac['auth'])
n['prepare_proposal']=lambda *args:{'authorized':False,'holdFileSha256':n['HOLD_SHA']}
d.holder_fail=True
try:n['capture'](d,{},'a'*64,a,'b'*64)
except ValueError as ex:evidence.append({'case':'holder check fails','reason':str(ex),'events':d.events,'writesBeforeFailure':d.writes})
else:raise AssertionError('holder-failure fixture unexpectedly completes')
check('prewrite counterexample recorded',d.writes==['admission-capture-attempt.json'] and d.events.index('write:admission-capture-attempt.json')<d.events.index('held'))

# Held parser: exact argv/status do not substitute for verifying returned PID.
World=contexts['boundary-controls.py']['World']
for mode in ['correct PID','different PID','missing PID']:
 w=World();owner=w.H['wrapper']['pid'];ino=w.H['lock']['ino']
 w.C['capture']=lambda argv:('p'+str(owner)+'\n' if mode=='correct PID' else 'p99999\n' if mode=='different PID' else '')+'i'+str(ino)+'\n'
 w.d.held(w.A,w.C)
 evidence.append({'case':'held returned '+mode,'accepted':True,'actualPidExpected':owner})

# Core hash and interpreted source still come from separate reads. The extra
# import is an inspected standard-library-only marker; no runtime main runs.
corepath=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py');core=corepath.read_bytes()
w=World();fake='/R/'+str(corepath);w.fs.put(fake,core,h='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae')
FP=contexts['boundary-controls.py']['FP'];old_text=FP.read_text
def replaced(self):return core.decode()+'\nimport math as QA_CHANGED_AFTER_HASH\n' if self.p==fake else old_text(self)
FP.read_text=replaced;w.ns['ast']=ast
try:C=w.d.core()
finally:FP.read_text=old_text
evidence.append({'case':'CORE changed after checked hash','changedImportExecuted':'QA_CHANGED_AFTER_HASH' in C})
check('core same-buffer counterexample','QA_CHANGED_AFTER_HASH' in C)

# Candidate proof can change between file_hash and read, turning an unknown
# new resident into a claimed inherited identity. Only fake /E data is touched.
w=World();identity=copy.deepcopy(w.node(20));original=w.d.worker_candidates(w.A,w.C)
old_read=w.ns['read'];target=w.d.E/'candidate-baseline.json'
replacement=copy.deepcopy(old_read(target));replacement['identities']=[identity]
w.ns['read']=lambda p:copy.deepcopy(replacement) if p==target else old_read(p)
changed=w.d.worker_candidates(w.A,w.C)
evidence.append({'case':'candidate later parse substituted','beforeUnknown':len(original['unknownCandidates']),'afterUnknown':len(changed['unknownCandidates']),'afterInherited':len(changed['inheritedMatched'])})
check('candidate same-buffer counterexample',len(original['unknownCandidates'])==1 and not changed['unknownCandidates'] and len(changed['inheritedMatched'])==1)

# Inspect the installed public standard-library source; never call run/Popen.
run_source=inspect.getsource(subprocess.run);timeout_branch=run_source[run_source.index('except TimeoutExpired'):]
check('stdlib run timeout kills child','process.kill()' in timeout_branch and 'process.wait()' in timeout_branch)
driver=(D/'run-private.py').read_text();capture=(D/'capture-admission.py').read_text()
check('gateway observer uses killing timeout adapter','p = subprocess.run(command, capture_output=True, text=True, timeout=10, check=False)' in driver)
evidence.append({'case':'observation timeout contract','adapter':'subprocess.run(timeout=10)','installedStdlibKillsThenWaits':True,'actualChildOrSignal':False})

# Honest active generation/state metadata, distinct from preserved history.
scope=read(D/'scope.json')
evidence.append({'case':'active scope generation/state','preparationGeneration':scope['preparationGeneration'],'status':scope['status'],'prospectiveOnly':scope['prospectiveOnly']})
check('actual entrypoint generation05 bindings',all('gateway80-proof-prep/resume5' in (D/name).read_text() and 'gateway80-proof-prep/resume4' not in (D/name).read_text() for name in ['guard-exit.bash','exit-gate.py','verify-final.py']))
protected=['banks','case-map.json','input-manifest.json','contracts.py','helper.patch','tests.patch','vitest.gateway80.config.mjs','source-guards.json']
for f in read(B/'manifest.json')['files']:
 if f['path'].startswith('banks/') or f['path'] in protected:check('accepted subject preserved '+f['path'],sha(D/f['path'])==f['sha256'])
check('native argv/caps/umasks unchanged',all(scope[k]==read(B/'scope.json')[k] for k in ['phases','maximumSeconds','parentUmask','childUmask','phaseIds','workspace','runtime','label']))
# Exact declared strict patches are compared from the known source pairs by
# their sealed source/delta metadata, without running git or patch entrypoints.
diffmeta=read(D/'successor-diff.json')
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':sha(D/'manifest.json'),'pins':pins,'runtimeOnlyHRead':True,'actualBaselineOrLogBodyReadStatHash':False},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'sourceChecks':checks,'authorControlCounts':counts,'retained215':True,'new33':True,'allAuthorControlsExpected':True,'counterexamples':evidence,'actualRuntimeOsNativePrivateActions':0,'capacityRetryHistory':'Same unsealed review. No prior QA output/passed suite existed; retained suites run once, duplicated pure50 prefix reused.'},indent=2)+'\n')
print(json.dumps({'authorControlCounts':counts,'checks':len(checks),'counterexamples':evidence},indent=2))
