"""Review-owned byte/text integrity only. Never imports or executes product/reader code."""
from pathlib import Path
import hashlib
import json
import re

HERE = Path(__file__).resolve().parent
PACK = HERE.parent
ROOT = HERE.parents[7]
OLD = ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/it-r-draft/resume4'
sha = lambda b: hashlib.sha256(b).hexdigest()
manifest_raw = (PACK/'manifest.json').read_bytes()
assert sha(manifest_raw) == '2cf8e5d2d62009f79e870acfc4db8c2a95e78d3c856c89f1fd791a1f01637a4c'
manifest = json.loads(manifest_raw)
for entry in manifest['files']:
    raw = (PACK/entry['path']).read_bytes()
    assert len(raw) == entry['bytes'] and sha(raw) == entry['sha256'], entry['path']
preparation = json.loads((PACK/'preparation.json').read_bytes())
canonical = (ROOT/preparation['canonicalPath']).read_bytes()
candidate = (ROOT/preparation['candidatePath']).read_bytes()
assert sha(canonical) == preparation['canonicalSha256'] == 'e10c162d057c87a906a32e162614d29f3f4ba5a0e7000c52e9f77e46b0cdd616'
assert sha(candidate) == preparation['candidateSha256'] == '94b9db694ee543a9f9cd5e341021acdcdce8f936d49a68c8d63607ad7feb45cc'

def apply_text(original, patch):
    source = original.decode().splitlines(keepends=True)
    lines = patch.decode().splitlines(keepends=True)
    assert lines[:2] == ['--- a/'+preparation['canonicalPath']+'\n', '+++ b/'+preparation['canonicalPath']+'\n']
    i, pos, result = 2, 0, []
    while i < len(lines):
        match = re.fullmatch(r'@@ -(\d+),(\d+) \+(\d+),(\d+) @@\n',lines[i])
        assert match
        start, old_count, new_start, new_count = map(int,match.groups())
        assert start-1 >= pos
        result.extend(source[pos:start-1]); pos = start-1
        assert len(result) == new_start-1
        i += 1
        consumed = produced = 0
        while i < len(lines) and not lines[i].startswith('@@ '):
            line = lines[i]
            assert line[0] in ' +-'
            if line[0] in ' -':
                assert source[pos] == line[1:]
                consumed += 1; pos += 1
            if line[0] in ' +':
                result.append(line[1:]); produced += 1
            i += 1
        assert (consumed,produced) == (old_count,new_count)
    result.extend(source[pos:])
    return ''.join(result).encode()

failed = (OLD/'mutations/M-gate-true-subset/repo'/preparation['canonicalPath']).read_bytes()
assert sha(failed) == preparation['failedDiagnosticSourceSha256'] == '6a10fca7681b6d11d5cc82927fe6b632025abe85554884975ca1378b2e6b6b36'
assert apply_text(failed,(PACK/'from-existing-force-true.patch').read_bytes()) == candidate
assert apply_text(candidate,(PACK/'restore-existing-force-true.patch').read_bytes()) == failed
assert apply_text(canonical,(PACK/'from-test001.patch').read_bytes()) == candidate
assert apply_text(candidate,(PACK/'restore-test001.patch').read_bytes()) == canonical
before = b'  void syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls() {\n'
after = b'  void syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls() throws Exception {\n    startWorkers();\n'
assert failed.count(before) == candidate.count(after) == 1
assert failed.replace(before,after,1) == candidate

copies = []
for entry in preparation['readerAndCaseFiles'].values():
    original = (ROOT/entry['historicalPath']).read_bytes()
    successor = (ROOT/entry['successorPath']).read_bytes()
    assert original == successor and sha(original) == entry['sha256']
    copies.append({'path':entry['successorPath'],'sha256':sha(successor),'byteIdentical':True})
original_plan = (OLD/'mutation-plan.json').read_bytes()
successor_plan = (PACK/'reader/mutation-plan.json').read_bytes()
old_plan = json.loads(original_plan)
new_plan = json.loads(successor_plan)
old_selected = next(m for m in old_plan['mutants'] if m['id']=='M-gate-true-subset')
new_selected = next(m for m in new_plan['mutants'] if m['id']=='M-gate-true-subset')
for field,values in preparation['mutationPlanLiteralChangesOnly'].items():
    assert old_selected[field] == values['before'] and new_selected[field] == values['after']
    old_selected[field] = values['after']
assert old_plan == new_plan
assert original_plan.count(sha(failed).encode()) == 2
assert original_plan.count(preparation['mutationPlanLiteralChangesOnly']['patchSha256']['before'].encode()) == 1
expected_plan = original_plan.replace(sha(failed).encode(),sha(candidate).encode())
expected_plan = expected_plan.replace(preparation['mutationPlanLiteralChangesOnly']['patchSha256']['before'].encode(),
                                     preparation['mutationPlanLiteralChangesOnly']['patchSha256']['after'].encode())
assert expected_plan == successor_plan

result = {'sourceVerdict':'CLEAN','manifestSha256':sha(manifest_raw),
          'canonicalSha256':sha(canonical),'failedDiagnosticSha256':sha(failed),'candidateSha256':sha(candidate),
          'minimalTwoLineCorrectionOnly':True,'allFourLiteralPatchDirectionsExact':True,
          'metadataExactlyThreeLiteralBindingsOnly':True,'copiedStrictInputs':copies,
          'runtimeExecuted':False,'sourceLanguageParserExecuted':False,'actualSourceApplied':False,
          'patches':{name:sha((PACK/name).read_bytes()) for name in preparation['patchSha256']}}
(HERE/'independent-text-checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'sourceVerdict':'CLEAN','checksSha256':sha((HERE/'independent-text-checks.json').read_bytes())}))
