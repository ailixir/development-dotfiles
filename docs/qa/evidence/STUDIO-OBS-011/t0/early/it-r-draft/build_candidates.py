"""Assemble complete off-tree TEST001 then cumulative direct-wait candidates."""
from pathlib import Path
import json,re,hashlib,difflib,csv
from inspect_loops import SRC,mask_java
OUT=Path(__file__).resolve().parent
REL=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
LOOPS=json.loads((OUT/'loop-sites.json').read_text())
EDITS=json.loads((OUT/'poll-edits.json').read_text())
ROWS=list(csv.DictReader((OUT.parent/'11-IT-R/sleep-table.tsv').open(),delimiter='\t'))
sha=lambda data:hashlib.sha256(data.encode()).hexdigest()

def body_span(source,name):
    mask=mask_java(source)
    matches=list(re.finditer(r'\b'+re.escape(name)+r'\s*\(',mask));found=[]
    for m in matches:
        line=mask[mask.rfind('\n',0,m.start())+1:m.start()]
        if not re.match(r'\s*(?:(?:private|public|protected|static|final|synchronized)\s+)*(?:[\w.$<>?,\[\] ]+\s+)?$',line):continue
        opening=mask.find('{',m.end());semi=mask.find(';',m.end())
        if semi>=0 and semi<opening:continue
        depth=1;i=opening+1
        while depth:
            if mask[i]=='{':depth+=1
            if mask[i]=='}':depth-=1
            i+=1
        found.append((opening+1,i-1))
    assert len(found)==1,(name,found)
    return found[0]

def change_body(source,name,fn):
    a,b=body_span(source,name);return source[:a]+fn(source[a:b])+source[b:]

DEPENDENCY_EDITS=[]
def test001(source):
    def exact(old,new,label):
        nonlocal source
        assert source.count(old)==1,(label,source.count(old))
        source=source.replace(old,new,1);DEPENDENCY_EDITS.append(label)
    exact('  private UUID publishedTestId;\n  private String currentPublishedSession;\n  private JsonNode currentPublishedReceipt;',
          (OUT/'test001_helpers.java.txt').read_text().rstrip(),'replace cross-test publication memo with real invocation-owned setup')
    exact('    publishedTestId = testId;\n','', 'remove Order1 cross-test publication write')
    exact('    currentPublishedSession = secondSession;\n    currentPublishedReceipt = nextReceipt.deepCopy();\n','',
          'remove scheduler helper cross-test publication writes')
    exact('    UUID testId = publishedTestId;','    ItrPublishedFixture own = itrFreshPublishedFixture();\n    UUID testId = own.testId();',
          'Order2 always constructs its own real publication')
    name='editedSourceKeepsHistoricalReceiptWithoutRegainingReplayReadiness'
    source=change_body(source,name,lambda body:'\n    ItrPublishedFixture own = itrFreshPublishedFixture();\n'
        +'    UUID publishedTestId = own.testId();\n    String currentPublishedSession = own.sessionId();\n'
        +'    JsonNode currentPublishedReceipt = own.receipt();'+body)
    # These are exactly the actual early readers lacking their own class construction.
    readers=['asynchronousReceiptRequiresPassiveLearningAndTwoFreshRecordedReplays',
      'modelAndSourceQuestionTimeDoNotConsumePassiveBrowserAllowance',
      'absentTargetStopsOnAllowanceOrCancellationWithoutRepeatingSubmittedWork',
      'observedAlternateChoiceSurvivesHumanAndModelDelayAndTwoFreshRecordedReplays',
      'originalQuestionDriftAndSqlCaptureRefusalRollbackAndCommitUsageWithoutAnotherCall',
      'actualSecretLoginPublishesValueFreeAndTwoOrdinaryRunsResolveFreshWithoutModel',
      'guidedRecorderFaultSettlesUnavailableAndTheSessionStillFinishes']
    for name in readers:
        source=change_body(source,name,lambda body:'\n    itrEnsureClassFixtures();'+body)
    first='actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues'
    def relative(body):
        body='\n    final int itrNav0 = NAVIGATIONS.get(), itrRec0 = RECEIPTS.size(), itrVal0 = VALUES.size();'+body
        body=body.replace('assertThat(RECEIPTS).containsExactly(VALUES.get(0));',
          'assertThat(RECEIPTS.subList(itrRec0, RECEIPTS.size())).containsExactly(VALUES.get(itrVal0));')
        for n in [1,3]:
            body=body.replace(f'assertThat(NAVIGATIONS.get()).isEqualTo({n});',f'assertThat(NAVIGATIONS.get()).isEqualTo(itrNav0 + {n});')
            body=body.replace(f'assertThat(RECEIPTS).hasSize({n});',f'assertThat(RECEIPTS).hasSize(itrRec0 + {n});')
        body=body.replace('assertThat(RECEIPTS).containsExactlyElementsOf(VALUES);',
          'assertThat(RECEIPTS.subList(itrRec0, RECEIPTS.size()))\n        .containsExactlyElementsOf(VALUES.subList(itrVal0, VALUES.size()));')
        return body
    source=change_body(source,first,relative)
    exact('      this.values = values;\n      encoded = new C5CanaryStream(values);',
          '      this.values = values;\n      AUDIT_CANARIES.addAll(values);\n      encoded = new C5CanaryStream(values);',
          'each C5 registers actual canaries before any relevant producer')
    # Audit content stays byte-equivalent at every existing scan boundary.
    a,b=body_span(source,'scanCompleteAuditStream');old_body=source[a:b]
    marker='    for (var event : events) {';split=old_body.index(marker)
    controls=old_body[:split]
    content=old_body[split:]
    declaration=source.rfind('  private static void scanCompleteAuditStream()',0,a)
    assert declaration>=0
    source=source[:declaration]+'''  private static void scanCompleteAuditStream() {
    scanAuditContent();
    if (itrExactWholeLaneObserved()) {
      itrAssertAuditCorpus();
      ITR_FINAL_CORPUS_CHECKS.incrementAndGet();
    }
  }

  private static void itrAssertAuditCorpus() {'''+controls+'''
    ITR_AUDIT_CORPUS_CHECKS.incrementAndGet();
  }

  private static void scanAuditContent() {
    var events = new java.util.ArrayList<>(AUDIT_EVENTS.list);
'''+content+'''
    ITR_AUDIT_CONTENT_SCANS.incrementAndGet();
  }'''+source[b+1:]
    # Local C5 scope checks all bytes, but never substitutes a prior test's positive corpus.
    a,b=body_span(source,'close') if False else (None,None)
    old='''                scanCompleteAuditStream();
'''
    # Actual C5 close call is anchored by its pre-deletion context, not guessed global count.
    close_start=source.index('  private final class C5Capture')
    close_end=source.index('  private void collectJoinedSinks',close_start)
    segment=source[close_start:close_end]
    assert segment.count('GuidedPublicationReplayIT::scanCompleteAuditStream')==1
    segment=segment.replace('GuidedPublicationReplayIT::scanCompleteAuditStream','GuidedPublicationReplayIT::scanAuditContent',1)
    segment=segment.replace('// Same complete audit assertions before this earlier private-capture deletion boundary.',
      '// Same audit-content assertions before private capture deletion; whole-corpus controls run at exact final lane boundaries.')
    source=source[:close_start]+segment+source[close_end:]
    source=source.replace('  void auditStreamCarriesIdsAndCodesOnlyAcrossTheWholeClass() {\n    scanCompleteAuditStream();\n  }',
      '''  void auditStreamCarriesIdsAndCodesOnlyAcrossTheWholeClass() throws Exception {
    itrEstablishOwnAuditCorpus();
    scanAuditContent();
    itrAssertAuditCorpus();
  }''',1)
    exact('''            .put("auditComplete", true);''','''            .put("auditComplete", true)
            .put("exactLaneObserved", itrExactWholeLaneObserved())
            .put("expectedInvocations", itrExpectedInvocationMultiset().size())
            .put("observedInvocations", FIXTURE_INVOCATIONS.size())
            .put("corpusControlChecks", ITR_AUDIT_CORPUS_CHECKS.get())
            .put("finalCorpusControlChecks", ITR_FINAL_CORPUS_CHECKS.get())
            .put("contentScans", ITR_AUDIT_CONTENT_SCANS.get());''',
          'value-free exact-profile/control execution facts retained for independent reconciliation')
    return source

def patch(before,after):
    return ''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),
        fromfile='a/'+str(REL),tofile='b/'+str(REL)))

def assemble(selected,excluded_ids=()):
    source=SRC
    for loop,edit in sorted(zip(LOOPS,EDITS),key=lambda x:x[0]['start'],reverse=True):
        if loop['rows'][0]['batch'] in selected and not set(loop['ids']).intersection(excluded_ids):
            assert source[loop['start']:loop['end']]==edit['source']
            source=source[:loop['start']]+edit['replacement']+source[loop['end']:]
    return test001(source)

if __name__=='__main__':
    previous=SRC;stages=[]
    for number,batchset in enumerate([[],['B1'],['B1','B2'],['B1','B2','B3'],['B1','B2','B3','B4']]):
        name='00-test001' if not batchset else f'{number:02d}-'+batchset[-1].lower()
        candidate=assemble(batchset);stage=OUT/'stages'/name;target=stage/'repo'/REL
        target.parent.mkdir(parents=True,exist_ok=True);target.write_text(candidate)
        incremental=patch(previous,candidate);(stage/'incremental.patch').write_text(incremental)
        cumulative=patch(SRC,candidate);(stage/'from-original.patch').write_text(cumulative)
        stages.append(dict(stage=name,batches=batchset,sourceSha256=sha(previous),
          candidateSha256=sha(candidate),incrementalPatchSha256=sha(incremental),
          fromOriginalPatchSha256=sha(cumulative),remainingSleeps=len(re.findall(r'\.sleep\(',candidate))))
        previous=candidate
    # Full conversions remain authored above; this alternative explicitly carries unproved fault paths.
    carries=[1,2,4,6,93,95]
    candidate=assemble(['B1','B2','B3','B4'],carries)
    previous=(OUT/'stages/03-b3/repo'/REL).read_text()
    name='04-b4-carry6';stage=OUT/'stages'/name;target=stage/'repo'/REL
    target.parent.mkdir(parents=True,exist_ok=True);target.write_text(candidate)
    incremental=patch(previous,candidate);cumulative=patch(SRC,candidate)
    (stage/'incremental.patch').write_text(incremental);(stage/'from-original.patch').write_text(cumulative)
    stages.append(dict(stage=name,batches=['B1','B2','B3','B4'],carriedPollIds=carries,
      sourceSha256=sha(previous),candidateSha256=sha(candidate),incrementalPatchSha256=sha(incremental),
      fromOriginalPatchSha256=sha(cumulative),remainingSleeps=len(re.findall(r'\.sleep\(',candidate))))
    (OUT/'stages.json').write_text(json.dumps(stages,indent=2)+'\n')
    print(json.dumps(stages,indent=2))
