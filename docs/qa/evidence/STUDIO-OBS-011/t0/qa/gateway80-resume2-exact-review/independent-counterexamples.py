"""Source-extracted functions and a fully in-memory world; no real helper main/OS IO."""
from pathlib import Path
from types import SimpleNamespace
import ast, json
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume2')
O=Path(__file__).resolve().parent
# Inspected fixture definitions only; stop before author test invocations/output.
t=ast.parse((D/'boundary-controls.py').read_text());prefix=[]
for n in t.body:
 if isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='w' for x in n.targets):break
 prefix.append(n)
ns={'__file__':str((D/'boundary-controls.py').absolute())}
exec(compile(ast.Module(body=prefix,type_ignores=[]),'<inspected-fake-world-definitions-only>','exec'),ns)
World=ns['World'];w=World();w.node(20)
# Extract the exact bounded_capture body nested in core, with subprocess entirely fake.
driver=ast.parse((D/'run-private.py').read_text())
core=next(x for x in driver.body if isinstance(x,ast.FunctionDef) and x.name=='core')
bounded=next(x for x in core.body if isinstance(x,ast.FunctionDef) and x.name=='bounded_capture')
calls=[]
bns={'subprocess':SimpleNamespace(run=lambda argv,**kw:calls.append(argv) or SimpleNamespace(returncode=1,stdout='',stderr='SYNTH_PS_FAILED')),'require':ns['contracts']['require']}
exec(compile(ast.Module(body=[bounded],type_ignores=[]),'<actual-bounded-capture-fake-subprocess>','exec'),bns)
w.C['bounded_capture']=bns['bounded_capture']
facts=w.d.boundary(w.H,w.C,w.A)
assert w.rows[20]['ppid']==1 and not facts['workerCandidates']['unknownCandidates']
assert calls and calls[0]==['/bin/ps','-ww','-axo','pid=,comm=']
results=[{'id':'G80-RESOURCE-02-PS-ERROR','actualFunctions':'core.bounded_capture + boundary + worker_candidates','result':'ACCEPT despite resident Tinypool PID20 and synthetic global ps exit1/empty','allSubprocessesFake':True,'required':'Global ps failure must HOLD; command-specific expected return codes and injected negative coverage.'}]
# Empty successful global census is also unqualified empty data, not quiet.
w=World();w.node(20)
bns['subprocess']=SimpleNamespace(run=lambda argv,**kw:SimpleNamespace(returncode=0,stdout='',stderr=''))
w.C['bounded_capture']=bns['bounded_capture']
f=w.d.boundary(w.H,w.C,w.A)
assert not f['workerCandidates']['unknownCandidates']
results.append({'id':'G80-RESOURCE-02-EMPTY-GLOBAL','actualFunctions':'core.bounded_capture + boundary + worker_candidates','result':'ACCEPT for empty global comm census even with fake ps exit0 and resident role in full table','required':'Require complete nonempty well-formed global observation; an empty result is not absence proof.'})
bns['subprocess']=SimpleNamespace(run=lambda argv,**kw:SimpleNamespace(returncode=1,stdout='',stderr='SYNTH_PS_FAILED'))
# A neutral-argv resident under W is also missed when its cwd observation fails.
w=World();w.node(20,argv='/NODE /NEUTRAL/app.js')
old_bounded=w.C['bounded_capture']
w.C['bounded_capture']=lambda argv:bns['bounded_capture'](argv) if argv[0]=='/usr/sbin/lsof' and 'cwd' in argv else old_bounded(argv)
f=w.d.boundary(w.H,w.C,w.A)
assert w.cwd[20].startswith('/W/') and not f['workerCandidates']['unknownCandidates']
results.append({'id':'G80-RESOURCE-02-CWD-ERROR','actualFunctions':'core.bounded_capture + boundary + worker_candidates','result':'ACCEPT for resident neutral-argv Node with fake actual cwd under W when lsof exits1/empty','required':'Missing/failed cwd observation cannot prove unrelated; retain UNKNOWN or establish original identity gone with explicit race qualification.'})
# A pid present in the later comm census but absent from the earlier table is
# observed without a stable identity; current code silently skips it.
w=World();w.node(20)
r=w.d.worker_candidates(w.A,w.C,rows={})
assert not r['unknownCandidates'] and not r['currentNative']
results.append({'id':'G80-RESOURCE-02-TABLE-COMM-GAP','actualFunction':'worker_candidates','result':'Empty accepted state for later comm-census Node20 missing from earlier full table','required':'Record the observed row/comm mismatch as UNKNOWN rather than silently erasing it.'})
# Root/ancestor symlink bypass: actual chart_guard consumes inventory(root), which
# excludes the root entry. Simulate os.walk top-level symlink semantics by serving
# exactly the target inventory while retaining a symlink root in the fake FS.
w=World();chart=w.d.W/'repo/helm-chart/put-checks'
rows=w.d.inventory(chart)
# original phase uses original helper hash; supply target chart rows accordingly.
original=ns['I']['helperBanks']['original']['sha256']
for row in rows:
 if row['path']=='templates/_helpers.tpl':row['sha256']=original
w.fs.nodes[str(chart)]['kind']='symlink';w.fs.nodes[str(chart)]['data']=b'/R/helm-chart/put-checks'
# All child reads resolve to expected target files. The fixture does not follow
# real paths: replace file_hash/inventory with closed in-memory target facts.
old_hash=w.ns['file_hash']; original_hash=original
w.ns['inventory']=lambda root:rows if str(root)==str(chart) else w.d.inventory(root)
w.ns['file_hash']=lambda p:original_hash if str(p).endswith('/templates/_helpers.tpl') and str(p).startswith('/W/') else old_hash(p)
# Actual chart_guard has no root lstat or ancestor custody test.
assert w.ns['chart_guard'](chart,False) is True
assert w.ns['workspace_guard']('original') is None
results.append({'id':'G80-LINK-06','actualFunction':'chart_guard + workspace_guard','result':'ACCEPT for a symlink chart root serving expected original22 target inventory','rootIsSymlink':chart.is_symlink(),'actualMutationOrTargetRead':False,'sourceConsequence':'workspace_guard leaf hashes follow chart ancestors; install-fixed shutil.copyfile target follows the chart-root link into the real chart before post-source checks.'})
# Dedicated archive root is likewise absent from inventory records. A root link
# to a renamed same-content archive preserves every recorded child identity.
w=World();archive=w.d.E/'final-fixed-chart-archive';served=w.d.inventory(archive)
w.fs.nodes[str(archive)]['kind']='symlink';w.fs.nodes[str(archive)]['data']=b'/SYNTH_RENAMED_SAME_ARCHIVE'
old_inventory=w.d.inventory
serve=lambda root:served if str(root)==str(archive) else old_inventory(root)
w.ns['inventory']=serve;w.d.inventory=serve
f=w.facts()
assert f['credit'] is False and archive.is_symlink()
results.append({'id':'G80-LINK-06-ARCHIVE','actualFunction':'final_facts + chart_guard','result':'Final facts ACCEPT with dedicated archive root symlink serving original recorded child inventory','actualMutationOrTargetRead':False,'required':'Reject linked/replaced archive roots/parents before inventory traversal; preserve exact owned archive custody as well as child content.'})
# Separate output leaf is never checked before copyfile(report, E/report).
run=next(x for x in driver.body if isinstance(x,ast.FunctionDef) and x.name=='run_native')
copy_calls=[x for x in ast.walk(run) if isinstance(x,ast.Call) and isinstance(x.func,ast.Attribute) and x.func.attr=='copyfile']
assert len(copy_calls)==1
results.append({'id':'G80-LINK-06-OUTPUT','source':ast.unparse(copy_calls[0]),'result':'Destination evidence report has no exclusive/no-follow creation; a preexisting destination symlink is followed by copyfile. A later source guard detects damage only after write.','staticBoundaryCheckOnly':True})
(O/'independent-counterexample-results.json').write_text(json.dumps({'kind':'PURE_FAKE_SOURCE_ONLY','counterexamples':results,'noRealHelperMainNativeCensusLockPrivateIO':True},indent=2)+'\n')
print(json.dumps(results))
