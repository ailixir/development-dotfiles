#!/bin/bash
# STUDIO-OBS-009 C10 v2: mutation reproductions in a scratch copy. @qa (Quinn), 2026-10-18.
# v2 changes against pre-g9-review/c10.sh (v1 aborted at its baseline, see c10-run/attempt01/):
#   - S4 selection: the BACKGROUND_AUTHORIZATION_DENIED tripwire is asserted in schedulerAndNewHead(), which the
#     ORDER(1) ReplayIT method calls; v1 named the Order(3) method, which only reads state Order(1) leaves behind
#     (publishedTestId), so it failed alone. v2 selects Order(1) + the Order(9) OBS-007 canary method (the class
#     AfterAll scan asserts the OBS-007 case registered its canaries), and drops Order(3).
#   - mutation files are checked against the FROZEN capture-after sha256 (not the live tree, which @dev is editing),
#     and mutation strings are checked in the frozen scratch copy.
#   - C10_REUSE_SCRATCH=1 keeps the existing scratch copy (it is re-verified against capture-after first).
#   - the first failure line of every red test is recorded, and S4 requires the red reason to name the tripwire.
# (v1 header follows) WRITTEN BY @qa (Quinn), 2026-10-18. NOT RUN.
#
# Do not run this while G9 is in progress. The script refuses to run until
#   docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/status.txt
# contains the line G9-DONE, and it holds the shared Gradle lock for the whole batch.
#
# usage:
#   c10.sh plan      # read-only: check every mutation string occurs exactly once in the live tree, print the plan
#   c10.sh run       # copy, verify the frozen digest, baseline, mutate, expect RED, revert, final green
#   C10_TIER=all c10.sh run     # core (default) plus the extended mutations
#
# What it does NOT do: it never writes under backend/, studio-runner/, frontend/, tools/, docs/specs/, .github/
# or helm-chart/ in the live repo. It writes the scratch copy, and its results under
# docs/qa/evidence/STUDIO-OBS-009/execution-20261018/qa/c10-run/. It sends no signal to any process it did not start.
# It does not use git (the scratch copy has none), so it does not use capture-manifest.py; it re-implements the
# digest check against the file hashes in local-gate-20261018/capture-after.json.
set -u

LIVE=/Users/brunobuger/orca/workspaces/put-checks/ui-studio
SP=/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad
SCR=$SP/c10repo
G=$LIVE/docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018
OUT=$LIVE/docs/qa/evidence/STUDIO-OBS-009/execution-20261018/qa/c10-run
LOCK=$LIVE/.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py
PYF=$SP/c10_run.py
MODE=${1:-plan}

export C10_LIVE=$LIVE C10_SCR=$SCR C10_OUT=$OUT C10_GATE=$G C10_TIER=${C10_TIER:-core}
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH

write_python() {
cat > "$PYF" <<'PY'
#!/usr/bin/env python3
"""C10 driver. Modes: plan | run. All paths come from the environment set by c10.sh."""
import atexit, hashlib, json, os, signal, subprocess, sys, time
import xml.etree.ElementTree as ET
from pathlib import Path

LIVE = Path(os.environ['C10_LIVE']); SCR = Path(os.environ['C10_SCR']); OUT = Path(os.environ['C10_OUT'])
GATE = Path(os.environ['C10_GATE']); TIER = os.environ.get('C10_TIER', 'core')
B = 'backend/src/main/java/com/citi/put/checks/studio/'
GRADLE_TIMEOUT_S = 45 * 60

# Each mutation: one exact old->new replacement in one file (old must occur exactly once).
# tests: Gradle --tests patterns. expect: substrings of "ShortClass.method" that MUST be red.
# exact: if true, nothing else may be red (the narrowness pins). env: extra environment.
MUTATIONS = [
  dict(id='S3', tier='core', lane='S-W3 (AC-6 b/c, R7 non-vacuity)',
       what='scheduled acceptance no longer mints the background grant binding',
       file=B + 'dispatch/StudioAcceptanceService.java',
       old='observedGrant = observed.prepareScheduled(test, revision, principal);',
       new='observedGrant = null;',
       tests=['com.citi.put.checks.studio.scheduling.ObservedScheduleAuthorityIT',
              'com.citi.put.checks.studio.scheduling.StudioScheduleApiIT.editedWriterQueuedBehindAnAcceptanceKeepsExactlyTheAcceptedRevision'],
       expect=['ObservedScheduleAuthorityIT.anObservedScheduleIsAcceptedUnderBackgroundAuthorityForTheSchedulePrincipal',
               'StudioScheduleApiIT.editedWriterQueuedBehindAnAcceptanceKeepsExactlyTheAcceptedRevision'],
       exact=False, env={}),
  dict(id='S4', tier='core', lane='S-W3 (AC-6 d tripwire, grant check)',
       what='the background-grant check is removed (the ReplayIT tripwire expects BACKGROUND_AUTHORIZATION_DENIED)',
       file=B + 'scheduling/ConfiguredBackgroundAuthorization.java',
       old='    if (principal == null || !principals(csiId, targetEnvironment).contains(principal)) {',
       new='    if (false) {',
       tests=['com.citi.put.checks.studio.scheduling.ObservedScheduleAuthorityIT',
              'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT.actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues',
              'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT.actualSecretLoginPublishesValueFreeAndTwoOrdinaryRunsResolveFreshWithoutModel'],
       expect=['ObservedScheduleAuthorityIT.theRefusalNoLongerExistsAndAWithdrawnGrantStillFailsClosed',
               'GuidedPublicationReplayIT.actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues'],
       reason={'GuidedPublicationReplayIT.actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues': 'BACKGROUND_AUTHORIZATION_DENIED'},
       exact=False, env={}),
  dict(id='B1', tier='core', lane='B-W3 / R1 d (and R1 a-c)',
       what='evidence acceptance back to the head revision only (the pre-R1 behaviour)',
       file=B + 'guided/evidence/GuidedSessionEvidenceService.java',
       old='''                  && materialization
                      .acceptedContextRevisions(id, context.contextRevision())
                      .contains(request.path("contextRevision").asInt())
''',
       new='''                  && context.contextRevision() == request.path("contextRevision").asInt()
''',
       tests=['com.citi.put.checks.studio.guided.session.GuidedEvidencePendingAppendIT',
              'com.citi.put.checks.studio.guided.session.GuidedEvidencePendingAppendJoinedIT'],
       expect=['GuidedEvidencePendingAppendIT.recordingAtThePreviousRevisionIsAcceptedWhileAnAppendIsPending',
               'GuidedEvidencePendingAppendJoinedIT.aSessionEndedWhileAnAppendIsPendingKeepsARecordingThatSettlesPlaysAndSeeks',
               'GuidedEvidencePendingAppendJoinedIT.aSessionLosingItsBrowserWhileAnAppendIsPendingStillRecordsTheRunnersOwnFact'],
       exact=False, env={}),
  dict(id='B2', tier='core', lane='ADJ-1 c (joined)',
       what='the revoked-ADMITTED disjunct is unreachable (the pre-ADJ-1 behaviour)',
       file=B + 'dispatch/StudioDispatchLedgerStatements.java',
       old='AND revoked_at IS NOT NULL AND CAST(? AS boolean)))',
       new='AND revoked_at IS NOT NULL AND CAST(? AS boolean) AND false))',
       tests=['com.citi.put.checks.studio.dispatch.PreReadyRevocationProbeIT',
              'com.citi.put.checks.studio.dispatch.PreReadyRevocationJoinedIT'],
       expect=['PreReadyRevocationProbeIT.aPreReadyRevocationIsSettledAsAuthorizationRevoked',
               'PreReadyRevocationJoinedIT.aPreReadyRevocationOfARealHeldRunIsSettledAsAuthorizationRevoked'],
       exact=False, env={}),
  dict(id='B3', tier='core', lane='ADJ-1 narrowness (security co-sign dependency)',
       what='the outcome binding is dropped: any pre-Ready FINAL on a revoked row is accepted',
       file=B + 'dispatch/StudioDispatchLedgerStatements.java',
       old='AND revoked_at IS NOT NULL AND CAST(? AS boolean)))',
       new='AND revoked_at IS NOT NULL AND (CAST(? AS boolean) OR true)))',
       tests=['com.citi.put.checks.studio.dispatch.PreReadyRevocationProbeIT'],
       expect=['PreReadyRevocationProbeIT.aRevokedRowsOtherPreReadyFinalIsStillRefusedAndTheReaperSettlesIt'],
       exact=True, env={}),
  dict(id='F1', tier='core', lane='F (AC-11 ACK-loss leg)',
       what='the dispatcher resends on an AMBIGUOUS answer',
       file=B + 'dispatch/StudioDispatcher.java',
       old='''        DispatchOutcome outcome = runnerClient.send(job);
        // STUDIO-OBS-014 AC-10: one audit event per replay dispatch attempt.''',
       new='''        DispatchOutcome outcome = runnerClient.send(job);
        if (outcome.kind() == DispatchOutcome.Kind.AMBIGUOUS) {
          outcome = runnerClient.send(job);
        }
        // STUDIO-OBS-014 AC-10: one audit event per replay dispatch attempt.''',
       tests=['com.citi.put.checks.corun.ObservedCoRunIT.aLostAcknowledgmentIsNeverAResend'],
       expect=['ObservedCoRunIT.aLostAcknowledgmentIsNeverAResend'],
       exact=False, env={'CORUN_REPEATS': '1'}),
  dict(id='S1', tier='extended', lane='S-W3 (G-3 at dispatch recheck)',
       what='the G-3 secret refusal at the dispatch recheck is skipped',
       file=B + 'scheduling/StudioScheduledDispatchAuthorization.java',
       old='if (!background.localOnly() && declaresSecrets(jdbc,',
       new='if (false && declaresSecrets(jdbc,',
       tests=['com.citi.put.checks.studio.scheduling.ObservedScheduleAuthorityIT'],
       expect=['ObservedScheduleAuthorityIT.g3HoldsAgainAtDispatchRecheckForARunThatWasAcceptedUnderTheFixturePolicy'],
       exact=False, env={}),
  dict(id='LR', tier='extended', lane='BL / LR c (T0 C10 minimum)',
       what='the lifecycle route ignores the reported reason again (EXPIRED ends FAILED)',
       file=B + 'guided/session/GuidedSessionService.java',
       old='''                  : request.path("reason").asText().equals("EXPIRED") ? "EXPIRED" : "FAILED");
          return session.document().deepCopy();''',
       new='''                  : "FAILED");
          return session.document().deepCopy();''',
       tests=['com.citi.put.checks.studio.guided.session.GuidedLifecycleReasonIT'],
       expect=['GuidedLifecycleReasonIT.anExpiredReportAcceptedBeforeTheBackendExpiryEndsExpired'],
       exact=False, env={}),
  dict(id='F2', tier='extended', lane='F (AC-11 public-cancel leg)',
       what='the guided stop sender is swallowed, so the runner is never told to stop',
       file=B + 'guided/session/GuidedSessionService.java',
       old='    this.stopSender = sender;',
       new='    this.stopSender = (target, reason) -> {};',
       tests=['com.citi.put.checks.corun.ObservedCoRunIT.aPublicCancelOfALiveGuidedBrowserMidActionTearsItDownAndFreesTheSlot'],
       expect=['ObservedCoRunIT.aPublicCancelOfALiveGuidedBrowserMidActionTearsItDownAndFreesTheSlot'],
       exact=False, env={'CORUN_REPEATS': '1'}),
]
SELECTED = [m for m in MUTATIONS if TIER == 'all' or m['tier'] == 'core']

def sha(b): return hashlib.sha256(b).hexdigest()

def union_tests(muts):
    seen, out = set(), []
    for m in muts:
        for t in m['tests']:
            if t not in seen: seen.add(t); out.append(t)
    return out

def union_env(muts):
    env = {}
    for m in muts: env.update(m['env'])
    return env

def frozen_map():
    cap = GATE / 'capture-after.json'
    data = json.loads(cap.read_text())
    return {f['path']: f['sha256'] for f in data['files']}

def verify_strings():
    bad = 0
    FM = frozen_map()
    for m in SELECTED:
        base = SCR if (SCR / m['file']).is_file() else LIVE
        text = (base / m['file']).read_text()
        if m['file'] not in FM: print(f"[plan] {m['id']} file not in capture-after"); bad += 1
        n = text.count(m['old'])
        print(f"[plan] {m['id']:3s} {m['tier']:8s} {n} occurrence(s) of old text in {m['file'].split('/')[-1]} ({'scratch' if base == SCR else 'LIVE'})  lane={m['lane']}")
        if n != 1: bad += 1
    return bad

def frozen_check():
    """Scratch files must equal the frozen file hashes (capture-after.json, else capture-before.json)."""
    cap = GATE / 'capture-after.json'
    if not cap.exists(): cap = GATE / 'capture-before.json'
    data = json.loads(cap.read_text())
    roots = ('backend/', 'studio-runner/', 'tools/', 'docs/specs/', '.github/')
    bad, n = [], 0
    for f in data['files']:
        if not f['path'].startswith(roots): continue
        n += 1
        p = SCR / f['path']
        if not p.is_file() or sha(p.read_bytes()) != f['sha256']: bad.append(f['path'])
    dist = data.get('dist', {}).get('files', [])
    for f in dist:
        n += 1
        p = SCR / 'studio-runner/dist' / f['path']
        if not p.is_file() or sha(p.read_bytes()) != f['sha256']: bad.append('studio-runner/dist/' + f['path'])
    print(f"[frozen] checked {n} files against {cap.name} (source digest {data.get('digest')}, dist {data.get('dist', {}).get('digest')}); mismatches: {len(bad)}")
    for p in bad[:20]: print('   MISMATCH', p)
    return len(bad) == 0, data.get('digest'), data.get('dist', {}).get('digest')

def collect(started):
    res = SCR / 'backend/build/test-results/test'
    cases, counts = [], dict(total=0, failed=0, errors=0, skipped=0)
    for p in sorted(res.glob('TEST-*.xml')):
        if p.stat().st_mtime < started - 1: continue
        root = ET.parse(p).getroot()
        for k, a in (('total', 'tests'), ('failed', 'failures'), ('errors', 'errors'), ('skipped', 'skipped')):
            counts[k] += int(root.attrib.get(a, 0))
        for tc in root.iter('testcase'):
            cls = (tc.attrib.get('classname') or '').split('.')[-1].split('$')[0]
            name = tc.attrib['name'].replace('()', '')
            fe = tc.find('failure') if tc.find('failure') is not None else tc.find('error')
            status = 'FAIL' if fe is not None else 'SKIP' if tc.find('skipped') is not None else 'PASS'
            msg = ''
            if fe is not None:
                msg = ' '.join(((fe.attrib.get('message') or '') + ' ' + (fe.text or '')).split())[:600]
            cases.append(dict(id=f'{cls}.{name}', status=status, message=msg))
    return counts, cases

def gradle(label, tests, env_extra):
    res = SCR / 'backend/build/test-results/test'
    if res.exists():
        for p in res.glob('TEST-*.xml'): p.unlink()
    cmd = ['caffeinate', '-i', './gradlew', 'test'] + [x for t in tests for x in ('--tests', t)] + ['--no-daemon']
    env = dict(os.environ, **env_extra)
    started = time.time()
    log = OUT / f'{label}.log'
    with log.open('w') as lf:
        proc = subprocess.Popen(cmd, cwd=SCR / 'backend', env=env, stdout=lf, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = proc.wait(timeout=GRADLE_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGTERM)   # only the process group this script started
            code = proc.wait(); print(f'[gradle] {label} TIMED OUT')
    counts, cases = collect(started)
    xmldir = OUT / f'{label}-xml'; xmldir.mkdir(exist_ok=True)
    for p in sorted(res.glob('TEST-*.xml')):
        if p.stat().st_mtime >= started - 1: (xmldir / p.name).write_bytes(p.read_bytes())
    return dict(label=label, exit=code, elapsedS=round(time.time() - started), counts=counts, cases=cases, cmd=cmd)

_applied = {}
def restore_all():
    for rel, original in list(_applied.items()):
        (SCR / rel).write_bytes(original)
        del _applied[rel]
atexit.register(restore_all)
def _term(sig, frm): sys.exit(130)
signal.signal(signal.SIGTERM, _term); signal.signal(signal.SIGINT, _term)

def run():
    OUT.mkdir(parents=True, exist_ok=True)
    ok, srcd, distd = frozen_check()
    if not ok: print('[abort] the scratch copy does not equal the frozen digest'); return 2
    if verify_strings(): print('[abort] a mutation string is not unique in the live tree'); return 2
    FM_RUN = frozen_map()
    results = dict(startedAt=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), tier=TIER, frozenSourceDigest=srcd, frozenDistDigest=distd, runs=[])
    allgreen = True
    # 1. baseline: every selected test selection, unmutated, must be green in the scratch copy
    base = gradle('c10-baseline', union_tests(SELECTED), union_env(SELECTED))
    failed = [c['id'] for c in base['cases'] if c['status'] == 'FAIL']
    base['verdict'] = 'GREEN' if base['exit'] == 0 and not failed and base['counts']['total'] > 0 else 'NOT_GREEN'
    results['runs'].append(dict(kind='baseline', **{k: base[k] for k in ('label', 'exit', 'elapsedS', 'counts', 'verdict')}, failed=failed))
    print(f"[baseline] {base['verdict']} counts={base['counts']} failed={failed}")
    if base['verdict'] != 'GREEN':
        results['aborted'] = 'baseline not green: no mutation was applied'
        (OUT / 'c10-results.json').write_text(json.dumps(results, indent=1)); return 1
    # 2. mutations
    for m in SELECTED:
        path = SCR / m['file']; original = path.read_bytes(); live_sha = FM_RUN[m['file']]
        assert sha(original) == live_sha, f"scratch {m['file']} differs from the frozen capture before mutation"
        text = original.decode()
        assert text.count(m['old']) == 1, f"{m['id']}: old text count {text.count(m['old'])}"
        _applied[m['file']] = original
        path.write_text(text.replace(m['old'], m['new']))
        try:
            r = gradle(f"c10-{m['id']}-mutated", m['tests'], m['env'])
        finally:
            restore_all()
        restored = sha(path.read_bytes()) == live_sha
        red = [c['id'] for c in r['cases'] if c['status'] == 'FAIL']
        missing = [e for e in m['expect'] if not any(e in x for x in red)]
        wrong_reason = []
        for want, needle in m.get('reason', {}).items():
            for c in r['cases']:
                if c['status'] == 'FAIL' and want in c['id'] and needle not in c.get('message', ''):
                    wrong_reason.append(f"{c['id']} red but message lacks {needle!r}: {c.get('message','')[:200]!r}")
        extra = [x for x in red if not any(e in x for e in m['expect'])]
        verdict = 'RED_AS_EXPECTED' if (r['exit'] != 0 and not missing and not wrong_reason and (not m['exact'] or not extra)) else 'NOT_RED_AS_EXPECTED'
        if verdict != 'RED_AS_EXPECTED' or not restored: allgreen = False
        results['runs'].append(dict(kind='mutation', id=m['id'], lane=m['lane'], what=m['what'], file=m['file'], exit=r['exit'], elapsedS=r['elapsedS'],
                                    counts=r['counts'], red=red, redMessages={c['id']: c.get('message', '')[:300] for c in r['cases'] if c['status'] == 'FAIL'}, wrongReason=wrong_reason, expectedMissing=missing, collateralRed=extra, exact=m['exact'],
                                    restoredShaMatchesFrozen=restored, verdict=verdict))
        print(f"[mutation {m['id']}] {verdict} restored={restored} red={red} missing={missing} wrongReason={wrong_reason} collateral={extra}")
        (OUT / 'c10-results.json').write_text(json.dumps(results, indent=1))
    # 3. final: every selection green again after the reverts
    fin = gradle('c10-final', union_tests(SELECTED), union_env(SELECTED))
    failed = [c['id'] for c in fin['cases'] if c['status'] == 'FAIL']
    fin['verdict'] = 'GREEN' if fin['exit'] == 0 and not failed and fin['counts']['total'] > 0 else 'NOT_GREEN'
    if fin['verdict'] != 'GREEN': allgreen = False
    results['runs'].append(dict(kind='final', **{k: fin[k] for k in ('label', 'exit', 'elapsedS', 'counts', 'verdict')}, failed=failed))
    print(f"[final] {fin['verdict']} counts={fin['counts']} failed={failed}")
    results['allAsExpected'] = allgreen
    results['finishedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    (OUT / 'c10-results.json').write_text(json.dumps(results, indent=1))
    lines = ['id    verdict               red tests (expected first)  [lane]']
    for r in results['runs']:
        if r['kind'] == 'mutation': lines.append(f"{r['id']:5s} {r['verdict']:22s} {r['red']}  [{r['lane']}]")
        else: lines.append(f"{r['kind']:5s} {r['verdict']:22s} counts={r['counts']}")
    (OUT / 'c10-results.txt').write_text('\n'.join(lines) + '\n')
    return 0 if allgreen else 1

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'plan'
    if mode == 'plan':
        sys.exit(1 if verify_strings() else 0)
    if mode == 'frozen':
        ok, a, b = frozen_check(); print('FROZEN_OK' if ok else 'FROZEN_MISMATCH', a, b); sys.exit(0 if ok else 2)
    if mode == 'run':
        sys.exit(run())
    sys.exit(64)
PY
}

if [ "$MODE" = plan ] || [ "$MODE" = frozen ]; then
  write_python
  python3 "$PYF" "$MODE"
  exit $?
fi

if [ "$MODE" != run ]; then echo "usage: c10.sh plan|frozen|run"; exit 64; fi

# ---- run mode: take the shared Gradle lock for the whole batch, then do everything inside it ----
if [ "${C10_LOCKED:-}" != 1 ]; then
  C10_LOCKED=1 exec python3 "$LOCK" bash "$0" run
fi

mkdir -p "$OUT"
# 0. preflight (read-only checks)
if ! grep -q '^G9-DONE' "$G/status.txt" 2>/dev/null; then echo "[abort] G9 has not finished (no G9-DONE line in $G/status.txt)"; exit 3; fi
if pgrep -fl 'GradleDaemon|GradleWrapperMain|org.gradle.launcher' > "$OUT/gradle-procs-before.txt" 2>&1; then
  echo "[abort] a Gradle process is running; see $OUT/gradle-procs-before.txt"; cat "$OUT/gradle-procs-before.txt"; exit 3; fi
lsof -nP -iTCP -sTCP:LISTEN > "$OUT/lsof-before.txt" 2>&1
ps -axo pid,ppid,command | grep -E 'checks-guided|postgres' | grep -v grep > "$OUT/other-procs-before.txt" 2>&1
docker info > /dev/null 2>&1 || { echo "[abort] docker is not available (Testcontainers needs it)"; exit 3; }

# 1. scratch copy (no node_modules, no build outputs; studio-runner/node_modules is hardlinked, dist is copied)
if [ "${C10_REUSE_SCRATCH:-}" = 1 ]; then
  [ -d "$SCR/backend" ] || { echo "[abort] C10_REUSE_SCRATCH=1 but $SCR/backend is missing"; exit 4; }
  echo "[copy] reusing the existing scratch copy at $SCR (re-verified against capture-after by the driver)"
else
rm -rf "$SCR"; mkdir -p "$SCR"
rsync -a \
  --exclude='.git' --exclude='.claude' --exclude='.aiox' --exclude='.cursor' --exclude='node_modules' \
  --exclude='/frontend' \
  --exclude='/backend/build' --exclude='/backend/.gradle' --exclude='/backend/buildSrc/build' --exclude='/backend/buildSrc/.gradle' \
  --exclude='/studio-runner/coverage' \
  --include='/docs/qa/evidence/STUDIO-OBS-009/execution-20261018/de/' \
  --include='/docs/qa/evidence/STUDIO-OBS-009/execution-20261018/de/**' \
  --exclude='/docs/qa/evidence/STUDIO-OBS-009/execution-20261018/*' \
  --exclude='/docs/qa/evidence/STUDIO-OBS-015/execution-20261015' \
  --exclude='/docs/qa/evidence/STUDIO-OBS-007' --exclude='/docs/qa/evidence/STUDIO-OBS-008' \
  --exclude='/docs/qa/evidence/STUDIO-OBS-005' --exclude='/docs/qa/evidence/STUDIO-OBSERVED-NEXT' \
  "$LIVE/" "$SCR/" || { echo "[abort] rsync failed"; exit 4; }
mkdir -p "$SCR/studio-runner/node_modules"
rsync -a --link-dest="$LIVE/studio-runner/node_modules/" "$LIVE/studio-runner/node_modules/" "$SCR/studio-runner/node_modules/" || { echo "[abort] node_modules link failed"; exit 4; }
echo "[copy] scratch copy at $SCR ($(du -sh "$SCR" | cut -f1))"
fi

# 2. everything else (frozen-digest check, baseline, mutations, final) is in the driver
write_python
python3 "$PYF" run
code=$?
echo "[c10] driver exit $code; results: $OUT/c10-results.json"
# the scratch copy is left in place for inspection; it is outside the repo and safe to delete.
exit $code
