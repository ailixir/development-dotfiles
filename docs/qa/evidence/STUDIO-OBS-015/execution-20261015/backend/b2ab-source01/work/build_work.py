import sys
base=open('base/GuidedPublicationReplayIT.java').read()
fmt=open('Block.fmt.java').read()
# members of class W: drop header line and final closing brace
assert fmt.startswith('class W {\n')
body=fmt[len('class W {\n'):]
assert body.rstrip().endswith('}')
body=body.rstrip()[:-1].rstrip('\n')+'\n'
# strip a leading blank line
body=body.lstrip('\n')
s=base
def once(old,new):
    global s
    n=s.count(old)
    assert n==1,(n,old[:80])
    s=s.replace(old,new)
# 1) contiguous block immediately after prefixProducerContextPostAckRevalidationRejectsChangedAuthorityOrEvidence
anchor_method='  void prefixProducerContextPostAckRevalidationRejectsChangedAuthorityOrEvidence() throws Exception {\n'
i=s.index(anchor_method)
nxt='\n  /** PFXSYNC-05: the contender must really win the same stored coordinate, not an earlier guard. */\n'
j=s.index(nxt,i)
# method end is the "  }\n" right before nxt
assert s[:j].endswith('\n  }\n'), repr(s[j-20:j])
s=s[:j]+'\n'+body.rstrip('\n')+'\n'+s[j:]
# 2) shared hunks (one statement each; defaults inert)
once('        + incrementalNativeFaultObserver()\n        + p4GuidedRevocationObservers()\n',
     '        + incrementalNativeFaultObserver()\n        // B2A-03 SECRET_HOLD cut layer (inert unless armed); S2 wrappers stay outermost.\n        + b2SecretContextObserver()\n        + p4GuidedRevocationObservers()\n')
once('  private static String p3LoginDocument() {\n    if (p4PasswordControls >= 0) {\n',
     '  private static String p3LoginDocument() {\n    if (b2PageArmed()) {\n      return b2LoginDocument();\n    }\n    if (p4PasswordControls >= 0) {\n')
once('        P3_RECEIPTS.add(new P3Receipt(password, values.getOrDefault("username", ""), accepted));\n',
     '        P3_RECEIPTS.add(new P3Receipt(password, values.getOrDefault("username", ""), accepted));\n        b2SignIn(values);\n')
once('          ("<!doctype html><html><body>" + document + "</body></html>")\n',
     '          ("<!doctype html><html>" + b2TitleHead(path) + "<body>" + document + "</body></html>")\n')
once('  private static ObjectNode p3Model(ObjectNode result, JsonNode context, String kind) {\n    if (kind.equals("SOURCE_PLAN")) {\n',
     '  private static ObjectNode p3Model(ObjectNode result, JsonNode context, String kind) {\n    ObjectNode b2 = b2Model(result, context, kind);\n    if (b2 != null) {\n      return b2;\n    }\n    if (kind.equals("SOURCE_PLAN")) {\n')
once('      INCREMENTAL_MODEL_CONTEXTS.add(request.deepCopy());\n      return incrementalTenModel(result, context, kind);\n',
     '      INCREMENTAL_MODEL_CONTEXTS.add(request.deepCopy());\n      b2bHoldSuffixPlan(kind, context);\n      return incrementalTenModel(result, context, kind);\n')
open('work/GuidedPublicationReplayIT.java','w').write(s)
print('ok')
