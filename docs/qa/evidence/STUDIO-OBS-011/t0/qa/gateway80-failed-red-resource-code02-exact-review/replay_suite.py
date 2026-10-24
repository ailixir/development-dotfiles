"""Exact inspected source-only suites; remove only old-packet result writer."""
from pathlib import Path
import ast,builtins,collections,copy,ctypes,datetime,errno,fcntl,hashlib,io,json,os,re,resource,shlex,shutil,signal,socket,stat,subprocess,sys,time,types,unittest.mock
import xml.etree.ElementTree
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume2').absolute();name=sys.argv[1]
assert name in ('checks.py','extra_checks.py','optimized_bootstrap_checks.py','code02_checks.py')
raw=(D/name).read_bytes();tree=ast.parse(raw)
tree.body=[n for n in tree.body if not(isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='write_text')]
ns={'__file__':str(D/name),'__name__':'quinn_inspected_guarded_source_suite'}
exec(compile(tree,'<inspected exact failed-resource suite '+name+'>','exec'),ns)
print(json.dumps({'reviewSuite':name,'sourceSha256':hashlib.sha256(raw).hexdigest(),'executedChecks':len(ns['result']['checks']),'actualRuntimeOrNativeActions':0}))
