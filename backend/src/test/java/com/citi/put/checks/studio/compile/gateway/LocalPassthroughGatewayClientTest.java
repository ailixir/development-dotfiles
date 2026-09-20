package com.citi.put.checks.studio.compile.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.CompilePins;
import com.citi.put.checks.studio.compile.PromptAssembler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Studio v1 WP2: the local stand-in proposes Playwright steps verbatim and nothing else. */
class LocalPassthroughGatewayClientTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final LocalPassthroughGatewayClient client =
      new LocalPassthroughGatewayClient(new GatewayAuditLogger());

  private static CompileRequest requestFor(List<String> source) {
    return new CompileRequest(
        UUID.randomUUID(),
        "60481",
        "dev@citi.com",
        "req-1",
        1,
        PromptAssembler.fence(source),
        "reference",
        "1.0.0",
        "contract",
        CompilePins.PROMPT_VERSION);
  }

  @Test
  void proposesEachPlaywrightStepVerbatimInAuthorOrder() throws Exception {
    List<String> source =
        List.of(
            "await page.goto('http://127.0.0.1:5173/');",
            "  await page.getByRole('button', { name: \"Say \\\"hi\\\"\" }).click();");

    CompileResponse response = client.propose(requestFor(source));

    assertThat(response.isOk()).isTrue();
    assertThat(response.provenance().model()).isEqualTo(LocalPassthroughGatewayClient.MODEL);
    JsonNode artifact = MAPPER.readTree(response.artifactJson());
    assertThat(artifact.path("version").asInt()).isEqualTo(1);
    JsonNode steps = artifact.path("steps");
    assertThat(steps).hasSize(2);
    for (int index = 0; index < source.size(); index++) {
      assertThat(steps.get(index).path("stepIndex").asInt()).isEqualTo(index);
      assertThat(steps.get(index).path("originalText").asText()).isEqualTo(source.get(index));
      assertThat(steps.get(index).path("code").asText()).isEqualTo(source.get(index).strip());
    }
  }

  @Test
  void refusesADraftWithAnEnglishStepAndProposesNothing() {
    CompileResponse response =
        client.propose(
            requestFor(List.of("await page.goto('http://127.0.0.1:5173/');", "Click Submit")));

    assertThat(response.isOk()).isFalse();
    assertThat(response.outcome()).isEqualTo(GatewayOutcome.DISABLED);
    assertThat(response.errorCode()).isEqualTo(GatewayErrorCode.GATEWAY_UNAVAILABLE);
    assertThat(response.artifactJson()).isNull();
    assertThat(response.failureReason()).contains("step 2");
  }
}
