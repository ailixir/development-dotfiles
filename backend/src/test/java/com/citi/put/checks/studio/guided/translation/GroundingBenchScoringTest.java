package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * SPK-07 grounding benchmark scoring (workstream D). Scores model replies with the production
 * validation rules through {@link GroundingBenchScorer}; it is a measurement tool, not product
 * behaviour. Skipped unless {@code SPK07_SCORING_INPUT} and {@code SPK07_SCORING_OUTPUT} are set.
 *
 * <p>Input: JSONL lines {@code {key, kind: SOURCE_PLAN, context, reply}} where {@code context} is
 * the context object sent to the model and {@code reply} the model's JSON (an optional {@code
 * configurationValues} object maps a referenceId to its saved value). Output: JSONL {@code {key,
 * verdict: ADMITTED|REFUSED, code, stage}} plus {@code detail} and {@code note} when present. An
 * ADMITTED line carries the last stage it passed. A line the scorer cannot interpret is REFUSED
 * with code {@code SCORER_ERROR}, and the test then fails after writing the output.
 */
class GroundingBenchScoringTest {
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String FIXTURE = "/studio/guided/spk07/selftest.jsonl";

  @Test
  void scoresTheEnvironmentInput() throws IOException {
    String input = System.getenv("SPK07_SCORING_INPUT");
    String output = System.getenv("SPK07_SCORING_OUTPUT");
    assumeTrue(
        input != null && !input.isBlank() && output != null && !output.isBlank(),
        "SPK07_SCORING_INPUT and SPK07_SCORING_OUTPUT are not both set");
    List<ObjectNode> results;
    try (BufferedReader reader = Files.newBufferedReader(Path.of(input), StandardCharsets.UTF_8)) {
      results = score(reader);
    }
    try (BufferedWriter writer = Files.newBufferedWriter(Path.of(output), StandardCharsets.UTF_8)) {
      for (ObjectNode result : results) {
        writer.write(MAPPER.writeValueAsString(result));
        writer.newLine();
      }
    }
    List<String> defects = new ArrayList<>();
    for (ObjectNode result : results) {
      if (result.path("code").asText().equals("SCORER_ERROR")) {
        defects.add(result.path("key").asText() + ": " + result.path("detail").asText());
      }
    }
    assertThat(defects).as("lines the scorer could not interpret").isEmpty();
  }

  /** Captured real pairs the stack applied must be admitted; two mutations must be refused. */
  @Test
  void fixtureSelfTest() throws IOException {
    assumeTrue(
        "1".equals(System.getenv("SPK07_SELFTEST")), "SPK07_SELFTEST=1 runs the fixture self-test");
    List<JsonNode> lines = new ArrayList<>();
    try (InputStream in = getClass().getResourceAsStream(FIXTURE)) {
      assertThat(in).isNotNull();
      BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
      for (String line = reader.readLine(); line != null; line = reader.readLine()) {
        if (!line.isBlank()) {
          lines.add(MAPPER.readTree(line));
        }
      }
    }
    GroundingBenchScorer scorer = new GroundingBenchScorer();
    int admitted = 0;
    int refused = 0;
    for (JsonNode line : lines) {
      ObjectNode result = scorer.score(line);
      JsonNode expect = line.path("expect");
      assertThat(result.path("verdict").asText())
          .as("%s -> %s", line.path("key").asText(), result)
          .isEqualTo(expect.path("verdict").asText());
      if (expect.hasNonNull("code")) {
        assertThat(result.path("code").asText())
            .as(result.toString())
            .isEqualTo(expect.path("code").asText());
      }
      if (expect.hasNonNull("stage")) {
        assertThat(result.path("stage").asText())
            .as(result.toString())
            .isEqualTo(expect.path("stage").asText());
      }
      if (result.path("verdict").asText().equals("ADMITTED")) {
        admitted++;
      } else {
        refused++;
      }
    }
    assertThat(lines).isNotEmpty();
    assertThat(admitted).as("admitted captured pairs").isPositive();
    assertThat(refused).as("refused mutations").isGreaterThanOrEqualTo(2);
  }

  private static List<ObjectNode> score(BufferedReader reader) throws IOException {
    GroundingBenchScorer scorer = new GroundingBenchScorer();
    List<ObjectNode> results = new ArrayList<>();
    for (String line = reader.readLine(); line != null; line = reader.readLine()) {
      if (line.isBlank()) {
        continue;
      }
      JsonNode parsed;
      try {
        parsed = MAPPER.readTree(line);
      } catch (IOException malformed) {
        ObjectNode defect = MAPPER.createObjectNode();
        defect.putNull("key");
        defect.put("verdict", "REFUSED").put("code", "SCORER_ERROR").put("stage", "parse");
        defect.put("detail", "unparseable input line");
        results.add(defect);
        continue;
      }
      results.add(scorer.score(parsed));
    }
    return results;
  }
}
