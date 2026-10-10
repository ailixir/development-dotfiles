package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.HashSet;
import java.util.List;

/** Reconciles admitted obligations with independent committed execution evidence. */
public final class GuidedStepVerifier {
  private final GuidedTranslationStore store;

  public GuidedStepVerifier(GuidedTranslationStore store) {
    this.store = store;
  }

  public boolean complete(JsonNode session, JsonNode completion, List<ObjectNode> actions) {
    String id = session.path("sessionId").asText(), step = completion.path("stepId").asText();
    JsonNode plan = store.state(id).path("plan");
    var matched = new HashSet<String>();
    int expected = 0;
    for (JsonNode obligation : plan.path("obligations")) {
      if (!obligation.path("stepId").asText().equals(step)) {
        continue;
      }
      expected++;
      ObjectNode association = store.obligation(id, obligation.path("obligationId").asText());
      if (association == null || association.path("admissionId").isNull()) {
        return false;
      }
      String admission = association.path("admissionId").asText();
      var action =
          actions.stream()
              .filter(a -> a.path("admission").path("admissionId").asText().equals(admission))
              .findFirst();
      if (action.isEmpty()
          || !matched.add(admission)
          || !action.get().path("state").asText().equals("SUCCEEDED")
          || action.get().path("dispatchCount").asInt() != 1
          || !action
              .get()
              .path("requestDigest")
              .asText()
              .equals(GuidedContracts.hash(association.path("proposal")))
          || obligation.path("operationKind").asText().equals("assert")
              && !action.get().path("assertionPassed").asBoolean()) {
        return false;
      }
    }
    return expected > 0 && expected == actions.size();
  }
}
