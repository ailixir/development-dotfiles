"""Run inspected exact current suite, omitting only immutable packet result writer.
Persistent audit and every subject safety statement remain unchanged. Full result
is sent to the already-open review stdout; no subject output is written.
"""
import ast,builtins,copy,ctypes,fcntl,hashlib,io,json,os,re,selectors,socket,stat,struct,subprocess,sys,threading,time,types
from pathlib import Path
from contextlib import ExitStack
from unittest.mock import patch
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-public-observer-java-qualification-prep/resume1').absolute()
name=sys.argv[1]
if name not in ('source_checks.py','flow_checks.py'):raise ValueError('EXACT_SUITE_REQUIRED')
m=json.loads((S/'manifest.json').read_bytes());row=next(r for r in m['files'] if r['path']==name);raw=(S/name).read_bytes()
if hashlib.sha256(raw).hexdigest()!=row['sha256']:raise ValueError('EXACT_SUITE_SHA')
tree=ast.parse(raw);removed=[]
for node in list(tree.body):
 if isinstance(node,ast.Expr) and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Attribute) and node.value.func.attr=='write_text':
  if 'check-results.json' not in ast.unparse(node):raise ValueError('UNEXPECTED_WRITER')
  removed.append(node);tree.body.remove(node)
if len(removed)!=1:raise ValueError('ONE_RESULT_WRITER_ONLY')
ns={'__file__':str(S/name),'__name__':'_independent_qa_guarded_suite'}
exec(compile(tree,'<inspected-suite-only-result-writer-omitted>','exec'),ns)
print(json.dumps({'reviewSuite':name,'suiteSha256':row['sha256'],'omittedOnlyTopLevelResultWriter':True,'result':ns['result']},indent=2))
