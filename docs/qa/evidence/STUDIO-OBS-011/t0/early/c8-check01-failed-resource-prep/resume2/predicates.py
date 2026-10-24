"""Pure ONE-unit failed-resource policy; no observation or file access."""
import hashlib
import json
import math
from pathlib import PurePosixPath

PROTOCOL = 'C8_CHECK01_FAILED_RESOURCE_V1'
SOURCE = 'f9cbe66dd1aa700ebbb578203e84f6b24ec329b092e7f78c7ee9e12ab8dc9277'
GAPS = ['FULLCHECK03_OWNED_IDENTITY_OBSERVATION_GAP', 'GST03_FORMAT_IDENTITY_GAP',
        'GST03_PREMATURE_UNLOCK_INTERVAL', 'CHECK01_145_HISTORICAL_UNKNOWN_IDENTITIES',
        'CHECK01_OPERATIONAL_FINGERPRINT_UNPROVEN', 'CHECK01_UNRECORDED_FORK_ABSENCE_UNPROVEN']
class Hold(Exception):
    pass

def need(value, reason):
    if not value:
        raise Hold(reason)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def compact(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()

def canonical(path):
    return isinstance(path, str) and bool(path) and not path.startswith('/') and str(PurePosixPath(path)) == path and '..' not in PurePosixPath(path).parts

def age(stamp, now):
    need(type(stamp) in (int, float) and type(now) in (int, float) and math.isfinite(stamp) and math.isfinite(now) and 0 <= now - stamp <= 60, 'STALE_OR_FUTURE')

def authority(a):
    need(a['protocol'] == PROTOCOL and a['authorized'] is True and a['authorizedBy'] == 'root', 'ROOT_AUTHORITY')
    need(a['unit'] == 'obs011-t0-c8-check01' and a['expectedWrapperExit'] == 1 and type(a['expectedWrapperExit']) is int, 'UNIT_EXIT')
    need(all(type(v) is bool for v in a['dualException'].values()) and a['dualException'] == {'newClosingEntrypoint': True, 'noStandaloneCompileZeroRequired': True}, 'DUAL_EXCEPTION')
    need(a['ordinaryRoute'] == 'HARD_HOLD' and a['compileState'] == 'NOT_STARTED' and type(a['newNativeInvocations']) is int and a['newNativeInvocations'] == 0 and a['writers'] == [], 'OLD_ROUTE_OR_NATIVE')
    need(all(type(v) is bool for v in a['credit'].values()) and a['credit'] == {'C8': False, 'main': False, 'lane': False, 'IR': False, 'lifecycle': False}, 'NO_CREDIT')
    need(a['sourceDigest'] == SOURCE and a['historicalGapCodes'] == GAPS, 'SOURCE_OR_GAPS')
    need(a['retainedContractSha256'] == a['pins']['retained-contract.json'], 'RETAINED_BINDING')
    need(all(canonical(x) for x in a['codePins']) and bool(a['codePins']), 'CODE_PATH')
    need(set(a['reviewPins']) == {'actualQa', 'architectureCode', 'qaCode', 'rootAdoption', 'terminalDesign', 'terminalDesignQa'}, 'REVIEW_SET')
    need(all(isinstance(x, str) and len(x) == 64 and set(x) <= set('0123456789abcdef') for x in a['reviewPins'].values()), 'REVIEW_HASH')

def preserved(a, retained, expected):
    need(retained == expected and digest(compact(retained)) == a['retainedContractCanonicalSha256'], 'FAILED_EVIDENCE_CHANGED')
    need(retained['summary']['statusCounts'] == {'PASS': 2762, 'SKIP': 11, 'FAIL': 1}, 'NO_NATIVE_PASS_FABRICATION')
    need(retained['summary']['allStickyFlags']['ownedIdentityObservationGap'] is True, 'GAP_ERASED')
    need(retained['build'] == {'overall': 'FAILED', 'nativeExit': 1, 'compileTaskEvent': 'HEADER_ONLY', 'standaloneCompileZero': False, 'bytecodeGuarantee': False}, 'FAILED_BUILD_RETAINED')
    need(retained['limits'] == {'historicalUnknown': 145, 'operationalFullFingerprint': False, 'unrecordedForkAbsence': False, 'globalQuiet': False}, 'FINITE_LIMITS')

def current(live, postclose=False):
    need(live['observationOk'] is True and live['metadataUnchanged'] is True and live['codeUnchanged'] is True, 'OBSERVATION_OR_PIN')
    need(live['sourceDigest'] == SOURCE and live['sourceExact'] is True, 'SOURCE_DRIFT')
    need(type(live['recordedCount']) is int and live['recordedCount'] == 2439 and not live['liveOwned'] and not live['currentUnknown'] and not live['unexpectedDescendants'] and not live['ownedListeners'], 'CURRENT_RESOURCE')
    need(type(live['inheritedMatched']) is int and live['inheritedMatched'] == 6 and not live['boundaryDefects'], 'INHERITED_BOUNDARY')
    need(live['clientsComplete'] is True and not live['priorClientsLive'], 'CLIENT_ACCOUNTING')
    if postclose:
        need(live['controllersAbsentOrReused'] is True and live['kernelFree'] is True, 'POSTCLOSE_HOLDER')
    else:
        need(live['sameHolder'] is True and live['kernelHeld'] is True, 'HOLDER_KERNEL')

def admission(ad, release_sha, pin_sha):
    need(ad is not None and ad['kind'] == 'ROOT_NEW_GUARD_ADMISSION' and ad['authorizedBy'] == 'root', 'MISSING_ADMISSION')
    need(ad['releaseSha256'] == release_sha and ad['activeLockSha256'] == pin_sha and type(ad['negativeActualStatus']) is int and ad['negativeActualStatus'] == 1 and ad['separateStatusCaptured'] is True and ad['sameOriginalHolderAfterDenial'] is True and ad['readinessAbsentAtDenial'] is True and ad['permitAbsentAtDenial'] is True and ad['originalExitAndBindingsUnchanged'] is True and ad['newReadonlyFunctionInspected'] is True, 'ADMISSION_BINDING')

def readiness(r, release_sha, retained_sha, now):
    need(r is not None and r['protocol'] == PROTOCOL and r['kind'] == 'QUALIFIED_FAILED_RESOURCE_READINESS' and type(r['verificationExit']) is int and r['verificationExit'] == 0, 'MISSING_READINESS')
    need(r['releaseSha256'] == release_sha and r['retainedContractSha256'] == retained_sha and type(r['expectedWrapperExit']) is int and r['expectedWrapperExit'] == 1 and r['historicalGapCodes'] == GAPS and r['C8Credit'] is False, 'READINESS_BINDING')
    age(r['verifiedAtEpoch'], now)

def permit(p, r, ready_sha, release_sha, now, requested):
    need(type(requested) is int and requested == 1, 'EXPLICIT_EXIT_ONE')
    need(p is not None and p['decision'] == 'AUTHORIZE_ONE_FAILED_RESOURCE_EXIT' and p['authorizedBy'] == 'root', 'MISSING_PERMIT')
    need(p['releaseSha256'] == release_sha and p['readinessSha256'] == ready_sha and type(p['expectedWrapperExit']) is int and p['expectedWrapperExit'] == 1 and p['retainedContractSha256'] == r['retainedContractSha256'] and p['C8Credit'] is False, 'PERMIT_BINDING')
    age(p['issuedAtEpoch'], now)
    need(p['issuedAtEpoch'] >= r['verifiedAtEpoch'], 'PERMIT_BEFORE_FINAL')

def gate(a, retained, expected, ad, r, p, release_sha, ready_sha, live_before, live_after, before, after, requested):
    authority(a); preserved(a, retained, expected); admission(ad, release_sha, a['activeLockSha256'])
    readiness(r, release_sha, a['retainedContractSha256'], before); permit(p, r, ready_sha, release_sha, before, requested)
    current(live_before); current(live_after)
    need(after >= before, 'CLOCK_REVERSED'); readiness(r, release_sha, a['retainedContractSha256'], after); permit(p, r, ready_sha, release_sha, after, requested)
    return 'ALLOW_QUALIFIED_FAILED_RESOURCE_EXIT_ONE'


def typed_identity(who):
    need(isinstance(who,dict) and type(who.get('pid')) is int and who['pid'] > 0 and type(who.get('ppid')) is int and who['ppid'] > 0, 'CLIENT_PID_TYPE')
    need(isinstance(who.get('start'),str) and bool(who['start'].strip()) and who.get('identityComplete') is True, 'CLIENT_IDENTITY_TYPE')
    for key in ('argvHash','commHash','executableHash','executableFileHash'):
        need(isinstance(who.get(key),str) and len(who[key]) == 64 and set(who[key]) <= set('0123456789abcdef'), 'CLIENT_HASH_TYPE')


def negative_record(denial,journal,release_sha,pin_sha,shell_pid):
    need(isinstance(denial,dict) and set(denial) == {'kind','unit','releaseSha256','activeLockSha256','status','shellPid','readinessAbsent','permitAbsent','client','clientJournal','clientJournalSha256'}, 'NEGATIVE_SCHEMA')
    need(denial['kind'] == 'NEW_READINESS_MISSING_DENIAL' and denial['unit'] == 'obs011-t0-c8-check01' and denial['releaseSha256'] == release_sha and denial['activeLockSha256'] == pin_sha, 'NEGATIVE_SUBJECT')
    need(type(denial['status']) is int and denial['status'] == 1 and type(denial['shellPid']) is int and denial['shellPid'] == shell_pid and denial['readinessAbsent'] is True and denial['permitAbsent'] is True, 'NEGATIVE_STATUS')
    typed_identity(denial['client'])
    need(journal == {'kind':'NEW_VERIFICATION_CLIENT','mode':'gate','releaseSha256':release_sha,'identity':denial['client']} and denial['client']['ppid'] == shell_pid, 'NEGATIVE_JOURNAL_RELATION')
    need(denial['clientJournal'] == 'client-'+str(denial['client']['pid'])+'-'+digest(denial['client']['start'].encode())[:16]+'.json' and denial['clientJournalSha256'] == digest(compact(journal)), 'NEGATIVE_JOURNAL_HASH')


def held_record(proof,release_sha,denial_sha):
    need(isinstance(proof,dict) and proof.get('kind') == 'SAME_HOLDER_AFTER_NEGATIVE_PROOF' and proof.get('unit') == 'obs011-t0-c8-check01' and proof.get('releaseSha256') == release_sha and proof.get('negativeDenialSha256') == denial_sha, 'HELD_PROOF_SUBJECT')
    need(type(proof.get('verificationExit')) is int and proof['verificationExit'] == 0 and proof.get('separateNegativeStatus') == 1 and type(proof.get('separateNegativeStatus')) is int, 'HELD_PROOF_STATUS')
    typed_identity(proof['client']); current(proof['before']); current(proof['after'])
