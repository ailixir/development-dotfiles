"""Only source/hash/AST custody checks; no helper main, native, census or signal."""
from pathlib import Path
import ast
import hashlib
import json
import stat

OUT = Path(__file__).resolve().parent
R = OUT.parents[6]
T = R / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'
B = R / 'docs/qa/evidence/STUDIO-OBS-011/t0'
C = B / 'early/gs-t-draft/resume4-finite-observation'
Q = B / 'runtime/gst-limited-start-proposal03'
E = B / 'early/gst-restricted-unit-prep/resume3'
D = B / 'runtime/obs011-gst-provisional-03'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
context = read(T / 'gst-unit03-composed-quality-review-context.json')
for pin in context['pins']:
    assert sha(R / pin['path']) == pin['sha256'], pin['path']
members = {}
for directory in [C, Q, E]:
    manifest = read(directory / 'manifest.json')
    for pin in manifest['files']:
        assert sha(directory / pin['path']) == pin['sha256'], pin['path']
    members[str(directory.relative_to(R))] = len(manifest['files'])
proposal = read(Q / 'proposal.json')
inventory = read(R / 'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-fresh-check03-before.json')
for row in inventory['files']:
    assert sha(R / row['path']) == row['sha256'], row['path']
main = [r for r in inventory['files'] if r['path'].startswith('backend/src/main/')]
assert {r['path'] for r in main} == {str(p.relative_to(R)) for p in (R/'backend/src/main').rglob('*') if p.is_file()}
for row in inventory['dist']['files']:
    assert sha(R / 'studio-runner/dist' / row['path']) == row['sha256']
plan = read(B / 'early/fullcheck-harness/resume3/plan.json')
for group in ['helm', 'quotedCurrent', 'immutableHelpers']:
    for path, digest in plan[group].items():
        assert sha(R / path) == digest, path
prepared = read(D / 'prepared-inputs-and-backups.json')
for row in prepared['backups']:
    assert sha(R / row['source']) == sha(R / row['backup']) == row['sha256']
    assert stat.S_IMODE((R / row['source']).stat().st_mode) == 0o644
for row in proposal['writerBindings']:
    assert sha(R / row['file']) == row['beforeSha256']
    assert sha(C / 'repo' / row['file']) == row['afterSha256']
oldkeeper = (B / 'runtime/obs011-gst-provisional-02/owned_native_phase.py').read_text()
keeper = (D / 'owned_native_phase.py').read_text()
reversekeeper = keeper.replace('runtime/gst-restricted-unit03', 'runtime/gst-restricted-unit02')
assert reversekeeper == oldkeeper and ast.dump(ast.parse(reversekeeper)) == ast.dump(ast.parse(oldkeeper))
assert sha(D/'owned_native_phase.py') == prepared['phaseKeeperSha256']
assert not prepared['sourceWriterReleased'] and not prepared['nativeCommandReleased']
assert not (B / 'runtime/gst-restricted-unit03').exists()
for flag in ['sourceWriteReleased','sourceReleased','nativeReleased','retryReleased','actualExecution','nativeCredit','remediationClaim']:
    assert proposal[flag] is False, flag
pf = read(T/'gst-unit03-composed-quality-review-preflight.json')
assert pf['scan']['safe'] and pf['story']['status'] == 'InProgress' and pf['budgetCeilingUsd'] == 500
report = {'scope': 'STATIC_COMPOSED_QUALITY_AND_EXACT_LIMITED_ORDERING_ONLY',
          'assignedPins': len(context['pins']), 'packageMembers': members,
          'existingFrozenSourcePinsMatch': len(inventory['files']),
          'mainMembershipAndBytesOriginal': len(main), 'distExistingPinsOriginal': len(inventory['dist']['files']),
          'protectedPlanPinCounts': {g: len(plan[g]) for g in ['helm','quotedCurrent','immutableHelpers']},
          'preparedOriginalBackups': len(prepared['backups']), 'currentThreeSourceModes': '0644',
          'preparedKeeperOnlyU02ToU03SourceAndAstDelta': True,
          'candidateReadOnlyVerifier': {'exit':0,'methods':80,'originalAssertions':751,'hooks':2,'modes':9,'cases':99,'sentinels':11,'grammarAccepted':3,'grammarRejected':8,'runtimeVerified':False},
          'recipeReadOnlyVerifier': {'exit':0,'phasePointersOnly':3,'retargetedBindings':7,'spotlessInitExact':True,'nativeCommandCount':1,'stdinAndOneCommandProcedureRetained':True},
          'verifiersInspectedBeforeExecution': True,
          'aggregateOriginalSourceMembershipRecapturePerformed': False,
          'freshLiveResourceKernelOrOwnershipCheckPerformed': False,
          'historicalProtectedRawBodiesRead': False, 'phaseMainOrNativeOrSignalActions':0,
          'rootActualLeaseAndLivePrerequisitesStillRequired':True,
          'sourceNativeOrCreditReleasedByThisAudit':False,
          'pins':context['pins']}
(OUT/'audit-result.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k != 'pins'}))
