"""Independent read-only static review. Never imports/runs an author entrypoint."""
from pathlib import Path
import hashlib
import json
import re
import stat
from datetime import datetime, timezone

ROOT = Path.cwd()
BASE = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway-independent-mutants'
OLD = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway-chart-draft'
OUT = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway-independent-mutants-review'
checks = []
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def check(name, value):
    assert value, name
    checks.append(name)
def load(p): return json.loads(p.read_text())
def mode(p): return f'{stat.S_IMODE(p.stat().st_mode):04o}'
def inventory(directory):
    return {str(p.relative_to(directory)): {'sha256': sha(p), 'mode': mode(p)}
            for p in sorted(directory.rglob('*')) if p.is_file()}

before = {str(p.relative_to(ROOT)): {'sha256': sha(p), 'mode': mode(p)}
          for d in (BASE, OLD) for p in sorted(d.rglob('*')) if p.is_file()}
check('sealed checkpoint exact', sha(BASE/'CHECKPOINT.md') == 'c711ad4f0430a2204bd4ace8dd10dc69b2a95cc503dee97ca1755de3f07b14e4')
check('sealed manifest exact', sha(BASE/'manifest.json') == 'b91e0e70e995a76435ed9cfd7e24f8398b3e2ddebb7b605526b75d98da121665')
manifest = load(BASE/'manifest.json')
for a in manifest['artifacts']:
    p = BASE/a['path']
    check('manifest '+a['path'], sha(p) == a['sha256'] and p.stat().st_size == a['bytes'] and mode(p) == a['mode'])
for r in load(BASE/'review-inputs.json')['references']:
    check('reference '+r['path'], sha(ROOT/r['path']) == r['sha256'])

def apply_patch(text, patch):
    """Strict single-file unified patch reconstruction in memory, including deletion offsets."""
    src = text.splitlines(keepends=True)
    result = []
    cursor = 0
    lines = patch.splitlines(keepends=True)
    i = 2
    while i < len(lines):
        match = re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*\n?', lines[i])
        assert match, lines[i]
        start = int(match[1])-1
        assert start >= cursor
        result += src[cursor:start]
        cursor = start
        old_count = new_count = 0
        i += 1
        while i < len(lines) and not lines[i].startswith('@@ '):
            line = lines[i]
            assert line[:1] in (' ', '+', '-')
            if line[0] in ' -':
                assert cursor < len(src) and src[cursor] == line[1:]
                cursor += 1
                old_count += 1
            if line[0] in ' +':
                result.append(line[1:]); new_count += 1
            i += 1
        assert old_count == int(match[2] or 1) and new_count == int(match[4] or 1)
    return ''.join(result+src[cursor:])

bindings = load(BASE/'chart-bindings.json')
check('all 22 actual and private chart identities', len(bindings['files']) == 22)
actual_before = {}
for row in bindings['files']:
    a = ROOT/'helm-chart/put-checks'/row['path']
    p = BASE/'private-repo/helm-chart/put-checks'/row['path']
    check('actual chart '+row['path'], sha(a) == row['sourceSha256'] and mode(a) == row['mode'])
    check('private fixed chart '+row['path'], sha(p) == row['fixedSha256'] and mode(p) == row['mode'])
    actual_before[str(a.relative_to(ROOT))] = {'sha256': sha(a), 'mode': mode(a)}
check('complete private chart inventory', len(inventory(BASE/'private-repo/helm-chart/put-checks')) == 22)
for row in bindings['unchangedRunnerCopies']:
    a, p = ROOT/row['path'], BASE/'private-repo'/row['path']
    check('unchanged runner '+row['path'], sha(a) == row['sha256'] == sha(p) and mode(a) == row['mode'] == mode(p))
    actual_before[row['path']] = {'sha256': sha(a), 'mode': mode(a)}

plan = load(BASE/'mutations.json')
fixed = (BASE/'private-repo/helm-chart/put-checks/templates/_helpers.tpl').read_text()
check('accepted fixed helper identity', hashlib.sha256(fixed.encode()).hexdigest() == plan['acceptedHelperSha256'])
source_proof = load(OLD/'source-proof.json')
tokens = source_proof['newNormalizedTokens'] + source_proof['legacyNormalizedTokens']
check('8 current and 7 legacy token counts', len(source_proof['newNormalizedTokens']) == 8 and len(source_proof['legacyNormalizedTokens']) == 7)
for mutant in plan['mutants']:
    candidate = (BASE/mutant['sourceCandidate']).read_text()
    old, new = mutant['exactOldFragment'], mutant['exactNewFragment']
    check(mutant['id']+' unique old anchor', fixed.count(old) == 1)
    check(mutant['id']+' exact single independent edit', fixed.replace(old,new,1) == candidate)
    check(mutant['id']+' forward reconstruction', apply_patch(fixed,(BASE/mutant['forwardPatch']).read_text()) == candidate)
    check(mutant['id']+' restore reconstruction', apply_patch(candidate,(BASE/mutant['restorePatch']).read_text()) == fixed)
    check(mutant['id']+' candidate mode and hash', sha(BASE/mutant['sourceCandidate']) == mutant['candidateSha256'] and mode(BASE/mutant['sourceCandidate']) == '0644')
    for token in tokens:
        check(mutant['id']+' token '+token, candidate.count('"'+token+'"') == fixed.count('"'+token+'"') == 1)

old_manifest = load(OLD/'manifest.json')
for row in old_manifest['files']:
    check('original live target '+row['path'], sha(ROOT/row['path']) == row['originalSha256'])
    check('accepted draft target '+row['path'], sha(OLD/'repo'/row['path']) == row['draftSha256'])
    check('old draft patch '+row['path'], sha(OLD/row['patch']) == row['patchSha256'])
check('original two-path draft remains exact', sha(OLD/'gateway-chart-draft.patch') == plan['originalDraftPatchSha256'] and sha(OLD/'manifest.json') == plan['originalDraftManifestSha256'])
historical = [{'path': r['path'], 'matches': sha(ROOT/r['path']) == r['sha256']} for r in source_proof['sources']]
check('historical snapshot exactly 20 of 22 current', sum(r['matches'] for r in historical) == 20 and len(historical) == 22)
check('only named historical context drifts', {r['path'] for r in historical if not r['matches']} == {'docs/qa/evidence/STUDIO-OBS-011/t0/resume2-decisions.md','docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md'})

test = (OLD/'repo/studio-runner/test/deployment/integrations.test.ts').read_text()
props = re.findall(r"'([^']+)'", test.split('const GATEWAY_CHART_PROPERTIES = [',1)[1].split('] as const;',1)[0])
check('source extracted eight property rows', len(props) == 8)
prefix = 'gateway chart-owned facts in mounted Spring configuration > '
ids = []
for component in ('backend','worker'):
    for shape in ('flat','nested','relaxed'):
        ids += [prefix+f'{component} rejects {shape} {p}' for p in props]
    ids += [prefix+f'{component} keeps legacy compile spelling {p} reserved' for p in props[:7]]
    ids += [prefix+f'{component} keeps gateway tuning and custom properties available']
ids += [prefix+f'mutation: removing only {p} defeats its refusal' for p in props]
for credentials in ('application-default','service-account-file'):
    ids += [prefix+f'{v}: valid {credentials} manifests stay byte-identical after adding the guards'
            for v in ('values.yaml','values-dev.yaml','values-uat.yaml','values-prod.yaml')]
catalog = load(BASE/'original-80-case-map.json')
check('independent ordered source expansion equals all 80 IDs', ids == catalog['ids'] and len(ids) == 80 and len(set(ids)) == 80)
for name, shape in (('M-RECURSION','nested'),('M-NORMALIZED-COMPARISON','relaxed')):
    check(name+' exact selected witnesses', catalog['selectedWitnessIds'][name] == [prefix+f'{c} rejects {shape} studio.gateway.provider' for c in ('backend','worker')])

scratch = (BASE/'private-repo/studio-runner/test/deployment/gateway-independent-mutants.test.ts').read_text()
harness = (BASE/'private-repo/studio-runner/test/deployment/helm.ts').read_text()
commands = load(BASE/'future-commands.json')
check('scratch two explicit identities', len(re.findall(r"\bit\('",scratch)) == 2 and len(catalog['scratchCaseIds']) == 2)
check('scratch concrete 40 outcome source expansion', "['backend', 'worker'] as const" in scratch and len(re.findall(r"kind: '(target|canonical-flat|legacy-flat|other-shape|custom-flat)'", scratch)) == 5 and "[{ state: 'fixed', directory: fixed }, { state: 'mutant', directory: mutant }]" in scratch and commands['expectedHelmTemplateOutcomes'] == 2*2*5*2)
check('scratch uses actual accepted harness API', 'renderOutcome({ chartDir: chart.directory, args })' in scratch and 'readonly chartDir?: string' in harness and 'readonly args?: readonly string[]' in harness)
check('native command dedicated config and private cwd', commands['cwd'] == '${TASK_REPO}/studio-runner' and 'vitest.gateway-independent.config.ts' in commands['primaryArgv'])
check('mutation before first measurement', scratch.index("writeFileSync(join(mutant, 'templates', '_helpers.tpl'), candidate)") < scratch.index('const outcome = renderOutcome('))
check('exact restore full inventories before owned deletion', scratch.index("writeFileSync(join(mutant, 'templates', '_helpers.tpl'), original)") < scratch.index('expect(snapshot(mutant)).toEqual(parentBefore)') < scratch.index('cpSync(mutant, archive') < scratch.index('rmSync(owned,'))
check('failure aggregation cannot silently become pass', 'if (errors.length > 0) throw new AggregateError(errors' in scratch and "'FAILED_OR_INCOMPLETE'" in scratch)
check('observed exact exit missing reproducible witness', 'readonly status' not in harness.split('export interface RenderOutcome',1)[1].split('\n}',1)[0] and 'observedOk: outcome.ok' in scratch and 'exitCode:' not in scratch and 'signal:' not in scratch)

after = {str(p.relative_to(ROOT)): {'sha256': sha(p), 'mode': mode(p)}
         for d in (BASE, OLD) for p in sorted(d.rglob('*')) if p.is_file()}
check('all original and new package bytes/modes unchanged', before == after)
for name, record in actual_before.items():
    check('actual input still unchanged '+name, {'sha256':sha(ROOT/name),'mode':mode(ROOT/name)} == record)
result = {'timestampUtc':datetime.now(timezone.utc).isoformat(), 'kind':'INDEPENDENT_STATIC_REVIEW_ONLY',
          'checksPassed':len(checks), 'checks':checks, 'sealedManifestSha256':sha(BASE/'manifest.json'),
          'artifactsPreserved':len(before), 'actualInputFilesPreserved':len(actual_before),
          'historicalSnapshotMatches':20, 'historicalSnapshotTotal':22,
          'sourceExpandedOriginalCases':80,'sourceExpandedScratchCases':2,'plannedRenderOutcomes':40,
          'nativeCommandsExecuted':0,'helmCommandsExecuted':0,'sourceApplied':False,
          'findingIds':['GWM-EXIT-01'], 'inputSeal':before,'actualInputSeal':actual_before}
(OUT/'audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ('checksPassed','artifactsPreserved','actualInputFilesPreserved','sourceExpandedOriginalCases','plannedRenderOutcomes','findingIds')}))
