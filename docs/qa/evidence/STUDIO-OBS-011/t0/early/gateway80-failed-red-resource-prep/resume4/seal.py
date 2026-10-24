"""Source04 complete three-finding source-only sealer; never read target/frozen/private.

Stdout stays outside this directory. Ancestor proof and reviewer limitations keep
original attribution. No runtime copy/preimage acquisition is performed here.
"""
import ast,hashlib,json,stat
from pathlib import Path
HERE=Path(__file__).absolute().parent
ROOT=next(p for p in HERE.parents if p.name=='ui-studio')
assert HERE==ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume4'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def put(n,v):(HERE/n).write_text(json.dumps(v,indent=2)+'\n')
def verify(f,r):
    raw=f.read_bytes();st=f.lstat();mode=int(r['mode'],8) if type(r['mode'])is str else r['mode']
    assert stat.S_ISREG(st.st_mode) and not f.is_symlink() and len(raw)==r['bytes'] and sha(raw)==r['sha256'] and stat.S_IMODE(st.st_mode)==mode
    return raw
k=json.loads((HERE/'contract.json').read_bytes());assert k['sourceGeneration']==4 and k['namespace']=='failed-red-resource-disposition02'
old=HERE.parent/'resume3';old_raw=(old/'manifest.json').read_bytes();assert sha(old_raw)=='2e4f6203a252cae88239d37513e7f956f9dc1dd1d8345d1c79086023a1a8a198'
for row in json.loads(old_raw)['files']:verify(old/row['path'],row)
assert (HERE/'source03-manifest.json').read_bytes()==old_raw
proof_names=('check-results.json','optimized-bootstrap-results.json','code02-check-results.json','source03-check-results.json','source04-three-results.json')
proofs={n:json.loads((HERE/n).read_bytes()) for n in proof_names}
for name,v in proofs.items():
    assert v['failed']==0 and v['realBoundaryCalls']==[] and len(v['checks'])==v['passed']
    assert len({r['name'] for r in v['checks']})==v['passed'] and all(r.get('pass',r.get('pass_')) is True for r in v['checks'])
    for f,h in v.get('sourcePins',v.get('consumedProductionPins',{})).items():assert sha((HERE/f).read_bytes())==h,(name,f)
    if 'fixtureHarnessSha256' in v:assert v['fixtureHarnessSha256']==sha((HERE/'checks.py').read_bytes())
assert proofs['source04-three-results.json']['harnessSha256']==sha((HERE/'source03_checks.py').read_bytes())
assert proofs['optimized-bootstrap-results.json']['guardSha256']==sha((HERE/'guard-failed-red.bash').read_bytes())
counts={n:v['passed'] for n,v in proofs.items()};assert list(counts.values())==[89,6,83,72,63]
executed=sum(counts.values());assert executed==313
reuse=json.loads((HERE/'reuse-analysis.json').read_bytes());assert reuse['controls']==19 and reuse['executedHere'] is False and all(r['unchangedAst'] is True for r in reuse['unchangedFunctions'])
# Recompute AST equality, never substitute old result hashes as current execution.
for row in reuse['unchangedFunctions']:
    nodes=[]
    for folder in (old,HERE):nodes.append(next(n for n in ast.walk(ast.parse((folder/row['file']).read_bytes())) if isinstance(n,ast.FunctionDef) and n.name==row['function']))
    assert ast.dump(nodes[0],include_attributes=False)==ast.dump(nodes[1],include_attributes=False)
retained=[]
for name in ('check-results.json','extra-check-results.json','optimized-bootstrap-results.json','code02-check-results.json','source03-check-results.json'):
    previous=json.loads((HERE/('ancestor03-'+name)).read_bytes())
    current=previous if name=='extra-check-results.json' else proofs[name]
    assert [r['name'] for r in previous['checks']]==[r['name'] for r in current['checks']]
    retained.append(dict(group=name,cases=[r['name'] for r in previous['checks']],count=previous['passed'],source03ResultSha256=sha((HERE/('ancestor03-'+name)).read_bytes()),mode='BOUND_PRIOR_REUSE' if name=='extra-check-results.json' else 'CURRENT_SOURCE04_REPLAY'))
assert sum(r['count'] for r in retained)==269
put('case-preservation.json',dict(retainedSemanticIds=269,groups=retained,currentRetainedReplay=250,boundPriorReused=19,newThreeFindingChecks=63,currentExecutedChecks=313,totalSupportedSemanticControls=332,
 fixtureChanges=['source04 code/review/source directory and raw SHA values; same uncreated N02/planned FR03 names','manual fixture sinks explicitly claim a caller finalizer and finalize after selected cleanup; semantic identities unchanged','source03 capture/guard/installer records now complete after outer ownership, never emitted from inner forward','Code04 private fixtures retain synthetic current preimages, protected baselines and helper data; old actual history is not changed'],
 reuseLimit='The19 cap/custody controls remain exactly attributed to source03, with named unchanged ASTs. Changed capture/entry/owner/installer paths have current full-flow83/72/63 coverage;19 is not claimed executed here.'))
# Complete immutable review batch: no referenced runtime/private pin is followed.
T=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0';inputs=[];review_count=0
for rel,h in [('resume-architecture/resume2/gateway80-failed-red-resource-code03-exact-review','338207669e4f3c6c2d7806162987ebcdc19b388b20b49b040e07beaa8151e5a3'),('qa/gateway80-failed-red-resource-code03-exact-review','82d60d1827250b7780b13138ce7617202f07e0b0ae5dece6e6a438f3a9c6188c')]:
    d=T/rel;raw=(d/'manifest.json').read_bytes();assert sha(raw)==h
    inputs.append(dict(path=str((d/'manifest.json').relative_to(ROOT)),sha256=h,bytes=len(raw),mode=stat.S_IMODE((d/'manifest.json').stat().st_mode)))
    m=json.loads(raw)
    for row in m.get('files',m.get('members',[])):
        body=verify(d/row['path'],row);inputs.append(dict(path=str((d/row['path']).relative_to(ROOT)),sha256=sha(body),bytes=len(body),mode=row['mode']));review_count+=1
assert review_count==47
adoption=T/'resume2-gateway80-failed-resource-source03-all-findings-root-adoption.json';raw=adoption.read_bytes();assert sha(raw)=='a4b1642e42cb49049ff23b0e398ada2463acc4582007d77926a322c0d8f1419e'
inputs.append(dict(path=str(adoption.relative_to(ROOT)),sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(adoption.stat().st_mode)))
for suffix in ('task.txt','context.json'):
    f=ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'/('gateway80-failed-red-resource-source04-three-fix-'+suffix);raw=f.read_bytes();inputs.append(dict(path=str(f.relative_to(ROOT)),sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(f.stat().st_mode)))
put('input-pins.json',dict(kind='SOURCE04_EXACT_PUBLIC_REVIEW_AND_ANCESTRY_BINDINGS',inputs=inputs,reviewPayloadsVerified=47,source03All115Verified=True,source03ManifestSha256=sha(old_raw),currentRuntimeFrozenN1PrivateBaselineReads=0,referencedRuntimePinsNotFollowed=True,oldLimitationsRemainAttributed=True))
# Current API/signatures/ownership and same-buffer interpretation graph.
runtime=('entry.py','failed_gateway.py','custody.py','protocol.py','factory.py','installer.py','install-cli.py','shell-buffer-verify.py','buffer-bootstrap-inline.py','buffer-verifier-inline.py')
functions={};calls=[]
for name in runtime:
    tree=ast.parse((HERE/name).read_bytes());assert not any(isinstance(n,ast.Assert) for n in ast.walk(tree)),name
    for node in tree.body:
        if isinstance(node,ast.FunctionDef):functions[name+':'+node.name]=dict(file=name,line=node.lineno,endLine=node.end_lineno,signature=ast.unparse(node.args))
        if isinstance(node,ast.ClassDef):
            for fn in node.body:
                if isinstance(fn,ast.FunctionDef):functions[name+':'+node.name+'.'+fn.name]=dict(file=name,line=fn.lineno,endLine=fn.end_lineno,signature=ast.unparse(fn.args))
    for node in ast.walk(tree):
        if isinstance(node,ast.Call):
            callee=ast.unparse(node.func)
            if callee in ('exec','compile','json.loads','P.decode','ast.parse') or callee.endswith(('.bound','.local','.document','.read','.root_read','.bootstrap_read','.copy_from','.preflight','.finalize','.source_call','.acquire','.install','.verify','.require_setup','.claim_finalizer','.primary','.cleanup')):calls.append(dict(file=name,line=node.lineno,callee=callee))
block='STAGES='+(HERE/'protocol.py').read_text().split('STAGES=',1)[1].split('# END SINGLE OUTER FAILURE SINK',1)[0]
for name in ('guard-failed-red.bash','install-loader.bash','install-cli.py'):assert block in (HERE/name).read_text(),name
assert (HERE/'binding-functions.bash').read_bytes()==(HERE/'guard-failed-red.bash').read_bytes()
for name,label in (('guard-failed-red.bash','GUARD'),('install-loader.bash','INSTALL_LOADER')):
    body=(HERE/name).read_text().split("-B -c '",1)[1].split("' ",1)[0];assert "'" not in body
    tree=ast.parse(body);assert not any(isinstance(n,ast.Assert) for n in ast.walk(tree));assert body.count('sink.finalize(finalizer)')==1 and 'claim_finalizer("'+label+'")' in body
assert 'self.sent' not in (HERE/'protocol.py').read_text()
classes=['first-read external raw authority/code buffers','reviewed seven-role factory/readset/source graph','pending draft/actual-FD-only finalization','old2263/typed priorN01 seven/newN02 membership','immutable2255/three absences plus dynamic setup roster','current source/client/utility/holder/resource facts','bounded full-W/original22/helper/raw4 archive','actual readonly-buffer/root parent actor attestations','literal namespace/stage/primary-publication cleanup','single selected outer finalization token','immediate directory creation/partial unknown identity','explicit direct caller ownership and retained refs','actual final/permit60s/wrapper1/postclose0/root gates']
put('api-map.json',dict(sourceGeneration=4,functions=functions,installedRuntimePayloads=k['installedCode'],operationalNamespace=k['namespace'],operationNamesRemain='gateway80_failed_red03_*/GATEWAY_FR03_*',
 finalization=dict(guard='GUARD token, after all bootstrap close attempts',installerLoader='INSTALL_LOADER token, after all outer bootstrap close attempts',standaloneRun='DIRECT_RUN token, after Unit cleanup',standaloneCli='DIRECT_INSTALL_CLI token, after installer and bootstrap cleanup',entryAndInstaller='borrow an explicitly open caller token; never finalize themselves',forward='accumulate only; no trace emission',finalize='exact owner token, once, no later mutation/overwrite'),
 creation='Custody.mkdir creation marker becomes true immediately after exclusive mkdir; later constructor failure retains true/null unknown opened identity',callbacks='all test target effects fake in same compiled namespace; direct APIs use real source functions and explicit owner',noActualOperationAuthority=True))
put('interpretation-map.json',dict(functions=functions,reachedInterpretationSites=calls,reachedInterpretationSiteCount=len(calls),inputClasses=classes,inputClassCount=len(classes),firstReadExternalBuffersUnchanged=True,source06MainNativeNormalEntriesForbidden=True,reasonRegistry='source-reason-registry.json',actualFactsObserved=False))
put('ownership-map.json',dict(historicalBase=2255,numericOnlyAbsent=[73492,86096,96486],dynamicSetup='actual externally pinned helper roster, numeric absence in every table/join; no guessed future total',priorN01=k['priorNamespaces'],
 primaryPublication='original capture error is recorded before finally publication; publication failure is separate closed cleanup and never replaces original',
 finalEmission='single selected owner token, only after all selected cleanup; inner layers accumulate; direct entry/installer callers own equivalent boundary',
 partialNamespace='successful mkdir marker independent of custody return; unknown opened identity stays null; partial/attempt and refs retained',
 noBareFdRetrySignalCleanupReset=True,oldFirstHold='UNKNOWN_NOT_RETROACTIVELY_ESTABLISHED',descriptor16='PROVISIONAL_NOT_POSTEXIT_LEAK_PROOF',actualTargetFacts=False))
put('fix-map.json',dict(rootAdoptionSha256=sha(adoption.read_bytes()),completeFindingCount=3,findings=[dict(id='FR03-PRIMARY-PUBLISH',functions=['Unit.capture','FailureSink.primary','FailureSink.cleanup'],cases='PRIMARY_PUBLISH_*'),dict(id='FR03-OUTER-CLEANUP',functions=['FailureSink.claim_finalizer','FailureSink.finalize','run','entry.execute','install-cli.execute','installer.install','guard/install-loader finally'],cases='GUARD_*, INSTALL_LOADER_*, DIRECT_*'),dict(id='FR03-PARTIAL-NAMESPACE',functions=['Custody.mkdir','installer.install'],cases='PARTIAL_NAMESPACE_*')],otherScopeAdded=False))
history=[]
for f in sorted(HERE.glob('author-*.stderr')):
    body=f.read_bytes();out=f.with_suffix('.stdout');history.append(dict(path=f.name,bytes=len(body),sha256=sha(body),stdoutSha256=sha(out.read_bytes()) if out.is_file() else None,classification='FAILED_ATTEMPT_PRESERVED' if body else 'COMPLETED_ATTEMPT_NOT_AUTOMATIC_CURRENT_PROOF'))
put('author-history.json',dict(attempts=history,currentProofs=counts,reusedProofs={'ancestor03-extra-check-results.json':19},ancestralLogsKeepOriginalAttribution=True,reviewerFailuresAndNodeGreetingDeviation='Bound to exact source03 review47; greeting status UNQUALIFIED, no current Node/resource inference/remedy',currentTargetOperations=0))
put('generation-map.json',dict(sourceGeneration=4,generators=['write_source04.py','write_metadata.py','seal.py'],designSavedBeforeCode=True,completeAdoptedBatch=3,
 currentExecutedChecks=executed,reusedPriorControls=19,totalSupportedSemanticControls=executed+19,retainedSemanticIds=269,newThreeFindingChecks=63,
 fakeBoundaryMethod='preloaded stdlib, same compiled target namespaces, persistent inherited deny audit; only concrete providers and explicit owner fixture setup adapted',
 knownLimits=['no actual Bash/platform/60-second compatibility','no current runtime/frozenN1/private/baseline reads','all source03/reviewer failures and scope deviations stay historical','all exact source04 reviews and new Node-only f9/no-backend-compile exception/install/bind/phases/QAroot owed'],
 operationalN02AndFR03NamesUnchanged=True,source03Immutable=True,budgetUsd=500,aggregateSpend='UNKNOWN'))
(HERE/'review.md').write_text(f'''# SOURCE04 author handoff — no QA or operating verdict

All three adopted findings are corrected in one inactive source04 generation. Current
actual-function fake checks: {executed} ({counts});19 unchanged cap/custody controls
are bound prior-source03 reuse, not new execution. All269 semantic IDs remain;63 exact
three-finding controls cover publication, full outer-owner guard/installer success and
failure/late-close pairs, truthful post-mkdir custody failure, and direct caller ownership.
Full six-mode fake dispatch and ordinary/optimized loader paths pass. No real boundary
was reached; no actual Bash/platform/source/resource/60s compatibility is proved.

Use RECIPE04.md and api-map.json. Same planned/unconsumed N02/FR03 names; source03 stays
immutable. Inner forward accumulates only; one selected finalizer emits after all selected
cleanup. Known partial creation is independent of returned custody; unknown identity is
null. No raw exception context is exported. All actual gates remain owed. Old first Hold
stays UNKNOWN; descriptor16 remains provisional. Review Node-greeting status UNQUALIFIED,
author filename limitations and every prior failed attempt retain original attribution.
''')
files=sorted(f for f in HERE.iterdir() if f.name not in ('manifest.json','SHA256SUMS'));assert all(f.is_file() and not f.is_symlink() for f in files)
(HERE/'SHA256SUMS').write_text(''.join(sha(f.read_bytes())+'  '+f.name+'\n' for f in files));files.append(HERE/'SHA256SUMS');files.sort()
rows=[dict(path=f.name,sha256=sha(f.read_bytes()),bytes=f.stat().st_size,mode=stat.S_IMODE(f.stat().st_mode)) for f in files]
put('manifest.json',dict(kind='SEALED_INACTIVE_GATEWAY_FAILED_RESOURCE_SOURCE04',sourceGeneration=4,files=rows,memberCount=len(rows),manifestSelfExcluded=True,
 source03ManifestSha256=sha(old_raw),architecture03ManifestSha256='338207669e4f3c6c2d7806162987ebcdc19b388b20b49b040e07beaa8151e5a3',qa03ManifestSha256='82d60d1827250b7780b13138ce7617202f07e0b0ae5dece6e6a438f3a9c6188c',rootAllThreeAdoptionSha256=sha(adoption.read_bytes()),
 installedRuntimePayloadCount=6,exactCurrentProofCounts=counts,currentExecutedChecksPassed=executed,boundPriorReusedControls=19,totalSupportedSemanticControls=executed+19,retainedSemanticIds=269,newThreeFindingChecks=63,testFailures=0,realBoundaryCalls=0,
 functionSpanCount=len(functions),reachedInterpretationSiteCount=len(calls),inputClassCount=len(classes),prospectiveNamespace='failed-red-resource-disposition02',plannedOperationNames='gateway80_failed_red03_*/GATEWAY_FR03_*',
 historicalNumericBase=2255,numericOnlyAbsent=[73492,86096,96486],oldEDirectEntries=2265,priorN01Members=7,executionReady=False,
 currentRuntimeFrozenPrivateBaselineReads=0,actualTargetOperations=0,oldFirstHoldReason='UNKNOWN_NOT_RETROACTIVELY_ESTABLISHED',descriptor16PostExitLeakProof=False,normalRoute='HARD_HOLD',historicalRepair=False,cleanupOrCredit=False,allActualGatesOwed=True))
print(json.dumps(dict(status='SEALED_SOURCE04',manifestSha256=sha((HERE/'manifest.json').read_bytes()),payloadMembers=len(rows),executedChecks=executed,reusedPrior=19,totalSemanticControls=executed+19,retained=269,newThree=63,proofs=counts,functions=len(functions),interpretations=len(calls),inputClasses=len(classes),actualTargetActions=0,executionReady=False)))
