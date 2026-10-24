"""Prospective finite unit controller, entirely effect-injected and fail-closed without an adapter.

No imports, filesystem, process, lock, runtime/main, source capture or private reader exists here.
Every effect named below is an outstanding executable adapter boundary, not a current authority.
"""
PREIMAGE = 'b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475'
BASE = 'f9cbe66dd1aa700ebbb578203e84f6b24ec329b092e7f78c7ee9e12ab8dc9277'
CANDIDATE = 'ecb74d5f9ab42e3888d8e05f419f107213030873ca84d2b0dfc0ce4964da0b35'
METHOD = 'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT.actualPublishedWrongPasswordAnnotatesEarlierSecretFill'
SELECTED = ['./gradlew', 'test', '--tests', METHOD, '--rerun-tasks', '--no-daemon']
COMPILE = ['./gradlew', 'compileTestJava', '--rerun-tasks', '--no-daemon']
GAPS = ('ownedIdentityObservationGap', 'ownershipOrLockObservationGap', 'drainObservationGap',
        'waitObservationGap', 'receiptWriteFailed', 'prematureUnlockGap', 'resourceObservationGap',
        'interrupted', 'sourceObservationGap', 'unrecordedForkObserved', 'cleanupUnconfirmed')
COHORT_FLAGS = ('auditComplete', 'privacyComplete', 'producersDrained', 'modelEvidenceComplete',
                'budgetEvidenceComplete', 'responseEvidenceComplete')


class Hold(Exception):
    pass


def need(ok, reason):
    if ok is not True:
        raise Hold(reason)


def integer(value):
    return type(value) is int


def authority(a):
    need(type(a) is dict, 'ROOT_AUTHORITY_REQUIRED')
    for key in ('rootAuthorized', 'exactAriaCodeReviewed', 'exactQaCodePrivacyReviewed',
                'limitedSourceWindowQualified', 'literalScopeCertifiedNonIr',
                'freshExclusiveSourceLease', 'gatewayProperlyClosed',
                'newImmutableWrapperAndGuardBound', 'ordinaryPrivateHooksUnchangedSealed'):
        need(a.get(key) is True, key)
    need(a.get('label') == 'obs011-t0-c8-public-error-observe01', 'NEW_LABEL')
    need(a.get('baseSourceDigest') == BASE and a.get('preimageSha256') == PREIMAGE, 'SOURCE_BASE')
    need(integer(a.get('selectedAttemptCap')) and a['selectedAttemptCap'] == 1, 'SELECTED_CAP')
    need(integer(a.get('restoreCompileCap')) and a['restoreCompileCap'] == 1, 'COMPILE_CAP')
    need(a.get('selectedArgv') == SELECTED and a.get('compileArgv') == COMPILE, 'EXACT_ARGV')
    need(a.get('fixtureProfile') == 'original4000', 'ORIGINAL_PROFILE')
    need(a.get('candidateSourceDigest') == CANDIDATE, 'EXACT_CANDIDATE_DIGEST')
    need(a.get('sourceWriters') == ['backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'], 'SOLE_SOURCE_WRITER')
    need(a.get('privateObserverReadOrCapture') is False and a.get('C8Credit') is False
         and a.get('IRCredit') is False and a.get('generalSourceRelease') is False, 'HOLDS')
    need(type(a.get('postimageSha256')) is str and len(a['postimageSha256']) == 64
         and all(c in '0123456789abcdef' for c in a['postimageSha256'])
         and a['postimageSha256'] != PREIMAGE, 'REVIEWED_POSTIMAGE')
    for key in ('releaseSha256', 'activeLockSha256', 'guardSha256', 'adapterSha256'):
        need(type(a.get(key)) is str and len(a[key]) == 64
             and all(c in '0123456789abcdef' for c in a[key]), key)
    return a


def current(facts, a, source, held=True):
    need(type(facts) is dict, 'CURRENT_FACTS')
    need(facts.get('releaseSha256') == a['releaseSha256']
         and facts.get('activeLockSha256') == a['activeLockSha256'], 'CURRENT_RELEASE_LOCK')
    need(facts.get('sourceDisposition') == source, 'CURRENT_SOURCE')
    need(facts.get('allOtherSourceModesEqualF9') is True, 'SOURCE_OUTSIDE_LEASE')
    need(facts.get('inheritedSixExactUnchanged') is True, 'INHERITED_SIX')
    need(facts.get('ownedLive') == [] and facts.get('unexpectedDescendants') == []
         and facts.get('ownedListeners') == [], 'OWNED_RESOURCES_DRAINED')
    need(facts.get('completeAnchoredCensuses') is True
         and facts.get('allUtilityCapturesWaitedComplete') is True
         and facts.get('priorClientsAbsentOrQualifiedReuse') is True
         and facts.get('currentClientFullyFingerprinted') is True, 'OBSERVER_ACCOUNTING')
    need(all(facts.get(key) is False for key in GAPS), 'STICKY_GAPS')
    if held:
        need(facts.get('sameOriginalWrapperShellStart') is True
             and facts.get('sameKernelLockHeld') is True, 'SAME_HOLD')
    else:
        need(facts.get('controllersAbsentOrQualifiedReuse') is True
             and facts.get('sameLockInodeKernelFree') is True, 'POSTCLOSE')
    if source == 'RESTORED':
        need(facts.get('sourceDigest') == BASE and facts.get('replaySha256') == PREIMAGE
             and integer(facts.get('replayMode')) and facts['replayMode'] == 0o644, 'EXACT_RESTORATION')
    elif source == 'CANDIDATE':
        need(facts.get('sourceDigest') == CANDIDATE and facts.get('replaySha256') == a['postimageSha256']
             and integer(facts.get('replayMode')) and facts['replayMode'] == 0o644, 'EXACT_CANDIDATE')
    else:
        raise Hold('SOURCE_DISPOSITION')
    return facts


def wrapper_disposition(ops, expected):
    need(integer(expected) and expected in (0, 1), 'EXPECTED_WRAPPER_EXIT')
    selected = ops.actual_selected_result()
    need(type(selected) is dict and integer(selected.get('phaseExit'))
         and (selected.get('nativeExit') is None or integer(selected.get('nativeExit'))), 'ACTUAL_SELECTED_RESULT')
    status = ops.public_observation_status()
    need(status in ('CAPTURED', 'NOT_REPRODUCED', 'NO_DECISION', 'UNAVAILABLE', 'MISMATCH', 'INVALID', 'AMBIGUOUS'), 'CLOSED_PUBLIC_STATUS')
    if selected['nativeExit'] != 0 or selected['phaseExit'] != 0 or status not in ('CAPTURED', 'NOT_REPRODUCED'):
        need(expected == 1, 'FAILED_UNIT_WRAPPER_MUST_BE_ONE')
    return expected


class Controller:
    """No default effects implementation. One method call is one separately inspected root phase.

    effects.claim_once/write_once are no-follow, exclusive, durable operations. Every current()
    includes fresh source, PID/start, mapped executables, utility captures, kernel lock and client
    accounting. run_owned() MUST use the pinned native ownership core's conservative census,
    sticky Java identities, repeated parent lock validation and BaseException-finally drain.
    Source installation/restoration MUST use the separately reviewed exact pre/postimage bytes.
    """
    def __init__(self, a, effects):
        self.a = authority(a)
        self.effects = effects

    def stage(self):
        a, ops = self.a, self.effects
        ops.claim_once('stage')
        current(ops.current(), a, 'RESTORED')
        ops.require_negative_and_held_admission(a)
        ops.install_exact_replay(PREIMAGE, a['postimageSha256'], 0o644)
        current(ops.current(), a, 'CANDIDATE')
        result = {'phase': 'stage', 'exit': 0, 'sourceDisposition': 'CANDIDATE'}
        ops.write_once('stage-result.json', result)
        return result

    def selected(self):
        a, ops = self.a, self.effects
        # Claim before setup/admission: a failed setup/compile/no-tests/observer attempt is consumed.
        ops.claim_once('selected')
        result = {'phase': 'selected', 'attempts': 1, 'nativeExit': None, 'phaseExit': 1,
                  'C8Credit': False, 'automaticRetry': False, 'disposition': 'FAILED_BEFORE_NATIVE'}
        try:
            ops.require_phase('stage', exit=0)
            ops.require_root_phase_decision('AUTHORIZE_ONE_SELECTED_NATIVE')
            current(ops.current(), a, 'CANDIDATE')
            native = ops.run_owned(list(SELECTED), 'backend', 'selected')
            need(integer(native.get('nativeExit')), 'ACTUAL_NATIVE_STATUS')
            result['nativeExit'] = native['nativeExit']
            result['phaseExit'] = native['nativeExit']
            result['disposition'] = 'NATIVE_TERMINAL'
            need(native.get('command') == SELECTED and native.get('fixtureProfile') == 'original4000', 'ACTUAL_NATIVE_COMMAND_PROFILE')
            need(integer(native.get('junitInvocations')) and native['junitInvocations'] == 1
                 and native.get('exactMethod') == METHOD and integer(native.get('skips'))
                 and native['skips'] == 0, 'EXACT_ONE_CASE_ZERO_SKIP')
            need(native.get('afterEachComplete') is True
                 and native.get('classLifecycleAccounted') is True
                 and native.get('normalFixturePrivateArtifactsSealed') is True
                 and native.get('retainOriginalGuidedCohortTaskSuccess') is True
                 and all(native.get(key) is True for key in COHORT_FLAGS), 'LIFECYCLE_PRIVACY')
            need(native.get('collectionComplete') is True
                 and all(native.get(k) is False for k in GAPS), 'NATIVE_EVIDENCE')
            current(ops.current(), a, 'CANDIDATE')
        except BaseException:
            # Actual nativeExit, if known, remains untouched. No retry/cleanup/signal is introduced.
            result['phaseExit'] = result['nativeExit'] or 1
            result['disposition'] = 'HOLD'
        finally:
            # Adapter must preserve BaseException and all failed drains as sticky evidence.
            ops.finally_record_owned_drain('selected')
            ops.write_once('selected-result.json', result)
        return result

    def restore(self):
        a, ops = self.a, self.effects
        ops.claim_once('restore')
        ops.require_phase_terminal('selected')
        ops.require_root_phase_decision('AUTHORIZE_EXACT_REPLAY_RESTORE')
        facts = ops.current()
        current(facts, a, facts.get('sourceDisposition'))
        ops.restore_exact_replay(a['postimageSha256'], PREIMAGE, 0o644)
        current(ops.current(), a, 'RESTORED')
        result = {'phase': 'restore', 'exit': 0, 'sourceDigest': BASE, 'replaySha256': PREIMAGE}
        ops.write_once('restore-result.json', result)
        return result

    def compile_restored(self):
        a, ops = self.a, self.effects
        ops.claim_once('compile-restored')
        result = {'phase': 'compile-restored', 'attempts': 1, 'nativeExit': None, 'phaseExit': 1}
        try:
            ops.require_phase('restore', exit=0)
            ops.require_root_phase_decision('AUTHORIZE_ONE_RESTORED_COMPILE_ONLY')
            current(ops.current(), a, 'RESTORED')
            native = ops.run_owned(list(COMPILE), 'backend', 'compile-restored')
            need(integer(native.get('nativeExit')), 'ACTUAL_COMPILE_STATUS')
            result['nativeExit'] = native['nativeExit']
            result['phaseExit'] = native['nativeExit']
            need(native.get('command') == COMPILE and native.get('testsInvoked') is False
                 and native.get('task') == 'compileTestJava', 'COMPILE_ONLY')
            need(native['nativeExit'] == 0 and native.get('compileTaskSuccess') is True
                 and native.get('buildSuccessful') is True
                 and all(native.get(k) is False for k in GAPS), 'RESTORED_COMPILE_SUCCESS')
            current(ops.current(), a, 'RESTORED')
        except BaseException:
            result['phaseExit'] = result['nativeExit'] or 1
        finally:
            ops.finally_record_owned_drain('compile-restored')
            ops.write_once('compile-restored-result.json', result)
        return result

    def final(self):
        a, ops = self.a, self.effects
        ops.require_phase('restore', exit=0)
        ops.require_phase('compile-restored', phaseExit=0, nativeExit=0)
        expected_exit = wrapper_disposition(ops, ops.qualified_expected_wrapper_exit())
        # A red/UNKNOWN tuple is never converted to a passing native result or C8 credit.
        ops.require_actual_evidence_review(expected_exit)
        first = current(ops.current(), a, 'RESTORED')
        second = current(ops.current(), a, 'RESTORED')
        proof = {'kind': 'PUBLIC_OBSERVATION_UNIT_PREUNLOCK', 'verifiedAtEpoch': ops.now(),
                 'releaseSha256': a['releaseSha256'], 'activeLockSha256': a['activeLockSha256'],
                 'expectedWrapperExit': expected_exit, 'sourceDigest': BASE,
                 'first': first, 'second': second, 'C8Credit': False}
        ops.write_once('preunlock-verification.json', proof)
        return proof

    def gate(self, explicit_exit):
        a, ops = self.a, self.effects
        need(integer(explicit_exit) and explicit_exit in (0, 1), 'EXPLICIT_EXIT')
        # A separate negative attempt finds no readiness and cannot call builtin exit.
        bundle = ops.read_readiness_and_separate_root_permit()
        need(type(bundle) is dict, 'MISSING_READINESS')
        proof, permit = bundle['proof'], bundle['permit']
        actual_hash = bundle.get('actualReadinessSha256')
        need(type(actual_hash) is str and len(actual_hash) == 64
             and all(c in '0123456789abcdef' for c in actual_hash), 'ACTUAL_READINESS_SHA')
        need(proof.get('releaseSha256') == a['releaseSha256']
             and proof.get('activeLockSha256') == a['activeLockSha256']
             and proof.get('expectedWrapperExit') == explicit_exit
             and integer(proof.get('expectedWrapperExit')), 'PROOF_BINDING')
        need(permit.get('authorizedBy') == 'root' and permit.get('decision') == 'AUTHORIZE_ONE_PUBLIC_OBSERVATION_UNIT_EXIT'
             and permit.get('releaseSha256') == a['releaseSha256']
             and permit.get('readinessSha256') == bundle.get('actualReadinessSha256')
             and integer(permit.get('expectedWrapperExit')) and permit['expectedWrapperExit'] == explicit_exit
             and permit.get('C8Credit') is False, 'SEPARATE_ROOT_PERMIT')
        ops.require_phase('restore', exit=0)
        ops.require_phase('compile-restored', phaseExit=0, nativeExit=0)
        need(wrapper_disposition(ops, explicit_exit) == ops.qualified_expected_wrapper_exit(), 'QUALIFIED_EXIT_MATCH')
        ops.require_actual_evidence_review(explicit_exit)
        issued, verified = permit.get('issuedAtEpoch'), proof.get('verifiedAtEpoch')
        need(type(issued) in (int, float) and type(verified) in (int, float)
             and issued >= verified, 'PERMIT_AFTER_READINESS')
        need(0 <= ops.now() - verified <= 60, 'FRESH_BEFORE')
        current(ops.current(), a, 'RESTORED')
        current(ops.current(), a, 'RESTORED')
        need(0 <= ops.now() - verified <= 60, 'FRESH_AFTER')
        ops.write_once('guard-allow.json', {'exit': 0, 'expectedWrapperExit': explicit_exit,
                                          'releaseSha256': a['releaseSha256'],
                                          'readinessSha256': bundle['actualReadinessSha256'], 'C8Credit': False})
        return 0

    def postclose(self):
        a, ops = self.a, self.effects
        result = ops.actual_wrapper_tool_result()
        need(integer(result.get('actualWrapperExit')) and result.get('separatelyCaptured') is True,
             'ACTUAL_SEPARATE_WRAPPER_RESULT')
        need(result['actualWrapperExit'] == ops.qualified_expected_wrapper_exit()
             and result.get('releaseSha256') == a['releaseSha256']
             and result.get('guardAllowExactlyBound') is True, 'WRAPPER_EXIT')
        current(ops.current(postclose=True), a, 'RESTORED', held=False)
        current(ops.current(postclose=True), a, 'RESTORED', held=False)
        proof = {'postcloseExit': 0, 'sourceDigest': BASE, 'C8Credit': False,
                 'globalOrHistoricalQuietClaim': False}
        ops.write_once('postclose-verification.json', proof)
        return proof


if __name__ == '__main__':
    raise SystemExit('HOLD: NO REVIEWED ROOT-BOUND EFFECTS ADAPTER; NO ACTION PERFORMED')
