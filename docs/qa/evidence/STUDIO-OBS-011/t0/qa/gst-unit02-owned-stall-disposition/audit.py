"""Static source and approved safe-metadata audit; never invokes native helpers."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[7]
OUT = Path(__file__).resolve().parent
D = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-gst-provisional-02'
TASK = ROOT / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
context = json.loads((TASK / 'gst-unit02-owned-stall-disposition-context.json').read_text())
pins = []
for pin in context['pins']:
    actual = sha(ROOT / pin['path'])
    assert actual == pin['sha256'], pin['path']
    pins.append(dict(pin, actual=actual, matches=True))
names = [
    'owned-stall-pre-diagnostic-identities.json',
    'root-owned-thread-print-release.json', 'owned-thread-print-result.json',
    'owned-thread-print-fixed-projection.json',
    'root-owned-worker-recovery-release.json',
    'owned-worker-recovery-pre-signal-identities.json',
    'owned-worker-recovery-result.json', 'owned-native/receipt.json',
    'root-preunlock-restored-terminal.json', 'root-unit-closed.json',
]
data = {n: json.loads((D / n).read_text()) for n in names}
diag = data['owned-thread-print-result.json']
projection = data['owned-thread-print-fixed-projection.json']
recovery = data['owned-worker-recovery-result.json']
native = data['owned-native/receipt.json']
assert diag['releaseSha256'] == sha(D / 'root-owned-thread-print-release.json')
assert diag['exit'] == 0 and diag['diagnosticChildTerminated']
assert not diag['timedOut'] and not diag['truncated']
assert diag['elapsedSeconds'] < 10 and diag['bytes'] < 2097152
assert diag['targetSignalsSent'] == 0 and diag['targetSameStartAfter']
assert diag['targetIdentityBefore']['identityComplete']
assert diag['targetIdentityBefore']['pid'] == 84782
assert projection['rawSha256'] == diag['rawSha256']
assert not projection['otherRawBodyReleased']
assert projection['candidateSourceSha256'] == pins[5]['actual']
assert recovery['releaseSha256'] == sha(D / 'root-owned-worker-recovery-release.json')
assert recovery['classification'] == 'ABORTED_FAILED_INCOMPLETE'
assert recovery['terminalProof'] == 'PID_ABSENT'
assert len(recovery['signals']) == 1
assert recovery['signals'][0]['signal'] == 'SIGTERM'
assert recovery['signals'][0]['pid'] == 84782
assert recovery['signals'][0]['start'] == context['kernelFacts']['workerStart']
assert not recovery['semanticCompletionClaimed']
assert recovery['controllersNotSignalled'] and recovery['otherDescendantsNotSignalled']
assert native['status'] == 'NATIVE_PHASE_TERMINAL' and native['collectorExit'] == 1
assert len(native['ownedIdentities']) == 7 and not native['remainingOwnedNonJvmFacts']
assert not native['evidenceErrors']
assert not any(v for k, v in native.items() if k.endswith('ObservationGap'))
candidate = (ROOT / pins[5]['path']).read_text().splitlines()
assert candidate[3434].strip() == 'settled.await();'
assert 'owner::drainUninterruptibly' in candidate[2950]
assert candidate[2997].strip() == 'action.run();'
assert 'completed.await();' in candidate[3422]
assert 'ownedThread.join();' in candidate[4679]
assert 'Thread.currentThread().interrupt();' in candidate[3452]
assert 'rejected' in '\n'.join(candidate[3435:3445])
core = (ROOT / pins[3]['path']).read_text()
assert 'finally:' in core and 'while child is not None:' in core
assert "ownership_drain_decision(rows, known, child.poll() is not None) == 'WAIT'" in core
assert "RECEIPT['drainObservationGap'] = True" in core
assert "if pid in rows and rows[pid]['start'] == start" in core
report = {
    'mode': 'STATIC_SOURCE_AND_ROOT_SAFE_METADATA_ONLY',
    'mandatoryPinsVerified': len(pins), 'pins': pins,
    'safeMetadata': [{'path': str((D / n).relative_to(ROOT)), 'sha256': sha(D / n)} for n in names],
    'sourceFrames': projection['fixedCandidateFramesOnly'],
    'diagnostic': {'exit': diag['exit'], 'seconds': diag['elapsedSeconds'], 'bytes': diag['bytes'],
                   'targetSignals': 0, 'rawBodyRead': False},
    'recovery': {'signalCount': 1, 'signal': 'SIGTERM', 'target': 84782, 'escalationUsed': False,
                 'classification': recovery['classification'], 'semanticCompletion': False},
    'nativeReceipt': {'exit': 1, 'ownedCount': 7, 'remainingOwnedNonJvmCount': 0,
                      'observationGaps': False, 'evidenceErrors': 0},
    'closureMetadataCustodyOnly': True,
    'freshKernelVerificationPerformedByThisReviewer': False,
    'closedUnitIndependentReviewOwed': True,
    'nativeExecutionOrSignalPerformedByThisReviewer': False,
    'creditOrRetryReleased': False,
}
(OUT / 'audit-result.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'mandatoryPinsVerified': len(pins), 'safeMetadataBound': len(names),
                  'checks': 'PASS', 'rawBodyRead': False, 'creditReleased': False}))
