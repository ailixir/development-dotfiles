package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.translation.GroundingItHarness.Spec;
import com.citi.put.checks.studio.support.ObservationFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * ADR-SC-007 D-6, on a real PostgreSQL: an earlier answer of the author is only a semantic choice
 * ({role, name, evidence}) that is re-established on every later page by a count. When the page no
 * longer holds exactly one such element the obligation asks again, and the latest accepted answer
 * for the obligation supersedes the earlier ones: the earlier rows stay in the database, take no
 * part in any later decision, and never enter the publication basis.
 */
class GuidedClarificationSupersessionIT {
  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine");

  @BeforeAll
  static void start() {
    POSTGRES.start();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  private static ObservationFixtures.Builder page() {
    return ObservationFixtures.observation().readRuleId("observed-read-v1-" + "a".repeat(64));
  }

  private static JsonNode firstObligation(GuidedModelRequest request) {
    return request.projection().document().path("obligations").get(0);
  }

  @Test
  void latestAcceptedAnswerSupersedesEarlierOnes() throws Exception {
    // The action guard grounds the name of the element finally clicked in the authored step.
    var h = new GroundingItHarness(POSTGRES, "Click Save order.");
    String id = h.session(List.of(Spec.click(0, "Save")));

    // Question 1: two elements both fit the intent "Save"; the author is asked.
    h.observe(
        id,
        1,
        page().element("e1", "button", "Save draft").element("e2", "button", "Save order").build());
    h.reply(GuidedModelRequest.Kind.NEXT_ACTION, request -> h.clarification(request, "e1", "e2"));
    h.advance(id);
    assertThat(h.state(id)).isEqualTo("AWAITING_CLARIFICATION");
    String first = h.progress(id).path("clarification").path("clarificationId").asText();
    h.answer(id, 0);
    assertThat(h.state(id)).isEqualTo("OBSERVING");

    // The page is fresh and the chosen element is gone: no fact equals {button, Save draft}.
    // The model is told to reconfirm, with no earlier choice named, and asks again.
    h.refreshWith(
        generation ->
            page()
                .element("e1", "button", "Save as draft")
                .element("e2", "button", "Save order")
                .build());
    h.reply(
        GuidedModelRequest.Kind.NEXT_ACTION,
        request -> {
          JsonNode obligation = firstObligation(request);
          assertThat(obligation.path("reconfirm").asBoolean()).isTrue();
          assertThat(obligation.has("selectedChoice")).isFalse();
          return h.clarification(request, "e1", "e2");
        });
    h.advance(id);
    assertThat(h.state(id)).isEqualTo("AWAITING_CLARIFICATION");
    String second = h.progress(id).path("clarification").path("clarificationId").asText();
    assertThat(second).isNotEqualTo(first);
    h.answer(id, 1);
    assertThat(h.state(id)).isEqualTo("OBSERVING");

    // Only the latest accepted answer counts; both rows remain.
    List<ObjectNode> effective = h.repository.transaction(() -> h.questions.effectiveObserved(id));
    assertThat(effective).hasSize(1);
    assertThat(effective.getFirst().path("context").path("clarificationId").asText())
        .isEqualTo(second);
    assertThat(
            h.jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_clarification_contexts WHERE session_id=?",
                Integer.class,
                id))
        .isEqualTo(2);
    assertThat(
            h.jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_clarification_contexts WHERE session_id=? AND"
                    + " accepted_choice IS NOT NULL",
                Integer.class,
                id))
        .isEqualTo(2);
    JsonNode selection = effective.getFirst().path("meanings").get(1).path("selection");
    assertThat(selection.path("name").asText()).isEqualTo("Save order");

    // The next page holds exactly one element equal to the latest choice: the model is told its
    // role, name and fresh ref and nothing else, and the audit records that the choice admitted it.
    h.reply(
        GuidedModelRequest.Kind.NEXT_ACTION,
        request -> {
          JsonNode obligation = firstObligation(request);
          assertThat(obligation.has("reconfirm")).isFalse();
          assertThat(obligation.path("selectedChoice"))
              .isEqualTo(
                  h.contracts
                      .object()
                      .put("role", "button")
                      .put("name", "Save order")
                      .put("ref", "e2"));
          assertThat(request.projection().document().toString()).doesNotContain("evidence");
          return h.click(request, "e2");
        });
    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(GroundingItHarness.ReachedRunner.class);
    assertThat(h.intentRows(id)).hasSize(1);
    assertThat(h.intentRows(id).getFirst().getFirst()).isEqualTo("SELECTED_CHOICE");
    assertThat(h.rejectionGates(id)).isEqualTo(Map.of());
  }
}
