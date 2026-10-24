"""Exact inspected SOURCE04 suites: terminal result capture only; audit unchanged."""
import ast,hashlib,json
from pathlib import Path
import sys
SUBJECT=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume4').absolute()
names={'checks.py','optimized_bootstrap_checks.py','code02_checks.py','source03_checks.py','source04_three_checks.py'}
name=sys.argv[1]
if name not in names:raise RuntimeError('EXACT_SUITE_REQUIRED')
raw=(SUBJECT/name).read_bytes();tree=ast.parse(raw,filename=str(SUBJECT/name))
indices=[i for i,n in enumerate(tree.body) if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='write_text']
if len(indices)!=1 or indices[0]!=len(tree.body)-2:raise RuntimeError('EXACT_TERMINAL_WRITER_REQUIRED')
tree.body[indices[0]]=ast.copy_location(ast.parse('review_results.append(result)').body[0],tree.body[indices[0]]);ast.fix_missing_locations(tree)
results=[];env={'__name__':'_quinn_exact_source04_suite','__file__':str(SUBJECT/name),'review_results':results}
exec(compile(tree,str(SUBJECT/name),'exec'),env)
if len(results)!=1:raise RuntimeError('EXACT_RESULT_REQUIRED')
print(json.dumps(dict(suite=name,suiteSha256=hashlib.sha256(raw).hexdigest(),outputAdaptationOnly='terminal subject write_text replaced with review_results.append; tests/target/audit unchanged',result=results[0]),sort_keys=True))
