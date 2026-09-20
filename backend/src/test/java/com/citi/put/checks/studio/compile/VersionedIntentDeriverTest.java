package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dto.AuthoringRevisionInputs;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import com.citi.put.checks.studio.dto.TargetHint;
import com.citi.put.checks.studio.dto.VariableReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class VersionedIntentDeriverTest {

  private static final ObjectMapper MAPPER = new ObjectMapper().findAndRegisterModules();
  private static final String CSI = "61837";
  private static final String ENVIRONMENT = "Production";
  private static final String SECRET_CANARY = "secret-value-must-never-appear";

  @Test
  void goldenFixturePinsTheCompleteVersionedPipeline() throws Exception {
    JsonNode fixture =
        MAPPER.readTree(
            Files.readString(
                Path.of("../docs/specs/studio-context/fixtures/intent-derivation-v1.json")));
    VersionedIntentDeriver.Derivation derived =
        new VersionedIntentDeriver()
            .deriveRevision(
                fixture.path("intentDerivationVersion").asText(),
                fixture.path("source").toString(),
                fixture.path("authoring").toString(),
                fixture.path("authoringRevisionInputs").toString(),
                fixture.path("csiId").asText(),
                fixture.path("configuration").toString());
    assertThat(MAPPER.readTree(derived.expectedIntent())).isEqualTo(fixture.path("expectedIntent"));
  }

  @Test
  void onePureVersionedDerivationIsDeterministicAndCanonical() throws Exception {
    Fixture fixture = fixture();
    VersionedIntentDeriver deriver = new VersionedIntentDeriver();
    VersionedIntentDeriver.Derivation first = fixture.derive(deriver);
    VersionedIntentDeriver.Derivation second = fixture.derive(deriver);

    assertThat(first.blockingDiagnostics()).isEmpty();
    assertThat(first.expectedIntent()).isEqualTo(second.expectedIntent());
    assertThat(first.expectedIntent()).doesNotContain(SECRET_CANARY);
    JsonNode expected = MAPPER.readTree(first.expectedIntent());
    String reordered = "{\"steps\":" + expected.path("steps") + ", \"schemaVersion\": 1}";
    assertThat(fixture.verify(reordered, VersionedIntentDeriver.CURRENT_VERSION)).isTrue();
  }

  @Test
  void everySemanticMutationFailsExactCanonicalVerification() throws Exception {
    Fixture fixture = fixture();
    JsonNode baseline =
        MAPPER.readTree(fixture.derive(new VersionedIntentDeriver()).expectedIntent());
    assertMutationRejected(
        fixture,
        baseline,
        node -> ((ObjectNode) at(node, 0, 0).path("url")).put("value", "https://evil.test/"));
    assertMutationRejected(
        fixture,
        baseline,
        node -> ((ObjectNode) at(node, 1, 0).path("value")).put("name", "OTHER_USER"));
    assertMutationRejected(
        fixture,
        baseline,
        node -> ((ObjectNode) at(node, 2, 0).path("value")).put("id", "OTHER_SECRET"));
    assertMutationRejected(
        fixture, baseline, node -> ((ObjectNode) at(node, 3, 1).path("key")).put("value", "Tab"));
    assertMutationRejected(
        fixture, baseline, node -> ((ObjectNode) at(node, 4, 0)).put("op", "expectTitle"));
    assertMutationRejected(
        fixture,
        baseline,
        node ->
            ((ObjectNode) at(node, 5, 0).path("locator").path("segments").get(0))
                .put("role", "link"));
    assertMutationRejected(
        fixture,
        baseline,
        node ->
            ((ObjectNode)
                    at(node, 5, 0)
                        .path("locator")
                        .path("segments")
                        .get(0)
                        .path("options")
                        .path("name"))
                .put("value", "Wrong"));
    assertMutationRejected(
        fixture,
        baseline,
        node ->
            ((ObjectNode) at(node, 5, 0).path("locator").path("segments").get(0).path("options"))
                .put("exact", false));
    assertMutationRejected(
        fixture,
        baseline,
        node -> ((ObjectNode) at(node, 5, 0)).putObject("options").put("force", true));
    assertMutationRejected(
        fixture,
        baseline,
        node -> {
          JsonNode operations = node.path("steps").get(3).path("operations");
          JsonNode first = operations.get(0).deepCopy();
          ((com.fasterxml.jackson.databind.node.ArrayNode) operations).set(0, operations.get(1));
          ((com.fasterxml.jackson.databind.node.ArrayNode) operations).set(1, first);
        });
  }

  @Test
  void versionSourceIdentityAndStrictBoundsFailClosed() throws Exception {
    Fixture fixture = fixture();
    String expected = fixture.derive(new VersionedIntentDeriver()).expectedIntent();
    assertThat(fixture.verify(expected, null)).isFalse();
    assertThat(fixture.verify(expected, "9.9.9")).isFalse();
    assertThat(
            IntentRevisionVerifier.verify(
                "[\"changed\"]",
                fixture.authoring(),
                fixture.inputs(),
                CSI,
                fixture.configuration(),
                expected,
                VersionedIntentDeriver.CURRENT_VERSION,
                fixture.provenance()))
        .isFalse();
    assertThatThrownBy(
            () ->
                new VersionedIntentDeriver()
                    .derive(
                        VersionedIntentDeriver.CURRENT_VERSION,
                        fixture.source(),
                        fixture.authoring() + " {}",
                        fixture.inputs(),
                        CSI,
                        ENVIRONMENT))
        .isInstanceOf(VersionedIntentDeriver.DerivationException.class);
    ObjectNode oversizedCollection = (ObjectNode) MAPPER.readTree(fixture.authoring());
    com.fasterxml.jackson.databind.node.ArrayNode entries =
        (com.fasterxml.jackson.databind.node.ArrayNode)
            oversizedCollection.path("globalContext").path("entries");
    for (int index = 0; index < 501; index++) {
      entries.addObject().put("kind", "text").put("value", "bounded");
    }
    assertThatThrownBy(
            () ->
                new VersionedIntentDeriver()
                    .derive(
                        VersionedIntentDeriver.CURRENT_VERSION,
                        fixture.source(),
                        oversizedCollection.toString(),
                        fixture.inputs(),
                        CSI,
                        ENVIRONMENT))
        .isInstanceOf(VersionedIntentDeriver.DerivationException.class);
    String nested =
        "{\"authoringSchemaVersion\":2,\"globalContext\":{\"entries\":"
            + "[".repeat(70)
            + "null"
            + "]".repeat(70)
            + "},\"steps\":[]}";
    assertThatThrownBy(
            () ->
                new VersionedIntentDeriver()
                    .derive(
                        VersionedIntentDeriver.CURRENT_VERSION,
                        "[]",
                        nested,
                        fixture.inputs(),
                        CSI,
                        ENVIRONMENT))
        .isInstanceOf(VersionedIntentDeriver.DerivationException.class);
    assertThatThrownBy(
            () ->
                new VersionedIntentDeriver()
                    .derive(
                        VersionedIntentDeriver.CURRENT_VERSION,
                        fixture.source(),
                        fixture
                            .authoring()
                            .replace(
                                "\"authoringSchemaVersion\":2", "\"authoringSchemaVersion\":\"2\""),
                        fixture.inputs(),
                        CSI,
                        ENVIRONMENT))
        .isInstanceOf(VersionedIntentDeriver.DerivationException.class);
    assertThatThrownBy(
            () ->
                new VersionedIntentDeriver()
                    .derive(
                        VersionedIntentDeriver.CURRENT_VERSION,
                        fixture.source(),
                        fixture.authoring().replaceFirst("\\}$", ",\"unknown\":true}"),
                        fixture.inputs(),
                        CSI,
                        ENVIRONMENT))
        .isInstanceOf(VersionedIntentDeriver.DerivationException.class);
    assertThatThrownBy(
            () ->
                new VersionedIntentDeriver()
                    .derive(
                        VersionedIntentDeriver.CURRENT_VERSION,
                        fixture.source(),
                        fixture.authoring().replaceFirst("\"steps\"", "\"steps\":[],\"steps\""),
                        fixture.inputs(),
                        CSI,
                        ENVIRONMENT))
        .isInstanceOf(VersionedIntentDeriver.DerivationException.class);
    assertThatThrownBy(
            () ->
                new VersionedIntentDeriver()
                    .derive(
                        VersionedIntentDeriver.CURRENT_VERSION,
                        fixture.source(),
                        " ".repeat(300_000),
                        fixture.inputs(),
                        CSI,
                        ENVIRONMENT))
        .isInstanceOf(VersionedIntentDeriver.DerivationException.class);
  }

  @Test
  void savedCsiEnvironmentAndEvidenceScopeParticipateInVerification() throws Exception {
    JsonNode document =
        MAPPER.readTree(
            Files.readString(
                Path.of("../docs/specs/studio/examples/context-authoring-valid.json")));
    JsonNode request =
        java.util.stream.StreamSupport.stream(document.path("cases").spliterator(), false)
            .filter(item -> item.path("name").asText().equals("login-then-protected-navigation"))
            .findFirst()
            .orElseThrow()
            .path("request");
    String source =
        MAPPER.writeValueAsString(
            java.util.stream.StreamSupport.stream(request.path("steps").spliterator(), false)
                .map(item -> item.path("text").asText())
                .toList());
    AuthoringV2Request parsed = MAPPER.treeToValue(request, AuthoringV2Request.class);
    String inputs =
        MAPPER.writeValueAsString(AuthoringRevisionIdentity.create(parsed, java.util.Map.of()));
    VersionedIntentDeriver.Derivation correct =
        new VersionedIntentDeriver()
            .derive(
                VersionedIntentDeriver.CURRENT_VERSION,
                source,
                request.toString(),
                inputs,
                "60406",
                "Production");
    assertThat(correct.blockingDiagnostics()).isEmpty();
    assertThat(
            IntentRevisionVerifier.verify(
                source,
                request.toString(),
                inputs,
                "wrong-csi",
                "{\"environment\":\"Production\"}",
                correct.expectedIntent(),
                VersionedIntentDeriver.CURRENT_VERSION,
                "{\"intentDerivationVersion\":\"1.0.0\"}"))
        .isFalse();
    ObjectNode identity = (ObjectNode) MAPPER.readTree(inputs);
    for (java.util.function.Consumer<ObjectNode> mutation :
        List.<java.util.function.Consumer<ObjectNode>>of(
            node ->
                ((ObjectNode) node.path("selectedEvidenceReferences").get(0))
                    .put("id", UUID.randomUUID().toString()),
            node ->
                ((ObjectNode) node.path("selectedEvidenceReferences").get(0)).put("revision", 999),
            node ->
                ((ObjectNode) node.path("selectedEvidenceReferences").get(0))
                    .put("hash", "f".repeat(64)))) {
      ObjectNode changed = identity.deepCopy();
      mutation.accept(changed);
      assertThat(
              IntentRevisionVerifier.verify(
                  source,
                  request.toString(),
                  changed.toString(),
                  "60406",
                  "{\"environment\":\"Production\"}",
                  correct.expectedIntent(),
                  VersionedIntentDeriver.CURRENT_VERSION,
                  "{\"intentDerivationVersion\":\"1.0.0\"}"))
          .isFalse();
    }
    com.fasterxml.jackson.databind.node.ArrayNode selected =
        (com.fasterxml.jackson.databind.node.ArrayNode) identity.path("selectedEvidenceReferences");
    assertThat(selected.size()).isGreaterThan(1);
    ObjectNode reordered = identity.deepCopy();
    com.fasterxml.jackson.databind.node.ArrayNode reorderedSelected =
        (com.fasterxml.jackson.databind.node.ArrayNode)
            reordered.path("selectedEvidenceReferences");
    JsonNode firstEvidence = reorderedSelected.get(0).deepCopy();
    reorderedSelected.set(0, reorderedSelected.get(1));
    reorderedSelected.set(1, firstEvidence);
    assertThat(
            IntentRevisionVerifier.verify(
                source,
                request.toString(),
                reordered.toString(),
                "60406",
                "{\"environment\":\"Production\"}",
                correct.expectedIntent(),
                VersionedIntentDeriver.CURRENT_VERSION,
                "{\"intentDerivationVersion\":\"1.0.0\"}"))
        .isFalse();
    assertThat(
            IntentRevisionVerifier.verify(
                source,
                request.toString(),
                inputs,
                "60406",
                "{\"environment\":\"Staging\"}",
                correct.expectedIntent(),
                VersionedIntentDeriver.CURRENT_VERSION,
                "{\"intentDerivationVersion\":\"1.0.0\"}"))
        .isFalse();
  }

  @Test
  void completeRevisionIdentityContractRejectsMissingChangedReorderedAndDuplicateInputs()
      throws Exception {
    Fixture fixture = fixture();
    String expected = fixture.derive(new VersionedIntentDeriver()).expectedIntent();
    ObjectNode valid = (ObjectNode) MAPPER.readTree(fixture.inputs());
    assertThat(fixture.verify(expected, VersionedIntentDeriver.CURRENT_VERSION)).isTrue();
    ObjectNode reorderedProperties = MAPPER.createObjectNode();
    reorderedProperties.set("selectedEvidenceReferences", valid.path("selectedEvidenceReferences"));
    reorderedProperties.set("nonsecretReferencedValues", valid.path("nonsecretReferencedValues"));
    reorderedProperties.set("stepContexts", valid.path("stepContexts"));
    reorderedProperties.set("globalContext", valid.path("globalContext"));
    reorderedProperties.set("contextDigest", valid.path("contextDigest"));
    assertThat(
            IntentRevisionVerifier.verify(
                fixture.source(),
                fixture.authoring(),
                "  " + reorderedProperties.toPrettyString() + "  ",
                CSI,
                fixture.configuration(),
                expected,
                VersionedIntentDeriver.CURRENT_VERSION,
                fixture.provenance()))
        .isTrue();
    assertIdentityRejected(fixture, expected, MAPPER.createObjectNode());
    for (String required :
        List.of(
            "contextDigest",
            "globalContext",
            "stepContexts",
            "nonsecretReferencedValues",
            "selectedEvidenceReferences")) {
      ObjectNode missing = valid.deepCopy();
      missing.remove(required);
      assertIdentityRejected(fixture, expected, missing);
    }
    for (String hashField : List.of("contextDigest", "globalContext")) {
      ObjectNode changed = valid.deepCopy();
      changed.put(hashField, "f".repeat(64));
      assertIdentityRejected(fixture, expected, changed);
    }
    ObjectNode stepHash = valid.deepCopy();
    ((ObjectNode) stepHash.path("stepContexts").get(0)).put("hash", "f".repeat(64));
    assertIdentityRejected(fixture, expected, stepHash);
    assertReorderedAndDuplicateRejected(fixture, expected, valid, "stepContexts");
    ObjectNode valueHash = valid.deepCopy();
    ((ObjectNode) valueHash.path("nonsecretReferencedValues").get(0))
        .put("valueHash", "f".repeat(64));
    assertIdentityRejected(fixture, expected, valueHash);
    assertReorderedAndDuplicateRejected(fixture, expected, valid, "nonsecretReferencedValues");
    ObjectNode malformedReference = valid.deepCopy();
    ((ObjectNode) malformedReference.path("nonsecretReferencedValues").get(0))
        .put("referenceId", "");
    assertIdentityRejected(fixture, expected, malformedReference);
    ObjectNode malformedStep = valid.deepCopy();
    ((ObjectNode) malformedStep.path("stepContexts").get(0)).put("stepId", "not-a-uuid");
    assertIdentityRejected(fixture, expected, malformedStep);
    ObjectNode unknown = valid.deepCopy();
    unknown.put("unknown", true);
    assertIdentityRejected(fixture, expected, unknown);
    for (String malformed :
        List.of(
            fixture.inputs() + " {}",
            fixture.inputs().replaceFirst("\\{", "{\"contextDigest\":\"" + "f".repeat(64) + "\","),
            fixture
                .inputs()
                .replaceFirst("\"contextDigest\":\"[a-f0-9]{64}\"", "\"contextDigest\":42"),
            fixture
                .inputs()
                .replaceFirst("\"stepId\":\"[0-9a-f-]+\"", "\"stepId\":\"not-a-uuid\""))) {
      assertThat(
              IntentRevisionVerifier.verify(
                  fixture.source(),
                  fixture.authoring(),
                  malformed,
                  CSI,
                  fixture.configuration(),
                  expected,
                  VersionedIntentDeriver.CURRENT_VERSION,
                  fixture.provenance()))
          .isFalse();
    }
  }

  private static void assertMutationRejected(
      Fixture fixture, JsonNode baseline, java.util.function.Consumer<ObjectNode> mutation)
      throws Exception {
    ObjectNode changed = baseline.deepCopy();
    mutation.accept(changed);
    assertThat(
            fixture.verify(
                MAPPER.writeValueAsString(changed), VersionedIntentDeriver.CURRENT_VERSION))
        .isFalse();
  }

  private static void assertIdentityRejected(Fixture fixture, String expected, JsonNode identity) {
    assertThat(
            IntentRevisionVerifier.verify(
                fixture.source(),
                fixture.authoring(),
                identity.toString(),
                CSI,
                fixture.configuration(),
                expected,
                VersionedIntentDeriver.CURRENT_VERSION,
                fixture.provenance()))
        .isFalse();
  }

  private static void assertReorderedAndDuplicateRejected(
      Fixture fixture, String expected, ObjectNode valid, String field) {
    com.fasterxml.jackson.databind.node.ArrayNode original =
        (com.fasterxml.jackson.databind.node.ArrayNode) valid.path(field);
    assertThat(original.size()).isGreaterThan(1);
    ObjectNode reordered = valid.deepCopy();
    com.fasterxml.jackson.databind.node.ArrayNode reorderedItems =
        (com.fasterxml.jackson.databind.node.ArrayNode) reordered.path(field);
    JsonNode first = reorderedItems.get(0).deepCopy();
    reorderedItems.set(0, reorderedItems.get(1));
    reorderedItems.set(1, first);
    assertIdentityRejected(fixture, expected, reordered);
    ObjectNode duplicated = valid.deepCopy();
    ((com.fasterxml.jackson.databind.node.ArrayNode) duplicated.path(field))
        .add(duplicated.path(field).get(0).deepCopy());
    assertIdentityRejected(fixture, expected, duplicated);
  }

  private static JsonNode at(JsonNode document, int step, int operation) {
    return document.path("steps").get(step).path("operations").get(operation);
  }

  private static Fixture fixture() throws Exception {
    List<AuthoringStep> steps =
        List.of(
            step("Navigate to \"https://example.test/login\""),
            new AuthoringStep(
                UUID.randomUUID(),
                "Type \"<var LOGIN_USER>\" in the \"Username\" field",
                new StepAuthoringContext(List.of(new VariableReference("LOGIN_USER")), List.of())),
            step("Type \"<secret LOGIN_PASSWORD>\" in the \"Password\" field"),
            new AuthoringStep(
                UUID.randomUUID(),
                "Type \"<var SEARCH_QUERY>\" in the \"Search\" field and press Enter",
                new StepAuthoringContext(
                    List.of(new VariableReference("SEARCH_QUERY")), List.of())),
            step("Assert that the URL is \"https://example.test/home\""),
            new AuthoringStep(
                UUID.randomUUID(),
                "Submit the login form",
                new StepAuthoringContext(
                    List.of(new TargetHint(TargetHint.Strategy.ROLE, "button", "Sign in", true)),
                    List.of())));
    AuthoringV2Request authoring = new AuthoringV2Request(2, GlobalAuthoringContext.empty(), steps);
    AuthoringRevisionInputs inputs =
        AuthoringRevisionIdentity.create(
            authoring, java.util.Map.of("LOGIN_USER", "alice", "SEARCH_QUERY", "query"));
    return new Fixture(
        MAPPER.writeValueAsString(steps.stream().map(AuthoringStep::text).toList()),
        MAPPER.writeValueAsString(authoring),
        MAPPER.writeValueAsString(inputs),
        "{\"environment\":\"Production\"}",
        "{\"intentDerivationVersion\":\"1.0.0\"}");
  }

  private static AuthoringStep step(String text) {
    return new AuthoringStep(UUID.randomUUID(), text, StepAuthoringContext.empty());
  }

  private record Fixture(
      String source, String authoring, String inputs, String configuration, String provenance) {
    VersionedIntentDeriver.Derivation derive(VersionedIntentDeriver deriver) {
      return deriver.deriveRevision(
          VersionedIntentDeriver.CURRENT_VERSION, source, authoring, inputs, CSI, configuration);
    }

    boolean verify(String expected, String version) {
      return IntentRevisionVerifier.verify(
          source, authoring, inputs, CSI, configuration, expected, version, provenance);
    }
  }
}
