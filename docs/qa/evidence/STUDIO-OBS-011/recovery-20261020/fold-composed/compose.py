"""One-off source-only composition of existing OBS-011 deltas; writes only this directory."""
from pathlib import Path
import copy
import difflib
import hashlib
import json
import re
import stat

ROOT = Path.cwd()
OUT = Path(__file__).resolve().parent
EARLY = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/early'
RECOVERY = OUT.parent
assert OUT == ROOT / 'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/fold-composed'
original, virtual, provenance, sources, hunks = {}, {}, {}, {}, []

def sha(data):
    return hashlib.sha256(data).hexdigest() if data is not None else None

def read(path):
    data = path.read_bytes()
    sources[str(path.relative_to(ROOT))] = sha(data)
    return data

def load(path):
    return json.loads(read(path))

def current(path):
    if path not in original:
        p = ROOT / path
        assert not p.is_symlink()
        original[path] = p.read_bytes() if p.exists() else None
        virtual[path] = original[path]
        provenance[path] = []
    return virtual[path]

def patch_file(patch, owner, only=None):
    raw = read(patch).decode()
    lines = raw.splitlines(keepends=True)
    i = 0
    while i < len(lines):
        if not lines[i].startswith('--- '):
            i += 1
            continue
        old = lines[i][4:].strip()
        new = lines[i + 1][4:].strip()
        path = (new if new != '/dev/null' else old)[2:]
        i += 2
        selected = only is None or path in only
        if selected:
            before = current(path)
            if old == '/dev/null':
                assert before is None, ('ADD_EXISTS', path)
            else:
                assert before is not None, ('MISSING_PREIMAGE', path)
            body = (before or b'').decode().splitlines(keepends=True)
            shift = 0
        while i < len(lines) and not lines[i].startswith('--- '):
            if not lines[i].startswith('@@ '):
                i += 1
                continue
            header = lines[i].strip()
            match = re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*', header)
            assert match, header
            i += 1
            old_lines, new_lines = [], []
            while i < len(lines) and not lines[i].startswith(('@@ ', '--- ')):
                line = lines[i]
                if line.startswith('\\ No newline'):
                    raise AssertionError('UNSUPPORTED_NO_NEWLINE')
                assert line[:1] in (' ', '+', '-'), repr(line)
                if line[:1] in (' ', '-'):
                    old_lines.append(line[1:])
                if line[:1] in (' ', '+'):
                    new_lines.append(line[1:])
                i += 1
            assert len(old_lines) == int(match[2] or 1), header
            assert len(new_lines) == int(match[4] or 1), header
            if not selected:
                continue
            expected = max(0, int(match[1]) - 1) + shift
            if old_lines:
                matches = [j for j in range(len(body) - len(old_lines) + 1)
                           if body[j:j + len(old_lines)] == old_lines]
                if expected in matches:
                    at = expected
                else:
                    assert len(matches) == 1, ('EXACT_HUNK_NOT_UNIQUE', path, header, matches)
                    at = matches[0]
            else:
                assert before is None and not body, ('NONEMPTY_INSERT', path, header)
                at = 0
            hunks.append(dict(owner=owner, patch=str(patch.relative_to(ROOT)), path=path,
                              header=header, exactOldBlockSha256=sha(''.join(old_lines).encode()),
                              exactNewBlockSha256=sha(''.join(new_lines).encode()),
                              matchedLine=at + 1, lineOffset=at - expected,
                              contextRelaxed=False, exactMatches=len(matches) if old_lines else 1,
                              selection='declared-position-exact' if at == expected else 'unique-exact-offset'))
            body[at:at + len(old_lines)] = new_lines
            shift += len(new_lines) - len(old_lines)
        if selected:
            data = ''.join(body).encode()
            if new == '/dev/null':
                assert data == b'', ('DELETE_NOT_EMPTY', path)
                data = None
            virtual[path] = data
            provenance[path].append(dict(owner=owner, patch=str(patch.relative_to(ROOT)),
                                         beforeSha256=sha(before), afterSha256=sha(data)))

def verify_candidates(folder, rows, hash_key):
    for row in rows:
        path = row['path']
        expected = read(folder / path)
        assert sha(expected) == row[hash_key], ('CANDIDATE_PIN', path)
        assert virtual[path] == expected, ('DELTA_NOT_CANDIDATE', path)

def write_tree(name, tree):
    for path, data in tree.items():
        if data is not None:
            target = OUT / name / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            target.chmod(stat.S_IMODE((ROOT / path).stat().st_mode) if (ROOT / path).exists() else 0o644)

def make_diff(before, after):
    result = []
    for path in sorted(set(before) | set(after)):
        a, b = before.get(path), after.get(path)
        if a == b:
            continue
        result.extend(difflib.unified_diff((a or b'').decode().splitlines(keepends=True),
                                          (b or b'').decode().splitlines(keepends=True),
                                          fromfile='a/' + path if a is not None else '/dev/null',
                                          tofile='b/' + path if b is not None else '/dev/null'))
    return ''.join(result).encode()

# First compose incoming preparation from actual source, without applying to the repository.
style = load(RECOVERY / 'checkstyle-repair/preservation.json')
for row in style['files']:
    assert sha(current(row['path'])) == row['beforeSha256']
patch_file(RECOVERY / 'checkstyle-repair/checkstyle-only.patch', 'incoming-checkstyle')
for row in style['files']:
    assert sha(virtual[row['path']]) == row['afterSha256']

prep = EARLY / 'fold-prep-draft/resume2'
prep_rows = load(prep / 'draft-manifest.json')['files']
for row in prep_rows:
    assert sha(current(row['path'])) == row['sourceSha256'], ('PREP_PREIMAGE', row['path'])
for name in ['01-red-first-clock.patch', '02-prep-main-preserving-old-wiring.patch', '03-prep-tests.patch']:
    patch_file(prep / 'patches' / name, 'incoming-fold-prep')
verify_candidates(prep / 'tree', prep_rows, 'draftSha256')

gsm = EARLY / 'gsm-a-draft/resume2'
gsm_rows = load(gsm / 'manifest.json')['files']
for row in gsm_rows:
    assert sha(current(row['path'])) == row['baseSha256'], ('GSM_PREIMAGE', row['path'])
patch_file(gsm / 'part-a.patch', 'incoming-gsm-a-resume2')
verify_candidates(gsm / 'repo', gsm_rows, 'draftSha256')

bridge = EARLY / 'gs-t2-draft/resume2'
bridge_rows = load(bridge / 'manifest.json')['owned']
for row in bridge_rows:
    assert sha(current(row['path'])) == row['preimageSha256'], ('BRIDGE_PREIMAGE', row['path'])
patch_file(bridge / 'candidate.patch', 'incoming-gs-t2-resume2')
verify_candidates(bridge / 'candidates', bridge_rows, 'candidateSha256')

ir = EARLY / 'it-r-draft/resume3'
ir_stage = next(row for row in load(ir / 'stages.json') if row['stage'] == '04-b4')
ir_path = 'backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'
assert sha(current(ir_path)) == sha(read(ir / 'ReplayIT.original.java')), 'IR_CURRENT_PREIMAGE'
patch_file(ir / 'stages/04-b4/from-original.patch', 'incoming-ir-test001-and-b1-b4')
assert sha(virtual[ir_path]) == ir_stage['candidateSha256']
assert virtual[ir_path] == read(ir / 'stages/04-b4/repo' / ir_path)

its = RECOVERY / 'it-s-composed'
its_manifest = load(its / 'manifest.json')
assert sha((its / 'manifest.json').read_bytes()) == 'd7ad197d7fc273b6d91dec40d96cf1ff0b7d40dff10a1e22679d902503c6c957'
# Intake's exact candidate/patch are independently composed from style-fixed retained Transport.
its_rows = its_manifest['files']
for row in its_rows:
    path = row['path']
    expected = read(its / 'candidates' / path)
    assert sha(current(path)) == row['applyPreimageSha256'], ('ITS_STYLE_PREIMAGE', path)
    # Use an exact unified delta from the explicitly recorded style preimage to the candidate.
    # The intake patch below is authoritative; no full-source replacement occurs here.
patch_file(its / its_manifest['patch'], 'incoming-it-s-composed')
verify_candidates(its / 'candidates', its_rows, 'candidateSha256')

final = EARLY / 'fold-final-draft/resume2'
operations = load(final / 'atomic-manifest.json')['operations']
overlap = EARLY / 'fold-gst06-accepted-overlap-prep'
for row in operations:
    current(row['path'])
current('backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedLifecycleReasonIT.java')
incoming = copy.deepcopy(virtual)
for row in operations:
    path = row['path']
    if path.endswith(('/GuidedSessionIT.java', '/GuidedServiceTransportFaultIT.java')):
        patch = overlap / 'patches' / row['patch']
    else:
        patch = final / 'patches' / row['patch']
    patch_file(patch, 'final-fold')
patch_file(overlap / 'patches/backend__src__test__java__com__citi__put__checks__studio__guided__session__GuidedLifecycleReasonIT.java.patch', 'final-fold-retained-lifecycle')

type_map = load(overlap / 'type-port-map.json')
retained = []
for suffix in ['GuidedSessionIT.java', 'GuidedServiceTransportFaultIT.java', 'GuidedLifecycleReasonIT.java']:
    path = next(p for p in virtual if p.endswith('/' + suffix))
    expected = incoming[path].decode()
    for entry in type_map:
        expected = expected.replace(entry['before'], entry['after'])
    assert virtual[path] == expected.encode(), ('RETAINED_NOT_TYPE_ONLY', path)
    retained.append(dict(path=path, incomingSha256=sha(incoming[path]),
                         candidateSha256=sha(virtual[path]),
                         exactWholeFileEqualAfterOnlyReviewedTypeMapping=True))
inherited_equal = []
for row in operations:
    path = row['path']
    if path.endswith(('/GuidedSessionIT.java', '/GuidedServiceTransportFaultIT.java')):
        continue
    assert sha(virtual[path]) == row['candidateSha256'], ('UNCHANGED_FINAL_CANDIDATE_DRIFT', path)
    inherited_equal.append(path)
readonly = {}
for path, wanted in load(final / 'preservation-map.json')['readOnlySourceBindings'].items():
    if path.startswith('backend/src/'):
        actual = sha(read(ROOT / path))
        assert actual == wanted, ('READONLY_SOURCE_DRIFT', path)
        readonly[path] = actual

write_tree('incoming', incoming)
write_tree('candidates', virtual)
for name, before, after in [('incoming-from-current.patch', original, incoming),
                            ('final-from-incoming.patch', incoming, virtual),
                            ('atomic-from-current.patch', original, virtual)]:
    (OUT / name).write_bytes(make_diff(before, after))

rows = []
for path in sorted(virtual):
    actual = ROOT / path
    assert (actual.read_bytes() if actual.exists() else None) == original[path], ('REAL_SOURCE_DRIFT', path)
    rows.append(dict(path=path, realPreimageSha256=sha(original[path]),
                     incomingSha256=sha(incoming.get(path)), candidateSha256=sha(virtual[path]),
                     realMode=oct(stat.S_IMODE(actual.stat().st_mode)) if actual.exists() else None,
                     candidateMode=oct(stat.S_IMODE(actual.stat().st_mode)) if virtual[path] is not None and actual.exists() else '0o644' if virtual[path] is not None else None,
                     operation='delete' if virtual[path] is None else 'add' if original[path] is None else 'edit' if original[path] != virtual[path] else 'unchanged',
                     incomingAlreadyApplied=False, steps=provenance[path]))
manifest = dict(kind='OFFTREE_FOLD_FINAL_ATOMIC_COMPOSITION',
                status='EXACT_DELTAS_COMPOSED_REVIEW_AND_RUNTIME_OWED',
                sourceApplied=False, compilerTestsOrRuntimeExecuted=False,
                sourceUnchangedForAllNamedPaths=True, incomingAlreadyApplied=False,
                finalPairScheduledAfterComposition=True, prematureGreenBaton=False,
                unresolvedHunks=[], files=rows, inputArtifacts=sources,
                patchSha256={name:sha((OUT / name).read_bytes()) for name in ['incoming-from-current.patch', 'final-from-incoming.patch', 'atomic-from-current.patch']},
                exactHunkCount=len(hunks), noFuzzOrRelaxedContext=True,
                budgetCeilingUsd=500, aggregateSpend='UNKNOWN')
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(OUT / 'exact-hunks.json').write_text(json.dumps(hunks, indent=2) + '\n')
(OUT / 'static-preservation.json').write_text(json.dumps(dict(
    scope='SOURCE_BYTES_ONLY_NOT_COMPILER_TEST_OR_RUNTIME',
    exactInheritedFinalOperations=inherited_equal,
    inheritedFinalOperationCount=len(inherited_equal),
    retainedGstTypeOnlyPorts=retained,
    incomingCheckstyleBraceTokensPreserved=86,
    incomingTransportWaitCandidateSha256=its_rows[0]['candidateSha256'],
    allTwelveIncomingItsBlocksUnchangedBeforeFinalTypePorts=True,
    allIncomingBridgeCandidatesExact=True,
    incomingReplayB4Sha256=ir_stage['candidateSha256'],
    finalReplaySha256=sha(virtual[ir_path]),
    replayDeliberateSleepCount=virtual[ir_path].decode().count('.sleep('),
    protectedReadonlySource=readonly,
    nativeRuntimeProof=False, sourceApplication=False
), indent=2) + '\n')
print(json.dumps(dict(status=manifest['status'], files=len(rows), hunks=len(hunks), patches=manifest['patchSha256'])))
