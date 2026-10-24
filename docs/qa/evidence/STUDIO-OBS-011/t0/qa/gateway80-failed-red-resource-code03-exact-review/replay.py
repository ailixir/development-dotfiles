"""Exact inspected suite replay; replace only terminal result-file expression.

The suite and all actual target function bodies, effect fakes and persistent deny
audit remain unchanged. Results are emitted to inherited stdout, never to subject.
Each invocation is a fresh interpreter; no target runtime boundary is authorized.
"""
import ast
import hashlib
import json
from pathlib import Path
import sys

SUBJECT = Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume3').absolute()
NAMES = {'checks.py', 'extra_checks.py', 'optimized_bootstrap_checks.py', 'code02_checks.py', 'source03_checks.py'}
name = sys.argv[1]
if name not in NAMES:
    raise RuntimeError('EXACT_SUITE_REQUIRED')
raw = (SUBJECT / name).read_bytes()
tree = ast.parse(raw, filename=str(SUBJECT / name))
matches = []
for index, node in enumerate(tree.body):
    if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute) and node.value.func.attr == 'write_text':
        matches.append(index)
if len(matches) != 1 or matches[0] != len(tree.body) - 2:
    raise RuntimeError('EXACT_RESULT_WRITER_REQUIRED')
tree.body[matches[0]] = ast.copy_location(ast.parse('review_results.append(result)').body[0], tree.body[matches[0]])
ast.fix_missing_locations(tree)
results = []
env = {'__name__': '_review_exact_suite', '__file__': str(SUBJECT / name), 'review_results': results}
exec(compile(tree, str(SUBJECT / name), 'exec'), env)
if len(results) != 1:
    raise RuntimeError('EXACT_RESULT_REQUIRED')
print(json.dumps({'suite': name, 'suiteSha256': hashlib.sha256(raw).hexdigest(), 'outputAdaptationOnly': 'terminal write_text replaced with review_results.append; test bodies/audit unchanged', 'result': results[0]}, sort_keys=True))
