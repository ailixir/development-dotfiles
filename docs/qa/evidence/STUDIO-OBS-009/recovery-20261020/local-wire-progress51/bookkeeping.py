"""Finite document append and mechanical scope verification; no product execution."""
from pathlib import Path
import difflib
import hashlib
import json
import re
import stat

root = Path.cwd()
base_rel = Path('docs/qa/evidence/STUDIO-OBS-009/recovery-20261020')
owned = root / base_rel / 'local-wire-progress51'
story_rel = Path('docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md')
story = root / story_rel
snapshot = root / base_rel / 'task-eligibility53-inputs/STUDIO-OBS-009.before-progress51.public.md'
expected = 'a559b4d3c3c6807dbe3fcd3b32dda6f7556f4c33c2ea4319b2e7068cceab3d83'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def metadata(path):
    data = path.read_bytes()
    return {'path': str(path.relative_to(root)), 'sha256': digest(data), 'bytes': len(data),
            'mode': format(stat.S_IMODE(path.stat().st_mode), '04o')}

def save_json(name, payload):
    (owned / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def sections(data):
    matches = list(re.finditer(rb'^## [^\n]+\n', data, re.MULTILINE))
    items = [('PREAMBLE', data[:matches[0].start()])]
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(data)
        items.append((match.group().decode().strip(), data[match.start():end]))
    return items

before = story.read_bytes()
before_mode = stat.S_IMODE(story.stat().st_mode)
assert digest(before) == expected and len(before) == 256760 and before_mode == 0o644
assert snapshot.read_bytes() == before
assert before.endswith(b'\n') and b'| 2026-10-21 | 0.3.30 |' in before
assert b'| 2026-10-21 | 0.3.31 |' not in before
before_sections = sections(before)
markers = re.findall(rb'^[ \t]*- \[[ xX]\][^\n]*(?:\n|$)', before, re.MULTILINE)
assert len(markers) == 37
status = re.findall(rb'^\| Status \|[^\n]*\n', before, re.MULTILINE)
assert status == [b'| Status | **InProgress** |\n']

evidence_specs = [
    ('benchmark-wire-lint-actual50-independent-review/manifest.json', '3a97d674f3ef4255a2c0dd4489b4781b7835b1acc1d7cb3888f5a93591b63d7b', 1133),
    ('benchmark-wire-lint-actual-adoption47/receipt.json', '9d0c2a99c7f464e873054cb9113f71186a38fbde8aa6093b91799725f114ed5c', 11483),
    ('benchmark-corpus-io-execution06/lint-successor48/corpus48-root-receipt.json', '706b889be3bf5a659e7ecf790ab0dc4401e6b088069799ccd70c3895bbeeda98', 9962),
    ('benchmark-wire-lint-proof49-execution/receipt.json', '13405c1bbd04f87d105470ee4ed1e07f2b209266757d118e2763a4742e372572', 6633),
    ('benchmark-wire-lint-proof49-execution/manifest.json', '1fa26cee7ee45c3740b829637ddcb02bb3e731c09c5a199f8583634b083bf93a', 23902),
]
evidence = []
for relative, sha, size in evidence_specs:
    item = metadata(root / base_rel / relative)
    assert item['sha256'] == sha and item['bytes'] == size
    evidence.append(item)
qa_manifest = json.loads((root / base_rel / evidence_specs[0][0]).read_text())
assert qa_manifest['verdict'] == 'LOCAL_WIRE_CAPTURE_LINT_FIX_ADOPTION_CORPUS_AND_AFFECTED_PROOF_ACCEPTED'
assert qa_manifest['findingCount'] == 0
for ref in qa_manifest['files']:
    item = metadata(root / base_rel / 'benchmark-wire-lint-actual50-independent-review' / ref['path'])
    assert all(item[key] == ref[key] for key in ('sha256', 'bytes', 'mode'))
    evidence.append(item)

addition = (owned / 'append-record.md').read_bytes()
row = (owned / 'changelog-row.md').read_bytes()
assert addition.startswith(b'### 2026-10-21 UTC') and addition.endswith(b'\n')
assert not re.search(rb'^## ', addition, re.MULTILINE)
assert not re.search(rb'^[ \t]*- \[[ xX]\]', addition, re.MULTILINE)
assert row.count(b'\n') == 1 and row.startswith(b'| 2026-10-21 | 0.3.31 |')
qa_offset = before.index(b'## QA Results\n')
after = before[:qa_offset] + addition + b'\n' + before[qa_offset:] + row
after_sections = sections(after)
assert [name for name, _ in before_sections] == [name for name, _ in after_sections]
comparisons = []
for (name, old), (_, new) in zip(before_sections, after_sections):
    if name == '## Dev Agent Record':
        assert new == old + addition + b'\n'
    elif name == '## Change Log':
        assert new == old + row
    else:
        assert new == old
    comparisons.append({'section': name, 'beforeSha256': digest(old), 'beforeBytes': len(old),
                        'afterSha256': digest(new), 'afterBytes': len(new), 'exact': old == new,
                        'oldPrefixPreserved': new.startswith(old)})
assert re.findall(rb'^[ \t]*- \[[ xX]\][^\n]*(?:\n|$)', after, re.MULTILINE) == markers
assert re.findall(rb'^\| Status \|[^\n]*\n', after, re.MULTILINE) == status
inverse = after[:qa_offset] + after[qa_offset + len(addition) + 1:-len(row)]
assert inverse == before
assert story.read_bytes() == before and stat.S_IMODE(story.stat().st_mode) == before_mode, 'STOP: concurrent story drift'
story.write_bytes(after)
assert story.read_bytes() == after and stat.S_IMODE(story.stat().st_mode) == before_mode
patch = ''.join(difflib.unified_diff(before.decode().splitlines(keepends=True), after.decode().splitlines(keepends=True),
                                   fromfile='a/' + str(story_rel), tofile='b/' + str(story_rel))).encode()
(owned / 'story.patch').write_bytes(patch)
save_json('receipt.json', {
    'kind': 'STUDIO_OBS_009_LOCAL_WIRE_PROGRESS51_BOOKKEEPING',
    'bookkeepingStatus': 'MECHANICAL_SCOPE_VERIFIED_PENDING_ROOT_BOOKKEEPING_REVIEW',
    'storyPath': str(story_rel),
    'before': {'sha256': expected, 'bytes': len(before), 'mode': '0644', 'adminVersion': '0.3.30'},
    'after': {**metadata(story), 'adminVersion': '0.3.31'},
    'immutableBeforeSnapshot': metadata(snapshot),
    'appendOnlySections': ['## Dev Agent Record', '## Change Log'],
    'sectionComparisons': comparisons,
    'checkboxLines': {'beforeCount': 37, 'afterCount': 37, 'beforeSha256': digest(b''.join(markers)),
                      'afterSha256': digest(b''.join(markers)), 'exactLinesAndOrdering': True},
    'statusLineExact': True, 'status': 'InProgress', 'oldDevAndChangeLogPrefixesExact': True,
    'inverseReconstructionExact': True, 'concurrentPrewriteDriftCheckPassed': True,
    'exactPatch': metadata(owned / 'story.patch'), 'acceptedEvidenceReferences': evidence,
    'localFileListScope': 'Exactly five wire-unit paths under the new Dev Agent Record; existing final T6 File List unchanged; no 15-file aggregation.',
    'productSourceReadsOrWrites': False, 'privateBodiesRead': False, 'productCommandsOrTestsExecuted': False,
    'otherStoryWrites': False, 'lifecycleOrGateChange': False, 'rootBookkeepingApprovalClaimed': False,
    'acceptedTupleFromExistingEvidenceOnly': {'sourceDigest': 'df860ccc1c6479e62320328b65f5e5bcaa1c431f863c543b7c07005b5654f8d2',
        'sourceRows': 1814, 'distDigest': 'e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1', 'distRows': 238},
    'sourceProfileMembershipNotRecomputed': True,
    'openStories': {'STUDIO-OBS-009': 'InProgress', 'STUDIO-OBS-010': 'InProgress'},
})
files = ['append-record.md', 'changelog-row.md', 'bookkeeping.py', 'story.patch', 'receipt.json']
save_json('manifest.json', {'kind': 'LOCAL_WIRE_PROGRESS51_ARTIFACT_SEAL',
    'canonicalStoryAfter': metadata(story),
    'files': [{**metadata(owned / name), 'path': name} for name in files],
    'scope': 'Dev Agent Record and Change Log appends only; pending root bookkeeping review'})
files.append('manifest.json')
(owned / 'SHA256SUMS').write_text(''.join(digest((owned / name).read_bytes()) + '  ' + name + '\n' for name in files))
print(json.dumps({'after': metadata(story), 'adminVersion': '0.3.31', 'markerCount': len(markers),
                  'protectedSectionsExact': True, 'manifest': metadata(owned / 'manifest.json'),
                  'seal': metadata(owned / 'SHA256SUMS')}))
