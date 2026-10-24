"""Independent exact seal/AST/semantic preservation audit. No private IO or entrypoint calls."""
from pathlib import Path
import ast,json,hashlib
R=Path.cwd();B=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/order11-existing-evidence-projection';D=B/'resume2';O=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/order11-existing-evidence-projection-resume2-review'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
expected={'manifest.json':'f015cd9e3c0cca41af3668dd5a5ef67cd00f7a5afe22d0bdc5d56e2edf3b5fad','project_existing.py':'dc9dd58361c17f2efd4e298a925b3b6e891991963072dcdca5a01cf81d0f39f5','receipt.json':'5ffaa5dfaf27c23a3f444b0f328746550f411681096daa8dbe105af532e4bd10','receipt.md':'d16a114917899068f551fd444f6657e8bfd3d4a0528dd9c8886a38eb147c0b64'}
for name,digest in expected.items():assert h(D/name)==digest
old=json.loads((B/'manifest.json').read_text());new=json.loads((D/'manifest.json').read_text());assert h(B/'manifest.json')=='44afe7ad379bfde9626d43f41879a9db323e41aec854531637f2b70702a4feb3'
assert len(old['files'])==25 and len(new['files'])==31
for base,manifest in [(B,old),(D,new)]:
 for name,digest in manifest['files'].items():assert h(base/name)==digest
 for line in (base/'SHA256SUMS').read_text().splitlines():
  digest,name=line.split(None,1);assert h(base/name.strip())==digest
prior=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/order11-existing-evidence-projection-review/review.md';assert h(prior)=='d7a95462fde17b78cdce7412fa8eb510180917d90bfae62198009073ccd63bbd'
a=(B/'project_existing.py').read_text();b=(D/'project_existing.py').read_text();ta=ast.parse(a);tb=ast.parse(b)
def keep(t):return [n for n in t.body if not isinstance(n,(ast.FunctionDef,ast.ClassDef)) or n.name not in {'ExactIO','main'}]
assert ast.dump(ast.Module(body=keep(ta),type_ignores=[]),include_attributes=False)==ast.dump(ast.Module(body=keep(tb),type_ignores=[]),include_attributes=False)
oldnodes={n.name:n for n in ta.body if isinstance(n,(ast.ClassDef,ast.FunctionDef))};newnodes={n.name:n for n in tb.body if isinstance(n,(ast.ClassDef,ast.FunctionDef))}
changed=[]
for name,n in oldnodes.items():
 if ast.get_source_segment(a,n)!=ast.get_source_segment(b,newnodes[name]):changed.append(name)
assert changed==['ExactIO','main']
unchanged_files=['source-bindings.json','source-contract.json','output-schema.json','source-map.json','assignment-inputs.json','examples/README.md','examples/private-input-manifest.example.json','examples/public-assessment.example.json','examples/quinn-approval.example.json','examples/root-approval.example.json','examples/root-authorization.example.json','examples/terminal-proof.example.json']
for name in unchanged_files:assert (B/name).read_bytes()==(D/name).read_bytes()
bindings=json.loads((D/'source-bindings.json').read_text());assert len(bindings)==27
for path,digest in bindings.items():assert h(R/path)==digest
assert json.loads((D/'examples/root-authorization.example.json').read_text())['released'] is False
for role in ['root','quinn']:assert json.loads((D/'examples'/f'{role}-approval.example.json').read_text())['approved'] is False
C=json.loads((D/'source-contract.json').read_text());assert C['originalProtocolSha256']=='0a96a75830856906e4912cb50e0c8419c838003eab48390925723755fa5ad1f0' and C['originalAriaProtocolSha256']=='b15f9aa304e75709032fc756769cabfffee85c3ce22102869146c2fba5544f0d' and C['originalResourceCatalogSha256']=='3be436be6ec4784ee393c16aee0aaf65d7620b4aed9fabfb73c68b4be09e359e'
# All fixed failures remain schema-covered, including new opened-fd/close guards.
require_calls=[n for n in ast.walk(tb) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='require'];assert all(isinstance(n.args[1],ast.Constant) and isinstance(n.args[1].value,str) for n in require_calls)
raise_literals={n.args[0].value for n in ast.walk(tb) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='Refused' and n.args and isinstance(n.args[0],ast.Constant)}
refusal=json.loads((D/'refusal-schema.json').read_text());allowed=set(refusal['properties']['reason']['enum']);assert {n.args[1].value for n in require_calls}|raise_literals<=allowed
removed_reasons=set(json.loads((B/'refusal-schema.json').read_text())['properties']['reason']['enum'])-allowed
assert not removed_reasons & ({n.args[1].value for n in require_calls}|raise_literals)
assert not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in {'glob','rglob','listdir','walk','system','popen','spawn','fork','kill','connect','urlopen','resolve'} for n in ast.walk(newnodes['ExactIO']))
# Final output success occurs only after protected write and finally:close, no path-based output open in main.
main=newnodes['main'];assert not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and isinstance(n.func.value,ast.Name) and n.func.value.id=='os' for n in ast.walk(main))
main_try=next(n for n in main.body if isinstance(n,ast.Try));assert ast.dump(main_try.finalbody[0],include_attributes=False)==ast.dump(ast.parse('reader.close()').body[0],include_attributes=False)
assert "reader.write_output(output)" in ast.get_source_segment(b,main)
launch=(D/'launch.txt').read_text();assert 'resume2/project_existing.py' in launch and 'UNEXECUTED' in launch
out=dict(currentManifestSha256=h(D/'manifest.json'),currentParserSha256=h(D/'project_existing.py'),receiptJsonSha256=h(D/'receipt.json'),receiptMdSha256=h(D/'receipt.md'),currentSealedArtifacts=31,originalSealedArtifactsUnchanged=25,originalManifestSha256=h(B/'manifest.json'),priorReviewSha256=h(prior),changedTopLevelSourceNodes=changed,unchangedSemanticSourceNodes=len(oldnodes)-len(changed),unchanged27SourcePublicBindings=True,unchangedSemanticSchemaExampleFiles=unchanged_files,examplesRemainFalse=True,fixedRequireFailureCalls=len(require_calls),fixedRefusalReasonsSchemaCovered=True,retiredUnreachableIoReasons=sorted(removed_reasons),mainSuccessAfterWriteAndFinallyClose=True,noPathBasedOutputOpenInMain=True,retainedAliasAndDescriptorModelOnly=True,actualPrivateEnumerationStatReadGlobCopyExport=0,actualCliOrNativeExecuted=False,rootFutureReleaseGranted=False)
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
