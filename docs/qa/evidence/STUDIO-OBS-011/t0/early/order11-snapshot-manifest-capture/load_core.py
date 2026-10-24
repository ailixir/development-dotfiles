"""Reuse exact reviewed SOURCE definitions only; no module inputs, entrypoints or author loops."""
from pathlib import Path
from types import ModuleType
import ast,copy,hashlib,json
CORE=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/order11-existing-evidence-projection/resume2')
PARSER_SHA='dc9dd58361c17f2efd4e298a925b3b6e891991963072dcdca5a01cf81d0f39f5'
CONTRACT_SHA='64b739b6c66e5f72c18a2cd344b2cba6eaab9d2721ff10860f0f4dfdb5446bd7'
def load(here,root):
 raw=(root/CORE/'project_existing.py').read_bytes();contract=(root/CORE/'source-contract.json').read_bytes()
 assert hashlib.sha256(raw).hexdigest()==PARSER_SHA and hashlib.sha256(contract).hexdigest()==CONTRACT_SHA
 p=ModuleType('reviewed_core_definitions');p.__dict__.update(HERE=here,ROOT=root,C=json.loads(contract))
 classes={'Refused','ClosedArgumentParser','ExactIO'}
 functions={'require','digest','stable_stat','canonical','keys','integer','pairs','decode','uuid_text','scope_contract','preauthorize','authorize','numbers','snapshot','instant_ns','owned_producer','validate_manifest'}
 constants={'SOURCE_PATHS','FQCN','ROLES','SAFE','SHA','OPERATIONS'}
 tree=ast.parse(raw);body=[]
 for n in tree.body:
  if isinstance(n,(ast.Import,ast.ImportFrom)) or isinstance(n,ast.ClassDef) and n.name in classes or isinstance(n,ast.FunctionDef) and n.name in functions or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in constants for t in n.targets):body.append(n)
 exec(compile(ast.Module(body=body,type_ignores=[]),'<reviewed-pure-fd-definitions-only>','exec'),p.__dict__)
 # Only writer adaptation: two caller-whitelisted fixed filenames and closed document validator.
 cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='ExactIO')
 writer=copy.deepcopy(next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='write_output'));writer.name='write_document';writer.args.args.append(ast.arg(arg='filename'))
 class Adapt(ast.NodeTransformer):
  def visit_Constant(self,n):return ast.copy_location(ast.Name(id='filename',ctx=ast.Load()),n) if n.value=='projection.json' else n
  def visit_Name(self,n):return ast.copy_location(ast.Name(id='validate_document',ctx=n.ctx),n) if n.id=='validate_output' else n
 writer=Adapt().visit(writer);ast.fix_missing_locations(writer)
 exec(compile(ast.Module(body=[writer],type_ignores=[]),'<reviewed-writer-fixed-name-adaptation>','exec'),p.__dict__)
 return p
