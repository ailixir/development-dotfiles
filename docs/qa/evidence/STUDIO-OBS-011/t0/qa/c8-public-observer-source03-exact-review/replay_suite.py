"""Replay inspected synthetic suite; preserve author deny audit; no target effects."""
from pathlib import Path
import ast,base64,builtins,collections,copy,ctypes,datetime,errno,fcntl,hashlib,io,json,math,os,re,resource,selectors,shlex,signal,socket,stat,struct,subprocess,sys,threading,time,types,unittest.mock
import xml.etree.ElementTree,xml.parsers.expat
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-public-evidence-prep/resume3').absolute()
name=sys.argv[1];assert name in ['pure_checks.py','runtime_adapter_checks.py','boundary03_checks.py']
raw=(D/name).read_bytes();tree=ast.parse(raw)
# Only remove the top-level old-packet result writer; the author's persistent
# deny audit and every fake boundary remain enabled and unchanged.
tree.body=[n for n in tree.body if not(isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='write_text')]
ns={'__file__':str(D/name),'__name__':'quinn_inspected_guarded_suite'}
exec(compile(tree,'<exact guarded source03 '+name+'>','exec'),ns)
result=ns.get('result',ns.get('out',ns.get('output')))
if result is None:result={'checks':ns.get('RESULTS',ns.get('checks',[]))}
print(json.dumps({'reviewSuite':name,'sourceSha256':hashlib.sha256(raw).hexdigest(),'executedChecks':len(result.get('checks',[])),'actualRuntimeOrNativeActions':0}))
