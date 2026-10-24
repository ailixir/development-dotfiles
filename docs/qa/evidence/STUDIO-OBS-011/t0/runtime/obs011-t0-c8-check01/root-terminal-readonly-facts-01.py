"""Root read-only terminal source/recorded-set facts; no phase or close authority."""
import datetime
import json
from pathlib import Path
import sys

D = Path(__file__).resolve().parent
sys.path.insert(0, str(D / 'execution'))
from runtime_support import core_scope, load, prove_lock, require_release, sha, source_snapshot, store

assert sha(D / 'owned-full-check/receipt.json') == '46ca88416a9f362b40590a209cd5802bb67507c43eee620866fbe432af1cc543'
receipt = load(D / 'owned-full-check/receipt.json')
assert receipt['status'] == 'NATIVE_PHASE_TERMINAL' and receipt['phaseExit'] == 1
authority, plan = require_release(D, '9f347db3774a785a0b732392b2711976476ac4ae8743fcad839026c121fc3511')
scope = core_scope()
pin = prove_lock(D, scope)
source = source_snapshot(D, plan, scope)
assert source == load(D / 'full-check/source-before.json') == load(D / 'full-check/source-after.json')
boundary = scope['boundary_inventory'](plan)
assert len(boundary['inheritedMatched']) == 6
assert not any(boundary[k] for k in ('originalIdentitiesAbsent', 'inheritedIdentityChanged', 'incompleteStableIdentities', 'otherProjectFacts'))
rows = scope['table']()
recorded = {(item['pid'], item['start']): item for item in receipt['ownedIdentities']}
assert len(recorded) == len(receipt['ownedIdentities']) == 2438
operational = load(D / 'root-live-phase-lineage-01-limited.json')
# The separate operational keeper has a limited supplied identity, never a full fingerprint.
for role in ('phaseKeeper', 'collector'):
    item = operational[role]
    assert isinstance(item['pid'], int) and isinstance(item['start'], str)
    recorded.setdefault((item['pid'], item['start']), item)
proof = []
for (pid, start), item in sorted(recorded.items()):
    current = rows.get(pid)
    state = 'PID_ABSENT' if current is None else 'PID_REUSED' if current['start'] != start else 'SAME_START_PRESENT_HOLD'
    proof.append({'pid': pid, 'start': start, 'proof': state})
current_same = [item for item in proof if item['proof'] == 'SAME_START_PRESENT_HOLD']
assert not current_same
owned_pids = {pid for pid, start in recorded if pid in rows and rows[pid]['start'] == start}
assert not [item for item in boundary['listeners'] if item['pid'] in owned_pids]
prove_lock(D, scope)
require_release(D, '9f347db3774a785a0b732392b2711976476ac4ae8743fcad839026c121fc3511')
result = {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'kind': 'READ_ONLY_TERMINAL_FACTS_NOT_DISPOSITION_OR_READINESS',
          'originalReleaseSha256': sha(D / 'root-actual-unit-release.json'),
          'activeLockSha256': sha(D / 'active-lock.json'),
          'terminalReceiptSha256': sha(D / 'owned-full-check/receipt.json'),
          'source': source, 'boundary': boundary, 'sameHolderProved': True,
          'recordedIdentityCount': len(recorded), 'recordedCurrentProof': proof,
          'unrecordedForkAbsenceProved': False, 'globalQuietClaimed': False,
          'historicalGapUnchanged': receipt['ownedIdentityObservationGap'],
          'operationalRootsFullFingerprintProved': False,
          'originalOperationalObservationSha256': sha(D / 'root-live-phase-lineage-01-limited.json'),
          'sourceWrites': 0, 'nativePhases': 0, 'closingActions': 0, 'C8Credit': False}
store(D / 'root-terminal-readonly-facts-01.json', result)
print(json.dumps({'status': 'READ_ONLY_TERMINAL_FACTS_CAPTURED',
                  'sha256': sha(D / 'root-terminal-readonly-facts-01.json'),
                  'recordedIdentityCount': len(recorded), 'sourceEqual': True,
                  'C8Credit': False}))
