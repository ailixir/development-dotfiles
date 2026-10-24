"""Only three exact pinned Gradle8.10.2 test-report resources; no result freshness credit."""
import io
import json
from pathlib import Path
import zipfile
from driver_support import file_state, safe_path

POLICY_SHA256 = '8b36d0b7306eaca8f31300b2a3cadd615024a13414a82b9968f8235d06f7cb1f'
CATALOG_SHA256 = '3be436be6ec4784ee393c16aee0aaf65d7620b4aed9fabfb73c68b4be09e359e'


def load_policy(root, policy_path=None):
    path = policy_path or Path(__file__).resolve().with_name('report-resource-policy.json')
    current = file_state(safe_path(root, path))
    if current is None or current['sha256'] != POLICY_SHA256:
        raise ValueError('PINNED_RESOURCE_POLICY_CHANGED')
    policy = json.loads(current['bytes'])
    for reference in policy['reviewedInputs'].values():
        if file_state(safe_path(root, reference['path']))['sha256'] != reference['sha256']:
            raise ValueError('RESOURCE_POLICY_REVIEW_OR_ADOPTION_CHANGED')
    binding = policy['reviewedInputs']['catalog']
    if binding['sha256'] != CATALOG_SHA256:
        raise ValueError('PINNED_23_RESOURCE_CATALOG_REQUIRED')
    catalog = json.loads(file_state(safe_path(root, binding['path']))['bytes'])
    expected = [item for item in catalog['resources'] if item['generator'] == 'Gradle8.10.2-test-report']
    if len(catalog['resources']) != 23 or len(expected) != 3 or policy['resources'] != expected:
        raise ValueError('EXACT_THREE_GRADLE_RESOURCES_REQUIRED')
    declaration = policy['producerDeclaration']
    if file_state(safe_path(root, declaration['path']))['sha256'] != declaration['sha256']:
        raise ValueError('PINNED_GRADLE_PRODUCER_DECLARATION_CHANGED')
    return policy


def dependency(path):
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts:
        raise ValueError('PINNED_ABSOLUTE_JAR_PATH_REQUIRED')
    for item in (path, *path.parents):
        if item.is_symlink():
            raise ValueError('PRODUCER_JAR_SYMLINK')
    return file_state(path)


def dynamic_paths(cases, task):
    classes = {item['class'] for item in cases if item['task'] == task}
    return {'index.html'} | {'classes/' + name + '.html' for name in classes} | {
        'packages/' + name.rsplit('.', 1)[0] + '.html' for name in classes}


def classify(root, execution, label, entry, current, tasks, cases, policy, producers):
    task = entry.get('task')
    if task not in tasks:
        raise ValueError('REPORT_TASK_NOT_SELECTED')
    artifact = safe_path(root, entry['path'])
    archive_root = safe_path(root, execution / (label + '-task-outputs') / task / 'html')
    try:
        relative = artifact.relative_to(archive_root).as_posix()
    except ValueError:
        raise ValueError('REPORT_OUTSIDE_EXACT_TASK_HTML_ROOT') from None
    matches = [item for item in policy['resources'] if item['reportRelativePath'] == relative]
    if not matches:
        if relative not in dynamic_paths(cases, task):
            raise ValueError('UNKNOWN_OR_MISPLACED_REPORT_RESOURCE')
        return {'kind': 'DYNAMIC_ACTIVE_HTML', 'task': task, 'relativePath': relative}
    if len(matches) != 1:
        raise ValueError('AMBIGUOUS_STATIC_RESOURCE')
    item = matches[0]
    jar_path = item['dependencyJarPath']
    if jar_path not in producers:
        fact = dependency(jar_path)
        if (fact is None or fact['sha256'] != item['dependencyJarSha256']
                or len(fact['bytes']) != policy['producerJarBytes'][jar_path]):
            raise ValueError('PINNED_PRODUCER_JAR_HASH_OR_SIZE_CHANGED')
        producers[jar_path] = fact
    producer = producers[jar_path]
    if producer['sha256'] != item['dependencyJarSha256']:
        raise ValueError('PRODUCER_CATALOG_BINDING_CHANGED')
    with zipfile.ZipFile(io.BytesIO(producer['bytes'])) as archive:
        entries = [info for info in archive.infolist() if info.filename == item['dependencyEntry']]
        if len(entries) != 1 or entries[0].is_dir():
            raise ValueError('PRODUCER_ENTRY_MISSING_OR_AMBIGUOUS')
        data = archive.read(entries[0])
    from driver_support import sha
    if (sha(data) != item['resourceSha256'] or len(data) != item['resourceBytes']
            or current['sha256'] != item['resourceSha256']
            or len(current['bytes']) != item['resourceBytes']):
        raise ValueError('EXACT_STATIC_RESOURCE_CONTENT_CHANGED')
    return {'kind': policy['classification'], 'task': task, 'relativePath': relative,
            'originalReportRoot': policy['originalReportRoot'].format(task=task),
            'producerJarPath': jar_path, 'producerJarSha256': producer['sha256'],
            'producerJarBytes': len(producer['bytes']), 'entry': item['dependencyEntry'],
            'sha256': current['sha256'], 'bytes': len(current['bytes']),
            'mode': oct(current['mode']), 'originalMtimeNs': current['mtimeNs'],
            'freshnessCredit': False, 'caseCoverageRuntimeCredit': False}


def verify_producers(producers):
    for path, original in producers.items():
        current = dependency(path)
        if current is None or any(current[key] != original[key]
                for key in ['sha256', 'mode', 'dev', 'ino', 'mtimeNs']):
            raise ValueError('PRODUCER_CHANGED_DURING_ASSESSMENT')
