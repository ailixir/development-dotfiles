"""No imports or CLI. ast, hashlib, ET, Path, Counter are preloaded dependencies.

The caller supplies exact already-opened full source buffers and external raw SHA pins.
No path read, import, helper or legacy top-level statement runs here.
"""

def selected_namespace(buffers, selection, ast, hashlib, ET, Path):
    namespace = {'ET': ET, 'Path': Path, '__builtins__': __builtins__}
    for path, row in selection.items():
        raw = buffers[path]
        if type(raw) is not bytes or hashlib.sha256(raw).hexdigest() != row['sha256']:
            raise ValueError('SELECTED_SOURCE_PIN')
        tree = ast.parse(raw, filename=path)
        nodes = []
        for name in row['definitions']:
            found = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name]
            if len(found) != 1 or found[0].decorator_list:
                raise ValueError('SELECTED_DEFINITION_SHAPE')
            node = found[0]
            # Only literal primitive defaults are inert; historical pure predicates use True/False.
            defaults = list(node.args.defaults) + [n for n in node.args.kw_defaults if n is not None]
            if any(not isinstance(n, ast.Constant) or type(n.value) not in (bool, int, str, type(None)) for n in defaults) or node.returns is not None or any(a.annotation is not None for a in (*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs)):
                raise ValueError('SELECTED_DEFINITION_EAGER_CODE')
            if any(isinstance(n, (ast.Import, ast.ImportFrom, ast.Global, ast.Nonlocal)) for n in ast.walk(node)):
                raise ValueError('SELECTED_DEFINITION_GLOBAL_EFFECT')
            nodes.append(node)
        exec(compile(ast.Module(body=nodes, type_ignores=[]), path + ':selected-only', 'exec'), namespace)
    return namespace


def checkstyle_projection(raw, task, project_root, source_paths, allowed_rules, ET):
    """Freshness/FD custody remain Port duties. No arbitrary message or raw XML leaves here."""
    if task not in ('checkstyleMain', 'checkstyleTest') or type(raw) is not bytes or len(raw) > 8 * 1024 * 1024 or b'<!' in raw:
        raise ValueError('CHECKSTYLE_INPUT')
    root = ET.fromstring(raw)
    if root.tag != 'checkstyle' or set(root.attrib) != {'version'}:
        raise ValueError('CHECKSTYLE_ROOT')
    facts = []
    seen = set()
    prefix = project_root + '/'
    for file in root:
        if file.tag != 'file' or set(file.attrib) != {'name'}:
            raise ValueError('CHECKSTYLE_FILE')
        name = file.attrib['name']
        if not name.startswith(prefix):
            raise ValueError('CHECKSTYLE_ROOT_PATH')
        relative = name[len(prefix):]
        if relative not in source_paths or relative in seen:
            raise ValueError('CHECKSTYLE_MEMBER')
        seen.add(relative)
        for error in file:
            if error.tag != 'error' or set(error.attrib) - {'line', 'column', 'severity', 'message', 'source'} or not {'line', 'severity', 'source'} <= set(error.attrib) or len(error):
                raise ValueError('CHECKSTYLE_ERROR_SCHEMA')
            line, column = error.attrib['line'], error.attrib.get('column')
            if not line.isdecimal() or not 0 < int(line) < 10000000 or column is not None and (not column.isdecimal() or not 0 < int(column) < 1000000):
                raise ValueError('CHECKSTYLE_LOCATION')
            if error.attrib['severity'] not in ('error', 'warning', 'info') or error.attrib['source'] not in allowed_rules:
                raise ValueError('CHECKSTYLE_RULE')
            facts.append({'task': task, 'path': relative, 'line': int(line), 'column': int(column) if column is not None else None, 'rule': error.attrib['source'], 'severity': error.attrib['severity']})
    return {'task': task, 'diagnosticCount': len(facts), 'facts': facts}


def qualify_cases(parsed, catalog, Counter):
    expected = Counter((x['task'], x['class'], x['name'], 'PASS') for x in catalog)
    actual = Counter()
    totals = {'total': 0, 'passed': 0, 'failed': 0, 'errors': 0, 'skipped': 0}
    for counts, cases in parsed:
        if set(counts) != set(totals) or any(type(v) is not int or v < 0 for v in counts.values()):
            raise ValueError('TEST_COUNTS_SCHEMA')
        for key in totals:
            totals[key] += counts[key]
        for case in cases:
            if type(case) is not dict or set(case) != {'task', 'class', 'name', 'status'}:
                raise ValueError('TEST_CASE_SCHEMA')
            actual[(case['task'], case['class'], case['name'], case['status'])] += 1
    if actual != expected or totals != {'total': 99, 'passed': 99, 'failed': 0, 'errors': 0, 'skipped': 0}:
        raise ValueError('EXACT99_REQUIRED')
    return totals


def build_controller(raw_source, source_pin, raw_plan, plan_pin, hashlib, json, port=None):
    if type(raw_source) is not bytes or type(raw_plan) is not bytes or hashlib.sha256(raw_source).hexdigest() != source_pin or hashlib.sha256(raw_plan).hexdigest() != plan_pin:
        raise ValueError('CONTROLLER_OR_PLAN_PIN')
    namespace = {'__builtins__': __builtins__, '__name__': 'inactive_verified_gst_controller'}
    exec(compile(raw_source, '<same-verified-controller-buffer>', 'exec'), namespace)
    return namespace['Controller'](json.loads(raw_plan), plan_pin, port), namespace
