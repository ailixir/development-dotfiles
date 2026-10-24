"""Lightweight static audit; deliberately does not compile or execute Java."""
from pathlib import Path
import hashlib
import json
import re
import runpy

HERE = Path(__file__).resolve().parent
b = runpy.run_path(str(HERE / 'build_draft.py'))
ROOT, BASE, NAMES = b['ROOT'], b['BASE'], b['NAMES']
originals, candidates = b['SOURCES'], b['candidates']
mask, method = b['masked'], b['method']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def tokens(s):
    pattern = r'//[^\n]*|/\*[\s\S]*?\*/|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|\w+|[^\s]'
    return [x for x in re.findall(pattern, s) if not x.startswith(('//', '/*'))]


def undo_environment(s):
    for old, new in b['FIELD_RENAMES'].items():
        s = re.sub(r'\bENV\.' + new + r'\b', old, s)
    return s


def undo_waits(s, classname):
    for row in b['wait_rows']:
        if row['class'] != classname:
            continue
        # Only this exact chain is folded back; changes to the condition/final check fail.
        expr = re.escape(row['expression'])
        pattern = (r'org\.awaitility\.Awaitility\.await\(\)\s*\.alias\("[^"]+"\)\s*'
                   r'\.pollInSameThread\(\)\s*\.pollDelay\(Duration.ZERO\)\s*'
                   r'\.pollInterval\(Duration.ofMillis\(25\)\)\s*'
                   r'\.atMost\(Duration.ofMillis\(' + str(row['timeoutMillis']) + r'\)\)\s*'
                   r'\.until\(\(\) -> ' + expr + r'\);\s*assertThat\(' + expr + r'\).isTrue\(\);')
        s = re.sub(pattern, lambda _: 'await(() -> ' + row['expression'] + ', ' + str(row['timeoutMillis']) + ');', s)
    return s


def all_methods(s):
    pattern = r'^ {2,4}(?:(?:public|private|protected|static|final|synchronized) )*(?:<T> )?[\w.<>,?\[\]]+\s+(\w+)\([^;{}]*?\)\s*(?:throws [^{]+)?\{'
    hidden = mask(s)
    found = []
    for m in re.finditer(pattern, s, re.M):
        opening = hidden.index('{', m.start())
        end, depth = opening + 1, 1
        while depth:
            depth += (hidden[end] == '{') - (hidden[end] == '}')
            end += 1
        found.append({'name': m[1], 'signature': tokens(s[m.start():opening]),
                      'body': s[m.start():end], 'line': s[:m.start()].count('\n')+1})
    return found


case_rows = []
method_rows = []
overload_rows = []
for classname in NAMES:
    old, new = originals[classname], candidates[classname]
    names = re.findall(r'  @Test\s+void (\w+)\(', old)
    after_names = re.findall(r'  @Test\s+void (\w+)\(', new)
    assert names == after_names
    normalized = undo_waits(undo_environment(new), classname)
    new_members = all_methods(normalized)
    for member in all_methods(old):
        name = member['name']
        if (name in b['ORPHANS'] and classname == NAMES[0]) or name == 'await':
            disposition = 'named removal'
        elif name in ['startWorker', 'closeWorker', 'governedPolicy', 'token', 'completionFault'] or (name == 'properties' and 'DynamicPropertyRegistry' in member['signature']):
            disposition = 'explicit relocation/lifecycle map'
        else:
            matches = [m for m in new_members if m['signature'] == member['signature']]
            assert len(matches) == 1, (classname, member['signature'], len(matches))
            assert tokens(matches[0]['body']) == tokens(member['body']), (classname, name, member['line'])
            disposition = 'exact tokens after explicit environment/wait mapping'
        overload_rows.append({'class': classname, 'method': name, 'signatureTokens': member['signature'],
                              'originalLine': member['line'], 'disposition': disposition})
    for name in names:
        before_tokens = tokens(method(old, name)[2])
        after_tokens = tokens(method(normalized, name)[2])
        assert before_tokens == after_tokens, (classname, name)
        case_rows.append({'class': 'com.citi.put.checks.studio.guided.session.' + classname,
                          'method': name, 'before': 1, 'dropped': 0, 'added': 0, 'after': 1,
                          'tokensEqualAfterExplicitEnvironmentAndWaitMap': True,
                          'originalTokensSha256': sha(json.dumps(before_tokens).encode()),
                          'assertionStarts': len(re.findall(r'\bassert\w*\s*\(', method(old, name)[2]))})
    # Inspect every original method, including nested Spring/FixtureAccess overrides.
    method_names = set(re.findall(r'^ {2,4}(?:(?:public|private|protected|static|final|synchronized) )*(?:<T> )?[\w.<>,?\[\]]+\s+(\w+)\([^;{}]*?\)\s*(?:throws [^{]+)?\{', old, re.M))
    for name in sorted(method_names):
        if name in b['ORPHANS'] and classname == NAMES[0]:
            disposition = 'orphan closure removed; no class-typed external caller; not override'
        elif name in ['properties', 'governedPolicy', 'token', 'completionFault']:
            disposition = 'exact original implementation relocated to per-class environment; local adapter retained'
        elif name in ['startWorker', 'closeWorker']:
            expanded = method(normalized, name)[2]
            if name == 'startWorker':
                scenario_call = ('    String testName = ENV.prepareScenario(testInfo);\n' if classname == NAMES[1]
                                 else '    ENV.prepareScenario(testInfo);\n')
                expanded = expanded.replace(scenario_call, b['scenario_body'])
                expanded = expanded.replace('    ENV.isolateDatabase(fixtureDataSource);\n', b['database_body'])
                expanded = expanded.replace('    ENV.resetWorkerState();\n', b['reset_body'])
                expanded = expanded.replace('    Path journal = ENV.prepareWorkerJournal();\n', b['journal_body'])
                expanded = expanded.replace('    workerHarness = ENV.startWorker(journal, backendPort);\n    workerHarness.awaitReady(Duration.ofSeconds(60));',
                                            b['before'][b['worker_start']:b['worker_end']])
            else:
                expanded = expanded.replace('    ENV.closeWorker(harness);', b['cleanup_body'])
            assert tokens(expanded) == tokens(method(old, name)[2]), (classname, name, 'lifecycle expansion')
            disposition = 'named exact common fragments relocated; lifecycle order preserved, class-specific fragments retained'
        elif name == 'await':
            disposition = 'wrapper removed; seven direct Awaitility chains retain old expression/deadline/25ms/immediate/same-thread/final assertion'
        else:
            assert tokens(method(old, name)[2]) == tokens(method(normalized, name)[2]), (classname, name)
            disposition = 'token-identical after explicit field-ownership and wait mapping'
        method_rows.append({'class': classname, 'method': name, 'disposition': disposition,
                            'originalLine': old[:method(old, name)[0]].count('\n') + 1})

# No Java class-typed caller/reflective class-name reference exists outside the two owners.
external_refs = []
for path in (ROOT / 'backend/src').rglob('*.java'):
    if path in [ROOT / BASE / (name + '.java') for name in NAMES]:
        continue
    content = path.read_text()
    for name in NAMES:
        if name in content:
            external_refs.append({'path': str(path.relative_to(ROOT)), 'class': name,
                                  'codeOrStringReference': name in ''.join(tokens(content))})
assert not any(row['codeOrStringReference'] for row in external_refs), external_refs

start = json.loads((ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/start-capture.json').read_text())
start_files = {item['path']: item for item in start['files']}
owned = []
for rel, text in b['paths'].items():
    actual = ROOT / rel
    source_hash = sha(actual.read_bytes()) if actual.exists() else None
    if actual.exists():
        assert source_hash == start_files[str(rel)]['sha256']
    else:
        assert str(rel) not in start_files
    owned.append({'path': str(rel), 'operation': 'edit' if actual.exists() else 'new',
                  'preimageSha256': source_hash, 'candidateSha256': sha(text.encode()),
                  'actualPreimageMatchesS011': True, 'candidateLines': len(text.splitlines())})

main_rows = []
for rel, row in start_files.items():
    if rel.startswith('backend/src/main/'):
        current = sha((ROOT / rel).read_bytes())
        assert current == row['sha256'], rel
        main_rows.append({'path': rel, 'sha256': current})
actual_main_members = {str(p.relative_to(ROOT)) for p in (ROOT / 'backend/src/main').rglob('*') if p.is_file()}
assert actual_main_members == {row['path'] for row in main_rows}

sleep_rows = []
for classname in NAMES:
    s = originals[classname]
    for i, line in enumerate(s.splitlines(), 1):
        if '.sleep(' not in line:
            continue
        poll = 'Thread.sleep(25)' in line
        reason = ('bounded 25ms condition polling; seven explicit direct waits replace this wrapper' if poll else
                  'conditional slow HTTP navigation stimulus, not polling; current suites only reset it to0, so this dormant seam is preserved without an exercised timing claim; interrupt restoration unchanged'
                  if 'slowNavigationMillis' in line else
                  '100ms source-row lock observation window: consume must remain blocked before releasing editor' if '(100)' in line else
                  '200ms late-renewal-response observation window: release callback then prove stopped ownership/context cannot revive')
        sleep_rows.append({'class': classname, 'originalLine': i, 'statement': line.strip(),
                           'classification': 'POLL' if poll else 'DELIBERATE', 'reason': reason,
                           'candidate': 'seven explicit chains in same owning test class' if poll else
                           'shared per-class fixture slow-navigation handler' if 'slowNavigationMillis' in line else 'same test method, unchanged'})
assert len(sleep_rows) == 6
assert sum(row['classification'] == 'POLL' for row in sleep_rows) == 2
fixture = b['fixture']
assert len(re.findall(r'\.sleep\(', fixture)) == 1
assert sum(len(re.findall(r'\.sleep\(', s)) for s in candidates.values()) == 2
assert all('static void await(' not in s for s in [fixture, *candidates.values()])
assert len(re.findall(r'org\.awaitility\.Awaitility\.await\(', ''.join(candidates.values()))) == 14
assert 'new RunnerProcessHarness.Guided(' in fixture
assert '.awaitReady(Duration.ofSeconds(60));' not in fixture
assert all('workerHarness = ENV.startWorker(journal, backendPort);\n    workerHarness.awaitReady(Duration.ofSeconds(60));' in s for s in candidates.values())

input_paths = [str(BASE / (name + '.java')) for name in NAMES] + [
    'AGENTS.md', '.codex/skills/aiox-dev/SKILL.md', '.aiox-core/development/agents/dev.md',
    '.aiox-core/constitution.md', 'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md',
    'docs/qa/evidence/STUDIO-OBS-011/t0/start-capture.json',
    'docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v7.json',
    *['docs/qa/evidence/STUDIO-OBS-011/t0/w-brief.v' + str(v) + '.md' for v in range(3, 8)],
    'docs/qa/evidence/STUDIO-OBS-011/t0/resume2-root-state.json',
    'docs/qa/evidence/STUDIO-OBS-011/t0/t0-record.md',
    'docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/w2-window01/aria-bridge-ruling01/ruling.md',
    'backend/build.gradle.kts',
    'backend/src/test/java/com/citi/put/checks/studio/support/RunnerProcessHarness.java',
    'backend/src/test/java/com/citi/put/checks/studio/support/RunnerTestTls.java',
    'backend/src/test/java/com/citi/put/checks/studio/support/ObservedPublicationFixture.java',
    'backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java',
    'backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedProductionSessionAccess.java',
    'backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationService.java']
inputs = [{'path': rel, 'sha256': sha((ROOT / rel).read_bytes())} for rel in input_paths]

state_rows = []
for old, new in b['FIELD_RENAMES'].items():
    uses = {}
    for classname in NAMES:
        content = mask(originals[classname])
        lines = []
        for m in re.finditer(r'\b' + old + r'\b', content):
            suffix = content[m.end():m.end()+100]
            role = 'assignment' if re.match(r'\s*=(?!=)', suffix) else 'read/member/argument/declaration'
            lines.append({'line': content[:m.start()].count('\n')+1, 'role': role})
        uses[classname] = lines
    state_rows.append({'beforeStaticField': old, 'afterPerClassEnvironmentMember': new, 'uses': uses})

report = {'scope': 'off-tree static preparation only; no compile/runtime/formatter/gate approval',
          'sourceDigestS011': start['digest'], 'owned': owned, 'inputs': inputs,
          'mainMembershipAndHashesEqualS011': True, 'mainFilesChecked': len(main_rows),
          'caseReconciliation': {'before': 26, 'namedDrops': [], 'namedAdds': [], 'after': 26,
                                 'byClass': {'GuidedBridgeIntegrationTest': 10, 'GuidedBridgePlannedIT': 16}},
          'caseRows': case_rows, 'allOriginalMethods': method_rows, 'externalClassCallers': external_refs,
          'allOriginalOverloads': overload_rows,
          'sleepRows': sleep_rows, 'waits': b['wait_rows'],
          'patchSha256': sha((HERE / 'candidate.patch').read_bytes()),
          'unexecuted': ['Java compilation', 'Spotless/checkstyle', 'bridge runtime', 'F1 freeze proof',
                         'full prescribed FOLD gate', '11G final suite', 'AC5 valid before-after wall-time proof'],
          'devLoadAlwaysFiles': 'configured docs/framework files and matching fallback names do not exist; no invented replacements',
          'knownOtherSourceException': 'Root-owned live diagnostic ReplayIT candidate is not an owned file and was not written or normalized'}
(HERE / 'static-audit.json').write_text(json.dumps(report, indent=2) + '\n')
(HERE / 'state-reader-map.json').write_text(json.dumps(state_rows, indent=2) + '\n')
(HERE / 'main-s011-hashes.json').write_text(json.dumps(main_rows, indent=2) + '\n')
print(json.dumps({'cases': len(case_rows), 'originalMethodsClassified': len(method_rows),
                  'ownedPaths': len(owned), 'mainFiles': len(main_rows), 'inputs': len(inputs),
                  'sleepRows': len(sleep_rows), 'staticAuditSha256': sha((HERE / 'static-audit.json').read_bytes())}, indent=2))
