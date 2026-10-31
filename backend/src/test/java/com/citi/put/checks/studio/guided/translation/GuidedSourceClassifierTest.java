package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
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
        .put("environmentId", "fixture")
        .put("csiId", "CSI-123")
        .put("sourceRevision", "1")
        .put("configurationRevision", "1");
  }

  static GuidedSourceClassifier classifier() {
    return new GuidedSourceClassifier(
        C, new CredentialPatternScreen(), com.citi.put.checks.studio.support.TestDomains.FIXTURES);
  }

  @Test
  void secretReferenceEmissionHasOnlyIdAndNoSlotWithTokenExcludedFromApprovedRegions() {
    var draft = current("Enter <secret PASS> as password");
    draft
        .withArray("variables")
        .addObject()
        .put("kind", "secretRef")
        .put("name", "password")
        .put("secretId", "PASS");
    var manifest = classifier().classify(draft, scope());
    var reference = manifest.path("configurationReferences").get(0);
    assertThat(reference.path("kind").asText()).isEqualTo("secretRef");
    assertThat(reference.has("intendedSlot")).isFalse();
    assertThat(reference.path("referenceName").asText()).isEqualTo("PASS");
    assertThat(
            manifest
                .path("configurationValues")
                .get(reference.path("referenceId").asText())
                .has("value"))
        .isFalse();
    assertThat(GuidedPromptAssembler.maskSecretTokens("Enter <secret PASS> as password"))
        .hasSize("Enter <secret PASS> as password".length())
        .doesNotContain("<secret PASS>")
        .startsWith("Enter ")
        .endsWith(" as password");
    var ref = reference.deepCopy();
    ((ObjectNode) ref).put("referenceKind", "configuration").put("configurationRevision", "1");
    var session = C.object().put("scopeHash", "a".repeat(64));
    session.set("scope", scope());
    session.putArray("sourceSteps").addObject().put("stepId", STEP);
    var input =
        new com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator(
                C, com.citi.put.checks.studio.support.TestDomains.FIXTURES)
            .resolve(
                session,
                new GuidedSourceInputResolver(
                        C, com.citi.put.checks.studio.support.TestDomains.FIXTURES)
                    .sources(session, manifest),
                ref);
    assertThat(input.has("value")).isFalse();
    assertThat(input.path("secretId").asText()).isEqualTo("PASS");
    assertThat(input.path("sourceStepId").asText()).isEqualTo(STEP);
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
    assertThat(result.path("configurationReferences").size()).isEqualTo(2);
  }

  @Test
  void declaredTokensCannotBecomeLiteralRegionsAndUnknownReferencesRefuse() {
    // OBS-015 implementation ruling section 1: a runtime reference with no declaration of its kind
    // is 409 MISSING_SOURCE / AUTHORING_REFERENCE_MISSING (it was a FORBIDDEN_SCOPE scope refusal
    // before the canonical identity resolver owned reference resolution).
    for (String text : List.of("Enter <var unknown>", "Enter <secret city>")) {
      assertThatThrownBy(() -> classifier().classify(current(text), scope()))
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              refusal -> {
                assertThat(refusal.status()).isEqualTo(409);
                assertThat(refusal.messageCode()).isEqualTo("AUTHORING_REFERENCE_MISSING");
              })
          .hasMessage("MISSING_SOURCE");
    }
  }

  @Test
  void knownCredentialShapesAndStaleRevisionsRefuseBeforePromptConstruction() {
    assertThatThrownBy(
            () -> classifier().classify(current("password=FORBIDDEN_INLINE_CREDENTIAL"), scope()))
        .hasMessageNotContaining("FORBIDDEN_INLINE_CREDENTIAL");
    assertThatThrownBy(
            () ->
                classifier().classify(current("Enter London"), scope().put("sourceRevision", "2")))
        .hasMessage("REVISION_CONFLICT");
  }

  @Test
  void referencedValuesMustBeAuthoritativeStringsWhileIntentionalEmptyAndUnusedNullArePreserved() {
    ObjectNode nullValue = current("Enter <var city>");
    ((ObjectNode) nullValue.path("variables").get(0))
        .set("value", com.fasterxml.jackson.databind.node.NullNode.instance);
    assertThatThrownBy(() -> classifier().classify(nullValue, scope()))
        .hasMessage("MISSING_SOURCE");
    // A non-string value is not a canonical declaration at all: the strict codec refuses it as
    // INVALID_VARIABLES before the identity resolver can treat it as a missing source.
    for (com.fasterxml.jackson.databind.JsonNode invalid :
        List.of(
            com.fasterxml.jackson.databind.node.IntNode.valueOf(42),
            com.fasterxml.jackson.databind.node.BooleanNode.TRUE,
            C.object())) {
      ObjectNode draft = current("Enter <var city>");
      ((ObjectNode) draft.path("variables").get(0)).set("value", invalid);
      assertThatThrownBy(() -> classifier().classify(draft, scope()))
          .isInstanceOfSatisfying(
              StudioValidationException.class,
              refusal -> assertThat(refusal.getCode()).isEqualTo("INVALID_VARIABLES"));
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
  void canonicalWhitespaceAndVaultIdMatchingRemainOpaqueAndTheNameFallbackIsRetired() {
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
    assertThat(classified.path("configurationValues").size()).isEqualTo(3);
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
    // OBS-015 implementation ruling section 1: secretId is required; the null-secretId name
    // fallback is retired from the canonical path, so the codec refuses the declaration.
    assertThatThrownBy(() -> classifier().classify(fallback, scope()))
        .isInstanceOfSatisfying(
            StudioValidationException.class,
            refusal -> assertThat(refusal.getCode()).isEqualTo("INVALID_VARIABLES"));
    ObjectNode conflict = current("Use <var city>");
    conflict
        .withArray("variables")
        .addObject()
        .put("name", "password")
        .put("kind", "secretRef")
        .put("secretId", "city");
    // A plain name colliding with a secretId is ambiguous: 422 INVALID_CONTRACT (ruling section 1).
    assertThatThrownBy(() -> classifier().classify(conflict, scope()))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refusal -> {
              assertThat(refusal.status()).isEqualTo(422);
              assertThat(refusal.messageCode()).isEqualTo("AUTHORING_REFERENCE_AMBIGUOUS");
            })
        .hasMessage("INVALID_CONTRACT");
  }
}
