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
      boolean hasRead = false;
      for (JsonNode obligation : plan.path("obligations")) {
        hasRead |=
            obligation.path("stepId").asText().equals(producer)
                && obligation.path("operationKind").asText().equals("read")
                && obligation.path("needId").asText().equals(id);
      }
      require(hasRead, "MISSING_SOURCE", 409);
      for (JsonNode consumer : need.path("consumers")) {
        Integer at = order.get(consumer.path("stepId").asText());
        require(at != null && at >= order.get(producer), "BINDING_ORDER", 422);
      }
    }
  }

  public void allocate(Authentication controller, JsonNode session, ObjectNode plan) {
    String id = session.path("sessionId").asText();
    for (JsonNode need : plan.path("needs")) {
      ObjectNode request = ((ObjectNode) need).deepCopy();
      request.remove("bindingId");
      JsonNode allocation =
          sessions.allocateBinding(
              controller,
              id,
              session.path("owner").path("fence").asLong(),
              "need-" + need.path("needId").asText(),
              request);
      ((ObjectNode) need).set("bindingId", allocation.path("bindingId"));
    }
  }
}
