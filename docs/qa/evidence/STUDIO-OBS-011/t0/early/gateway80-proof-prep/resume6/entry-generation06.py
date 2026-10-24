from pathlib import Path
import ast,hashlib
D=Path(__file__).parent;leaf=(D/'verified-inputs.py').read_bytes();pin=hashlib.sha256(leaf).hexdigest();tree=ast.parse(leaf)
node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='anchored_raw')
reader=ast.get_source_segment(leaf.decode(),node).replace('def anchored_raw(','def entry_read_bytes(').replace('require(','entry_require(')
shared='''def entry_require(ok,reason):
    if not ok:raise ValueError(reason)

'''+reader+'''

def trusted_leaf():
    cached=globals().get('_TRUSTED_LEAF_NS')
    if cached is not None:return cached
    package=Path(__file__).absolute().parent
    expected=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume6')
    entry_require(package==expected,'EXACT_GENERATION06_ENTRY_REQUIRED')
    raw=entry_read_bytes(package/'verified-inputs.py')
    entry_require(hashlib.sha256(raw).hexdigest()=='LEAF_PIN','LEAF_VERIFIED_BUFFER_CHANGED')
    ns={'__file__':str(package/'verified-inputs.py'),'__name__':'verified_gateway06_leaf'}
    exec(compile(raw,'<same-verified-leaf-buffer>','exec'),ns)
    globals()['_TRUSTED_LEAF_NS']=ns
    return ns


def bootstrap_entry(kind):
    return trusted_leaf()['entry'](Path(__file__).absolute().parent,kind,sys.argv[1:])

'''.replace('LEAF_PIN',pin)
# Driver and capture have no unverified top-level local-module imports/actions.
for name in ('run-private.py','capture-admission.py'):
 p=D/name;s=p.read_text();marker="if __name__ == '__main__':" if name=='run-private.py' else "if __name__=='__main__':"
 i=s.index(marker)
 if 'def entry_require(' in s:s=s[:s.index('def entry_require(')]+s[i:];i=s.index(marker)
 s=s[:i]+shared+s[i:];p.write_text(s)
old=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume5/verify-final.py').read_text();t=ast.parse(old)
guard=ast.get_source_segment(old,next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name=='entry_guard'))
for name,kind in [('verify-final.py','final'),('exit-gate.py','gate'),('postclose.py','postclose')]:
 pre='"""Generation06 verified-buffer '+kind+' entry; inactive until separate root admission."""\nfrom pathlib import Path\nimport hashlib,json,os,stat,sys\nsys.dont_write_bytecode=True\nD=Path(__file__).absolute().parent\n'
 suffix="if __name__ == '__main__':\n    try:sys.exit(bootstrap_entry('"+kind+"'))\n    except BaseException as exc:\n        if isinstance(exc,SystemExit) and exc.code==0:raise\n        msg=str(exc) if isinstance(exc,ValueError) else ''\n        code=msg if 0<len(msg)<=96 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_' for c in msg) else 'UNKNOWN_CONTROL_FAILURE'\n        print(json.dumps({'status':'HOLD_GATEWAY80','failureClass':type(exc).__name__,'failureCode':code,'credit':False}))\n        sys.exit(1)\n"
 (D/name).write_text(pre+guard+'\n\n'+shared+suffix)
print('Generated same-buffer entry bindings; leaf SHA '+pin)
