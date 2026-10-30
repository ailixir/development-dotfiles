package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-007 WI-1 AC2. The five MISSING_SOURCE SOURCE_PLAN replies recorded in
 * studio-runner/evaluation/grounding/runs/wave2-20261027 (arm SP: a single "Copy ..." step whose
 * reply is one read with a null needId and an empty needs) are replayed offline: the production
 * admission refuses each with MISSING_SOURCE, and the closed subcase is READ_WITHOUT_CONSUMER. The
 * stored replies lack the always-empty {@code needs} the old contract required, which loses
 * nothing.
 */
class GuidedStandaloneReadReplayTest {
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final GuidedContracts C = new GuidedContracts();

  private static List<JsonNode> rows() throws IOException {
    List<JsonNode> rows = new ArrayList<>();
    try (var in =
        GuidedStandaloneReadReplayTest.class.getResourceAsStream(
            "/studio/guided/wi1/wave2-standalone-reads.jsonl")) {
      assertThat(in).isNotNull();
      var reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
      for (String line = reader.readLine(); line != null; line = reader.readLine()) {
        if (!line.isBlank()) {
          rows.add(MAPPER.readTree(line));
        }
      }
    }
    return rows;
  }

  @Test
  void theFiveRecordedStandaloneReadsAreRefusedMissingSourceThroughTheScorer() throws IOException {
    List<JsonNode> rows = rows();
    assertThat(rows).hasSize(5);
    GroundingBenchScorer scorer = new GroundingBenchScorer();
    for (JsonNode row : rows) {
      ObjectNode result = scorer.score(row);
      assertThat(result.path("verdict").asText()).as(row.path("key").asText()).isEqualTo("REFUSED");
      assertThat(result.path("code").asText())
          .as(row.path("key").asText())
          .isEqualTo("MISSING_SOURCE");
      assertThat(result.path("stage").asText()).isEqualTo("admitPlan");
      assertThat(result.path("check").asText()).startsWith("GuidedProposalValidator.");
    }
  }

  @Test
  void theSubcaseIsReadWithoutConsumerForAllFiveAndNoReplyHasANeedsField() throws IOException {
    GuidedProposalValidator validator = new GuidedProposalValidator(C);
    for (JsonNode row : rows()) {
      JsonNode context = row.path("context"), reply = row.path("reply");
      assertThat(reply.has("needs")).isFalse();
      ObjectNode session = C.object().put("sessionId", row.path("key").asText());
      ArrayNode steps = session.putArray("sourceSteps");
      context
          .path("sourceSteps")
          .forEach(step -> steps.addObject().put("stepId", step.path("stepId").asText()));
      session.putObject("limits").put("maxStatementsPerStep", 8);
      ObjectNode scope = session.putObject("scope");
      scope.put("sourceRevision", "1").put("configurationRevision", "1");
      ArrayNode capabilities = scope.putArray("capabilities");
      GroundingBenchScorer.CAPABILITIES.forEach(capabilities::add);
      List<GuidedRefusalDiagnostics.PlanSubcase> seen = new ArrayList<>();
      try {
        validator.admitPlan(session, reply, null, null, null, seen::add);
        throw new AssertionError("admitted " + row.path("key").asText());
      } catch (com.citi.put.checks.studio.guided.session.GuidedSessionException refused) {
        assertThat(refused.getMessage()).isEqualTo("MISSING_SOURCE");
      }
      assertThat(seen)
          .as(row.path("key").asText())
          .containsExactly(GuidedRefusalDiagnostics.PlanSubcase.READ_WITHOUT_CONSUMER);
    }
  }
}
