package com.citi.put.checks.studio.authoring;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class IncrementalHashTest {
  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void matchesCanonicalVectors() throws Exception {
    var fixtures =
        mapper.readTree(
            Files.readString(
                Path.of(
                    "../docs/qa/evidence/STUDIO-OBS-015/final-design/architect/fixtures.json")));
    assertThat(fixtures.path("canonicalVectors").size()).isGreaterThan(20);
    for (var vector : fixtures.path("canonicalVectors")) {
      String canonical = GuidedContracts.canonical(vector.path("input"));
      assertThat(canonical)
          .as(vector.path("name").asText())
          .isEqualTo(vector.path("canonical").asText());
      assertThat(HexFormat.of().formatHex(canonical.getBytes(StandardCharsets.UTF_8)))
          .isEqualTo(vector.path("canonicalUtf8Hex").asText());
      assertThat(GuidedContracts.hash(vector.path("input")))
          .isEqualTo(vector.path("sha256").asText());
    }
    assertThat(IncrementalAuthoringIdentity.UTF8.compare("\uE000", "\uD800\uDC00")).isNegative();
  }

  @Test
  void suffixConsumerChangeDoesNotChangePrefixProducerSnapshot() throws Exception {
    ObjectNode plan =
        (ObjectNode)
            mapper.readTree(
                """
        {"actions":[],"bindings":[{"bindingId":"binding-1","producer":{"stepId":"prefix","ordinal":0},
        "recipe":{"kind":"textContent"},"provenance":{"sessionId":"old",\
        "producerAdmissionId":"old-read","other":"kept"},
        "consumers":[{"bindingId":"binding-1","coordinate":{"stepId":"suffix","ordinal":0},
        "argumentSlot":"fill.value","producerAdmissionId":"old-read","consumerAdmissionId":"old-fill"}]}]}
        """);
    String prefix = IncrementalAuthoringIdentity.learnedStepHash(plan, "prefix");
    String suffix = IncrementalAuthoringIdentity.learnedStepHash(plan, "suffix");
    ((ObjectNode) plan.path("bindings").get(0)).putArray("consumers");
    assertThat(IncrementalAuthoringIdentity.learnedStepHash(plan, "prefix")).isEqualTo(prefix);
    assertThat(IncrementalAuthoringIdentity.learnedStepHash(plan, "suffix")).isNotEqualTo(suffix);
    ((ObjectNode) plan.path("bindings").get(0).path("provenance")).put("other", "semantic-change");
    assertThat(IncrementalAuthoringIdentity.learnedStepHash(plan, "prefix")).isNotEqualTo(prefix);
  }
}
