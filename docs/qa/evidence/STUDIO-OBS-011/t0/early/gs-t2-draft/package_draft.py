from pathlib import Path
import hashlib
import json
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[6]
audit = json.loads((HERE / 'static-audit.json').read_text())
plan = json.loads((ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v7.json').read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


# Independently reconstruct every hunk against exact current owned preimages.
lines = (HERE / 'candidate.patch').read_text().splitlines(keepends=True)
position, reconstructed = 0, []
while position < len(lines):
    assert lines[position].startswith('--- ')
    before = lines[position][4:].strip()
    after = lines[position + 1][4:].strip()
    rel = after.removeprefix('b/')
    old = (ROOT / rel).read_text().splitlines(keepends=True) if before != '/dev/null' else []
    result, cursor = [], 0
    position += 2
    while position < len(lines) and not lines[position].startswith('--- '):
        h = re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@', lines[position])
        assert h, lines[position]
        old_start = int(h[1]) - 1 if int(h[1]) else 0
        result.extend(old[cursor:old_start])
        cursor = old_start
        position += 1
        while position < len(lines) and not lines[position].startswith(('@@ ', '--- ')):
            line = lines[position]
            assert line[:1] in [' ', '-', '+']
            if line[:1] in [' ', '-']:
                assert old[cursor] == line[1:]
                cursor += 1
            if line[:1] in [' ', '+']:
                result.append(line[1:])
            position += 1
    result.extend(old[cursor:])
    assert ''.join(result) == (HERE / 'candidates' / rel).read_text()
    reconstructed.append(rel)
assert reconstructed == [row['path'] for row in audit['owned']]

n24 = 'export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"'
lock = 'python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py'
bk = 'python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py'
prefix = n24 + '\n' + lock + ' ' + bk
commands = []
for lane in plan['lanes']:
    if lane['id'] not in ['11-GS-T', '11-GS-M', '11-GS-T2', '11-FOLD-final']:
        continue
    for command in lane['verify']:
        if '<BACKEND_FORM>' in command:
            commands.append({'lane': lane['id'], 'source': 'lanes.v7.json verify, macro expanded only',
                             'command': command.replace('<BACKEND_FORM>', prefix)})
        elif command.startswith('(repo root) export PATH='):
            commands.append({'lane': lane['id'], 'source': 'lanes.v7.json verify, repo-root marker removed only',
                             'command': command.removeprefix('(repo root) ')})
(HERE / 'planned-gates.json').write_text(json.dumps({'status': 'ALL UNEXECUTED', 'commands': commands}, indent=2) + '\n')

(HERE / 'commands.md').write_text('''# Unexecuted staged and runtime commands

These are future commands, not authorization or executed evidence. Root must first close and restore the live diagnostic, open the tree, complete the unchanged-main GS-T gate, and finish GS-Mb's credited F1 window. Revalidate all owned preimages/new-file absence and refresh changing documentary input bindings. Never apply GS-T2 before the F1 unchanged bridge proof. Allocate fresh labels at execution; the example labels below do not reserve a label or permit reruns.

The entire three-file unit is applied and compiled within one shared lock hold. The actual owner must retain exact preimages and roll back only its owned edits if compilation fails; a temporary or unexpected user edit must never be overwritten. Formatting/checkstyle have not run and belong in the authorized staged unit before its final compile/hash capture.

```sh
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py sh -c 'git apply --check docs/qa/evidence/STUDIO-OBS-011/t0/early/gs-t2-draft/candidate.patch && git apply docs/qa/evidence/STUDIO-OBS-011/t0/early/gs-t2-draft/candidate.patch && cd backend && ./gradlew compileTestJava --no-daemon'
```

Before every backend run, record listeners using `lsof -nP -iTCP -sTCP:LISTEN`, plus the required host load/memory observations for any credited timing. The bridge lane run is:

```sh
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-gst2-01 --test-tasks test -- test --tests 'com.citi.put.checks.studio.guided.session.GuidedBridgeIntegrationTest' --tests 'com.citi.put.checks.studio.guided.session.GuidedBridgePlannedIT' --no-daemon
```

`planned-gates.json` contains every full, macro-expanded GS-T, GS-Ma/b (including all three F1 freeze commands), GS-T2 and prescribed FOLD-final backend command from the adopted v7 plan, with declared-package FQCNs. It preserves their exact task sets, conditional coverage command and separate clock cleanup command. All are unexecuted. Root must enforce actual fresh execution rather than infer success from UP-TO-DATE tasks, old XML, copied report mtimes or labels. No historical skip policy is applied to a subset run. No full-class ReplayIT command may be reduced, merged with another class or replaced by a single-method rerun.

GS-Mb must snapshot the original bridge/Planning/Replay bytes before its main edit, hold root's freeze, and obtain b01/b02/b03 exit0/sourceStable/distStable with the unchanged four test sources. GS-T2 then records its own 10+16 per-name results and hands both modified bridge files plus the new fixture to FOLD-final for current-base type/constructor ports. FOLD's full01–04 sets, worker/client assertion, exact final ClockIT cleanup, any required fresh coverage proof and 11G remain mandatory. No snapshot from this S011-based draft substitutes for a post-GS-Mb or FOLD baton.

AC5 timing remains open: B1's failed/truncated baseline is not a green before sample, and the current diagnostic cannot serve as this lane's timing comparison. The exact named set and a root/QA-approved executed comparison must be retained without increasing any deadline, deleting cases, weakening assertions or silently carrying a failure.
''')

owned_table = '\n'.join('| `' + row['path'].split('/')[-1] + '` | `' + (row['preimageSha256'] or 'NEW / absent') + '` | `' + row['candidateSha256'] + '` |' for row in audit['owned'])
sleep_table = '\n'.join('| ' + row['class'] + ':' + str(row['originalLine']) + ' | ' + row['classification'] + ' | ' + row['reason'] + ' |' for row in audit['sleepRows'])
orphan_json = json.loads((HERE / 'orphan-helpers.json').read_text())
orphan_names = list(orphan_json['GuidedBridgeIntegrationTest'])
assert len(orphan_names) == 9
receipt = '''# GS-T2 off-tree preparation receipt

Dex backend integration-test specialist. Complete three-path S011-based draft; compilation, formatting, runtime and all gate/QA/lifecycle approvals remain unexecuted. Only this evidence folder was written. No actual source, story, plan, unrelated evidence, process or live diagnostic was changed.

`candidates/` and `preimages/` preserve repository-relative paths. `candidate.patch` includes both existing test files and the new fixture. The new fixture intentionally declares `com.citi.put.checks.studio.guided.session`, matching the tests despite its `guided/bridge/support/` location; package-private session APIs stay accessible with no main/package/public-API changes.

| File | Exact S011 preimage SHA256 | Candidate SHA256 |
| --- | --- | --- |
''' + owned_table + '''

Patch SHA256: `''' + audit['patchSha256'] + '''`.

The common fixture has one independently owned `ENV` per test class. It owns each class's contracts/database/temp/dist/TLS/issuer/free port/application server/scenario flags/counters/latches. It moves the byte-identical HTTP routes, worker provenance capture, CA/issuer setup, initial migration, dynamic TLS properties, governed read policy, JWT signing, callback fault filter, per-test database isolation, shared scenario reset, worker journal/start and teardown checks. `state-reader-map.json` records every old field occurrence and its explicit new member. `static-audit.json` classifies all 132 original method declarations, including same-name overloads and overrides.

The common static initializer fragments were independently equal across both original suites except the two deliberately different temp-prefix/evidence paths, which remain explicit constructor arguments. Planned provider creation/start still precedes application/database start; close remains application → provider → database. Each test still assigns its worker handle before awaiting readiness, preserving cleanup if readiness throws. The shared starter returns the handle before the original test-owned 60s readiness wait. Claim/refresh release latches are still released before teardown. Privacy-canary log checks, no-survivor and clean-exit assertions retain their exact order. Exceptions and interrupt restoration stay as authored.

The unique behavior stays local: Integration's FixtureAccess, hand manifest and explicit non-planning initialization; Planned's Spring/JPA transaction composition, production access/classifier/current source ownership, controlled HTTP model, planner bootstrap, real reservation crash window, authentic admission key/bytes and internal route, provider-kind oracle and per-test ui_tests/config source rows. Fixed CSI-123/application/environment and each test instance's user/controller identity remain unchanged. No authority rows/store writers are introduced. Existing `FixtureAccess` override bodies, current pins and planner/refusal helpers were checked by exact tokens after the explicit ownership map; no unconditional completeness or authorization shortcut is added.

All 26 test names/order remain: Integration **10 → 10**, Planned **16 → 16**, no drops/additions. The nine orphan Integration helpers (`''' + '`, `'.join(orphan_names) + '''`) are the whole transitive uncalled closure; all remaining calls and source/string class references were checked. They have no overrides and no external code/reflective-class caller. Three other test files mention these classes only in comments, preserved. `proposal` and `proposalByLocator` contain two now-uncalled target-presence assertion starts; they leave only with their orphan helper bodies. No reachable test assertion or guard is dropped. Every actual test method's token sequence is exactly recoverable after undoing the named environment accesses and direct wait expansion; each old wait's final fresh `assertThat(condition).isTrue()` remains at its call site. Names/assertion starts and token hashes are listed by case.

| Original sleep row | Classification | Reason/disposition |
| --- | --- | --- |
''' + sleep_table + '''

Original source census is **2 + 4 = 6**: two POLL helper rows and four DELIBERATE rows. After folding, the duplicate slow-navigation row lives once in the fixture (still independently configured per class); the two genuine 100/200ms Planned observation windows remain in their same methods. There are **14** direct Awaitility chains (seven per class), no shared wait wrapper and no dependency/build change. Each condition starts immediately (`pollDelay(Duration.ZERO)`), polls every25ms on the same thread, retains its original 5/15/30/35/60s maximum and a named alias, then performs the original final fresh assertion. The slow-navigation seam is currently dormant (only0 writes); it is retained, not credited as an exercised timing proof. Awaitility timeout exception/scheduling boundary behavior still needs real execution; no timeout enlargement, retry or weakened condition is proposed.

Lightweight Python checks: complete patch reconstruction equals all three candidates; 26 named cases reconcile; 132 original overloads are accounted for; expanded lifecycle bodies equal originals; six sleep rows classified; all 506 main-file membership/hashes equal S011; both actual test preimages equal S011. Exact24 input hashes and owned hashes are in `static-audit.json`; all main hashes are in `main-s011-hashes.json`. Actual root-owned diagnostic ReplayIT is outside this write set and was left alone. Configured devLoadAlways framework files and matching named fallback files do not exist; no replacements were invented.

`commands.md` and `planned-gates.json` give the unexecuted staged compile, actual-package bridge command and full prescribed F1/FOLD gate sets. Actual application remains after root W1/source gates and **GS-Mb exit**, never inside its unchanged-test F1 freeze. Both modified bridge files become the FOLD-final baton; the new fixture accompanies that baton and has no production-client type reference to rename. Revalidate all source/doc bindings and rebase any real incoming main/baton changes before application. Full bridge runtime, F1 unchanged-source proof, final FOLD sets/coverage, final11G and valid AC5 before/after timing remain mandatory and open. No lane start/exit, W1 opening, QA pass or story status is asserted.
'''
(HERE / 'receipt.md').write_text(receipt)
paths = sorted(p for p in HERE.rglob('*') if p.is_file() and p.name != 'manifest.json')
manifest = {'status': 'complete off-tree preparation; ALL runtime/build/gates unexecuted',
            'sourceDigest': audit['sourceDigestS011'], 'patchSha256': audit['patchSha256'],
            'owned': audit['owned'], 'patchReconstruction': reconstructed,
            'artifacts': [{'path': str(p.relative_to(HERE)), 'sha256': sha(p), 'bytes': p.stat().st_size} for p in paths]}
(HERE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'receiptSha256': sha(HERE / 'receipt.md'), 'manifestSha256': sha(HERE / 'manifest.json'),
                  'patchSha256': audit['patchSha256'], 'gateCommands': len(commands), 'artifacts': len(paths)}, indent=2))
