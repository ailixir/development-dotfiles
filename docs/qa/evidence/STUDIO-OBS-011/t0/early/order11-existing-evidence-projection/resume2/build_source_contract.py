"""Source + approved CLOSED PUBLIC facts only. Never examines any runtime/private artifact."""
from pathlib import Path
import re,json,hashlib
OUT=Path(__file__).resolve().parent;ROOT=next(p for p in OUT.parents if (p/'AGENTS.md').is_file())
sha=lambda b:hashlib.sha256(b.encode() if isinstance(b,str) else b).hexdigest()
paths=['AGENTS.md','studio-runner/src/guided/diagnostics.ts','studio-runner/src/guided/transport.ts','studio-runner/src/guided/runtime.ts','studio-runner/src/guided/ownership.ts','studio-runner/src/guided/journal.ts','studio-runner/src/guided/contracts.ts','studio-runner/src/run/guidedBrowser.ts','studio-runner/src/run/browser.ts','studio-runner/src/run/observedBootstrap.ts','studio-runner/dist/guided/diagnostics.js','studio-runner/dist/guided/transport.js','studio-runner/dist/guided/runtime.js','studio-runner/dist/guided/ownership.js','studio-runner/dist/run/guidedBrowser.js','backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java','backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedRunnerClient.java','backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java']
sources={p:(ROOT/p).read_text() for p in paths};bindings={p:sha(s) for p,s in sources.items()}
public_dir=Path('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/fullcheck03-order11-closed-default')
for name,expected in [('review.md','812eaefe30e4485abd31ef812f1aeab191a4e35de5a2250c5bbfa611ddc774d8'),('public-facts.json','775614c153d178c4f21cd5ef25df183118cd2e25f971b71396a0b31c33672c90')]:
 raw=(ROOT/public_dir/name).read_bytes();assert sha(raw)==expected;bindings[str(public_dir/name)]=expected
reader=ROOT/public_dir/'inspect_public.py';bindings[str(reader.relative_to(ROOT))]=sha(reader.read_bytes())
protocol_bindings={
'docs/qa/evidence/STUDIO-OBS-011/t0/resume2-report-static-protocol-root-adoption.json':'0a96a75830856906e4912cb50e0c8419c838003eab48390925723755fa5ad1f0',
'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/report-static-assets-review/post-terminal-protocol.md':'b15f9aa304e75709032fc756769cabfffee85c3ce22102869146c2fba5544f0d',
'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/report-static-assets-review/proposed-static-resource-catalog.json':'3be436be6ec4784ee393c16aee0aaf65d7620b4aed9fabfb73c68b4be09e359e'}
for path,h in protocol_bindings.items():assert sha((ROOT/path).read_bytes())==h;bindings[path]=h
# Exact current collector/capture SOURCE only; no entrypoint imported/executed or input recapture.
helper_bindings={
'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend.py':'fa90d844d6443285ada1ae1856fdef4bd23ddf607ab97ec21ccd52f2fc30cc3a',
'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py':'799ead7c9c622b7a8b1500d1e89762a689b11e472a8d2bf16101cb9b54f29cd4',
'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py':'cc943d9dfcf1ff07e463cfcc266e906704a5f04ae621b0355c6a5022f75f5e63'}
for path,h in helper_bindings.items():assert sha((ROOT/path).read_bytes())==h;bindings[path]=h
facts=json.loads((ROOT/public_dir/'public-facts.json').read_text())
runtime=sources['studio-runner/src/guided/runtime.ts'];browser=sources['studio-runner/src/run/guidedBrowser.ts'];replay=sources[paths[-3]]
def union(text,name):return re.findall(r"'([A-Z_]+)'",re.search(r'export type '+name+r' = ([^;]+);',text)[1])
phases=union(runtime,'GuidedStartPhase');launch=union(browser,'GuidedLaunchPhase');loss=union(browser,'GuidedLossReason')
transport=sources['studio-runner/src/guided/transport.ts'];refusals=re.findall(r"'([A-Z_]+)'",re.search(r'GUIDED_REFUSAL_CODES = \[([^]]+)\]',transport)[1])
codes=set(refusals)
for path,text in sources.items():
 if path.startswith('studio-runner/src/'):
  codes.update(re.findall(r"(?:new Error|super)\(\s*['\"]([A-Z][A-Z0-9_]{2,47})['\"]",text))
# Never promote arbitrary regex-shaped strings to semantic allowlist members.
a=replay.index('  private static String safeDiagnosticCode(');b=replay.index('  private static void putDiagnosticUuid(',a)
snapshot_codes=re.findall(r'"([A-Z][A-Z0-9_]+)"',replay[a:b])+['OTHER']
contract=dict(schemaVersion=1,purpose='ORDER11_EXISTING_PRIVATE_PROJECTION',executionLabel='obs011-t0-fresh-check03',
 sourceDigest='061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617',distDigest='698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210',sourceCount=1808,distCount=238,
 originalProtocolSha256=list(protocol_bindings.values())[0],originalAriaProtocolSha256=list(protocol_bindings.values())[1],originalResourceCatalogSha256=list(protocol_bindings.values())[2],
 replaySourceSha256=bindings[paths[-3]],method='actualCoreGuidedSameSecretIdStaysWithinPersistedScope',invocationOrdinal=12,variant='singleton',variantOrdinal=0,scopeOrdinal=4,sessionOrdinal=18,
 runtimePhases=phases,launchPhases=launch,lossReasons=loss,errorNames=['Error','GuidedStartFailure','GuidedLaunchFailure','NonError'],codes=sorted(codes),errnoExportAllowlist=[],
 signalExportAllowlist=[],snapshotCodes=snapshot_codes,
 snapshotStates=['PREPARING','OBSERVING','PROPOSING','ACTING','AWAITING_CLARIFICATION','FINALIZING','SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED','OTHER'],
 bootstrapPhases=['SOURCE_PLAN','PLAN_ACCEPTED','MATERIALIZED','ALLOCATED','CONTEXT_PENDING','READY','OTHER'],
 sourceBounds=dict(maxCauseLinks=6,errorNameMax=40,codeMax=48,errnoMax=32,exitCodeMin=-999,exitCodeMax=999,signalMax=13,ownedEventMax=16384,ownedBytesMax=8388608),
 readerCaps=dict(publicXmlBytes=2097152,snapshotBytes=1048576,workerLogBytes=16777216,privateManifestBytes=65536,diagnosticLineBytes=8192,diagnosticRecords=4096,jsonNodes=50000,jsonDepth=16,safeInteger=9007199254740991),
 publicFacts=dict(reviewSha256=bindings[str(public_dir/'review.md')],publicFactsSha256=bindings[str(public_dir/'public-facts.json')],xmlSha256=facts['artifactFacts'][0]['sha256'],
 warningLineSha256=facts['boundedLogWindow']['contextRefusals'][0]['lineSha256'],warningTimestampUtc=facts['boundedLogWindow']['contextRefusals'][0]['timestampUtc'],
 windowLeftUtc=facts['boundedLogWindow']['leftPreviousAfterEachUtc'],windowRightUtc=facts['boundedLogWindow']['rightCurrentAfterEachUtc']),
 limits=['GUIDED_START_FAILED has no timestamp/full SID/completeness flag; session field is16hex hash(canonical UUID string).',
 'safeFailureMetadata snapshot is after p3Case inner cleanup; it lacks capture/transition timestamp, assignment and context-delivery history.',
 'GuidedJournal consumption/native-fence records do not supply a timestamped first-stop chronology.',
 'Prefix match is candidate association only, never exact failed-session cause. No diagnostic budget reuse or new native invocation.'])
(OUT/'source-bindings.json').write_text(json.dumps(bindings,indent=2)+'\n');(OUT/'source-contract.json').write_text(json.dumps(contract,indent=2)+'\n')
print(json.dumps({'sourceAndApprovedPublicBindings':len(bindings),'runtimePhases':len(phases),'launchPhases':len(launch),'privateArtifactReads':0}))
