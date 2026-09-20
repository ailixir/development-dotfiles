package com.citi.put.checks.studio.compile.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class InferenceEnvelopeTest {
  private final GatewayResponseParser parser = GatewayTestSupport.parser();
  private final UUID id = UUID.fromString("11111111-2222-3333-4444-555555555555");

  private String envelope(String entry) {
    return "{\"version\":1,\"kind\":\"PATCH\",\"steps\":[{\"stepId\":\""
        + id
        + "\","
        + entry
        + "}]}";
  }

  @Test
  void acceptsGeneratedAndTerminalVariants() {
    for (String entry :
        List.of(
            "\"status\":\"GENERATED\",\"code\":\"await page.click();\"",
            "\"status\":\"UNSUPPORTED\",\"reason\":\"UNSUPPORTED_CAPABILITY\",\"message\":\"Cannot do this\"",
            "\"status\":\"CLARIFICATION\",\"reason\":\"AMBIGUOUS_INTENT\",\"message\":\"Specify text\"")) {
      assertThat(parser.parseProposal(envelope(entry), "PATCH", List.of(id)).isValid()).isTrue();
    }
  }

  @Test
  void rejectsFencesTrailingDocumentsDuplicateKeysAndForeignIds() {
    String valid = envelope("\"status\":\"GENERATED\",\"code\":\"await page.click();\"");
    for (String bad :
        List.of(
            "```json\n" + valid + "\n```",
            valid + "{}",
            valid.replace("\"version\":1", "\"version\":1,\"version\":1"),
            valid.replace(id.toString(), UUID.randomUUID().toString()),
            valid.replace(
                "\"status\":\"GENERATED\"", "\"status\":\"GENERATED\",\"reason\":\"ignored\""),
            valid.replace("\"PATCH\"", "\"FULL\""))) {
      assertThat(parser.parseProposal(bad, "PATCH", List.of(id)).isValid()).isFalse();
    }
  }
}
