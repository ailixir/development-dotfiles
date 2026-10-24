"""Seal source-only packet after exact guarded proofs. No runtime/baseline/tool actions.

Do not redirect this sealer's stdout into the directory being sealed. Source manifest
excludes itself and future actual root controls; every existing payload is listed.
"""
import ast
import hashlib
import json
from pathlib import Path
import stat
HERE=Path(__file__).absolute().parent
ROOT=next(p for p in HERE.parents if p.name=='ui-studio')
assert HERE==ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume1'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def put(n,v):(HERE/n).write_text(json.dumps(v,indent=2)+'\n')
def row(path):
    raw=path.read_bytes();st=path.lstat();assert stat.S_ISREG(st.st_mode)
    return dict(path=path.name,sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(st.st_mode))
contract=json.loads((HERE/'contract.json').read_bytes())
proofs={n:json.loads((HERE/n).read_bytes()) for n in ('check-results.json','extra-check-results.json','optimized-bootstrap-results.json')}
for name,result in proofs.items():
    assert result['failed']==0 and result['realBoundaryCalls']==[] and result['passed']==len(result['checks'])
    assert len({r['name'] for r in result['checks']})==result['passed'] and all(r['pass'] is True for r in result['checks'])
    for filename,h in result.get('sourcePins',result.get('consumedProductionPins',{})).items():assert sha((HERE/filename).read_bytes())==h,(name,filename)
assert proofs['optimized-bootstrap-results.json']['guardSha256']==sha((HERE/'guard-failed-red.bash').read_bytes())
assert proofs['extra-check-results.json']['fixtureHarnessSha256']==sha((HERE/'checks.py').read_bytes())
assert any(r['name']=='INTEGRATED_SEPARATE_OUTER_POSTCLOSE_ZERO' for r in proofs['check-results.json']['checks'])
assert any(r['name']=='ACTUAL_PROTOCOL_GATE_stale-after' for r in proofs['check-results.json']['checks'])
counts={n:r['passed'] for n,r in proofs.items()};total=sum(counts.values())
# Exact original input packages remain immutable. This verifies PREPARED files only.
pins=json.loads((HERE/'preparation-input-pins.json').read_bytes())
for r in pins['preparedInputs']:
    path=ROOT/r['path'];raw=path.read_bytes();assert len(raw)==r['bytes'] and sha(raw)==r['sha256'] and stat.S_IMODE(path.stat().st_mode)==r['mode']
extra=[]
for name in ['.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gateway80-red01-failed-resource-develop-task.txt','.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gateway80-red01-failed-resource-develop-context.json',
 'docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-failed-resource-prep/resume4/failed_resource.py',
 'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py']:
    path=ROOT/name;r=row(path);r['path']=name;extra.append(r)
assert next(r for r in extra if r['path'].endswith('failed_resource.py'))['sha256']=='b8868e78d9ac1b7de6aa200a2a3497e9b3705bbbc05018e41b09349fcf305e50'
put('input-pins.json',dict(kind='SOURCE_ONLY_VERIFIED_PREPARED_INPUTS_NO_CURRENT_RUNTIME_FACTS',preparedInputs=pins['preparedInputs'],additionalPreparedInputs=extra,
 actualOldEOrWOrNOrBaselinePrivateReadStatHash=False,source06ManifestSha256='e2e3340b48628c76884d6b243dd69134052e8e2ff3d25f5ab09d94f4e9150585',
 rootPreparationOnlySha256='93827b105510d7720d467930b157e06d0c21cc45ffebc3a0d02a8a4cc420a695',actualOperationalPermission=False))
functions={};calls=[]
for filename in ('entry.py','failed_gateway.py','custody.py','protocol.py'):
    tree=ast.parse((HERE/filename).read_bytes())
    assert not any(isinstance(n,ast.Assert) for n in ast.walk(tree)),filename
    for node in tree.body:
        if isinstance(node,ast.FunctionDef):functions[filename+':'+node.name]=dict(file=filename,line=node.lineno,endLine=node.end_lineno)
        if isinstance(node,ast.ClassDef):
            for child in node.body:
                if isinstance(child,ast.FunctionDef):functions[filename+':'+node.name+'.'+child.name]=dict(file=filename,line=child.lineno,endLine=child.end_lineno)
    for node in ast.walk(tree):
        if isinstance(node,ast.Call):
            name=ast.unparse(node.func)
            if name in ('exec','compile','json.loads','P.decode','ast.parse') or name.endswith(('.bound','.document','.local','.root_read','.read','.read_verified','.current_verified_bytes','.load_driver','.package_buffers')):
                calls.append(dict(file=filename,line=node.lineno,callee=name))
guard=(HERE/'guard-failed-red.bash').read_bytes();body=guard.decode().split("-B -c '",1)[1].split("' \"$GATEWAY_FAILED_ENTRY\"",1)[0]
assert not any(isinstance(n,ast.Assert) for n in ast.walk(ast.parse(body)))
bind=(HERE/'bind-command.template.bash').read_bytes();assert bind.split(b"<<'GATEWAY_FAILED_REVIEWED_SOURCE'\n",1)[1].removesuffix(b'GATEWAY_FAILED_REVIEWED_SOURCE\n')==guard
classes=[
 dict(input='root authority/installed6 code',reader='guard verified same entry bytes -> entry.root_read/execute',authorization='external readonly ENTRY_SHA/AUTH_SHA, then explicit root codePins; no runtime assert'),
 dict(input='new external root controls',reader='run -> Unit.document/local/bound',authorization='explicit CLI SHA BEFORE decode/path indirection, root-derived complete inputPins map, conflicting pins refused'),
 dict(input='own exclusive generated records',reader='Unit.write -> owned -> Unit.local',authorization='only current same-qualified observer own writes register exact raw hashes; future invocation requires independent root pins'),
 dict(input='original source06 package and scope/contracts/banks',reader='verified-inputs.verified/package_buffers/load_driver',authorization='exact47db leaf/e2e manifest, all137 raw buffers/bytes/modes verified before compile/JSON/AST; old E remains d.E'),
 dict(input='old2263 evidence including H/release/prepare/candidate',reader='contract oldMembers -> check_members + seeded d.IMMUTABLE_EXPECTED',authorization='frozen design-derived expected old-index map, physical hash/bytes/mode bracketing, same verified consumed immutable JSON buffers'),
 dict(input='original CORE source/inherited6',reader='bound CORE -> source06 core/boundary baseline-reader bridge',authorization='exact COREa1e7 before AST; future root-bound baselinefd39 same verified raw buffer; no baseline body/stat/hash in preparation'),
 dict(input='original candidate30/current Node/comm/cwd',reader='source06.worker_candidates + Unit.table/observe',authorization='originalccfc immutable baseline; complete current snapshot/binary/role/cwd joins, every-census73492/same-start rejection; no historical repair'),
 dict(input='current source1808/main506/dist238/Helm22/aux/dependencies',reader='source06.guards/workspace_guard/chart_guard',authorization='unchanged exact reviewed functions; read-only fresh observations before/after, copied inputs/inodes original; no tool version/native commands'),
 dict(input='current client/Python/utility/census/lock/listener',reader='Unit.client_identity/capture/table/clients + source06.held/strict_lock_fields + System.lock_free',authorization='configured BIN vs reportedBIN/mappedAPP roles, separate root requested-launch trace, complete waited/UNKNOWN journals and exact probe, FD/name/devino/kernel; no subtree/PID-only exemption'),
 dict(input='parent readonly normal exit/newguard',reader='require_admission root attestation',authorization='separate ROOT declare/readonly/status/operator evidence, never claimed child OS read of parent nonexported function contents'),
 dict(input='whole failedW/original22/frozen raw archives',reader='bounded_inventory/copy_tree/check_archives + source06 low-level safe copy',authorization='caps before reading, exact ownedW, dependencylink ENTRY only, rawbytes never parsed, source/fullW/chart/raw equality repeatedly; no E-recursive archive'),
 dict(input='actual QA/readiness/permit/wrapper/postclose',reader='require_actual_archive_review/operate',authorization='exact externally root-pinned roles/statuses/adoption/QA/attempt/result/permit graph,60s both sides/nonreverse/one-shot, wrapper1 and outerpostclose0 owed')]
put('interpretation-map.json',dict(functions=functions,reachedInterpretationSites=calls,reachedInterpretationSiteCount=len(calls),inputClasses=classes,inputClassCount=len(classes),
 source06ReusedFunctions=['load_driver','package_buffers','held','strict_lock_fields','core','guards','workspace_guard','chart_guard','inventory dependency guard','safe_new_copy','safe_mkdir','safe_archive_tree','boundary','worker_candidates'],
 forbiddenSource06EntriesNeverCalled=['main','run_native','install_fixed','make_copy','archive normal','produce_final normal','close_check normal','entry normal'],
 source04PatternsOnly=['retained-FD Custody','separate Python role/current client fingerprint','anchored census/utility journal','pre/post freshness'],
 actualFunctionProofCounts=counts,totalChecks=total,codeHashNotSelfAuthorization=True,crossReadMetadataMemo='continuity only AFTER external SHA/custody authorization'))
put('generation-map.json',dict(kind='HONEST_SMALL_NEW_SUBJECT_SOURCE_PACKET',
 handAuthored=['failed_gateway.py','custody.py','protocol.py','entry.py','guard-failed-red.bash','checks.py','extra_checks.py','optimized_bootstrap_checks.py','RECIPE.md'],
 generated=['contract.json projected from exact design disposition, removing2245 duplicate per-child narrative rows only','write_metadata.py outputs inert templates/install/control metadata','bind-command.template.bash exact literal guard','input-pins.json','interpretation-map.json','generation-map.json','author-history.json','review.md','SHA256SUMS','manifest.json'],
 runtimeInstalledPayloads=contract['installedCode'],originalOld2263OutsidePrepModified=False,source06All137OutsidePrepModified=False,source03Prior96Modified=False,
 runtimeSafetyChecksUseNonremovableIfRaise=True,optimized0And1PairedDenials=True,
 syntheticFixtureDeclarations=['expected fixture SHA values are synthetic, actual host preimages are NOT guessed/read','actual source06 Python and bank bytes retained; synthetic source-guards/package expected hash explicit test substitution',
 'fake source inventory1808/main506/dist238; six and30 synthetic identity bodies only','original frozen2253 numeric union/seven PID-start pairs/73492 policy retained','all syscall/filesystem/fcntl/clock/process boundaries fake under persistent deny audit'],
 fullProtocol='actual run dispatcher -> constructor -> negative1/held0/archive0/final0/gate0 for wrapper1/postclose0 on fake machine; no safety callback stubs',
 rootAuthorityAndRuntimeStillUnbound=True,actualNativeJavaNodeHelmCompilerRuntimeOrBaselineActions=0,
 knownUnobserved=['actualcurrentholder/source/dependency/inherited/candidate facts','actualfailedW inventory/size and archive','actualOS tool/custody compatibility and timing','actual60s positive gate feasibility','actualindependent code/QA/root exception/installation/guard admission/final/permit/wrapper/postclose'],
 tests=counts,totalChecks=total,reproduce=['python3 -B checks.py','python3 -B extra_checks.py','python3 -B optimized_bootstrap_checks.py','python3 -B write_metadata.py','python3 -B seal.py'],
 noSignalsCleanupRetrySourceWindowNativeOrCredit=True))
# Keep all author failures/earlier successes as immutable history; no failed artifact deleted.
history=[]
for path in sorted(HERE.glob('author-*.stderr')):
    stdout=path.with_suffix('.stdout');stderr=path.read_bytes();out=stdout.read_bytes() if stdout.exists() else b''
    history.append(dict(stem=path.stem,stderrBytes=len(stderr),stderrSha256=sha(stderr),stdoutSha256=sha(out),
        classification='AUTHOR_CHECK_FAILED_PRESERVED' if stderr else 'AUTHOR_CHECK_SUCCESS_PRESERVED_NOT_AUTOMATIC_CURRENT_SOURCE_PROOF'))
put('author-history.json',dict(kind='SOURCE_PREPARATION_HISTORY_ONLY',records=history,
 concreteCorrections=['fake initial inventory added actual source06 tmp/cache roots','fake directory creation stopped resetting existing0700 modes','required stdlib preloaded before unchanged deny audit',
 'fake API gained OS flag constants','completed observer checked stored proof instead of calling closed descriptors','timeout adverse harness catches actual TimeoutExpired without disabling audit',
 'root-requested optimized integrity fixed removable asserts to explicit require; paired optimize0/1 exactSHA/wrongSHA checks retained',
 'declared current concerns fixed: strict utility/client history, every-census73492/seven pairs, source-mode/metadata continuity, explicit final attempt chain, parent anchor/newN-only root pins'],
 currentExactProofs=list(proofs),actualRuntimeOrNativeAttempts=0,denyAuditDisabled=False))
(HERE/'review.md').write_text(f'''# Source author handoff; no QA or operating verdict

Complete inactive qualified failed-red resource packet. Current guarded checks: **{total}**
({counts}). Full actual run/state-machine/source06 fake protocol passes, including whole
failedW/original22/raw archives, final0, gate0 restricted to wrapper1 and separate postclose0.
Freshness before/after, caps, identities, readonly-root attestations, utility UNKNOWN,
source/dependency/archive/custody and optimized bootstrap denials are checked. Real boundary
calls0. See RECIPE.md, interpretation-map.json and generation-map.json.

All actual current host/source/archive/timing facts and independent exact code/QA/root
exception/install/admission/actual archive QA/final/permit/wrapper/postclose remain owed.
This packet issues no actual permission and creates/reads/stats no actual N/W/runtime or
baseline body. Old native1/collector1/HOLD/acceptedfalse/historical UNKNOWN remain exact.
Normal success HARD HOLD, no native/compile/retry/source writer/cleanup or credit. Prior
source03's96-member seal is unchanged. Real utility behavior and60s feasibility are unproved.
''')
files=sorted(p for p in HERE.iterdir() if p.name not in ('manifest.json','SHA256SUMS'))
assert all(p.is_file() and not p.is_symlink() for p in files)
(HERE/'SHA256SUMS').write_text(''.join(sha(p.read_bytes())+'  '+p.name+'\n' for p in files))
files.append(HERE/'SHA256SUMS');files.sort();entries=[row(p) for p in files]
put('manifest.json',dict(kind='SEALED_INACTIVE_GATEWAY_FAILED_RED_RESOURCE_ONLY_SOURCE',files=entries,memberCount=len(entries),
 source06ManifestSha256='e2e3340b48628c76884d6b243dd69134052e8e2ff3d25f5ab09d94f4e9150585',
 designManifestSha256='6678da2aee002f8fc4e9d923a3166a2e72e8ba9c4715bc27c6ea3137e0ac52cb',actualFailedQaManifestSha256='a2c7f8b85c25d7b9ef1244e7942c99139bdfc9f204fa555a1e830d6a41f6cdba',
 rootPreparationOnlySha256='93827b105510d7720d467930b157e06d0c21cc45ffebc3a0d02a8a4cc420a695',
 installedPayloadCount=6,oldFrozenMembers=2263,oldWaitedUtilities=2245,finiteNumericUnion=2253,sevenHistoricalPairs=7,startlessNumber=73492,
 completeRealEffectsAndCliWritten=True,cli=['negative','held-proof','archive','final','gate','postclose'],expectedWrapperExit=1,
 exactGuardedChecks=counts,totalChecksPassed=total,testFailures=0,realBoundaryCalls=0,
 runtimeAssertReliance=False,optimizedPairedIntegrityProof=True,reachedInterpretationSiteCount=len(calls),inputClassCount=len(classes),
 actualCurrentRuntimeWNamespaceToolKernelOrBaselineActions=0,actualNativeSourceCompilerOrCleanupActions=0,
 exactIndependentSourceArchitectureQaAndRootOperationalAdoptionOwed=True,executionReady=False,normalSuccessRoute='HARD_HOLD',
 historicalGapsRepaired=False,IRClockStarted=False,C8MainSourceGatewaySuccessLaneLifecycleCredit=False,manifestSelfExcluded=True))
print(json.dumps(dict(status='SEALED_SOURCE_ONLY',manifestSha256=sha((HERE/'manifest.json').read_bytes()),payloadMembers=len(entries),checks=total,
 exactProofCounts=counts,interpretationSites=len(calls),inputClasses=len(classes),actualActions=0,executionReady=False)))
