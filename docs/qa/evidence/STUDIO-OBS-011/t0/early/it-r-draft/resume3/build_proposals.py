"""Rebuild inert reversed-order, corpus-mutant and content-negative patches against TEST001."""
from pathlib import Path
import json,re,difflib,hashlib
OUT=Path(__file__).resolve().parent
REL=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
SOURCE=(OUT/'stages/00-test001/repo'/REL).read_text()
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
diff=lambda a,b:''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile='a/'+str(REL),tofile='b/'+str(REL)))

def store(folder,name,variant):
    root=OUT/folder/name;root.mkdir(parents=True,exist_ok=True)
    target=root/'repo'/REL;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(variant)
    patch=diff(SOURCE,variant);(root/'from-test001.patch').write_text(patch)
    (root/'restore-test001.patch').write_text(diff(variant,SOURCE))
    return dict(id=name,baseSha256=sha(SOURCE),variantSha256=sha(variant),patchSha256=sha(patch),executed=False)

reverse=SOURCE
for method,old,new in [('queuedAndPreReadyRefusals',2,3),('editedSourceKeepsHistoricalReceiptWithoutRegainingReplayReadiness',3,2),
  ('actualPoolDefiniteRefusalThenFreshSecretAttemptResolvesRotatedValue',27,28),('actualScopedVaultOutageThenFreshSecretAttemptResolvesRotatedValue',28,27)]:
    pattern=r'(@org\.junit\.jupiter\.api\.Order\()'+str(old)+r'(\)\s+void '+method+r'\()'
    reverse,count=re.subn(pattern,lambda m:m[1]+str(new)+m[2],reverse);assert count==1
row=store('variants','reversed-orders',reverse)
target=OUT/'variants/reversed-orders/repo'/REL;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(reverse)
(OUT/'variants/reversed-orders/identity.json').write_text(json.dumps(row,indent=2)+'\n')

# Boundary-only mutator: Order39 calls itrAssertAuditCorpus directly and never activates this field.
def final_boundary_variant(name):
    variant=SOURCE
    start=variant.index('  private static void scanCompleteAuditStream() {')
    end=variant.index('  private static void itrAssertAuditCorpus()',start)
    old=variant[start:end]
    new='''  private static boolean itrFinalFaultActive;

  private static boolean itrActualMultiplicityComplete() {
    var actual = FIXTURE_INVOCATIONS.stream().collect(java.util.stream.Collectors.groupingBy(
        invocation -> invocation.method + "/" + invocation.variant + "/" + invocation.variantOrdinal,
        java.util.TreeMap::new, java.util.stream.Collectors.counting()));
    return actual.equals(itrExpectedInvocationMultiset());
  }

  private static void scanCompleteAuditStream(String itrBoundary, boolean itrDrained, boolean itrContextClosed) throws Exception {
    scanAuditContent();
    if (itrExactWholeLaneObserved()) {
      var activation = C.object()
          .put("schemaVersion", 1).put("fault", "FAULT")
          .put("boundary", itrBoundary).put("lane", FIXTURE_PROFILE.lane)
          .put("producersDrained", itrDrained).put("contextClosed", itrContextClosed)
          .put("actualMultiplicityComplete", itrActualMultiplicityComplete())
          .put("realCanaryCount", AUDIT_CANARIES.size())
          .put("realAdmittedCount", AUDIT_EVENTS.list.stream().filter(event -> event.getFormattedMessage().equals("GUIDED_ACTION_ADMITTED")).count())
          .put("realDispatchedCount", AUDIT_EVENTS.list.stream().filter(event -> event.getFormattedMessage().equals("REPLAY_DISPATCHED")).count())
          .put("observedInvocations", FIXTURE_INVOCATIONS.size())
          .put("expectedInvocations", itrExpectedInvocationMultiset().size())
          .put("bodyCorpusChecksBeforeActivation", ITR_AUDIT_CORPUS_CHECKS.get())
          .put("finalCorpusChecksBeforeActivation", ITR_FINAL_CORPUS_CHECKS.get())
          .put("contentScansBeforeActivation", ITR_AUDIT_CONTENT_SCANS.get());
      privateImmutableJson(COHORT_DIRECTORY.resolve("privacy-itr-final-fault-" + itrBoundary + ".json"), activation);
      itrFinalFaultActive = true;
      try {
        itrAssertAuditCorpus();
        ITR_FINAL_CORPUS_CHECKS.incrementAndGet();
      } finally {
        itrFinalFaultActive = false;
      }
    }
  }

'''.replace('FAULT',name)
    variant=variant[:start]+new+variant[end:]
    # Only the two actual final boundaries remain after canonical TEST001's Order39/C5 transformations.
    assert variant.count('scanCompleteAuditStream();')==2
    variant=variant.replace('scanCompleteAuditStream();','scanCompleteAuditStream("OWNED_SINKS", drained, ownedApplicationQuiescent);',1)
    variant=variant.replace('scanCompleteAuditStream();','scanCompleteAuditStream("CONTEXT_CLOSED", finalProducersDrained, ownedApplicationQuiescent);',1)
    anchor='  private static void itrAssertAuditCorpus() {\n    var events = new java.util.ArrayList<>(AUDIT_EVENTS.list);'
    assert variant.count(anchor)==1
    if name=='M-empty-canaries':
        # Local observation override only; preserve real global canaries and all earlier bodies.
        before='assertThat(AUDIT_CANARIES).as("the OBS-007 case registered its canaries").isNotEmpty();'
        assert variant.count(before)==1
        variant=variant.replace(before,'assertThat(itrFinalFaultActive ? java.util.List.<String>of() : AUDIT_CANARIES)'
          +'.as("the OBS-007 case registered its canaries").isNotEmpty();',1)
    elif name in ['M-missing-admitted','M-missing-dispatch']:
        event='GUIDED_ACTION_ADMITTED' if name=='M-missing-admitted' else 'REPLAY_DISPATCHED'
        variant=variant.replace(anchor,anchor+'\n    if (itrFinalFaultActive) events.removeIf(event -> event.getFormattedMessage().equals("'+event+'"));',1)
    elif name=='M-gate-true-subset':
        before='    return actual.equals(itrExpectedInvocationMultiset());';assert variant.count(before)==2
        # Canonical gate is earlier in the helper block; independent receipt predicate stays genuine.
        variant=variant.replace(before,'    return true;',1)
    else:raise ValueError(name)
    return variant

definitions={
 'M-gate-false':('    return actual.equals(itrExpectedInvocationMultiset());','    return false;'),
 'M-omit-variant':('for (int ordinal = 0; ordinal < INCREMENTAL_VARIANTS.size(); ordinal++)','for (int ordinal = 1; ordinal < INCREMENTAL_VARIANTS.size(); ordinal++)'),
 'M-duplicate-variant':('    return expected;\n  }','    if (FIXTURE_PROFILE == FixtureProfile.INCREMENTAL_2048) {\n      String key = "incrementalStructuralEditsAndExplicitRelearningUseTheActualJoinedBrowser/"\n          + INCREMENTAL_VARIANTS.get(0) + "/1";\n      expected.put(key, 2L);\n    }\n    return expected;\n  }')}

mutants=[]
for name,(before,after) in definitions.items():
    assert SOURCE.count(before)==1,name
    row=store('mutations',name,SOURCE.replace(before,after,1));row['mutantSha256']=row.pop('variantSha256')
    row['proof']='Original named assertion red after genuine Order39 corpus' if name in ['M-empty-canaries','M-missing-admitted','M-missing-dispatch'] else 'Exact mutant SHA accepted first, then exact whole-profile/final-control evidence rejected; full-class slot counts toward6'
    mutants.append(row)

for name in ['M-empty-canaries','M-missing-admitted','M-missing-dispatch','M-gate-true-subset']:
    variant=final_boundary_variant(name)
    row=store('mutations',name,variant);row['mutantSha256']=row.pop('variantSha256')
    target=OUT/'mutations'/name/'repo'/REL;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(variant)
    row['proof']='Accept exact mutant source first; original corpus assertion must fail ONLY after privacy-itr-final-fault-OWNED_SINKS.json activation receipt at exact final complete-profile boundary. Genuine Order39 body remains intact.'
    if name=='M-gate-true-subset':
        row['proof']='Existing syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls singleton; real complete-profile predicate is forced true, actual subset invocation count1 must be shown, final nonempty-canary assertion red after activation. No setup/source-hash red counts.'
    row['boundaries']=['OWNED_SINKS','CONTEXT_CLOSED'];row['activationSourceSha256']=sha(variant)
    row['expectedAssertion']='the OBS-007 case registered its canaries' if name in ['M-empty-canaries','M-gate-true-subset'] else ('GUIDED_ACTION_ADMITTED' if name=='M-missing-admitted' else 'REPLAY_DISPATCHED')
    row['fullClassSlotCost']=0 if name=='M-gate-true-subset' else 1
    mutants.append(row)

negative=[]
old='''    itrEstablishOwnAuditCorpus();
    scanAuditContent();
    itrAssertAuditCorpus();'''
for name,key,value in [('N-canary','first.getFieldName()','TEXT.get(0)'),('N-key-shape','"unexpectedKey"','"closed-control"'),('N-size','first.getFieldName()','"x".repeat(2048)')]:
    body='''    itrEstablishOwnAuditCorpus();
    var actual = new java.util.ArrayList<>(AUDIT_EVENTS.list).getFirst();
    var hostile = new ch.qos.logback.classic.spi.LoggingEvent();
    hostile.setMessage(actual.getFormattedMessage());
    Object[] arguments = actual.getArgumentArray().clone();
    var first = (net.logstash.logback.marker.SingleFieldAppendingMarker) arguments[0];
    arguments[0] = net.logstash.logback.argument.StructuredArguments.kv(KEY, VALUE);
    hostile.setArgumentArray(arguments);
    try {
      itrNegativeAuditEvents = java.util.List.of(hostile);
      assertThatThrownBy(GuidedPublicationReplayIT::scanAuditContent)
          .as("the original content scanner rejects this bounded hostile copy")
          .isInstanceOf(AssertionError.class);
    } finally {
      itrNegativeAuditEvents = null;
    }
    scanAuditContent();
    itrAssertAuditCorpus();'''.replace('KEY',key).replace('VALUE',value)
    assert SOURCE.count(old)==1
    variant=SOURCE.replace(old,body,1)
    before='''  private static void scanAuditContent() {
    var events = new java.util.ArrayList<>(AUDIT_EVENTS.list);'''
    after='''  private static java.util.List<ch.qos.logback.classic.spi.ILoggingEvent> itrNegativeAuditEvents;

  private static void scanAuditContent() {
    var events = new java.util.ArrayList<>(itrNegativeAuditEvents == null
        ? AUDIT_EVENTS.list : itrNegativeAuditEvents);'''
    assert variant.count(before)==1
    row=store('negative-controls',name,variant.replace(before,after,1))
    row['expected']='Original scanner rejects hostile COPY under caught AssertionError. Variant-only input override cleared in finally; actual global audit events never removed/mutated; genuine corpus established first and rescanned afterward.'
    negative.append(row)
old_plan=json.loads((OUT/'mutation-plan.json').read_text())
old_plan.update(mutants=mutants,contentNegativeControlsPrepared=negative,
 budget='UNRESOLVED: canonical staged/twice-green minimum6 plus3 boundary vacuity plus3 existing gate/variant independent full-class controls =minimum12 against cap6. No carry selected or automatic extension; named PO/QA ruling required. Every actual full-class command/error consumes a slot.',
 sourceGateMutationVerifier='verify_future_run.py accepts exact gate-false/omit/duplicate mutant source SHA before rejecting missing complete-profile controls; verify_mutation_run.py reconciles the exact mutant SHA/XML/cohort evidence and reports closed gate evidence rejection. A source mismatch/setup/no-tests failure never proves a kill.',
 finalBoundaryMutationVerifier='verify_mutation_run.py accepts exact staged source first, requires all genuine body cases PASS, real final-boundary controls nonempty before fault, hashed activation receipts at OWNED_SINKS and CONTEXT_CLOSED, original actual assertion frames/description, drained native cohort, and no raw failure export. Native/privacy/ownership sufficiency remains independent QA.')
(OUT/'mutation-plan.json').write_text(json.dumps(old_plan,indent=2)+'\n')
print(json.dumps({'canonicalTest001Sha256':sha(SOURCE),'reversed':1,'mutants':len(mutants),'negativeControls':len(negative)}))
