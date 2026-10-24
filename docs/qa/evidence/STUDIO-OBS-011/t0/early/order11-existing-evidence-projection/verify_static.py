"""Static/source/approved-PUBLIC and this prepared package only. Never calls parser or private IO."""
from pathlib import Path
import ast,hashlib,json,sys
O=Path(__file__).resolve().parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file());sha=lambda b:hashlib.sha256(b).hexdigest()
# This assigned directory contains prepared artifacts only; reject any actual release/output.
assert not any(p.name in {'release','released-projection-01'} for p in O.iterdir()),'ACTUAL_RELEASE_OR_OUTPUT_PRESENT'
for name in ['build_source_contract.py','build_review_artifacts.py','project_existing.py','contracts_fake.py','verify_static.py']:
 ast.parse((O/name).read_text(),filename=name)
p=ast.parse((O/'project_existing.py').read_text());functions={n.name:n for n in p.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))}
imports=[];calls=[]
for n in ast.walk(p):
 if isinstance(n,ast.Import):imports += [x.name for x in n.names]
 if isinstance(n,ast.ImportFrom):imports.append(n.module)
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute):calls.append(n.func.attr)
assert not set(imports)&{'subprocess','socket','urllib','http','requests','shutil','signal','ctypes','multiprocessing'}
assert not set(calls)&{'glob','rglob','walk','listdir','scandir','system','popen','spawn','kill','killpg','execv','execve','fork','connect'}
run=ast.get_source_segment((O/'project_existing.py').read_text(),functions['run'])
assert run.index('preauthorize(')<run.index("for alias in ['receipt'")<run.index('permit=authorize(')<run.index('io.claim_output(')<run.index('io.read_manifest(')<run.index('io.read_default_xml(')<run.index('io.read_inputs(')
assert 'stable_stat(os.fstat(fd))' in (O/'project_existing.py').read_text()
assert "except BaseException:print(json.dumps" in (O/'project_existing.py').read_text()
bindings=json.loads((O/'source-bindings.json').read_text());assert len(bindings)==27
for path,h in bindings.items():assert sha((R/path).read_bytes())==h,path
for path,h in json.loads((O/'assignment-inputs.json').read_text())['sha256'].items():assert sha((R/path).read_bytes())==h,path
source_map=json.loads((O/'source-map.json').read_text())
assert all(lines for aa in source_map['anchors'].values() for lines in aa.values())
fake=json.loads((O/'fake-contracts.json').read_text());assert fake['parserSha256']==sha((O/'project_existing.py').read_bytes())
assert fake['actualPrivateEnumerationReadsGlobsExports']==0 and fake['actualExecutionRelease'] is False and fake['guardFailuresHaveZeroPrivateManifestAndNativeRootReads'] is True
results={r['name']:r for r in fake['results']}
for name in ['live-collector-no-private-access','unknown-owned-Java-not-terminal','unknown-owned-UNKNOWN-not-terminal','fresh-output-collision-zero-private-reads']:
 assert not results[name]['accepted'] and results[name]['privateManifestReads']==results[name]['nativeRootReadCalls']==0
assert results['terminal-red-qualified-outer-negative-flags-retained-no-C8-pass-required']['accepted']
assert json.loads((O/'examples/root-authorization.example.json').read_text())['released'] is False
for role in ['root','quinn']:assert json.loads((O/f'examples/{role}-approval.example.json').read_text())['approved'] is False
assert json.loads((O/'examples/private-input-manifest.example.json').read_text())['files']==[]
for name in ['output-schema.json','refusal-schema.json']:assert json.loads((O/name).read_text())['additionalProperties'] is False
manifest=O/'manifest.json'
if manifest.is_file():
 m=json.loads(manifest.read_text());assert m['schemaVersion']==1
 for path,h in m['files'].items():assert sha((O/path).read_bytes())==h,path
 sums=(O/'SHA256SUMS').read_text().splitlines()
 assert len(sums)==len(m['files'])+1
 for line in sums:
  h,path=line.split('  ',1);assert sha((O/path).read_bytes())==h,path
report={'status':'STATIC_AND_IN_MEMORY_CONTRACTS_CHECKED_ONLY','sourceAndApprovedPublicBindings':len(bindings),'parserSha256':fake['parserSha256'],'syntheticAccepted':fake['accepted'],'syntheticRejected':fake['rejected'],'extraSchemaJsonRejections':fake['extraJsonSchemaRejections'],'guardZeroPrivateReads':True,'actualPrivateEnumerationReadsGlobsExports':0,'actualReleaseCreatedOrExecuted':False,'actualNativeCompilerProbe':False,'runtimeCause':'UNPROVEN','manifestChecked':manifest.is_file()}
print(json.dumps(report,sort_keys=True))
