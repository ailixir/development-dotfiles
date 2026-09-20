package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dto.ResolvedLiteralInput;
import com.citi.put.checks.studio.dto.ResolvedOperation;
import com.citi.put.checks.studio.dto.ResolvedReferenceInput;
import com.citi.put.checks.studio.dto.ResolvedStepReview;
import com.citi.put.checks.studio.dto.ResolvedTarget;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ExpectedIntentAssemblerTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final UUID STEP = UUID.fromString("11111111-1111-4111-8111-111111111111");

  @Test
  void preservesExactLiteralAndCompleteLocatorSemantics() throws Exception {
    ResolvedStepReview review =
        review(
            new ResolvedOperation(ResolvedOperation.Kind.FILL),
            new ResolvedTarget(ResolvedTarget.Strategy.LABEL, "  名称  ", true, null),
            new ResolvedLiteralInput(ResolvedLiteralInput.Kind.LITERAL, "\n\"quoted\""));
    JsonNode intent =
        MAPPER.readTree(
            new ExpectedIntentAssembler()
                .assemble(
                    List.of(review), Map.of(STEP, List.of(ResolvedOperation.Kind.FILL)), Map.of()));
    assertThat(intent.path("schemaVersion").intValue()).isEqualTo(1);
    JsonNode operation = intent.path("steps").get(0).path("operations").get(0);
    assertThat(
            operation
                .path("locator")
                .path("segments")
                .get(0)
                .path("text")
                .path("value")
                .textValue())
        .isEqualTo("  名称  ");
    assertThat(
            operation
                .path("locator")
                .path("segments")
                .get(0)
                .path("options")
                .path("exact")
                .booleanValue())
        .isTrue();
    assertThat(operation.path("value").path("value").textValue()).isEqualTo("\n\"quoted\"");
  }

  @Test
  void storesOnlyOpaqueSecretIdentifierAndExpandsOrderedFillPressSequence() throws Exception {
    ResolvedStepReview review =
        review(
            new ResolvedOperation(ResolvedOperation.Kind.FILL),
            new ResolvedTarget(ResolvedTarget.Strategy.LABEL, "Password", true, null),
            new ResolvedReferenceInput(ResolvedReferenceInput.Kind.SECRET_REF, "LOGIN_PASSWORD"));
    String json =
        new ExpectedIntentAssembler()
            .assemble(
                List.of(review),
                Map.of(STEP, List.of(ResolvedOperation.Kind.FILL, ResolvedOperation.Kind.PRESS)),
                Map.of());
    JsonNode operations = MAPPER.readTree(json).path("steps").get(0).path("operations");
    assertThat(operations.get(0).path("value").path("id").textValue()).isEqualTo("LOGIN_PASSWORD");
    assertThat(operations.get(1).path("op").textValue()).isEqualTo("press");
    assertThat(operations.get(1).path("key").path("value").textValue()).isEqualTo("Enter");
    assertThat(json).doesNotContain("secretValue", "password123");
  }

  @Test
  void underspecifiedSemanticsBlockBeforeProposal() {
    ResolvedStepReview review =
        review(new ResolvedOperation(ResolvedOperation.Kind.CLICK), null, null);
    assertThatThrownBy(
            () ->
                new ExpectedIntentAssembler()
                    .assemble(
                        List.of(review),
                        Map.of(STEP, List.of(ResolvedOperation.Kind.CLICK)),
                        Map.of()))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("underspecified");
  }

  private static ResolvedStepReview review(
      ResolvedOperation operation,
      ResolvedTarget target,
      com.citi.put.checks.studio.dto.ResolvedInput input) {
    return new ResolvedStepReview(STEP, operation, target, input, List.of(), List.of(), List.of());
  }
}
