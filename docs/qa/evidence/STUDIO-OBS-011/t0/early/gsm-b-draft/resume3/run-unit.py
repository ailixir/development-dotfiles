#!/usr/bin/env python3
"""Prepared GSMb driver. Actual execution is root-only after exact bound prior gate release."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import signal
import sys
import time
sys.dont_write_bytecode = True
from driver_support import (Journal, OwnedNative, ParentLock, Recorder, capture, file_state,
                            finalized_keep_allowed, safe_path, sha, utc)
from validate_collector import validate
from report_resources import load_policy, POLICY_SHA256

PHASES = ['red03', 'green', 'freeze', 'delete-side-effect', 'delete-clarify', 'delete-admit',
          'delete-bootstrap', 'admit-after-authorize']
SERVICE = 'backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java'
SESSION = 'backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java'
NEGATIVE = SESSION.replace('GuidedSessionIT', 'GuidedAdmissionWithoutTranslationIT')


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=PHASES)
    parser.add_argument('label')
    # Fixed order below in documented invocation also binds exact actual parent's trailing argv.
    parser.add_argument('--authorization', required=True)
    parser.add_argument('--root-proof-barrier-released', action='store_true', required=True)
    parser.add_argument('--keep-successful-freeze-unit', action='store_true')
    args = parser.parse_args(argv)
    if not re.fullmatch('obs011-[A-Za-z0-9_-]+', args.label):
        raise ValueError('FRESH_OBS011_LABEL_REQUIRED')
    return args


def immutable_inputs(root, plan):
    adoption = plan['wrapperAdoptionReceipt']
    if file_state(safe_path(root, adoption['path']))['sha256'] != adoption['sha256']:
        raise ValueError('EXACT_WRAPPER_STATIC_ADOPTION_CHANGED')
    for name, digest in plan['immutableHelpers'].items():
        state = file_state(safe_path(root, name))
        if state is None or state['sha256'] != digest:
            raise ValueError('IMMUTABLE_HELPER_CHANGED')


def main():
    args = parse_args()
    here = Path(__file__).resolve().parent
    root = next(p for p in here.parents if (p / 'backend/gradlew').is_file())
    plan = json.loads(file_state(here / 'driver-plan.json')['bytes'])
    manifest = json.loads(file_state(here / 'manifest.json')['bytes'])
    if plan['reportResourcePolicySha256'] != POLICY_SHA256:
        raise ValueError('EXACT_RESOURCE_POLICY_REQUIRED')
    resource_policy = load_policy(root, here / 'report-resource-policy.json')
    if sha(file_state(here / 'manifest.json')['bytes']) != plan['sourceManifestSha256']:
        raise ValueError('BOUND_MANIFEST_CHANGED')
    for line in file_state(here / 'artifact-hashes.sha256')['bytes'].decode().splitlines():
        digest, name = line.split('  ', 1)
        part = Path(name)
        if part.is_absolute() or '..' in part.parts:
            raise ValueError('INVALID_ARTIFACT_PATH')
        if file_state(safe_path(root, here / part))['sha256'] != digest:
            raise ValueError('IMMUTABLE_DRAFT_CHANGED')
    authorization_path = safe_path(root, args.authorization).resolve()
    authorization_state = file_state(authorization_path)
    authorization = json.loads(authorization_state['bytes'])
    required = {'authorized': True, 'phase': args.phase, 'label': args.label,
                'keepSuccessfulFreezeUnit': args.keep_successful_freeze_unit,
                'rootProofBarrierReleased': True,
                'driverSha256': file_state(here / 'run-unit.py')['sha256'],
                'supportSha256': file_state(here / 'driver_support.py')['sha256'],
                'validatorSha256': file_state(here / 'validate_collector.py')['sha256'],
                'resourceClassifierSha256': file_state(here / 'report_resources.py')['sha256'],
                'planSha256': file_state(here / 'driver-plan.json')['sha256'],
                'artifactLedgerSha256': file_state(here / 'artifact-hashes.sha256')['sha256']}
    if any(authorization.get(key) != value for key, value in required.items()):
        raise ValueError('ROOT_EXACT_UNIT_AUTHORIZATION_REQUIRED')
    # These bind root's actual already-made gate decisions; never synthesize/declare gates here.
    gate_names = {'freshOriginalFullCheckCoverageSource', 'gsTFullGateLiteralS011Main',
                  'correctedGsmAGreenAndAcceptedBatons'}
    if set(authorization.get('priorGateReceipts', {})) != gate_names:
        raise ValueError('PRIOR_ACTUAL_GATES_NOT_BOUND')
    for fact in authorization['priorGateReceipts'].values():
        if file_state(safe_path(root, fact['path']))['sha256'] != fact['sha256']:
            raise ValueError('BOUND_PRIOR_GATE_RECEIPT_CHANGED')
    wrapper = root / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py'
    tail = [str(wrapper), sys.executable, str(Path(__file__).resolve()), *sys.argv[1:]]
    lock = ParentLock(root, wrapper, plan['immutableHelpers'][str(wrapper.relative_to(root))], tail, sys.executable)
    initial_lock = lock.verify()
    immutable_inputs(root, plan)
    proof = {item['path']:item['S011Sha256'] for item in manifest['proofFiles']}

    def proof_facts():
        facts = {name: file_state(safe_path(root, name)) for name in proof}
        return {name: {'sha256': value['sha256'], 'mode': oct(value['mode'])} for name, value in facts.items()}

    expected_proof = {name: {'sha256': value, 'mode': plan['proofModes'][name]} for name, value in proof.items()}
    if proof_facts() != expected_proof:
        raise ValueError('FOUR_ORIGINAL_PROOF_FILES_NOT_EXACT')
    for fact in manifest['unchangedGsTBatons']:
        if file_state(safe_path(root, fact['path']))['sha256'] != fact['sha256']:
            raise ValueError('GS_T_ACCEPTED_PREIMAGE_NOT_EXACT')
    mutation = args.phase in manifest['mutants']
    for fact in manifest['files']:
        state = file_state(safe_path(root, fact['path']))
        if ((state['sha256'] if state else None) != fact['draftSha256' if mutation else 'baseSha256']
                or state is not None and oct(state['mode']) != plan['sourceModes'][fact['path']]):
            raise ValueError('EXACT_GSMA_GST_OR_FINAL_PREIMAGE_DIFFERS')
    execution = safe_path(root, 'docs/qa/evidence/STUDIO-OBS-011/execution')
    labels = [args.label + '-' + s for s in ['b01', 'b02', 'b03']] if args.phase == 'freeze' else [args.label]
    for label in labels:
        if list(execution.glob(label + '*')):
            raise ValueError('EXECUTION_LABEL_ALREADY_USED')
    folder = safe_path(root, execution / 'gs-m' / (args.label + '-unit'))
    folder.mkdir(mode=0o700, parents=True, exist_ok=False)
    receipt = {'schemaVersion': 2, 'status': 'PREPARED_TO_STAGE', 'phase': args.phase,
               'label': args.label, 'errors': [], 'events': [], 'runs': [], 'interrupted': False,
               'finalizedSuccess': False, 'keptSuccessfulFreezeUnit': False,
               'sourceRestored': False, 'originalCompileSucceeded': False,
               'authorizationSha256': authorization_state['sha256'], 'initialParentLock': initial_lock,
               'proofBeforeMainChange': proof_facts(), 'notQaOrLaneVerdict': True,
               'wrapperRuling': 'GSMB-WRAPPER-1 bounded static criterion adopted by exact bound root receipt; no runtime or driver approval'}
    rec = Recorder(folder, receipt)
    native = OwnedNative(lock, rec)
    saved_handlers = {}

    def deferred(signum, frame):
        receipt['interrupted'] = True
        rec.error('DEFERRED_SIGNAL_' + str(signum))

    def boundary():
        native.drain()
        try:
            lock.verify(); immutable_inputs(root, plan)
        except BaseException:
            rec.hold('SOURCE_BOUNDARY_LOCK_OR_HELPER_UNPROVEN', lock)

    def compile_unit(name):
        boundary()
        return native.run(['./gradlew', 'compileTestJava', '--no-daemon'], root / 'backend', env,
                          folder / (name + '.private.log'), name)

    expected = json.loads(file_state(here / 'expected-discovery.json')['bytes'])['cases']
    base = 'com.citi.put.checks.studio.guided.'
    negative_class = base + 'session.GuidedAdmissionWithoutTranslationIT'
    classes = {'b01': [base + 'session.' + n for n in ['GuidedSessionIT', 'GuidedServiceTransportFaultIT',
                  'GuidedLifecycleReasonIT', 'GuidedAdmissionWithoutTranslationIT']],
               'b02': [base + 'session.' + n for n in ['GuidedBridgeIntegrationTest', 'GuidedBridgePlannedIT',
                  'GuidedPlanningIntegrationTest']], 'b03': [base + 'publication.GuidedPublicationReplayIT']}
    env = dict(os.environ, JAVA_HOME=plan['javaHome'])
    env['PATH'] = str(Path.home() / '.local/share/fnm/node-versions/v24.20.0/installation/bin') + os.pathsep + env['PATH']

    def run(suffix, label, selected):
        boundary()
        with (folder / (label + '-listeners.txt')).open('x') as stream:
            stream.write(capture(['/usr/sbin/lsof', '-nP', '-iTCP', '-sTCP:LISTEN'], (0, 1)))
        tasks = ['test', 'guidedIncrementalTest'] if suffix == 'b03' else ['test']
        command = [sys.executable, '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py',
                   label, '--test-tasks', ','.join(tasks), '--require-exec-tasks', ','.join(tasks), '--']
        for task in tasks:
            command += [task]
            for name in selected:
                command += ['--tests', name]
        command += ['--continue', '--rerun-tasks', '--no-daemon']
        exit_code = native.run(command, root, env, folder / (label + '-collector.private.log'), label)
        # Native drain already settled BEFORE receipt reads or any following source operation.
        result = validate(root, execution, label, selected, tasks, expected, exit_code, time.time(), resource_policy)
        result.update({'suffix': suffix, 'label': label, 'proofAfterCollector': proof_facts()})
        result['validatedComplete'] = result['validatedComplete'] and result['proofAfterCollector'] == expected_proof
        receipt['runs'].append(result)
        rec.emit('VALIDATED_COLLECTOR_RESULT', suffix=suffix, validatedComplete=result['validatedComplete'])
        return result['validatedComplete']

    changes = {}
    if mutation:
        changes[SERVICE] = file_state(here / 'mutants' / (args.phase + '.java.txt'))['bytes']
        if sha(changes[SERVICE]) != manifest['mutants'][args.phase]['serviceSha256']:
            raise ValueError('EXACT_REVIEWED_MUTANT_REQUIRED')
    else:
        for fact in manifest['files']:
            if fact['path'] == NEGATIVE or (args.phase != 'red03' and not fact['forwardedUnchanged']):
                changes[fact['path']] = file_state(here / 'repo' / fact['path'])['bytes']
    journal = None
    try:
        for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
            saved_handlers[sig] = signal.signal(sig, deferred)
        boundary()
        if receipt['interrupted']:
            raise ValueError('INTERRUPTED_BEFORE_STAGE')
        journal = Journal(root, folder, changes, rec, boundary)
        if receipt['errors']:
            raise ValueError('JOURNAL_PERSISTENCE_INCOMPLETE')
        receipt['status'] = 'RUNNING_UNIT'
        journal.stage()
        receipt['candidateCompileExit'] = compile_unit('candidate-compile')
        if receipt['candidateCompileExit'] != 0:
            raise ValueError('CANDIDATE_COMPILE_FAILED_NEVER_ASSERTION_RED')
        if args.phase == 'freeze':
            for suffix in ['b01', 'b02', 'b03']:
                if not run(suffix, args.label + '-' + suffix, classes[suffix]):
                    break
        else:
            run(args.phase, args.label, [negative_class])
        boundary()
        receipt['proofAfterRuns'] = proof_facts()
        # Start false; all required evidence and final hashes MUST exist before this assignment.
        receipt['finalizedSuccess'] = finalized_keep_allowed(args.phase,
            args.keep_successful_freeze_unit, receipt['runs'], receipt['proofAfterRuns'] == expected_proof,
            receipt['errors'], receipt['interrupted'])
        rec.emit('FINAL_SUCCESS_DECISION', finalizedSuccess=receipt['finalizedSuccess'])
    except BaseException as error:
        receipt['finalizedSuccess'] = False
        rec.error('UNIT_EXCEPTION_' + type(error).__name__)
        rec.emit('UNIT_FAILED_KEEP_DISABLED')
    finally:
        # The OWNED closure runs even if receipt, observer, IO, signal or parsing failed.
        native.drain()
        boundary()
        final_proof_matches = False
        try:
            receipt['proofAtFinalSourceDecision'] = proof_facts()
            final_proof_matches = receipt['proofAtFinalSourceDecision'] == expected_proof
            if receipt['finalizedSuccess']:
                for fact in manifest['files']:
                    current = file_state(safe_path(root, fact['path']))
                    if (current is None or current['sha256'] != fact['draftSha256']
                            or oct(current['mode']) != plan['sourceModes'][fact['path']]):
                        final_proof_matches = False
            if not final_proof_matches:
                rec.error('FINAL_PROOF_OR_CANDIDATE_BYTES_MODE_MISMATCH')
        except BaseException as error:
            rec.error('FINAL_PROOF_OBSERVATION_' + type(error).__name__)
        keep = receipt['finalizedSuccess'] and finalized_keep_allowed(args.phase,
            args.keep_successful_freeze_unit, receipt['runs'],
            final_proof_matches, receipt['errors'], receipt['interrupted'])
        if not keep:
            receipt['finalizedSuccess'] = False
            if journal is not None:
                restored = journal.restore()  # Independent per-file attempts; no early IO unwind.
                receipt['sourceRestored'] = restored
                if not restored:
                    rec.hold('RESTORATION_INCOMPLETE_HOLD_NO_RELEASE', lock)
                try:
                    receipt['originalCompileExit'] = compile_unit('original-compile')
                    receipt['originalCompileSucceeded'] = receipt['originalCompileExit'] == 0
                except BaseException as error:
                    rec.error('RESTORATION_COMPILE_EXCEPTION_' + type(error).__name__)
                native.drain()
                boundary()
                integrity_failure = None
                try:
                    original_integrity = journal.originals_match()
                except BaseException as error:
                    original_integrity = False
                    integrity_failure = 'ORIGINAL_INTEGRITY_OBSERVATION_' + type(error).__name__
                    rec.error(integrity_failure)
                if not original_integrity:
                    receipt['finalizedSuccess'] = False
                    receipt['keptSuccessfulFreezeUnit'] = False
                    receipt['sourceRestored'] = False
                    receipt['originalCompileSucceeded'] = False
                    native.drain(); boundary()
                    rec.hold(integrity_failure or 'RESTORED_BYTES_MODE_CHANGED_DURING_ORIGINAL_COMPILE', lock)
                if not receipt['originalCompileSucceeded']:
                    rec.hold('ORIGINAL_COMPILE_FAILED_HOLD_NO_RETRY_OR_RELEASE', lock)
        receipt['keptSuccessfulFreezeUnit'] = bool(keep)
        receipt['status'] = 'TERMINAL_UNASSESSED' if not receipt['errors'] else 'TERMINAL_SAFE_SOURCE_EVIDENCE_INCOMPLETE'
        rec.emit('UNIT_TERMINAL', keptSuccessfulFreezeUnit=bool(keep))
        if receipt['errors'] and keep:
            # A terminal write failure cannot authorize keeping an unproved staged unit.
            receipt['finalizedSuccess'] = False
            receipt['keptSuccessfulFreezeUnit'] = False
            receipt['status'] = 'RESTORING_AFTER_TERMINAL_PERSISTENCE_FAILURE'
            post_failure = None
            try:
                receipt['sourceRestored'] = journal.restore()
                if not receipt['sourceRestored']:
                    post_failure = 'POST_DECISION_RESTORE_INCOMPLETE_HOLD'
                else:
                    receipt['originalCompileExit'] = compile_unit('post-decision-original-compile')
                    receipt['originalCompileSucceeded'] = receipt['originalCompileExit'] == 0
                    if not receipt['originalCompileSucceeded']:
                        post_failure = 'POST_DECISION_ORIGINAL_COMPILE_FAILED_HOLD'
                    elif not journal.originals_match():
                        post_failure = 'POST_DECISION_RESTORED_BYTES_MODE_CHANGED'
            except BaseException as error:
                post_failure = 'POST_DECISION_COMPILE_OR_INTEGRITY_EXCEPTION_' + type(error).__name__
                rec.error(post_failure)
                receipt['sourceRestored'] = False
                receipt['originalCompileSucceeded'] = False
            # No post-compile IO/assessment exception escapes to the unlocking parent.
            native.drain(); boundary()
            if post_failure is not None:
                receipt['finalizedSuccess'] = False
                receipt['keptSuccessfulFreezeUnit'] = False
                receipt['sourceRestored'] = False
                receipt['originalCompileSucceeded'] = False
                rec.hold(post_failure, lock)
            receipt['keptSuccessfulFreezeUnit'] = False
            receipt['status'] = 'TERMINAL_SAFE_SOURCE_EVIDENCE_INCOMPLETE'
            rec.emit('TERMINAL_PERSISTENCE_FAILED_RESTORED')
        for sig, handler in saved_handlers.items():
            signal.signal(sig, handler)
    # Red/survivor/mutation interpretation is still independent and manual.
    return 0 if not receipt['errors'] and all(r['validatedComplete'] for r in receipt['runs']) else 1


if __name__ == '__main__':
    raise SystemExit(main())
