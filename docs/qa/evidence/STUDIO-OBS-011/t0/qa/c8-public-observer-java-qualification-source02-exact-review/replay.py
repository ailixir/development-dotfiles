"""Replay exact inspected affected suites with only test-result writer intercepted.
The original persistent audit, same-namespace effect guards and subject statements
remain untouched. The guard patches write_text to deny while target code executes;
only its completed top-level result write is captured to already-open stdout.
"""
import ast,builtins,copy,ctypes,fcntl,hashlib,io,json,os,re,selectors,socket,stat,struct,subprocess,sys,threading,time,types
from pathlib import Path
from contextlib import ExitStack
from unittest.mock import patch
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-public-observer-java-qualification-prep/resume2').absolute()
name=sys.argv[1]
if name not in ('flow_checks.py','projection02_checks.py'):raise ValueError('ONLY_CURRENT_AFFECTED_SUITES')
m=json.loads((S/'manifest.json').read_bytes());row=next(r for r in m['files'] if r['path']==name);raw=(S/name).read_bytes()
if hashlib.sha256(raw).hexdigest()!=row['sha256']:raise ValueError('EXACT_SUITE_SHA')
captured=[]
def completed_result(path,data,*args,**kwargs):
 if str(path) not in (str(S/'flow-check-results.json'),str(S/'projection02-check-results.json')):raise AssertionError('UNEXPECTED_RESULT_MUTATION')
 captured.append(json.loads(data));return len(data)
ns={'__file__':str(S/name),'__name__':'_independent_quinn_affected_suite'}
with patch.object(Path,'write_text',completed_result):exec(compile(raw,'<exact-inspected-affected-suite>','exec'),ns)
if len(captured)!=1:raise ValueError('ONE_COMPLETED_RESULT_REQUIRED')
print(json.dumps({'reviewSuite':name,'suiteSha256':row['sha256'],'onlyCompletedResultWriterCaptured':True,'result':captured[0]},indent=2))
