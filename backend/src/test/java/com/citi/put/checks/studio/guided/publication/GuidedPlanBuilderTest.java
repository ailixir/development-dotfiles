package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.TreeMap;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/** Original fixture facts are independently authored by RUNNER, not emitted by the Java builder. */
class GuidedPlanBuilderTest {
  static final GuidedContracts C = new GuidedContracts();

  static ObjectNode fixture(String name) throws Exception {
    return (ObjectNode)
        C.parse(
            Files.readString(
                Path.of("../studio-runner/fixtures/observed-reference/" + name + ".json")));
  }

  /** Independent Python proof fixture; this synthetic projection is not browser evidence. */
  static ObjectNode choiceFixture() throws Exception {
    return copy(
        C.parse(
                Files.readString(
                    Path.of(
                        "../docs/specs/studio-observed-authoring/contracts/v2/publication-fixtures.json")))
            .path("observedChoice"));
  }

  static ObjectNode copy(JsonNode n) {
    return (ObjectNode) n.deepCopy();
  }

  static ObjectNode object(JsonNode n, String field) {
    return (ObjectNode) n.path(field);
  }

  static ObjectNode at(JsonNode n, String field, int index) {
    return (ObjectNode) n.path(field).get(index);
  }

  static ArrayNode array(JsonNode n, String field) {
    return (ArrayNode) n.path(field);
  }

  /** Independent test-only canonical encoder; expected artifact/hash files are external oracles. */
  static String canonical(JsonNode n) {
    if (n.isObject()) {
      var fields = new TreeMap<String, JsonNode>();
      n.fields().forEachRemaining(e -> fields.put(e.getKey(), e.getValue()));
      return "{"
          + fields.entrySet().stream()
              .map(e -> C.object().textNode(e.getKey()).toString() + ":" + canonical(e.getValue()))
              .collect(java.util.stream.Collectors.joining(","))
          + "}";
    }
    if (n.isArray()) {
      var values = new ArrayList<String>();
      n.forEach(v -> values.add(canonical(v)));
      return "[" + String.join(",", values) + "]";
    }
    return n.toString();
  }

  static String hash(JsonNode n) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256")
                  .digest(canonical(n).getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  /**
   * Synthetic original rows use their actual constructed manifest hash, not the opaque standalone
   * fixture sourceManifestHash. They are separate proof baselines.
   */
  static final class Original {
    final ObjectNode expected, base, current, session, raw;

    Original(JsonNode input) {
      expected = copy(input);
      base = C.object();
      current = C.object();
      session = C.object();
      raw = C.object();
      var manifest = C.object();
      var sources = manifest.putArray("sourceSteps");
      for (JsonNode step : expected.path("sourceSteps")) {
        sources
            .addObject()
            .put("stepId", step.path("stepId").asText())
            .put("text", step.path("source").asText());
      }
      var configs = manifest.putArray("configurationReferences");
      for (JsonNode ref : expected.path("configurationReferences")) {
        var value = copy(ref);
        value.remove("inputId");
        configs.add(value);
      }
      raw.set("sourceManifest", manifest);
      expected.put("sourceManifestHash", hash(manifest));
      for (String key :
          List.of(
              "sessionId",
              "testId",
              "csiId",
              "sourceRevision",
              "configurationRevision",
              "sourceHash",
              "configurationHash",
              "authoringHash",
              "sourceManifestHash",
              "replayRequirements")) {
        base.set(key, expected.path(key).deepCopy());
      }
      current.set("configuration", expected.path("configuration").deepCopy());
      session.set("sessionId", expected.path("sessionId"));
      session.set("scope", expected.path("scope").deepCopy());
      session.put("scopeHash", hash(expected.path("scope")));
      session.set("runAuthorization", expected.path("runAuthorization").deepCopy());
      session.putObject("owner").put("workerId", "worker-1").put("fence", 1);
      var sourceSteps = session.putArray("sourceSteps");
      for (JsonNode step : expected.path("sourceSteps")) {
        sourceSteps.addObject().put("stepId", step.path("stepId").asText());
      }
      session.putObject("limits").put("maxStatementsPerStep", 8);
      // Synthetic session expiry is the original question expiry, never wall-clock restamping.
      for (JsonNode preparation : expected.path("preparations")) {
        if (preparation.has("observedChoice")) {
          session.set(
              "expiresAt",
              preparation
                  .path("observedChoice")
                  .path("context")
                  .path("question")
                  .path("expiresAt"));
        }
      }
      for (String key :
          List.of(
              "translationRevision",
              "translationHash",
              "translationPlan",
              "sourceSelections",
              "observations",
              "preparations",
              "allocations",
              "producers",
              "consumerEdges")) {
        raw.set(key, expected.path(key).deepCopy());
      }
      var material = raw.putObject("materialization");
      material.set("authoredInputsHash", expected.path("authoredInputsHash"));
      for (String key :
          List.of("contextId", "contextRevision", "materializationRevision", "ownerFence")) {
        material.set(key, expected.path("bootstrap").path(key));
      }
      material.put("workerId", "worker-1");
      var inputs = material.putArray("inputs");
      for (JsonNode inputRow : expected.path("inputs")) {
        var row = copy(inputRow);
        row.set("sourceStepId", row.remove("stepId"));
        inputs.add(row);
      }
      var actions = raw.putArray("actions");
      var admissionRows = raw.putArray("admissionAssociations");
      var obligationRows = raw.putArray("obligationAssociations");
      for (JsonNode fact : expected.path("actions")) {
        var ledger = copy(fact.path("ledger"));
        actions.add(ledger);
        var prep =
            find(raw.path("preparations"), "preparationId", fact.path("preparationId").asText());
        var obligation =
            find(
                raw.path("translationPlan").path("obligations"),
                "obligationId",
                fact.path("obligationId").asText());
        var association = admissionRows.addObject();
        association.set("obligationId", fact.path("obligationId"));
        association.set("preparationId", fact.path("preparationId"));
        association.set("admissionId", ledger.path("admission").path("admissionId"));
        association.set("proposalHash", ledger.path("requestDigest"));
        var original = obligationRows.addObject();
        original.set("obligationId", fact.path("obligationId"));
        original.set("meaning", obligation.deepCopy());
        original.set("proposal", prep.path("proposal").deepCopy());
        original.set("proposalDigest", ledger.path("requestDigest"));
        original.set("admissionId", ledger.path("admission").path("admissionId"));
        original.put("planRevision", 1);
      }
      var original = raw.putObject("bootstrap");
      var marker = original.putObject("marker").put("phase", "READY");
      var context = marker.putObject("context");
      for (String key : List.of("contextId", "contextRevision", "materializationRevision")) {
        context.set(key, expected.path("bootstrap").path(key));
      }
      context.set("authoredInputsHash", expected.path("bootstrap").path("inputsHash"));
      context.set("allocations", expected.path("allocations").deepCopy());
      var bootIdentity = marker.putObject("identity").put("workerId", "worker-1").put("fence", 1);
      bootIdentity.set("scopeHash", session.path("scopeHash"));
      bootIdentity.set("sourceRevision", expected.path("sourceRevision"));
      bootIdentity.set("configurationRevision", expected.path("configurationRevision"));
      marker.put("planRevision", 1);
      marker
          .putObject("metadataAcknowledgement")
          .put("version", 2)
          .put("deliveryId", "original-ack")
          .put("contextHash", hash(context))
          .put("identityHash", hash(marker.path("identity")));
      original.set(
          "initialEvidence", expected.path("bootstrap").path("initialEvidence").deepCopy());
      var bootReceipt =
          C.object()
              .put("contextId", context.path("contextId").asText())
              .put("contextRevision", 1)
              .put("workerId", "worker-1")
              .put("ownerFence", 1);
      for (String field : List.of("sourceRevision", "configurationRevision")) {
        bootReceipt.set(field, expected.path(field));
      }
      bootReceipt.set("scopeHash", session.path("scopeHash"));
      original.set("receipt", bootReceipt);
      for (int i = 0; i < raw.path("preparations").size(); i++) {
        rewriteProposal(
            i,
            p -> {
              /* Recompute the unchanged proposal proof. */
            });
        at(expected, "actions", i).set("ledger", raw.path("actions").get(i).deepCopy());
      }
    }

    ObjectNode build() {
      return new GuidedPlanBuilder(C)
          .basis(
              new PublicationContracts.Base(base),
              new PublicationContracts.CurrentSource(current),
              new PublicationContracts.Evidence(raw),
              session,
              expected.path("learningProvenance"));
    }

    void rewriteProposal(int index, Consumer<ObjectNode> mutate) {
      var prep = at(raw, "preparations", index);
      var proposal = object(prep, "proposal");
      mutate.accept(proposal);
      var ledger = at(raw, "actions", index);
      var joined = at(raw, "admissionAssociations", index);
      var association = at(raw, "obligationAssociations", index);
      String digest = hash(proposal);
      object(prep, "proof").put("requestDigest", digest);
      ledger.put("requestDigest", digest);
      joined.put("proposalHash", digest);
      association.put("proposalDigest", digest);
      association.set("proposal", proposal.deepCopy());
      var operation = C.object();
      operation.set("coordinate", proposal.path("coordinate"));
      operation.set("origin", proposal.path("executionEvidence").path("origin"));
      operation.set(
          "locator",
          proposal.path("target").has("locator")
              ? proposal.path("target").path("locator")
              : C.object().nullNode());
      operation.set("operation", proposal.path("operation"));
      ledger.put("operationHash", hash(operation));
      var decision = C.object();
      decision.set("scopeHash", session.path("scopeHash"));
      decision.set("preparation", prep.path("proof"));
      decision.put("requestDigest", digest);
      object(ledger, "admission").put("policyDecisionHash", hash(decision));
    }

    void rewriteObservation(Consumer<ObjectNode> mutate) {
      rewriteObservation(0, mutate);
    }

    void rewriteObservation(int index, Consumer<ObjectNode> mutate) {
      var row = at(raw, "observations", index);
      String old = row.path("observationHash").asText();
      mutate.accept(object(row, "observation"));
      String replacement = hash(row.path("observation"));
      row.put("observationHash", replacement);
      for (int i = 0; i < raw.path("preparations").size(); i++) {
        if (at(raw, "preparations", i).path("observationHash").asText().equals(old)) {
          var prep = at(raw, "preparations", i);
          prep.put("observationHash", replacement);
          object(prep, "executionEvidence").put("observationHash", replacement);
          var evidence = prep.path("executionEvidence");
          var ledger = at(raw, "actions", i);
          ledger.set("executionEvidence", evidence.deepCopy());
          ledger.put("evidenceHash", hash(evidence));
          object(prep, "proof").put("evidenceHash", hash(evidence));
          rewriteProposal(
              i,
              p -> {
                p.set("executionEvidence", evidence.deepCopy());
                p.put("evidenceHash", hash(evidence));
              });
        }
      }
    }

    ObjectNode witness() {
      return object(at(raw, "preparations", 3), "observedChoice");
    }

    void resealChoice() {
      ObjectNode witness = witness(), context = object(witness, "context");
      if (!witness.path("receipt").isObject()) {
        return;
      }
      ObjectNode receipt = object(witness, "receipt");
      if (context.path("questionCapture").isObject()) {
        ObjectNode capture = object(context, "questionCapture");
        capture.put("modelQuestionHash", hash(witness.path("attempt").path("modelQuestion")));
        receipt.put("questionCaptureHash", hash(capture));
      }
      receipt
          .put("contextIdentityHash", hash(context))
          .put("meaningsHash", hash(witness.path("meanings")));
    }

    void rewriteQuestionObservation(Consumer<ObjectNode> mutate) {
      ObjectNode capture = object(object(witness(), "context"), "questionCapture");
      ObjectNode row =
          find(
              raw.path("observations"),
              "observationHash",
              capture.path("observationHash").asText());
      mutate.accept(object(row, "observation"));
      String replacement = hash(row.path("observation"));
      row.put("observationHash", replacement);
      capture.put("observationHash", replacement);
      object(capture, "executionEvidence").put("observationHash", replacement);
      capture.put("evidenceHash", hash(capture.path("executionEvidence")));
      object(witness(), "attempt")
          .set("executionEvidence", capture.path("executionEvidence").deepCopy());
      resealChoice();
    }

    /** Test-only projection of mutated supplied rows; no hidden database completeness claim. */
    ObjectNode suppliedBasis() {
      ObjectNode basis = expected.deepCopy();
      for (String key :
          List.of(
              "translationRevision",
              "translationHash",
              "translationPlan",
              "sourceSelections",
              "observations",
              "preparations",
              "allocations",
              "producers",
              "consumerEdges")) {
        basis.set(key, raw.path(key).deepCopy());
      }
      for (int i = 0; i < raw.path("actions").size(); i++) {
        at(basis, "actions", i).set("ledger", raw.path("actions").get(i).deepCopy());
        at(basis, "obligationAssociations", i)
            .set("proposalHash", raw.path("admissionAssociations").get(i).path("proposalHash"));
      }
      return basis;
    }
  }

  static ObjectNode find(JsonNode rows, String field, String value) {
    for (JsonNode row : rows) {
      if (row.path(field).asText().equals(value)) {
        return (ObjectNode) row;
      }
    }
    throw new IllegalArgumentException("fixture join missing");
  }

  @Test
  void reconstructsOriginalFiveActionsAndAllocatedGraphWithoutValueMaterialization()
      throws Exception {
    var f = new Original(fixture("fresh-order-reference").path("basis"));
    var result = f.build();
    assertThat(result).isEqualTo(f.expected);
    assertThat(result.path("translationPlan").path("needs").get(0).path("bindingId").asText())
        .isEqualTo("binding-reference");
    assertThat(result.path("bindings").get(0).path("consumers").size()).isEqualTo(2);
    assertThat(
            result
                .path("preparations")
                .get(0)
                .path("proposal")
                .path("target")
                .path("kind")
                .asText())
        .isEqualTo("page");
    assertThat(result.path("preparations").get(0).path("observationHash").isNull()).isTrue();
  }

  @Test
  void ordersOriginalActionsBySourceRatherThanUuidOrRepositoryOrder() throws Exception {
    var original = fixture("fresh-order-reference").path("basis");
    String serialized =
        original
            .toString()
            .replace("00000000-0000-4000-8000-000000000001", "ffffffff-ffff-4fff-8fff-ffffffffffff")
            .replace(
                "00000000-0000-4000-8000-000000000002", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    var basis = (ObjectNode) C.parse(serialized);
    basis
        .put("authoringHash", hash(basis.path("sourceSteps")))
        .put("translationHash", hash(basis.path("translationPlan")));
    var f = new Original(basis);
    for (int i = 0; i < f.raw.path("preparations").size(); i++) {
      f.rewriteProposal(
          i,
          p -> {
            /* Recompute the unchanged proposal proof. */
          });
    }
    var rows = new ArrayList<JsonNode>();
    f.raw.path("actions").forEach(rows::add);
    rows.sort(Comparator.comparing(n -> n.path("coordinate").path("stepId").asText()));
    array(f.raw, "actions").removeAll().addAll(rows);
    var result = f.build();
    assertThat(
            result.path("actions").get(0).path("ledger").path("coordinate").path("stepId").asText())
        .isEqualTo("ffffffff-ffff-4fff-8fff-ffffffffffff");
    assertThat(
            result.path("actions").get(1).path("ledger").path("coordinate").path("stepId").asText())
        .isEqualTo("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  }

  @Test
  void historicalOutputContractIsNotInventedFullPromptOrProviderVersion() {
    var manifest = C.object();
    var pins =
        manifest
            .putObject("schemaPins")
            .put("strictSchemaHash", "a".repeat(64))
            .put("outputContractHash", "b".repeat(64));
    pins.putObject("providerSchemaHashes")
        .put("SOURCE_PLAN", "c".repeat(64))
        .put("NEXT_ACTION", "d".repeat(64))
        .put("VERIFY_STEP", "e".repeat(64));
    var result = new GuidedPlanBuilder(C).learningProvenance(manifest);
    assertThat(result.path("outputContractHash").asText()).isEqualTo("b".repeat(64));
    assertThat(result.path("guidedPromptHash").isNull()).isTrue();
    assertThat(result.path("configuredModel").isNull()).isTrue();
    assertThat(result.path("providerReturnedModelVersion").isNull()).isTrue();
    assertThat(result.path("guidedProviderSchemaHash").asText())
        .isEqualTo(hash(pins.path("providerSchemaHashes")));
  }

  @Test
  void missingImmutableOutputOrSchemaPinsCannotBecomeInventedProvenance() {
    var manifest = C.object();
    var pins =
        manifest
            .putObject("schemaPins")
            .put("strictSchemaHash", "a".repeat(64))
            .put("outputContractHash", "b".repeat(64));
    pins.putObject("providerSchemaHashes")
        .put("SOURCE_PLAN", "c".repeat(64))
        .put("NEXT_ACTION", "d".repeat(64))
        .put("VERIFY_STEP", "e".repeat(64));
    for (String field : List.of("strictSchemaHash", "outputContractHash", "providerSchemaHashes")) {
      var invalid = manifest.deepCopy();
      object(invalid, "schemaPins").remove(field);
      assertThatThrownBy(() -> new GuidedPlanBuilder(C).learningProvenance(invalid))
          .isInstanceOf(GuidedSessionException.class);
    }
  }

  @Test
  void controlReadRejectsPasswordReplacementWithCoherentObservationAndAdmissionHashes()
      throws Exception {
    var f = new Original(fixture("control-value-reference").path("basis"));
    assertThat(f.build()).as("unaltered control-value evidence").isEqualTo(f.expected);
    f.rewriteObservation(o -> at(o, "nodes", 0).put("controlType", "password"));
    assertThatThrownBy(f::build).isInstanceOf(GuidedSessionException.class);
  }

  record Mutation(String name, Consumer<Original> change) {
    @Override
    public String toString() {
      return name;
    }
  }

  static Stream<Mutation> brokenJoins() {
    return Stream.of(
        new Mutation("missing admission", f -> array(f.raw, "admissionAssociations").remove(0)),
        new Mutation(
            "duplicate admission",
            f ->
                array(f.raw, "admissionAssociations")
                    .add(f.raw.path("admissionAssociations").get(0).deepCopy())),
        new Mutation("missing preparation", f -> array(f.raw, "preparations").remove(0)),
        new Mutation(
            "duplicate preparation",
            f -> array(f.raw, "preparations").add(f.raw.path("preparations").get(0).deepCopy())),
        new Mutation("missing original observation", f -> array(f.raw, "observations").removeAll()),
        new Mutation("missing obligation", f -> array(f.raw, "obligationAssociations").remove(0)),
        new Mutation(
            "unexecuted assertion", f -> at(f.raw, "actions", 4).put("assertionPassed", false)),
        new Mutation("missing producer", f -> array(f.raw, "producers").removeAll()),
        new Mutation("missing consumer", f -> array(f.raw, "consumerEdges").remove(0)),
        new Mutation(
            "extra consumer",
            f -> array(f.raw, "consumerEdges").add(f.raw.path("consumerEdges").get(0).deepCopy())),
        new Mutation(
            "forged allocation",
            f -> at(f.raw, "allocations", 0).put("bindingId", "not-the-original")),
        new Mutation(
            "producer coordinate differs from read receipt",
            f -> object(at(f.raw, "producers", 0), "coordinate").put("ordinal", 7)),
        new Mutation(
            "producer availability names another binding",
            f ->
                object(at(f.raw, "producers", 0), "availability")
                    .put("bindingId", "another-binding")),
        new Mutation(
            "producer availability names another context",
            f ->
                object(at(f.raw, "producers", 0), "availability")
                    .put("contextId", "another-context")),
        new Mutation(
            "producer availability names another worker",
            f ->
                object(at(f.raw, "producers", 0), "availability")
                    .put("workerId", "different-worker")),
        new Mutation(
            "producer availability names another owner",
            f -> object(at(f.raw, "producers", 0), "availability").put("ownerFence", 2)),
        new Mutation(
            "consumer coordinate differs from effect receipt",
            f -> object(at(f.raw, "consumerEdges", 0), "coordinate").put("ordinal", 7)),
        new Mutation(
            "wrong original authorization",
            f ->
                object(at(f.raw, "actions", 1), "admission").put("authorizationId", "another-run")),
        new Mutation(
            "wrong original worker fence", f -> at(f.raw, "actions", 1).put("ownerFence", 2)),
        new Mutation(
            "wrong private input identity",
            f -> at(f.raw, "actions", 1).put("authoredInputsHash", "f".repeat(64))),
        new Mutation("blank target absent", f -> f.rewriteProposal(0, p -> p.putNull("target"))),
        new Mutation(
            "changed intent conflicts with original locator after plan hashes resealed",
            f -> {
              at(object(f.raw, "translationPlan"), "obligations", 3)
                  .put("targetIntent", "different-label");
              object(at(f.raw, "obligationAssociations", 3), "meaning")
                  .put("targetIntent", "different-label");
              f.raw.put("translationHash", hash(f.raw.path("translationPlan")));
            }),
        new Mutation(
            "coherent wrong locator",
            f ->
                f.rewriteProposal(
                    1,
                    p -> object(object(p, "target"), "locator").put("value", "another-reference"))),
        new Mutation(
            "original read target structural only",
            f ->
                f.rewriteObservation(
                    o -> at(o, "nodes", 0).put("classification", "structuralOnly"))),
        new Mutation(
            "wrong original read policy",
            f -> {
              f.rewriteProposal(
                  1,
                  p -> object(object(p, "operation"), "recipe").put("policyRuleId", "forged-rule"));
              object(at(f.raw, "producers", 0), "recipe").put("policyRuleId", "forged-rule");
            }),
        new Mutation(
            "proof altered while hashes resealed",
            f -> {
              object(at(f.raw, "preparations", 1), "proof").put("ownerFence", 2);
              f.rewriteProposal(
                  1,
                  p -> {
                    /* Recompute the unchanged proposal proof. */
                  });
            }),
        new Mutation(
            "wrong original policy decision",
            f ->
                object(at(f.raw, "actions", 1), "admission")
                    .put("policyDecisionHash", "f".repeat(64))),
        new Mutation(
            "missing source input",
            f -> array(object(f.raw, "materialization"), "inputs").remove(0)),
        new Mutation(
            "resolved input value leaked",
            f -> at(object(f.raw, "materialization"), "inputs", 0).put("value", "private-value")),
        new Mutation(
            "wrong bootstrap receipt owner",
            f -> object(object(f.raw, "bootstrap"), "receipt").put("workerId", "different-worker")),
        new Mutation(
            "bootstrap receipt names another context",
            f ->
                object(object(f.raw, "bootstrap"), "receipt")
                    .put("contextId", "different-context")),
        new Mutation(
            "bootstrap receipt names another source scope",
            f -> object(object(f.raw, "bootstrap"), "receipt").put("scopeHash", "f".repeat(64))),
        new Mutation(
            "missing bootstrap receipt", f -> object(f.raw, "bootstrap").remove("receipt")),
        new Mutation(
            "bad metadata acknowledgement",
            f ->
                object(object(object(f.raw, "bootstrap"), "marker"), "metadataAcknowledgement")
                    .put("contextHash", "f".repeat(64))));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("brokenJoins")
  void refusesAlteredOriginalEvidence(Mutation mutation) throws Exception {
    var f = new Original(fixture("fresh-order-reference").path("basis"));
    assertThat(f.build())
        .as("unaltered original facts must pass before mutation")
        .isEqualTo(f.expected);
    mutation.change().accept(f);
    assertThatThrownBy(f::build).isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void reconstructsIndependentObservedChoiceWithOriginalAndFreshNodes() throws Exception {
    var original = choiceFixture();
    var f = new Original(original.path("basis"));
    assertThat(f.build()).isEqualTo(f.expected);
    var witness = f.witness();
    assertThat(witness.path("receipt").path("answer").path("nodeId").asText())
        .isEqualTo("backup-label-old");
    assertThat(
            f.raw
                .path("preparations")
                .get(3)
                .path("proposal")
                .path("target")
                .path("nodeId")
                .asText())
        .isEqualTo("backup-label-fresh");
    assertThat(
            f.raw.path("translationPlan").path("obligations").get(3).path("targetIntent").asText())
        .isEqualTo("label-input");
    assertThat(f.build().path("observations").size()).isEqualTo(4);
  }

  static Mutation changedChoice(String name, Consumer<ObjectNode> change) {
    return new Mutation(
        name,
        f -> {
          change.accept(f.witness());
          f.resealChoice();
        });
  }

  static Mutation choiceText(String name, String pointer, String value) {
    return changedChoice(
        name,
        w -> {
          int slash = pointer.lastIndexOf('/');
          ((ObjectNode) w.at(pointer.substring(0, slash))).put(pointer.substring(slash + 1), value);
        });
  }

  static Stream<Mutation> brokenChoiceJoins() {
    return Stream.of(
        new Mutation(
            "missing prospective choice witness",
            f -> at(f.raw, "preparations", 3).remove("observedChoice")),
        changedChoice(
            "missing original question capture",
            w -> object(w, "context").remove("questionCapture")),
        changedChoice("explicit null choice receipt", w -> w.putNull("receipt")),
        choiceText("original attempt ID", "/attempt/attemptId", "different-attempt"),
        choiceText("original request ID", "/attempt/requestId", "different-request"),
        choiceText("original response request", "/attempt/responseRequestId", "different-request"),
        choiceText("original model status", "/attempt/status", "REJECTED"),
        choiceText("original model kind", "/attempt/kind", "SOURCE_PLAN"),
        choiceText("original response status", "/attempt/responseStatus", "NEXT"),
        choiceText("original capture plan revision", "/context/questionCapture/planRevision", "2"),
        choiceText(
            "original capture context", "/context/questionCapture/contextId", "different-context"),
        changedChoice(
            "original capture context revision",
            w -> object(object(w, "context"), "questionCapture").put("contextRevision", 2)),
        choiceText(
            "original capture input hash",
            "/context/questionCapture/authoredInputsHash",
            "f".repeat(64)),
        choiceText(
            "original capture obligation",
            "/context/questionCapture/obligationId",
            "00000000-0000-4000-8000-000000000100"),
        choiceText(
            "original capture worker", "/context/questionCapture/workerId", "another-worker"),
        changedChoice(
            "original capture fence",
            w -> object(object(w, "context"), "questionCapture").put("ownerFence", 2)),
        choiceText("original attempt owner", "/attempt/owner/workerId", "another-worker"),
        changedChoice(
            "original attempt fence", w -> object(object(w, "attempt"), "owner").put("fence", 2)),
        choiceText("original scope identity", "/context/scopeHash", "f".repeat(64)),
        choiceText("original model scope", "/attempt/scope/accountRef", "another-account"),
        choiceText("original source revision", "/context/sourceRevision", "2"),
        choiceText("original configuration revision", "/context/configurationRevision", "2"),
        choiceText("answer source revision", "/receipt/answer/sourceRevision", "2"),
        choiceText("answer configuration revision", "/receipt/answer/configurationRevision", "2"),
        choiceText("answer scope", "/receipt/answer/scopeHash", "f".repeat(64)),
        choiceText("answer question", "/receipt/answer/clarificationId", "another-question"),
        choiceText("answer old document", "/receipt/answer/documentId", "different-document"),
        choiceText(
            "answer old node replaced by fresh node",
            "/receipt/answer/nodeId",
            "backup-label-fresh"),
        choiceText("answer binding override", "/receipt/answer/bindingId", "binding-reference"),
        choiceText("receipt preparation identity", "/receipt/preparationId", "preparation-2"),
        choiceText(
            "receipt obligation identity",
            "/receipt/obligationId",
            "00000000-0000-4000-8000-000000000102"),
        choiceText("receipt session identity", "/receipt/sessionId", "different-session"),
        choiceText(
            "original model reason", "/attempt/modelQuestion/reason", "INSUFFICIENT_EVIDENCE"),
        choiceText(
            "answer after expiry by one nanosecond",
            "/receipt/answer/resolvedAt",
            "2026-10-08T03:10:00.000000001Z"),
        changedChoice(
            "selected ID absent from original choices",
            w -> {
              w.put("acceptedChoiceId", "absent");
              object(w, "receipt").put("acceptedChoiceId", "absent");
              object(object(w, "receipt"), "answer").put("choiceId", "absent");
            }),
        changedChoice(
            "provider meanings order changed",
            w -> {
              var choices = array(object(object(w, "attempt"), "modelQuestion"), "choices");
              JsonNode first = choices.get(0).deepCopy();
              choices.set(0, choices.get(1).deepCopy());
              choices.set(1, first);
            }),
        changedChoice(
            "coherently resealed singleton original question",
            w -> {
              array(object(object(w, "attempt"), "modelQuestion"), "choices").remove(0);
              array(object(object(w, "context"), "question"), "choices").remove(0);
              array(w, "meanings").remove(0);
            }),
        changedChoice(
            "duplicate original meanings",
            w -> {
              var meaning = at(w, "meanings", 1).path("meaning").deepCopy();
              at(w, "meanings", 0).set("meaning", meaning);
              at(object(object(w, "attempt"), "modelQuestion"), "choices", 0)
                  .set("meaning", meaning.deepCopy());
              at(object(object(w, "context"), "question"), "choices", 0)
                  .put("nodeId", "backup-label-old");
            }),
        new Mutation(
            "exact locator kind differs with same text",
            f -> {
              object(object(at(f.witness(), "meanings", 1), "meaning"), "locator")
                  .put("kind", "label");
              object(
                      object(
                          at(object(object(f.witness(), "attempt"), "modelQuestion"), "choices", 1),
                          "meaning"),
                      "locator")
                  .put("kind", "label");
              f.rewriteQuestionObservation(
                  o -> at(at(o, "nodes", 2), "locatorHints", 0).put("kind", "label"));
            }),
        new Mutation(
            "missing original question observation", f -> array(f.raw, "observations").remove(3)),
        new Mutation(
            "old selected node hidden with resealed original capture",
            f -> f.rewriteQuestionObservation(o -> at(o, "nodes", 2).put("visible", false))),
        new Mutation(
            "old selected locator missing with resealed original capture",
            f ->
                f.rewriteQuestionObservation(
                    o -> array(at(o, "nodes", 2), "locatorHints").removeAll())),
        new Mutation(
            "old duplicate locator on hidden unrelated node",
            f ->
                f.rewriteQuestionObservation(
                    o -> {
                      var node =
                          copy(at(o, "nodes", 2))
                              .put("nodeId", "old-hidden-duplicate")
                              .put("visible", false);
                      array(o, "nodes").add(node);
                    })),
        new Mutation(
            "fresh duplicate locator on hidden unrelated node",
            f ->
                f.rewriteObservation(
                    1,
                    o -> {
                      var node =
                          copy(at(o, "nodes", 2))
                              .put("nodeId", "fresh-hidden-duplicate")
                              .put("visible", false);
                      array(o, "nodes").add(node);
                    })),
        new Mutation(
            "fresh node replaced with original question node",
            f -> f.rewriteProposal(3, p -> object(p, "target").put("nodeId", "backup-label-old"))),
        new Mutation(
            "coherent changed operation",
            f ->
                f.rewriteProposal(
                    3,
                    p -> {
                      object(p, "operation").remove("value");
                      object(p, "operation").put("kind", "click");
                    })),
        new Mutation(
            "coherent alternative authored input",
            f ->
                f.rewriteProposal(
                    3,
                    p ->
                        object(object(p, "operation"), "value")
                            .put("sourceInputId", "input-config"))),
        new Mutation(
            "meaning cannot replace authored argument with binding",
            f ->
                f.rewriteProposal(
                    3,
                    p -> {
                      object(p, "operation")
                          .set(
                              "value",
                              C.object()
                                  .put("kind", "binding")
                                  .put("bindingId", "binding-reference"));
                    })),
        new Mutation(
            "read policy not widened by observed choice",
            f -> {
              f.rewriteProposal(
                  1,
                  p -> object(object(p, "operation"), "recipe").put("policyRuleId", "forged-rule"));
              object(at(f.raw, "producers", 0), "recipe").put("policyRuleId", "forged-rule");
            }),
        new Mutation(
            "original question plan changed meaning despite resealing",
            f -> {
              ObjectNode questionPlan = object(f.witness(), "questionPlan");
              at(object(questionPlan, "plan"), "obligations", 3).put("referenceIndex", 2);
              questionPlan.put("planHash", hash(questionPlan.path("plan")));
              object(object(f.witness(), "context"), "questionCapture")
                  .set("planHash", questionPlan.path("planHash"));
              f.resealChoice();
            }),
        new Mutation(
            "old generation equals fresh preparation with coherent snapshot",
            f -> {
              object(object(f.witness(), "context"), "question").put("generation", 3);
              object(object(f.witness(), "receipt"), "answer").put("generation", 3);
              object(f.witness(), "attempt").put("generation", 3);
              object(object(object(f.witness(), "context"), "questionCapture"), "executionEvidence")
                  .put("generation", 3);
              f.rewriteQuestionObservation(
                  o -> {
                    o.put("generation", 3);
                    o.path("nodes").forEach(node -> ((ObjectNode) node).put("generation", 3));
                  });
            }),
        new Mutation(
            "unapproved original question origin coherently resealed",
            f -> {
              object(object(object(f.witness(), "context"), "questionCapture"), "executionEvidence")
                  .put("origin", "https://unapproved.example.test");
              f.rewriteQuestionObservation(o -> o.put("origin", "https://unapproved.example.test"));
            }),
        new Mutation(
            "fresh observation scope coherently resealed",
            f -> f.rewriteObservation(1, o -> o.put("scopeHash", "f".repeat(64)))),
        new Mutation(
            "duplicate witness copied onto unrelated preparation",
            f -> at(f.raw, "preparations", 2).set("observedChoice", f.witness().deepCopy())),
        new Mutation(
            "receipt budget before malformed field rejection",
            f -> object(object(f.witness(), "receipt"), "answer").put("nodeId", "a".repeat(16384))),
        new Mutation(
            "composed witness budget before malformed field rejection",
            f ->
                object(
                        at(object(object(f.witness(), "attempt"), "modelQuestion"), "choices", 0),
                        "meaning")
                    .put("nodeId", "é".repeat(131073))),
        new Mutation(
            "wrong context canonical hash",
            f -> object(f.witness(), "receipt").put("contextIdentityHash", "f".repeat(64))),
        new Mutation(
            "wrong meanings canonical hash",
            f -> object(f.witness(), "receipt").put("meaningsHash", "f".repeat(64))),
        new Mutation(
            "wrong original capture canonical hash",
            f -> object(f.witness(), "receipt").put("questionCaptureHash", "f".repeat(64))),
        new Mutation(
            "wrong original model question canonical hash",
            f -> {
              object(object(f.witness(), "context"), "questionCapture")
                  .put("modelQuestionHash", "f".repeat(64));
              ObjectNode receipt = object(f.witness(), "receipt");
              receipt
                  .put(
                      "questionCaptureHash",
                      hash(f.witness().path("context").path("questionCapture")))
                  .put("contextIdentityHash", hash(f.witness().path("context")));
            }));
  }

  @ParameterizedTest(name = "observed choice: {0}")
  @MethodSource("brokenChoiceJoins")
  void refusesCoherentlyAlteredOriginalObservedChoice(Mutation mutation) throws Exception {
    var f = new Original(choiceFixture().path("basis"));
    assertThat(f.build())
        .as("unchanged independently authored choice baseline")
        .isEqualTo(f.expected);
    mutation.change().accept(f);
    assertThatThrownBy(f::build).isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void originalNanosecondAnswerBoundaryAndHistoricalLeaseRemainHistorical() throws Exception {
    var f = new Original(choiceFixture().path("basis"));
    assertThat(f.build()).isEqualTo(f.expected);
    object(object(f.witness(), "receipt"), "answer").put("resolvedAt", "2026-10-08T03:10:00Z");
    // Expired lease bytes are historical audit data, not present publication permission.
    object(object(f.witness(), "attempt"), "owner").put("leaseExpiresAt", "2026-10-08T03:00:00Z");
    assertThat(
            f.build()
                .path("preparations")
                .get(3)
                .path("observedChoice")
                .path("receipt")
                .path("answer")
                .path("resolvedAt")
                .asText())
        .isEqualTo("2026-10-08T03:10:00Z");
  }

  @Test
  void unchangedObligationRetainsOriginalQuestionPlanAcrossLaterRefinement() throws Exception {
    var f = new Original(choiceFixture().path("basis"));
    assertThat(f.build()).isEqualTo(f.expected);
    var originalQuestionPlan = f.witness().path("questionPlan").deepCopy();
    at(object(f.raw, "translationPlan"), "obligations", 0).put("targetIntent", "Open");
    object(at(f.raw, "obligationAssociations", 0), "meaning").put("targetIntent", "Open");
    f.raw
        .put("translationRevision", "2")
        .put("translationHash", hash(f.raw.path("translationPlan")));
    var result = f.build();
    assertThat(result.path("translationRevision").asText()).isEqualTo("2");
    assertThat(result.path("preparations").get(3).path("observedChoice").path("questionPlan"))
        .isEqualTo(originalQuestionPlan);
    assertThat(result.path("translationPlan").path("obligations").get(3))
        .isEqualTo(originalQuestionPlan.path("plan").path("obligations").get(3));
  }

  @Test
  void selectedBindingMetadataCannotOverrideTheOriginalAuthoredInput() throws Exception {
    var f = new Original(choiceFixture().path("basis"));
    assertThat(f.build()).isEqualTo(f.expected);
    object(at(f.witness(), "meanings", 1), "meaning").put("bindingId", "binding-reference");
    object(at(object(object(f.witness(), "attempt"), "modelQuestion"), "choices", 1), "meaning")
        .put("bindingId", "binding-reference");
    at(object(object(f.witness(), "context"), "question"), "choices", 1)
        .put("bindingId", "binding-reference");
    object(object(f.witness(), "receipt"), "answer").put("bindingId", "binding-reference");
    f.resealChoice();
    ObjectNode result = f.build();
    assertThat(result.path("preparations").get(3).path("proposal").path("operation").path("value"))
        .isEqualTo(C.object().put("kind", "authoredLiteral").put("sourceInputId", "input-label"));
    assertThat(result.path("translationPlan")).isEqualTo(f.expected.path("translationPlan"));
  }
}
