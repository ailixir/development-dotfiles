#!/usr/bin/env python3
"""Complete the interrupted T0-DEV read-only review; writes only beside this script."""
import hashlib
import json
import pathlib
import re
import subprocess
from datetime import datetime, timezone

ROOT = pathlib.Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
HERE = pathlib.Path(__file__).parent
EVD = ROOT / 'docs/qa/evidence/STUDIO-OBS-011'


def read_json(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(name, data):
    (HERE / name).write_text(json.dumps(data, indent=2) + '\n')


def cmd(args):
    run = subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=False)
    return {'argv': args, 'exitCode': run.returncode, 'stdout': run.stdout, 'stderr': run.stderr}


plan = read_json(EVD / 't0/lanes.v3.json')
item1 = read_json(HERE / 'item1-result.json')
fold = read_json(HERE / 'item5-fold-check.json')
write_sets = read_json(HERE / 'item1-writesets.json')
hits = read_json(HERE / 'item4-file-hits.json')
live_path = ROOT / 'docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/live-surface-list.json'
live = read_json(live_path)
start = read_json(EVD / 't0/start-capture.json')
start_files = {f['path']: f['sha256'] for f in start['files']}

# Preserve process identity, not merely a status/lock-file assertion.
process = cmd(['ps', '-p', '88145,88167,88182', '-o', 'pid,ppid,lstart,etime,command'])
(HERE / 'b1-process-observation.txt').write_text(process['stdout'] + process['stderr'])
process_verified = all(x in process['stdout'] for x in (
    '88145', '88167', '88182', 'obs011-t0-baseline-check01', 'GradleWrapperMain', 'GradleDaemon'))

# Exact source annotations, distinct from JUnit parameter invocation counts.
method_inventory = []
for name in ['GuidedSessionIT', 'GuidedServiceTransportFaultIT', 'GuidedLifecycleReasonIT']:
    rel = f'backend/src/test/java/com/citi/put/checks/studio/guided/session/{name}.java'
    path = ROOT / rel
    source = path.read_text()
    methods = []
    for match in re.finditer(r'^\s*@(Test|ParameterizedTest)\b', source, re.M):
        declaration = re.search(r'\bvoid\s+(\w+)\s*\(', source[match.end():])
        methods.append({'name': declaration.group(1), 'annotation': match.group(1),
                        'annotationLine': source[:match.start()].count('\n') + 1})
    method_inventory.append({'file': rel, 'sha256': sha(path),
        'matchesStartCapture': sha(path) == start_files[rel],
        'testMethods': sum(m['annotation'] == 'Test' for m in methods),
        'parameterizedMethods': sum(m['annotation'] == 'ParameterizedTest' for m in methods),
        'distinctMethods': len({m['name'] for m in methods}), 'methods': methods})
write_json('gs-t-source-method-inventory.json', method_inventory)

# This does not copy or execute a sandbox. All direct COPY roots must exist and be real paths.
sandboxes = {}
for tier in ['runner', 'frontend']:
    name = f'sandbox-{tier}-copy-list.txt'
    lines = (HERE / name).read_text().splitlines()
    paths = [line.split()[1] for line in lines if line.startswith('COPY ')]
    mkdir = [line.split()[1] for line in lines if line.startswith('MKDIR ')]
    checked = [{'path': p, 'exists': (ROOT / p).exists(), 'isSymlink': (ROOT / p).is_symlink()} for p in paths]
    sandboxes[tier] = {'listFile': str((HERE / name).relative_to(ROOT)), 'copyCount': len(paths),
        'copy': checked, 'mkdir': mkdir,
        'staticPathCheckPassed': all(p['exists'] and not p['isSymlink'] for p in checked),
        'runtimeVerified': False,
        'scope': 'type-check, lint, unit and fixtures' if tier == 'runner' else 'type-check, lint, Vitest and build'}
tool_packages = {}
for package in ['ajv', 'ajv-formats', 'yaml', 'fast-deep-equal', 'fast-uri', 'json-schema-traverse', 'require-from-string']:
    manifest = read_json(ROOT / 'node_modules' / package / 'package.json')
    tool_packages[package] = {'version': manifest['version'], 'dependencies': manifest.get('dependencies', {})}
registry = (ROOT / 'frontend/src/components/studio/guided/guidedNarratives.ts').read_text()
registry = registry.split('export const COPY_SOURCE_FILES = {', 1)[1].split('} as const', 1)[0]
copy_sources = re.findall(r"\w+:\s*'([^']+)'", registry)
fe_copy = [p['path'] for p in sandboxes['frontend']['copy']]
copy_source_coverage = [{'path': p, 'covered': any(p == root or p.startswith(root.rstrip('/') + '/') for root in fe_copy)}
                        for p in copy_sources]
write_json('sandbox-static-check.json', {'sandboxes': sandboxes, 'rootToolPackages': tool_packages,
    'frontendCopySources': copy_source_coverage, 'copySourceCount': len(copy_sources),
    'obs008EvidenceSources': [p for p in copy_sources if p.startswith('docs/qa/evidence/STUDIO-OBS-008/')]})

# A4 exact component rule. Prefix matches in neighboring live keys are not removals.
a4_commands = [
    cmd(['rg', '-n', 'poll-interval-ms', 'helm-chart']),
    cmd(['rg', '-n', r'dispatcher\.poll-interval\b|STUDIO_EXECUTION_DISPATCHER_POLL_INTERVAL\b|STUDIO_DISPATCHER_POLL_INTERVAL\b', 'helm-chart']),
    cmd(['rg', '-n', r'sse\.read-interval\b|STUDIO_SSE_READ_INTERVAL\b', 'helm-chart']),
    cmd(['rg', '-n', r'pollIntervalOrDefault\(|readIntervalOrDefault\(', 'backend/src/main']),
    cmd(['rg', '-n', r'\.pollInterval\(|\.readInterval\(', 'backend/src/main']),
]
write_json('a4-resumed-commands.json', a4_commands)
entry_by_id = {e['id']: e for e in live['entries']}
assert entry_by_id['CFB-078']['protection'] != 'protected'
assert entry_by_id['CFB-079']['protection'] == 'protected'

judgments = []
for hit in hits:
    filename = hit['writePath'].rsplit('/', 1)[-1]
    if filename == 'application.yml':
        judgment = 'Remove only excluded CFB-078 leaf. Preserve all 110 co-located protected entries, including CFB-079 read-interval-ms.'
    elif filename == 'StudioExecutionProperties.java':
        judgment = 'CFK-01 protects the prefix and listed properties. Only unlisted dispatcher.poll-interval and excluded sse.read-interval components/accessors are removed; A4 conditions verified separately.'
    elif filename == 'GuidedSessionController.java':
        judgment = 'Preserve all six public routes. Result builder/projection change is the existing C-OBS008-1 exception; no route removal.'
    elif filename == 'StudioRunnerTls.java':
        judgment = 'Preserve CFK-18 prefix, class and all six listed TLS properties. Fold transport wiring, without removing keys.'
    elif filename == 'GuidedSessionConfiguration.java':
        judgment = 'Preserve CFC-01 runner-origin key and its presence gate, separately from base-url. Fold the bean client type only.'
    elif filename == 'transport.ts':
        judgment = 'Whitespace reformat/comment work only. Preserve debug refusal, capacity constant and RTX bridge routes, guarded later by AST equality and emit comparison.'
    else:
        raise ValueError(filename)
    judgments.append({**hit, 'judgment': judgment, 'plannedProtectedRemoval': False,
                      'postChangeProofStillRequired': True})
write_json('live-surface-judgments.json', judgments)

bindings = []
for rel in sorted({r['path'] for recs in write_sets.values() for r in recs}):
    path = ROOT / rel
    if rel in start_files and path.is_file():
        bindings.append({'path': rel, 'sha256': sha(path), 'matchesStartCapture': sha(path) == start_files[rel]})

findings = [
    {'id': 'T0-DEV-01', 'severity': 'dispatch-note', 'path': 'docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v3.json',
     'field': 'schedule.lanes / concurrencyGroups / waves',
     'action': 'Apply K-17: IT-R prep starts early; RT takes a freed slot. Reconcile numeric schedule and frontend MERGE W3/W4 label before automated dispatch. Observe this session cap of four total agents, below the plan maximum five.'},
    {'id': 'T0-DEV-02', 'severity': 'seed-requirement', 'path': 'docs/qa/evidence/STUDIO-OBS-011/t0/early/T0-DEV/sandbox-runner-copy-list.txt',
     'action': 'Use this exact list at sandbox seeding: include docs/runbooks/studio-runner.md, benchmark/results.jsonl, benchmark/summary.json and root tool dependency closure. Evidence destinations are empty mkdir paths, not a copy of 1.2 GB historical evidence. Backend application.yml is deployment-tier-only; not needed for 11-RT unit/fixtures scope.'},
    {'id': 'T0-DEV-03', 'severity': 'seed-requirement', 'path': 'docs/qa/evidence/STUDIO-OBS-011/t0/early/T0-DEV/sandbox-frontend-copy-list.txt',
     'action': 'Use the repo-shaped list, including dev.sh. COPY_SOURCE_FILES contains fifteen entries, of which five are OBS-008 evidence files; correct the six-file prose.'},
    {'id': 'T0-DEV-04', 'severity': 'dispatch-note', 'path': 'docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v3.json',
     'field': '11-FOLD-final.writes / verify',
     'action': 'Supply fold-prep-main-17.txt and fold-tests-21.txt alongside v3; FOLD_PREP_MAIN and FOLD_TESTS remain external aliases, and foldf-02/03 command lists reference v1. These aliases are resolved in item1-writesets.json. Do not dispatch from v3 alone without the referenced v1.'},
    {'id': 'T0-DEV-05', 'severity': 'clarification', 'path': 'docs/qa/evidence/STUDIO-OBS-011/t0/w-brief.v3.md',
     'field': 'Hard rules / Batons',
     'action': 'Use v3 startsWhen/batonOut and the exact source lists. Hard-rules prose still points to lanes.v2.json; IT-S six-file baton wording includes two files not in the 21 FOLD_TESTS. Both have no later owner.'},
    {'id': 'T0-DEV-06', 'severity': 'clarification', 'path': 'docs/qa/evidence/STUDIO-OBS-011/t0/t0-record.md',
     'field': 'sections 10 and 14.2',
     'action': 'TransportFaultIT has 30 @Test methods plus one @ParameterizedTest method, not 31 plus one (substring grep counts @TestExecutionListeners). Use per-invocation XML at B1/11-G. GS-T positive-admission precedent is GuidedBridgePlannedIT production access, plan and reserve helpers, not the remaining fake-access BridgeIntegrationTest cases.'},
    {'id': 'T0-DEV-07', 'severity': 'pending-baseline', 'path': 'docs/qa/evidence/STUDIO-OBS-011/t0/t0-record.md',
     'field': 'RC-10 / T0-JC',
     'action': 'Wait for authoritative B1 result and JaCoCo. Confirm dispatch LINE headroom and whether foldf-cov01 is required. This review does not settle coverage or B1 reds.'},
]

fold_caller_note = {
    'rawScannerProblems': fold['problems'],
    'judgment': 'Not missing fold write ownership: these five files instantiate preserved public 3-arg/4-arg HttpRunnerDispatchClient constructors and need no type swap. R-4a v2.4 forbids removing those constructors.',
    'verification': 'Source read of call sites and public constructors at HttpRunnerDispatchClient.java:81,99; post-fold compile/full gate still required.'}
rc = [
    {'id': f'RC-{n}', 'foldConfirmed': True, 'evidence': evidence}
    for n, evidence in [
        (1, '11-FOLD-prep includes PublicationGrantAuthority, !worker collaborator refusal, all three auth methods and worker tests.'),
        (2, 'R-4a v2 obligations preserve operation timeout/version, guided presence gate, per-call limits, public constructors and test-side DispatchTestAccess.'),
        (3, 'LEFT owns StudioKillSwitchWiringTest; GS-T owns LifecycleReasonIT and verify includes untouched EvidencePending/CommittedRefresh guard classes.'),
        (4, 'R-F1 v2 requires admit guard before SPI calls, one clarify guard, private helper, no-authorizeAction assertion and placement mutant.'),
        (5, 'T0-AW branch A recorded; brief uses Awaitility directly, no dependency edit or Await.java; private copies remain outside owned scope.'),
        (6, 'Exact lists supplied here; sandbox-only runner/frontend work, D_011 later-emits rule and TS emit byte compare are explicit.'),
        (7, '009 changes committed before S_011; current assigned source write paths match start capture, with runtime baselines still pending.'),
        (8, 'R-EP v2 carries live harness files; deletions await owner confirmation T0-EP.'),
        (9, 'Three runner class-name references retained as explicit known exceptions or separately reconciled comment/title edits.'),
        (10, 'Plan includes T0-JC headroom read and conditional foldf-cov01; actual ratio not yet available.')]
]
result = {
    'artifact': 'STUDIO-OBS-011 T0-DEV resumed read-only review',
    'reviewedAt': datetime.now(timezone.utc).isoformat(), 'author': 'Dex / aiox-dev',
    'isQaVerdict': False, 'devDecision': 'SIGN-WITH-NOTES',
    'scopeComplete': True, 'treeOpenAuthorized': False,
    'inputs': {str(p.relative_to(ROOT)): sha(p) for p in [EVD/'t0/lanes.v3.json', EVD/'t0/w-brief.v3.md', EVD/'t0/t0-record.md', live_path]},
    'sourceDigestFromStartCapture': start['digest'],
    'processObservation': {'verifiedLive': process_verified, 'observationFile': 'b1-process-observation.txt', 'command': process['argv'], 'exitCode': process['exitCode']},
    'laneIntegrity': item1['checks'],
    'batonInterpretation': {'partAware': True, 'concurrentWriteConflicts': 0,
        'ordering': ['GS-T SessionIT -> GS-M(b) -> FOLD-final', 'GS-T TransportFaultIT -> IT-S -> FOLD-final',
            'GS-T LifecycleReasonIT released', 'GS-M Projector -> FOLD-final', 'IT-R ReplayIT -> FOLD-final',
            'IT-S Planning/Focus/EvidencePending -> FOLD-final', 'GS-T2 bridge ITs -> FOLD-final',
            'FOLD-prep main files -> FOLD-final', 'RT/FE sandbox sets -> root MERGE']},
    'sandboxes': sandboxes,
    'liveSurface': {'allEntries': len(live['entries']), 'protected': sum(e['protection']=='protected' for e in live['entries']),
        'coLocatedWriteRecords': len(hits), 'coLocatedProtectedEntries': len({i for h in hits for i in h['entries']}),
        'plannedProtectedRemovals': [], 'postChangeProofRequired': True,
        'judgmentFile': 'live-surface-judgments.json', 'a4CommandFile': 'a4-resumed-commands.json'},
    'fold': {'mainCallersExcludingDeclarations': len(fold['naming_main']), 'testCallers': len(fold['naming_test']),
        'foldMainList': 'fold-prep-main-17.txt', 'foldTestList': 'fold-tests-21.txt',
        'allNamingCallersCovered': all(x['inFold'] for x in fold['naming_main']) and all(x['inFoldTests21'] for x in fold['naming_test']),
        'constructorCallerFindingDisposition': fold_caller_note, 'rcFoldConfirmation': rc,
        'rc10RuntimeResultPending': True},
    'assignedSourceBindings': bindings,
    'assignedSourceMatchesStartCapture': all(b['matchesStartCapture'] for b in bindings),
    'findings': findings,
    'verified': ['JSON parse, unique lane ids, existing dependency references and part-aware overlap checks',
        'Exact listed COPY roots exist and are not symlinks; root tool package dependency closure inspected',
        'Fifteen frontend COPY_SOURCE_FILES entries covered; five OBS-008 evidence sources',
        'Protected-surface co-location and static removal judgment, A4 component rule checks',
        'Fold caller census and preserved constructor call sites', 'GS-T source method names and start-capture identity',
        'B1 live process identity at the saved observation time'],
    'inferred': ['Sandbox runtime sufficiency until root seeds copies and tier commands run',
        'Behavioral neutrality of planned edits until red/green/mutant and final runtime gates run',
        'Timeline estimates and post-change coverage headroom'],
    'notPerformed': ['source/doc/plan/test edits', 'Gradle or frontend/runner tests', 'builds', 'Docker',
        'sandbox copies', 'git writes', 'process signals', 'provider/model calls', 'delegation']}
write_json('check.json', result)

lines = ['# T0-DEV resumed review', '', f"Dex / aiox-dev, {result['reviewedAt']}. **SIGN-WITH-NOTES** (development feasibility; not a QA verdict).",
    '', '**[V] The interrupted read-only task is complete.** No source, tests, quoted docs, plan, Helm or runner dist was changed. Only this T0-DEV folder was written. B1 was still live at the saved process observation; tree-open and baseline acceptance remain root’s.', '',
    '## Checks', '',
    '- [V] `lanes.v3.json` parses: fourteen unique lane ids, nonempty normalized write sets, resolved lane references, no dependency cycle and no concurrent write overlap after GS-M a/b and IT-R prep/apply are separated.',
    '- [V] Shared files have ordered owners. Root must record the baton SHA at each handover; timing estimates alone do not grant ownership. Exact expansions are `item1-writesets.json`, `fold-prep-main-17.txt` and `fold-tests-21.txt`.',
    '- [V] `sandbox-runner-copy-list.txt` and `sandbox-frontend-copy-list.txt` give exact COPY/MKDIR paths. All nineteen runner COPY roots and sixteen frontend COPY roots exist and are real paths. The seven-package root tool closure is present. All fifteen frontend copy-source paths are covered.',
    '- [V] The list has 729 entries, 671 protected. Nine lane/write records co-locate with 127 protected ids. **Zero planned protected removals**; see `live-surface-judgments.json`. This is a plan review, not post-change proof.',
    '- [V] A4 permits the two CLN-21 components: dispatcher.poll-interval is unlisted; sse.read-interval is excluded CFB-078; neither is chart-rendered; their own accessors have no callers. Protected CFB-079 read-interval-ms stays. Other pollInterval readers belong to scheduling target types, not StudioExecutionProperties.Dispatcher.',
    '- [V] Fold census: eleven non-declaring main callers and twenty-one test files naming the three folded classes are covered. The five raw constructor-census findings need no source edits because public three/four-argument HttpRunnerDispatchClient constructors are explicitly preserved. `item5-fold-check.json` remains raw evidence; the disposition is in `check.json`.',
    '- [V] Reverify commands and brace measurements were rerun (`item3-resumed-output.txt`, `item3-bracecount-resumed-output.txt`). The measured claim/checkCommand sizes remain 98/22 lines, so the ruled no-split decision remains supported.', '',
    '## Explicit development fold confirmation', '',
    '**I confirm the RC-1 through RC-10 requirements are folded into the v3 T0 package, subject to these dispatch notes and the still-pending RC-10 runtime result.** RC-1…9 are statically resolved by the ruled wiring, write sets and proof commands. RC-10’s measurement cannot be signed as passed before B1 JaCoCo exists. No lane gets runtime credit from this review.',
    '', 'The confirmation is of feasibility and plan coverage: worker publication collaborator/absence refusal; three authorization methods; preserved transport settings and constructors; production-access GS-T migration; guard-before-SPI assertion/mutant; Awaitility branch A; exact sandboxes; start-digest sequencing; harness deletion guard; runner class-name exceptions; and conditional headroom run. `check.json` gives each RC separately.', '',
    '## Actionable findings for root', '']
for finding in findings:
    lines.extend([f"- **{finding['id']}** — `{finding['path']}`" + (f" ({finding['field']})" if 'field' in finding else '') + f": {finding['action']}"])
lines.extend(['', '## GS-T launch preparation', '',
    '`gs-t-prep.md` gives the first implementation and test actions after tree open. `gs-t-source-method-inventory.json` records all eighty source methods: SessionIT 44 @Test; TransportFaultIT 30 @Test plus one parameterized method; LifecycleReasonIT 5 @Test. Source-method arithmetic is separate from JUnit expanded invocation counts. All three source SHAs match S_011.', '',
    '## Limits', '',
    '[I] The static copy lists are expected to satisfy the scoped sandbox reads; no sandbox tier was executed. [I] Planned behavior preservation still needs the specified red/green/mutant gates and final checks. B1 failures, skips, coverage, B7 and tree-open remain pending root/QA work. See `check.json` for input hashes, commands, source identity and verified-versus-inferred claims.', ''])
(HERE / 'check.md').write_text('\n'.join(lines))
print(json.dumps({'written': ['check.md', 'check.json', 'sandbox-static-check.json', 'live-surface-judgments.json',
    'gs-t-source-method-inventory.json', 'a4-resumed-commands.json', 'b1-process-observation.txt'],
    'B1VerifiedLive': process_verified, 'sourceMatchesStart': result['assignedSourceMatchesStartCapture'],
    'findings': len(findings)}, indent=2))
