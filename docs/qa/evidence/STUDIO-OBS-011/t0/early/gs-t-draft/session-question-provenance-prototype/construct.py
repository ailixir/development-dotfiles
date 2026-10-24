"""Source-only preview construction; fixed public files only; no native actions."""
from pathlib import Path
import hashlib,json,difflib
O=Path(__file__).resolve().parent
R=next(p for p in O.parents if (p/'AGENTS.md').is_file())
B=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gs-t-draft/unit05-session-fixture-source-audit/GuidedSessionIT.java'
before=B.read_text()
assert hashlib.sha256(B.read_bytes()).hexdigest()=='18dd014435195df240db8221720b5d2cfec8d991df2c42a4ab00a63d7e9bb457'
after=before
replacements=[]
def replace(old,new):
    global after
    assert after.count(old)==1,old
    after=after.replace(old,new)
    replacements.append({'old':old,'new':new})
replace('    // Isolated real databases preserve the append-only audit trigger.', '    clarificationSubject =\n        CLARIFICATION_SUBJECTS.contains(testInfo.getTestMethod().orElseThrow().getName());\n    // Isolated real databases preserve the append-only audit trigger.')
# Exactly the two positive occurrences: the direct permitted test and pending helper.
old='    service.clarification(controller, id, 1, "ask", question);'
assert after.count(old)==2
for preceding in ['  void clarificationIsBoundToGenerationChoiceAndOriginalDeadline() {','  private String pendingClarification() {']:
    start=after.index(preceding);at=after.index(old,start)
    after=after[:at]+after[at:].replace(old,'    askObservedQuestion(id, question);',1)
replacements.append({'old':old,'new':'    askObservedQuestion(id, question);','count':2})
replace('    if (admissionSubject) planner(id).bootstrap(id);','    if (admissionSubject || clarificationSubject) planner(id).bootstrap(id);')
replace('  private boolean admissionSubject;','''  private boolean admissionSubject;
  private boolean clarificationSubject;

  private static final java.util.Set<String> CLARIFICATION_SUBJECTS =
      java.util.Set.of(
          "clarificationIsBoundToGenerationChoiceAndOriginalDeadline",
          "acceptedSelectionSurvivesRestartAndKeepsSafeScopedMapping",
          "selectionHandoffRechecksScopeFenceRevisionDeadlineAndTerminalState",
          "clarificationSelectionAndPauseChangeRollBackTogether",
          "renewalAndRecoverableTakeoverPreserveClarificationUntilActualAnswer");''')
replace('''    return o;
  }

  private ObjectNode proposal(String id)''','''    if (clarificationSubject) {
      JsonNode choice = fixture("clarification").path("choices").get(0);
      JsonNode policy = context(id).path("applicationPolicy");
      if (!policy.path("allowStructuralDiscovery").asBoolean()
          || !policy.path("policyRuleId").isTextual())
        throw new AssertionError("clarification structural policy prerequisite");
      ObjectNode node = ((com.fasterxml.jackson.databind.node.ArrayNode) o.path("nodes")).addObject();
      node.put("nodeId", choice.path("nodeId").asText())
          .put("documentId", o.path("documentId").asText())
          .put("generation", generation)
          .put("role", "textbox")
          .put("name", "Order reference")
          .put("elementType", "input")
          .put("controlType", "text")
          .put("classification", "structuralOnly")
          .put("policyRuleId", policy.path("policyRuleId").asText())
          .put("visible", true)
          .put("actionable", true)
          .put("depth", 0)
          .putNull("parentNodeId")
          .putNull("regionId")
          .putNull("formId");
      node.putArray("labelNodeIds");
      node.putArray("locatorHints").addObject()
          .put("kind", "role").put("role", "textbox").put("name", "Order reference")
          .put("exact", true);
    }
    return o;
  }

  private ObjectNode proposal(String id)''')
helper='''  /** Core question fixture: real plan and committed observation, deliberately no capture. */
  private void askObservedQuestion(String id, JsonNode question) {
    service.translationTransaction(
        controller,
        id,
        1,
        current -> {
          JsonNode document = current.document();
          JsonNode observed = current.progress().path("observation");
          JsonNode coordinate = question.path("coordinate");
          JsonNode step = document.path("sourceSteps").get(current.progress().path("stepIndex").asInt());
          long ordinal = repository.actions(id).stream()
              .filter(action -> action.path("coordinate").path("stepId").equals(coordinate.path("stepId")))
              .count();
          if (!clarificationSubject || !document.path("state").asText().equals("PROPOSING")
              || !question.path("phase").asText().equals("observed")
              || !question.path("sessionId").equals(document.path("sessionId"))
              || !question.path("scopeHash").equals(document.path("scopeHash"))
              || !question.path("documentId").equals(observed.path("documentId"))
              || !question.path("generation").equals(observed.path("generation"))
              || step == null || !step.path("stepId").equals(coordinate.path("stepId"))
              || ordinal != coordinate.path("ordinal").asLong())
            throw new AssertionError("clarification current observed coordinate prerequisite");
          var store = new com.citi.put.checks.studio.guided.translation.GuidedTranslationStore(jdbc, contracts);
          JsonNode plan = store.state(id).path("plan");
          JsonNode obligation = null;
          for (JsonNode item : plan.path("obligations")) {
            if (item.path("stepId").equals(coordinate.path("stepId"))
                && item.path("occurrence").equals(coordinate.path("ordinal"))) {
              if (obligation != null) throw new AssertionError("duplicate clarification obligation");
              obligation = item;
            }
          }
          if (obligation == null) throw new AssertionError("missing real clarification obligation");
          new com.citi.put.checks.studio.guided.translation.GuidedProposalValidator(contracts)
              .remaining(plan, obligation.path("obligationId").asText());
          var meanings = new ObjectMapper().createArrayNode();
          for (JsonNode choice : question.path("choices")) {
            JsonNode node = null;
            for (JsonNode item : observed.path("nodes")) {
              if (item.path("nodeId").equals(choice.path("nodeId"))) {
                if (node != null) throw new AssertionError("duplicate clarification observed node");
                node = item;
              }
            }
            if (node == null || !node.path("documentId").equals(question.path("documentId"))
                || !node.path("generation").equals(question.path("generation"))
                || !node.path("name").equals(choice.path("safeLabel"))
                || !node.path("role").equals(choice.path("role"))
                || !node.path("regionId").equals(choice.path("region"))
                || !choice.path("labelSource").asText().equals("PAGE")
                || !choice.path("bindingId").isNull()
                || node.path("locatorHints").size() != 1)
              throw new AssertionError("clarification committed node prerequisite");
            JsonNode locator = node.path("locatorHints").get(0);
            int matches = 0;
            for (JsonNode item : observed.path("nodes")) {
              if (item.path("role").equals(locator.path("role"))
                  && item.path("name").equals(locator.path("name"))) matches++;
            }
            if (!locator.path("kind").asText().equals("role")
                || !locator.path("exact").asBoolean()
                || !locator.path("role").equals(node.path("role"))
                || !locator.path("name").equals(node.path("name")) || matches != 1)
              throw new AssertionError("clarification unique committed locator prerequisite");
            ObjectNode meaning = contracts.object();
            meaning.set("obligationId", obligation.path("obligationId"));
            meaning.set("nodeId", node.path("nodeId"));
            meaning.set("bindingId", choice.path("bindingId"));
            meaning.set("locator", locator.deepCopy());
            contracts.validate("v3/replay-validation#/definitions/ObservedQuestionMeaning", meaning);
            ObjectNode mapping = meanings.addObject();
            mapping.set("choiceId", choice.path("choiceId"));
            mapping.set("meaning", meaning);
          }
          service.translationQuestion(controller, id, 1, "ask", question, meanings);
          return null;
        });
  }

'''
replace('  private ObjectNode clarificationAnswer() {',helper+'  private ObjectNode clarificationAnswer() {')
O.joinpath('GuidedSessionIT.java').write_text(after)
rel='backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java'
for name,a,b in [('delta-from-18dd.patch',before,after),('restore-18dd.patch',after,before)]:
    O.joinpath(name).write_text(''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),'a/'+rel,'b/'+rel,n=3)))
O.joinpath('exact-replacements.json').write_text(json.dumps(replacements,indent=2)+'\n')
