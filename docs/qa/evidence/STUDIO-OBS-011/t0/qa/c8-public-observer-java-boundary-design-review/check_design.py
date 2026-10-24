"""Source/design-data checks only. No imported candidate, runtime or platform API."""
import hashlib
import json
import stat
from pathlib import Path

OUT = Path(__file__).parent
BASE = Path('docs/qa/evidence/STUDIO-OBS-011/t0')
DESIGN = BASE / 'resume-architecture/resume2/c8-public-observer-java-boundary-design'
cache = {}
pins = {}
checks = []

def read(path, expected=None, size=None, mode=None):
    path = Path(path)
    key = str(path)
    assert '/runtime/' not in key and 'baseline' not in path.name and not key.endswith('.log')
    if key not in cache:
        raw = path.read_bytes()
        info = path.stat()
        assert stat.S_ISREG(info.st_mode)
        cache[key] = raw
        pins[key] = {'path': key, 'sha256': hashlib.sha256(raw).hexdigest(),
                     'bytes': len(raw), 'mode': stat.S_IMODE(info.st_mode)}
    pin = pins[key]
    if expected is not None:
        assert pin['sha256'] == expected, key
    if size is not None:
        assert pin['bytes'] == size, key
    if mode is not None:
        assert pin['mode'] == mode, key
    return cache[key]

def packet(path, expected):
    manifest = json.loads(read(path / 'manifest.json', expected))
    members = manifest.get('files', manifest.get('members'))
    assert members
    for member in members:
        assert Path(member['path']).name == member['path']
        read(path / member['path'], member['sha256'], member['bytes'], member.get('mode'))
    return manifest

def check(name, condition):
    checks.append({'id': name, 'passed': bool(condition), 'kind': 'SOURCE_DESIGN_DATA_ONLY'})
    assert condition, name

packet(DESIGN, 'd9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e')
declared = json.loads(read(DESIGN / 'input-pins.json'))['inputs']
for pin in declared:
    read(pin['path'], pin['sha256'], pin['bytes'], pin['mode'])
old = packet(BASE / 'qa/c8-public-observer-source-review',
             '7742b09706f9f48204f19e75a0e209d5be3556349c7b3b66eb85fb71ce509970')
packet(BASE / 'early/c8-check01-public-evidence-prep/resume1',
       '8949bd8b929db701e4da798db04ddc1d025c8cb7d3e831eb155a307d10ddebe7')
plan = packet(BASE / 'resume-architecture/resume2/c8-check01-next-public-evidence-plan',
              '190235dc5dec26fb3603deed1f9147b25778a6668dd9fb1828a067965f0ed30a')
packet(BASE / 'qa/c8-check01-next-public-evidence-plan-review',
       '3f4037f5c1d5f7389092db45d302812d6efabd0d20d0b42c35c3c2b952ea4e94')
adapter = packet(BASE / 'early/c8-check01-public-evidence-prep/resume2',
                 '0e28194a11c236fac2708c489e486ec04f6577f4538194c93f2c6c873face15e')
d = json.loads(read(DESIGN / 'design.json'))
prose = read(DESIGN / 'review.md').decode()
b, t, h, r, o = (d[k] for k in ('businessBoundary', 'deadline', 'https', 'relay', 'output'))
old_findings = json.loads(read(BASE / 'qa/c8-public-observer-source-review/findings.json'))
check('all57_named_input_pins', len(declared) == 57)
check('all4_original_findings_preserved', len(old_findings['mandatoryFindings']) == 4)
check('all4_design_dispositions', {x['id'] for x in d['mandatoryFindingDisposition']} ==
      {x['id'] for x in old_findings['mandatoryFindings']})
check('design_only', d['verdict'] == 'DESIGN_ONLY_CONDITIONAL')
check('one_chosen_route', not d['dynamicFallback'] and not d['directServiceOrPrivateStoreRead'])
check('no_product_endpoint', not d['newProductionEndpoint'])
check('exact_case_order_profile', b['order'] == 17 and b['profile'] == 'original4000' and
      b['method'] == 'actualPublishedWrongPasswordAnnotatesEarlierSecretFill')
check('selected_case_cap1', b['selectedNativeAttemptCap'] == b['publicRequestCap'] == 1)
check('literal90s50ms', b['pollDeadlineSeconds'] == 90 and b['pollSleepMillis'] == 50)
check('literal_assertion', 'unchanged' in b['oracle'])
check('ordinary_hooks_sealed', 'unchanged' in b['normalFixtureAndPrivateHooks'] and 'sealed' in b['normalFixtureAndPrivateHooks'])
check('finalizing_zero_request', 'zero business request' in b['finalizing'])
check('nonterminal_zero_request', 'zero business request' in b['unknownNonterminal'])
check('closed_terminal_read_set', set(b['permittedReadPollStates']) == {'FAILED', 'EXPIRED', 'UNKNOWN_OUTCOME', 'CANCELLED'})
check('not_first_latest', b['noFirstLastNewestSelection'])
check('one15s_clock_partition', (t['workCutoffNs'], t['networkTerminationCutoffNs'], t['totalNs']) ==
      (12000000000, 14000000000, 15000000000))
check('one_registered_worker', t['ownedNetworkWorkerCountMax'] == 1 and 'Thread.ofVirtual' in t['workerType'])
check('real_termination_distinct', 'isAlive' in t['terminationProof'] and 'not cancellation' in t['terminationProof'])
check('late_worker_cannot_publish', 'cannot publish' in t['lateWorker'])
check('no_hard_realtime_claim', t['hardRealtimeGuaranteed'] is False and 'disqualifies' in t['actualOverrun'])
check('caller_no_network_close', 'socket.close' in t['callerForbidden'] and 'filesystem write' in t['callerForbidden'])
check('own_worker_interrupt_only', 'own Java thread' in t['interrupt'])
check('unresolved_hold_oracle', 'HOLD' in t['unresolved'] and 'assertion' in t['unresolved'])
check('one_connect_request_handshake', all(h[k] == 1 for k in ('connectCallsMax', 'requestStartsMax', 'handshakeMax', 'httpRequestsMax')))
check('raw_socket_no_proxy', 'new Socket(Proxy.NO_PROXY)' in h['apis'])
check('numeric_no_fallback', 'no DNS/address fallback' in h['numericLoopback'])
check('same_tls_context', 'unchanged' in h['tls'])
check('no_hidden_retry', all(x in h['no'] for x in ('HttpClient', 'redirect', 'auth retry', 'reconnect', 'second request', 'decompression')))
check('no_p3_sink', 'p3Call/C5 sink' in h['no'])
check('finite_copy_caps', tuple(h[k] for k in ('bodyCapBytes', 'fixedTransferBytes', 'headerCapBytes', 'chunkLineCapBytes', 'trailerCapBytes')) ==
      (262144, 8192, 16384, 128, 8192))
check('before_copy_bound', 'before append/copy/grow' in h['allocation'])
check('three_bounded_framings', len(h['framing']) == 3)
check('ambiguous_framing_rejected', 'length plus transfer encoding' in h['framingReject'])
check('strict_utf8_json', 'strict UTF8/duplicate-key/trailing-token' in h['parsing'])
check('shared_work_deadline', 'remaining-work' in h['deadline'] and 'whole-work' in h['deadline'])
check('root_only_writer', not r['javaFilesystemWriter'] and r['extraProcesses'] == 0 and r['rootServerThreadsMax'] == 1)
check('fixed_short_endpoint', r['fixedSocket'] == '/private/tmp/obs011-pub-observe01/r.sock')
check('fixed_namespace', r['fixedNamespace'] == '/private/tmp/obs011-pub-observe01' and r['namespaceMode'] == 0o700 and r['fileMode'] == 0o600)
check('path_byte_math_only', len(r['fixedSocket'].encode('ascii')) == r['socketPathAsciiBytes'] == 40 and
      r['pathLimit']['upstreamAppleSunPathBytes'] - 2 == r['pathLimit']['derivedMacAbiCeiling'] == 102)
check('platform_not_verified', r['pathLimit']['installedHostVerified'] is False)
check('single_enrollment_and_data', r['businessPayloadCount'] == r['enrollmentConnectionCap'] == 1)
check('data_fixed_closed_fields', set(r['data']['exactFields']) == {'protocolVersion', 'controlSha256', 'enrollmentNonce', 'observation', 'networkAccounting'})
check('finite_frame_caps', (r['data']['capBytes'], r['ack']['capBytes'], r['commit']['capBytes']) == (16384, 256, 512))
check('ack_after_custodied_write', 'fsync/close' in r['ack']['onlyAfter'] and 'postwrite identity' in r['ack']['onlyAfter'])
check('commit_requires_deadline_and_termination', 'terminated/closed worker' in r['commit']['onlyAfter'] and 'same15s' in r['commit']['onlyAfter'])
check('late_provisional_not_qualified', 'provisional' in r['lateBytes'] and 'COMMIT' in r['lateBytes'] and 'HOLD' in r['lateBytes'])
check('peer_exact_actual_jvm', 'selected JVM PID/start/argv/executable' in r['peerBinding']['require'])
check('darwin_abi_qualify', (r['peerBinding']['SOL_LOCAL'], r['peerBinding']['LOCAL_PEERCRED'], r['peerBinding']['xucredBytes'], r['peerBinding']['LOCAL_PEERPID'], r['peerBinding']['pidBytes']) == (0, 1, 76, 2, 4))
check('unsupported_peer_hold_no_reaccept', 'HOLD' in r['peerBinding']['unsupportedOrReusedOrWrong'])
check('ready_finite', 'maximum5s' in r['start'])
check('relay_finite_stop', 'at most5s' in r['stop'] and 'BaseException' in r['stop'])
check('relay_no_signal_unlink_retry', all(x in r['unresolvedStop'] for x in ('HOLD', 'no signal', 'unlink', 'retry')))
check('bind_not_bindat', 'not invented bindat' in r['custody'])
check('distinct_socket_inodes', 'never assume their inode equality' in r['socketIdentity'])
check('typed_socket_archive', 'typed metadata' in r['archive'] and 'never regular-body read/hash' in r['archive'])
check('dead_node_retained', 'retained until separately authorized cleanup' in r['postclose'])
check('output_exclusive_fd_only', 'O_CREAT|O_EXCL|O_NOFOLLOW0600' in d['rootOutputCustody']['file'])
check('output_rechecks_open_handle_name', 'fstat' in d['rootOutputCustody']['checks'] and 'nofollow' in d['rootOutputCustody']['checks'])
check('no_generic_sameuid_claim', 'no universal protection' in d['rootOutputCustody']['sameUidClaim'])
check('immutable_control_no_cycle', 'does not bind enclosing release hash' in d['control']['hashCycles'])
check('v2_closed_enums_preserved', o['schemaVersion'] == 2 and (len(o['states']), len(o['codes']), len(o['captureStatuses'])) == (6, 35, 7))
check('network_accounting_closed10', len(o['newClosedNetworkAccounting']) == 10)
check('qualified_requires_commit_drain', all(x in o['codeQualification'] for x in ('terminated joined worker', 'ACK/COMMIT', 'terminal proof')))
check('unknown_hold_when_late', 'UNKNOWN/unqualified/HOLD' in o['missingOrInvalidOrLate'])
check('native_failure_preserved', 'native1/wrapper1' in o['nativeFailure'])
check('no_business_or_private_export', all(x in o['forbidden'] for x in ('cookie', 'URL', 'raw body', 'raw exception/message/stack', 'original cause inference', 'runtime-stage inference')))
check('old_adapter_execution_not_ready', adapter['executionReady'] is False and adapter['sourcePostimageSha256'] ==
      '60c971936b17a008b20d37637db1c5cf242697386adfcd4df6671d0a57f2f560')
check('all7_amendments_owed', len(d['requiredAmendments']) == 7)
check('actual_platform_validation_owed', 'separate actual Java21' in d['requiredAmendments'][4])
check('no_actual_authority', not any(d['authority'].values()))
check('no_design_runtime_or_implementation', not d['verificationNow']['implementationWritten'] and
      not d['verificationNow']['runtimeOrPrivateOrOsOrKernelProbe'])
check('complete_composition_review_owed', 'complete resulting source+adapter composition' in prose)
check('gateway_and_source_gates_preserved', 'Gateway proper closure/postclose' in prose and 'source-gate exception' in prose)
check('restore_compile_owed', 'restored standalone compile0' in prose)
check('original_case_setup_consumes', 'consume the selected-attempt setup allowance' in prose)

(OUT / 'pins.json').write_text(json.dumps({'kind': 'EXPLICIT_NAMED_SOURCE_AND_SEALED_PREPARATION_INPUTS_ONLY',
    'declaredDesignInputs': len(declared), 'uniqueInputs': len(pins),
    'inputs': list(pins.values()), 'actualRuntimePrivateBaselineOrLogReads': False}, indent=2) + '\n')
(OUT / 'checks.json').write_text(json.dumps({'kind': 'SOURCE_DESIGN_CONSISTENCY_NOT_JAVA_RUNTIME_PROOF',
    'checksPassed': len(checks), 'checks': checks, 'candidateCodeExecuted': False,
    'javaOrNativeOrIpcOrPlatformValidation': False}, indent=2) + '\n')
print(json.dumps({'passed': len(checks), 'namedInputs': len(pins), 'designDeclaredInputs': len(declared),
                  'actualRuntimeNativeIpcPrivateActions': 0}))
