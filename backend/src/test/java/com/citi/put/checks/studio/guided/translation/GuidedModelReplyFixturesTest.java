package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-007: no fixture model reply may carry a model-written {@code needs} any more. Walks every
 * JSON and JSONL file of the test resources and of the v3 contract fixtures for a SOURCE_PLAN reply
 * (an object with kind SOURCE_PLAN and obligations) that has a top-level {@code needs}. Replies
 * built in Java are caught by the strict response schema when the owning test runs.
 */
class GuidedModelReplyFixturesTest {
  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Test
  void noFixtureSourcePlanReplyCarriesNeeds() throws IOException {
    List<String> offenders = new ArrayList<>();
    int scanned = 0;
    for (Path root :
        List.of(
            Path.of("src/test/resources"),
            Path.of("../docs/specs/studio-observed-authoring/contracts/v3"))) {
      try (Stream<Path> files = Files.walk(root)) {
        for (Path file : files.filter(f -> f.toString().matches(".*\\.(json|jsonl)$")).toList()) {
          scanned++;
          for (String line : Files.readAllLines(file)) {
            if (line.isBlank() || !line.contains("\"needs\"")) {
              continue;
            }
            JsonNode parsed;
            try {
              parsed = MAPPER.readTree(line);
            } catch (IOException notOneLine) {
              parsed = null;
            }
            if (parsed != null) {
              scan(parsed, file + "[line]", offenders);
            }
          }
          if (file.toString().endsWith(".json")) {
            scan(MAPPER.readTree(Files.readString(file)), file.toString(), offenders);
          }
        }
      }
    }
    assertThat(scanned).isGreaterThan(10);
    // The one deliberate negative: a SOURCE_PLAN reply with needs that the strict schema refuses.
    assertThat(offenders)
        .allMatch(
            path -> path.contains("planning-fixtures.json/cases/48/value"),
            String.valueOf(offenders));
    assertThat(offenders).hasSizeLessThanOrEqualTo(1);
  }

  private static void scan(JsonNode node, String path, List<String> offenders) {
    if (node.isObject()) {
      if (node.path("kind").asText().equals("SOURCE_PLAN")
          && node.has("obligations")
          && node.has("needs")) {
        offenders.add(path);
      }
      node.fields().forEachRemaining(e -> scan(e.getValue(), path + "/" + e.getKey(), offenders));
    } else if (node.isArray()) {
      for (int i = 0; i < node.size(); i++) {
        scan(node.get(i), path + "/" + i, offenders);
      }
    }
  }
}
