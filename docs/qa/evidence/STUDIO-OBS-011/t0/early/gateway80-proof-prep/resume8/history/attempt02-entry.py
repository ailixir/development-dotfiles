"""Literal bootstrap embedded in the future inspected readonly shell functions.

CLI: MANIFEST_SHA ENTRY_PATH ENTRY_SHA [--permit-sha EXACT_PERMIT_SHA].
This code is not imported by runtime.py and never runs a helper implicitly.
"""
import ast
import collections
import datetime
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import time
import types

PACKAGE = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume8')
BOOTSTRAP_TOKENS = []


def need(value, reason):
    if not value:
        raise ValueError(reason)


def open_owned(path, flags, parent=None):
    fd = os.open(path, flags, dir_fd=parent)
    token = {'token': len(BOOTSTRAP_TOKENS) + 1, 'kind': 'BOOTSTRAP_FD', 'handle': fd,
             'closer': os.close, 'closed': False, 'closeState': 'NOT_ATTEMPTED'}
    BOOTSTRAP_TOKENS.append(token)
    return token


def close_owned(token):
    need(token['closeState'] == 'NOT_ATTEMPTED', 'BOOTSTRAP_CLOSE_RETRY')
    token['closeState'] = 'UNKNOWN'
    os.close(token['handle'])
    token.update(closed=True, closeState='CONFIRMED')


def bootstrap_read(path, expected):
    need(type(expected) is str and len(expected) == 64 and set(expected) <= set('0123456789abcdef'), 'EXTERNAL_SHA_BEFORE_READ')
    path = Path(path)
    need(path.is_absolute() and '..' not in path.parts and len(path.parts) <= 64, 'BOOTSTRAP_PATH')
    parent = open_owned('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    for name in path.parts[1:-1]:
        old = parent
        parent = open_owned(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, old['handle'])
        need(stat.S_ISDIR(os.fstat(parent['handle']).st_mode), 'BOOTSTRAP_ANCESTOR_TYPE')
        close_owned(old)
    leaf = open_owned(path.name, os.O_RDONLY | os.O_NOFOLLOW, parent['handle'])
    before = os.fstat(leaf['handle'])
    need(stat.S_ISREG(before.st_mode) and 0 <= before.st_size <= 16 * 1024 * 1024, 'BOOTSTRAP_TYPE_SIZE_CAP')
    data = bytearray()
    while len(data) < before.st_size:
        amount = min(65536, before.st_size - len(data))
        raw = os.read(leaf['handle'], amount)
        need(type(raw) is bytes and 0 < len(raw) <= amount, 'BOOTSTRAP_READ_COUNT')
        data.extend(raw)
    key = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_size, s.st_mtime_ns)
    need(key(before) == key(os.fstat(leaf['handle']))
         == key(os.stat(path.name, dir_fd=parent['handle'], follow_symlinks=False)), 'BOOTSTRAP_LEAF_CHANGED')
    close_owned(leaf)
    close_owned(parent)
    result = bytes(data)
    need(hashlib.sha256(result).hexdigest() == expected, 'BOOTSTRAP_SHA_MISMATCH_BEFORE_INTERPRETATION')
    return result


def launch(argv):
    need(len(argv) in (3, 5), 'MANIFEST_ENTRY_PATH_AND_EXTERNAL_ENTRY_SHA_REQUIRED')
    manifest_sha, entry_path, entry_sha = argv[:3]
    manifest_raw = bootstrap_read(PACKAGE / 'manifest.json', manifest_sha)
    manifest = json.loads(manifest_raw)
    need(manifest.get('kind') == 'GATEWAY8_INACTIVE_LOCAL_RUNNER_SOURCE_SEAL', 'SOURCE8_MANIFEST_KIND')
    rows = {r['path']: r for r in manifest['files']}
    need(len(rows) == len(manifest['files']), 'DUPLICATE_MANIFEST_MEMBER')
    own = {}
    for name in ('runtime.py', 'scope.json', 'external-inputs.json'):
        row = rows[name]
        raw = bootstrap_read(PACKAGE / name, row['sha256'])
        need(len(raw) == row['bytes'] and stat.S_IMODE((PACKAGE / name).lstat().st_mode) == row['mode'], 'OWN_CODE_METADATA')
        own[name] = raw
    external = json.loads(own['external-inputs.json'])
    source_raw = bootstrap_read(Path(external['staticManifest']['path']), external['staticManifest']['sha256'])
    source_manifest = json.loads(source_raw)
    source_rows = {r['path']: r for r in source_manifest['files']}
    buffers = {'scope.json': own['scope.json']}
    for name, row in external['files'].items():
        need(type(row['path']) is str and Path(row['path']).is_absolute(), 'EXTERNAL_ABSOLUTE_PATH')
        if row.get('source06Member') is not None:
            old = source_rows[row['source06Member']]
            need((old['sha256'], old['bytes'], old['mode']) == (row['sha256'], row['bytes'], row['mode']), 'STATIC_SOURCE06_BINDING')
        raw = bootstrap_read(Path(row['path']), row['sha256'])
        need(len(raw) == row['bytes'] and stat.S_IMODE(Path(row['path']).lstat().st_mode) == row['mode'], 'EXTERNAL_METADATA')
        buffers[name] = raw
    entry_raw = bootstrap_read(Path(entry_path), entry_sha)
    entry = json.loads(entry_raw)
    need(entry.get('packetManifestSha256') == manifest_sha, 'ENTRY_MANIFEST_BINDING')
    if entry['operation'] not in ('capture', 'author-control'):
        need(Path(entry_path) == Path(external['runtime']) / entry['entryName'], 'EXACT_ENTRY_PATH')
    else:
        need(not Path(entry_path).is_relative_to(Path(external['runtime'])), 'CAPTURE_ENTRY_OUTSIDE_UNCREATED_E')
    if len(argv) == 5:
        need(argv[3] == '--permit-sha' and entry['operation'] == 'gate'
             and entry['inputPins']['close.root-permit.json'] == argv[4], 'EXACT_POSITIVE_PERMIT_ARGUMENT')
    ns = {'__name__': '_gateway8_verified_runtime', '__file__': str(PACKAGE / 'runtime.py')}
    exec(compile(own['runtime.py'], '<verified-source8-runtime>', 'exec'), ns)
    contracts = {}
    exec(compile(buffers['contracts.py'], '<verified-unchanged-report-assessor>', 'exec'), contracts)
    owner = ns['Ownership']()
    owner.tokens.extend(BOOTSTRAP_TOKENS)
    ctx = ns['Context'](buffers, external, manifest_sha, entry, owner=owner)
    ctx.assess = contracts['assess']
    try:
        code = ns['dispatch'](ctx)
        owner.finish()
        return code
    except BaseException as exc:
        # Typed metadata only; no arbitrary exception/output bodies or pre-C4 E writes.
        try:
            owner.finish()
        except BaseException:
            pass
        reason = str(exc) if isinstance(exc, ValueError) else 'UNEXPECTED_CONTROL_FAILURE'
        print(json.dumps(ctx.failure(reason), sort_keys=True))
        return 1


if __name__ == '__main__':
    try:
        result = launch(sys.argv[1:])
    except BaseException as exc:
        # Bootstrap can fail before a runtime Context exists. Preserve acquired tokens.
        for token in reversed(BOOTSTRAP_TOKENS):
            if token['closeState'] == 'NOT_ATTEMPTED':
                try:
                    close_owned(token)
                except BaseException:
                    pass
        print(json.dumps({'kind': 'TYPED_BOOTSTRAP_HOLD', 'failureClass': type(exc).__name__,
                          'failureCode': str(exc) if isinstance(exc, ValueError) and re.fullmatch('[A-Z0-9_]+', str(exc)) else 'BOOTSTRAP_FAILURE',
                          'outputDirectoryWriteAttempted': False,
                          'ownedTokens': [{k: t[k] for k in ('token', 'kind', 'closed', 'closeState')} for t in BOOTSTRAP_TOKENS]}))
        result = 1
    sys.exit(result)
