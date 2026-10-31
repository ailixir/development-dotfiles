package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import org.springframework.security.core.Authentication;

/** Pending needs are cumulative and materialize through the actual closed bridge allocator. */
public final class GuidedDependencyPlanner {
  private final GuidedSessionService sessions;

  public GuidedDependencyPlanner(GuidedSessionService sessions) {
    this.sessions = sessions;
  }

  public void validate(JsonNode session, JsonNode plan) {
    Map<String, Integer> order = new HashMap<>();
    int index = 0;
    for (JsonNode step : session.path("sourceSteps")) {
      order.put(step.path("stepId").asText(), index++);
    }
    var needs = new HashSet<String>();
    for (JsonNode need : plan.path("needs")) {
      String id = need.path("needId").asText(), producer = need.path("producerStepId").asText();
      require(needs.add(id) && order.containsKey(producer), "BINDING_ORDER", 422);
      boolean produced = false;
      for (JsonNode obligation : plan.path("obligations")) {
        produced |=
            obligation.path("stepId").asText().equals(producer)
                && obligation.path("needId").asText().equals(id);
      }
      require(produced, "MISSING_SOURCE", 409);
      for (JsonNode consumer : need.path("consumers")) {
        Integer at = order.get(consumer.path("stepId").asText());
        require(at != null && at > order.get(producer), "BINDING_ORDER", 422);
      }
    }
    // Needs are derived from the obligations' needIds and uses, so the reverse also holds: every
    // needId an obligation produces names one of the plan's needs and sits at its producer step.
    var byId = new HashMap<String, JsonNode>();
    plan.path("needs").forEach(need -> byId.put(need.path("needId").asText(), need));
    for (JsonNode obligation : plan.path("obligations")) {
      if (!obligation.path("needId").isTextual()) {
        continue;
      }
      JsonNode need = byId.get(obligation.path("needId").asText());
      require(need != null, "MISSING_SOURCE", 409);
      require(need.path("producerStepId").equals(obligation.path("stepId")), "BINDING_ORDER", 422);
    }
  }

  public void allocate(Authentication controller, JsonNode session, ObjectNode plan) {
    String id = session.path("sessionId").asText();
    for (JsonNode need : plan.path("needs")) {
      ObjectNode request =
          sessions.cumulativeAllocationRequest(
              controller, id, session.path("owner").path("fence").asLong(), need);
      JsonNode allocation =
          sessions.allocateBinding(
              controller,
              id,
              session.path("owner").path("fence").asLong(),
              "allocation-"
                  + com.citi.put.checks.studio.guided.session.GuidedContracts.hash(request),
              request);
      ((ObjectNode) need).set("bindingId", allocation.path("bindingId"));
    }
  }
}
