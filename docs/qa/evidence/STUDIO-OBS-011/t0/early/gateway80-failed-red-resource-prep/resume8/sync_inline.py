"""Author-only AST/literal sink/registry synchronization, never target execution."""
from pathlib import Path
import ast,json
D=Path(__file__).parent;p=D/'protocol.py';s=p.read_text();tree=ast.parse(s)
registry=ast.literal_eval(next(n.value for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='REASON_REGISTRY' for t in n.targets)))
stages=ast.literal_eval(next(n.value for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='STAGES' for t in n.targets)))
for f in D.glob('*.py'):
 for n in ast.walk(ast.parse(f.read_bytes())):
  if isinstance(n,ast.Call) and isinstance(n.func,(ast.Name,ast.Attribute)) and (getattr(n.func,'id',None)=='need' or getattr(n.func,'attr',None)=='need') and len(n.args)>1 and isinstance(n.args[1],ast.Constant) and type(n.args[1].value)is str:
   registry['PROTOCOL_HOLD'].append(n.args[1].value)
 for n in ast.walk(ast.parse(f.read_bytes())):
  if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='BootstrapValueError' and n.args and isinstance(n.args[0],ast.Constant) and type(n.args[0].value)is str:
   registry['BOOTSTRAP_VALUE_ERROR'].append(n.args[0].value)
registry['BOOTSTRAP_VALUE_ERROR']=sorted(set(registry['BOOTSTRAP_VALUE_ERROR']))
registry['PROTOCOL_HOLD']=sorted(set(registry['PROTOCOL_HOLD']))
for name in ('CONTROL_AUTHOR','FINAL_GUARDED_ACCEPTANCE','CONTROL_AUTHOR_WRITE','STATE_PUBLICATION','OPERATOR_COMPLETION'):
 if name not in stages:stages+=name,
def replace_node(text,node,value):
 lines=text.splitlines(True);return ''.join(lines[:node.lineno-1])+value+'\n'+''.join(lines[node.end_lineno:])
for key,value in (('REASON_REGISTRY',registry),('STAGES',stages)):
 tree=ast.parse(s);node=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id==key for t in n.targets));s=replace_node(s,node,key+'='+repr(value))
p.write_text(s);tree=ast.parse(s)
block='\n'.join(ast.get_source_segment(s,n) for n in tree.body if isinstance(n,(ast.Assign,ast.ClassDef)) and (getattr(n,'name',None) in ('BootstrapValueError','FailureSink') or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('STAGES','REASON_REGISTRY') for t in n.targets)))
for name in ('guard-failed-red.bash','binding-functions.bash','bind-command.template.bash','install-loader.bash','install-cli.py','control-author-cli.py'):
 f=D/name;text=f.read_text()
 start=text.index('STAGES=');class_start=text.index('class FailureSink:',start)
 # The next top-level function/statement marks the exact inline class end.
 lines=text[class_start:].splitlines(True);end=class_start
 for i,line in enumerate(lines):
  if i>0 and line.strip() and not line[0].isspace():break
  end+=len(line)
 shell_block=block.replace("'",'"') if name.endswith('.bash') else block
 text=text[:start]+shell_block+'\n'+text[end:]
 if name in ('guard-failed-red.bash','binding-functions.bash','bind-command.template.bash'):
  text=text.replace('status=1;failure=None;fds=[];chain=[]','status=1;failure=None;mode=None;fds=[];chain=[]')
  text=text.replace(' sink.finalize(finalizer)\nsys.exit(status)', ' final_status=sink.finalize(finalizer)\n if mode=="gate":status=final_status if type(final_status)is int and final_status==0 else 1\n elif type(status)is not int or status not in(0,1):status=1\nsys.exit(status)')
 f.write_text(text)
print(json.dumps(dict(sinkCopies=5,stages=len(stages),protocolReasons=len(registry['PROTOCOL_HOLD']))))
