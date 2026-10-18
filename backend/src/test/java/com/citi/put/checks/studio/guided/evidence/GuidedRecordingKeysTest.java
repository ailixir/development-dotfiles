package com.citi.put.checks.studio.guided.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * STUDIO-OBS-013 AR-1 R5: the Java half of the shared golden key vector. The runner tests the same
 * vector ({@code guided/evidence.ts}); two derivations bounded by one vector, no key on the wire.
 */
class GuidedRecordingKeysTest {

  private static JsonNode vector() throws Exception {
    JsonNode fixtures =
        new ObjectMapper()
            .readTree(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")));
    JsonNode vector = fixtures.path("guidedRecordingKeyVector");
    assertThat(vector.isObject())
        .as("fixtures.json guidedRecordingKeyVector (contract lane C1) is present")
        .isTrue();
    return vector;
  }

  @Test
  void derivesEveryGoldenVectorPairExactly() throws Exception {
    JsonNode derived = vector().path("derived");
    assertThat(derived.size()).isPositive();
    for (JsonNode pair : derived) {
      var keys =
          GuidedRecordingKeys.derive(pair.path("csiId").asText(), pair.path("sessionId").asText());
      assertThat(keys).isPresent();
      assertThat(keys.get().videoKey()).isEqualTo(pair.path("videoKey").asText());
      assertThat(keys.get().manifestKey()).isEqualTo(pair.path("manifestKey").asText());
    }
  }

  @Test
  void refusesEveryGoldenVectorRefusal() throws Exception {
    JsonNode refused = vector().path("refused");
    assertThat(refused.size()).isPositive();
    for (JsonNode pair : refused) {
      assertThat(
              GuidedRecordingKeys.derive(
                  pair.path("csiId").asText(), pair.path("sessionId").asText()))
          .as("%s", pair)
          .isEmpty();
    }
  }

  @Test
  void theSegmentRuleMatchesTheVectorsStatedPattern() throws Exception {
    assertThat(vector().path("segmentPattern").asText()).isEqualTo("^[A-Za-z0-9_-]{1,256}$");
  }

  @Test
  void failsClosedOnTraversalSeparatorsNullAndOverlongSegments() {
    assertThat(GuidedRecordingKeys.derive(null, "s")).isEmpty();
    assertThat(GuidedRecordingKeys.derive("c", null)).isEmpty();
    assertThat(GuidedRecordingKeys.derive("c", "a\\b")).isEmpty();
    assertThat(GuidedRecordingKeys.derive("c", "s\n")).isEmpty();
    assertThat(GuidedRecordingKeys.derive("c", "s%2F")).isEmpty();
    assertThat(GuidedRecordingKeys.derive("c", "x".repeat(257))).isEmpty();
    assertThat(GuidedRecordingKeys.derive("c", "x".repeat(256))).isPresent();
  }
}
