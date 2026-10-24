"""Pure source/patch/finite-record audit. No native/Java/Gradle/helper execution."""
from pathlib import Path
import hashlib,json,re
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';D=T/'resume-architecture/resume2/gst-peer-evidence-addendum';O=T/'qa/gst-peer-observer-source-review'
B=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011';read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
ctx=read(B/'gst-peer-observer-source-review-context.json');assert len(ctx['pins'])==9
for row in ctx['pins']:assert sha(R/row['path'])==row['sha256']
manifest=read(D/'artifact-manifest.json');assert len(manifest['artifacts'])==6
for row in manifest['artifacts']:assert sha(R/row['path'])==row['sha256'] and (R/row['path']).stat().st_size==row['bytes']
contract=read(D/'contract-addendum.json');author=read(D/'source-audit.json')
for row in author['savedPins']:assert sha(R/row['path'])==row['sha256']
for row in read(D/'task-inputs.json'):assert sha(R/row['path'])==row['sha256']
basepath=R/contract['preimagePath'];assert sha(basepath)==contract['preimageSha256']=='6aca12f6ef2834ee9e8e34a047994f87a7f2be3b6ad990e61b67d457b1b30b48'
base=basepath.read_text();diff=(D/'peer-observation.patch').read_text().splitlines(keepends=True);lines=base.splitlines(keepends=True)
# Strict whole-source unified-diff reconstruction, including removed/context bytes.
out=[];cursor=0;i=2;hunks=0;additions=[];removals=[]
while i<len(diff):
    m=re.fullmatch(r'@@ -(\d+),(\d+) \+(\d+),(\d+) @@\n',diff[i]);assert m
    oldstart,oldcount,newstart,newcount=map(int,m.groups());assert oldstart-1>=cursor
    out.extend(lines[cursor:oldstart-1]);cursor=oldstart-1;assert len(out)==newstart-1
    i+=1;seenold=seennew=0;hunks+=1
    while i<len(diff) and not diff[i].startswith('@@ '):
        line=diff[i];assert line[0] in ' +-'
        if line[0] in ' -':assert lines[cursor]==line[1:];cursor+=1;seenold+=1
        if line[0] in ' +':out.append(line[1:]);seennew+=1
        if line[0]=='+':additions.append(line[1:])
        if line[0]=='-':removals.append(line[1:])
        i+=1
    assert (seenold,seennew)==(oldcount,newcount)
out.extend(lines[cursor:]);candidate=''.join(out);assert hunks==4
assert hashlib.sha256(candidate.encode()).hexdigest()==contract['proposedPostimageSha256']=='322164060758b36eba7b33a768617032508aa4a533ea6e042d197966eaf64be0'
oldcall='observeGstCutPrimary(failure);';newcall='observeGstCutPrimary(failure, created[0]);'
wrapper='''  private static void observeGstCutPrimary(Throwable primary, Scenario scenario) {
    observeGstFailure("CUT_PRIMARY", primary);
    try {
      Throwable peer = scenario == null ? null : scenario.peerFailure.get();
      if (peer == null) {
        gstDiagnosticLine("CUT_PEER", "NONE", "NONE", "OTHER", "UNPROVEN", "NONE", 0);
      } else {
        observeGstFailure("CUT_PEER", peer);
      }
    } catch (Throwable observationFailure) {
      gstDiagnosticUnproven();
    }
  }

'''
oldheader='  private static void observeGstCutPrimary(Throwable primary) {'
newheader='  private static void observeGstFailure(String site, Throwable primary) {'
oldemit='gstDiagnosticLine("CUT_PRIMARY", "NONE", status, family, code, frame, line);';newemit='gstDiagnosticLine(site, "NONE", status, family, code, frame, line);'
frameadd='        case "callback" -> "PEER_CALLBACK";\n        case "relay" -> "PEER_RELAY";\n'
expected=base.replace(oldcall,newcall,1).replace(oldheader,wrapper+newheader,1).replace(oldemit,newemit,1).replace('        case "runGuidedControllerCut" -> "CUT_RUN";\n','        case "runGuidedControllerCut" -> "CUT_RUN";\n'+frameadd,1)
assert candidate==expected
reverse=candidate.replace(newcall,oldcall,1).replace(wrapper,'',1).replace(newheader,oldheader,1).replace(newemit,oldemit,1).replace(frameadd,'',1)
assert reverse==base
oldbody=base.split(oldheader,1)[1].split('  private static String gstFixedCode',1)[0]
newbody=candidate.split(newheader,1)[1].split('  private static String gstFixedCode',1)[0]
assert oldbody.replace(oldemit,newemit,1)==newbody
assert wrapper.count('scenario.peerFailure.get()')==1 and candidate.count('observeGstFailure(')==3
assert not any(x in ''.join(additions) for x in ['peerFailure.set','getAndSet','compareAndSet','getCause(','getSuppressed(','printStackTrace(','Thread.sleep(','BY_SESSION','logger','Logger','JFR','System.setProperty','java.util.logging'])
assert 'catch (Exception | Error failure) {\n      '+newcall+'\n      primary = failure;\n      throw failure;\n    } finally {' in candidate
# Object association is local source identity, without extracting any runtime locator.
prep=base.split('  private GuidedControllerCutFixture prepareGuidedControllerCut(\n      SourceStopOwner owner,\n      Scenario[] created,',1)[1]
assert prep.index('created[0] = scenario;')<prep.index('BY_SESSION.put(id, scenario);')<prep.index('dispatch.assign(controller, id, "assign", "worker-1");')
assert 'Scenario[] created = new Scenario[1];' in base and 'prepareGuidedControllerCut(owner, created, controllerService)' in base
relay=base.split('  private static void relay(com.sun.net.httpserver.HttpExchange raw)',1)[1]
assert relay.index('authenticateRelay(')<relay.index('C.parseWire(received)')<relay.index('scenario = BY_SESSION.get(id);')<relay.index('scenario.peerFailure.set(failure);')<relay.index('exchange.sendResponseHeaders(500, -1);')
assert 'if (scenario != null) {\n        scenario.peerFailure.set(failure);' in relay
source=base.splitlines();assert 'dispatch.assign(' in source[3077] and 'planner(' in source[3080]
# Every quoted primary SOURCE line is verified; no trust in author status booleans.
client=R/author['mainSource']['path'];assert sha(client)==author['mainSource']['sha256'];cl=client.read_text().splitlines()
for row in author['mainSource']['quotes']:assert cl[row['line']-1]==row['text']
for row in author['formattedCandidateQuotes']:assert source[row['line']-1]==row['text']

# Only closed site/frame grammar extensions; all old transport constraints exact.
init=(D/'filtered-output.init.gradle').read_text();oldinit=(T/'early/gs-t-draft/resume4-finite-observation/filtered-output.init.gradle').read_text()
assert init.replace('|CUT_PEER','',1).replace('|PEER_CALLBACK|PEER_RELAY','',1)==oldinit
assert "p.tasks.named('test', Test).configure" in init and 't.testLogging.showStandardStreams = false' in init and 'record.length() <= 768' in init
assert "p.projectDir.canonicalFile == new File(expected, 'buildSrc').canonicalFile && gradle.parent != null" in init
assert "if (p.projectDir.canonicalFile != expected) throw new GradleException" in init
grammar=re.search(r'if \(record ==~ /(.*)/\) t.logger.lifecycle\(record\)',init).group(1);pattern=re.compile(grammar)
def accept(record):
    if record is None or len(record)>768:return False
    if record.endswith('\r\n'):record=record[:-2]
    elif record.endswith('\n'):record=record[:-1]
    return pattern.fullmatch(record) is not None
record='GST_DIAG|site=CUT_PEER|route=NONE|status=NONE|family=OTHER|code=UNPROVEN|frame=NONE|line=0'
valid=[record,record.replace('family=OTHER','family=ASSERTION').replace('frame=NONE','frame=PEER_CALLBACK').replace('line=0','line=123'),record.replace('family=OTHER','family=IO').replace('frame=NONE','frame=PEER_RELAY')+'\r\n']
invalid=[record.replace('code=UNPROVEN','code=SYNTHETIC_RAW_MESSAGE'),record+'\n'+record,record.replace('frame=NONE','frame=arbitrary.Class.method'),record+'|sessionId=SYNTHETIC',record.replace('line=0','line=100000'),record[:45],record+' '*769]
assert all(accept(x) for x in valid) and not any(accept(x) for x in invalid)
adoption=read(T/'resume2-gst-unit03-qualified-incident-root-adoption.json')
assert adoption['independentReviewSha256']==sha(T/'qa/gst-unit03-closed-incident-review/review.md')
assert adoption['controlFindingRemediation'].startswith('IN_PROGRESS') and adoption['actualSourceNativeOrRetryReleased'] is False
result={'disposition':'SUPPORTED_SOURCE_ONLY_PEER_ADDENDUM_WITH_EXPLICIT_UNKNOWN_JOIN_LIMITS','dispatchPinsVerified':9,'artifactPinsVerified':6,'declaredInputPinsVerified':len(author['savedPins']),'patchHunksStrictlyReconstructed':4,'exactWholeSourceReversal':True,'preimageSha256':contract['preimageSha256'],'postimageSha256':contract['proposedPostimageSha256'],'classifierOnlySiteSubstitution':True,'existingPeerReferenceReadsAdded':1,'peerSubjectStateWritesAdded':0,'sourceScenarioAssociationProved':True,'sameRequestOrFirstCauseJoinProved':False,'nullOverwritePreScenarioAndLateWriteRemainUnproven':True,'onlyNewSite':'CUT_PEER','onlyNewFrames':['PEER_CALLBACK','PEER_RELAY'],'oldVocabularyAndFilterOtherwiseExact':True,'callbackObserverAndOldFlowUntouched':True,'pureGrammarControls':{'accepted':len(valid),'rejected':len(invalid)},'nonblockingDocumentationNote':'README cites dispatch.assign as3081; exact pinned source has dispatch.assign3078 and planner.bootstrap3081. Ordering conclusion is unchanged.','runtimeCauseOrObserverDeliveryVerified':False,'JavaCompilerFormatterGroovyOrNativeExecuted':False,'noNewLoggerJfrMainOrSourceAuthority':True,'julDeferred':True,'gst03HighControlFindingRetained':True,'sourceNativeRetryAdmissionReleased':False,'rawPrivateBodyTempJournalOrLocatorAccess':False,'budgetCeilingUsd':500,'aggregateSpendAvailable':False}
(O/'audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
