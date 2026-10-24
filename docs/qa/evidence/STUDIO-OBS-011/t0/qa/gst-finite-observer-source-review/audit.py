"""Pure SOURCE/text/finite-record controls; no Java/Groovy/helper execution."""
from pathlib import Path
import hashlib,json,re
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
D=T/'resume-architecture/resume2/gst-assignment-boundary-evidence-design'
O=T/'qa/gst-finite-observer-source-review'
B=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
ctx=read(B/'gst-finite-observer-source-review-context.json');assert len(ctx['pins'])==12
for row in ctx['pins']:assert sha(R/row['path'])==row['sha256'],row['path']
manifest=read(D/'artifact-manifest.json');assert len(manifest['artifacts'])==7
for row in manifest['artifacts']:assert sha(R/row['path'])==row['sha256'] and (R/row['path']).stat().st_size==row['bytes']
inputs=read(D/'inputs.json')
for row in inputs['records']:assert sha(R/row['path'])==row['sha256'],row['path']
basepath=T/'runtime/obs011-gst-provisional-02/formatted-candidate-archive/backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedServiceTransportFaultIT.java'
base=basepath.read_text();assert sha(basepath)=='9e9aef4355a151d6a6d9959af129ef2e8267b4b0d6596fecd296e4669da01878'
helper=(D/'helper.java.fragment').read_text();patch=(D/'observation-only.patch').read_text();init=(D/'filtered-output.init.gradle').read_text();contract=read(D/'projection-contract.json')
# Reconstruct the unified diff in memory with exact old context and hunk counts.
lines=base.splitlines(keepends=True);diff=patch.splitlines(keepends=True);out=[];cursor=0;i=2;hunks=0;added=[]
assert diff[:2]==['--- a/backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedServiceTransportFaultIT.java\n','+++ b/backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedServiceTransportFaultIT.java\n']
while i<len(diff):
    m=re.fullmatch(r'@@ -(\d+),(\d+) \+(\d+),(\d+) @@\n',diff[i]);assert m
    oldstart,oldcount,newstart,newcount=map(int,m.groups());assert oldstart-1>=cursor
    out.extend(lines[cursor:oldstart-1]);cursor=oldstart-1;assert len(out)==newstart-1
    i+=1;seenold=seennew=0;hunks+=1
    while i<len(diff) and not diff[i].startswith('@@ '):
        line=diff[i];assert line[0] in ' +', 'No deletion is permitted'
        if line.startswith(' '):assert lines[cursor]==line[1:];out.append(line[1:]);cursor+=1;seenold+=1;seennew+=1
        else:out.append(line[1:]);added.append(line[1:]);seennew+=1
        i+=1
    assert (seenold,seennew)==(oldcount,newcount)
out.extend(lines[cursor:]);candidate=''.join(out);assert hunks==3
assert hashlib.sha256(candidate.encode()).hexdigest()=='604135fefd392f1cee1b7fcf9b2faf972d727dbf2d76c75f20580d6dd7f607ab'
cut='      observeGstCutPrimary(failure);\n';callback='      observeGstCallback(route, response.statusCode(), response.body());\n'
assert ''.join(added)==cut+helper+callback
assert candidate.replace(cut,'',1).replace(helper,'',1).replace(callback,'',1)==base
assert 'catch (Exception | Error failure) {\n'+cut+'      primary = failure;\n      throw failure;\n    } finally {' in candidate
assert 'var response = http.send(request, HttpResponse.BodyHandlers.ofString());\n'+callback+'      assertThat(response.statusCode()).as("authenticated owning-worker %s", route).isEqualTo(202);\n      return C.parseWire(response.body().getBytes(StandardCharsets.UTF_8));' in candidate
assert candidate.count('observeGstCutPrimary(failure);')==candidate.count('observeGstCallback(route, response.statusCode(), response.body());')==1
# Exact finite vocabularies and source compatibility checks.
schema=read(R/'docs/specs/studio-observed-authoring/contracts/v3/error.schema.json')
codes=set(schema['properties']['code']['enum']);assert len(codes)==28
codeblock=helper.split('private static String gstFixedCode',1)[1].split('private static String gstFixedStatus',1)[0]
assert set(re.findall(r'"([A-Z_]+)"',codeblock))==codes|{'UNPROVEN'}==set(contract['codes'])
statusblock=helper.split('private static String gstFixedStatus',1)[1].split('private static String gstFixedFrame',1)[0]
assert set(re.findall(r'\b(?:400|401|403|404|409|422|429|500|503)\b',statusblock))==set(contract['statuses'])-{'NONE','OTHER'}
assert 'responseBody.length() <= 4096' in helper and 'Math.min(frames.length, 32)' in helper and 'line < 1 || line > 99999' in helper
assert 'C.validate("v3/error", error);' in helper and 'if (status == 202) return;' in helper
assert helper.count('getMessage()')==1 and 'gstFixedCode(refusal.getMessage())' in helper
assert not any(x in helper for x in ['getCause(', 'getSuppressed(', 'printStackTrace(', 'getFileName(', 'getRequestURI(', 'getRequestURL(', 'Files.', 'Thread.sleep(', 'interrupt(', 'new HttpClient', 'JdbcTemplate'])
exception=(R/'backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionException.java').read_text()
controller=(R/'backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedInternalController.java').read_text()
contracts=(R/'backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedContracts.java').read_text()
assert 'public final class GuidedSessionException extends RuntimeException' in exception and 'super(code);' in exception and 'public int status()' in exception
assert 'response.put("schemaVersion", 3);' in controller and 'ResponseEntity.status(failure.status()).body(response)' in controller
assert 'new GuidedSessionException("UNKNOWN_OUTCOME", 409)' in controller
assert 'public JsonNode parseWire(byte[] bytes)' in contracts and 'public void validate(String name, JsonNode value)' in contracts
for name in ['JsonNode','IOException','StandardCharsets']:assert re.search(r'^import .*\.'+name+';',base,re.M)
assert 'private static final GuidedContracts C = new GuidedContracts();' in base
# Finite transport grammar, bounded single-record forwarding, no task/result broadening.
assert "p.tasks.named('test', Test).configure" in init and 't.testLogging.showStandardStreams = false' in init and 't.onOutput' in init
assert "p.projectDir.canonicalFile == new File(expected, 'buildSrc').canonicalFile && gradle.parent != null" in init
assert 'if (p.projectDir.canonicalFile != expected) throw new GradleException' in init
assert "new File('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/backend').canonicalFile" in init
assert 'record.length() <= 768' in init and 't.logger.lifecycle(record)' in init
assert not any(x in init for x in ['ignoreFailures','exceptionFormat','FULL','test.filter','includeTestsMatching','excludeTestsMatching','dependsOn','jvmArgs','setTimeout','showExceptions'])
grammar=re.search(r'if \(record ==~ /(.*)/\) t.logger.lifecycle\(record\)',init).group(1)
pattern=re.compile(grammar)
def accept(s):
    if s is None or len(s)>768:return False
    if s.endswith('\r\n'):s=s[:-2]
    elif s.endswith('\n'):s=s[:-1]
    return pattern.fullmatch(s) is not None
record='GST_DIAG|site=CALLBACK_STATUS|route=CLAIM|status=409|family=HTTP_ERROR|code=RUNTIME_INCOMPATIBLE|frame=NONE|line=0'
valid=[record,record+'\r\n',record.replace('CALLBACK_STATUS','CUT_PRIMARY').replace('route=CLAIM','route=NONE').replace('HTTP_ERROR','GUIDED_SESSION').replace('frame=NONE','frame=CLAIM').replace('line=0','line=99999')]
invalid=[None,record+'\n'+record,record[:60],record+'|secret=SYNTHETIC',record.replace('code=RUNTIME_INCOMPATIBLE','code=SYNTHETIC_UNKNOWN'),record.replace('line=0','line=100000'),record.replace('frame=NONE','frame=java.private.Frame'),record.replace('status=409','status=418'),record+'\r',record+' '*769]
assert all(accept(s) for s in valid) and not any(accept(s) for s in invalid)
for field,key in [('site','sites'),('route','routes'),('status','statuses'),('family','families'),('code','codes'),('frame','frames')]:
    allowed=re.search(r'\|'+field+r'=\(\?:([^)]*)\)',grammar).group(1).split('|')
    assert set(allowed)==set(contract[key])
# Source branch reproduction: no Java parser, body input or helper execution.
callback_source=helper.split('private static void observeGstCallback',1)[1].split('private static void observeGstCutPrimary',1)[0]
assert callback_source.index('C.parseWire(')<callback_source.index('String fixedRoute')<callback_source.index('gstDiagnosticLine("CALLBACK_STATUS"')
assert 'catch (Throwable observationFailure) {\n      gstDiagnosticUnproven();' in callback_source
branch_controls={'202':'silent before body inspection','409_valid_v3_error':'CALLBACK_STATUS CLAIM 409 HTTP_ERROR recognized_code','409_null_or_oversized_body':'CALLBACK_STATUS CLAIM 409 HTTP_ERROR UNPROVEN','409_parse_or_schema_exception':'OBSERVER_UNPROVEN NONE NONE OTHER UNPROVEN'}
result={'disposition':'SUPPORTED_SOURCE_ONLY_WITH_EXPLICIT_INFORMATION_LIMITATIONS','dispatchPins':12,'artifactHashes':7,'sourceInputPins':len(inputs['records']),'strictMemoryPatchHunks':3,'exactTwoSitesAndHelperOnly':True,'candidateSha256':hashlib.sha256(candidate.encode()).hexdigest(),'originalSubjectFlowAndBytesOutsideAdditionsUnchanged':True,'codeVocabulary':28,'pureGrammarControls':{'accepted':len(valid),'rejected':len(invalid)},'callbackBranchControlsSourceOnly':branch_controls,'knownStatusRouteLostOnParseOrSchemaFailure':True,'statusLossDisposition':'ACCEPTABLE_DECLARED_BEST_EFFORT_LIMITATION_NO_REQUIRED_FIX','optionalNarrowImprovement':'Isolate optional body/code parsing failure so independently known finite route/status can still be emitted with code UNPROVEN; no raw fields.','unknownGenericControllerRuntimeCodeRemainsUnknownOutcome':True,'bodyInspectionCharacters':4096,'frameElementsInspected':32,'transportRecordCharacters':768,'hardTransportBodyAllocationOrLatencyBoundProved':False,'noCaseSessionIdentityJoin':True,'sourceApiPlausibilityOnly':True,'javaCompileOrExecutionVerified':False,'groovyOrGradleApiExecutionVerified':False,'all99RuntimeGateRemainsUnproved':True,'fullFutureComposedCandidateReviewed':False,'requiredSourceCorrections':[],'sourceNativeRetryOrLifecycleReleased':False,'rawNativePrivateBodyTempOrLocatorAccess':False,'nativeHelperCompilerFormatterProcessOrSignalAction':False,'budgetCeilingUsd':500,'aggregateSpendAvailable':False}
(O/'audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
