package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dto.AuthoringRevisionInputs;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.ContextualDefault;
import com.citi.put.checks.studio.dto.DefaultVariableValue;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.dto.SecretReference;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import com.citi.put.checks.studio.dto.TargetHint;
import com.citi.put.checks.studio.dto.VariableReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class VersionedIntentDeriverTest {

  private static final ObjectMapper MAPPER = new ObjectMapper().findAndRegisterModules();
  private static final String PROVENANCE = "{\"intentDerivationVersion\":\"2\"}";
  private static final String SECRET_CANARY = "secret-value-must-never-appear";

  @Test
  void policyIsDerivedFromTokensAndStructuredContextOnly() throws Exception {
    Fixture fixture = fixture();
    VersionedIntentDeriver.Derivation derived = fixture.derive(new VersionedIntentDeriver());

    assertThat(MAPPER.readTree(derived.referencePolicy()))
        .isEqualTo(
            MAPPER.readTree(
                """
                {"version":2,"steps":[
                  {"stepIndex":0,
                   "required":{"variables":[],"secrets":[]},
                   "allowed":{"variables":["BASE_URL"],"secrets":[]}},
                  {"stepIndex":1,
                   "required":{"variables":["LOGIN_USER"],"secrets":[]},
                   "allowed":{"variables":["BASE_URL","LOGIN_USER"],"secrets":[]}},
                  {"stepIndex":2,
                   "required":{"variables":[],"secrets":["LOGIN_PASSWORD"]},
                   "allowed":{"variables":["BASE_URL"],"secrets":["LOGIN_PASSWORD"]}},
                  {"stepIndex":3,
                   "required":{"variables":["A_QUERY","B_QUERY"],"secrets":["TOKEN"]},
                   "allowed":{"variables":["A_QUERY","BASE_URL","B_QUERY","STEP_DEFAULT"],
                              "secrets":["TOKEN"]}},
                  {"stepIndex":4,
                   "required":{"variables":[],"secrets":[]},
                   "allowed":{"variables":["BASE_URL"],"secrets":[]}}]}
                """));
    assertThat(derived.referencePolicy()).doesNotContain(SECRET_CANARY);
    assertThat(fixture.derive(new VersionedIntentDeriver()).referencePolicy())
        .isEqualTo(derived.referencePolicy());
  }

  @Test
  void canonicalPolicyVerifiesAndEverySemanticMutationFails() throws Exception {
    Fixture fixture = fixture();
    String policy = fixture.derive(new VersionedIntentDeriver()).referencePolicy();
    JsonNode baseline = MAPPER.readTree(policy);
    String reordered = "{\"steps\":" + baseline.path("steps") + ", \"version\": 2}";
    assertThat(fixture.verify(reordered, VersionedIntentDeriver.CURRENT_VERSION)).isTrue();

    assertMutationRejected(
        fixture, baseline, node -> refs(node, 0, "allowed", "secrets").add("OTHER_SECRET"));
    assertMutationRejected(
        fixture, baseline, node -> refs(node, 1, "required", "variables").removeAll());
    assertMutationRejected(
        fixture, baseline, node -> refs(node, 2, "required", "secrets").add("LOGIN_PASSWORD"));
    assertMutationRejected(fixture, baseline, node -> node.put("version", 1));
    assertMutationRejected(fixture, baseline, node -> ((ArrayNode) node.path("steps")).remove(4));
  }

  @Test
  void versionSourceIdentityAndStrictBoundsFailClosed() throws Exception {
    Fixture fixture = fixture();
    String policy = fixture.derive(new VersionedIntentDeriver()).referencePolicy();
    assertThat(fixture.verify(policy, null)).isFalse();
    assertThat(fixture.verify(policy, "9.9.9")).isFalse();
    // Revisions derived by the retired English grammar need one recompile (ADR-SC-003).
    assertThat(fixture.verify(policy, "1.0.0")).isFalse();
    assertThat(
            IntentRevisionVerifier.verify(
                fixture.source(),
                fixture.authoring(),
                fixture.inputs(),
                policy,
                VersionedIntentDeriver.CURRENT_VERSION,
                "{\"intentDerivationVersion\":\"1.0.0\"}"))
        .isFalse();
    assertThat(
            IntentRevisionVerifier.verify(
                "[\"changed\"]",
                fixture.authoring(),
                fixture.inputs(),
                policy,
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
                        fixture.inputs()))
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
                        fixture.inputs()))
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
                    .derive(VersionedIntentDeriver.CURRENT_VERSION, "[]", nested, fixture.inputs()))
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
                        fixture.inputs()))
        .isInstanceOf(VersionedIntentDeriver.DerivationException.class);
    assertThatThrownBy(
            () ->
                new VersionedIntentDeriver()
                    .derive(
                        VersionedIntentDeriver.CURRENT_VERSION,
                        fixture.source(),
                        fixture.authoring().replaceFirst("\\}$", ",\"unknown\":true}"),
                        fixture.inputs()))
        .isInstanceOf(VersionedIntentDeriver.DerivationException.class);
    assertThatThrownBy(
            () ->
                new VersionedIntentDeriver()
                    .derive(
                        VersionedIntentDeriver.CURRENT_VERSION,
                        fixture.source(),
                        fixture.authoring().replaceFirst("\"steps\"", "\"steps\":[],\"steps\""),
                        fixture.inputs()))
        .isInstanceOf(VersionedIntentDeriver.DerivationException.class);
    assertThatThrownBy(
            () ->
                new VersionedIntentDeriver()
                    .derive(
                        VersionedIntentDeriver.CURRENT_VERSION,
                        fixture.source(),
                        " ".repeat(300_000),
                        fixture.inputs()))
        .isInstanceOf(VersionedIntentDeriver.DerivationException.class);
  }

  @Test
  void savedEvidenceIdentityParticipatesInVerification() throws Exception {
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
            .derive(VersionedIntentDeriver.CURRENT_VERSION, source, request.toString(), inputs);
    assertThat(
            IntentRevisionVerifier.verify(
                source,
                request.toString(),
                inputs,
                correct.referencePolicy(),
                VersionedIntentDeriver.CURRENT_VERSION,
                PROVENANCE))
        .isTrue();
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
                  correct.referencePolicy(),
                  VersionedIntentDeriver.CURRENT_VERSION,
                  PROVENANCE))
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
                correct.referencePolicy(),
                VersionedIntentDeriver.CURRENT_VERSION,
                PROVENANCE))
        .isFalse();
  }

  @Test
  void completeRevisionIdentityContractRejectsMissingChangedReorderedAndDuplicateInputs()
      throws Exception {
    Fixture fixture = fixture();
    String policy = fixture.derive(new VersionedIntentDeriver()).referencePolicy();
    ObjectNode valid = (ObjectNode) MAPPER.readTree(fixture.inputs());
    assertThat(fixture.verify(policy, VersionedIntentDeriver.CURRENT_VERSION)).isTrue();
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
                policy,
                VersionedIntentDeriver.CURRENT_VERSION,
                fixture.provenance()))
        .isTrue();
    assertIdentityRejected(fixture, policy, MAPPER.createObjectNode());
    for (String required :
        List.of(
            "contextDigest",
            "globalContext",
            "stepContexts",
            "nonsecretReferencedValues",
            "selectedEvidenceReferences")) {
      ObjectNode missing = valid.deepCopy();
      missing.remove(required);
      assertIdentityRejected(fixture, policy, missing);
    }
    for (String hashField : List.of("contextDigest", "globalContext")) {
      ObjectNode changed = valid.deepCopy();
      changed.put(hashField, "f".repeat(64));
      assertIdentityRejected(fixture, policy, changed);
    }
    ObjectNode stepHash = valid.deepCopy();
    ((ObjectNode) stepHash.path("stepContexts").get(0)).put("hash", "f".repeat(64));
    assertIdentityRejected(fixture, policy, stepHash);
    assertReorderedAndDuplicateRejected(fixture, policy, valid, "stepContexts");
    ObjectNode valueHash = valid.deepCopy();
    ((ObjectNode) valueHash.path("nonsecretReferencedValues").get(0))
        .put("valueHash", "f".repeat(64));
    assertIdentityRejected(fixture, policy, valueHash);
    assertReorderedAndDuplicateRejected(fixture, policy, valid, "nonsecretReferencedValues");
    ObjectNode malformedReference = valid.deepCopy();
    ((ObjectNode) malformedReference.path("nonsecretReferencedValues").get(0))
        .put("referenceId", "");
    assertIdentityRejected(fixture, policy, malformedReference);
    ObjectNode malformedStep = valid.deepCopy();
    ((ObjectNode) malformedStep.path("stepContexts").get(0)).put("stepId", "not-a-uuid");
    assertIdentityRejected(fixture, policy, malformedStep);
    ObjectNode unknown = valid.deepCopy();
    unknown.put("unknown", true);
    assertIdentityRejected(fixture, policy, unknown);
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
                  policy,
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

  private static void assertIdentityRejected(Fixture fixture, String policy, JsonNode identity) {
    assertThat(
            IntentRevisionVerifier.verify(
                fixture.source(),
                fixture.authoring(),
                identity.toString(),
                policy,
                VersionedIntentDeriver.CURRENT_VERSION,
                fixture.provenance()))
        .isFalse();
  }

  private static void assertReorderedAndDuplicateRejected(
      Fixture fixture, String policy, ObjectNode valid, String field) {
    com.fasterxml.jackson.databind.node.ArrayNode original =
        (com.fasterxml.jackson.databind.node.ArrayNode) valid.path(field);
    assertThat(original.size()).isGreaterThan(1);
    ObjectNode reordered = valid.deepCopy();
    com.fasterxml.jackson.databind.node.ArrayNode reorderedItems =
        (com.fasterxml.jackson.databind.node.ArrayNode) reordered.path(field);
    JsonNode first = reorderedItems.get(0).deepCopy();
    reorderedItems.set(0, reorderedItems.get(1));
    reorderedItems.set(1, first);
    assertIdentityRejected(fixture, policy, reordered);
    ObjectNode duplicated = valid.deepCopy();
    ((com.fasterxml.jackson.databind.node.ArrayNode) duplicated.path(field))
        .add(duplicated.path(field).get(0).deepCopy());
    assertIdentityRejected(fixture, policy, duplicated);
  }

  private static ArrayNode refs(JsonNode document, int step, String set, String kind) {
    return (ArrayNode) document.path("steps").get(step).path(set).path(kind);
  }

  private static Fixture fixture() throws Exception {
    List<AuthoringStep> steps =
        List.of(
            step("Open the login page"),
            new AuthoringStep(
                UUID.randomUUID(),
                "Enter <var LOGIN_USER> as the username",
                new StepAuthoringContext(List.of(new VariableReference("LOGIN_USER")), List.of())),
            new AuthoringStep(
                UUID.randomUUID(),
                "Enter the password",
                new StepAuthoringContext(
                    List.of(new SecretReference("LOGIN_PASSWORD")), List.of())),
            new AuthoringStep(
                UUID.randomUUID(),
                "Search for <var B_QUERY> then <var A_QUERY> and <var B_QUERY> using <secret TOKEN>",
                new StepAuthoringContext(
                    List.of(
                        new ContextualDefault("region", new DefaultVariableValue("STEP_DEFAULT")),
                        new TargetHint(TargetHint.Strategy.ROLE, "button", "Search", true)),
                    List.of())),
            step("Verify the page heading says Example Domain"));
    AuthoringV2Request authoring =
        new AuthoringV2Request(
            2,
            new GlobalAuthoringContext(
                List.of(new ContextualDefault("base", new DefaultVariableValue("BASE_URL"))),
                List.of()),
            steps);
    AuthoringRevisionInputs inputs =
        AuthoringRevisionIdentity.create(
            authoring,
            java.util.Map.of(
                "LOGIN_USER", SECRET_CANARY, "STEP_DEFAULT", "emea", "BASE_URL", "https://x.test"));
    return new Fixture(
        MAPPER.writeValueAsString(steps.stream().map(AuthoringStep::text).toList()),
        MAPPER.writeValueAsString(authoring),
        MAPPER.writeValueAsString(inputs),
        PROVENANCE);
  }

  private static AuthoringStep step(String text) {
    return new AuthoringStep(UUID.randomUUID(), text, StepAuthoringContext.empty());
  }

  private record Fixture(String source, String authoring, String inputs, String provenance) {
    VersionedIntentDeriver.Derivation derive(VersionedIntentDeriver deriver) {
      return deriver.derive(VersionedIntentDeriver.CURRENT_VERSION, source, authoring, inputs);
    }

    boolean verify(String policy, String version) {
      return IntentRevisionVerifier.verify(source, authoring, inputs, policy, version, provenance);
    }
  }
}
