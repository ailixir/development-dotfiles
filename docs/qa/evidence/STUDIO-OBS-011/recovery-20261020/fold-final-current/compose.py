"""Bounded source-only refresh. Writes only this evidence directory; never product source."""
from pathlib import Path
import copy
import difflib
import hashlib
import json
import re
import stat

ROOT = Path.cwd()
OUT = Path(__file__).resolve().parent
REC = OUT.parent
PRIOR = REC / 'fold-composed-style03'
EARLY = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/early'
assert OUT == ROOT / 'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/fold-final-current'
inputs = {}


def sha(b):
    return hashlib.sha256(b).hexdigest() if b is not None else None


def read(p):
    b = p.read_bytes()
    inputs[str(p.relative_to(ROOT))] = sha(b)
    return b


def load(p):
    return json.loads(read(p))


def emit(name, obj):
    (OUT / name).write_text(json.dumps(obj, indent=2) + '\n')


def diff(a, b):
    lines = []
    for p in sorted(set(a) | set(b)):
        x, y = a.get(p), b.get(p)
        if x != y:
            lines.extend(difflib.unified_diff((x or b'').decode().splitlines(True),
                (y or b'').decode().splitlines(True),
                fromfile='a/' + p if x is not None else '/dev/null',
                tofile='b/' + p if y is not None else '/dev/null'))
    return ''.join(lines).encode()


prior = load(PRIOR / 'manifest.json')
assert sha((PRIOR / 'manifest.json').read_bytes()) == '59cabb36a3d118d25d41a3d9b505b0a21f715c56735bb935e5d09a2babd80295'
preservation = load(PRIOR / 'static-preservation.json')
read(REC / 'fold-composed-style03-qa-review.md')
prior_rows = {r['path']: r for r in prior['files']}
actual, modes, old_incoming, old_final = {}, {}, {}, {}
for p, row in prior_rows.items():
    f = ROOT / p
    assert not f.is_symlink(), p
    actual[p] = f.read_bytes() if f.exists() else None
    modes[p] = stat.S_IMODE(f.stat().st_mode) if f.exists() else None
    old_incoming[p] = read(PRIOR / 'incoming' / p) if row['incomingSha256'] is not None else None
    old_final[p] = read(PRIOR / 'candidates' / p) if row['candidateSha256'] is not None else None
    assert sha(old_incoming[p]) == row['incomingSha256'], p
    assert sha(old_final[p]) == row['candidateSha256'], p

bridge = 'backend/src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedBridgePlannedIT.java'
fixture = 'backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedResultPublicationDisabledIT.java'
replay = 'backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'
assert sha(actual[bridge]) == '94c040c2e6124bc82fc1a90e267fafe1b3b5821cabbcd68f208b5056c697438c'
assert sha(actual[fixture]) == '255469af129ef55146c568d5a839d643c6469c54900bbd81c699b87b2f056c05'
assert sha(actual[replay]) == 'b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475'
changed = [p for p in sorted(actual) if actual[p] != old_incoming[p]]
assert set(changed) == {bridge, fixture, replay}, changed

bridge_correction = load(REC / 'sibling-waits-execution/bridge-compile-correction/proposal.json')
read(REC / 'sibling-waits-execution/bridge-compile-correction-qa/review.md')
call = bridge_correction['originalCall'].encode()
block = bridge_correction['candidateReplacement'].encode()
assert old_incoming[bridge].count(call) == 1
assert actual[bridge] == old_incoming[bridge].replace(call, block)
fixture_proposal = load(REC / 'gsma-execution/fixture-correction-v2/proposal.json')
fixture_candidate = read(REC / 'gsma-execution/fixture-correction-v2/GuidedResultPublicationDisabledIT.java.txt')
assert actual[fixture] == fixture_candidate
assert sha(fixture_candidate) == fixture_proposal['candidateSha256']
read(REC / 'gsma-execution/successor-resume4-binding.json')
staged = load(REC / 'sibling-waits-execution/all-nine-staged-binding.json')
for row in staged['files']:
    assert sha(actual[row['path']]) == row['sha256']
    assert oct(modes[row['path']]) == row['mode']

incoming = copy.deepcopy(actual)
incoming[replay] = read(EARLY / 'it-r-draft/resume3/stages/04-b4/repo' / replay)
assert sha(incoming[replay]) == '98aec4f908d92c89a5d50155e35702eb8b8e3c98270d82655f212b328ca0e42c'
assert incoming[replay] == old_incoming[replay]
final = copy.deepcopy(incoming)
patch = read(PRIOR / 'final-from-incoming.patch')
assert sha(patch) == 'ed94cb9cc847c0e772eeef633829a6613b149c6c38f1e665c07a3f1b20111f32'
lines, i, hunks, operations = patch.decode().splitlines(True), 0, [], []
while i < len(lines):
    assert lines[i].startswith('--- '), repr(lines[i])
    old, new = lines[i][4:].strip(), lines[i + 1][4:].strip()
    p = (new if new != '/dev/null' else old)[2:]
    assert p not in operations
    operations.append(p)
    before = final[p]
    assert (before is None) == (old == '/dev/null'), p
    body, shift = (before or b'').decode().splitlines(True), 0
    i += 2
    while i < len(lines) and not lines[i].startswith('--- '):
        header = lines[i].strip()
        m = re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*', header)
        assert m, header
        i += 1
        old_block, new_block = [], []
        while i < len(lines) and not lines[i].startswith(('@@ ', '--- ')):
            line = lines[i]
            assert line[:1] in (' ', '+', '-'), repr(line)
            if line[:1] in (' ', '-'):
                old_block.append(line[1:])
            if line[:1] in (' ', '+'):
                new_block.append(line[1:])
            i += 1
        assert len(old_block) == int(m[2] or 1), header
        assert len(new_block) == int(m[4] or 1), header
        expected = max(0, int(m[1]) - 1) + shift
        matches = [j for j in range(len(body) - len(old_block) + 1)
                   if body[j:j + len(old_block)] == old_block] if old_block else [0]
        if expected in matches:
            at = expected
        else:
            assert len(matches) == 1, (p, header, matches)
            at = matches[0]
        if not old_block:
            assert before is None and not body
        offset = at - expected
        assert offset == 0 or (p == bridge and offset == 63), (p, header, offset)
        hunks.append(dict(path=p, header=header, matchedLine=at + 1, lineOffset=offset,
            exactMatches=len(matches), exactOldBlockSha256=sha(''.join(old_block).encode()),
            exactNewBlockSha256=sha(''.join(new_block).encode()), contextRelaxed=False,
            selection='declared-position-exact' if offset == 0 else 'unique-exact-offset'))
        body[at:at + len(old_block)] = new_block
        shift += len(new_block) - len(old_block)
    output = ''.join(body).encode()
    if new == '/dev/null':
        assert output == b''
        output = None
    final[p] = output
assert len(operations) == 38
assert set(operations) == {p for p in prior_rows if old_incoming[p] != old_final[p]}
assert fixture not in operations and final[fixture] == actual[fixture]
assert old_final[bridge].count(call) == 1
assert final[bridge] == old_final[bridge].replace(call, block)
assert final[bridge].count(block) == 1
assert {p for p in final if final[p] != old_final[p]} == {fixture, bridge}

type_map = load(EARLY / 'fold-gst06-accepted-overlap-prep/type-port-map.json')
type_only = []
for name in ['GuidedSessionIT.java', 'GuidedServiceTransportFaultIT.java',
             'GuidedLifecycleReasonIT.java', 'GuidedBridgePlannedIT.java']:
    p = next(p for p in final if p.endswith('/' + name))
    expected = incoming[p].decode()
    for item in type_map:
        expected = expected.replace(item['before'], item['after'])
    assert expected.encode() == final[p], ('NOT_WHOLE_FILE_TYPE_ONLY', p)
    type_only.append(dict(path=p, exactWholeFileAfterOnlyReviewedTypeMapping=True,
        incomingSha256=sha(incoming[p]), finalSha256=sha(final[p])))
inherited = preservation['exactInheritedFinalOperations']
assert len(inherited) == 35
assert all(final[p] == old_final[p] for p in inherited if p != bridge)
assert sha(final[replay]) == '83c7c738fb00ad0a9c7de72cec6da14510dbc76f140c136563e31b0341c60aec'
assert final[replay].decode().count('.sleep(') == 21
for row in staged['blocks']:
    # Original block hashes have already been sealed in staged metadata. Complete-file
    # type-only equality proves their bytes survive, except reviewed renamed type text.
    assert row['actualUniqueOccurrence'] is True
assert staged['waitInventory'] == dict(bridge=15, its=12, total=27, directPreviousScratchSites=26)
protected = {}
for p, wanted in preservation['protectedReadonlySource'].items():
    b = (ROOT / p).read_bytes()
    assert sha(b) == wanted
    protected[p] = (b, stat.S_IMODE((ROOT / p).stat().st_mode))

for tree_name, tree in [('incoming', incoming), ('candidates', final)]:
    for p in operations:
        if tree[p] is not None:
            target = OUT / tree_name / p
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(tree[p])
            target.chmod(modes[p] if modes[p] is not None else 0o644)
(OUT / 'final-from-incoming.patch').write_bytes(patch)
(OUT / 'actual-to-prospective-replay.patch').write_bytes(diff({replay: actual[replay]}, {replay: incoming[replay]}))
(OUT / 'prior-final-to-current-final.patch').write_bytes(diff(
    {bridge: old_final[bridge]}, {bridge: final[bridge]}))
(OUT / 'predecessor-corrections-review.patch').write_bytes(diff(
    {bridge: old_incoming[bridge], fixture: old_incoming[fixture]},
    {bridge: actual[bridge], fixture: actual[fixture]}))
# A canonical diff has the +63 hunk-header correction; the accepted patch stays byte-identical.
canonical_patch = diff({p: incoming[p] for p in operations}, {p: final[p] for p in operations})
assert patch.count(b'@@ -1678,7 +1678,7 @@\n') == 1
assert canonical_patch == patch.replace(b'@@ -1678,7 +1678,7 @@\n', b'@@ -1741,7 +1741,7 @@\n')
(OUT / 'final-from-incoming-rebased.patch').write_bytes(canonical_patch)

rows, named = [], []
for p in sorted(actual):
    real = ROOT / p
    assert (real.read_bytes() if real.exists() else None) == actual[p], ('NAMED_SOURCE_DRIFT', p)
    assert (stat.S_IMODE(real.stat().st_mode) if real.exists() else None) == modes[p]
    entry = dict(path=p, actualSha256=sha(actual[p]), prospectiveIncomingSha256=sha(incoming[p]),
        finalSha256=sha(final[p]), actualMode=oct(modes[p]) if modes[p] is not None else None,
        incomingMode=oct(modes[p]) if modes[p] is not None else None,
        finalMode=oct(modes[p] if modes[p] is not None else 0o644) if final[p] is not None else None,
        finalWrite=p in operations, futureInput=p == replay)
    named.append(entry)
    if p in operations:
        entry = dict(entry)
        entry['operation'] = 'delete' if final[p] is None else 'add' if incoming[p] is None else 'edit'
        rows.append(entry)
for p, (b, mode) in protected.items():
    assert (ROOT / p).read_bytes() == b
    assert stat.S_IMODE((ROOT / p).stat().st_mode) == mode

manifest = dict(kind='OFFTREE_FINAL_FOLD_38_OPERATION_CURRENT_PREDECESSOR_REFRESH',
    status='SOURCE_ONLY_REVIEWABLE_NATIVE_AND_REPLAY_INTEGRATION_PENDING',
    sourceApplied=False, compilerTestsRuntimeFormattingExecuted=False,
    incomingAlreadyAppliedExceptExplicitFutureReplay=True,
    oldGsmPrepWaitDeltasReapplied=False, finalPairBatonGranted=False,
    files=rows, namedSourceBindings=named, protectedReadOnlySourceBindings={p:sha(b) for p,(b,_) in protected.items()},
    namedSourcesAndModesUnchanged=True, globalSourceStabilityClaimed=False,
    finalOperationCount=38, exactHunkCount=len(hunks), unresolvedHunks=[],
    noFuzzOrRelaxedContext=True, inputArtifacts=inputs,
    composerSha256=sha(Path(__file__).read_bytes()),
    patchSha256={p.name:sha(p.read_bytes()) for p in sorted(OUT.glob('*.patch'))},
    budgetCeilingUsd=500, aggregateSpend='UNKNOWN')
emit('manifest.json', manifest)
emit('exact-hunks.json', hunks)
emit('refresh-delta.json', dict(previousManifestSha256=sha((PRIOR/'manifest.json').read_bytes()),
    actualVsPreviousIncomingDifferences=changed,
    prospectiveVsPreviousIncomingDifferences=[bridge, fixture],
    finalVsPreviousFinalDifferences=[bridge, fixture],
    finalWriteOutputsChanged=[bridge], protectedNonwriteFixture=fixture,
    finalPatchByteIdentical=True, previous35InheritedFinalOutputsExactExceptBridge=True,
    exactInheritedFinalOutputsUnchanged=34, remainingInheritedOutputOnlyApprovedBridgePredecessorCorrection=True,
    allOther54FullCompositionOutputsExact=True, bridgeCorrectionBytesPreserved=True,
    fixtureCorrectionBytesPreserved=True, onlyFutureInput=replay,
    finalCanonicalDiffChangesOnlyBridgeFinalHunkHeader=True))
emit('static-preservation.json', dict(scope='SOURCE_BYTES_ONLY_NO_NATIVE_QA_VERDICT',
    finalCoreTransportAuthorityClockConsumerCompatibilityAndTestAccessorOutputsExactToPriorCleanPacket=True,
    priorCleanReview= str((REC/'fold-composed-style03-qa-review.md').relative_to(ROOT)),
    threeConsumerSwitchesFourRetirementsAnd21PortsUnchanged=True,
    exactInheritedFinalOutputs=[p for p in inherited if p != bridge],
    wholeFileTypeOnlyPorts=type_only, bridgeRollbackBlockSha256=sha(block),
    bridgeRollbackBlockUnmodifiedByTypePorts=True,
    original26WaitBlocksCarrySameSourceSemantics=True,
    added27thWaitOnlyApprovedSourceIsomorphismNotDirect234IrqProof=True,
    waitInventory=staged['waitInventory'],
    fixtureNotInFinalWriteSet=True, correctedFixtureSha256=sha(final[fixture]),
    prospectiveReplaySha256=sha(incoming[replay]), finalReplaySha256=sha(final[replay]),
    replayDeliberateSleepCount=21, sourceApplication=False, nativeRuntimeProof=False,
    pending=['Actual Replay TEST001/B4 staged integration and required native proof',
        'Root reconciliation of active IT-S groups and remaining wait/runtime obligations',
        'Actual final FOLD application followed by formatter/compiler/static/focused checks',
        'Bind actual formatted Replay into existing reader before consecutive composed B4 pair',
        'Final integrated whole check and existing independent product QA gates',
        'RT copyback remains held until its existing fixture failures are resolved; final root grep remains owed']))
print(json.dumps(dict(status=manifest['status'], finalOperations=len(rows), hunks=len(hunks),
    nonzeroExactOffsets=[h for h in hunks if h['lineOffset']],
    manifestSha256=sha((OUT/'manifest.json').read_bytes()),
    bridgeFinalSha256=sha(final[bridge]), finalPatchSha256=sha(patch))))
