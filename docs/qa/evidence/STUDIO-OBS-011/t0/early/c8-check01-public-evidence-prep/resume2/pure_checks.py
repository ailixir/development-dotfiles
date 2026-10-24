"""Reads only this prepared packet, then blocks every real effect throughout tested code.

No Java/Bash/native/adapter/main is executed. Assertions are finite public synthetic records.
"""
from pathlib import Path
import ast
import builtins
import copy
import fcntl
import hashlib
import io
import json
import os
import re
import socket
import subprocess
import sys
import time
import stat
import types
from contextlib import ExitStack
from unittest.mock import patch

HERE = Path(__file__).absolute().parent
FILES = {name: (HERE / name).read_bytes() for name in (
    'public_contract.py', 'unit_policy.py', 'public-policy.json', 'source-binding.json',
    'Replay.preimage.java', 'Replay.postimage.java', 'observer-fragment.java.txt',
    'observer.patch', 'observer.reverse.patch', 'guard-public-observe.bash')}
CONTRACT = {'__name__': 'prepared_public_contract'}
CONTROL = {'__name__': 'prepared_unit_policy'}
# Entire modules contain only imports of already-loaded json/re, constants, and definitions.
exec(compile(FILES['public_contract.py'], '<prepared-public-contract>', 'exec'), CONTRACT)
exec(compile(FILES['unit_policy.py'], '<prepared-unit-policy>', 'exec'), CONTROL)
POLICY = json.loads(FILES['public-policy.json'])
SOURCE = json.loads(FILES['source-binding.json'])
RESULTS = []
BLOCKED_CALLS = []


def check(name, condition):
    if condition is not True:
        raise AssertionError(name)
    RESULTS.append({'name': name, 'pass': True})


def denied(name, callback):
    try:
        callback()
    except (ValueError, CONTROL['Hold'], AssertionError, TypeError, KeyError, OSError):
        check(name, True)
    else:
        check(name, False)


def blocked(*args, **kwargs):
    BLOCKED_CALLS.append('FORBIDDEN_REAL_EFFECT')
    raise AssertionError('REAL_EFFECT_BOUNDARY_BLOCKED')


def wire(**updates):
    value = {'schemaVersion': 3, 'sessionId': '00000000-0000-0000-0000-000000000001',
             'executionId': '00000000-0000-0000-0000-000000000001',
             'mode': 'guided', 'outcome': 'FAILED', 'errorCode': 'LOGIN_REQUIRED'}
    value.update(updates)
    return json.dumps(value, ensure_ascii=False).encode()


def produce(poll='FAILED', raw=None, status=200, modify=None, send_error=False, write_error=False):
    producer = CONTRACT['ProducerReference']()
    subject = '00000000-0000-0000-0000-000000000001'
    cookie = 'SYNTHETIC_COOKIE_CANARY_é'
    producer.bind(subject, cookie)
    current_cookie = cookie
    owned = {subject: cookie}
    if modify:
        current_cookie, owned = modify(producer, subject, cookie)
    calls, writes = [], []
    def send(s, c, budget):
        calls.append((s, c, budget))
        if send_error:
            raise OSError('SYNTHETIC_OBSERVER_MESSAGE_CANARY')
        return status, raw if raw is not None else wire()
    def write(value):
        if write_error:
            raise OSError('SYNTHETIC_WRITE_MESSAGE_CANARY')
        writes.append(copy.deepcopy(value))
    result = producer.observe(subject, poll, current_cookie, owned, send, write)
    return result, calls, writes, producer, send, write, subject, current_cookie, owned


def auth():
    a = {'rootAuthorized': True, 'exactAriaCodeReviewed': True,
         'exactQaCodePrivacyReviewed': True, 'limitedSourceWindowQualified': True,
         'literalScopeCertifiedNonIr': True, 'freshExclusiveSourceLease': True,
         'gatewayProperlyClosed': True, 'newImmutableWrapperAndGuardBound': True,
         'ordinaryPrivateHooksUnchangedSealed': True,
         'label': POLICY['constants']['unit'], 'baseSourceDigest': CONTROL['BASE'],
         'preimageSha256': CONTROL['PREIMAGE'], 'postimageSha256': SOURCE['postimageSha256'],
         'selectedAttemptCap': 1, 'restoreCompileCap': 1,
         'selectedArgv': list(CONTROL['SELECTED']), 'compileArgv': list(CONTROL['COMPILE']),
         'fixtureProfile': 'original4000', 'candidateSourceDigest': SOURCE['candidateVirtualWholeSourceDigest'], 'sourceWriters': [SOURCE['path']],
         'privateObserverReadOrCapture': False, 'C8Credit': False, 'IRCredit': False,
         'generalSourceRelease': False,
         'releaseSha256': 'a' * 64, 'activeLockSha256': 'b' * 64,
         'guardSha256': 'c' * 64, 'adapterSha256': 'd' * 64}
    return a


class Effects:
    """Finite in-memory protocol fakes. No inherited real implementation or fallback."""
    def __init__(self, a):
        self.a = a
        self.claims, self.files, self.events = set(), {}, []
        self.source = 'RESTORED'
        self.native_exit = 1
        self.fail_run = False
        self.current_change = None
        self.readiness = None
        self.clock = 1000
        self.clock_after = None
        self.wrapper_exit = 1
        self.native_change = {}
        self.public_status = 'CAPTURED'

    def claim_once(self, phase):
        CONTROL['need'](phase not in self.claims, 'CONSUMED_ATTEMPT')
        self.claims.add(phase)
        self.events.append(('claim', phase))

    def write_once(self, name, value):
        CONTROL['need'](name not in self.files, 'IMMUTABLE_MEMBER')
        self.files[name] = copy.deepcopy(value)
        self.events.append(('write', name))

    def current(self, postclose=False):
        self.events.append(('current', postclose))
        facts = {'releaseSha256': self.a['releaseSha256'], 'activeLockSha256': self.a['activeLockSha256'],
                 'sourceDisposition': self.source, 'allOtherSourceModesEqualF9': True,
                 'inheritedSixExactUnchanged': True, 'ownedLive': [], 'unexpectedDescendants': [],
                 'ownedListeners': [], 'completeAnchoredCensuses': True,
                 'allUtilityCapturesWaitedComplete': True, 'priorClientsAbsentOrQualifiedReuse': True,
                 'currentClientFullyFingerprinted': True, 'sameOriginalWrapperShellStart': True,
                 'sameKernelLockHeld': True, 'controllersAbsentOrQualifiedReuse': True,
                 'sameLockInodeKernelFree': True, 'replayMode': 0o644,
                 'sourceDigest': CONTROL['BASE'] if self.source == 'RESTORED' else CONTROL['CANDIDATE'],
                 'replaySha256': CONTROL['PREIMAGE'] if self.source == 'RESTORED' else self.a['postimageSha256'],
                 **{k: False for k in CONTROL['GAPS']}}
        if self.current_change:
            facts.update(self.current_change)
        if self.clock_after is not None:
            self.clock = self.clock_after
        return facts

    def require_negative_and_held_admission(self, a):
        self.events.append(('negative-and-same-held',))

    def install_exact_replay(self, pre, post, mode):
        self.events.append(('install', pre, post, mode))
        self.source = 'CANDIDATE'

    def restore_exact_replay(self, post, pre, mode):
        self.events.append(('restore', post, pre, mode))
        self.source = 'RESTORED'

    def require_phase(self, phase, **values):
        name = 'compile-restored-result.json' if phase == 'compile-restored' else phase + '-result.json'
        CONTROL['need'](name in self.files, 'MISSING_PHASE')
        for key, value in values.items():
            CONTROL['need'](type(self.files[name].get(key)) is type(value)
                            and self.files[name][key] == value, 'REQUIRED_PHASE_STATUS')

    def require_phase_terminal(self, phase):
        CONTROL['need'](phase + '-result.json' in self.files, 'MISSING_TERMINAL_PHASE')

    def require_root_phase_decision(self, decision):
        self.events.append(('root-decision', decision))

    def run_owned(self, command, cwd, phase):
        self.events.append(('run-owned', list(command), cwd, phase))
        if self.fail_run:
            raise KeyboardInterrupt('SYNTHETIC_INTERRUPT_CANARY')
        value = {'command': list(command), 'nativeExit': self.native_exit if phase == 'selected' else 0,
                 'fixtureProfile': 'original4000', 'junitInvocations': 1, 'skips': 0,
                 'exactMethod': CONTROL['METHOD'], 'afterEachComplete': True,
                 'classLifecycleAccounted': True, 'normalFixturePrivateArtifactsSealed': True,
                 'collectionComplete': True, 'retainOriginalGuidedCohortTaskSuccess': True,
                 **{k: True for k in CONTROL['COHORT_FLAGS']}, 'testsInvoked': False, 'task': 'compileTestJava',
                 'compileTaskSuccess': True, 'buildSuccessful': True,
                 **{k: False for k in CONTROL['GAPS']}}
        value.update(self.native_change)
        return value

    def finally_record_owned_drain(self, phase):
        self.events.append(('finally-drain', phase))

    def actual_selected_result(self):
        CONTROL['need']('selected-result.json' in self.files, 'MISSING_SELECTED_RESULT')
        return self.files['selected-result.json']

    def public_observation_status(self):
        return self.public_status

    def qualified_expected_wrapper_exit(self):
        return self.wrapper_exit

    def require_actual_evidence_review(self, expected):
        self.events.append(('actual-review', expected))

    def now(self):
        return self.clock

    def read_readiness_and_separate_root_permit(self):
        return self.readiness

    def actual_wrapper_tool_result(self):
        return {'actualWrapperExit': self.wrapper_exit, 'separatelyCaptured': True,
                'releaseSha256': self.a['releaseSha256'], 'guardAllowExactlyBound': True}


def ready(effects, expected_exit=1):
    effects.files.setdefault('selected-result.json', {'nativeExit':1,'phaseExit':1})
    effects.files.setdefault('restore-result.json', {'exit':0})
    effects.files.setdefault('compile-restored-result.json', {'nativeExit':0,'phaseExit':0})
    effects.readiness = {
        'proof': {'releaseSha256': effects.a['releaseSha256'], 'activeLockSha256': effects.a['activeLockSha256'],
                  'expectedWrapperExit': expected_exit, 'verifiedAtEpoch': 1000},
        'permit': {'authorizedBy': 'root', 'decision': 'AUTHORIZE_ONE_PUBLIC_OBSERVATION_UNIT_EXIT',
                   'releaseSha256': effects.a['releaseSha256'], 'readinessSha256': 'e' * 64,
                   'expectedWrapperExit': expected_exit, 'issuedAtEpoch': 1000, 'C8Credit': False},
        'actualReadinessSha256': 'e' * 64}


def strict_apply(original, patch_text):
    """Exact unified diff replay; no fuzzy offset, external patch command, or filesystem writes."""
    lines, out, pos = original.splitlines(True), [], 0
    diff = patch_text.splitlines(True)
    need_header = diff[0].startswith('--- a/') and diff[1].startswith('+++ b/')
    if not need_header:
        raise ValueError('HEADER')
    index = 2
    while index < len(diff):
        match = re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n', diff[index])
        if not match:
            raise ValueError('HUNK')
        start = int(match[1]) - 1
        if start < pos:
            raise ValueError('OVERLAP')
        out.extend(lines[pos:start]); pos = start; index += 1
        while index < len(diff) and not diff[index].startswith('@@ '):
            tag, body = diff[index][0], diff[index][1:]
            if tag in ' -':
                if pos >= len(lines) or lines[pos] != body:
                    raise ValueError('EXACT_PREIMAGE')
                pos += 1
            if tag in ' +':
                out.append(body)
            if tag not in ' +-':
                raise ValueError('HUNK_LINE')
            index += 1
    out.extend(lines[pos:])
    return ''.join(out)



def loader_case(change=None):
    guard = FILES['guard-public-observe.bash'].decode()
    loader = guard.split("readonly C8_PUBLIC_CONTROL_LOADER='\n", 1)[1].split("\n'\nexit()", 1)[0]
    raw = b"raise RuntimeError('THIS_BODY_MUST_NEVER_EXECUTE_IN_TESTS')\n"
    runtime = types.SimpleNamespace(argv=['-c', '/owned/new/unit/control.py', hashlib.sha256(raw).hexdigest(), 'a'*64, '1'])
    events, opened, closed, executed = [], [], [], []
    class FakeOS:
        O_RDONLY=os.O_RDONLY; O_DIRECTORY=os.O_DIRECTORY; O_NOFOLLOW=os.O_NOFOLLOW
        def __init__(self):
            self.offset=0; self.stat_calls=0; self.mode=stat.S_IFREG | 0o600
            self.owner=501; self.size=len(raw); self.change_inode=False; self.fail_open=None
        def open(self,path,flags,dir_fd=None):
            events.append(('open',path,flags,dir_fd))
            if self.fail_open == path:
                raise OSError('SYNTHETIC_OPEN_FAILURE')
            assert flags & self.O_NOFOLLOW
            fd=100+len(opened);opened.append(fd);return fd
        def close(self,fd):
            closed.append(fd)
        def fstat(self,fd):
            self.stat_calls += 1
            return types.SimpleNamespace(st_mode=self.mode,st_uid=self.owner,st_size=self.size,
                st_dev=1,st_ino=2+(1 if self.change_inode and self.stat_calls>1 else 0),st_mtime_ns=3,st_ctime_ns=4)
        def getuid(self):
            return 501
        def read(self,fd,count):
            value=raw[self.offset:self.offset+count];self.offset+=len(value);return value
    fake=FakeOS()
    if change:
        change(fake,runtime)
    modules={'hashlib':hashlib,'os':fake,'stat':stat,'sys':runtime}
    safe=dict(vars(builtins))
    safe['__import__']=lambda name,*unused: modules[name]
    namespace={'__builtins__':safe,'compile':lambda raw,path,mode:(raw,path,mode),
               'exec':lambda code,globals:executed.append((code,globals))}
    try:
        exec(compile(loader,'<prospective-guard-loader-with-fully-fake-os>','exec'),namespace)
    finally:
        check('LOADER_CLOSES_ALL_OPENED_' + str(len(RESULTS)),closed==list(reversed(opened)))
    return events,executed,runtime


def tests():
    # No effect is available in any imported/tested production module.
    for namespace in (CONTRACT, CONTROL):
        check('NO_REAL_EFFECT_MODULE_' + namespace['__name__'],
              not any(k in namespace for k in ('os', 'subprocess', 'fcntl', 'Path', 'socket', 'time')))
    for code in POLICY['codes']:
        out, calls, writes, *_ = produce(raw=wire(errorCode=code))
        check('ALLOWLIST_' + code, out['errorCode'] == code and out['codeQualified'] is (code != 'UNKNOWN')
              and len(calls) == 1 and calls[0][2] == 15 and len(writes) == 1)
        check('CLOSED_RECORD_' + code, CONTRACT['validate_record'](out) == out)
    for unknown in (None, '', 'OTHER', 'NONE', 'False', 'UNKNOWN_NEW', 'é😀', 0, 1, False, True, [], {}, {'private': 'CANARY'}):
        out, calls, *_ = produce(raw=wire(errorCode=unknown))
        check('UNKNOWN_CODE_' + repr(unknown), out['errorCode'] == 'UNKNOWN' and out['codeQualified'] is False and len(calls) == 1)
    out, calls, *_ = produce(raw=wire(**{'outcome': 'FAILED'}).replace(b', "errorCode": "LOGIN_REQUIRED"', b''))
    check('MISSING_CODE_UNKNOWN', out['errorCode'] == 'UNKNOWN' and out['codeQualified'] is False)
    for state in POLICY['states']:
        out, calls, *_ = produce(poll=state, raw=wire(outcome=state))
        if state == 'FINALIZING':
            check('FINALIZING_NO_PUBLIC_REQUEST', out == CONTRACT['record'](state, 'NOT_REPRODUCED') and calls == [])
        elif state == 'UNKNOWN':
            check('UNKNOWN_NO_PUBLIC_REQUEST', out == CONTRACT['record'](state, 'NO_DECISION') and calls == [])
        else:
            check('TERMINAL_' + state, out['captureStatus'] == 'CAPTURED' and len(calls) == 1
                  and (state == 'FAILED' or (out['errorCode'] == 'UNKNOWN' and out['codeQualified'] is False)))
        CONTRACT['validate_record'](out)
    for state in POLICY['states']:
        if state == 'FAILED':
            continue
        out, *_ = produce(raw=wire(outcome=state))
        check('SEPARATE_OBSERVATION_MISMATCH_' + state,
              out['captureStatus'] == 'MISMATCH' and out['publicOutcomeOrState'] == state
              and out['errorCode'] == 'UNKNOWN' and out['codeQualified'] is False)
    for key, bad in [('sessionId','wrong'),('executionId','wrong'),('mode','ordinary'),
                     ('schemaVersion',True),('schemaVersion',3.0),('schemaVersion','3'),
                     ('sessionId',None),('executionId',['wrong'])]:
        out, calls, *_ = produce(raw=wire(**{key:bad}))
        check('WRONG_SUBJECT_SCHEMA_' + key + repr(bad), out['captureStatus'] == 'INVALID'
              and out['codeQualified'] is False and len(calls) == 1)
    for status in (204, 301, 307, 400, 401, 403, 404, 429, 500):
        out, calls, *_ = produce(status=status)
        check('NON200_' + str(status), out['captureStatus'] == 'UNAVAILABLE' and len(calls) == 1)
    for state in POLICY['states']:
        raw=json.dumps({'schemaVersion':3,'sessionId':'00000000-0000-0000-0000-000000000001','state':state}).encode()
        out,calls,*_=produce(raw=raw,status=202)
        check('PUBLIC202_SEPARATE_STATE_' + state, len(calls)==1 and out['errorCode']=='UNKNOWN' and out['codeQualified'] is False
              and (out['captureStatus']=='INVALID' if state=='FAILED' else out['captureStatus']=='MISMATCH' and out['publicOutcomeOrState']==state))
        CONTRACT['validate_record'](out)
    out,calls,*_=produce(raw=wire(),status=202)
    check('PUBLIC202_AMBIGUOUS_RESULT_FORM_INVALID',out['captureStatus']=='INVALID' and len(calls)==1)
    out,calls,*_=produce(raw=wire(state='FAILED'))
    check('PUBLIC200_AMBIGUOUS_STATE_FORM_INVALID',out['captureStatus']=='INVALID' and len(calls)==1)
    bad_json = [b'', b'null',b'[]',b'{',b'{}{}',b'NaN',b'{"x":1,"x":2}',wire()+b'\n{}',
                wire().replace(b'LOGIN_REQUIRED', b'LOGIN_REQUIRED", "errorCode":"OK'), b'\xff',b'x'*262145]
    for index, raw in enumerate(bad_json):
        out, calls, *_ = produce(raw=raw)
        check('MALFORMED_' + str(index), out['captureStatus'] in ('UNAVAILABLE','INVALID')
              and out['errorCode'] == 'UNKNOWN' and out['codeQualified'] is False and len(calls) == 1)
    for name, modify in (
        ('wrong-cookie', lambda p,s,c: ('wrong',{s:c})),
        ('wrong-owned-cookie', lambda p,s,c: (c,{s:'wrong'})),
        ('no-owned', lambda p,s,c: (c,{})),
        ('multiple-owned', lambda p,s,c: (c,{s:c,'second':c})),
        ('duplicate-bind', lambda p,s,c: (p.bind(s,c) or c,{s:c})),
    ):
        out,calls,*_=produce(modify=modify)
        check('OWNERSHIP_' + name, out['captureStatus'] in ('INVALID','AMBIGUOUS') and calls == [] and out['codeQualified'] is False)
    out, calls, writes, producer, send, write, subject, cookie, owned = produce()
    check('SINGLEFLIGHT_SECOND_SAME', producer.observe(subject,'FAILED',cookie,owned,send,write) is None and len(calls) == 1 and len(writes) == 1)
    check('WRONG_SUBJECT_NOT_CONSUMED', producer.observe('wrong','FAILED',cookie,owned,send,write) is None and len(calls) == 1)
    out, calls, *_=produce(send_error=True)
    check('OBSERVER_ERROR_CLOSED_NO_RETRY', out['captureStatus'] == 'UNAVAILABLE' and len(calls) == 1)
    out, calls, writes,*_=produce(write_error=True)
    check('OUTPUT_FAILURE_NO_RETRY_NO_THROW', writes == [] and len(calls) == 1)
    # The business assertion executes outside observer-owned catches, preserving its identity.
    business = AssertionError('SYNTHETIC_ORIGINAL_ASSERTION')
    seen = None
    try:
        produce(send_error=True)
        raise business
    except AssertionError as error:
        seen = error
    check('ORIGINAL_ASSERTION_NOT_REPLACED', seen is business)
    prov = {key: 'a'*64 for key in CONTRACT['PROVENANCE_FIELDS']}
    valid = json.dumps(CONTRACT['project']('FAILED', {'outcome':'FAILED','errorCode':'LOGIN_REQUIRED'})).encode()
    for name, raw_records, status in [('one',[valid],'CAPTURED'),('absent',[],'UNAVAILABLE'),('duplicate',[valid,valid],'AMBIGUOUS')]:
        collected = CONTRACT['collect_records'](raw_records,prov,dict(prov))
        check('COLLECT_' + name, collected['publicObservation']['captureStatus'] == status
              and collected['originalCause'] == 'UNKNOWN' and collected['runtimeStage'] == 'UNKNOWN' and collected['C8Credit'] is False)
    v=json.loads(valid)
    for name,bad in [('extra-field',{**v,'rawBody':'CANARY'}),('qualified-int',{**v,'codeQualified':1}),
                     ('wrong-class',{**v,'class':'CANARY'}),('failed-to-finalizing',{**v,'publicOutcomeOrState':'FINALIZING'}),
                     ('mismatch-code',{**v,'captureStatus':'MISMATCH','publicOutcomeOrState':'EXPIRED'}),
                     ('unknown-status',{**v,'captureStatus':'CANARY'}),('unknown-code',{**v,'errorCode':'CANARY'}),
                     ('unknown-poll',{**v,'pollState':'CANARY'}),('numeric-schema',{**v,'schemaVersion':True}),
                     ('unqualified-known',{**v,'codeQualified':False})]:
        result=CONTRACT['collect_records']([json.dumps(bad).encode()],prov,dict(prov))
        check('STRICT_COLLECT_' + name,result['publicObservation'] == CONTRACT['record'](status='INVALID'))
    for raw in (valid+valid,valid.replace(b'"schemaVersion": 1',b'"schemaVersion": 1, "schemaVersion": 1'),b'\xff'):
        result=CONTRACT['collect_records']([raw],prov,dict(prov))
        check('STRICT_RAW_' + str(len(raw)),result['publicObservation']['captureStatus'] == 'INVALID')
    denied('COLLECT_WRONG_RELEASE_PROVENANCE',lambda:CONTRACT['collect_records']([valid],prov,{**prov,'rootReleaseSha256':'b'*64}))
    denied('COLLECT_PROVENANCE_EXTRA',lambda:CONTRACT['collect_records']([valid],{**prov,'path':'CANARY'},prov))
    canaries=['PRIVATE_COOKIE_é😀','{"sessionId":"PRIVATE_ID"}','https://secret.example.invalid/private','RAW_MESSAGE_CANARY','STACK_CANARY']
    for index, canary in enumerate(canaries):
        out,*_=produce(raw=wire(errorCode=canary,detail=canary,message=canary,stack=canary,privateMetadata={'path':canary},input=canary))
        result=CONTRACT['collect_records']([json.dumps(out).encode()],prov,dict(prov))
        check('PRIVACY_CANARY_' + str(index), canary not in json.dumps(result,ensure_ascii=False)
              and set(out) == CONTRACT['FIELDS'] and out['errorCode'] == 'UNKNOWN')
    events,executed,runtime=loader_case()
    check('ACTUAL_LOADER_VERIFIED_BUFFER_FAKE_EXEC_ONLY',len(executed)==1
          and executed[0][0][0].startswith(b"raise RuntimeError")
          and runtime.argv==['/owned/new/unit/control.py','gate','a'*64,'1'])
    for name,change in [
        ('bad-hash',lambda o,s:s.argv.__setitem__(2,'f'*64)),
        ('traversal',lambda o,s:s.argv.__setitem__(1,'/owned/../control.py')),
        ('relative',lambda o,s:s.argv.__setitem__(1,'owned/control.py')),
        ('empty-component',lambda o,s:s.argv.__setitem__(1,'/owned//control.py')),
        ('wrong-mode',lambda o,s:setattr(o,'mode',stat.S_IFREG|0o644)),
        ('wrong-owner',lambda o,s:setattr(o,'owner',502)),
        ('nonregular',lambda o,s:setattr(o,'mode',stat.S_IFDIR|0o600)),
        ('changed-identity',lambda o,s:setattr(o,'change_inode',True)),
        ('short-read',lambda o,s:setattr(o,'size',999)),
        ('oversized',lambda o,s:setattr(o,'size',1048577)),
        ('no-follow-open-refused',lambda o,s:setattr(o,'fail_open','new')),
    ]:
        denied('LOADER_' + name,lambda change=change:loader_case(change))
    a=auth(); CONTROL['authority'](a); check('EXACT_AUTHORITY_ACCEPTED',True)
    for key in ('rootAuthorized','limitedSourceWindowQualified','literalScopeCertifiedNonIr','exactQaCodePrivacyReviewed',
                'gatewayProperlyClosed','ordinaryPrivateHooksUnchangedSealed','newImmutableWrapperAndGuardBound'):
        for bad in (False,None,1):
            denied('AUTH_' + key + repr(bad),lambda key=key,bad=bad:CONTROL['authority']({**a,key:bad}))
    for key,bad in [('selectedAttemptCap',True),('selectedAttemptCap',2),('restoreCompileCap',True),
                    ('selectedArgv',['./gradlew','check']),('compileArgv',['./gradlew','test']),
                    ('fixtureProfile','incremental2048'),('C8Credit',True),('IRCredit',True),
                    ('privateObserverReadOrCapture',True),('sourceWriters',[]),('postimageSha256','z'*64)]:
        denied('AUTH_EXACT_' + key + repr(bad),lambda key=key,bad=bad:CONTROL['authority']({**a,key:bad}))
    effects=Effects(a); controller=CONTROL['Controller'](a,effects)
    denied('GUARD_NEGATIVE_MISSING_READINESS',lambda:controller.gate(1))
    check('DENIAL_HAS_NO_EXIT_WRITE_SOURCE_NATIVE',effects.events == [] and effects.files == {})
    controller.stage(); selected=controller.selected()
    check('NATIVE_RED_PRESERVED',selected['nativeExit'] == 1 and selected['phaseExit'] == 1 and selected['C8Credit'] is False)
    denied('NO_SELECTED_RETRY',lambda:controller.selected())
    controller.restore(); compiled=controller.compile_restored()
    check('RESTORE_COMPILE_ONLY_ZERO',compiled['nativeExit'] == 0 and compiled['phaseExit'] == 0 and effects.source == 'RESTORED')
    denied('NO_COMPILE_RETRY',lambda:controller.compile_restored())
    runs=[event for event in effects.events if event[0] == 'run-owned']
    check('ONLY_EXACT_TWO_NATIVE_COMMANDS',[(e[1],e[2],e[3]) for e in runs] == [(CONTROL['SELECTED'],'backend','selected'),(CONTROL['COMPILE'],'backend','compile-restored')])
    proof=controller.final();check('FINAL_NOT_PERMIT',proof['expectedWrapperExit']==1 and 'guard-allow.json' not in effects.files)
    ready(effects);check('GATE_ZERO_SEPARATE_EXIT_PERMISSION',controller.gate(1)==0)
    postclose=controller.postclose(); check('POSTCLOSE_ZERO_NO_CREDIT',postclose['postcloseExit']==0 and postclose['C8Credit'] is False)
    # Fresh independent effects avoid duplicate immutable output from the successful gate.
    for name,change in [('stale-before',lambda e:setattr(e,'clock',1061)),
                        ('future-proof',lambda e:setattr(e,'clock',999)),
                        ('stale-after',lambda e:setattr(e,'clock_after',1061)),
                        ('bool-exit',lambda e:e.readiness['permit'].__setitem__('expectedWrapperExit',True)),
                        ('wrong-hash',lambda e:e.readiness['permit'].__setitem__('readinessSha256','f'*64)),
                        ('missing-actual-hash',lambda e:e.readiness.__setitem__('actualReadinessSha256',None)),
                        ('uninspected-root',lambda e:e.readiness['permit'].__setitem__('authorizedBy','unknown')),
                        ('wrong-inherited',lambda e:setattr(e,'current_change',{'inheritedSixExactUnchanged':False})),
                        ('empty-unanchored',lambda e:setattr(e,'current_change',{'completeAnchoredCensuses':False})),
                        ('pid-reuse-unqualified',lambda e:setattr(e,'current_change',{'priorClientsAbsentOrQualifiedReuse':False})),
                        ('live-owned',lambda e:setattr(e,'current_change',{'ownedLive':[7]})),
                        ('source-mode',lambda e:setattr(e,'current_change',{'replayMode':0o600}))]:
        e=Effects(a);ready(e);change(e);c=CONTROL['Controller'](a,e)
        denied('GUARD_' + name,lambda:c.gate(1));check('GUARD_NO_ALLOW_' + name,'guard-allow.json' not in e.files)
    for gap in CONTROL['GAPS']:
        e=Effects(a);ready(e);e.current_change={gap:True};c=CONTROL['Controller'](a,e)
        denied('STICKY_' + gap,lambda:c.gate(1))
    e=Effects(a);c=CONTROL['Controller'](a,e);r=c.selected()
    check('SETUP_FAILURE_CONSUMES_ATTEMPT',r['nativeExit'] is None and r['phaseExit']==1 and 'selected' in e.claims
          and ('finally-drain','selected') in e.events and not any(v[0]=='run-owned' for v in e.events))
    denied('SETUP_FAILURE_NO_RETRY',lambda:c.selected())
    e=Effects(a);c=CONTROL['Controller'](a,e);c.stage();e.fail_run=True;r=c.selected()
    check('BASEEXCEPTION_FINALLY_DRAIN_PERSIST',r['nativeExit'] is None and r['phaseExit']==1
          and ('finally-drain','selected') in e.events and 'selected-result.json' in e.files)
    for name,change in [('no-tests',{'junitInvocations':0}),('extra-case',{'junitInvocations':2}),
                        ('skip',{'skips':1}),('wrong-selector',{'exactMethod':'OTHER'}),
                        ('native-bool',{'nativeExit':True}),('aftereach-missing',{'afterEachComplete':False}),
                        ('collection-gap',{'collectionComplete':False}),('private-unsealed',{'normalFixturePrivateArtifactsSealed':False})]:
        e=Effects(a);c=CONTROL['Controller'](a,e);c.stage();e.native_exit=0;e.native_change=change;r=c.selected()
        check('SELECTED_FAILED_ACCOUNTING_' + name,r['phaseExit']!=0 and r['C8Credit'] is False
              and ('finally-drain','selected') in e.events and 'selected' in e.claims)
        denied('SELECTED_FAILED_ACCOUNTING_NO_RETRY_' + name,lambda:c.selected())
    e=Effects(a);c=CONTROL['Controller'](a,e)
    denied('NO_FINAL_WITHOUT_RESTORED_COMPILE',lambda:c.final())
    e=Effects(a);c=CONTROL['Controller'](a,e);e.source='CANDIDATE'
    denied('NO_GATE_CANDIDATE_SOURCE',lambda:(ready(e),c.gate(1)))
    # Exact byte-level forward/reverse and source-shape checks, no compiler/tool/main.
    pre,post=(FILES[k].decode() for k in ('Replay.preimage.java','Replay.postimage.java'))
    fragment=FILES['observer-fragment.java.txt'].decode()
    check('STRICT_FORWARD',strict_apply(pre,FILES['observer.patch'].decode())==post)
    check('STRICT_REVERSE',strict_apply(post,FILES['observer.reverse.patch'].decode())==pre)
    denied('FORWARD_REJECTS_CHANGED_HUNK',lambda:strict_apply(pre.replace('assertThat(state).as("second explicit learning; logs %s", TEMP).isEqualTo("FINALIZING");','assertThat(state).isEqualTo("CHANGED");'),FILES['observer.patch'].decode()))
    check('PREIMAGE_SHA',hashlib.sha256(FILES['Replay.preimage.java']).hexdigest()==SOURCE['preimageSha256'])
    check('POSTIMAGE_SHA',hashlib.sha256(FILES['Replay.postimage.java']).hexdigest()==SOURCE['postimageSha256'])
    original_assert='assertThat(state).as("second explicit learning; logs %s", TEMP).isEqualTo("FINALIZING");'
    check('ORIGINAL_ASSERTION_EXACT',pre.count(original_assert)==post.count(original_assert)==1)
    check('ORIGINAL_90S_50MS',pre.count('Duration.ofSeconds(90).toNanos()')==post.count('Duration.ofSeconds(90).toNanos()')
          and pre.count('Thread.sleep(50);')==post.count('Thread.sleep(50);'))
    check('TEST_ANNOTATIONS_UNCHANGED',pre.count('@Test\n')==post.count('@Test\n'))
    check('ORDER17_EXACT',post.count('@org.junit.jupiter.api.Order(17)\n  void actualPublishedWrongPasswordAnnotatesEarlierSecretFill()')==1)
    check('ONLY_ONE_OBSERVER_HTTP_SEND',fragment.count('.send(request,')==1 and '.timeout(Duration.ofSeconds(15))' in fragment)
    check('BYPASS_RAW_RESPONSE_SINK','p3Call(' not in fragment and 'capture.recordHttp(' not in fragment and 'System.out' not in fragment)
    check('NO_ERROR_OR_BODY_EXPORT','getMessage(' not in fragment and 'printStackTrace(' not in fragment and 'put("body"' not in fragment)
    check('NO_PRIVATE_STORE_OR_HOOK_CHANGE','jdbc.' not in fragment and 'sessions.' not in fragment and 'TEMP.' not in fragment)
    check('SINGLEFLIGHT_CAS','!consumed.compareAndSet(false, true)' in fragment)
    check('STRICT_WIRE_PARSE','STRICT_DUPLICATE_DETECTION' in fragment and 'FAIL_ON_TRAILING_TOKENS' in fragment and 'CodingErrorAction.REPORT' in fragment)
    check('EXCLUSIVE_NOFOLLOW_OUTPUT','StandardOpenOption.CREATE_NEW' in fragment and 'LinkOption.NOFOLLOW_LINKS' in fragment and 'rw-------' in fragment and 'SecureDirectoryStream' in fragment)
    guard=FILES['guard-public-observe.bash'].decode()
    check('GUARD_ONLY_BUILTIN_IN_SUCCESS_BRANCH',guard.count('builtin exit "$1"')==1 and 'if "$C8_PUBLIC_PYTHON" -B -c' in guard and 'readonly -f exit' in guard)
    check('GUARD_NO_EOF_EXEC_SIGNAL_OR_CLEANUP','kill ' not in guard and 'rm ' not in guard and 'exec ' not in guard and 'return 1' in guard)
    check('GUARD_VERIFIED_SAME_CODE_BUFFER','hashlib.sha256(raw).hexdigest() == expected' in guard and 'exec(compile(raw, path, "exec")' in guard)
    check('POLICY_NO_REAL_ADAPTER_MAIN',"HOLD: NO REVIEWED ROOT-BOUND EFFECTS ADAPTER" in FILES['unit_policy.py'].decode())


with ExitStack() as stack:
    for obj,names in (
        (builtins,('open',)), (io,('open',)),
        (Path,('open','read_text','read_bytes','write_text','write_bytes','stat','lstat','resolve','mkdir','iterdir','glob','rglob','exists','is_file','is_dir','unlink','rename','replace','chmod','touch')),
        (os,('open','read','write','close','fstat','stat','lstat','listdir','scandir','mkdir','makedirs','unlink','remove','rename','replace','chmod','kill','fork','execv','execve','system','popen','pipe','waitpid')),
        (subprocess,('Popen','run','call','check_call','check_output')),
        (fcntl,('flock','fcntl','ioctl')), (socket,('socket','create_connection')),
        (time,('sleep',)),
    ):
        for name in names:
            if hasattr(obj,name):
                stack.enter_context(patch.object(obj,name,blocked))
    tests()
    check('ZERO_REAL_BOUNDARY_CALLS',BLOCKED_CALLS == [])
result={'kind':'GUARDED_SYNTHETIC_SOURCE_AND_POLICY_CHECKS_ONLY','passed':len(RESULTS),'failed':0,
        'checks':RESULTS,'blockedRealBoundaryCalls':BLOCKED_CALLS,'JavaOrBashExecuted':False,
        'runtimeMainOrAdaptersExecuted':False,'nativePublicPrivateSharedSourceActions':0,
        'actualCurrentSourceOrKernelObservation':False,'IRClockStarted':False,'C8Credit':False}
(HERE/'pure-check-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
