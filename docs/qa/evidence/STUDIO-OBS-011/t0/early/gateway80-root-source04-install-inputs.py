"""Root control author only; no runtime factory, binary maps or process probe."""
import hashlib
import json
import os
import stat
import sys
from pathlib import Path

R = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
T = R / 'docs/qa/evidence/STUDIO-OBS-011/t0'
S = T / 'early/gateway80-failed-red-resource-prep/resume4'
E = T / 'runtime/obs009-gateway80-offtree03-20261019'
PARENT = R / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'
OUTSIDE = PARENT / 'gateway80-fr03-root-install01'
SOURCE_SHA = 'cac4f5a1d4e770ae9d2ee65354b9ce7d93c48a41d49ccbb7c39ebbaa95d47b2e'
TEMPLATE_SHA = '63abaaf953c13a5c8407686019be4dce11d598caed18f35d329e2ae68108c138'
APPLICABILITY_SHA = '4aab855967f6639ef76eafc118bd3a816c89fabf31eea1c7ea73faae379c3591'
owners = []
chains = []
created = False
result = None
failure = None
failure_reason = None
cleanup = []

class RootInputHold(ValueError):
    def __init__(self, reason):
        super().__init__()
        self.reason = reason

def need(ok, reason):
    if ok is not True:
        raise RootInputHold(reason)

def own(fd):
    row = {'fd': fd, 'state': 'OPEN'}
    owners.append(row)
    return fd

def identity(s):
    return (s.st_dev, s.st_ino, s.st_uid, s.st_mode)

def directory(path):
    need(path.is_absolute() and len(path.parts) <= 40, 'DIRECTORY_PATH')
    fd = own(os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW))
    chains.append((None, '/', fd, identity(os.fstat(fd))))
    for name in path.parts[1:]:
        need(name not in ('', '.', '..'), 'DIRECTORY_COMPONENT')
        parent = fd
        fd = own(os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent))
        chains.append((parent, name, fd, identity(os.fstat(fd))))
    return fd

def check_chains():
    for parent, name, fd, expected in chains:
        named = os.stat(name, follow_symlinks=False) if parent is None else os.stat(name, dir_fd=parent, follow_symlinks=False)
        need(identity(os.fstat(fd)) == expected == identity(named), 'DIRECTORY_CHANGED')

def fact(fd, path):
    s = os.fstat(fd)
    need(stat.S_ISDIR(s.st_mode), 'DIRECTORY_TYPE')
    return dict(path=str(path), uid=s.st_uid, dev=s.st_dev, ino=s.st_ino, mode=stat.S_IMODE(s.st_mode))

def read_public(parent, name, expected, maximum):
    fd = own(os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent))
    before = os.fstat(fd)
    need(stat.S_ISREG(before.st_mode) and before.st_uid == 501 and stat.S_IMODE(before.st_mode) == 0o644 and before.st_nlink == 1 and 0 <= before.st_size <= maximum, 'PUBLIC_INPUT_METADATA')
    raw = bytearray()
    while len(raw) < before.st_size:
        piece = os.read(fd, min(65536, before.st_size - len(raw)))
        need(type(piece) is bytes and len(piece) > 0, 'PUBLIC_INPUT_SHORT')
        raw.extend(piece)
    after = os.fstat(fd)
    named = os.stat(name, dir_fd=parent, follow_symlinks=False)
    key = lambda s: identity(s) + (s.st_size, s.st_mtime_ns, s.st_ctime_ns, s.st_nlink)
    need(key(before) == key(after) == key(named), 'PUBLIC_INPUT_CHANGED')
    need(hashlib.sha256(raw).hexdigest() == expected, 'PUBLIC_INPUT_SHA')
    return bytes(raw)

def write_private(parent, name, raw):
    need(type(raw) is bytes and len(raw) <= 1048576, 'CONTROL_BYTES')
    fd = own(os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent))
    os.fchmod(fd, 0o600)
    offset = 0
    while offset < len(raw):
        count = os.write(fd, raw[offset:offset + 65536])
        need(type(count) is int and 0 < count <= min(65536, len(raw) - offset), 'CONTROL_WRITE')
        offset += count
    os.fsync(fd)
    s = os.fstat(fd)
    named = os.stat(name, dir_fd=parent, follow_symlinks=False)
    need(identity(s) == identity(named) and stat.S_ISREG(s.st_mode) and s.st_uid == 501 and stat.S_IMODE(s.st_mode) == 0o600 and s.st_nlink == 1 and s.st_size == len(raw), 'CONTROL_OUTPUT_METADATA')

def packed(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode() + b'\n'

try:
    need(os.getuid() == 501, 'ROOT_ACTOR_UID')
    source_fd = directory(S)
    t_fd = directory(T)
    policy = read_public(t_fd, 'resume2-gateway80-failed-resource-source04-one-unit-root-applicability.json', APPLICABILITY_SHA, 1048576)
    decision = json.loads(policy)
    need(decision['authorizedBy'] == 'root' and decision['subjectSource04ManifestSha256'] == SOURCE_SHA, 'APPLICABILITY_BINDING')
    raw_manifest = read_public(source_fd, 'manifest.json', SOURCE_SHA, 1048576)
    manifest = json.loads(raw_manifest)
    matches = [r for r in manifest['files'] if r['path'] == 'install-scope.template.json']
    need(len(matches) == 1 and matches[0]['sha256'] == TEMPLATE_SHA, 'TEMPLATE_MANIFEST_PIN')
    template = read_public(source_fd, 'install-scope.template.json', TEMPLATE_SHA, 1048576)
    scope = json.loads(template)
    e_fd = directory(E)
    old_fact = fact(e_fd, E)
    need(old_fact == dict(path=str(E), uid=501, dev=16777229, ino=219110222, mode=0o700), 'OLD_E_RECORDED_IDENTITY')
    parent_fd = directory(PARENT)
    check_chains()
    os.mkdir(OUTSIDE.name, 0o700, dir_fd=parent_fd)
    created = True
    outside_fd = directory(OUTSIDE)
    os.fchmod(outside_fd, 0o700)
    outside_fact = fact(outside_fd, OUTSIDE)
    need(outside_fact['uid'] == 501 and outside_fact['mode'] == 0o700, 'OUTSIDE_PRIVATE_DIRECTORY')
    scope['authorizedBy'] = 'root'
    scope['authorized'] = True
    scope['sourceManifestSha256'] = SOURCE_SHA
    scope['oldEDirectory'] = old_fact
    scope['outsideDirectoryFact'] = outside_fact
    scope['reviewPins'] = {
        str(S / 'manifest.json'): SOURCE_SHA,
        str(T / 'resume-architecture/resume2/gateway80-failed-red-resource-code04-exact-review/manifest.json'): '3ed25439337305de249cfbbc815d2b739131f1d85749fcb26325499bb7523448',
        str(T / 'qa/gateway80-failed-red-resource-code04-exact-review/manifest.json'): '6ed355b231a86e9d697a380d85d09eca94feb0129579bcd4d99ee05881c2fec4',
    }
    scope['candidate']['authorizedBy'] = 'root'
    scope['candidate']['authorized'] = True
    scope['candidate']['distinctFailedEntrypointAuthorized'] = True
    scope['candidate']['exactIndependentCodeReviewsQualified'] = True
    need(all(k not in scope for k in ('loaderPins', 'inputPins')), 'NO_CALLER_LOADER_MAP')
    need(all(k not in scope['candidate'] for k in ('codePins', 'newCodeRecordPins', 'binaryHashes', 'binaryModes', 'binaryWitnesses')), 'NO_CALLER_FACTORY_MAP')
    raw_scope = packed(scope)
    write_private(outside_fd, 'root-install-scope.json', raw_scope)
    check_chains()
    need(fact(e_fd, E) == old_fact and fact(outside_fd, OUTSIDE) == outside_fact, 'ROOT_FACT_STABILITY')
    result = dict(kind='ROOT_INSTALL_CONTROL_INPUTS_ONLY', sourceManifestSha256=SOURCE_SHA,
                  applicabilitySha256=APPLICABILITY_SHA, oldEDirectory=old_fact,
                  outsideDirectoryFact=outside_fact, outsideCreated=True,
                  scopePath=str(OUTSIDE / 'root-install-scope.json'),
                  scopeSha256=hashlib.sha256(raw_scope).hexdigest(), scopeBytes=len(raw_scope),
                  process=dict(pid=os.getpid(), ppid=os.getppid(), start=None, fullFingerprint=None),
                  newN02ObservedOrCreated=False, directoryEnumeration=False,
                  binaryOrSourceMapsAuthored=False, currentProcessSourceOrPrivateProbe=False,
                  controlAuthorOnly=True, outerCompletionAndCleanupOwed=True)
    write_private(t_fd, 'resume2-gateway80-source04-install-input-directory-facts.json', packed(result))
except BaseException as error:
    failure = type(error).__name__
    failure_reason = error.reason if type(error) is RootInputHold else 'OS_ERROR' if isinstance(error, OSError) else 'UNMAPPED_FAILURE'
finally:
    for row in reversed(owners):
        if row['state'] != 'OPEN':
            continue
        row['state'] = 'CLOSING'
        try:
            os.close(row['fd'])
            row['state'] = 'CLOSED'
        except BaseException as error:
            row['state'] = 'UNKNOWN'
            cleanup.append(type(error).__name__)
    print(json.dumps(dict(kind='ROOT_INSTALL_CONTROL_AUTHOR_TERMINAL', result=result,
                          primaryErrorType=failure, primaryReason=failure_reason, cleanupErrorTypes=cleanup,
                          outsideCreated=created,
                          descriptorCompletion='UNKNOWN' if cleanup else 'CLOSED',
                          actualExit=0 if failure is None and not cleanup else 1,
                          observerQualification=False, actualN02=False), sort_keys=True), flush=True)
sys.exit(0 if failure is None and not cleanup else 1)
