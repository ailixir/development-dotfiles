"""Static/prepared-source verification only. Never calls capture run/CLI/private IO."""
from pathlib import Path
import ast,hashlib,json
O=Path(__file__).resolve().parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name in ['capture_snapshot.py','load_core.py','contracts.py','verify.py']:ast.parse((O/name).read_text())
assert not any(p.name in {'release','released-projection-01'} for p in O.iterdir())
for name,h in json.loads((O/'bindings.json').read_text()).items():assert sha(R/name)==h,name
proof=json.loads((O/'source-and-preservation.json').read_text());assert proof['all31PriorArtifactsUnchanged'] and proof['sourceBindingsChecked']==36
for name,h in proof['assignmentInputs'].items():assert sha(R/name)==h,name
B=O.parent/'order11-existing-evidence-projection/resume2';assert sha(B/'manifest.json')=='f015cd9e3c0cca41af3668dd5a5ef67cd00f7a5afe22d0bdc5d56e2edf3b5fad'
for name,h in json.loads((B/'manifest.json').read_text())['files'].items():assert sha(B/name)==h,name
contract=json.loads((O/'contracts.json').read_text());assert contract['helperSha256']==sha(O/'capture_snapshot.py') and contract['semanticChecks']==40 and contract['fdChecks']==8
assert contract['semanticAccepted']==14 and contract['semanticRejected']==26 and contract['fdAccepted']==3 and contract['fdRejected']==5 and contract['actualPrivateEnumerationStatReadGlobCopyExport']==contract['actualHelperMainCli']==contract['actualOsIo']==0
results={x['name']:x for x in contract['semanticResults']}
for name in ['snapshot-facts-with-no-warning-or-startup','snapshot-facts-with-unrelated-warning-and-no-startup','source-OTHER-is-not-no-error','missing-numeric-values-stay-omitted-not-zero','terminal-red-qualified-outer-no-C8-pass','missing-journal-preserves-independent-snapshot','missing-selected-log-preserves-independent-snapshot','ambiguous-generation-preserves-independent-snapshot','partial-manifest-validation-preserves-snapshot']:assert results[name]['accepted']
for name in ['old-purpose-does-not-authorize-new-capture','old-no-journal-authority-does-not-authorize-new-structured-read','wrong-closed-public-pin-refuses-before-control']:assert not results[name]['accepted'] and results[name]['syntheticProtectedControlReads']==0
for name in ['partial-missing-errorCode-refuses','captureFailure-refuses','partial-source-translation-group-refuses','wrong-ordinal-control-refuses','optional-separately-known-identity-mismatch-refuses']:assert not results[name]['accepted']
tree=ast.parse((O/'capture_snapshot.py').read_text());functions={n.name:n for n in tree.body if isinstance(n,ast.FunctionDef)}
snapshot=ast.get_source_segment((O/'capture_snapshot.py').read_text(),functions['snapshot_facts']);assert 'warning' not in snapshot and 'startup' not in snapshot
for n in ast.walk(tree):
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute):assert n.func.attr not in {'glob','rglob','walk','listdir','scandir','system','popen','kill','killpg','fork','connect'}
 if isinstance(n,ast.Import):assert all(a.name not in {'subprocess','socket','requests','signal','ctypes'} for a in n.names)
run=ast.get_source_segment((O/'capture_snapshot.py').read_text(),functions['run']);assert run.index('P.preauthorize(')<run.index('permit=P.authorize(')<run.index('io.claim_output(')<run.index('io.read_control(')<run.index('io.read_xml(')
assert json.loads((O/'examples/root-authorization.example.json').read_text())['released'] is False
for role in ['root','quinn']:assert json.loads((O/f'examples/{role}-approval.example.json').read_text())['approved'] is False
assert json.loads((O/'examples/capture-control.example.json').read_text())['expectedIds'] is None
manifest=O/'manifest.json'
if manifest.is_file():
 m=json.loads(manifest.read_text());assert len(m['files'])<=32
 for name,h in m['files'].items():assert sha(O/name)==h,name
 for line in (O/'SHA256SUMS').read_text().splitlines():h,name=line.split('  ',1);assert sha(O/name)==h,name
print(json.dumps({'status':'SOURCE_STATIC_SYNTHETIC_ONLY','helperSha256':sha(O/'capture_snapshot.py'),'sourcePublicBindings':36,'old31ArtifactsUnchanged':True,'semanticChecks':40,'fdChecks':8,'actualPrivateIO':0,'actualMainCli':0,'releaseCreated':False,'manifestChecked':manifest.is_file()}))
