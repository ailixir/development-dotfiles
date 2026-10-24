"""Prepared source-only controls; inspect before execution.

Every subject function is pure. No OS/path/FFI/process boundary is reachable.
The launcher preloads the one exact subject buffer before the deny audit.
"""
import ast
import hashlib
import json
import pathlib
import sys

BASE = pathlib.Path(__file__).parent
raw = (BASE / 'selector-model.py').read_bytes()
subject_sha = hashlib.sha256(raw).hexdigest()
if len(sys.argv) != 2 or len(sys.argv[1]) != 64 or any(c not in '0123456789abcdef' for c in sys.argv[1]):
    raise ValueError('INDEPENDENT_MODEL_SOURCE_SHA_REQUIRED')
if subject_sha != sys.argv[1]:
    raise ValueError('MODEL_SOURCE_SHA_MISMATCH_BEFORE_AST')
tree = ast.parse(raw)
for node in ast.walk(tree):
    if isinstance(node, (ast.Import, ast.ImportFrom, ast.Assert)):
        raise ValueError('UNEXPECTED_IMPORT_OR_REMOVABLE_GUARD')

denied_events = []


def audit(event, args):
    if event == 'open' or event.startswith(('os.', 'subprocess.', 'ctypes.', 'socket.', 'fcntl.', '_thread.')):
        denied_events.append(event)
        raise RuntimeError('SOURCE_MODEL_EXTERNAL_BOUNDARY_DENIED')


sys.addaudithook(audit)
results = []
for optimize in (0, 1):
    ns = {'__builtins__': {'type': type, 'dict': dict, 'ValueError': ValueError}}
    exec(compile(raw, '<verified-selector-model>', 'exec', optimize=optimize), ns)
    base = {'protocol': 'WAITED_NATIVE_WITH_SAMPLED_CLOSURE_V1',
            'legacyOrdinaryGateSatisfied': False, 'intervalCaptureClaimed': False,
            'birth_stable': True, 'mapped_equals_opened': True,
            'mapped_object': [1, 200], 'path_equal': True,
            'bytes_equal': True, 'uuid_equal': True}
    cases = [
        ('PATH_MAPPING_HASH_UUID_WITHOUT_MAIN_RELATION', dict(base), 'MAIN_EXECUTABLE_OBJECT_RELATION_UNPROVED'),
        ('RELATION_WRONG_VNODE', dict(base, main_object_relation={'independent_object_relation': True,
             'main_object': [1, 100], 'same_birth_bracket': True}), 'MODEL_MAIN_OBJECT_MISMATCH'),
        ('RELATION_WRONG_BIRTH', dict(base, main_object_relation={'independent_object_relation': True,
             'main_object': [1, 200], 'same_birth_bracket': False}), 'MODEL_RELATION_BIRTH_UNPROVED'),
        ('ABSTRACT_RELATION_EXPLICIT_NONAUTHORITY', dict(base, main_object_relation={'independent_object_relation': True,
             'main_object': [1, 200], 'same_birth_bracket': True}), 'SYNTHETIC_MODEL_RELATION_ONLY_NO_OPERATIONAL_AUTHORITY'),
        ('LEGACY_FLAG_INTEGER_REJECTED', dict(base, legacyOrdinaryGateSatisfied=0), 'MODEL_LEGACY_FLAG'),
        ('INTERVAL_FLAG_INTEGER_REJECTED', dict(base, intervalCaptureClaimed=0), 'MODEL_INTERVAL_FLAG'),
    ]
    for name, evidence, expected in cases:
        try:
            actual = ns['evaluate_selector'](evidence)
        except ValueError as exc:
            actual = str(exc)
        if actual != expected:
            raise ValueError('CONTROL_FAILED_' + name)
        results.append({'id': name, 'optimize': optimize, 'passed': True})
if denied_events:
    raise ValueError('EXTERNAL_BOUNDARY_ATTEMPTED')
print(json.dumps({'kind': 'PURE_SELECTOR_SOURCE_MODEL_CHECKS', 'sourceSha256': subject_sha,
                  'checks': len(results), 'cases': results, 'externalBoundaryAttempts': denied_events,
                  'actualPlatformProviderOrNativeActions': 0,
                  'source06ControlsReplayed': 0,
                  'legacyOrdinaryGateSatisfied': False, 'intervalCaptureClaimed': False}, indent=2))
