"""Closed source diagnostics from one frozen public log. Imports do no IO."""
import re

SGR = re.compile(r'\x1b\[[0-9;]*m')
ROW = re.compile(r'^\[ant:checkstyle\]\s+\[(ERROR|WARN)\]\s+(.+?\.java):(\d+)(?::(\d+))?:.*\[([A-Za-z][A-Za-z0-9]*)\]\s*$')

def project(text, repository, source_paths, allowed_rules):
    if not isinstance(text, str) or len(text) > 2_000_000:
        raise ValueError('BOUNDED_TEXT_REQUIRED')
    prefix = repository.rstrip('/') + '/'
    facts = []
    unknown = 0
    for original in text.splitlines():
        line = SGR.sub('', original).strip()
        if not line.startswith('[ant:checkstyle]'):
            continue
        match = ROW.fullmatch(line)
        if not match:
            unknown += 1
            continue
        severity, absolute, number, column, rule = match.groups()
        relative = absolute[len(prefix):] if absolute.startswith(prefix) else ''
        normalized_rule = rule.removesuffix('Check')
        if (relative not in source_paths or not relative.startswith('backend/src/')
                or not relative.endswith('.java') or '..' in relative.split('/')
                or normalized_rule not in allowed_rules or not 0 < int(number) <= 1_000_000
                or column is not None and not 0 < int(column) <= 1_000_000):
            unknown += 1
            continue
        facts.append({'file': relative, 'line': int(number),
                      'column': int(column) if column is not None else None,
                      'rule': normalized_rule, 'severity': severity})
    return {'kind': 'FROZEN_C8_PUBLIC_CHECKSTYLE_SOURCE_FACTS', 'facts': facts,
            'matchedRows': len(facts), 'unqualifiedCheckstyleLines': unknown,
            'detailsAvailable': bool(facts), 'completeDiagnosticInventoryClaimed': False,
            'currentHeadOrCauseOrC8Credit': False}
