"""Prepare only inactive06 metadata from named public prepared sources; no runtime APIs."""
import ast
import hashlib
import json
from pathlib import Path

HERE=Path(__file__).absolute().parent
assert HERE.name=='resume6' and HERE.parent.name=='c8-check01-public-evidence-prep'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def put(name,value):(HERE/name).write_text(json.dumps(value,indent=2)+'\n')
def get(name):return json.loads((HERE/name).read_bytes())
tree=ast.parse((HERE/'public_observation_unit.py').read_bytes())
artifacts=ast.literal_eval(next(n.value for n in tree.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id=='ARTIFACTS'))
source=get('source-binding.json')
source.update(currentSourceGeneration=6,JavaFragmentAndFullPostimageLiteralSource03=True,
    actualCurrentSharedSourceReverificationPerformed=False,
    currentSharedSourceUnchanged='NO_WRITES_BY_THIS_PREPARATION; no fresh source observation asserted')
put('source-binding.json',source)
policy=get('public-policy.json');policy.update(sourceGeneration=6,controlInterpretation='INDEPENDENT_PER_ENTRY_ROOT_CONTROL_PINS_BEFORE_FIRST_PARSE',
    pendingSelected='EXACT_CLAIMED_AUTHORIZED_CLIENT_BEFORE_ANY_SETUP_ONLY',unresolvedCustody='RETAIN_ACTUAL_EFFECTS_THREAD_AUTHORITY_OUTPUT_CONTROL_AND_FDS')
put('public-policy.json',policy)
a=get('runtime-root-release.template.json')
a.update(postimageSha256=source['postimageSha256'],candidateSourceDigest=source['candidateVirtualWholeSourceDigest'],
   artifactPins={n:sha((HERE/n).read_bytes()) for n in sorted(artifacts)},
   entryControlPinPolicy='Every entry requires separate root/operator entry-NNNN-pins.json explicit raw SHA; exact existing JSON closure, no first-seen self-pin',
   sourceGeneration=6,actualReleased=False,rootAuthorized=False)
a['adapterSha256']=a['artifactPins']['public_observation_unit.py'];a['guardSha256']=a['artifactPins']['guard-public-observe.bash']
a['collectorProvenance'].update(observerPostimageSha256=a['postimageSha256'],schemaSha256=a['artifactPins']['public-observation.schema.json'],collectorSha256=a['artifactPins']['public_contract.py'])
assert len(artifacts)==12 and a['releaseSha256'] is None and a['activeLockSha256'] is None
put('runtime-root-release.template.json',a)
put('root-release.template.json',dict(a,templateAliasOf='runtime-root-release.template.json',aliasIsNotRuntimeAuthority=True))
put('root-close-permit.template.json',dict(get('runtime-close-permit.template.json'),templateAliasOf='runtime-close-permit.template.json',aliasIsNotRuntimeAuthority=True))
phase=get('phase-commands.json');phase.update(source=source,sourceGeneration=6,actualRuntimeEffectsAdapterWritten=True,
    actualRuntimeEffectsAdapterInstalledOrReleased=False,entryApi=dict(argv=['MODE','RELEASE_SHA','entry-NNNN-pins.json','ENTRY_RAW_SHA','OPTIONAL_LITERAL_STATUS'],
       allModesRequireIndependentEntryPins=True,allModesRequireVerifiedCommonAdapterLoader=True,
       guardedExitArgv=['EXPLICIT_STATUS','entry-NNNN-pins.json','ENTRY_RAW_SHA']),
    selectedPreflight='AUTHORIZED_PENDING_SETUP before any relay/native setup; actual claim and external root decision exact; later states strict')
phase.pop('actualRuntimeEffectsAdapter',None)
put('phase-commands.json',phase)
boundary=get('runtime-effects-boundary.json');boundary.update(kind='COMPLETE_SOURCE06_PROSPECTIVE_EFFECTS_IMPLEMENTED',sourceGeneration=6,
    allCallbacksUseIndependentExistingControlPins=True,actualRuntimeInstalledOrReleased=False)
put('runtime-effects-boundary.json',boundary)
put('runtime-install-map.json',dict(kind='INERT_SOURCE06_FIXED_CONTROL_INSTALLATION',unitMode=0o700,controlMode=0o700,
    members=[dict(source=n,destination='control/'+n,sha256=h,sourceMode=0o644,runtimeMode=0o600) for n,h in a['artifactPins'].items()],
    copyOnlyListed12Payloads=True,doNotInstallTestsTemplatesOrHarness=True,
    perEntryControls='Root-created immutable entry-NNNN-pins.json plus independently supplied operator raw SHA; never copy unbound templates',
    commonAdapterLoader=dict(preparedSource='entry-loader.py.txt',installation='NOT_AN_EXTRA_INSTALLED_MEMBER; exact reviewed operator literal, also readonly guard literal',
        sha256=sha((HERE/'entry-loader.py.txt').read_bytes())),
    futureExclusiveShortNamespace='/private/tmp/obs011-pub-observe01',futureSocket='/private/tmp/obs011-pub-observe01/r.sock',
    actualShortNamespaceAuthorizedOrObserved=False))
print(json.dumps(dict(status='SOURCE06_METADATA_PREPARED',artifacts=len(artifacts),postimageSha256=source['postimageSha256'],
 candidateVirtualDigest=source['candidateVirtualWholeSourceDigest'],actualActions=0)))
