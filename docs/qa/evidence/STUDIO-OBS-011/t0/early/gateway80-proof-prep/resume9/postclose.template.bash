# INACTIVE TEMPLATE. Separate exact root runtime authority and inspected source required.
# The loader below is literal; it never reopens an unverified entry.py.
# Embedded entry.py SHA256: 42bc48ce942ae31152ff2d8bac590cf5087332b4076e411d52f784f9bb9636ba
# Usage: source this-inspected-file MANIFEST_SHA RELEASE_SHA POSTCLOSE_ENTRY_SHA
if [[ $# != 3 || ! $1 =~ ^[0-9a-f]{64}$ || ! $2 =~ ^[0-9a-f]{64}$ || ! $3 =~ ^[0-9a-f]{64}$ ]]; then return 1; fi
if '/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13' -I -B -c '"""Literal bootstrap embedded in the future inspected readonly shell functions.

CLI: MANIFEST_SHA ENTRY_PATH ENTRY_SHA --operation MODE [--release-sha SHA] [--permit-sha SHA].
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

PACKAGE = Path('"'"'/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume9'"'"')
RUNTIME = Path('"'"'/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs009-gateway80-offtree04-20261019'"'"')
BOOTSTRAP_TOKENS = []


def need(value, reason):
    if not value:
        raise ValueError(reason)


def open_owned(path, flags, parent=None):
    fd = os.open(path, flags, dir_fd=parent)
    token = {'"'"'token'"'"': len(BOOTSTRAP_TOKENS) + 1, '"'"'kind'"'"': '"'"'BOOTSTRAP_FD'"'"', '"'"'handle'"'"': fd,
             '"'"'closer'"'"': os.close, '"'"'closed'"'"': False, '"'"'closeState'"'"': '"'"'NOT_ATTEMPTED'"'"'}
    BOOTSTRAP_TOKENS.append(token)
    return token


def close_owned(token):
    need(token['"'"'closeState'"'"'] == '"'"'NOT_ATTEMPTED'"'"', '"'"'BOOTSTRAP_CLOSE_RETRY'"'"')
    token['"'"'closeState'"'"'] = '"'"'UNKNOWN'"'"'
    os.close(token['"'"'handle'"'"'])
    token.update(closed=True, closeState='"'"'CONFIRMED'"'"')


def bootstrap_read(path, expected, expected_mode=0o600):
    need(type(expected) is str and len(expected) == 64 and set(expected) <= set('"'"'0123456789abcdef'"'"'), '"'"'EXTERNAL_SHA_BEFORE_READ'"'"')
    path = Path(path)
    need(path.is_absolute() and '"'"'..'"'"' not in path.parts and len(path.parts) <= 64, '"'"'BOOTSTRAP_PATH'"'"')
    parent = open_owned('"'"'/'"'"', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    current = Path('"'"'/'"'"')
    for name in path.parts[1:-1]:
        old = parent
        parent = open_owned(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, old['"'"'handle'"'"'])
        need(stat.S_ISDIR(os.fstat(parent['"'"'handle'"'"']).st_mode), '"'"'BOOTSTRAP_ANCESTOR_TYPE'"'"')
        current = current / name
        if current == RUNTIME:
            directory = os.fstat(parent['"'"'handle'"'"'])
            need(directory.st_uid == os.getuid() and stat.S_IMODE(directory.st_mode) == 0o700, '"'"'BOOTSTRAP_RUNTIME_DIRECTORY_POLICY'"'"')
        close_owned(old)
    leaf = open_owned(path.name, os.O_RDONLY | os.O_NOFOLLOW, parent['"'"'handle'"'"'])
    before = os.fstat(leaf['"'"'handle'"'"'])
    need(stat.S_ISREG(before.st_mode) and 0 <= before.st_size <= 16 * 1024 * 1024, '"'"'BOOTSTRAP_TYPE_SIZE_CAP'"'"')
    need(before.st_uid == os.getuid() and stat.S_IMODE(before.st_mode) == expected_mode and before.st_nlink == 1,
         '"'"'BOOTSTRAP_OPENED_FD_OWNER_MODE_LINK_POLICY'"'"')
    data = bytearray()
    while len(data) < before.st_size:
        amount = min(65536, before.st_size - len(data))
        raw = os.read(leaf['"'"'handle'"'"'], amount)
        need(type(raw) is bytes and 0 < len(raw) <= amount, '"'"'BOOTSTRAP_READ_COUNT'"'"')
        data.extend(raw)
    key = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_size, s.st_mtime_ns, s.st_nlink)
    need(key(before) == key(os.fstat(leaf['"'"'handle'"'"']))
         == key(os.stat(path.name, dir_fd=parent['"'"'handle'"'"'], follow_symlinks=False)), '"'"'BOOTSTRAP_LEAF_CHANGED'"'"')
    close_owned(leaf)
    close_owned(parent)
    result = bytes(data)
    need(hashlib.sha256(result).hexdigest() == expected, '"'"'BOOTSTRAP_SHA_MISMATCH_BEFORE_INTERPRETATION'"'"')
    return result


def launch(argv):
    need(len(argv) in (5, 7, 9), '"'"'MANIFEST_ENTRY_PATH_AND_EXTERNAL_ENTRY_SHA_REQUIRED'"'"')
    manifest_sha, entry_path, entry_sha = argv[:3]
    options = {}
    for offset in range(3, len(argv), 2):
        key, value = argv[offset:offset + 2]
        need(key in ('"'"'--release-sha'"'"', '"'"'--permit-sha'"'"', '"'"'--operation'"'"') and key not in options, '"'"'EXACT_ENTRY_OPTION'"'"')
        need((key == '"'"'--operation'"'"' and value in ('"'"'capture'"'"', '"'"'author-control'"'"', '"'"'negative'"'"', '"'"'held-proof'"'"', '"'"'prepare'"'"',
             '"'"'red'"'"', '"'"'install-fixed'"'"', '"'"'green'"'"', '"'"'archive'"'"', '"'"'final'"'"', '"'"'gate'"'"', '"'"'postclose'"'"'))
             or (key != '"'"'--operation'"'"' and len(value) == 64 and set(value) <= set('"'"'0123456789abcdef'"'"')), '"'"'EXACT_ENTRY_OPTION_VALUE'"'"')
        options[key] = value
    manifest_raw = bootstrap_read(PACKAGE / '"'"'manifest.json'"'"', manifest_sha, 0o644)
    manifest = json.loads(manifest_raw)
    need(manifest.get('"'"'kind'"'"') == '"'"'GATEWAY9_INACTIVE_LOCAL_RUNNER_SOURCE_SEAL'"'"', '"'"'SOURCE9_MANIFEST_KIND'"'"')
    rows = {r['"'"'path'"'"']: r for r in manifest['"'"'files'"'"']}
    need(len(rows) == len(manifest['"'"'files'"'"']), '"'"'DUPLICATE_MANIFEST_MEMBER'"'"')
    own = {}
    for name in ('"'"'runtime.py'"'"', '"'"'scope.json'"'"', '"'"'external-inputs.json'"'"'):
        row = rows[name]
        raw = bootstrap_read(PACKAGE / name, row['"'"'sha256'"'"'], row['"'"'mode'"'"'])
        need(len(raw) == row['"'"'bytes'"'"'] and stat.S_IMODE((PACKAGE / name).lstat().st_mode) == row['"'"'mode'"'"'], '"'"'OWN_CODE_METADATA'"'"')
        own[name] = raw
    external = json.loads(own['"'"'external-inputs.json'"'"'])
    source_raw = bootstrap_read(Path(external['"'"'staticManifest'"'"']['"'"'path'"'"']), external['"'"'staticManifest'"'"']['"'"'sha256'"'"'], 0o644)
    source_manifest = json.loads(source_raw)
    source_rows = {r['"'"'path'"'"']: r for r in source_manifest['"'"'files'"'"']}
    buffers = {'"'"'scope.json'"'"': own['"'"'scope.json'"'"']}
    for name, row in external['"'"'files'"'"'].items():
        need(type(row['"'"'path'"'"']) is str and Path(row['"'"'path'"'"']).is_absolute(), '"'"'EXTERNAL_ABSOLUTE_PATH'"'"')
        if row.get('"'"'source06Member'"'"') is not None:
            old = source_rows[row['"'"'source06Member'"'"']]
            need((old['"'"'sha256'"'"'], old['"'"'bytes'"'"'], old['"'"'mode'"'"']) == (row['"'"'sha256'"'"'], row['"'"'bytes'"'"'], row['"'"'mode'"'"']), '"'"'STATIC_SOURCE06_BINDING'"'"')
        raw = bootstrap_read(Path(row['"'"'path'"'"']), row['"'"'sha256'"'"'], row['"'"'mode'"'"'])
        need(len(raw) == row['"'"'bytes'"'"'] and stat.S_IMODE(Path(row['"'"'path'"'"']).lstat().st_mode) == row['"'"'mode'"'"'], '"'"'EXTERNAL_METADATA'"'"')
        buffers[name] = raw
    entry_raw = bootstrap_read(Path(entry_path), entry_sha)
    entry = json.loads(entry_raw)
    need(entry.get('"'"'packetManifestSha256'"'"') == manifest_sha, '"'"'ENTRY_MANIFEST_BINDING'"'"')
    need(options.get('"'"'--operation'"'"') == entry['"'"'operation'"'"'], '"'"'CALLER_EXPECTED_OPERATION_REQUIRED'"'"')
    expected_purpose = {'"'"'capture'"'"':'"'"'ROOT_CAPTURE_ENTRY'"'"','"'"'author-control'"'"':'"'"'ROOT_AUTHOR_REQUEST'"'"'}.get(entry['"'"'operation'"'"'],'"'"'OPERATION_ENTRY'"'"')
    need(entry.get('"'"'purpose'"'"') == expected_purpose and entry.get('"'"'authorizedBy'"'"') == '"'"'root'"'"', '"'"'ENTRY_ROLE_PURPOSE'"'"')
    if entry['"'"'operation'"'"'] not in ('"'"'capture'"'"', '"'"'author-control'"'"'):
        need(entry.get('"'"'entryName'"'"') == entry['"'"'operation'"'"'] + '"'"'.entry.json'"'"'
             and Path(entry_path) == Path(external['"'"'runtime'"'"']) / entry['"'"'entryName'"'"'], '"'"'EXACT_ENTRY_PATH'"'"')
        need(options.get('"'"'--release-sha'"'"') == entry['"'"'inputPins'"'"']['"'"'root-authorization.json'"'"'], '"'"'SHELL_BOUND_RELEASE_SHA_REQUIRED'"'"')
    else:
        need(not Path(entry_path).is_relative_to(Path(external['"'"'runtime'"'"'])), '"'"'CAPTURE_ENTRY_OUTSIDE_UNCREATED_E'"'"')
        need(set(options) == {'"'"'--operation'"'"'}, '"'"'EXTERIOR_ENTRY_HAS_NO_RELEASE_OR_PERMIT_OPTION'"'"')
    if entry['"'"'operation'"'"'] == '"'"'gate'"'"':
        need(options.get('"'"'--permit-sha'"'"') == entry['"'"'inputPins'"'"']['"'"'close.root-permit.json'"'"'], '"'"'EXACT_POSITIVE_PERMIT_ARGUMENT'"'"')
    else:
        need('"'"'--permit-sha'"'"' not in options, '"'"'PERMIT_ONLY_FOR_GATE'"'"')
    ns = {'"'"'__name__'"'"': '"'"'_gateway8_verified_runtime'"'"', '"'"'__file__'"'"': str(PACKAGE / '"'"'runtime.py'"'"')}
    exec(compile(own['"'"'runtime.py'"'"'], '"'"'<verified-source9-runtime>'"'"', '"'"'exec'"'"'), ns)
    contracts = {}
    exec(compile(buffers['"'"'contracts.py'"'"'], '"'"'<verified-unchanged-report-assessor>'"'"', '"'"'exec'"'"'), contracts)
    owner = ns['"'"'Ownership'"'"']()
    owner.tokens.extend(BOOTSTRAP_TOKENS)
    ctx = ns['"'"'Context'"'"'](buffers, external, manifest_sha, entry, owner=owner)
    ctx.assess = contracts['"'"'assess'"'"']
    return execute_context(ctx, ns['"'"'dispatch'"'"'])


def execute_context(ctx, dispatch):
    """Actual launch fallthrough and independent operator sink, shared by every mode."""
    owner = ctx.owner
    try:
        code = dispatch(ctx)
        owner.finish()
        if code != 0:
            ctx.emit_native_fallback('"'"'HANDLED_OPERATION_HOLD'"'"')
        return code
    except BaseException as exc:
        # Typed metadata only; no arbitrary exception/output bodies or pre-C4 E writes.
        cleanup_class = None
        try:
            owner.finish()
        except BaseException as cleanup:
            cleanup_class = type(cleanup).__name__
        if cleanup_class is not None:
            for record in ctx.native_attempts:
                record['"'"'cleanupFailureClasses'"'"'].append(cleanup_class)
        reason = str(exc) if isinstance(exc, ValueError) else '"'"'UNEXPECTED_CONTROL_FAILURE'"'"'
        ctx.emit_native_fallback(reason)
        print(json.dumps(ctx.failure(reason), sort_keys=True))
        return 1


if __name__ == '"'"'__main__'"'"':
    try:
        result = launch(sys.argv[1:])
    except BaseException as exc:
        # Bootstrap can fail before a runtime Context exists. Preserve acquired tokens.
        for token in reversed(BOOTSTRAP_TOKENS):
            if token['"'"'closeState'"'"'] == '"'"'NOT_ATTEMPTED'"'"':
                try:
                    close_owned(token)
                except BaseException:
                    pass
        print(json.dumps({'"'"'kind'"'"': '"'"'TYPED_BOOTSTRAP_HOLD'"'"', '"'"'failureClass'"'"': type(exc).__name__,
                          '"'"'failureCode'"'"': str(exc) if isinstance(exc, ValueError) and re.fullmatch('"'"'[A-Z0-9_]+'"'"', str(exc)) else '"'"'BOOTSTRAP_FAILURE'"'"',
                          '"'"'outputDirectoryWriteAttempted'"'"': False,
                          '"'"'ownedTokens'"'"': [{k: t[k] for k in ('"'"'token'"'"', '"'"'kind'"'"', '"'"'closed'"'"', '"'"'closeState'"'"')} for t in BOOTSTRAP_TOKENS]}))
        result = 1
    sys.exit(result)
' "$1" '/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs009-gateway80-offtree04-20261019/postclose.entry.json' "$3" --operation postclose --release-sha "$2" < /dev/null; then
  return 0
else
  return $?
fi
