"""Check historical seal, exact semantic/source preservation and correction inputs. SOURCE only."""
from pathlib import Path
import ast,difflib,hashlib,json
O=Path(__file__).resolve().parent;B=O.parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file());sha=lambda b:hashlib.sha256(b).hexdigest()
old=json.loads((B/'manifest.json').read_text());assert sha((B/'manifest.json').read_bytes())=='44afe7ad379bfde9626d43f41879a9db323e41aec854531637f2b70702a4feb3'
for name,h in old['files'].items():assert sha((B/name).read_bytes())==h,name
assert len(old['files'])==25 and sha((B/'project_existing.py').read_bytes())=='03e64cb7f8155194c614fedca3b47a99f547db2768a38e38984b0e5d4b5d5bd5'
a=(B/'project_existing.py').read_text();b=(O/'project_existing.py').read_text();ta=ast.parse(a);tb=ast.parse(b)
filtered=lambda t:[ast.dump(n,include_attributes=False) for n in t.body if not isinstance(n,(ast.FunctionDef,ast.ClassDef)) or n.name not in {'ExactIO','main'}]
assert filtered(ta)==filtered(tb),'CHANGE_OUTSIDE_EXACTIO_MAIN'
fa={n.name:ast.dump(n,include_attributes=False) for n in ta.body if isinstance(n,ast.FunctionDef) and n.name!='main'}
fb={n.name:ast.dump(n,include_attributes=False) for n in tb.body if isinstance(n,ast.FunctionDef) and n.name!='main'}
assert fa==fb
unchanged=['source-bindings.json','source-contract.json','output-schema.json','source-map.json','assignment-inputs.json',*['examples/'+n for n in ['README.md','private-input-manifest.example.json','public-assessment.example.json','quinn-approval.example.json','root-approval.example.json','root-authorization.example.json','terminal-proof.example.json']]]
for name in unchanged:assert (O/name).read_bytes()==(B/name).read_bytes(),name
bindings=json.loads((O/'source-bindings.json').read_text());assert len(bindings)==27
for path,h in bindings.items():assert sha((R/path).read_bytes())==h,path
inputs=['.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/order11-projection-fs-fix-'+s for s in ['intent.txt','context.txt','preflight.json']]+['docs/qa/evidence/STUDIO-OBS-011/t0/qa/order11-existing-evidence-projection-review/'+s for s in ['review.md','contracts.py','contracts.json','audit.py','audit.json']]
inputhashes={name:sha((R/name).read_bytes()) for name in inputs}
assert inputhashes[inputs[3]]=='d7a95462fde17b78cdce7412fa8eb510180917d90bfae62198009073ccd63bbd'
exactio=next(n for n in tb.body if isinstance(n,ast.ClassDef) and n.name=='ExactIO')
fragment=(O/'ExactIO.fragment.txt').read_text().strip();assert ast.dump(ast.parse(fragment),include_attributes=False)==ast.dump(ast.Module(body=[exactio],type_ignores=[]),include_attributes=False)
assert not any(isinstance(n,ast.Attribute) and n.attr in {'resolve','glob','rglob','walk','listdir','scandir'} for n in ast.walk(exactio))
main=next(n for n in tb.body if isinstance(n,ast.FunctionDef) and n.name=='main')
assert not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and isinstance(n.func.value,ast.Name) and n.func.value.id=='os' for n in ast.walk(main))
patch=''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile='original/project_existing.py',tofile='resume2/project_existing.py'))
(O/'project-existing.fs-only.patch').write_text(patch)
report={'status':'ONLY_EXACTIO_AND_MAIN_AST_CHANGED','historicalManifestSha256':sha((B/'manifest.json').read_bytes()),'historical25ArtifactsUnchanged':True,'historicalParserSha256':sha(a.encode()),'correctedParserSha256':sha(b.encode()),'unchangedTopLevelFunctions':sorted(fa),'unchangedSemanticSourceExampleFiles':unchanged,'unchangedSourcePublicBindings':27,'exactIOFragmentMatches':True,'actualPrivateIoOrEnumeration':0,'parserCliMainExecuted':False,'correctionInputSha256':inputhashes,'diffSha256':sha(patch.encode())}
(O/'preservation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['status','historical25ArtifactsUnchanged','correctedParserSha256','unchangedSourcePublicBindings','actualPrivateIoOrEnumeration']}))
