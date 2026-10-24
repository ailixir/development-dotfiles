"""Pure future control construction. Never reads, writes, probes or issues grants.

All actual pins/identities and separate decisions must be supplied by the authorized
root after own code and technical/security owner rulings. This is not such a ruling.
"""
import json,hashlib
PROTOCOL='C8_JAVA_SYNTHETIC_LOCAL_REPORT_V1'
REVIEW_PATHS=dict(Aria='resume-architecture/resume2/c8-synthetic-local-report-source01-exact-review/review-record.json',
 Quinn='qa/c8-synthetic-local-report-source01-exact-review/review-record.json')
OWNER_PATHS=dict(Aria='resume-architecture/resume2/c8-synthetic-local-report-source01-owner-ruling/owner-ruling-Aria.json',
 Quinn='qa/c8-synthetic-local-report-source01-owner-ruling/owner-ruling-Quinn.json',root='resume2-c8-synthetic-local-report-source01-owner-ruling-root.json')
DAG=('capture','capture-outer-status','negative','negative-outer-status','held','held-outer-status','archive','archiveQA-root','final',
 'final-outer-status','distinct-60s-permit','gate-PRE-afterallow-POST','expected-wrapper-outer','postclose','actual-postclose-QA-root')
INPUTS=dict(capture=(),negative=('capture','captureOuter'),held=('capture','captureOuter','negative','negativeStatus'),
 archive=('held','heldOuter'),final=('archive','archiveQaRoot'),gate=('readiness','readinessStatus','permit'),postclose=('guard','wrapperOuter'))

def need(ok,code):
    if ok is not True:raise ValueError(code)
def pin(value):
    need(type(value) is dict and set(value)=={'path','sha256','bytes','mode','uid'},'EXACT_ACTUAL_PIN_REQUIRED')
    need(type(value['path']) is str and value['path'].startswith('/') and type(value['sha256']) is str and len(value['sha256'])==64
        and all(c in '0123456789abcdef' for c in value['sha256']) and type(value['bytes']) is int and 0<=value['bytes']<=16777216
        and type(value['mode']) is int and value['mode'] in (0o600,0o644) and type(value['uid']) is int and value['uid']>=0,'ACTUAL_PIN_TYPES')
    return value

def owner_paths(t0,code_reviews,owner_rulings):
    need(set(code_reviews)==set(REVIEW_PATHS) and set(owner_rulings)==set(OWNER_PATHS),'OWN_RULINGS_REQUIRED')
    for group,paths in ((code_reviews,REVIEW_PATHS),(owner_rulings,OWNER_PATHS)):
        for name,spec in group.items():pin(spec);need(spec['path']==t0+'/'+paths[name],'EXACT_OWNER_PATH')
    return dict(codeReviews=code_reviews,ownerRulings=owner_rulings)

def decision(release_pin,unit,operation,previous,inputs):
    pin(release_pin);need(operation in INPUTS and type(inputs) is dict and set(inputs)==set(INPUTS[operation]),'EXACT_OPERATION_INPUTS')
    for spec in inputs.values():pin(spec)
    return dict(schemaVersion=1,protocol=PROTOCOL,purpose='ONE_ROOT_OPERATION',authorizedBy='root',releaseSha256=release_pin['sha256'],
        unit=unit,operation=operation,previous=previous,attemptCap=1,inputs=inputs)

def descriptor(manifest,package,release,decision_pin,operation,previous,shell_pid,wrapper_pid,stdout_sink):
    for spec in (manifest,release,decision_pin,stdout_sink):pin(spec)
    need(operation in INPUTS and type(package) is str and package.startswith('/') and type(shell_pid) is int and shell_pid>0
        and type(wrapper_pid) is int and wrapper_pid>0,'ROOT_DESCRIPTOR_REQUIRED')
    return dict(purpose='EXACT_SYNTHETIC_ROOT_ENTRY',manifest=manifest,package=package,release=release,decision=decision_pin,
        operation=operation,previous=previous,expectedShellPid=shell_pid,expectedWrapperPid=wrapper_pid,stdoutSink=stdout_sink)

def release(value,profile,manifest_sha,t0):
    # Exact actual value is validated; no synthesized path/tool/pin/owner default exists.
    owner_paths(t0,value['codeReviews'],value['ownerRulings'])
    return profile.release(value,manifest_sha)

def permit(unit,release_pin,readiness_pin,created,expires,expected_exit):
    pin(release_pin);pin(readiness_pin)
    need(type(created) is int and type(expires) is int and 0<expires-created<=60000000000
        and type(expected_exit) is int and expected_exit in (0,1),'ACTUAL_FRESH_PERMIT_REQUIRED')
    return dict(protocol=PROTOCOL,purpose='ONE_AFTERALLOW_FINAL_GUARD',authorizedBy='root',unit=unit,releaseSha256=release_pin['sha256'],
        readinessPin=readiness_pin,createdAtNs=created,expiresAtNs=expires,attemptCap=1,expectedWrapperExit=expected_exit)
