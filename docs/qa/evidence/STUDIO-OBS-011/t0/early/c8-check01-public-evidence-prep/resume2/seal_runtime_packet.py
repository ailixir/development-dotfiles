"""Reproduce this preparation seal. Writes only this exact resume2 directory.

No source capture/baseline/OS/native/runtime/private observation. Historical27 input pins
remain declarations, not fresh observations. Existing25 members are verified literally.
"""
import ast
import hashlib
import json
from pathlib import Path
import stat

HERE = Path(__file__).absolute().parent
assert HERE.name == 'resume2' and HERE.parent.name == 'c8-check01-public-evidence-prep'
ROOT = next(parent for parent in HERE.parents if parent.name == 'ui-studio')
OLD = HERE.parent / 'resume1'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def write(name, value):
    assert '/' not in name and name not in ('.', '..')
    (HERE / name).write_text(json.dumps(value, indent=2) + '\n')


old_raw = (OLD / 'manifest.json').read_bytes()
assert digest(old_raw) == '8949bd8b929db701e4da798db04ddc1d025c8cb7d3e831eb155a307d10ddebe7'
old = json.loads(old_raw)
preserved = []
for item in old['files']:
    original, successor = OLD / item['path'], HERE / item['path']
    assert digest(original.read_bytes()) == item['sha256'] == digest(successor.read_bytes())
    assert len(original.read_bytes()) == item['bytes'] == len(successor.read_bytes())
    assert stat.S_IMODE(original.stat().st_mode) == item['mode'] == stat.S_IMODE(successor.stat().st_mode)
    preserved.append(dict(item, unchanged=True))
assert len(preserved) == 25 and (HERE / 'prior-manifest.json').read_bytes() == old_raw
source_binding = json.loads((HERE / 'source-binding.json').read_bytes())
runtime_raw = (HERE / 'public_observation_unit.py').read_bytes()
tree = ast.parse(runtime_raw)
functions, methods = {}, {}
for node in tree.body:
    if isinstance(node, ast.FunctionDef):
        functions[node.name] = {'file': 'public_observation_unit.py', 'line': node.lineno, 'endLine': node.end_lineno}
    elif isinstance(node, ast.ClassDef):
        for child in node.body:
            if isinstance(child, ast.FunctionDef):
                methods[node.name + '.' + child.name] = {'file': 'public_observation_unit.py', 'line': child.lineno, 'endLine': child.end_lineno}
boundary = json.loads((OLD / 'runtime-effects-boundary.json').read_bytes())
callbacks = [name for effect in boundary['effects'] for name in effect['methods']]
assert all('Effects.' + name in methods for name in callbacks)
assert boundary['requiredNewExecutableComponent']['cli'] == ['held-proof', 'stage', 'selected', 'collect-public', 'restore', 'compile-restored', 'final', 'gate', 'postclose']
old_results = json.loads((HERE / 'pure-check-results.json').read_bytes())
results = json.loads((HERE / 'runtime-adapter-check-results.json').read_bytes())
assert old_results['passed'] == 311 and old_results['failed'] == 0 and old_results['blockedRealBoundaryCalls'] == []
assert results['failed'] == 0 and results['realBoundaryCalls'] == [] and len(results['checks']) == results['passed'] and len({x['name'] for x in results['checks']}) == results['passed']
assert all(x['pass'] is True for x in results['checks'])

template = json.loads((HERE / 'runtime-root-release.template.json').read_bytes())
template['artifactPins'] = {name: digest((HERE / name).read_bytes()) for name in template['artifactPins']}
template['adapterSha256'] = digest(runtime_raw)
assert template['rootAuthorized'] is False and template['actualReleased'] is False and template['allLiveNativeSourcePrivateCallsAuthorized'] is False and template['metadataOnlyPublicScopeAuthorized'] is False
assert template['releaseSha256'] is None and template['activeLockSha256'] is None and template['holderIdentity'] is None and template['currentInputRecords'] == []
assert all(value['path'] is None and value['sha256'] is None for value in template['reviewRecords'].values())
write('runtime-root-release.template.json', template)
write('runtime-install-map.json', {
    'kind': 'INERT_FUTURE_EXACT_CONTROL_INSTALLATION', 'unit': 'obs011-t0-c8-public-error-observe01',
    'unitDirectoryMode': 0o700, 'controlDirectoryMode': 0o700,
    'members': [{'source': name, 'destination': 'control/' + name, 'sha256': expected,
                 'sourceMode': 0o644, 'runtimeMode': 0o600} for name, expected in sorted(template['artifactPins'].items())],
    'runtimeCreated': False, 'actualRootReleaseCreated': False,
    'doNotCopyPreparationTestsRecipesOrTemplates': True})

groups = []
for effect in boundary['effects']:
    groups.append({'callbacks': {name: methods['Effects.' + name] for name in effect['methods']},
                   'requiredContractLiteral': effect['requiredImplementation'], 'prospectiveImplementationWritten': True})
readers = [
    {'reader': 'raw root release and installed artifacts', 'path': 'fixed new control installation', 'method': ['load', 'Verified.raw', 'Verified.module'], 'verifiedConsumedBuffer': True},
    {'reader': 'active lock root record', 'path': 'fixed control/active-lock.json', 'method': ['load', 'Effects.__init__'], 'oneWayReleaseHashBinding': True, 'separateAdmissionBindsRawHash': True},
    {'reader': 'source plan and exact ownership AST', 'path': ['successor-plan9391', 'ownershipcorea1e7'], 'method': ['Verified.document', 'core_scope', 'Effects.run_owned'], 'verifiedConsumedBuffer': True, 'oldMainExecuted': False},
    {'reader': 'root admission, negative and held journals', 'path': 'typed single control members only', 'method': ['Effects.root_document', 'Effects.validate_negative', 'Effects.require_negative_and_held_admission'], 'firstConsumedBufferPinnedThenImmutable': True},
    {'reader': 'separate phase decisions and consumed results', 'path': 'fixed control names plus bounded typed journal patterns', 'method': ['Effects.require_root_phase_decision', 'Effects.require_phase', 'Effects.require_phase_terminal'], 'firstConsumedBufferPinnedThenImmutable': True},
    {'reader': 'fresh source/dist/Helm/modes/aux', 'path': 'exact source-plan scope, fixed dist/Helm roots', 'method': ['Effects.source', 'Effects.tree_files'], 'freshObservationNotCached': True, 'ReplayOnlyOwnLeaseInode': True},
    {'reader': 'inherited six baseline', 'path': 'only plan baselinePath with its exact immutableHelpers SHA', 'method': ['Effects.current', 'Verified.document'], 'verifiedConsumedBuffer': True, 'actualBodyReadInPreparation': False},
    {'reader': 'Python and ps/lsof/git binaries/cache records', 'path': 'four explicit roles/three explicit tools/closed Gradle cache roots', 'method': ['load', 'Effects.utility', 'Effects.fingerprint', 'Effects.current'], 'freshBinaryRecheck': True, 'realOsClientActionsInPreparation': 0},
    {'reader': 'current client/utility/census/kernel/FD/listeners', 'path': 'typed System effects and rooted lock inode', 'method': ['System.utility_identity', 'System.lock_free', 'Effects.table', 'Effects.current'], 'freshObservationNotCached': True, 'libprocCompatibilityUnobserved': True},
    {'reader': 'selected public JUnit and current cohort metadata', 'path': 'one fixed class XML and one new runUUID/cohortUUID cohort.json+guard-tally.json/canonical guard', 'method': ['xml_metadata', 'Effects.selected_metadata', 'Effects.fresh_metadata'], 'noFailureTextOrPrivateSiblingProjection': True, 'noPrivateSiblingBodyRead': True},
    {'reader': 'native stdout/stderr marker projection', 'path': 'new own retained exclusive0600 native sink only', 'method': ['Effects.run_owned'], 'projectedFields': ['fixed task markers', 'BUILD SUCCESSFUL/FAILED booleans'], 'rawTextExport': False},
    {'reader': 'one dedicated public observer output', 'path': 'fixed UNIT/public-observation.json only', 'method': ['Effects.collect_public', 'Effects.public_observation_status'], 'strictClosedCollector': True, 'privateFallback': False},
    {'reader': 'actual evidence QA/root and wrapper/final/permit chain', 'path': 'fixed actual QA review and fixed control record names', 'method': ['Effects.require_actual_evidence_review', 'Effects.read_readiness_and_separate_root_permit', 'Effects.actual_wrapper_tool_result'], 'actualToolResultSeparatelyOwed': True, 'noAutomaticRefresh': True}]
write('runtime-implementation-map.json', {
    'kind': 'COMPLETE_PROSPECTIVE_CALLBACK_AND_READER_CLOSURE_MAP', 'adapterSha256': digest(runtime_raw),
    'allRequiredEffectsImplemented': groups, 'requiredCallbackCount': len(callbacks),
    'cli': {'held-proof': 'operate', 'stage': 'unit_policy.Controller.stage', 'selected': 'unit_policy.Controller.selected', 'collect-public': 'Effects.collect_public', 'restore': 'unit_policy.Controller.restore', 'compile-restored': 'unit_policy.Controller.compile_restored', 'final': 'unit_policy.Controller.final', 'gate': 'unit_policy.Controller.gate', 'postclose': 'unit_policy.Controller.postclose'},
    'methods': methods, 'functions': functions, 'reachedReaders': readers,
    'blockedActualFunctionChecks': results['passed'], 'retainedSemanticChecks': 311,
    'checkNames': [x['name'] for x in results['checks']],
    'originalControllerCollectorObserverSchemaGuardChanged': False,
    'onlyOwnershipCoreAstDelta': 'Popen stdin=subprocess.DEVNULL',
    'coreGlobalsInjected': ['ROOT', 'RUN exclusive sink', 'RECEIPT', 'table', 'capture', 'record exclusive snapshots', 'parent_lock', 'subprocess exact native adapter', 'os.getpid System pid', 'time.sleep System sleep', 'utc System now conversion'],
    'actualSourceNativeOsPrivateObservations': 0, 'futureActualFactsAndAuthorityUnbound': True,
    'requiresIndependentExactCodeAndPrivacyReview': True, 'pendingJavaTransportApiReviewPreserved': True})

original_inputs = json.loads((HERE / 'input-pins.json').read_bytes())
extra_paths = [OLD / 'manifest.json', *[OLD / item['path'] for item in old['files']],
               ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-failed-resource-prep/resume4/failed_resource.py',
               ROOT / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/c8-public-evidence-runtime-adapter-author-task.txt',
               ROOT / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/c8-public-evidence-runtime-adapter-author-context.json']
extra = []
for path in extra_paths:
    raw = path.read_bytes()
    extra.append({'path': str(path.relative_to(ROOT)), 'sha256': digest(raw), 'bytes': len(raw), 'mode': stat.S_IMODE(path.stat().st_mode)})
write('runtime-input-pins.json', {'kind': 'PREPARATION_LINEAGE_ONLY_NO_CURRENT_RUNTIME_FACTS',
    'retainedOriginal27InputRecords': original_inputs['inputs'], 'retainedOriginalCount': 27,
    'original27FreshSourceOrRuntimeReverificationPerformed': False,
    'verifiedPreparationSourceRecords': extra, 'verifiedPreparationSourceRecordCount': len(extra),
    'ownershipCoreAndPlanStaticSourceVerifiedByBlockedTestPreload': [
        {'path': 'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py', 'sha256': 'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'},
        {'path': source_binding['sourcePlanPath'], 'sha256': source_binding['sourcePlanSha256']}],
    'actualBaselineBodyReadStatHash': False, 'actualRuntimeToolLockPrivateSourceCapture': False})
write('runtime-generation-map.json', {
    'kind': 'HONEST_SOURCE_PREPARATION_GENERATION_AND_DELTA',
    'priorManifestSha256': digest(old_raw), 'prior25LiteralMembers': preserved,
    'prior27InputRecordsLiteral': True, 'prior311SemanticCasesLiteralAndRerun': True,
    'handAuthored': ['implementation-decisions.json before code', 'public_observation_unit.py', 'runtime_adapter_checks.py', 'RUNTIME-RECIPE.md'],
    'sourceDerivedGenerated': ['runtime-root-release.template.json and five additional inert binding templates', 'runtime-install-map.json', 'runtime-implementation-map.json', 'runtime-input-pins.json', 'runtime-generation-map.json', 'runtime-review.md', 'RUNTIME-SHA256SUMS', 'manifest.json'],
    'generationEntry': 'seal_runtime_packet.py',
    'reproduce': ['python3 -B pure_checks.py', 'python3 -B runtime_adapter_checks.py', 'python3 -B seal_runtime_packet.py'],
    'commandsRunOnlyInsidePreparedPacket': True, 'newSourceWriterOrNativeRun': False,
    'newActualAuthorityOrClockStarted': False, 'candidateDigestFromPriorPlanNotFreshCapture': True,
    'testCountsSeparate': {'retainedSemantic': 311, 'newBlockedActualFunction': results['passed']},
    'sourceDelta': 'Adds complete explicit effects/CLI beside byte-exact original25; no Java/collector/schema/controller/guard alteration.',
    'knownUnobserved': ['real libproc/lsof compatibility and observation performance', 'actual new hold/source-window/lease/admission', 'selected/native/public/compile/postclose actual results', 'Java transport/API review and full exact adapter architecture/privacy review'],
    'executionReady': False, 'C8SourceIRLifecycleCredit': False})
(HERE / 'runtime-review.md').write_text(
    '# Source author handoff; no QA verdict\n\n'
    'The new concrete adapter implements every callback and CLI from the exact retained boundary. '
    f'Blocked actual-function checks: **{results["passed"]}/{results["passed"]}**. '
    'Retained semantic checks: **311/311**. Real boundary calls: **0**.\n\n'
    'All25 earlier members and27 earlier input declarations remain literal; all original Java, '
    'schema, guard, pure collector/controller and311 semantic cases are preserved. '
    'New source code, inert future bindings, reader/proof/generation maps and recipe are separately identified.\n\n'
    'No actual source, runtime namespace, native compiler/test, lock/kernel census, helper main, '
    'baseline/private body, HTTP/public request, IR clock, release, source-window exception or lifecycle credit '
    'was exercised. Original27 source/runtime input declarations were not presented as fresh observations.\n\n'
    'Exact independent Aria and Quinn adapter/recipe/privacy reviews remain owed, as does root\'s '
    'separate exact Java/HTTP API/privacy review. All actual facts and authority stay unbound. '
    'The runtime template is inert and avoids release/active-pin/self-hash cycles. '
    'Real libproc/lsof compatibility, wrapper descriptor/lock fields, source inode transfer and60-second '
    'feasibility are deliberately unobserved prospective requirements. '
    'The blocked tests are not native execution or admission.\n\n'
    'See RUNTIME-RECIPE.md for the exact separate future phases and irreversible consumption rules. '
    'Any hold remains held; no generic signal/retry/refresh/restore fallback or old no-compile exception exists.\n')

members = sorted(p for p in HERE.iterdir() if p.is_file() and p.name not in ('manifest.json', 'RUNTIME-SHA256SUMS'))
assert len(members) == len(list(HERE.iterdir())) - int((HERE / 'manifest.json').exists()) - int((HERE / 'RUNTIME-SHA256SUMS').exists()), 'UNEXPECTED_DIRECTORY_OR_SPECIAL_ENTRY'
(HERE / 'RUNTIME-SHA256SUMS').write_text(''.join(digest(path.read_bytes()) + '  ' + path.name + '\n' for path in members))
members.append(HERE / 'RUNTIME-SHA256SUMS')
entries = [{'path': path.name, 'sha256': digest(path.read_bytes()), 'bytes': path.stat().st_size,
            'mode': stat.S_IMODE(path.stat().st_mode)} for path in sorted(members)]
write('manifest.json', {'kind': 'SEALED_COMPLETE_PROSPECTIVE_PUBLIC_OBSERVATION_RUNTIME_ADAPTER_REVIEW_ONLY',
    'files': entries, 'memberCount': len(entries), 'priorManifestSha256': digest(old_raw),
    'prior25LiteralMembers': True, 'prior27DeclaredInputsPreserved': True,
    'retainedSemanticChecks': 311, 'blockedActualAdapterFunctionChecks': results['passed'], 'testFailures': 0,
    'realBoundaryCallsDuringTests': 0, 'requiredEffectsCallbacksImplemented': len(callbacks),
    'completeProspectiveRealEffectsAndCliAdapterWritten': True,
    'onlyFutureActualFactsAndAuthoritiesRemainUnbound': True,
    'actualNativeInvocations': 0, 'actualSourceWrites': 0, 'actualPublicRequests': 0,
    'actualRuntimePrivateOrKernelReads': 0, 'actualBaselineBodyReadStatHash': False,
    'sourcePreimageSha256': source_binding['preimageSha256'], 'sourcePostimageSha256': source_binding['postimageSha256'],
    'baseSourceDigest': source_binding['acceptedWholeSourceDigest'], 'candidateVirtualSourceDigest': source_binding['candidateVirtualWholeSourceDigest'],
    'sourceDigestIsPriorPlanDerivedNotCurrentCapture': True, 'sourceWritersNow': [],
    'pendingExactJavaTransportApiPrivacyReview': True, 'requiresIndependentExactAdapterArchitectureAndQaPrivacyReview': True,
    'executionReady': False, 'newRootSourceGateExceptionIssued': False, 'actualRuntimeReleaseCreated': False,
    'IRClockStarted': False, 'C8MainSourceIRLaneLifecycleCredit': False,
    'primarySuccessorRecipe': 'RUNTIME-RECIPE.md',
    'sealRule': 'Exact listed hashes/bytes/modes/membership. Original SHA256SUMS retained literal. RUNTIME-SHA256SUMS excludes itself and manifest; manifest does not self-hash.'})
print(json.dumps({'status': 'SEALED_SOURCE_ONLY', 'members': len(entries), 'manifestSha256': digest((HERE / 'manifest.json').read_bytes()),
                  'adapterSha256': digest(runtime_raw), 'blockedActualFunctionChecks': results['passed'], 'retainedSemanticChecks': 311,
                  'actualActionsOrAuthorities': 0, 'executionReady': False}))
