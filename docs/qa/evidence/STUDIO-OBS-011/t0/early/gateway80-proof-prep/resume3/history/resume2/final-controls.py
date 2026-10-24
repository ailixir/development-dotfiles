"""Gateway final/readiness/gate implementation. IO is supplied by the driver.
All entrypoints here are directly exercised with in-memory fake IO in controls.
"""
import hashlib
import json


def final_facts(d, A, release_sha, C):
    q, read, file_hash, E, D, W = d.require, d.read, d.file_hash, d.E, d.D, d.W
    q(file_hash(E / 'root-authorization.json') == release_sha and A['authorized'] is True,
      'ROOT_RELEASE_REQUIRED')
    q(A['label'] == d.SCOPE['label'] and A['sourceWrites'] is False and A['C8'] is False
      and A['credit'] is False and A['automaticRetry'] is False, 'RELEASE_SCOPE_CHANGED')
    q(A['independentArchitectureReviewSha256'] and A['independentQaReviewSha256'], 'EXACT_REVIEWS_REQUIRED')
    q(E.is_dir() and not E.is_symlink() and E.stat().st_uid == d.os.getuid()
      and d.stat.S_IMODE(E.stat().st_mode) == 0o700, 'EVIDENCE_ROOT_MODE_OR_IDENTITY')
    q(file_hash(D / 'manifest.json') == A['packetManifestSha256'], 'PACKET_SEAL')
    for row in read(D / 'manifest.json')['files']:
        q(file_hash(D / row['path']) == row['sha256']
          and d.stat.S_IMODE((D / row['path']).stat().st_mode) == row['mode'], 'PACKET_MEMBER_CHANGED')
    H = d.held(A, C)
    source = d.guards(A, C)
    resources = d.boundary(H, C, A)
    pins, phase_pins, known = {}, {}, {}
    def pin(name):
        h = file_hash(E / name)
        pins[name] = h
        return h
    for name in ['root-authorization.json', 'hold.json', 'candidate-baseline.json']:
        pin(name)
    cases = read(D / 'case-map.json')
    for phase in d.SCOPE['phaseIds']:
        phase_pins[phase] = pin(phase + '.receipt.json')
        receipt = read(E / (phase + '.receipt.json'))
        q(receipt['phase'] == phase and receipt['releaseSha256'] == release_sha
          and receipt['accepted'] is True and receipt['status'] == 'TERMINAL_ACCEPTED_LOCAL_ONLY'
          and not receipt['stickyFlags'], 'PHASE_NOT_ACCEPTED')
        consumed = read(E / (phase + '.consumed.json'))
        pin(phase + '.consumed.json')
        q(consumed['phase'] == phase and consumed['releaseSha256'] == release_sha,
          'CONSUMED_PHASE_BINDING')
        decision = read(E / (phase + '.root-decision.json'))
        q(pin(phase + '.root-decision.json') == consumed['decisionSha256']
          and decision['phase'] == phase and decision['releaseSha256'] == release_sha
          and decision['authorized'] is True, 'PHASE_DECISION_BINDING')
        predecessors = {'prepare': [], 'red': ['prepare'], 'install-fixed': ['red'],
                        'green': ['install-fixed'], 'archive': ['green']}[phase]
        q(set(decision['precedingReceipts']) == set(predecessors), 'FINAL_PREDECESSOR_SET')
        for previous in predecessors:
            q(decision['precedingReceipts'][previous] == phase_pins[previous], 'FINAL_PREDECESSOR_SHA')
        if phase in ('red', 'green'):
            q(receipt['nativeExecuted'] is True, 'NATIVE_NOT_EXECUTED')
            n = receipt['native']
            q(n['status'] == 'TERMINAL' and n['timedOut'] is False and not n['stickyFlags']
              and n['automaticRetry'] is False, 'NATIVE_NOT_TERMINAL')
            q(n['argv'] == next(x['argv'] for x in d.SCOPE['phases'] if x['id'] == phase)
              and n['cwd'] == str(W / 'repo/studio-runner'), 'NATIVE_COMMAND_OR_CWD')
            q(pin(phase + '-vitest.json') == n['reportSha256'], 'EVIDENCE_REPORT_DRIFT')
            q(file_hash(W / ('repo/' + phase + '-vitest.json')) == n['reportSha256'], 'WORKSPACE_REPORT_DRIFT')
            assessment = d.assess(read(E / (phase + '-vitest.json')), phase, n['nativeExit'], cases)
            q(assessment == receipt['assessment'], 'ASSESSMENT_DRIFT')
            q(pin(phase + '.stdout') == n['stdoutSha256']
              and pin(phase + '.stderr') == n['stderrSha256'], 'NATIVE_OUTPUT_DRIFT')
            q(pin(phase + '.launched.json') == n['launchSha256'], 'NATIVE_LAUNCH_PROOF_DRIFT')
            q(n['candidateObservations'], 'CANDIDATE_OBSERVATIONS_MISSING')
            for observation in n['candidateObservations']:
                q(observation['baselineSha256'] == A['candidateBaselineSha256']
                  and not observation['unknownCandidates'], 'HISTORICAL_CANDIDATE_GAP')
                for f in observation['currentNative']:
                    known[(f['pid'], f['start'])] = f
            for f in n['ownedIdentities']:
                q(f['identityComplete'] is True, 'RECORDED_IDENTITY_INCOMPLETE')
                known[(f['pid'], f['start'])] = f
        else:
            q(receipt['nativeExecuted'] is False, 'UNEXPECTED_NATIVE_PHASE')
    actual_review = read(E / 'actual-review.root-adoption.json')
    pin('actual-review.root-adoption.json')
    q(actual_review['accepted'] is True and actual_review['releaseSha256'] == release_sha
      and actual_review['phaseReceiptPins'] == phase_pins, 'ACTUAL_REVIEW_ADOPTION_REQUIRED')
    review_path = actual_review['actualReviewPath']
    q(review_path.startswith('docs/qa/evidence/STUDIO-OBS-011/t0/qa/') and '/../' not in review_path,
      'ACTUAL_REVIEW_PATH_SCOPE')
    q(file_hash(d.R / review_path) == actual_review['independentActualReviewSha256'], 'ACTUAL_REVIEW_CHANGED')
    rows = C['table']()
    q(all((rows.get(pid) or {}).get('start') != start for pid, start in known), 'OWNED_DESCENDANT_SURVIVES')
    d.workspace_guard('fixed')
    q(not list((W / 'tmp').iterdir()), 'FINAL_TMPDIR_RESIDUE')
    ar = read(E / 'archive.receipt.json')
    q(ar['archiveEqual'] is True and ar['cleanupAuthorized'] is False, 'ARCHIVE_RECEIPT')
    q(d.owned_root_identity() == ar['workspace'], 'OWNED_ROOT_CHANGED')
    current = d.inventory(W)
    complete = d.inventory(E / 'complete-workspace-archive')
    chart = d.inventory(W / 'repo/helm-chart/put-checks')
    dedicated = d.inventory(E / 'final-fixed-chart-archive')
    q(current == ar['workspaceInventory'], 'WORKSPACE_AFTER_ARCHIVE_DRIFT')
    q(complete == ar['archiveInventory'], 'WORKSPACE_ARCHIVE_DRIFT')
    q(chart == ar['finalChartInventory'], 'FIXED_CHART_DRIFT')
    q(dedicated == ar['finalChartArchiveInventory'], 'DEDICATED_CHART_ARCHIVE_DRIFT')
    content = lambda records: [{k: v for k, v in r.items() if k not in ('dev', 'ino')} for r in records]
    q(content(current) == content(complete) and content(chart) == content(dedicated), 'FRESH_BOTH_ARCHIVE_EQUALITY')
    d.chart_guard(E / 'final-fixed-chart-archive', fixed=True)
    source_after = d.guards(A, C)
    q({k: v for k, v in source_after.items() if k != 'atUtc'}
      == {k: v for k, v in source.items() if k != 'atUtc'}, 'SOURCE_CHANGED_DURING_FINAL_CHECK')
    resources_after = d.boundary(H, C, A)
    q(resources_after['workerCandidates'] == resources['workerCandidates'], 'CANDIDATES_CHANGED_DURING_FINAL_CHECK')
    d.held(A, C)
    source = {k: v for k, v in source.items() if k != 'atUtc'}
    resource_state = {'recordedIdentitiesTerminal': True, 'workerCandidates': resources['workerCandidates'],
                      'inheritedChanged': resources['inheritedIdentityChanged'],
                      'incomplete': resources['incompleteStableIdentities']}
    return {'releaseSha256': release_sha, 'holdSha256': A['holdFileSha256'],
            'producerSha256': file_hash(D / 'verify-final.py'), 'driverSha256': file_hash(D / 'run-private.py'),
            'gateSha256': file_hash(D / 'exit-gate.py'), 'finalControlsSha256': file_hash(D / 'final-controls.py'),
            'manifestSha256': A['packetManifestSha256'], 'caseMapSha256': file_hash(D / 'case-map.json'),
            'inputManifestSha256': file_hash(D / 'input-manifest.json'),
            'sourceGuardSha256': file_hash(D / 'source-guards.json'),
            'phaseReceiptPins': phase_pins, 'evidencePins': pins, 'source': source, 'resources': resource_state,
            'independentActualReviewSha256': actual_review['independentActualReviewSha256'],
            'archiveBasisSha256': hashlib.sha256(json.dumps([current, complete, chart, dedicated],
                                                  sort_keys=True).encode()).hexdigest(),
            'nativeStatuses': {'red': 1, 'green': 0}, 'credit': False}


def produce_final(d, A, release_sha, C, now):
    """Exclusive v1 proof; no overwrite, refresh, permit or exit side effect."""
    d.require(d.file_hash(d.E / 'root-authorization.json') == release_sha
              and A['authorized'] is True and A['label'] == d.SCOPE['label'], 'ACTUAL_FINAL_RELEASE_REQUIRED')
    d.require(d.file_hash(d.D / 'manifest.json') == A['packetManifestSha256'], 'FINAL_PACKET_SEAL')
    for member in d.read(d.D / 'manifest.json')['files']:
        d.require(d.file_hash(d.D / member['path']) == member['sha256']
                  and d.stat.S_IMODE((d.D / member['path']).stat().st_mode) == member['mode'],
                  'FINAL_PACKET_MEMBER_CHANGED')
    d.held(A, C)
    readiness, result = d.E / 'final-readiness-v1.json', d.E / 'final-result-v1.json'
    attempt = d.E / 'final-attempt-v1.json'
    d.require(not readiness.exists() and not result.exists() and not attempt.exists(),
              'FINAL_PROOF_ALREADY_EXISTS_NO_REFRESH')
    d.write_new(attempt, {'releaseSha256': release_sha,
                          'producerSha256': d.file_hash(d.D / 'verify-final.py'),
                          'startedAtEpoch': now(), 'automaticRefresh': False})
    try:
        facts = final_facts(d, A, release_sha, C)
    except BaseException:
        d.write_new(result, {'status': 'FINAL_VERIFICATION_FAILED', 'verificationExit': 1,
                            'releaseSha256': release_sha, 'readinessWritten': False,
                            'attemptSha256': d.file_hash(attempt), 'credit': False})
        raise
    proof = {'schemaVersion': 1, 'label': d.SCOPE['label'], 'status': 'VERIFIED_GATEWAY80',
             'verificationExit': 0, 'verifiedAtEpoch': now(), 'facts': facts,
             'readinessOnly': True, 'permitIssued': False, 'credit': False}
    proof['attemptSha256'] = d.file_hash(attempt)
    d.write_new(readiness, proof)
    terminal = {'status': 'FINAL_VERIFICATION_PASSED', 'verificationExit': 0,
                'readinessSha256': d.file_hash(readiness), 'producerSha256': facts['producerSha256'],
                'releaseSha256': release_sha, 'attemptSha256': d.file_hash(attempt), 'credit': False}
    d.write_new(result, terminal)
    return terminal


def close_check(d, A, release_sha, permit, C, now):
    """Fresh gate recheck after separately inspected final0 and root permit."""
    readiness_path, result_path = d.E / 'final-readiness-v1.json', d.E / 'final-result-v1.json'
    q = d.require
    q(readiness_path.is_file() and result_path.is_file(), 'FINAL_READINESS_AND_RESULT_REQUIRED')
    readiness, result = d.read(readiness_path), d.read(result_path)
    attempt_path = d.E / 'final-attempt-v1.json'
    attempt = d.read(attempt_path)
    q(d.file_hash(attempt_path) == readiness['attemptSha256'] == result['attemptSha256']
      and attempt['releaseSha256'] == release_sha and attempt['automaticRefresh'] is False,
      'FINAL_ATTEMPT_BINDING')
    q(permit['authorized'] is True and permit['releaseSha256'] == release_sha
      and permit['expectedWrapperExit'] == 0 and permit['credit'] is False
      and permit['independentActualReviewSha256'] and permit['actualFinalResultInspected'] is True
      and permit['finalVerificationExit'] == 0, 'CLOSE_PERMIT_SCOPE')
    q(permit['readinessSha256'] == d.file_hash(readiness_path)
      and permit['finalResultSha256'] == d.file_hash(result_path), 'PERMIT_FINAL_PROOF_SHA')
    q(result['verificationExit'] == 0 and result['status'] == 'FINAL_VERIFICATION_PASSED'
      and result['readinessSha256'] == d.file_hash(readiness_path)
      and result['releaseSha256'] == release_sha, 'FINAL_RESULT_BINDING')
    q(readiness['status'] == 'VERIFIED_GATEWAY80' and readiness['verificationExit'] == 0
      and readiness['label'] == d.SCOPE['label'] and readiness['permitIssued'] is False,
      'FINAL_READINESS_BINDING')
    q(0 <= now() - readiness['verifiedAtEpoch'] <= 60
      and readiness['verifiedAtEpoch'] <= permit['verifiedAtEpoch'] <= now()
      and now() - permit['verifiedAtEpoch'] <= 60, 'STALE_OR_OUT_OF_ORDER_FINAL_PERMIT')
    facts = final_facts(d, A, release_sha, C)
    q(facts == readiness['facts'], 'FINAL_FACTS_CHANGED_AFTER_FINAL0')
    q(permit['independentActualReviewSha256'] == facts['independentActualReviewSha256'], 'PERMIT_ACTUAL_REVIEW_MISMATCH')
    q(result['producerSha256'] == facts['producerSha256'], 'FINAL_PRODUCER_CHANGED')
    q(attempt['producerSha256'] == facts['producerSha256'], 'FINAL_ATTEMPT_PRODUCER_CHANGED')
    q(0 <= now() - readiness['verifiedAtEpoch'] <= 60
      and 0 <= now() - permit['verifiedAtEpoch'] <= 60, 'FINAL_OR_PERMIT_EXPIRED_DURING_CHECK')
    return {'status': 'ALLOW_VERIFIED_GATEWAY80', 'requestedExit': 0, 'releaseSha256': release_sha,
            'readinessSha256': d.file_hash(readiness_path), 'finalResultSha256': d.file_hash(result_path), 'credit': False}
