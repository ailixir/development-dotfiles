"""Independent text/hash checks only; no product imports or source-language parser."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[6]
BASE = ROOT / 'docs/qa/evidence/STUDIO-OBS-011'
OUT = BASE / 'recovery-20261020/required-cleanup-qa'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read(path):
    return (ROOT / path).read_bytes()

def digest(path):
    return sha(read(path))

def reconstruct(patch):
    lines = patch.decode().splitlines(keepends=True)
    outputs = {}
    i = 0
    while i < len(lines):
        assert lines[i].startswith('--- a/'), (i, lines[i])
        name = lines[i][6:].rstrip('\n')
        assert lines[i+1] == '+++ b/' + name + '\n'
        original = read(name).decode().splitlines(keepends=True)
        i += 2
        pos = 0
        result = []
        while i < len(lines) and not lines[i].startswith('--- a/'):
            header = re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[^\n]*\n', lines[i])
            assert header, (name, lines[i])
            old_start, old_count, new_start, new_count = [int(x) if x is not None else 1 for x in header.groups()]
            start = old_start - 1 if old_count else old_start
            assert start >= pos
            result.extend(original[pos:start])
            pos = start
            assert len(result) == (new_start - 1 if new_count else new_start), (name, header.groups(), len(result))
            i += 1
            consumed = produced = 0
            while i < len(lines) and not lines[i].startswith(('@@ ', '--- a/')):
                line = lines[i]
                assert line[0] in ' +-'
                if line[0] in ' -':
                    assert original[pos] == line[1:], (name, pos+1)
                    pos += 1
                    consumed += 1
                if line[0] in ' +':
                    result.append(line[1:])
                    produced += 1
                i += 1
            assert (consumed, produced) == (old_count, new_count), name
        result.extend(original[pos:])
        assert name not in outputs
        outputs[name] = ''.join(result).encode()
    return outputs

packets = [
    ('left-required-current', 'left-required.patch', 'files', 'patchSha256', 'repo'),
    ('frontend-required-current', 'required-frontend.patch', 'paths', 'combinedPatchSha256', 'repo'),
    ('documentation-required-current', 'required-documentation.patch', 'paths', 'patchSha256', 'preview'),
]
all_outputs = {}
evidence = {'kind':'INDEPENDENT_SOURCE_ONLY_TEXT_RECONSTRUCTION', 'productWrites':False,
            'runtimeExecuted':False, 'sourceLanguageParsersExecuted':False, 'packets':[], 'checks':{}}
for directory, patchname, filekey, hashkey, preview in packets:
    folder = BASE / 'recovery-20261020' / directory
    manifest_bytes = (folder / 'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    patch = (folder / patchname).read_bytes()
    assert sha(patch) == manifest[hashkey]
    outputs = reconstruct(patch)
    assert list(outputs) == [f['path'] for f in manifest[filekey]]
    files = []
    for entry in manifest[filekey]:
        name = entry['path']
        assert digest(name) == entry['beforeSha256']
        assert sha(outputs[name]) == entry['afterSha256']
        if directory == 'left-required-current':
            inherited = BASE / 't0/early/left-main-draft/repo' / name
            text = read(name).decode()
            for edit in entry['edits']:
                assert text.count(edit['before']) == 1, name
                text = text.replace(edit['before'], edit['after'], 1)
            assert text.encode() == outputs[name]
        elif directory == 'frontend-required-current':
            inherited = BASE / 't0/early/frontend-draft/resume2/repo' / name
            assert digest(entry['inheritedPatch']) == entry['patchSha256']
            assert reconstruct(read(entry['inheritedPatch']))[name] == outputs[name]
        else:
            inherited = BASE / 't0/early/engineering-doc-draft/resume2/preview' / name
        inherited_bytes = inherited.read_bytes()
        if directory == 'documentation-required-current' and entry['supplementalDatedNote']:
            assert sha(inherited_bytes) == entry['inheritedReviewedPreviewSha256']
            assert outputs[name].startswith(inherited_bytes)
            assert outputs[name][len(inherited_bytes):].startswith(b'\n\n## 8. Current integration disposition - 2026-10-20\n')
        else:
            assert outputs[name] == inherited_bytes
        if directory != 'left-required-current':
            assert (folder / preview / name).read_bytes() == outputs[name]
        assert name not in all_outputs
        all_outputs[name] = outputs[name]
        files.append({'path':name, 'beforeSha256':digest(name), 'afterSha256':sha(outputs[name]),
                      'exactCurrentPreimage':True, 'strictPatchReconstruction':True,
                      'inheritedReviewedBytes':True})
    evidence['packets'].append({'directory':directory,'manifestSha256':sha(manifest_bytes),
                                'patchSha256':sha(patch),'files':files})

# Preserve actual floors/wiring exactly, rather than reconstructing a new Gradle model.
gradle = all_outputs['backend/build.gradle.kts'].decode()
assert gradle.count('minimum = "0.70"') == 1
assert gradle.count('minimum = "0.75"') == 4
assert 'minimum = "0.80"' not in gradle
assert 'com.citi.put.checks.studio.compile' not in gradle
assert 'dependsOn(requireFreshGuidedPartitions)' in gradle
assert 'dependsOn(tasks.jacocoTestReport, requireFreshGuidedPartitions)' in gradle
assert 'dependsOn(tasks.jacocoTestCoverageVerification)' in gradle
for kind in ('main', 'test'):
    assert not (ROOT / f'backend/src/{kind}/java/com/citi/put/checks/studio/compile').exists()
evidence['checks']['coverage'] = 'Only two absent-production-package80% rules removed; real global70%/four75% floors and all other bytes/wiring exact.'

# Bounded source-symbol search, no whole-repository or migration inventory.
symbols = ['isCanonical','allocationIds','isApiAssigned','providerName','getSecretName',
           'pollIntervalOrDefault','readIntervalOrDefault','updateAuthoring']
matches = {symbol:[] for symbol in symbols}
constructors = []
for base in ['backend/src','frontend/src','studio-runner/src','tools']:
    for path in sorted((ROOT/base).rglob('*')):
        if not path.is_file() or path.suffix not in ('.java','.ts','.tsx','.js','.mjs','.cjs','.json','.yml','.yaml'):
            continue
        text = path.read_text()
        for symbol in symbols:
            for match in re.finditer(r'\b'+symbol+r'\b',text):
                matches[symbol].append({'path':str(path.relative_to(ROOT)), 'line':text[:match.start()].count('\n')+1})
        if base == 'backend/src' and path.suffix == '.java':
            for match in re.finditer(r'\bnew\s+(?:(?:com\.citi\.put\.checks\.studio\.)?StudioExecutionProperties(?:\.(?:Dispatcher|Sse))?|Dispatcher|Sse)\s*\(',text):
                constructors.append({'path':str(path.relative_to(ROOT)), 'line':text[:match.start()].count('\n')+1,
                                     'text':match.group(0)})
for symbol in symbols:
    assert len(matches[symbol]) == 1, (symbol,matches[symbol])
    path = matches[symbol][0]['path']
    assert not re.search(r'\b'+symbol+r'\b',all_outputs[path].decode())
assert len(constructors) == 28, constructors
assert sum('Dispatcher' in c['text'] for c in constructors) == 2
assert sum(re.search(r'\bSse\s*\(', c['text']) is not None for c in constructors) == 1
evidence['checks']['deletedSymbolMatchesBefore'] = matches
evidence['checks']['constructors'] = constructors
props = 'backend/src/main/java/com/citi/put/checks/studio/StudioExecutionProperties.java'
assert read(props).split(b'  /** Dispatcher budget')[0] == all_outputs[props].split(b'  /** Dispatcher budget')[0]
positive = 'backend/src/test/java/com/citi/put/checks/studio/dispatch/HttpRunnerDispatchClientTest.java'
assert digest(positive) == '52d02aa8c7d5d6f6d1748186e68a2a27f18e91c87c032ef27e42617ec5c1ecad'
assert 'new StudioExecutionProperties(true, null, null, null, Duration.ofMillis(500), null, null, null, null, null, null)' in read(positive).decode()
evidence['checks']['outerConfigurationAndCompatibilityConstructorUnchanged'] = True

inventory = 'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md'
assert all_outputs[inventory].startswith(read(inventory))
fe = 'frontend/src/components/studio/runs/RunDetailsDrawer.tsx'
assert all_outputs[fe] == read(fe).replace(b'Confirmed revision:',b'Learned revision:',1)
fe_test = 'frontend/src/components/studio/scheduling/scheduleProvenance.test.tsx'
assert all_outputs[fe_test] == read(fe_test).replace(b'Confirmed revision:',b'Learned revision:',1)
assert read(fe).count(b'Confirmed revision:') == read(fe_test).count(b'Confirmed revision:') == 1
evidence['checks']['approvedRcoLiteralsOnly'] = True
evidence['checks']['inventoryWholeOriginalBytePrefixRetained'] = True
assert all('/db/migration/' not in name for name in all_outputs)
assert not any(name.endswith('StudioSecretsService.java') for name in all_outputs)
assert not any('guidedNarratives' in name or 'studioWcagAudit' in name or 'axe-results' in name for name in all_outputs)

protected = [positive,'docs/qa/accessibility/axe-results.json',
             'frontend/src/test/a11y/studioWcagAudit.test.tsx',
             'frontend/src/components/studio/guided/guidedNarratives.ts',
             'backend/src/main/java/com/citi/put/checks/studio/secrets/StudioSecretsService.java']
data_manifest = json.loads((BASE / 't0/early/left-data-draft/resume2/manifest.json').read_text())
protected += [f['path'] for f in data_manifest['files']]
evidence['protectedReadOnlyCurrentPins'] = [{'path':p,'sha256':digest(p)} for p in protected]
evidence['checks']['deferredF2FilesAreNotPatchTargets'] = all(p not in all_outputs for p in protected)
review_inputs = [
    't0/qa/left-drafts/review.md', 't0/qa/left-drafts-rereview/review.md',
    't0/qa/fe-rt-drafts/review.md',
    't0/resume-architecture/resume2/engineering-doc/review.md',
    't0/resume-architecture/resume2/engineering-doc-rereview/review.md',
    't0/early/R-CO/cosign.md', 't0-prep-20261018/t0-proposal.md',
    't0-prep-20261018/qa-cosign.md', 't0-prep-20261018/po-ratification.md',
    't0/t0-record.md', 'recovery-20261020/implementation-window-release.json',
]
evidence['reviewInputPins'] = [{'path':str((BASE/p).relative_to(ROOT)),
                              'sha256':sha((BASE/p).read_bytes())} for p in review_inputs]
evidence['sourceOnlyVerdict'] = 'CLEAN'
(OUT/'independent-text-checks.json').write_text(json.dumps(evidence,indent=2)+'\n')
print(json.dumps({'sourceOnlyVerdict':'CLEAN','patchTargets':len(all_outputs),
                  'packetManifests':[p['manifestSha256'] for p in evidence['packets']],
                  'constructors':len(constructors),'checksSha256':sha((OUT/'independent-text-checks.json').read_bytes())}))
