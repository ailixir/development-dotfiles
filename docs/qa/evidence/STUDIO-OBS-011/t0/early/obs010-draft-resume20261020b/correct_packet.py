"""One-shot documentary successor; writes only this new packet, never shared targets."""
from pathlib import Path
from datetime import datetime, timezone
import difflib
import hashlib
import json
import re

REPO = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
OLD = 'docs/qa/evidence/STUDIO-OBS-011/t0/early/obs010-draft-resume20261020'
NEW = OLD + 'b'
ROOT = REPO / NEW
PM = OLD + '-pm-review-r2'
QA = OLD + '-qa-review'
PLAN = '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/resume-20261020/coordinator-plan.json'
assert Path(__file__).resolve() == ROOT / 'correct_packet.py'
assert [p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file()] == ['correct_packet.py'], 'One-shot: refuse to overwrite a captured packet'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def raw(path):
    return (REPO / path).read_bytes()

def pin(path):
    data = raw(path)
    return {'path': path, 'sha256': sha(data), 'bytes': len(data)}

def put(path, data):
    dest = ROOT / path
    assert dest.resolve().is_relative_to(ROOT)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data if isinstance(data, bytes) else data.encode())

def putjson(path, data):
    put(path, json.dumps(data, indent=2, ensure_ascii=False) + '\n')

def verify_seal(folder, expected):
    assert sha(raw(folder + '/manifest.json')) == expected
    rows = raw(folder + '/SHA256SUMS').decode().splitlines()
    for line in rows:
        digest, path = line.split(None, 1)
        path = path.lstrip('*')
        full = path if path.startswith('docs/') else folder + '/' + path
        assert sha(raw(full)) == digest, full
    return {'path': folder, 'manifestSha256': expected, 'SHA256SUMSSha256': sha(raw(folder + '/SHA256SUMS')), 'checksumRowsVerified': len(rows)}

sealed = [verify_seal(p, digest) for p, digest in [
    (OLD, 'a8c83522c8f22c4e5d5cde27278d0084459d22030075f1270b25bad4f224a3b1'),
    (PM, 'eaee5ca0e9968e7b116b223ce18147226680e148d3ab95f076ae8d810e17be75'),
    (QA, 'ca4df79a360902a11db42d0d251d268bd71ad4fd700e4864f04ce1faff2ed3bd')]]
old = json.loads(raw(OLD + '/manifest.json'))
fixed = [p for p in old['inputs'] if p['path'] != PLAN]
assert len(fixed) == 46
for p in fixed:
    assert pin(p['path']) == p, p['path']

# Read the mutable plan exactly once. Its snapshot is historical context only.
captured_at = datetime.now(timezone.utc).isoformat()
plan_bytes = raw(PLAN)
snapshot_path = NEW + '/context/coordinator-plan.historical.json'
put('context/coordinator-plan.historical.json', plan_bytes)
context = {
    'classification': 'HISTORICAL_CONTEXT_ONLY_NON_NORMATIVE',
    'origin': PLAN, 'capturedAtUtc': captured_at, 'snapshot': snapshot_path,
    'rawSha256': sha(plan_bytes), 'bytes': len(plan_bytes),
    'readCountThisCorrection': 1, 'contentConfersAuthority': False,
    'liveOriginByteStabilityRequiredForApproval': False,
    'originalCapturedPlanHistoricalProvenance': next(p for p in old['inputs'] if p['path'] == PLAN),
    'oldBytesAvailableOrReconstructed': False,
    'oldHashClaimedCurrent': False,
    'interpretation': 'PM recorded mutable coordinator progress drift, not a product defect. Only this immutable snapshot is sealed; future live-plan edits neither invalidate fixed product/document bases nor grant authority.'}

exclude = {'manifest.json', 'SHA256SUMS', 'prepare.py', 'receipt.md', 'design.md', 'applicability.json'}
for src in (REPO / OLD).rglob('*'):
    if src.is_file():
        rel = src.relative_to(REPO / OLD).as_posix()
        if rel not in exclude:
            data = src.read_bytes()
            if src.suffix in {'.md', '.json', '.patch'}:
                data = data.replace(OLD.encode(), NEW.encode())
            put(rel, data)

locators = [
    {'path': 'docs/qa/evidence/STUDIO-OBS-009/execution-20261018/b/receipt.md',
     'section': '6. ACs covered (local half) and owed', 'line': 112, 'coverage': 'R1 a–c', 'run': 'obs009-b-04'},
    {'path': 'docs/qa/evidence/STUDIO-OBS-009/execution-20261018/b/w3/receipt.md',
     'section': '6. ACs covered and owed', 'line': 61, 'coverage': 'R1 d', 'run': 'obs009-b-w3-04'},
    {'path': 'docs/qa/evidence/STUDIO-OBS-009/execution-20261018/w1.5/ruling-part2.md',
     'section': '1.4 Tests for lane B (`GuidedEvidencePendingAppendIT`, the PR-BE baton)', 'line': 68, 'coverage': 'R1 rule §1.4'}]
for loc in locators:
    lines = raw(loc['path']).decode().splitlines()
    assert lines[loc['line'] - 1].lstrip('# ') == loc['section']
    if 'run' in loc:
        assert loc['run'] in '\n'.join(lines)
    loc.update({'sha256': sha(raw(loc['path'])), 'bytes': len(raw(loc['path']))})

ready_rel = 'preview/docs/qa/evidence/studio-observed-authoring/release-readiness.md'
ready = (ROOT / ready_rel).read_text()
old_row = next(line for line in ready.splitlines() if line.startswith('| KL-015-R1 |'))
cells = old_row.split('|')
assert len(cells) == 7
assert 'pending independent credit of 009 R1 a–d' in cells[3] and 'Receipts alone are not closure.' in cells[3]
citations = '; '.join('`' + loc['path'] + ':' + str(loc['line']) + '` (' + loc['coverage'] + ('; run `' + loc['run'] + '`' if 'run' in loc else '') + ')' for loc in locators)
cells[4] = cells[4].rstrip() + '; ' + citations + ' '
new_row = '|'.join(cells)
put(ready_rel, ready.replace(old_row, new_row))
release = json.loads((ROOT / 'release-evidence-map.json').read_text())
entry = next(row for row in release if row['gate'] == 'KL-015-R1')
entry['sourcePaths'] += [loc['path'] for loc in locators]
entry['sourceLocators'] = locators
entry['creditState'] = 'PENDING_INDEPENDENT_OBS009_QA_G9_R1_A_D; receipts alone do not close KL-015-R1'
putjson('release-evidence-map.json', release)

# Refresh only changed patch bytes, using actual fixed public bases; no application.
targets = []
for original in old['targets']:
    row = json.loads(json.dumps(original).replace(OLD, NEW))
    target = REPO / row['target']
    assert target.exists() == row['baseExists']
    base = target.read_bytes() if target.exists() else b''
    assert (sha(base) if target.exists() else None) == row['baseSha256']
    assert len(base) == row['baseBytes']
    output = raw(row['preview'])
    patch = ''.join(difflib.unified_diff(base.decode().splitlines(keepends=True), output.decode().splitlines(keepends=True), fromfile=row['diffFrom'], tofile='b/' + row['target'])).encode()
    put(Path(row['patch']).relative_to(NEW).as_posix(), patch)
    row.update(outputSha256=sha(output), outputBytes=len(output), patchSha256=sha(patch))
    targets.append(row)
put('patches/all-documentation.patch', b''.join(raw(row['patch']) for row in targets))

# Bound comparison, not a repeated broad audit: exact objects and allowed path substitutions.
assert raw(NEW + '/architecture-obligations.json') == raw(OLD + '/architecture-obligations.json')
architecture = json.loads(raw(NEW + '/architecture-obligations.json'))
assert architecture['count'] == len(architecture['obligations']) == 21
trace = json.loads(raw(NEW + '/traceability.json'))
assert len(trace['RBR']) == 19
assert raw(NEW + '/traceability.json').replace(NEW.encode(), OLD.encode()) == raw(OLD + '/traceability.json')
staging = json.loads(raw(NEW + '/10.34-dispositions.json'))
assert len(staging['originalACs']) == 33
assert raw(NEW + '/10.34-dispositions.json').replace(NEW.encode(), OLD.encode()) == raw(OLD + '/10.34-dispositions.json')
assert len(release) == 70
normalized_release = json.loads(json.dumps(release).replace(NEW, OLD))
before_release = json.loads(raw(OLD + '/release-evidence-map.json'))
for now, before in zip(normalized_release, before_release):
    if now['gate'] != 'KL-015-R1':
        assert now == before
    else:
        assert now['sourcePaths'][:len(before['sourcePaths'])] == before['sourcePaths']
for sheet in (ROOT / 'sheets').iterdir():
    assert sheet.read_bytes() == raw(OLD + '/sheets/' + sheet.name)
assert raw(NEW + '/preview/docs/stories/10.34.story.md').startswith(raw('docs/stories/10.34.story.md'))
ready_now = raw(NEW + '/' + ready_rel).decode()
ledger_rows = [line for line in ready_now.splitlines() if line.startswith('|')][2:]
assert len(ledger_rows) == 70 and all(len(line.split('|')) == 7 for line in ledger_rows)
assert new_row.split('|')[1:4] == old_row.split('|')[1:4]

def reconstruct(base, patch):
    old_lines = base.decode().splitlines(keepends=True)
    lines = patch.decode().splitlines(keepends=True)
    out, pos, i = [], 0, 2
    while i < len(lines):
        match = re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n', lines[i])
        assert match, lines[i]
        start = int(match[1]); count = int(match[2] or 1)
        offset = start - 1 if count else start
        out.extend(old_lines[pos:offset]); pos = offset; i += 1
        old_count = new_count = 0
        while i < len(lines) and not lines[i].startswith('@@ '):
            mark, content = lines[i][0], lines[i][1:]
            if mark in ' -':
                assert old_lines[pos] == content
                pos += 1; old_count += 1
            if mark in ' +':
                out.append(content); new_count += 1
            assert mark in ' +-'
            i += 1
        assert old_count == count and new_count == int(match[4] or 1)
    out.extend(old_lines[pos:])
    return ''.join(out).encode()

for row in targets:
    base = raw(row['target']) if row['baseExists'] else b''
    assert reconstruct(base, raw(row['patch'])) == raw(row['preview'])

put('design.md', f'''# STUDIO-OBS-010 narrow corrected successor

Atlas / aiox-analyst. Correct only PM010-R1-LANE-LOCATORS from `{PM}/review.md`, retaining all PM C01–C14 and independent QA conditions 1–10 at `{QA}/review.md`. Root adopts these conditions; this packet cannot approve itself or inherit independent acceptance for changed bytes.

Add the three exact public R1 lane/rule locators to the KL-015-R1 evidence cell and map; preserve its independent009 QA/G9 pending state. Refresh own-packet references and affected patch/output bindings only. Capture one historical coordinator-plan snapshot separately from normative inputs. The original plan hash remains historical provenance; old unavailable bytes are not reconstructed and live plan byte stability is no approval gate.

The predecessor, reviews/failures and all ancestors remain immutable and referenced. The original generator remains at `{OLD}/prepare.py`; it was not copied or run. `correct_packet.py` is a one-shot generator confined to this packet. No shared target application, product test/build, runtime/resource action, source window, network/provider/contact/pilot, lease, lifecycle or external grant is authorized.
''')
checks = {
    'kind': 'AFFECTED_DOCUMENTARY_AND_INTEGRITY_CHECKS_ONLY', 'checkedAtUtc': captured_at,
    'predecessorAndReviews': sealed, 'fixedPredecessorInputPinsVerified': 46,
    'planContext': context, 'targets': [{'target': row['target'], 'baseFreshAndUnmodified': True, 'inMemoryExactReconstruction': True, 'applicationPerformed': False} for row in targets],
    'laneLocatorsVerified': locators, 'KL015R1PendingStateUnchanged': True,
    'releaseRowShapeAndMapCount': 70, 'literalArchitectureObjectsUnchanged': 21,
    'RBRMappingsUnchangedExceptOwnPacketPaths': 19,
    'stagingDispositionsUnchangedExceptOwnPacketPath': 33,
    'pilotSheetsByteIdenticalAndStillEmptyOfObservations': True,
    'storyAppendPreservesEntireCurrentBasePrefix': True,
    'unaffectedSourceChecksReusedFrom': OLD + '/source-checks.md',
    'independentPriorChecksReusedFrom': [PM + '/integrity.json', QA + '/integrity.json'],
    'reuseLimit': 'Exact unchanged content or necessary own-packet path substitutions only. No broad source audit rerun, no new current independent review claimed, no ancestor-tree audit repeated.',
    'projectTestsRun': False, 'runtimeAuthorityGranted': False, 'lifecycleChanged': False}
putjson('applicability.json', checks)
changed = []
unchanged = []
for src in (REPO / OLD).rglob('*'):
    if src.is_file() and src.relative_to(REPO / OLD).as_posix() not in exclude:
        rel = src.relative_to(REPO / OLD).as_posix()
        (unchanged if src.read_bytes() == (ROOT / rel).read_bytes() else changed).append(rel)
putjson('correction-delta.json', {
    'kind': 'ONE_CURRENT_DOCUMENTATION_CORRECTION_DELTA', 'finding': 'PM010-R1-LANE-LOCATORS',
    'predecessor': sealed[0], 'reviewProvenance': sealed[1:],
    'retainedConditions': {'PM': {'path': PM + '/review.md', 'section': 'Complete retained conditions', 'ids': 'C01–C14', 'allAdopted': True}, 'QA': {'path': QA + '/review.md', 'section': 'Complete retained conditions', 'items': '1–10', 'allAdopted': True}},
    'beforeRow': old_row, 'afterRow': new_row, 'sourceLocators': locators,
    'substantiveChanges': ['Add three required R1 lane/rule locators to existing KL-015-R1 evidence cell and corresponding map entry; retain pending independent OBS009 QA/G9 R1 a–d credit.'],
    'necessaryMechanicalChanges': ['Refresh own-packet paths, affected exact patches/output hashes and evidence bindings.', 'Separate one immutable HISTORICAL/context-only plan snapshot from fixed normative inputs; preserve old plan hash as historical provenance only.'],
    'copiedPayloadsChanged': sorted(changed), 'copiedPayloadsByteIdentical': sorted(unchanged),
    'ancestorHistoriesCopied': False, 'originalGeneratorReference': pin(OLD + '/prepare.py'),
    'currentIndependentReview': 'PENDING root routes corrected documentary bytes',
    'applied': False, 'isVerdict': False, 'confersAuthority': False})
put('receipt.md', f'''# STUDIO-OBS-010 corrected documentary receipt

One unapplied corrected successor of `{OLD}`. PM010-R1-LANE-LOCATORS adds the exact R1 a–c receipt (§6, run obs009-b-04), R1 d receipt (§6, run obs009-b-w3-04) and ruling §1.4 to the KL-015-R1 row and release-evidence map. The known limit stays pending independent OBS009 QA/G9 R1 a–d credit; receipts alone do not close it. `correction-delta.json` records this single correction and necessary path/binding refreshes.

All PM C01–C14 and QA conditions 1–10 remain binding at their exact sealed review paths; prior review outcomes/failures and packets remain immutable. Changed bytes require bounded independent re-review. All 21 literal architecture objects, 19 RBR mappings, 70 release dispositions, 33 staging dispositions and empty pilot records survive unchanged except necessary own-packet paths and this row's evidence additions. No old criterion or task receives credit.

Current checks cover the affected row/map/patches, exact in-memory reconstruction, fixed input/base freshness and packet integrity. Prior selective source/audit conclusions are reused from the sealed predecessor/reviews, including the unchanged historical `source-checks.md`; they were not rerun or claimed newly independent. No ancestor histories were copied or audited again. Two existing target bases retain their hashes; three absent targets retain explicit /dev/null bases.

`context/coordinator-plan.historical.json` is a single immutable capture from `{PLAN}` at {captured_at}, raw SHA256 `{sha(plan_bytes)}`. It is HISTORICAL/context-only and gives no authority. The predecessor's original captured plan SHA256 `bf4059ed78e2e7d8f629551b16f7b95d08101a30bc8beb9385df3e3a8ba20ebb` remains historical provenance only; unavailable old bytes were not reconstructed, nor is that hash claimed current. Future live-plan byte stability is not an approval condition. Normative fixed inputs and target bases remain separately bound.

No patch application, project test/build, network/provider/contact/pilot, process/resource/private/protected-baseline/runtime-body/source-window/lease/lifecycle action or external grant occurred. Freeze/held closure, fresh backend check+JaCoCo before011 credit, final affected suites, actual pilot and formal PM/QA/devops completion remain owed. C8/GST stays parked, Live remains unchanged, user deferrals and all original tests/assertions/skips/timeouts remain; no accessibility work. USD500 shared ceiling remains; aggregate spend unavailable. Root owns later integration/lifecycle.

Manifest/output/checksum seals establish integrity only. SHA256SUMS excludes itself; manifest excludes itself and the checksum list from its output table.
''')

added_paths = [OLD + '/manifest.json', OLD + '/SHA256SUMS', OLD + '/prepare.py', PM + '/manifest.json', PM + '/review.md', PM + '/review.json', PM + '/integrity.json', PM + '/final-input-check.json', QA + '/manifest.json', QA + '/review.md', QA + '/findings.json', QA + '/integrity.json'] + [loc['path'] for loc in locators]
inputs = fixed + [pin(path) for path in added_paths if path not in {p['path'] for p in fixed}]
for p in inputs:
    assert pin(p['path']) == p
for row in targets:
    assert (REPO / row['target']).exists() == row['baseExists']
    if row['baseExists']:
        assert sha(raw(row['target'])) == row['baseSha256']
for item in sealed:
    verify_seal(item['path'], item['manifestSha256'])
outputs = [pin(p.relative_to(REPO).as_posix()) for p in sorted(ROOT.rglob('*')) if p.is_file()]
putjson('manifest.json', {
    'kind': 'STUDIO_OBS_010_MINIMAL_CORRECTED_DOCUMENTATION_SUCCESSOR', 'createdAtUtc': captured_at,
    'author': 'Atlas / aiox-analyst', 'exclusiveWriteRoot': NEW, 'predecessor': sealed[0],
    'reviewsRetainedWithoutApprovalTransfer': sealed[1:], 'findingCorrected': 'PM010-R1-LANE-LOCATORS',
    'applied': False, 'isVerdict': False, 'independentCurrentReview': 'PENDING root routes bounded corrected-byte review',
    'hashesAuthorizeSourceWindow': False, 'runtimeAuthorityGranted': False, 'lifecycleChanged': False,
    'targets': targets, 'inputs': inputs,
    'inputsScope': 'Fixed named public product/document inputs: byte freshness verified. Mutable coordinator origin excluded from normative inputs.',
    'historicalContextOnly': [context], 'outputs': outputs,
    'checksumSelfExclusion': 'SHA256SUMS excludes only itself; manifest excludes itself and checksum from its output table',
    'unaffectedChecks': 'Reuse exact sealed predecessor and independent reviews as historical source checks; current checks limited to affected documentary/integrity comparisons, no broad source audit or ancestor-tree audit.'})
payloads = sorted(p for p in ROOT.rglob('*') if p.is_file())
put('SHA256SUMS', ''.join(sha(p.read_bytes()) + '  ' + p.relative_to(ROOT).as_posix() + '\n' for p in payloads))
print(json.dumps({'packet': NEW, 'manifestSha256': sha(raw(NEW + '/manifest.json')), 'SHA256SUMSSha256': sha(raw(NEW + '/SHA256SUMS')), 'outputs': len(outputs), 'checksumRows': len(payloads), 'fixedInputPins': len(inputs), 'snapshotRawSha256': sha(plan_bytes)}))
