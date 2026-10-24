"""Exact sealed SOURCE/proof only; never enumerate/read original release or consumed output."""
from pathlib import Path
import ast,copy,difflib,hashlib,json
O=Path(__file__).resolve().parent;B=O.parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(B/'manifest.json')=='420c18cee7778be2b41738df0dafa12d6c13a7ae91140b12a53e0e8b111bda4a'
old=json.loads((B/'manifest.json').read_text());assert len(old['files'])==24
for name,h in old['files'].items():assert sha(B/name)==h,name
before=(B/'capture_snapshot.py').read_text();after=(O/'capture_snapshot.py').read_text();a=ast.parse(before);b=ast.parse(after)
constant=next(n for n in b.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='OPTIONAL_IO_FAILURES' for t in n.targets));assert isinstance(constant.value,ast.Call) and constant.value.func.id=='frozenset'
labels=ast.literal_eval(constant.value.args[0]);assert len(labels)==16
normalized=copy.deepcopy(b);normalized.body=[n for n in normalized.body if not (isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='OPTIONAL_IO_FAILURES' for t in n.targets))]
class RestoreOldMembership(ast.NodeTransformer):
 replacements=0
 def visit_Compare(self,n):
  if any(isinstance(c,ast.Name) and c.id=='OPTIONAL_IO_FAILURES' for c in n.comparators):
   assert len(n.comparators)==1 and len(n.ops)==1 and isinstance(n.ops[0],ast.In)
   n.comparators=[ast.Set(elts=[ast.Constant('INPUT_CLOSE_FAILURE'),ast.Constant('DIRECTORY_CLOSE_FAILURE')])];self.replacements+=1
  return self.generic_visit(n)
restore=RestoreOldMembership();normalized=restore.visit(normalized);assert restore.replacements==1
assert ast.dump(a,include_attributes=False)==ast.dump(normalized,include_attributes=False),'CHANGE_BEYOND_ONE_CONSTANT_AND_MEMBERSHIP'
unchanged=['load_core.py','bindings.json','public-output-schema.json','allowed-fields-and-locators.md','initial-approved-bindings.json','examples/capture-control.example.json','examples/public-assessment.example.json','examples/root-approval.example.json','examples/quinn-approval.example.json','examples/terminal-proof.example.json']
for name in unchanged:assert (B/name).read_bytes()==(O/name).read_bytes(),name
for path,h in json.loads((O/'bindings.json').read_text()).items():assert sha(R/path)==h,path
sourceinputs=['.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/order11-manifest-io-fix-'+s for s in ['intent.txt','context.txt','preflight.json']]+['docs/qa/evidence/STUDIO-OBS-011/t0/qa/order11-snapshot-manifest-review/review.md']
inputs={name:sha(R/name) for name in sourceinputs};assert inputs[sourceinputs[-1]]=='11e65ff4c025f10f2f3bd5478890e1819407e6a97cd799ec6863c468e7e05ca8'
patch=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='original/capture_snapshot.py',tofile='resume2/capture_snapshot.py'));(O/'optional-io-only.patch').write_text(patch)
proof={'status':'ONLY_FINITE_IO_LABEL_CONSTANT_AND_ONE_CATCH_MEMBERSHIP_CHANGED','oldManifestSha256':sha(B/'manifest.json'),'oldHelperSha256':sha(B/'capture_snapshot.py'),'newHelperSha256':sha(O/'capture_snapshot.py'),'old24SealedArtifactsUnchanged':True,'originalReleaseOutput':'NOT_ENUMERATED_STATTED_OPENED_READ_OR_MODIFIED','unchangedFiles':unchanged,'unchangedSourcePublicBindings':36,'classificationLabels':sorted(labels),'assignmentAndReviewSourceHashes':inputs,'successfulPreflightUsed':sourceinputs[2],'failedPreflight':'PRESERVED_NOT_USED','diffSha256':hashlib.sha256(patch.encode()).hexdigest(),'actualPrivateIO':0}
(O/'preservation.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({k:proof[k] for k in ['status','old24SealedArtifactsUnchanged','newHelperSha256','unchangedSourcePublicBindings','actualPrivateIO']}))
