"""Inspected source05 blocked-boundary suite replay; only result writer omitted."""
from pathlib import Path
import ast,base64,builtins,collections,copy,ctypes,datetime,errno,fcntl,hashlib,io,json,math,os,re,resource,selectors,shlex,signal,socket,stat,struct,subprocess,sys,threading,time,types,unittest.mock
import xml.etree.ElementTree,xml.parsers.expat
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-public-evidence-prep/resume5').absolute()
name=sys.argv[1];assert name in ['targeted05_checks.py','boundary03_checks.py','integration04_checks.py']
raw=(D/name).read_bytes();tree=ast.parse(raw)
writers=[n for n in tree.body if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='write_text']
assert len(writers)==1
# No subject/tests/audit changes. Elide only immutable old-packet result writer.
tree.body=[n for n in tree.body if n not in writers]
ns={'__file__':str(D/name),'__name__':'quinn_inspected_guarded_suite'}
exec(compile(tree,'<exact guarded source05 '+name+'>','exec'),ns)
result=ns['result']
print(json.dumps({'reviewSuite':name,'sourceSha256':hashlib.sha256(raw).hexdigest(),'executedChecks':len(result['checks']),'result':result,'actualRuntimeOrNativeActions':0}))
