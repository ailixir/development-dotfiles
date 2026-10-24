"""SOURCE and approved closed PUBLIC hashes/AST only; no actual runtime/private enumeration."""
from pathlib import Path
import ast,hashlib,json,re
R=Path.cwd();D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/order11-existing-evidence-projection';O=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/order11-existing-evidence-projection-review'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
expected={'manifest.json':'44afe7ad379bfde9626d43f41879a9db323e41aec854531637f2b70702a4feb3','project_existing.py':'03e64cb7f8155194c614fedca3b47a99f547db2768a38e38984b0e5d4b5d5bd5','receipt.json':'200124a67f9557a50f295f5cf1afae25ee484fee2d8f65c59c8f90f95def9203','receipt.md':'d9f495e4d9db1e8c9d53145c9514cc4c3eb4533e9fcea1cdda1c0e861a46881a'}
for name,digest in expected.items():assert h(D/name)==digest
manifest=json.loads((D/'manifest.json').read_text());assert len(manifest['files'])==25
for name,digest in manifest['files'].items():assert h(D/name)==digest
for line in (D/'SHA256SUMS').read_text().splitlines():
 digest,name=line.split(None,1);assert h(D/name.strip())==digest
bindings=json.loads((D/'source-bindings.json').read_text());assert len(bindings)==27
# Only the exact source/public binding list is read; no path derived from runtime/private inputs.
for path,digest in bindings.items():
 assert path.startswith(('studio-runner/src/','studio-runner/dist/','backend/src/','docs/qa/evidence/STUDIO-OBS-011/t0/','.aiox/sdc/STUDIO-OBSERVED-ORCH/')) or path=='AGENTS.md'
 assert h(R/path)==digest
source=(D/'project_existing.py').read_text();tree=ast.parse(source)
modules=[n.module if isinstance(n,ast.ImportFrom) else a.name for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom)) for a in ([None] if isinstance(n,ast.ImportFrom) else n.names)]
assert set(modules)=={'pathlib','argparse','datetime','hashlib','io','json','os','re','stat','sys','uuid','xml.etree.ElementTree'}
unsafe={'glob','rglob','listdir','walk','system','popen','spawn','fork','kill','execv','execve','connect','urlopen','socket','requests','subprocess'}
assert not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in unsafe for n in ast.walk(tree))
require_calls=[n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='require']
assert all(len(n.args)==2 and isinstance(n.args[1],ast.Constant) and isinstance(n.args[1].value,str) for n in require_calls)
reasons={n.args[1].value for n in require_calls}|{'CLI_ARGUMENTS_REJECTED','MALFORMED_JSON','NONFINITE_JSON','IDENTITY_SHAPE','AUTHORIZATION_TIME_SHAPE','TERMINAL_TIME_SHAPE','PUBLIC_XML_MALFORMED','OWNED_START_TIME_SHAPE','MISSING_CHANGED_OR_UNSUPPORTED_INPUT'}
refusal=json.loads((D/'refusal-schema.json').read_text());assert reasons<=set(refusal['properties']['reason']['enum'])
assert refusal['additionalProperties'] is False
schema=json.loads((D/'output-schema.json').read_text())
def closed_objects(obj):
 if isinstance(obj,dict):
  if obj.get('type')=='object':assert obj.get('additionalProperties') is False
  for v in obj.values():closed_objects(v)
 elif isinstance(obj,list):
  for v in obj:closed_objects(v)
closed_objects(schema)
C=json.loads((D/'source-contract.json').read_text());runtime=(R/'studio-runner/src/guided/runtime.ts').read_text();browser=(R/'studio-runner/src/run/guidedBrowser.ts').read_text();diagnostics=(R/'studio-runner/src/guided/diagnostics.ts').read_text();replay=(R/'backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java').read_text()
for key,text,name in [('runtimePhases',runtime,'GuidedStartPhase'),('launchPhases',browser,'GuidedLaunchPhase'),('lossReasons',browser,'GuidedLossReason')]:
 assert C[key]==re.findall(r"'([A-Z_]+)'",re.search(r'export type '+name+r' = ([^;]+);',text)[1])
assert C['sourceBounds']['maxCauseLinks']==int(re.search(r'const MAX_LINKS = (\d+)',diagnostics)[1])==6
assert 'timestamp' not in diagnostics[diagnostics.index('export function describeStartFailure'):diagnostics.index('/** Bounded, non-authoritative')]
assert "hash(facts.sessionId).slice(0, 16)" in diagnostics and 'elapsedMs: Math.max(0, Math.round(facts.elapsedMs))' in diagnostics
assert C['errnoExportAllowlist']==C['signalExportAllowlist']==[]
assert 'caseAlias' in schema['properties'] and schema['properties']['cause']['const']=='UNPROVEN'
# Source-only conditional Dara interpretation, no snapshot values or runtime schema installation inferred.
dara=R/'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/order11-terminal-snapshot-dara/review.md';assert h(dara)=='9d6b2107297498f52c04ca52c21b1c37c0ab1067aed781be44ad8a5776a7d472'
guidance=R/'docs/qa/evidence/STUDIO-OBS-011/t0/resume2-order11-snapshot-source-root-guidance.json';g=json.loads(guidance.read_text());assert g['privateAccessAuthorized'] is False
v14=(R/'backend/src/main/resources/db/migration/V14__guided_sessions.sql').read_text();assert "IF OLD.state IN ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')" in v14
cleanup=replay[replay.index('  private void p3CleanupOwnedResources()'):replay.index('  private void p3CleanupOwnedResources()')+5000]
assert '"FAILED"' in cleanup and '.contains(state)' in cleanup and 'p3AwaitTeardown(id);' in cleanup
assert 'return value != null && List.of(allowed).contains(value) ? value : "OTHER";' in replay
out=dict(manifestSha256=h(D/'manifest.json'),parserSha256=h(D/'project_existing.py'),receiptJsonSha256=h(D/'receipt.json'),receiptMdSha256=h(D/'receipt.md'),sealedArtifactEntries=25,sourceAndApprovedPublicBindings=27,exactSourceHashesCurrent=True,imports=modules,forbiddenExecutionDiscoveryCallsAbsent=True,fixedRequireReasonCalls=len(require_calls),outputObjectsStrictlyClosed=True,sourceRuntimePhases=C['runtimePhases'],sourceLaunchPhases=C['launchPhases'],sourceLossReasons=C['lossReasons'],sourceCauseLinksCap=6,noDiagnosticTimestampInvented=True,prefixOnlyAssociationPreserved=True,daraReviewSha256=h(dara),rootSnapshotGuidanceSha256=h(guidance),snapshotFamilyInferenceConditionalOnly=True,wholeTerminalAndPublicAssessmentStillRequired=True,actualPrivateEnumerationReadsGlobs=0,entrypointNativeExecuted=False,sourceProductStoryPlanWritten=False)
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
