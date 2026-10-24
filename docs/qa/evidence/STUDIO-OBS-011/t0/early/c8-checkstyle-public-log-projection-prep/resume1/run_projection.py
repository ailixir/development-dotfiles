"""Prospective root-authorized one-input reader; never invoked in preparation."""
import ast
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import xml.etree.ElementTree as ET

sys.dont_write_bytecode = True
R = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
P = R / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-checkstyle-public-log-projection-prep/resume1'
D = R / 'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-t0-c8-check01/public-checkstyle-projection01'
CORE = R / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-failed-resource-prep/resume4/failed_resource.py'
SHA = lambda b: hashlib.sha256(b).hexdigest()

def bootstrap_bytes(path):
    chain = []
    try:
        fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        chain.append((None, '/', fd, os.fstat(fd)))
        for component in path.parts[1:-1]:
            parent = fd
            fd = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            chain.append((parent, component, fd, os.fstat(fd)))
        source_fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
        try:
            before = os.fstat(source_fd)
            assert stat.S_ISREG(before.st_mode)
            with os.fdopen(source_fd, 'rb', closefd=False) as stream:
                raw = stream.read()
            after = os.fstat(source_fd)
            named = os.stat(path.name, dir_fd=fd, follow_symlinks=False)
            key = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_size, s.st_mtime_ns)
            assert key(before) == key(after) == key(named)
            for parent, name, descriptor, original in chain:
                current = os.stat('/', follow_symlinks=False) if parent is None else os.stat(name, dir_fd=parent, follow_symlinks=False)
                directory_key = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_uid)
                assert directory_key(current) == directory_key(original) == directory_key(os.fstat(descriptor))
            return raw
        finally:
            os.close(source_fd)
    finally:
        for _, _, descriptor, _ in reversed(chain):
            os.close(descriptor)

def main():
    if not __debug__:
        raise ValueError('OPTIMIZED_PYTHON_FORBIDDEN')
    assert len(sys.argv) == 2
    raw = bootstrap_bytes(CORE)
    assert SHA(raw) == 'b8868e78d9ac1b7de6aa200a2a3497e9b3705bbbc05018e41b09349fcf305e50'
    selected = [n for n in ast.parse(raw).body if isinstance(n, (ast.FunctionDef, ast.ClassDef))
                and n.name in {'Hold', 'need', 'member_name', 'Custody'}]
    assert len(selected) == 4
    ns = {'Path': Path, 'os': os, 'json': json, 'stat': stat}
    exec(compile(ast.Module(body=selected, type_ignores=[]), '<verified-custody-only>', 'exec'), ns)
    C = ns['Custody']
    actual, package = C(D, 0o700), C(P)
    try:
        auth_raw = actual.read('root-authorization.json')
        assert SHA(auth_raw) == sys.argv[1]
        auth = json.loads(auth_raw)
        assert auth['authorized'] is True and auth['authorizedBy'] == 'root' and auth['C8Credit'] is False
        assert auth['purpose'] == 'ONE_FROZEN_PUBLIC_CHECKSTYLE_SOURCE_PROJECTION'
        assert set(actual.members()) == {'root-authorization.json'}
        manifest_raw = package.read('manifest.json', 0o644)
        assert SHA(manifest_raw) == auth['manifestSha256']
        buffers = {}
        for row in json.loads(manifest_raw)['files']:
            buf = package.read(row['path'], 0o644)
            assert SHA(buf) == row['sha256'] and len(buf) == row['bytes']
            buffers[row['path']] = buf
        policy = json.loads(buffers['policy.json'])
        assert SHA(buffers['policy.json']) == auth['policySha256']
        def fixed_input(record):
            name = record['path']
            assert isinstance(name, str) and not name.startswith('/') and '..' not in Path(name).parts
            f = R / name
            c = C(f.parent)
            try:
                b = c.read(f.name, None)
                assert SHA(b) == record['sha256'] and ('bytes' not in record or len(b) == record['bytes'])
                return b
            finally:
                c.close()
        guards = json.loads(fixed_input(policy['sourceGuard']))
        config = ET.fromstring(fixed_input(policy['checkstyleConfig']))
        rules = {n.attrib['name'].split('.')[-1].removesuffix('Check') for n in config.iter('module')}
        paths = {row['path'] for row in guards['files']}
        scope = {'__name__': '_verified_closed_projector'}
        exec(compile(buffers['projector.py'], '<verified-closed-projector>', 'exec'), scope)
        log = fixed_input(policy['input'])
        result = scope['project'](log.decode('utf-8', errors='strict'), str(R), paths, rules)
        result.update(inputSha256=policy['input']['sha256'], authorizationSha256=sys.argv[1],
                      nativeOrSourceActions=0)
        package.check()
        actual.write('projection.json', result)
        print(json.dumps({'status': 'CLOSED_PROJECTION_WRITTEN', 'matchedRows': result['matchedRows'],
                          'unqualifiedCheckstyleLines': result['unqualifiedCheckstyleLines'],
                          'projectionSha256': SHA(actual.read('projection.json')), 'C8Credit': False}))
    finally:
        actual.close()
        package.close()

if __name__ == '__main__':
    main()
