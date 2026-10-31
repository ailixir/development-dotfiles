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
    ObjectNode corrected =
        copy(
            C.parse(
                Files.readString(
                    Path.of(
                        "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json"))));
    ObjectNode original =
        copy(
            C.parse(
                Files.readString(
                    Path.of("../studio-runner/fixtures/observed-reference/" + name + ".json"))));
    JsonNode current =
        name.equals("fresh-order-reference") ? corrected : corrected.path("controlValueReference");
    // Import independent declared hashes only after proving both complete frozen parents equal.
    // Each vector keeps its own session, worker, materialization and observation identities.
    assertThat(original.path("basis")).isEqualTo(current.path("basis"));
    assertThat(original.path("artifact")).isEqualTo(current.path("artifact"));
    var hashNames = new java.util.HashSet<String>();
    original.path("hashes").fieldNames().forEachRemaining(hashNames::add);
    assertThat(hashNames)
        .containsExactlyInAnyOrder(
            "sourceHash",
            "configurationHash",
            "authoringHash",
            "learnedPlanHash",
            "artifactHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "admissionProvenanceHash",
            "publicationEvidenceHash",
            "runAuthorizationHash",
            "profileHash");
    original.path("hashes").forEach(value -> assertThat(value.asText()).matches("[a-f0-9]{64}"));
    if (name.equals("fresh-order-reference")) {
      assertThat(original.at("/hashes/artifactHash"))
          .isEqualTo(corrected.at("/admissionRequest/artifactHash"));
      corrected.set("hashes", original.path("hashes").deepCopy());
      return corrected;
    }
    return original;
  }

  /** Independent Python proof fixture; this synthetic projection is not browser evidence. */
  static ObjectNode choiceFixture() throws Exception {
    return copy(
        C.parse(
                Files.readString(
                    Path.of(
                        "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")))
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
              .map(e -> string(e.getKey()) + ":" + canonical(e.getValue()))
              .collect(java.util.stream.Collectors.joining(","))
          + "}";
    }
    if (n.isArray()) {
      var values = new ArrayList<String>();
      n.forEach(v -> values.add(canonical(v)));
      return "[" + String.join(",", values) + "]";
    }
    return n.isTextual() ? string(n.textValue()) : n.toString();
  }

  /** The JSON short escape of a code point, or null when it has none. */
  private static String shortEscape(int cp) {
    return switch (cp) {
      case 0x22 -> "\\\"";
      case 0x5C -> "\\\\";
      case 0x08 -> "\\b";
      case 0x09 -> "\\t";
      case 0x0A -> "\\n";
      case 0x0C -> "\\f";
      case 0x0D -> "\\r";
      default -> null;
    };
  }

  /**
   * Canonical-v1 string bytes, written independently of production code (ar-2-r14-stops.json ruling
   * 1): JSON.stringify form, controls without a short escape as LOWERCASE {@code \\u00xx}.
   */
  static String string(String value) {
    StringBuilder out = new StringBuilder("\"");
    value
        .codePoints()
        .forEach(
            cp -> {
              String shortEscape = shortEscape(cp);
              if (shortEscape != null) {
                out.append(shortEscape);
              } else if (cp < 0x20) {
                out.append(String.format(java.util.Locale.ROOT, "\\u%04x", cp));
              } else {
                out.appendCodePoint(cp);
              }
            });
    return out.append('"').toString();
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
      JsonNode materializationIdentity = expected.at("/materializationEvidence/versions/0");
      assertThat(materializationIdentity.path("workerId").isTextual()).isTrue();
      assertThat(materializationIdentity.path("workerId").asText()).isNotBlank();
      String workerId = materializationIdentity.path("workerId").asText();
      int ownerFence = materializationIdentity.path("ownerFence").asInt();
      session.putObject("owner").put("workerId", workerId).put("fence", ownerFence);
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
              "materializationEvidence",
              "incrementalEvidence",
              "snapshotEvidence",
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
      material.put("workerId", workerId);
      var inputs = material.putArray("inputs");
      for (JsonNode inputRow : expected.path("materializationEvidence").path("entries")) {
        inputs.add(inputRow.path("metadata").deepCopy());
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
      var bootIdentity =
          marker.putObject("identity").put("workerId", workerId).put("fence", ownerFence);
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
              .put("workerId", workerId)
              .put("ownerFence", ownerFence);
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
      // ADR-SC-008: the identity is {coordinate, origin, operation}, written here independently
      // of the production helper.
      operation.set("operation", proposal.path("operation"));
      ledger.put("operationHash", hash(operation));
      var decision = C.object();
      decision.set("scopeHash", session.path("scopeHash"));
      decision.set("preparation", prep.path("proof"));
      decision.put("requestDigest", digest);
      object(ledger, "admission").put("policyDecisionHash", hash(decision));
    }

    /** Changes a preparation proof and reseals everything that joins it (hashes, decision). */
    void rewriteProof(int index, Consumer<ObjectNode> mutate) {
      mutate.accept(object(at(raw, "preparations", index), "proof"));
      rewriteProposal(
          index,
          p -> {
            /* Only the dependent hashes are recomputed. */
          });
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
              "materializationEvidence",
              "incrementalEvidence",
              "snapshotEvidence",
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
                .path("operation")
                .path("kind")
                .asText())
        .isEqualTo("step");
    assertThat(result.path("preparations").get(0).path("observationHash").isNull()).isTrue();
  }

  @ParameterizedTest(name = "complete detached input head refuses {0}")
  @org.junit.jupiter.params.provider.ValueSource(
      strings = {"missing-unused-input", "raw-row-order", "same-id-metadata-substitution"})
  void detachedCurrentInputsMatchCompleteHistoryBeforeEffectiveFiltering(String mutation)
      throws Exception {
    JsonNode independent = fixture("fresh-order-reference");
    var f = new Original(independent.path("basis"));
    JsonNode rawBefore = f.raw.deepCopy();
    ObjectNode result = f.build();
    assertThat(result).as("complete independent parent before %s", mutation).isEqualTo(f.expected);
    assertThat(f.raw).isEqualTo(rawBefore);
    ArrayNode rawInputs = array(object(f.raw, "materialization"), "inputs");
    JsonNode completeInputs = rawInputs.deepCopy(),
        historyBefore = f.raw.path("materializationEvidence").deepCopy();
    assertThat(rawInputs).hasSize(3);
    assertThat(historyBefore.path("entries")).hasSize(3);
    assertThat(historyBefore.at("/versions/0/inputCount").asInt()).isEqualTo(3);
    assertThat(rawInputs.get(0).path("inputId").asText()).isEqualTo("input-destination");
    assertThat(rawInputs.get(1).path("inputId").asText()).isEqualTo("input-label");
    assertThat(rawInputs.get(2).path("inputId").asText()).isEqualTo("input-config");
    for (int index = 0; index < 3; index++) {
      assertThat(rawInputs.get(index))
          .isEqualTo(historyBefore.path("entries").get(index).path("metadata"));
    }
    assertThat(result.path("inputs")).hasSize(2);
    assertThat(result.path("inputs").get(0).path("inputId").asText())
        .isEqualTo("input-destination");
    assertThat(result.path("inputs").get(1).path("inputId").asText()).isEqualTo("input-label");
    assertThat(new ObservedArtifactLowerer(C).recipes(result))
        .isEqualTo(independent.path("artifact").path("inputRecipes"));
    assertThat(independent.path("artifact").path("inputRecipes").toString())
        .doesNotContain("input-config");
    switch (mutation) {
      case "missing-unused-input" -> rawInputs.remove(2);
      case "raw-row-order" -> {
        JsonNode first = rawInputs.get(0);
        rawInputs.set(0, rawInputs.get(1));
        rawInputs.set(1, first);
      }
      case "same-id-metadata-substitution" ->
          object(rawInputs.get(2), "provenance").put("referenceId", "different-saved-reference");
      default -> throw new IllegalArgumentException(mutation);
    }
    JsonNode invalidRaw = f.raw.deepCopy();
    assertThat(f.raw.path("materializationEvidence")).isEqualTo(historyBefore);
    assertThatThrownBy(f::build)
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refusal -> {
              assertThat(refusal.getMessage()).isEqualTo("EVIDENCE_MISMATCH");
              assertThat(refusal.status()).isEqualTo(422);
            });
    assertThat(f.raw).as("refusal does not repair either supplied copy").isEqualTo(invalidRaw);
    object(f.raw, "materialization").set("inputs", completeInputs.deepCopy());
    assertThat(f.raw).as("restore the exact original rows and their order").isEqualTo(rawBefore);
    assertThat(f.build())
        .as("exact restoration recovers the complete parent")
        .isEqualTo(f.expected);
  }

  @Test
  void appendedHistoricalHeadPreservesOriginalVersionsAndIndependentWholeBasis() throws Exception {
    JsonNode corpus =
        C.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")));
    JsonNode vector = null;
    for (JsonNode row : corpus.path("incrementalContracts").path("basisCases")) {
      if (row.path("name").asText().equals("appendedHistorical")) {
        vector = row;
      }
    }
    assertThat(vector).isNotNull();
    JsonNode frozen = vector.path("basis"), frozenBefore = frozen.deepCopy();
    JsonNode privateInputs = vector.at("/authority/privateInputs"),
        privateBefore = privateInputs.deepCopy();
    JsonNode versions = frozen.at("/materializationEvidence/versions");
    assertThat(versions).hasSize(2);
    assertThat(versions.get(0).path("inputCount").asInt()).isEqualTo(1);
    assertThat(versions.get(1).path("inputCount").asInt()).isEqualTo(3);
    assertThat(versions.get(1).path("birthMaterializationRevision").asInt()).isEqualTo(3);
    C.validate("v3/authored-inputs", privateInputs);
    assertThat(privateInputs.path("inputs")).hasSize(3);
    assertThat(hash(privateInputs)).isEqualTo(versions.get(1).path("authoredInputsHash").asText());
    ObjectNode originalPrivateVersion = copy(privateInputs);
    originalPrivateVersion.putArray("inputs").add(privateInputs.path("inputs").get(0).deepCopy());
    assertThat(hash(originalPrivateVersion))
        .isEqualTo(versions.get(0).path("authoredInputsHash").asText());
    assertThat(hash(originalPrivateVersion)).isNotEqualTo(hash(privateInputs));
    ArrayNode completeMetadata = C.object().putArray("inputs");
    for (int index = 0; index < 3; index++) {
      JsonNode privateInput = privateInputs.path("inputs").get(index);
      ObjectNode metadata = copy(privateInput);
      metadata.remove("value");
      JsonNode entry = frozen.at("/materializationEvidence/entries").get(index);
      assertThat(hash(privateInput)).isEqualTo(entry.path("inputHash").asText());
      assertThat(metadata).isEqualTo(entry.path("metadata"));
      assertThat(hash(metadata))
          .as("public metadata never replaces private document commitment")
          .isNotEqualTo(entry.path("inputHash").asText());
      completeMetadata.add(metadata);
    }

    // Declared synthetic current head: metadata bumped after immutable context2 birth3.
    // Only this subject adapts the ordinary reconstruction helper; bootstrap/ACK/actions stay old.
    var f = new Original(frozen);
    JsonNode bootstrapBefore = f.raw.path("bootstrap").deepCopy(),
        actionsBefore = f.raw.path("actions").deepCopy();
    JsonNode preparationsBefore = f.raw.path("preparations").deepCopy();
    ObjectNode materialization = object(f.raw, "materialization");
    materialization.put("contextRevision", 2).put("materializationRevision", 4);
    for (String field : List.of("contextId", "workerId", "ownerFence", "authoredInputsHash")) {
      materialization.set(field, versions.get(1).path(field));
    }
    materialization.set("inputs", completeMetadata);
    assertThat(materialization.path("contextRevision").asInt()).isEqualTo(2);
    assertThat(materialization.path("materializationRevision").asInt())
        .isGreaterThan(versions.get(1).path("birthMaterializationRevision").asInt());
    assertThat(f.raw.at("/bootstrap/marker/context/contextRevision").asInt()).isEqualTo(1);
    assertThat(f.raw.at("/bootstrap/marker/context/materializationRevision").asInt()).isEqualTo(1);
    assertThat(f.raw.at("/bootstrap/marker/context/authoredInputsHash"))
        .isEqualTo(versions.get(0).path("authoredInputsHash"));
    for (int index = 0; index < preparationsBefore.size(); index++) {
      JsonNode preparation = preparationsBefore.get(index);
      int revision = index < 2 ? 1 : 2;
      assertThat(preparation.path("materializationRevision").asInt()).isEqualTo(index < 2 ? 2 : 4);
      assertThat(preparation.at("/proof/contextRevision").asInt()).isEqualTo(revision);
      assertThat(preparation.at("/proof/authoredInputsHash"))
          .isEqualTo(versions.get(revision - 1).path("authoredInputsHash"));
      assertThat(actionsBefore.get(index).path("contextRevision").asInt()).isEqualTo(revision);
      assertThat(actionsBefore.get(index).path("authoredInputsHash"))
          .isEqualTo(versions.get(revision - 1).path("authoredInputsHash"));
    }
    assertThat(actionsBefore).isEqualTo(vector.at("/authority/ledgers"));
    assertThat(preparationsBefore).isEqualTo(frozen.path("preparations"));

    ObjectNode expected = copy(frozen), manifest = C.object();
    ArrayNode sourceRows = manifest.putArray("sourceSteps"),
        references = manifest.putArray("configurationReferences");
    for (JsonNode source : frozen.path("sourceSteps")) {
      sourceRows
          .addObject()
          .put("stepId", source.path("stepId").asText())
          .put("text", source.path("source").asText());
    }
    for (JsonNode ref : frozen.path("configurationReferences")) {
      ObjectNode copy = copy(ref);
      copy.remove("inputId");
      references.add(copy);
    }
    expected.put("sourceManifestHash", hash(manifest));
    assertThat(f.raw.path("sourceManifest")).isEqualTo(manifest);
    assertThat(f.expected)
        .as("only independently calculated synthetic manifest adjustment")
        .isEqualTo(expected);
    JsonNode rawBefore = f.raw.deepCopy();
    ObjectNode actual = f.build();
    assertThat(actual).isEqualTo(expected);
    assertThat(actual.path("materializationEvidence"))
        .isEqualTo(frozen.path("materializationEvidence"));
    assertThat(actual.path("bootstrap")).isEqualTo(frozen.path("bootstrap"));
    assertThat(actual.path("actions")).isEqualTo(frozen.path("actions"));
    assertThat(actual.path("preparations")).isEqualTo(frozen.path("preparations"));
    assertThat(actual.path("inputs")).hasSize(2);
    assertThat(materialization.path("inputs")).hasSize(3);
    assertThat(new ObservedArtifactLowerer(C).recipes(actual))
        .isEqualTo(vector.path("expectedArtifact").path("inputRecipes"));
    assertThat(f.raw.path("bootstrap")).isEqualTo(bootstrapBefore);
    assertThat(f.raw.path("actions")).isEqualTo(actionsBefore);
    assertThat(f.raw.path("preparations")).isEqualTo(preparationsBefore);
    assertThat(f.raw).isEqualTo(rawBefore);
    assertThat(frozen).isEqualTo(frozenBefore);
    assertThat(privateInputs).isEqualTo(privateBefore);
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
            .put("outputContractHash", "b".repeat(64))
            .put("playwrightReferenceHash", "f".repeat(64))
            .put("stepCodeContractHash", "9".repeat(64));
    pins.putObject("providerSchemaHashes")
        .put("SOURCE_PLAN", "c".repeat(64))
        .put("STEP_CODE", "d".repeat(64));
    var result = new GuidedPlanBuilder(C).learningProvenance(manifest);
    assertThat(result.path("playwrightReferenceHash").asText()).isEqualTo("f".repeat(64));
    assertThat(result.path("stepCodeContractHash").asText()).isEqualTo("9".repeat(64));
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
            .put("outputContractHash", "b".repeat(64))
            .put("playwrightReferenceHash", "f".repeat(64))
            .put("stepCodeContractHash", "9".repeat(64));
    pins.putObject("providerSchemaHashes")
        .put("SOURCE_PLAN", "c".repeat(64))
        .put("STEP_CODE", "d".repeat(64));
    var oldKinds = manifest.deepCopy();
    object(object(oldKinds, "schemaPins"), "providerSchemaHashes").remove("STEP_CODE");
    object(object(oldKinds, "schemaPins"), "providerSchemaHashes")
        .put("NEXT_ACTION", "d".repeat(64));
    assertThatThrownBy(() -> new GuidedPlanBuilder(C).learningProvenance(oldKinds))
        .as("only SOURCE_PLAN and STEP_CODE have provider schemas")
        .isInstanceOf(GuidedSessionException.class);
    for (String field :
        List.of(
            "strictSchemaHash",
            "outputContractHash",
            "providerSchemaHashes",
            "playwrightReferenceHash",
            "stepCodeContractHash")) {
      var invalid = manifest.deepCopy();
      object(invalid, "schemaPins").remove(field);
      assertThatThrownBy(() -> new GuidedPlanBuilder(C).learningProvenance(invalid))
          .isInstanceOf(GuidedSessionException.class);
    }
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
                    .put("contextHash", "f".repeat(64))),
        // ADR-SC-008 D2: the frozen step record is opaque, but its identity, size and uses are
        // checked. Each case reseals every hash that joins the proposal, so only the step rule
        // can refuse it.
        new Mutation(
            "step code changed while sourceHash is kept",
            f ->
                f.rewriteProposal(
                    1, p -> object(p, "operation").put("code", "await page.goto('https://x');"))),
        new Mutation(
            "step code over 16 KiB",
            f -> f.rewriteProposal(1, p -> stepCode(p, "x".repeat(16385)))),
        new Mutation(
            "step code holds U+0000", f -> f.rewriteProposal(1, p -> stepCode(p, "a\u0000b"))),
        new Mutation(
            "step kind is not step",
            f -> f.rewriteProposal(1, p -> object(p, "operation").put("kind", "click"))),
        new Mutation(
            "step uses an unknown binding",
            f ->
                f.rewriteProposal(
                    1,
                    p ->
                        array(object(p, "operation"), "uses")
                            .addObject()
                            .put("kind", "binding")
                            .put("id", "ghost-binding"))),
        new Mutation(
            "step uses an unknown input",
            f ->
                f.rewriteProposal(
                    1,
                    p ->
                        array(object(p, "operation"), "uses")
                            .addObject()
                            .put("kind", "input")
                            .put("id", "ghost-input"))),
        new Mutation(
            "step uses an undeclared secret",
            f ->
                f.rewriteProposal(
                    1,
                    p ->
                        array(object(p, "operation"), "uses")
                            .addObject()
                            .put("kind", "secret")
                            .put("id", "GHOST"))),
        new Mutation(
            "step captures a binding nobody produces",
            f ->
                f.rewriteProposal(
                    1, p -> array(object(p, "operation"), "captures").add("ghost-binding"))));
  }

  /** Replaces the code and keeps sourceHash equal to the hash of the new code. */
  static void stepCode(ObjectNode proposal, String code) {
    ObjectNode operation = object(proposal, "operation");
    operation.put("code", code);
    operation.put("sourceHash", hash(operation.path("code")));
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
}
