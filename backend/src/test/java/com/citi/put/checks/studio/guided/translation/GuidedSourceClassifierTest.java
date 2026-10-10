package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.compile.CredentialPatternScreen;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.junit.jupiter.api.Test;

class GuidedSourceClassifierTest {
  static final GuidedContracts C = new GuidedContracts();
  static final String STEP = "123e4567-e89b-12d3-a456-426614174000";

  static ObjectNode current(String text) {
    ObjectNode current =
        C.object()
            .put("testId", "123e4567-e89b-12d3-a456-426614174001")
            .put("csiId", "CSI-123")
            .put("environment", "fixture")
            .put("sourceRevision", "1")
            .put("configurationRevision", "1");
    current
        .putObject("authoring")
        .put("authoringSchemaVersion", 2)
        .putArray("steps")
        .addObject()
        .put("id", STEP)
        .put("text", text);
    current
        .putArray("variables")
        .addObject()
        .put("name", "city")
        .put("kind", "plain")
        .put("value", "FORBIDDEN_SAVED_VALUE");
    return current;
  }

  static ObjectNode scope() {
    return C.object()
        .put("applicationId", "orders")
        .put("environmentId", "fixture")
        .put("csiId", "CSI-123")
        .put("sourceRevision", "1")
        .put("configurationRevision", "1");
  }

  static GuidedSourceClassifier classifier() {
    return new GuidedSourceClassifier(
        C,
        new GuidedTranslationProperties(
            true, true, List.of("orders"), List.of("fixture"), 65536, 4096, 60, "worker-1"),
        new CredentialPatternScreen());
  }

  @Test
  void authoredSourceIsPermittedWhileSavedValuesHaveOnlyPrivateMaterialization() {
    ObjectNode result = classifier().classify(current("Enter London then <var city>"), scope());
    assertThat(result.path("sourceSteps").toString())
        .contains("London", "<var city>")
        .doesNotContain("FORBIDDEN_SAVED_VALUE");
    assertThat(result.path("configurationReferences").toString())
        .doesNotContain("FORBIDDEN_SAVED_VALUE");
    assertThat(result.path("configurationValues").toString()).contains("FORBIDDEN_SAVED_VALUE");
    assertThat(result.path("sourceSteps").get(0).path("regions").size()).isEqualTo(1);
    assertThat(result.path("configurationReferences").size()).isEqualTo(4);
  }

  @Test
  void declaredTokensCannotBecomeLiteralRegionsAndUnknownReferencesRefuse() {
    assertThatThrownBy(() -> classifier().classify(current("Enter <var unknown>"), scope()))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThatThrownBy(() -> classifier().classify(current("Enter <secret city>"), scope()))
        .hasMessage("FORBIDDEN_SCOPE");
  }

  @Test
  void knownCredentialShapesAndUnapprovedSourcePoliciesRefuseBeforePromptConstruction() {
    assertThatThrownBy(
            () -> classifier().classify(current("password=FORBIDDEN_INLINE_CREDENTIAL"), scope()))
        .hasMessageNotContaining("FORBIDDEN_INLINE_CREDENTIAL");
    assertThatThrownBy(
            () ->
                classifier()
                    .classify(current("Enter London"), scope().put("applicationId", "other")))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThatThrownBy(
            () ->
                classifier().classify(current("Enter London"), scope().put("sourceRevision", "2")))
        .hasMessage("REVISION_CONFLICT");
  }

  @Test
  void referencedValuesMustBeAuthoritativeStringsWhileIntentionalEmptyAndUnusedNullArePreserved() {
    for (com.fasterxml.jackson.databind.JsonNode invalid :
        List.of(
            com.fasterxml.jackson.databind.node.NullNode.instance,
            com.fasterxml.jackson.databind.node.IntNode.valueOf(42),
            com.fasterxml.jackson.databind.node.BooleanNode.TRUE,
            C.object())) {
      ObjectNode draft = current("Enter <var city>");
      ((ObjectNode) draft.path("variables").get(0)).set("value", invalid);
      assertThatThrownBy(() -> classifier().classify(draft, scope())).hasMessage("MISSING_SOURCE");
    }
    ObjectNode missing = current("Enter <var city>");
    ((ObjectNode) missing.path("variables").get(0)).remove("value");
    assertThatThrownBy(() -> classifier().classify(missing, scope())).hasMessage("MISSING_SOURCE");
    ObjectNode empty = current("Enter <var city>");
    ((ObjectNode) empty.path("variables").get(0)).put("value", "");
    JsonNode values = classifier().classify(empty, scope()).path("configurationValues");
    values.forEach(value -> assertThat(value.path("value").textValue()).isEmpty());
    ObjectNode unused = current("Enter London");
    ((ObjectNode) unused.path("variables").get(0)).putNull("value");
    assertThat(classifier().classify(unused, scope()).path("configurationValues").isEmpty())
        .isTrue();
  }

  @Test
  void canonicalWhitespaceAndVaultIdMatchingRemainOpaqueWithNameFallbackAndConflictChecks() {
    String source = "Enter <var\tcity> then <secret\nvault-id>";
    ObjectNode draft = current(source);
    draft
        .withArray("variables")
        .addObject()
        .put("name", "password")
        .put("kind", "secretRef")
        .put("secretId", "vault-id");
    ObjectNode classified = classifier().classify(draft, scope());
    assertThat(classified.path("sourceSteps").get(0).path("text").textValue()).isEqualTo(source);
    assertThat(classified.path("configurationValues").size()).isEqualTo(4);
    var approved = classified.path("sourceSteps").get(0).path("regions");
    for (JsonNode region : approved) {
      assertThat(
              source.substring(region.path("startUtf16").asInt(), region.path("endUtf16").asInt()))
          .doesNotContain("city", "vault-id");
    }
    ObjectNode fallback = current("Use <secret fallback-id>");
    fallback
        .withArray("variables")
        .addObject()
        .put("name", "fallback-id")
        .put("kind", "secretRef")
        .putNull("secretId");
    assertThat(classifier().classify(fallback, scope()).path("configurationValues").isEmpty())
        .isTrue();
    ObjectNode conflict = current("Use <var city>");
    conflict
        .withArray("variables")
        .addObject()
        .put("name", "password")
        .put("kind", "secretRef")
        .put("secretId", "city");
    assertThatThrownBy(() -> classifier().classify(conflict, scope()))
        .hasMessage("FORBIDDEN_SCOPE");
  }
}
