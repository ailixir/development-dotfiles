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

definitions={
 'M-gate-false':('    return actual.equals(itrExpectedInvocationMultiset());','    return false;'),
 'M-empty-canaries':('  private static void itrAssertAuditCorpus() {','  private static void itrAssertAuditCorpus() {\n    AUDIT_CANARIES.clear();'),
 'M-missing-admitted':('  private static void itrAssertAuditCorpus() {\n    var events = new java.util.ArrayList<>(AUDIT_EVENTS.list);','  private static void itrAssertAuditCorpus() {\n    var events = new java.util.ArrayList<>(AUDIT_EVENTS.list);\n    events.removeIf(event -> event.getFormattedMessage().equals("GUIDED_ACTION_ADMITTED"));'),
 'M-missing-dispatch':('  private static void itrAssertAuditCorpus() {\n    var events = new java.util.ArrayList<>(AUDIT_EVENTS.list);','  private static void itrAssertAuditCorpus() {\n    var events = new java.util.ArrayList<>(AUDIT_EVENTS.list);\n    events.removeIf(event -> event.getFormattedMessage().equals("REPLAY_DISPATCHED"));'),
 'M-omit-variant':('for (int ordinal = 0; ordinal < INCREMENTAL_VARIANTS.size(); ordinal++)','for (int ordinal = 1; ordinal < INCREMENTAL_VARIANTS.size(); ordinal++)'),
 'M-duplicate-variant':('    return expected;\n  }','    if (FIXTURE_PROFILE == FixtureProfile.INCREMENTAL_2048) {\n      String key = "incrementalStructuralEditsAndExplicitRelearningUseTheActualJoinedBrowser/"\n          + INCREMENTAL_VARIANTS.get(0) + "/1";\n      expected.put(key, 2L);\n    }\n    return expected;\n  }')}
mutants=[]
for name,(before,after) in definitions.items():
    assert SOURCE.count(before)==1,name
    row=store('mutations',name,SOURCE.replace(before,after,1));row['mutantSha256']=row.pop('variantSha256')
    row['proof']='Original named assertion red after genuine Order39 corpus' if name in ['M-empty-canaries','M-missing-admitted','M-missing-dispatch'] else 'Exact mutant SHA accepted first, then exact whole-profile/final-control evidence rejected; full-class slot counts toward6'
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
old_plan.update(mutants=mutants,contentNegativeControlsPrepared=negative)
(OUT/'mutation-plan.json').write_text(json.dumps(old_plan,indent=2)+'\n')
print(json.dumps({'canonicalTest001Sha256':sha(SOURCE),'reversed':1,'mutants':len(mutants),'negativeControls':len(negative)}))
