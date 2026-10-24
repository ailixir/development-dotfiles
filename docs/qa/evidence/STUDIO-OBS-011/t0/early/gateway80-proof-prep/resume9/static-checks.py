"""Source/metadata checks only. Never imports or executes subject code or shell."""
from pathlib import Path
import ast
import hashlib
import json
import re
import shlex
import unicodedata

P = Path(__file__).parent
results = []


def check(name, value):
    results.append({'id': name, 'passed': bool(value)})
    if not value:
        raise ValueError(name)


def doc(name):
    return json.loads((P / name).read_text())


def sha(name):
    return hashlib.sha256((P / name).read_bytes()).hexdigest()


r = (P / 'runtime.py').read_text()
e = (P / 'entry.py').read_text()
check('RUNTIME_EXACT_TESTED_SHA', sha('runtime.py') == 'ae0501adeb1eb7a1edf79c87e5dd086c36e5bcff20666f3b8024e0f12c32c108')
check('ENTRY_EXACT_TESTED_SHA', sha('entry.py') == '42bc48ce942ae31152ff2d8bac590cf5087332b4076e411d52f784f9bb9636ba')
for name in ('runtime.py', 'entry.py', 'controls.py', 'six-fix-controls.py'):
    check('CURRENT_SNAPSHOT_' + name, (P / name).read_bytes() == (P / ('history/attempt02-' + name)).read_bytes())
for name in ('runtime.py', 'entry.py'):
    check('NONREMOVABLE_CHECKS_' + name, not any(isinstance(x, ast.Assert) for x in ast.walk(ast.parse((P / name).read_text()))))
literal = shlex.quote(e)
shells = ('capture-once.bash', 'guard-exit.bash', 'author-control.template.bash', 'postclose.template.bash')
outer = {}
for name in shells:
    text = (P / name).read_text()
    check('EXACT_ENTRY_LITERAL_' + name, text.count(literal) == 1)
    outer[name] = text.replace(literal, "'<EXACT_VERIFIED_ENTRY>'")
    check('NO_GLOBAL_OPTION_MUTATION_' + name, not re.search(r'^\s*(?:set\s+[-+]|shopt\s)', outer[name], re.M))
    check('NEW_GENERATION_' + name, 'gateway80-proof-prep/resume8' not in text and 'gateway80-proof-prep/resume9' in text)
    check('ENTRY_SHA_HEADER_' + name, '# Embedded entry.py SHA256: ' + sha('entry.py') in text)
    check('LOCAL_CHILD_CONDITIONAL_' + name, bool(re.search(r'if .* -I -B -c ', outer[name])))
c = outer['capture-once.bash']
g = outer['guard-exit.bash']
check('CAP_BEFORE_PYTHON', c.index('readonly G8_CAPTURE_CONSUMED=1') < c.index('if "$G8_CAPTURE_PYTHON"'))
check('GATE0_ONLY_BUILTIN_EXIT', 'if [[ $g8_gate_status == 0 ]]; then builtin exit 0; fi' in g and g.count('builtin exit') == 1)
check('NEGATIVE_ALWAYS_DENIES', '--operation negative' in g and 'return 1' in g)
b = (P / 'SHELL-BINDING.md').read_text()
for name, value in {
    'READ_EOF_CONDITIONAL': "if IFS= read -r -d ''" in b and 'G8_CAPTURE_READ_STATUS=$?' in b,
    'ACTUAL_VARIABLE_FOREGROUND_HASH': 'if "/opt/homebrew/' in b and '"$G8_CAPTURE_SOURCE_BUFFER" EXACT_CAPTURE_TEMPLATE_SHA; then' in b and 'G8_CAPTURE_HASH_STATUS=$?' in b,
    'READONLY_SAME_BUFFER_EVAL': 'eval "$G8_CAPTURE_SOURCE_BUFFER"' in b and 'readonly G8_CAPTURE_SOURCE_BUFFER' in b,
    'SETUP_COMPONENT_STATUS': 'if gateway8_bind_capture_buffer' in b and 'G8_CAPTURE_SETUP_STATUS=$?' in b,
    'NEGATIVE_COMPONENT_STATUS': 'if exit 0; then' in b and 'G8_NEGATIVE_RETURN=$?' in b,
    'GATE_COMPONENT_STATUS': 'if exit 0 GATE_ENTRY_SHA PERMIT_SHA; then' in b,
    'SHELL_ACCEPTANCE_OWED': 'actual caller-shell acceptance remains owed' in (P / 'API.md').read_text().lower(),
}.items():
    check(name, value)
scope = doc('scope.json')
oldscope = json.loads((P.parent / 'resume8/scope.json').read_text())
for key in ('phaseIds', 'phases', 'node', 'helm', 'dependencies', 'maximumSeconds', 'parentUmask', 'childUmask', 'noRetry', 'noSignals', 'noCleanupByDriver', 'workspace', 'runtime', 'protocol'):
    check('UNCHANGED_NATIVE_PROFILE_' + key, scope[key] == oldscope[key])
external = doc('external-inputs.json')
oldexternal = json.loads((P.parent / 'resume8/external-inputs.json').read_text())
check('ALL39_STATIC_REFERENCES_UNCHANGED', len(external['files']) == 39 and external['files'] == oldexternal['files'])
for name, row in external['files'].items():
    # Only the explicitly approved public source/bank preimages, never baseline/tool bodies.
    f = Path(row['path'])
    raw = f.read_bytes()
    check('STATIC_PIN_' + name, hashlib.sha256(raw).hexdigest() == row['sha256'] and len(raw) == row['bytes'] and f.stat().st_mode & 0o7777 == row['mode'])
templates = doc('control-templates.json')
schema = doc('document-factories.schema.json')
role_templates = {'ROOT_AUTHORIZATION': 'rootRelease', 'OWNER_LOCAL_PROFILE_RULING': 'ownerRuling', 'PHASE_DECISION': 'phaseDecision', 'ACTUAL_CLIENT_COMPLETION': 'clientActualCompletion', 'NEGATIVE_GUARD_STATUS': 'negativeStatus', 'GUARD_ADMISSION': 'guardAdmission', 'ACTUAL_PHASE_ARCHIVE_QA': 'actualQa', 'ACTUAL_QA_ROOT_ADOPTION': 'actualReviewAdoption', 'FINAL_CLOSE_PERMIT': 'closePermit', 'ACTUAL_WRAPPER_RESULT': 'actualWrapperResult'}
for role, name in role_templates.items():
    check('TEMPLATE_COMPLETE_FIELDS_' + role, set(schema['roleRequiredFields'][role]) <= set(templates[name]) and templates[name]['purpose'] == role)
pending = templates['rootProposal']['proposedAuthorization']
for key in schema['pendingOnlyNullFields']:
    check('FUTURE_PENDING_NULL_' + key, key in pending and pending[key] is None)
check('PENDING_REQUIRED_EXISTING_FIELDS', set(schema['roleRequiredFields']['ROOT_AUTHORIZATION']) <= set(pending))
check('PENDING_PURPOSE', pending['purpose'] == 'CAPTURE_PENDING_AUTHORIZATION')
check('ROOT_AUTHOR_EXPLICIT_RAW_MAP', templates['rootAuthorExteriorEntry']['purpose'] == 'ROOT_AUTHOR_REQUEST' and 'inputPins' in templates['rootAuthorExteriorEntry'])
check('PRIVATE_FD_POLICY_SCHEMA', schema['currentControlPolicy']['mode'] == 384 and schema['currentControlPolicy']['links'] == 1 and schema['currentControlPolicy']['metadataBeforeBodyAndInterpretation'] is True)
check('PUBLIC_DISTINCT_SCHEMA', schema['publicSourceReviewPolicy']['mode'] == 420)
tree = ast.parse(r)
values = {n.targets[0].id: ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name) and n.targets[0].id in ('PROTOCOL', 'STATUS', 'DISPOSITION', 'GUARANTEE_NAMES', 'UNSUPPORTED_NAMES')}
check('EXACT_PROTOCOL', values['PROTOCOL'] == 'GATEWAY_LOCAL_RUNNER_REPORT_SAMPLED_OBSERVATIONS_V1')
check('EXACT_TERMINAL_STATUS', values['STATUS'] == 'TERMINAL_LOCAL_RUNNER_REPORT_ONLY')
check('EXACT_DISPOSITION', values['DISPOSITION'] == 'LOCAL_TEST_RESULT_WITH_SAMPLED_OBSERVATIONS')
for name in ('rootProposal', 'rootRelease', 'ownerRuling', 'phaseDecision', 'clientActualCompletion', 'negativeStatus', 'guardAdmission', 'actualQa', 'actualReviewAdoption', 'closePermit', 'actualWrapperResult'):
    d = templates[name]
    check('ALL10_FALSE_' + name, set(d['guarantees']) == set(values['GUARANTEE_NAMES']) and all(v is False for v in d['guarantees'].values()))
    check('UNSUPPORTED_NULL_' + name, set(d['unsupportedEvidence']) == set(values['UNSUPPORTED_NAMES']) and all(v == {'value': None, 'reason': 'NOT_PROVED_BY_LOCAL_RUNNER_PROFILE'} for v in d['unsupportedEvidence'].values()))
    check('CLOSED_SCOPE_' + name, d['credit'] is False and d['C8'] is False and d['cleanupAuthorized'] is False and d['sourceWrites'] == [] and d['historicalIdentityUncertainty'] is True)
maps = doc('interpretation-sites.json')
check('ALL16_GROUPS', [x['mapping'] for x in doc('integration-map.json')['groups']] == list(range(1, 17)))
check('SITES_EXACT_COUNT', maps['siteCount'] == len(maps['sites']) == 42 and maps['pythonSiteCount'] == 38)
check('CALLBACK_COUNT', maps['callbackCount'] == len(maps['callbackSites']) == 20)
check('FUNCTION_COUNT', maps['functionCount'] == len(maps['functionSpans']) == 119)
check('RUNTIME_CLASSES', maps['runtimeClasses'] == 6)
for row in maps['functionSpans']:
    lines = (P / row['source']).read_text().splitlines()
    check('SPAN_' + row['source'] + ':' + row['qualifiedOwner'], row['endLine'] <= len(lines) and ('def ' + row['qualifiedOwner'].split('.')[-1] + '(') in lines[row['line'] - 1])
ret = doc('guarded-current-results.json')
new = doc('six-fix-current-results.json')
old = json.loads((P.parent / 'resume8/guarded-current-results.json').read_text())
check('RETAINED159_IDS_EXACT', ret['checks'] == 159 and [x['id'] for x in ret['results']] == [x['id'] for x in old['results']])
check('ALL_CURRENT_GUARDED_PASS', all(x['passed'] is True for x in ret['results'] + new['results']))
check('COMBINED_COUNTS_DISTINCT', new['checks'] == 237 and new['wholeFlowChecks'] == 25 and new['newTargetedChecks'] == 212)
check('CURRENT_UNIQUE371', len({x['id'] for x in ret['results'] + new['results']}) == 371)
check('CURRENT_TEST_RUNTIME_PIN', ret['runtimeSourceSha256'] == new['runtimeSha256'] == sha('runtime.py'))
check('CURRENT_TEST_ENTRY_PIN', ret['entrySourceSha256'] == new['entrySha256'] == sha('entry.py'))
check('NO_TARGET_BOUNDARIES', ret['boundaryAttempts'] == new['boundaryAttempts'] == [] and ret['actualNativeOrOsProviderActions'] == new['actualOsToolNativeProviderPrivateActions'] == 0)
pins = doc('preparation-input-pins.json')
check('PRIOR60_AND45_MEMBERS', len(pins['source8PayloadsVerified']) == 60 and sum(x['payloadCount'] for x in pins['reviewPackets']) == 45)
check('BOTH_OLD_SIX_FINDINGS_RETAINED', all(len(x['mandatoryFindingIds']) == 6 and x['oldFindingsPreservedNonempty'] for x in pins['reviewPackets']))
for f in sorted(P.rglob('*')):
    if f.is_file() and f.name not in ('manifest.json', 'SHA256SUMS', 'static-verification.json'):
        raw = f.read_bytes()
        text = raw.decode('utf-8')
        check('UTF8_NO_FORMAT_CHAR_' + str(f.relative_to(P)), not any(unicodedata.category(c) == 'Cf' for c in text))
output = {'kind': 'SOURCE9_SOURCE_METADATA_STATIC_VERIFICATION', 'checks': len(results), 'results': results, 'subjectCodeExecuted': False, 'shellExecuted': False, 'actualTargetActions': 0, 'selectedPublicInputs': 39, 'limits': 'Source syntax, literal, public-input and documentation consistency only. Current guarded semantic results are reused exactly, not reexecuted by this checker. No actual source/tool/shell/timing or resource acceptance.'}
(P / 'static-verification.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps({'staticChecks': len(results), 'allPassed': True, 'subjectExecuted': False, 'actualTargetActions': 0}))
