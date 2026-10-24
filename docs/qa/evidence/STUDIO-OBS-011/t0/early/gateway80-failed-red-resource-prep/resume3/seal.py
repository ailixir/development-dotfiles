"""Seal only inactive SOURCE03 after exact current guarded evidence; no target IO.

Stdout must remain outside the sealed directory. Runtime copy exceptions are NOT
re-read here: exact frozen7 verification is attributed to tool b305a1 and design pins.
"""
import ast,hashlib,json,stat
from pathlib import Path
HERE=Path(__file__).absolute().parent
ROOT=next(p for p in HERE.parents if p.name=='ui-studio')
assert HERE==ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume3'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def put(n,v):(HERE/n).write_text(json.dumps(v,indent=2)+'\n')
def verify(path,row):
    st=path.lstat();raw=path.read_bytes();mode=int(row['mode'],8) if type(row['mode'])is str else row['mode']
    assert stat.S_ISREG(st.st_mode) and not path.is_symlink() and len(raw)==row['bytes'] and sha(raw)==row['sha256'] and stat.S_IMODE(st.st_mode)==mode
    return raw
k=json.loads((HERE/'contract.json').read_bytes())
proof_names=('check-results.json','extra-check-results.json','optimized-bootstrap-results.json','code02-check-results.json','source03-check-results.json')
proofs={name:json.loads((HERE/name).read_bytes()) for name in proof_names}
for name,v in proofs.items():
    assert v['failed']==0 and v['realBoundaryCalls']==[] and v['passed']==len(v['checks']) and len({r['name'] for r in v['checks']})==v['passed'] and all(r['pass'] is True for r in v['checks'])
    for f,h in v.get('sourcePins',v.get('consumedProductionPins',{})).items():assert sha((HERE/f).read_bytes())==h,(name,f)
    if 'fixtureHarnessSha256' in v:assert v['fixtureHarnessSha256']==sha((HERE/'checks.py').read_bytes())
assert proofs['optimized-bootstrap-results.json']['guardSha256']==sha((HERE/'guard-failed-red.bash').read_bytes())
counts={name:v['passed'] for name,v in proofs.items()};assert list(counts.values())==[89,19,6,83,72];total=sum(counts.values())
old=HERE.parent/'resume2';old_manifest=(old/'manifest.json').read_bytes();assert sha(old_manifest)=='aaeb967ecc7eb279c70fb50e69218898295094b96fea23f7fdf82c99ce224558'
for row in json.loads(old_manifest)['files']:verify(old/row['path'],row)
assert (HERE/'source02-manifest.json').read_bytes()==old_manifest
preserved=[]
for name in proof_names[:4]:
    previous=json.loads((HERE/('source02-'+name)).read_bytes());assert [r['name'] for r in previous['checks']]==[r['name'] for r in proofs[name]['checks']],name
    preserved.append(dict(group=name,semanticIds=[r['name'] for r in proofs[name]['checks']],count=proofs[name]['passed'],priorResultSha256=sha((HERE/('source02-'+name)).read_bytes()),currentResultSha256=sha((HERE/name).read_bytes())))
assert sum(r['count'] for r in preserved)==197
put('case-preservation.json',dict(retainedSemanticIds=197,groups=preserved,newFocusedControls=72,currentExecutedControls=total,reusedAsCurrentExecution=0,
 fixtureAdaptations=['new N02 and exact typed immutable prior N01 seven synthetic members; oldE2265 total','historical2253 subset retained; union2255 and three numeric-only absences','synthetic contract/role/binary/source/review expected SHA values recomputed honestly; source03 review subject/code graph is real shape','new setup external control and helpers are explicitly synthetic, not new actual history;2255 remains immutable base','new readonly03 names/caps and required external setup SHA; six phase outcomes preserved','fake Machine delegates actual System.read/custody to fake OS API, including primary/cleanup preservation','factory/installer/guard/CLI compile in same fake namespace; only concrete System/effect provider intercepted','all original bank/source06 bytes are real prepared source; fake source inventory/baseline bodies and current preimages are synthetic'],
 oldCaseNamesRetainHistoricalVocabulary=True,noOsOrBashCompatibilityInference=True))
# Exact design/root QA bindings and named prepared sources only.
input_rows=[]
def bind(path,expected):
    raw=path.read_bytes();assert sha(raw)==expected
    input_rows.append(dict(path=str(path.relative_to(ROOT)),sha256=expected,bytes=len(raw),mode=stat.S_IMODE(path.stat().st_mode)))
    return raw
D=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gateway-failed-prequalification-disposition-design'
Q=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway-failed-prequalification-disposition-design-review'
for directory,h in ((D,'eaddcae2d795989a6585d636718d8c5f67340d79bde824803d16f8a28704f06c'),(Q,'6a5fc57b2f89b879f5f12d3760a01d1b5bf9f54d62a297268644427e2536fa25')):
    v=json.loads(bind(directory/'manifest.json',h))
    for row in v.get('files',v.get('members',[])):
        raw=verify(directory/row['path'],row);input_rows.append(dict(path=str((directory/row['path']).relative_to(ROOT)),sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE((directory/row['path']).stat().st_mode)))
for rel,h in [('resume2-gateway80-failed-resource-code03-preparation-root-scope.json','95ad5dd326b114c6aac04e62202292a7ab2980e267388d7f5a9bf4d66673d554'),('resume2-gateway80-failed-prequalification-design-qa-root-adoption.json','e26a774ea5d70a3bb5f03a21b60ce739832e47a08a5ec606147863fd779caac7'),('resume2-gateway80-failed-resource-code02-negative-failed-index.json','8b1f8f9be540788d05b66923fd7fc60c7d9df19f254868dacde87d0819db8761'),('resume2-gateway80-failed-resource-code02-failure-interpretation-correction.json','541f914cd77cd9a5c0571bc42d7d65dd5e4042883a61dbd4805c10c54aaa9079')]:bind(ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'/rel,h)
assert sha((HERE/'design-qa-root-adoption.json').read_bytes())=='e26a774ea5d70a3bb5f03a21b60ce739832e47a08a5ec606147863fd779caac7'
assert sha((HERE/'design-input-pins.json').read_bytes())=='88876e3ef0165005b65ccc2f5e3b0c44311eefe77b0b83957fe656ca9e6f0268'
pins=json.loads((HERE/'design-input-pins.json').read_bytes());assert len(pins['files'])==293
public=0;frozen=[]
for row in pins['files']:
    if '/runtime/' in row['path']:
        assert row.get('runtimeException')=='ONLY_THIS_EXACT_FROZEN_COPY';frozen.append(row);continue
    verify(Path(row['path']),row);public+=1
assert public==286 and len(frozen)==7
for suffix in ('task.txt','context.json'):
    path=ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'/('gateway-failed-resource-source03-preparation-'+suffix);raw=path.read_bytes();input_rows.append(dict(path=str(path.relative_to(ROOT)),sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(path.stat().st_mode)))
put('input-pins.json',dict(kind='EXACT_SOURCE03_PREPARED_BINDINGS',inputs=input_rows,designDeclaredInputs=293,publicInputRowsReverified=286,
 approvedFrozenSevenVerification=dict(tool='b305a1',uniqueCopies=7,rows=frozen,currentDirectoryReobserved=False,sealerReread=False),
 source02All116Unchanged=True,actualResourceQualification=False,filenameEnumerationLimitation='source-preparation-limitations.json'))
# APIs/callback/interpretation spans from exact current code.
runtime=('entry.py','failed_gateway.py','custody.py','protocol.py','factory.py','installer.py','install-cli.py','shell-buffer-verify.py','buffer-bootstrap-inline.py','buffer-verifier-inline.py')
functions={};calls=[]
for name in runtime:
    raw=(HERE/name).read_bytes();tree=ast.parse(raw);assert not any(isinstance(n,ast.Assert) for n in ast.walk(tree)),name
    for node in tree.body:
        if isinstance(node,ast.FunctionDef):functions[name+':'+node.name]=dict(file=name,line=node.lineno,endLine=node.end_lineno,signature=ast.unparse(node.args))
        if isinstance(node,ast.ClassDef):
            for fn in node.body:
                if isinstance(fn,ast.FunctionDef):functions[name+':'+node.name+'.'+fn.name]=dict(file=name,line=fn.lineno,endLine=fn.end_lineno,signature=ast.unparse(fn.args))
    for node in ast.walk(tree):
        if isinstance(node,ast.Call):
            callee=ast.unparse(node.func)
            if callee in ('exec','compile','json.loads','P.decode','ast.parse') or callee.endswith(('.bound','.local','.document','.read','.root_read','.bootstrap_read','.copy_from','.preflight','.finalize','.source_call','.acquire','.install','.verify','.require_setup')):calls.append(dict(file=name,line=node.lineno,callee=callee))
block=(HERE/'protocol.py').read_text().split('STAGES=',1)[1].split('# END SINGLE OUTER FAILURE SINK',1)[0];block='STAGES='+block
for name in ('guard-failed-red.bash','install-loader.bash','install-cli.py'):assert block in (HERE/name).read_text(),name
assert (HERE/'binding-functions.bash').read_bytes()==(HERE/'guard-failed-red.bash').read_bytes()
for name in ('guard-failed-red.bash','install-loader.bash'):
    body=(HERE/name).read_text().split("-B -c '",1)[1].split("' ",1)[0];assert "'" not in body;assert not any(isinstance(n,ast.Assert) for n in ast.walk(ast.parse(body)))
classes=['externally pinned actual buffer/bootstrap','root scope/source manifest/review raw buffers','exact same-buffer installed6/code/control records','complete seven-role physical witnesses','pure pending draft and actual-FD-only finalize','old2263 regulars plus typed priorN01 seven/activeN02','source06 leaf/package/contracts and CORE definitions','historical2255 and dynamic setup helper set union','current client/utility/census/source/resource/archive facts','root parent readonly/setup/launcher attestations','full W/original22/helper/raw4 bounded archive','closed future namespace/stage/literal primary-cleanup ownership','actual archive QA/final/permit/wrapper/postclose graph']
put('api-map.json',dict(functions=functions,installedRuntimePayloads=k['installedCode'],outsideInstalledNamespaceReviewedHelpers=['factory.py','installer.py','install-cli.py','install-loader.bash','shell-buffer-verify.py','buffer-bootstrap-inline.py','buffer-verifier-inline.py','binding-wrapper.bash','binding-functions.bash'],
 cli=dict(installer='install-loader.bash -> same verified install-cli.execute(scope_path, external_scope_sha, verified_self_sha) -> derived maps -> acquire -> factory.preflight -> exclusive oldE-FD mkdir -> same-draft finalize -> exact6/auth writes',runtime='six modes, every mode has external control SHA; negative gets readonly separately bound setup SHA',setup='root-setup-ownership.json external first-read SHA -> require_setup -> numeric absence every current table and finite join'),
 callbacks=dict(System='actual System.read/custody delegated to explicit fake API in tests; other concrete effect providers fake',Popen='actual capture owns child before PID validation',eval='only actual readonly-buffer verifier executed under fakes; actual Bash compatibility unproved'),
 noSelfFutureHashCycle=True,codeRootOrHelperMapsHandAssembled=False))
put('interpretation-map.json',dict(functions=functions,reachedInterpretationSites=calls,reachedInterpretationSiteCount=len(calls),inputClasses=classes,inputClassCount=len(classes),
 source06ForbiddenEntries=['main','run_native','make_copy','install_fixed','safe_new_copy','safe_archive_tree','normal final/archive/close'],
 reasonRegistry='source-reason-registry.json',firstReadIntegrity='root raw SHA and descriptor metadata checked before JSON/compile, exact consumed buffers; own exclusive outputs are separate trust',actualCurrentFactsObserved=False))
put('ownership-map.json',dict(historicalBase=2255,numericOnlyAbsent=[73492,86096,96486],oldSevenPairsRetained=True,priorN01=k['priorNamespaces'],
 dynamicSetup='actual externally pinned root helper rows, separate wait0, null missing start/FP; all numbers must be absent in every table and both finite joins; base never edited',
 immediateAcquisition='Custody.OWNED/System.resources before constructor/open validation; FD ledger before fstat; Popen reference before pid validation',
 partialFailure='primary/cleanup separate closed future records; retain unknown close/child refs with no bare FD retry, signals or cleanup',
 installer='outside-E pending/attempt/result/failure only; typed prior and old2263 verified before and after; partial N02 held for exact disposition',
 noPrequalificationNObservationFacts=True,rootControlsAreActorInputs=True,oldFirstHold='UNKNOWN_NOT_RETROACTIVELY_ESTABLISHED',descriptor16='PROVISIONAL_NOT_POSTEXIT_LEAK_PROOF'))
history=[]
for path in sorted(HERE.glob('author-*.stderr')):
    raw=path.read_bytes();out=path.with_suffix('.stdout');history.append(dict(path=path.name,sha256=sha(raw),bytes=len(raw),stdoutSha256=sha(out.read_bytes()) if out.is_file() else None,classification='AUTHOR_ATTEMPT_FAILED_PRESERVED' if raw else 'AUTHOR_ATTEMPT_COMPLETED_NOT_AUTOMATIC_CURRENT_SOURCE_PROOF'))
put('author-history.json',dict(attempts=history,currentProofs=counts,oldProofsAttributedToSource02=True,filenameEnumerationLimitation='source-preparation-limitations.json',actualSubjectActions=0))
put('generation-map.json',dict(sourceGeneration=3,designSavedBeforeCode=True,designQaAdoptedBeforeSeal=True,
 generators=['write_source03.py: literal closed registry/common sink/guard/install-loader/inline embeds','write_metadata.py: inert root descriptors/controls/install/API input shape','seal.py: exact proof/pin/API/ownership/interpretation/history/checksum seal'],
 syntheticOnly=['all current filesystem/OS/process/fcntl/clock boundaries are fake in same compiled namespace under persistent deny audit','source/current expected hashes and protected baseline bodies are explicitly synthetic; real source06 bank/definitions and original history retained','oldCaseLabels may mention2253; old set retained and explicit new union2255 is checked','new setup/installer PID rows are fake fixture values, not actual observations'],
 counts=counts,totalCurrentExecutedChecks=total,retainedExactSemanticIds=197,newFocused=72,
 actualSourceAriaQaRootExceptionInstallBindPhasesAndClosureOwed=True,actualBashCompatibilityOr60sFeasibilityProved=False,budgetUsd=500,aggregateSpend='UNKNOWN'))
(HERE/'review.md').write_text(f'''# SOURCE03 author handoff — no operating or QA verdict

Complete inactive source03 packet: {total} current guarded controls ({counts}). All197
source02 semantic IDs are preserved and replayed;72 focused cases cover the reviewed
factory/installer, N01/N02/history, closed future reasons/cleanup and actual-buffer/helper
controls. Full actual fake six-mode dispatch passes. All reached effects are fake under
persistent deny audit; actual Bash/platform compatibility and60s feasibility are unproved.

Use RECIPE03.md and installer-input-shape.json. Root supplies small independently pinned
trust roots/policy/directory facts; the reviewed installer derives maps and independently
acquires all7 modes/hashes. N02 identity is finalized only after actual exclusive creation.
Setup helper records are separately rooted controls; historical base2255 is immutable.
All actual gates remain owed. Old first Hold stays UNKNOWN and descriptor16 is provisional.
The exact initial overbroad filename discovery and approved frozen7 exception are recorded
in source-preparation-limitations.json; no enumerated runtime name became evidence/input.
No diagnostic/cleanup/retry/source/native/C8/main/IR/lifecycle authority is issued.
''')
files=sorted(p for p in HERE.iterdir() if p.name not in ('manifest.json','SHA256SUMS'));assert all(p.is_file() and not p.is_symlink() for p in files)
(HERE/'SHA256SUMS').write_text(''.join(sha(p.read_bytes())+'  '+p.name+'\n' for p in files));files.append(HERE/'SHA256SUMS');files.sort()
rows=[dict(path=p.name,sha256=sha(p.read_bytes()),bytes=p.stat().st_size,mode=stat.S_IMODE(p.stat().st_mode)) for p in files]
put('manifest.json',dict(kind='SEALED_INACTIVE_GATEWAY_FAILED_RESOURCE_SOURCE03',sourceGeneration=3,files=rows,memberCount=len(rows),manifestSelfExcluded=True,
 source02ManifestSha256=sha(old_manifest),designManifestSha256='eaddcae2d795989a6585d636718d8c5f67340d79bde824803d16f8a28704f06c',designQaManifestSha256='6a5fc57b2f89b879f5f12d3760a01d1b5bf9f54d62a297268644427e2536fa25',rootScopeSha256='95ad5dd326b114c6aac04e62202292a7ab2980e267388d7f5a9bf4d66673d554',designQaRootAdoptionSha256='e26a774ea5d70a3bb5f03a21b60ce739832e47a08a5ec606147863fd779caac7',
 installedRuntimePayloadCount=6,exactCurrentProofCounts=counts,totalChecksPassed=total,retainedSemanticIds=197,newFocusedChecks=72,testFailures=0,realBoundaryCalls=0,
 functionSpanCount=len(functions),reachedInterpretationSiteCount=len(calls),inputClassCount=len(classes),historicalNumericBase=2255,numericOnlyAbsent=[73492,86096,96486],prospectiveOldEDirectEntries=2265,priorN01Members=7,
 executionReady=False,actualSourceReviewsRootExceptionAndAllOperatingGatesOwed=True,actualSubjectOperations=0,approvedFrozenSevenReadException=True,overbroadFilenameDiscoveryRecorded=True,
 oldFirstHoldReason='UNKNOWN_NOT_RETROACTIVELY_ESTABLISHED',descriptor16PostExitLeakProved=False,normalRoute='HARD_HOLD',historicalRepair=False,cleanupOrCredit=False))
print(json.dumps(dict(status='SEALED_INACTIVE_SOURCE03',manifestSha256=sha((HERE/'manifest.json').read_bytes()),payloadMembers=len(rows),checks=total,retained=197,newFocused=72,proofs=counts,functionSpans=len(functions),interpretationSites=len(calls),inputClasses=len(classes),actualSubjectActions=0,executionReady=False)))
