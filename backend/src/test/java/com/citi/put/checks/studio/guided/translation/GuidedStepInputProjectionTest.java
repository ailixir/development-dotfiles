package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-008 D3: the inputs the STEP_CODE prompt lists carry the author's variable name beside the
 * inputId, so a step with several {@code <var>} tokens maps each token to {@code
 * inputs['<inputId>']}. A secret carries its secretId. Nothing carries a value.
 */
class GuidedStepInputProjectionTest {
  private static final GuidedContracts C = new GuidedContracts();

  private static ArrayNode array() {
    return new com.fasterxml.jackson.databind.ObjectMapper().createArrayNode();
  }

  private static ObjectNode reference(String id, String name, String kind) {
    return C.object()
        .put("referenceId", id)
        .put("stepId", "s1")
        .put("kind", kind)
        .put("referenceName", name);
  }

  private static ObjectNode configurationInput(String inputId, String referenceId, String kind) {
    ObjectNode input =
        C.object().put("inputId", inputId).put("sourceStepId", "s1").put("kind", kind);
    if (kind.equals("secretRef")) {
      input.put("secretId", "bank-password");
    } else {
      input.put("value", "PRIVATE-VALUE");
    }
    input
        .putObject("provenance")
        .put("referenceKind", "configuration")
        .put("referenceId", referenceId)
        .put("kind", kind);
    return input;
  }

  @Test
  void severalVariableTokensEachMapToTheirOwnInputIdByName() {
    ArrayNode references = array();
    references.add(reference("ref-city", "city", "nonsecretText"));
    references.add(reference("ref-zip", "zip", "nonsecretText"));
    // The input ids differ from the reference ids (stable ids survive a re-learn).
    ObjectNode city =
        GuidedTranslationService.projectInput(
            C, configurationInput("in-1", "ref-city", "nonsecretText"), references);
    ObjectNode zip =
        GuidedTranslationService.projectInput(
            C, configurationInput("in-2", "ref-zip", "nonsecretText"), references);
    assertThat(city.path("inputId").asText()).isEqualTo("in-1");
    assertThat(city.path("name").asText()).isEqualTo("city");
    assertThat(zip.path("inputId").asText()).isEqualTo("in-2");
    assertThat(zip.path("name").asText()).isEqualTo("zip");
  }

  @Test
  void aSecretCarriesItsSecretIdAndANameButNeverAValue() {
    ArrayNode references = array();
    references.add(reference("ref-pw", "password", "secretRef"));
    ObjectNode secret =
        GuidedTranslationService.projectInput(
            C, configurationInput("in-3", "ref-pw", "secretRef"), references);
    assertThat(secret.path("secretId").asText()).isEqualTo("bank-password");
    assertThat(secret.path("name").asText()).isEqualTo("password");
    assertThat(secret.toString()).doesNotContain("PRIVATE-VALUE").doesNotContain("provenance");
  }

  @Test
  void aLiteralTheAuthorTypedHasNoNameAndNoValueIsEverProjected() {
    ObjectNode literal =
        C.object()
            .put("inputId", "in-4")
            .put("sourceStepId", "s1")
            .put("kind", "nonsecretText")
            .put("value", "PRIVATE-VALUE");
    literal
        .putObject("provenance")
        .put("referenceKind", "sourceSpan")
        .put("startUtf16", 0)
        .put("endUtf16", 3);
    ObjectNode projected = GuidedTranslationService.projectInput(C, literal, array());
    assertThat(projected.has("name")).isFalse();
    assertThat(projected.has("secretId")).isFalse();
    assertThat(projected.fieldNames())
        .toIterable()
        .containsExactlyInAnyOrder("inputId", "sourceStepId", "kind");
    assertThat(projected.toString()).doesNotContain("PRIVATE-VALUE");
  }
}
