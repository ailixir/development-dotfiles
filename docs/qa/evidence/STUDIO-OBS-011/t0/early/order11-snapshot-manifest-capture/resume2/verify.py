"""Static SOURCE/prepared witnesses only; no original release/output or actual private IO."""
from pathlib import Path
import ast,hashlib,json
O=Path(__file__).resolve().parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name in ['capture_snapshot.py','load_core.py','contracts.py','contracts_optional_io.py','check_preservation.py','verify.py']:ast.parse((O/name).read_text())
assert not any(p.name in {'release','released-projection-01'} for p in O.iterdir())
proof=json.loads((O/'preservation.json').read_text());assert proof['status']=='ONLY_FINITE_IO_LABEL_CONSTANT_AND_ONE_CATCH_MEMBERSHIP_CHANGED' and proof['old24SealedArtifactsUnchanged'] and proof['newHelperSha256']==sha(O/'capture_snapshot.py')
B=O.parent;old=json.loads((B/'manifest.json').read_text())
for name,h in old['files'].items():assert sha(B/name)==h,name
for name in proof['unchangedFiles']:assert (O/name).read_bytes()==(B/name).read_bytes(),name
bindings=json.loads((O/'bindings.json').read_text());assert len(bindings)==36
for name,h in bindings.items():assert sha(R/name)==h,name
for name,h in proof['assignmentAndReviewSourceHashes'].items():assert sha(R/name)==h,name
original=json.loads((O/'contracts.json').read_text());io=json.loads((O/'optional-io-contracts.json').read_text())
assert original['helperSha256']==io['helperSha256']==sha(O/'capture_snapshot.py') and original['semanticChecks']==40 and original['fdChecks']==8
assert (original['semanticAccepted'],original['semanticRejected'],original['fdAccepted'],original['fdRejected'])==(14,26,3,5)
assert io['classificationLabelCount']==16 and io['injectedControls']==46 and io['incompleteExit2']==38 and io['ordinaryUnprovenExit0']==8 and io['mandatoryTenReproductionsCorrected'] and io['additionalPositiveCompleteAndFalseNoneControls']==2
assert set(io['classifiedSourceLabels'])==set(io['labelSourceMap'])==set(proof['classificationLabels'])
assert all(x['snapshotFactsAndErrorCodePreserved'] and x['onlySnapshotReportWritten'] and x['actualPrivateIO']==0 for x in io['results'])
assert original['actualPrivateEnumerationStatReadGlobCopyExport']==original['actualHelperMainCli']==original['actualOsIo']==io['actualPrivateIO']==io['helperMainCli']==io['actualOsIO']==0
assert json.loads((O/'examples/root-authorization.example.json').read_text())['released'] is False
for role in ['root','quinn']:assert json.loads((O/f'examples/{role}-approval.example.json').read_text())['approved'] is False
scope=json.loads((O/'examples/scope.example.json').read_text());assert scope['optionalCorrelation'] is True and scope['journalAuthority']=='ONE_FIXED_OWNED_JOURNAL_GUIDED_INTERVAL_ONLY' and scope['parserSha256']==sha(O/'capture_snapshot.py')
manifest=O/'manifest.json'
if manifest.is_file():
 m=json.loads(manifest.read_text());assert len(m['files'])<=32
 for name,h in m['files'].items():assert sha(O/name)==h,name
 sums=(O/'SHA256SUMS').read_text().splitlines();assert len(sums)==len(m['files'])+1
 for line in sums:h,name=line.split('  ',1);assert sha(O/name)==h,name
print(json.dumps({'status':'STATIC_PURE_CONTRACTS_ONLY','helperSha256':sha(O/'capture_snapshot.py'),'old24ArtifactsAnd36BindingsUnchanged':True,'originalControls':48,'newIoAndSemanticControls':48,'mandatoryTenCorrected':True,'actualPrivateIO':0,'actualMainCli':0,'originalReleaseAndOutputAccessed':False,'newRelease':False,'manifestChecked':manifest.is_file()}))
