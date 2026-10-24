"""Finite public-byte/AST inspection only; never import or execute target code."""
from pathlib import Path
import ast
import difflib
import hashlib
import json
import stat

R = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
T = R / 'docs/qa/evidence/STUDIO-OBS-011/t0'
D = T / 'early/gateway80-failed-red-resource-prep/resume8b'
OLD = D.parent / 'resume8'
OUT = Path(__file__).parent
checks = []
pins = []

def check(name, value):
    if value is not True:
        raise AssertionError(name)
    checks.append(name)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def read(path):
    info = path.lstat()
    check('regular public file ' + str(path.relative_to(R)), stat.S_ISREG(info.st_mode) and stat.S_IMODE(info.st_mode) == 0o644)
    raw = path.read_bytes()
    pins.append(dict(path=str(path.relative_to(R)), sha256=sha(raw), bytes=len(raw), mode=stat.S_IMODE(info.st_mode)))
    return raw

def node(raw, name):
    body = ast.parse(raw).body
    for part in name.split('.'):
        found = next(n for n in body if isinstance(n, (ast.FunctionDef, ast.ClassDef)) and n.name == part)
        body = found.body
    return ast.dump(found, include_attributes=False)

mr = read(D / 'manifest.json')
check('exact Source08b manifest pin', sha(mr) == '7fec05dfe1ea4d59447b10f2b79ed9516c0a56fce51236581381edc001f7e8e6' and len(mr) == 6592)
m = json.loads(mr)
check('33 unique safe payload names', len(m['files']) == 33 and len({x['path'] for x in m['files']}) == 33 and all(Path(x['path']).name == x['path'] and x['path'] not in ('manifest.json', 'SHA256SUMS') for x in m['files']))
current = {}
for row in m['files']:
    raw = read(D / row['path'])
    check('manifest bytes/hash/mode ' + row['path'], len(raw) == row['bytes'] and sha(raw) == row['sha256'] and row['mode'] == 0o644)
    current[row['path']] = raw
check('exact directory membership', {p.name for p in D.iterdir()} == set(current) | {'manifest.json', 'SHA256SUMS'})
checksum_raw = read(D / 'SHA256SUMS')
expected_sums = ''.join(row['sha256'] + '  ' + row['path'] + '\n' for row in m['files']) + sha(mr) + '  manifest.json\n'
check('34 exact checksum rows acyclic', checksum_raw.decode() == expected_sums and len(checksum_raw.splitlines()) == 34)
old_mr = read(OLD / 'manifest.json')
check('exact parent manifest', sha(old_mr) == '3fe65bc487f8badf8329ff44040b11d1634e93145142eb3b5bd72d782a82190b' and len(old_mr) == 7608)
old_rows = {x['path']: x for x in json.loads(old_mr)['files']}
bindings = json.loads(current['static-bindings.json'])
old = {}
def successor(raw):
    return raw.replace(b'gateway80-failed-red-resource-prep/resume8', b'gateway80-failed-red-resource-prep/resume8b').replace(b'gateway80-failed-red-resource-code08-exact-review', b'gateway80-failed-red-resource-code08b-exact-review')
for row in bindings['sourceBindings']:
    name = row['path']
    raw = read(OLD / name)
    old[name] = raw
    check('sealed parent payload ' + name, sha(raw) == old_rows[name]['sha256'] and len(raw) == old_rows[name]['bytes'])
    check('static old/current hashes ' + name, sha(raw) == row['oldSha256'] and sha(current[name]) == row['currentSha256'] and row['rawUnchanged'] == (raw == current[name]))
    if row['onlyApprovedNormalizationAndBindings']:
        expected = successor(raw)
        if name == 'failed_gateway.py':
            needle = b'        if str(path) in self.external_inputs:return self.bound(path,cap=134217728)'
            check('one original dispatcher insertion site', expected.count(needle) == 1)
            expected = expected.replace(needle, b'        path=self.s.path(path)\n' + needle)
        check('exact allowed source transformation ' + name, current[name] == expected)
delta = ''.join(''.join(difflib.unified_diff(old[row['path']].decode().splitlines(True), current[row['path']].decode().splitlines(True), fromfile='resume8/' + row['path'], tofile='resume8b/' + row['path'])) for row in bindings['sourceBindings'])
check('complete exact source-delta patch', delta.encode() == current['source-delta.patch'])
for row in bindings['unchangedComponents']:
    a = node(old[row['path']], row['component'])
    b = node(current[row['path']], row['component'])
    check('unchanged component ' + row['component'], a == b and sha(a.encode()) == row['sha256'])
check('only dispatcher method semantic insertion', node(current['failed_gateway.py'], 'Unit.retained_source_read') == node(old['failed_gateway.py'].replace(b'        if str(path) in self.external_inputs:return self.bound(path,cap=134217728)', b'        path=self.s.path(path)\n        if str(path) in self.external_inputs:return self.bound(path,cap=134217728)'), 'Unit.retained_source_read'))
k = json.loads(current['contract.json'])
check('raw complete contract unchanged', current['contract.json'] == old['contract.json'])
check('29 exact keys unchanged hashes/modes', len(k['externalInputModes']) == 29 and set(k['externalInputModes']) == set(k['externalSourcePins']) and all(type(v) is int and v in (0o600, 0o644) for v in k['externalInputModes'].values()) and sum(v == 0o600 for v in k['externalInputModes'].values()) == 1 and sum(v == 0o644 for v in k['externalInputModes'].values()) == 28)
check('same generation8', m['sourceGeneration'] == 8 and bindings['sourceGeneration'] == 8)
callers = json.loads(current['caller-bindings.json'])
trace = json.loads(current['trace-bearing-composition.json'])
expected_callers = json.loads(successor(old['caller-bindings.json']))
for row in expected_callers['currentCallerSources']:
    raw = current[row['path']]
    row.update(sha256=sha(raw), bytes=len(raw), firstReadCap=len(raw) + 1)
expected_callers['controlAuthorCliSha256'] = sha(current['control-author-cli.py'])
expected_callers['operatorHelperSha256'] = sha(current['operator-completion.js'])
expected_callers['beforeUse'] = expected_callers['beforeUse'].replace('code08 reviews', 'code08b reviews')
check('only exact necessary caller pin/count bindings', callers == expected_callers)
expected_trace = json.loads(successor(old['trace-bearing-composition.json']))
for row in expected_trace['payloads']:
    name = Path(row['payloadPath']).name
    raw = current[name]
    old_count = row['payloadBytes']
    row.update(payloadSha256=sha(raw), payloadBytes=len(raw))
    row['staged807Argv'][-2:] = [sha(raw), str(len(raw))]
    expected_prefix = successor(old[row['firstReadPrefix']]).decode().replace('-n ' + str(old_count + 1) + ' ', '-n ' + str(len(raw) + 1) + ' ').replace('== ' + str(old_count) + ' ]]', '== ' + str(len(raw)) + ' ]]')
    check('exact prefix transformation ' + name, expected_prefix.encode() == current[row['firstReadPrefix']])
    check('current exact payload path ' + name, Path(row['payloadPath']) == D / name)
check('only exact necessary trace binding refresh', trace == expected_trace)
for row in trace['literalComponents']:
    check('literal Source07-origin component ' + row['path'], sha(current[row['path']]) == row['sha256'] and len(current[row['path']]) == row['bytes'] and current[row['path']] == old[row['path']])
references = json.loads(current['unchanged-proof-references.json'])
for row in references['completeConditionCarriers'] + references['proofReferences']:
    raw = read(R / row['path'])
    check('exact referenced public proof/condition pin ' + row['path'], sha(raw) == row['sha256'] and len(raw) == row['bytes'] and row['mode'] == 0o644)
adoption_path = T / 'resume2-gateway-failed-resource-source08-all-findings-root-adoption.json'
adoption = json.loads(adoption_path.read_bytes())
check('complete original mandatory category retained', adoption['canonicalMandatoryFinding'] == 'FR08-REGISTERED-READER-PATH-ALIAS-BYPASS' and adoption['allFindingsAndAllCurrentInheritedConditionsAdopted'] is True and set(adoption['reviews']) == {'Aria', 'Quinn'})
for who in ('Aria', 'Quinn'):
    check('complete retained conditions ' + who, len(adoption['reviews'][who]['completeConditions']['conditions']) >= 10)
fixture = read(D.parent / 'resume4/checks.py')
result = json.loads(current['dispatcher-results.json'])
status = json.loads(current['dispatcher-tool-status.json'])
check('recorded exact dispatcher source hashes', all(sha(current[name]) == h for name, h in result['sourceHashes'].items()) and sha(fixture) == result['literalFakeFsAuditSourceSha256'])
check('recorded45 four scenarios no target effects', result['passed'] == 45 and len(result['checks']) == 45 and len(result['scenarios']) == 4 and result['failure'] is None and result['realBoundaryCalls'] == [] and result['actualTargetEffects'] == 0 and result['installationClaimed'] is False)
check('recorded external status distinct from direct wait', status['actualExternalExitCode'] == 0 and status['toolChunkId'] == '94df81' and status['notDirectPopenWait'] is True and status['pid'] is None and status['parentPid'] is None)
assignment_targets = {'leaf.anchored_raw', 'd.SAFE_READER', 'd.TOOL_READER', 'd.sha'}
tree = ast.parse(current['failed_gateway.py'])
unit = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'Unit')
load = next(n for n in unit.body if isinstance(n, ast.FunctionDef) and n.name == 'load_libraries')
assignments = [n for n in load.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Attribute) and ast.unparse(t) in assignment_targets for t in n.targets)]
check('four actual top-level callback assignments', len(assignments) == 4)
handoff = read(R / 'docs/qa/evidence/STUDIO-OBSERVED-NEXT/RESUME-HANDOFF-20261019-CODEX.md')
report = dict(kind='ARIA_SOURCE08B_STATIC_PUBLIC_BYTES_AND_AST_REVIEW', subjectManifestSha256=sha(mr), subjectManifestBytes=len(mr), payloads=33, checksumRows=34, payloadBytes=sum(x['bytes'] for x in m['files']), checks=checks, finiteStaticChecks=len(checks), uniqueAssertionsClaimed=False, pins=pins, sourceOnly=True, targetExecutions=0, dispatcherEvidenceReused=dict(tool='94df81', externalExit=0, assertions=45, scenarios=4, independentlyRepeated=False), old41SevenCasesReusedOnly=True, protectedOriginalReads=0, actualAuthority=False, ownerDecisionIssued=False)
with (OUT / 'static-results.json').open('x') as handle:
    json.dump(report, handle, indent=2)
    handle.write('\n')
print(json.dumps(dict(finiteStaticChecks=len(checks), pins=len(pins), payloadBytes=report['payloadBytes'], subjectManifestSha256=sha(mr), targetExecutions=0)))
