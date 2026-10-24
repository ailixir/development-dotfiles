"""Static AST/text/hash checks only. NEVER import/execute a producer, old main or control."""
from pathlib import Path
from collections import Counter
import ast,difflib,hashlib,json
O=Path(__file__).resolve().parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def main():
 for x in read(O/'inputs.json')['pins']:assert sha(R/x['path'])==x['sha256'],x['path']
 change=read(O/'transformation.json');base=R/change['basePath'];assert sha(base)==change['baseSha256']=='a0103240db97da0806eb5f25a53f194c0802869d2120fd3970cc92de9481a71c'
 old=base.read_text();old_asserts=[n for n in ast.walk(ast.parse(old)) if isinstance(n,ast.Assert)]
 maps=read(O/'old-check-map.json');counts={}
 for name in ['verify-failed-normal-restored.template.py','verify-success-retain-three.template.py']:
  p=O/name;s=p.read_text();tree=ast.parse(s)
  assigns={n.targets[0].id:n.value for n in tree.body if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name)}
  assert ast.literal_eval(assigns['EXPECTED_ROOT_RELEASE_SHA'])=='UNBOUND_ROOT_RELEASE_SHA'
  assert ast.literal_eval(assigns['EXPECTED_NATIVE_EXIT']) is None and ast.literal_eval(assigns['EXPECTED_WRAPPER_EXIT']) is None
  assert s.index("raise SystemExit('HOLD: exact root release SHA is unbound')")<s.index('D=Path(__file__)')<s.index("assert sha(D/'root-actual-unit-release.json')")
  assert "raise SystemExit('HOLD: optimized assertion execution forbidden')" in s
  assert "assert D==T/'runtime/obs011-gst-provisional-06'" in s
  assert "assert policy['maxReadinessAgeSeconds']==60" in s
  new_asserts={ast.dump(n,include_attributes=False) for n in ast.walk(tree) if isinstance(n,ast.Assert)}
  rows=[x for x in maps if x['template']==name];assert len(rows)==len(old_asserts)
  for row,node in zip(rows,old_asserts):
   assert row['oldSource']==ast.get_source_segment(old,node)
   assert row['oldAstSha256']==hashlib.sha256(ast.dump(node,include_attributes=False).encode()).hexdigest()
   exact=ast.dump(node,include_attributes=False) in new_asserts
   assert exact==(row['disposition']=='EXACT_AST_PRESERVED')
   assert exact or row['mapping']
  counts[name]=dict(Counter(x['disposition'] for x in rows))
  writes=[n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='new']
  assert len(writes)==2
  assert {ast.unparse(n.args[0]) for n in writes}=={"D / 'final-resource-boundary.json'","D / 'preunlock-verification.json'"}
  assert 'unlock-permit.json' not in s and 'builtin exit' not in s and 'subprocess.run(' not in s
  assert "assert not gaps, 'Current gap requires separate exact independent qualification; keep hold'" in s
  assert "extra=[]" in s
  assert "assert receipt.get('interrupted',False) is False" in s
  assert "assert not (descendants-excluded-{pin['wrapperPid'],pin['shellPid']})" in s
  assert "'producerSha256':sha(Path(__file__))" in s
  assert "'verifiedAtEpoch':time.time()" in s
  suffix='failed' if 'failed' in name else 'success'
  expected=''.join(difflib.unified_diff(old.splitlines(True),s.splitlines(True),'a/'+str(base.relative_to(R)),'b/'+str(p.relative_to(R))))
  assert (O/f'delta-from-unit05-{suffix}.patch').read_text()==expected
  if suffix=='failed':
   assert "SOURCE_DISPOSITION='RESTORED'" in s and 'overrides={}' in s
   assert '1<=EXPECTED_NATIVE_EXIT<=255 and 1<=EXPECTED_WRAPPER_EXIT<=255' in s
   assert "('restore-compile',0)" in s
   assert "assert before['files']==after['files']==plan['source']['files']" in s
   assert "'phase':'restore-compile'" in s
   assert counts[name]=={'EXACT_AST_PRESERVED':len(old_asserts)-2,'EXPLICIT_BRANCH_OR_BINDING_MAP':2}
  else:
   assert "SOURCE_DISPOSITION='RETAIN_AUTHORIZED_THREE'" in s
   assert 'EXPECTED_NATIVE_EXIT==0 and EXPECTED_WRAPPER_EXIT==0' in s
   assert "'restore-compile':'NOT_STARTED'" in s
   assert "assert not (D/'owned-restore-compile/receipt.json').exists()" in s
   assert "assert set(overrides)==tests and set(overrides)<=set(expected)" in s
   assert "assert len(result['testcases'])==99 and all(x['status']=='PASS' for x in result['testcases'])" in s
   assert "result['taskResults']['test']['freshExec'] is True" in s
   assert "assert '> Task :compileTestJava' in lines and '> Task :test' in lines" in s
   assert "for checkpoint in (formatted,before,after,phase_after)" in s
   assert "'phase':'native'" in s
   assert counts[name]=={'EXACT_AST_PRESERVED':len(old_asserts)-10,'EXPLICIT_BRANCH_OR_BINDING_MAP':10}
 if (O/'manifest.json').exists():
  for x in read(O/'manifest.json')['files']:assert sha(O/x['path'])==x['sha256']
 print(json.dumps({'status':'STATIC_TEMPLATES_PASS_PREPARED_ONLY','oldChecksPerTemplate':len(old_asserts),'oldCheckMaps':counts,'templatesExecuted':False,'controlsExecuted':False,'readinessWritten':False,'permitWritten':False,'exitInvoked':False,'sourceOrProcessOrLockOrNativeActions':False}))
if __name__=='__main__':main()
