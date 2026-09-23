package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/**
 * Story 10.45 Task 1.3 — the accepted proposal's usage reaches revision provenance, with {@code
 * null} (never {@code 0}) for anything the vendor did not report (AC 4; AC-13.1, AC-13.2).
 */
class ProvenanceUsageTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private static JsonNode provenance(GatewayProvenance gateway) {
    ObjectNode node = MAPPER.createObjectNode();
    CompilePipeline.putGenerationUsage(node, gateway);
    return node;
  }

  @Test
  void thoughtsCachedAndTotalTokensArePersistedWhenReported() {
    JsonNode node =
        provenance(
            new GatewayProvenance(
                "gemini-3.8-flash",
                "001",
                CompilePins.PROMPT_VERSION,
                "1.71.0",
                true,
                0,
                32768,
                "STOP",
                2400,
                310,
                true,
                512,
                2048,
                3222,
                "MEDIUM"));

    assertThat(node.path("maxOutputTokens").asInt()).isEqualTo(32768);
    assertThat(node.path("thinkingLevel").asText()).isEqualTo("MEDIUM");
    JsonNode usage = node.path("usage");
    assertThat(usage.path("promptTokenCount").asInt()).isEqualTo(2400);
    assertThat(usage.path("candidatesTokenCount").asInt()).isEqualTo(310);
    assertThat(usage.path("thoughtsTokenCount").asInt()).isEqualTo(512);
    assertThat(usage.path("cachedContentTokenCount").asInt()).isEqualTo(2048);
    assertThat(usage.path("totalTokenCount").asInt()).isEqualTo(3222);
    assertThat(usage.path("finishReason").asText()).isEqualTo("STOP");
    assertThat(usage.path("usageAvailable").asBoolean()).isTrue();
  }

  @Test
  void anAbsentCachedContentCountIsStoredAsNullNotZero() {
    JsonNode usage =
        provenance(
                new GatewayProvenance(
                    "gemini-3.8-flash",
                    "001",
                    CompilePins.PROMPT_VERSION,
                    "1.71.0",
                    true,
                    0,
                    32768,
                    "STOP",
                    2400,
                    310,
                    true,
                    512,
                    null,
                    3222,
                    "MEDIUM"))
            .path("usage");

    assertThat(usage.has("cachedContentTokenCount")).isTrue();
    assertThat(usage.get("cachedContentTokenCount").isNull()).isTrue();
    assertThat(usage.path("thoughtsTokenCount").asInt()).isEqualTo(512);
  }

  @Test
  void noVendorUsageStoresEveryCountAsNullAndUsageUnavailable() {
    JsonNode node =
        provenance(
            new GatewayProvenance(
                "stub-model@1", "001", CompilePins.PROMPT_VERSION, "1.52.0", true, 0));

    assertThat(node.get("maxOutputTokens").isNull()).isTrue();
    assertThat(node.get("thinkingLevel").isNull()).isTrue();
    JsonNode usage = node.path("usage");
    for (String field :
        new String[] {
          "promptTokenCount",
          "candidatesTokenCount",
          "thoughtsTokenCount",
          "cachedContentTokenCount",
          "totalTokenCount",
          "finishReason"
        }) {
      assertThat(usage.get(field).isNull()).as(field).isTrue();
    }
    assertThat(usage.path("usageAvailable").asBoolean()).isFalse();
  }

  @Test
  void aMissingGatewayProvenanceIsUnavailableNotZero() {
    JsonNode usage = provenance(null).path("usage");

    assertThat(usage.get("promptTokenCount").isNull()).isTrue();
    assertThat(usage.get("cachedContentTokenCount").isNull()).isTrue();
    assertThat(usage.path("usageAvailable").asBoolean()).isFalse();
  }
}
