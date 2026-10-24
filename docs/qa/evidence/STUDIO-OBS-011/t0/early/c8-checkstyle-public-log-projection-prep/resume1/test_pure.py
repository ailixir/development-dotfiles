"""Synthetic privacy/shape tests only; no filesystem or process boundary."""
from pathlib import Path

source = Path(__file__).with_name('projector.py').read_bytes()
scope = {'__name__': '_synthetic_projector'}
exec(compile(source, '<synthetic-projector>', 'exec'), scope)
project = scope['project']
root = '/PUBLIC_REPO'
path = 'backend/src/test/java/Example.java'
paths = {path}
rules = {'LineLength', 'Indentation'}
row = '[ant:checkstyle] [ERROR] /PUBLIC_REPO/' + path + ':12:3: PRIVATE_MESSAGE_BAIT [LineLength]'
tests = []

def run(name, value, expected, unknown):
    out = project(value, root, paths, rules)
    assert out['matchedRows'] == expected and out['unqualifiedCheckstyleLines'] == unknown
    assert 'PRIVATE_MESSAGE_BAIT' not in repr(out)
    assert out['completeDiagnosticInventoryClaimed'] is False and out['currentHeadOrCauseOrC8Credit'] is False
    tests.append(name)

run('closed_known_error', row, 1, 0)
run('closed_warning_no_column', row.replace('[ERROR]', '[WARN]').replace(':12:3:', ':12:'), 1, 0)
run('configured_check_suffix', row.replace('[LineLength]', '[LineLengthCheck]'), 1, 0)
run('ansi_sgr_only', '\x1b[31m' + row + '\x1b[0m', 1, 0)
run('unknown_rule_count_only', row.replace('[LineLength]', '[PRIVATE_MESSAGE_BAIT]'), 0, 1)
run('unlisted_file_count_only', row.replace('Example.java', 'PRIVATE_MESSAGE_BAIT.java'), 0, 1)
run('foreign_root_count_only', row.replace('/PUBLIC_REPO/', '/PRIVATE_MESSAGE_BAIT/'), 0, 1)
run('dotdot_count_only', row.replace('/backend/src/', '/backend/src/../src/'), 0, 1)
run('zero_line_count_only', row.replace(':12:3:', ':0:3:'), 0, 1)
run('zero_column_count_only', row.replace(':12:3:', ':12:0:'), 0, 1)
run('malformed_diagnostic_count_only', '[ant:checkstyle] PRIVATE_MESSAGE_BAIT', 0, 1)
run('unrelated_native_output_ignored', 'PRIVATE_MESSAGE_BAIT [ERROR]', 0, 0)
run('duplicates_preserve_occurrences', row + '\n' + row, 2, 0)
try:
    project('x' * 2_000_001, root, paths, rules)
except ValueError:
    tests.append('input_bound')
else:
    raise AssertionError('input bound missing')
print({'passed': len(tests), 'names': tests, 'actualLogOrRuntimeRead': False})
