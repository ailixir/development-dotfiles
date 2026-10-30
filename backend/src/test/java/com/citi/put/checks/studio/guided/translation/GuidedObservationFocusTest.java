package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-007 D10/D20: the focus every observation request carries. Pure; the contract schema bounds
 * are asserted against the schema itself, not only against the helper's constants.
 */
class GuidedObservationFocusTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final Path FIXTURES =
      Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json");

  @Test
  void aSecretTokenInTheStepTextIsMaskedAndNeverLeavesTheBackend() {
    ObjectNode focus =
        GuidedObservationFocus.focus(
            "Enter <secret LOGIN_PASSWORD> then click Sign in", List.of("Sign in"));
    assertThat(focus.path("stepText").asText())
        .doesNotContain("secret")
        .doesNotContain("LOGIN_PASSWORD");
    assertThat(focus.path("stepText").asText()).contains("click Sign in");
    // A plain variable token names a value that is not secret and stays.
    assertThat(GuidedObservationFocus.focus("Open <var HOST>", List.of()).path("stepText").asText())
        .isEqualTo("Open <var HOST>");
  }

  @Test
  void theStepTextIsCappedAtOneThousandTwentyFourCodePoints() {
    String text = "ab".repeat(700) + "🧪".repeat(10);
    String capped = GuidedObservationFocus.focus(text, List.of()).path("stepText").asText();
    assertThat(capped.codePointCount(0, capped.length())).isEqualTo(1024);
    assertThat(GuidedObservationFocus.focus("x".repeat(1024), List.of()).path("stepText").asText())
        .hasSize(1024);
  }

  @Test
  void atMostEightIntentsOfAtMostTwoHundredFiftySixCharactersAreKept() {
    List<String> intents = new ArrayList<>();
    for (int i = 0; i < 11; i++) {
      intents.add(("intent " + i + " ").repeat(60));
    }
    intents.add(1, "   ");
    ArrayNode kept =
        (ArrayNode) GuidedObservationFocus.focus("step", intents).path("targetIntents");
    assertThat(kept).hasSize(8);
    for (JsonNode intent : kept) {
      assertThat(intent.asText().codePointCount(0, intent.asText().length()))
          .isLessThanOrEqualTo(256);
      assertThat(intent.asText()).isNotBlank();
    }
  }

  @Test
  void theFocusSatisfiesTheObservationRefreshSchemaBounds() throws Exception {
    ObjectNode request =
        ((ObjectNode)
            C.parse(Files.readString(FIXTURES))
                .path("documents")
                .path("observationRefresh")
                .deepCopy());
    request.set("focus", GuidedObservationFocus.focus("Click Save", List.of("Save", "Cancel")));
    C.validate("v3/observation-refresh", request);
    // The longest focus the helper can produce is still inside the schema.
    List<String> longest = new ArrayList<>();
    for (int i = 0; i < 20; i++) {
      longest.add("é".repeat(400));
    }
    request.set("focus", GuidedObservationFocus.focus("🧪".repeat(3000), longest));
    C.validate("v3/observation-refresh", request);
    assertThat(request.path("focus").path("targetIntents")).hasSize(8);
    // And the schema itself refuses a ninth intent, so the cap above is the contract's cap.
    ((ArrayNode) request.path("focus").path("targetIntents")).add("ninth");
    assertThatThrownBy(() -> C.validate("v3/observation-refresh", request))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void theIntentsOfAnObligationListAreTheirTargetIntentsInOrder() {
    ObjectNode first = C.object().put("targetIntent", "Email");
    ObjectNode second = C.object().put("targetIntent", "Password");
    ObjectNode none = C.object().put("operationKind", "navigate");
    assertThat(GuidedObservationFocus.intentsOf(List.of(first, none, second)))
        .containsExactly("Email", "Password");
    assertThat(GuidedObservationFocus.focus(null, null).path("stepText").asText()).isEmpty();
  }
}
