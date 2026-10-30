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
      // ADR-SC-007: the identity covers the target the runner reported on the preparation proof
      // (null for a page or password control), written here independently of the production helper.
      operation.set("target", prep.path("proof").path("target"));
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
                .path("target")
                .path("kind")
                .asText())
        .isEqualTo("page");
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

  /**
   * ADR-SC-007: current control values are never rendered, and a read is completed by the backend
   * from the page's read grant as visible text. A control-value recipe is therefore not one this
   * backend ever admits, and a basis that carries one is refused when its gates are replayed.
   */
  @Test
  void aControlValueReadIsNotARecipeTheBackendEverAdmits() throws Exception {
    var f = new Original(fixture("control-value-reference").path("basis"));
    assertThatThrownBy(f::build)
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            // The fixture's element is a textbox whose facts carry no text to read: the read gate
            // refuses first. (The recipe check that follows would refuse the recipe itself.)
            refusal -> assertThat(refusal.getMessage()).isEqualTo("INVALID_CONTRACT"));
  }

  /**
   * ADR-SC-007 D-7: the model writes no read recipe. The backend completes it from the read grant
   * the runner reported for the page, so the recipe of a learned read is the observation's {@code
   * readRuleId}, the producer carries the same rule, and an invented rule id does not publish.
   */
  @Test
  void learnedReadPublishesWithTheBackendCompletedRecipe() throws Exception {
    var f = new Original(fixture("fresh-order-reference").path("basis"));
    JsonNode read = f.raw.path("preparations").get(1).path("proposal");
    String rule = f.raw.path("observations").get(0).path("observation").path("readRuleId").asText();
    assertThat(rule).isEqualTo("business-reference");
    assertThat(read.path("operation").path("kind").asText()).isEqualTo("read");
    assertThat(read.path("operation").path("recipe"))
        .isEqualTo(
            C.object()
                .put("kind", "visibleText")
                .put("classification", "permittedBusinessData")
                .put("policyRuleId", rule));
    ObjectNode built = f.build();
    assertThat(built).isEqualTo(f.expected);
    assertThat(f.raw.at("/producers/0/recipe/policyRuleId").asText()).isEqualTo(rule);
    assertThat(built.at("/producers/0/recipe/policyRuleId").asText()).isEqualTo(rule);

    var invented = new Original(fixture("fresh-order-reference").path("basis"));
    invented.rewriteProposal(
        1, p -> object(object(p, "operation"), "recipe").put("policyRuleId", "default"));
    object(at(invented.raw, "producers", 0), "recipe").put("policyRuleId", "default");
    assertThatThrownBy(invented::build).isInstanceOf(GuidedSessionException.class);
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
            "coherent wrong reported identity",
            f ->
                f.rewriteProof(
                    1,
                    proof ->
                        object(object(proof, "target"), "identity")
                            .put("name", "Another reference"))),
        new Mutation(
            "original read target has no visible text",
            f -> f.rewriteObservation(o -> object(object(o, "facts"), "e1").remove("text"))),
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
  void reconstructsIndependentObservedChoiceWithOriginalAndFreshRefs() throws Exception {
    var original = choiceFixture();
    var f = new Original(original.path("basis"));
    assertThat(f.build()).isEqualTo(f.expected);
    var witness = f.witness();
    // ADR-SC-007: an answer keeps a choice, never an element id; the accepted choice names the
    // fresh ref of the element with the stored role, name and evidence.
    assertThat(witness.path("receipt").path("answer").has("nodeId")).isFalse();
    assertThat(witness.path("acceptedChoiceId").asText()).isEqualTo("choice-backup");
    JsonNode accepted = witness.path("meanings").get(1);
    assertThat(accepted.path("choiceId").asText()).isEqualTo("choice-backup");
    assertThat(accepted.path("meaning").path("ref").asText()).isEqualTo("e3");
    assertThat(accepted.path("selection").path("role").asText()).isEqualTo("textbox");
    assertThat(
            f.raw.path("preparations").get(3).path("proposal").path("target").path("ref").asText())
        .isEqualTo("e3");
    assertThat(
            f.raw.path("translationPlan").path("obligations").get(3).path("targetIntent").asText())
        .isEqualTo("label");
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
            "answer names another choice than the accepted one",
            "/receipt/answer/choiceId",
            "choice-original"),
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
            }),
        changedChoice(
            "stored selection evidence differs from the question-time element",
            w -> object(at(w, "meanings", 1), "selection").put("evidence", "Another label")),
        new Mutation(
            "missing original question observation", f -> array(f.raw, "observations").remove(3)),
        new Mutation(
            "old selected element missing with resealed original capture",
            f -> f.rewriteQuestionObservation(o -> object(o, "facts").remove("e3"))),
        new Mutation(
            "old selected element renamed with resealed original capture",
            f ->
                f.rewriteQuestionObservation(
                    o ->
                        object(object(o, "facts"), "e3")
                            .put("name", "Renamed")
                            .put("evidence", "Renamed"))),
        new Mutation(
            "old question observation holds an identical second element",
            f ->
                f.rewriteQuestionObservation(
                    o ->
                        object(o, "facts").set("e4", object(object(o, "facts"), "e3").deepCopy()))),
        new Mutation(
            "fresh observation holds an identical second element",
            f ->
                f.rewriteObservation(
                    1,
                    o ->
                        object(o, "facts").set("e4", object(object(o, "facts"), "e3").deepCopy()))),
        new Mutation(
            "fresh ref replaced with another element of the same page",
            f -> f.rewriteProposal(3, p -> object(p, "target").put("ref", "e2"))),
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
              f.rewriteQuestionObservation(o -> o.put("generation", 3));
            }),
        new Mutation(
            "fresh observation scope coherently resealed",
            f -> f.rewriteObservation(1, o -> o.put("scopeHash", "f".repeat(64)))),
        new Mutation(
            "duplicate witness copied onto unrelated preparation",
            f -> at(f.raw, "preparations", 2).set("observedChoice", f.witness().deepCopy())),
        new Mutation(
            "receipt budget before malformed field rejection",
            f ->
                object(object(f.witness(), "receipt"), "answer").put("padding", "a".repeat(16384))),
        new Mutation(
            "composed witness budget before malformed field rejection",
            f ->
                object(
                        at(object(object(f.witness(), "attempt"), "modelQuestion"), "choices", 0),
                        "meaning")
                    .put("padding", "é".repeat(131073))),
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

  /**
   * Controlled validator verdict only; this proves relational persistence, never native execution.
   */
  private static void commitSqlCandidate(
      GuidedPublicationMigrationTest.Database db,
      PublicationContracts.Base base,
      PublicationContracts.Candidate candidate) {
    String id = db.fixtureSession();
    var raw = db.snapshot(base);
    var identity = copy(raw.identity());
    var profile = GuidedPublicationMigrationTest.currentProfile();
    var build = GuidedPublicationMigrationTest.observedBuild(profile);
    for (String field :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "profileHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      identity.set(field, candidate.hashes().path(field));
    }
    identity.put("validationBuildHash", GuidedContracts.hash(build));
    var snapshot = new PublicationContracts.Snapshot(identity, raw.basis());
    var attempt =
        db.tx.execute(
            status -> {
              db.sessions.lock(id);
              return db.publications.reserve(
                  new PublicationContracts.Claim(id, "final", "d".repeat(64), snapshot),
                  java.time.Instant.now());
            });
    db.tx.executeWithoutResult(
        status -> {
          db.sessions.lock(id);
          db.publications.claim(
              id, attempt.attemptId(), attempt.claimId(), snapshot.hash(), java.time.Instant.now());
        });
    var verdict =
        C.object()
            .put("schemaVersion", 3)
            .put("ok", true)
            .putNull("errorCode")
            .put("attemptId", attempt.attemptId().toString())
            .put("claimId", attempt.claimId().toString())
            .put("snapshotHash", snapshot.hash())
            .put("basisHash", identity.path("basisHash").asText());
    for (String field :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash",
            "admissionProvenanceHash")) {
      verdict.set(field, candidate.hashes().path(field));
    }
    verdict.set("profile", profile);
    verdict.set("build", build);
    db.tx.executeWithoutResult(
        status -> {
          db.sessions.lock(id);
          db.publications.finish(
              id,
              attempt.attemptId(),
              attempt.claimId(),
              snapshot.hash(),
              PublicationContracts.AttemptStatus.VALIDATED,
              verdict,
              null,
              java.time.Instant.now());
        });
    var command =
        new PublicationContracts.Commit(
            id,
            java.util.UUID.randomUUID(),
            attempt.attemptId(),
            attempt.claimId(),
            "final",
            "d".repeat(64),
            snapshot,
            candidate,
            new PublicationContracts.Grant(
                id,
                base.document().path("originalPrincipalId").asText(),
                base.document().path("csiId").asText(),
                snapshot.hash(),
                attempt.validationDeadline()));
    var receipt =
        db.tx.execute(
            status -> {
              db.sessions.lock(id);
              var actual = db.publications.commit(command, java.time.Instant.now());
              db.jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
              return actual;
            });
    assertThat(
            db.jdbc.queryForObject(
                "SELECT count(*) FROM ui_test_revisions WHERE id=?",
                Integer.class,
                command.revisionId()))
        .isEqualTo(1);
    assertThat(receipt.document().path("revisionId").asText())
        .isEqualTo(command.revisionId().toString());
    assertThatThrownBy(
            () ->
                db.jdbc.update(
                    "DELETE FROM studio_guided_publication_preparations WHERE session_id=?", id))
        .hasMessageContaining("immutable");
  }

  private static ObjectNode sameReadSourceBasis() throws Exception {
    ObjectNode basis = copy(fixture("fresh-order-reference").path("basis"));
    var preparations = basis.withArray("preparations");
    var read = (ObjectNode) preparations.get(1);
    var consumer = (ObjectNode) preparations.get(preparations.size() - 1);
    consumer.withObject("/proposal/operation").put("predicate", "containsText");
    consumer
        .withObject("/proposal/target")
        .put("ref", read.path("proposal").path("target").path("ref").asText());
    consumer.withObject("/proof").set("target", read.path("proof").path("target").deepCopy());
    consumer.withObject("/proof/target").put("assertTextMode", "READ_BINDING_SOURCE");
    consumer
        .withObject("/proof")
        .putObject("assertSourceBinding")
        .put("bindingId", "binding-reference")
        .put(
            "producerAdmissionId",
            basis.path("producers").get(0).path("producerAdmissionId").asText())
        .put("producerPreparationId", read.path("preparationId").asText());
    var obligation =
        (ObjectNode) basis.withObject("/translationPlan").withArray("obligations").get(4);
    obligation.put("predicate", "containsText").put("targetIntent", "reference");
    String hash = consumer.path("observationHash").asText();
    for (JsonNode row : basis.path("observations")) {
      if (row.path("observationHash").asText().equals(hash)) {
        ((ObjectNode) row.path("observation").path("facts").path("e1")).remove("text");
      }
    }
    return basis;
  }

  @Test
  void realMigratedSourceBindingRowsAndFrozenGuardsRejectIndependentCoherentMutations()
      throws Exception {
    try (var seed = new GuidedPublicationMigrationTest.Database()) {
      var db =
          new GuidedPublicationMigrationTest.Database(
              seed.jdbc, seed.tx, "wi6-source", sameReadSourceBasis());
      var base = db.capture();
      db.finalizing();
      JsonNode basis = db.snapshot(base).basis();
      new GuidedBasisValidator(C).validate(basis);
      var candidate =
          new ObservedArtifactLowerer(C)
              .lower(basis, GuidedPublicationMigrationTest.currentProfile());
      assertThat(
              candidate
                  .artifact()
                  .path("guards")
                  .get(4)
                  .path("target")
                  .path("assertTextMode")
                  .asText())
          .isEqualTo("READ_BINDING_SOURCE");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_wi6_frozen_assertion_metadata(?::jsonb)",
                  Boolean.class,
                  candidate.artifact().toString()))
          .isTrue();
      var strippedArtifact = copy(candidate.artifact());
      ((ObjectNode) strippedArtifact.path("learnedPlan").path("actions").get(4).path("target"))
          .remove("assertTextMode");
      ((ObjectNode) strippedArtifact.path("guards").get(4).path("target")).remove("assertTextMode");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_wi6_frozen_assertion_metadata(?::jsonb)",
                  Boolean.class,
                  strippedArtifact.toString()))
          .isFalse();
      var prefix = copy(candidate.learnedPlan().path("actions").get(4));
      prefix.set("guard", candidate.artifact().path("guards").get(4));
      var request = C.object();
      request.set(
          "assertSourceBinding",
          basis.path("preparations").get(4).path("proof").path("assertSourceBinding"));
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_wi6_prefix_source_identity(?::jsonb,?::jsonb)",
                  Boolean.class,
                  prefix.toString(),
                  request.toString()))
          .isTrue();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_wi6_prefix_source_identity(?::jsonb,'{}'::jsonb)",
                  Boolean.class,
                  prefix.toString()))
          .isFalse();
      var inventedPrefix = copy(prefix);
      inventedPrefix.putObject("operation").put("kind", "click");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_wi6_prefix_source_identity(?::jsonb,?::jsonb)",
                  Boolean.class,
                  inventedPrefix.toString(),
                  request.toString()))
          .isFalse();
      var strippedPrefix = copy(prefix);
      strippedPrefix.withObject("/target").remove("assertTextMode");
      strippedPrefix.withObject("/guard/target").remove("assertTextMode");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_wi6_prefix_source_identity(?::jsonb,?::jsonb)",
                  Boolean.class,
                  strippedPrefix.toString(),
                  request.toString()))
          .isFalse();

      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_publication_preparations WHERE session_id=?"
                      + " AND jsonb_exists(proof,'assertSourceBinding')",
                  Integer.class,
                  db.fixtureSession()))
          .isEqualTo(1);
      String preparationId = basis.path("actions").get(4).path("preparationId").asText();
      var proof =
          (ObjectNode)
              C.parse(
                  db.jdbc.queryForObject(
                      "SELECT proof::text FROM studio_guided_preparations WHERE session_id=? AND"
                          + " preparation_id=?",
                      String.class,
                      db.fixtureSession(),
                      preparationId));
      var mutations =
          java.util.List.<Consumer<ObjectNode>>of(
              value -> value.putNull("assertSourceBinding"),
              value ->
                  value
                      .withObject("/assertSourceBinding")
                      .put("producerAdmissionId", "foreign-admission"),
              value ->
                  value
                      .withObject("/assertSourceBinding")
                      .put("producerPreparationId", "alternate-preparation"),
              value -> value.withObject("/assertSourceBinding").put("bindingId", "other-binding"),
              value -> value.withObject("/assertSourceBinding").putNull("bindingId"),
              value -> value.withObject("/assertSourceBinding").put("backendNodeId", 1),
              value -> value.withObject("/assertSourceBinding").put("bindingId", "x".repeat(257)),
              value -> value.withObject("/target").remove("assertTextMode"),
              value -> value.withObject("/target").put("assertTextMode", "DIRECT_PUBLIC"),
              value -> value.put("contextRevision", 2),
              value -> value.put("authoredInputsHash", "b".repeat(64)),
              value -> {
                value.remove("assertSourceBinding");
                value.withObject("/target").remove("assertTextMode");
              });
      int index = 0;
      for (Consumer<ObjectNode> mutation : mutations) {
        var changed = proof.deepCopy().put("preparationId", "invalid-source-" + index++);
        mutation.accept(changed);
        assertThatThrownBy(
                () ->
                    db.jdbc.update(
                        "INSERT INTO studio_guided_preparations(session_id,preparation_id,conte"
                            + ("xt_id,owner_fence,request_digest,proof,expires_at) VALUES"
                                + " (?,?,?,?,?,?")
                            + ("::jsonb,?::timestamptz)"),
                        db.fixtureSession(),
                        changed.path("preparationId").asText(),
                        changed.path("contextId").asText(),
                        changed.path("ownerFence").asInt(),
                        changed.path("requestDigest").asText(),
                        changed.toString(),
                        changed.path("expiresAt").asText()))
            .isInstanceOf(org.springframework.dao.DataAccessException.class);
      }
      for (Consumer<ObjectNode> mutation : mutations) {
        var changed = copy(basis);
        var prepared = (ObjectNode) changed.path("preparations").get(4).path("proof");
        mutation.accept(prepared);
        assertThatThrownBy(() -> new GuidedBasisValidator(C).validate(changed))
            .isInstanceOf(GuidedSessionException.class);
      }
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_preparations WHERE session_id=?",
                  Integer.class,
                  db.fixtureSession()))
          .isEqualTo(5);
      commitSqlCandidate(db, base, candidate);
    }
  }

  /** Real inserts with production triggers installed; all browser outcomes remain controlled. */
  private static void insertSourcePrefixRequest(
      GuidedPublicationMigrationTest.Database db, ObjectNode request) {
    db.jdbc.update(
        "INSERT INTO studio_guided_prefix_requests(session_id,request_digest,step_id,ordinal,"
            + "evidence_hash,document) VALUES (?,?,?,?,?,?::jsonb)",
        db.fixtureSession(),
        hash(request),
        request.path("coordinate").path("stepId").asText(),
        request.path("coordinate").path("ordinal").asInt(),
        request.path("evidenceHash").asText(),
        request.toString());
  }

  private static ObjectNode sourcePrefixReceipt(ObjectNode request, JsonNode frozenAction) {
    var receipt =
        request
            .deepCopy()
            .put("requestDigest", hash(request))
            .putNull("admissionId")
            .putNull("preparationId")
            .put("attemptOrdinal", 0)
            .put("operationHash", frozenAction.path("operationHash").asText())
            .put("phase", "PRE_ADMISSION")
            .put("nativeInvocationStarted", false)
            .put("reason", "TARGET_DRIFT");
    receipt.put("receiptHash", hash(receipt));
    return receipt;
  }

  private static void insertSourcePrefixReceipt(
      GuidedPublicationMigrationTest.Database db, ObjectNode receipt) {
    db.jdbc.update(
        "INSERT INTO studio_guided_no_invocation_receipts(session_id,request_digest,admission_id,"
            + "preparation_id,receipt_hash,document) VALUES (?,?,NULL,NULL,?,?::jsonb)",
        db.fixtureSession(),
        receipt.path("requestDigest").asText(),
        receipt.path("receiptHash").asText(),
        receipt.toString());
  }

  private static ObjectNode sourcePrefixRequest(
      GuidedPublicationMigrationTest.Database db, JsonNode program, JsonNode action) {
    var proof = db.prefixSourceProof();
    var request = C.object();
    for (String field :
        List.of(
            "schemaVersion",
            "sessionId",
            "workerId",
            "ownerFence",
            "scopeHash",
            "contextId",
            "contextRevision",
            "authoredInputsHash",
            "sourceRevision",
            "configurationRevision",
            "pressInheritance",
            "assertSourceBinding")) {
      request.set(field, proof.path(field));
    }
    request.put("prefixProgramHash", hash(program)).put("evidenceHash", "e".repeat(64));
    request.set("coordinate", action.path("coordinate"));
    return request;
  }

  /**
   * Append a real authored boundary; the frozen prefix continues to contain the source assertion.
   */
  private static ObjectNode appendPrefixWriteBoundary(GuidedPublicationMigrationTest.Database db)
      throws Exception {
    ObjectNode next = sameReadSourceBasis();
    var mapper = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
    var authoringJson = copy(next.path("snapshotEvidence").path("current").path("authoring"));
    String id = java.util.UUID.randomUUID().toString();
    String text = "Verify the page contains \"Proof boundary\".";
    authoringJson.withArray("steps").addObject().put("id", id).put("text", text).putNull("context");
    var authoring =
        mapper.treeToValue(authoringJson, com.citi.put.checks.studio.dto.AuthoringV2Request.class);
    var variables =
        com.citi.put.checks.studio.dto.CanonicalStudioCodec.parseVariables(
            db.jdbc.queryForObject(
                "SELECT variables::text FROM ui_tests WHERE id=?", String.class, db.testId));
    var identity =
        com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.resolve(
            authoring, variables);
    var source = C.object().putArray("source");
    authoring.steps().forEach(step -> source.add(step.text()));
    db.jdbc.update(
        "UPDATE ui_tests SET authoring=?::jsonb,authoring_revision_inputs=?::jsonb,steps=?::jsonb,"
            + "source_revision=source_revision+1 WHERE id=?",
        mapper.writeValueAsString(authoring),
        mapper.writeValueAsString(identity.inputs()),
        source.toString(),
        db.testId);
    next.withObject("/snapshotEvidence/current").set("authoring", mapper.valueToTree(authoring));
    next.withArray("sourceSteps")
        .addObject()
        .put("stepId", id)
        .put("ordinal", 3)
        .put("source", text);
    return next;
  }

  @Test
  void persistedSourcePrefixRequestAndReceiptRejectCoherentMetadataMutations() throws Exception {
    try (var seed = new GuidedPublicationMigrationTest.Database()) {
      var original =
          new GuidedPublicationMigrationTest.Database(
              seed.jdbc, seed.tx, "wi6-prefix-base", sameReadSourceBasis());
      var base = original.capture();
      original.finalizing();
      var candidate =
          new ObservedArtifactLowerer(C)
              .lower(
                  original.snapshot(base).basis(), GuidedPublicationMigrationTest.currentProfile());
      commitSqlCandidate(original, base, candidate);
      var revision =
          original.jdbc.queryForObject(
              "SELECT id FROM ui_test_revisions WHERE guided_session_id=?",
              java.util.UUID.class,
              original.fixtureSession());
      var next = appendPrefixWriteBoundary(original);
      var replay =
          new GuidedPublicationMigrationTest.Database(
              seed.jdbc, seed.tx, "wi6-prefix-inserts", next, original.testId, revision);
      replay.capture();
      replay.finalizing();
      var program =
          C.parse(
              replay.jdbc.queryForObject(
                  "SELECT prefix_program::text FROM studio_guided_relearn_plans WHERE session_id=?",
                  String.class,
                  replay.fixtureSession()));
      var action = program.path("actions").get(4);
      assertThat(action.path("target").path("assertTextMode").asText())
          .isEqualTo("READ_BINDING_SOURCE");
      assertThat(
              replay.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=?",
                  Integer.class,
                  replay.fixtureSession(),
                  action.path("coordinate").path("stepId").asText(),
                  action.path("coordinate").path("ordinal").asInt()))
          .isZero();
      var request = sourcePrefixRequest(replay, program, action);
      var mutations =
          List.<Consumer<ObjectNode>>of(
              q -> q.remove("assertSourceBinding"),
              q -> q.putNull("assertSourceBinding"),
              q ->
                  q.withObject("/assertSourceBinding").put("producerPreparationId", "foreign-prep"),
              q ->
                  q.withObject("/assertSourceBinding")
                      .put("producerAdmissionId", "foreign-admission"),
              q -> q.withObject("/assertSourceBinding").put("bindingId", "foreign-binding"),
              q -> q.put("contextRevision", 2),
              q -> q.put("authoredInputsHash", "b".repeat(64)));
      for (Consumer<ObjectNode> mutation : mutations) {
        var changed = request.deepCopy();
        mutation.accept(changed);
        // Reseal both request and receipt from the same changed identity, rather than leave stale
        // hashes.
        var receipt = sourcePrefixReceipt(changed, action);
        assertThatThrownBy(
                () ->
                    replay.tx.executeWithoutResult(
                        status -> {
                          insertSourcePrefixRequest(replay, changed);
                          insertSourcePrefixReceipt(replay, receipt);
                          replay.jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
                        }))
            .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(
                replay.jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_prefix_requests WHERE session_id=?",
                    Integer.class,
                    replay.fixtureSession()))
            .isZero();
        assertThat(
                replay.jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_no_invocation_receipts WHERE session_id=?",
                    Integer.class,
                    replay.fixtureSession()))
            .isZero();
      }
      var invented = request.deepCopy();
      invented.set("coordinate", program.path("actions").get(1).path("coordinate"));
      assertThatThrownBy(() -> insertSourcePrefixRequest(replay, invented))
          .isInstanceOf(org.springframework.dao.DataAccessException.class)
          .hasStackTraceContaining("prefix source mode or operation invalid");
      insertSourcePrefixRequest(replay, request);
      for (Consumer<ObjectNode> mutation : mutations) {
        var receipt = sourcePrefixReceipt(request, action);
        receipt.remove("receiptHash");
        mutation.accept(receipt);
        receipt.put("receiptHash", hash(receipt));
        assertThatThrownBy(() -> insertSourcePrefixReceipt(replay, receipt))
            .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(
                replay.jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_no_invocation_receipts WHERE session_id=?",
                    Integer.class,
                    replay.fixtureSession()))
            .isZero();
      }
      var receipt = sourcePrefixReceipt(request, action);
      replay.tx.executeWithoutResult(
          status -> {
            insertSourcePrefixReceipt(replay, receipt);
            var current = replay.sessions.lock(replay.fixtureSession());
            var incremental = replay.sessions.incremental();
            incremental.settle(replay.fixtureSession(), hash(request), "DRIFT");
            int index =
                com.citi.put.checks.studio.guided.session.GuidedIncrementalStore.stepIndex(
                    current.document(), receipt.path("coordinate").path("stepId").asText());
            incremental.switchToLearning(
                current.document(),
                "DRIFT",
                index,
                receipt.path("coordinate").path("ordinal").asInt(),
                receipt.path("receiptHash").asText());
            current.progress().put("stepIndex", index);
            current.document().put("state", "OBSERVING");
            replay.sessions.save(current);
            replay.jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
          });
      assertThat(
              replay.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_prefix_requests WHERE session_id=? AND request_digest=?",
                  Integer.class,
                  replay.fixtureSession(),
                  hash(request)))
          .isEqualTo(1);
      assertThat(
              replay.jdbc.queryForObject(
                  "SELECT document::text FROM studio_guided_no_invocation_receipts WHERE session_id=?",
                  String.class,
                  replay.fixtureSession()))
          .satisfies(json -> assertThat(C.parse(json)).isEqualTo(receipt));
      assertThat(
              replay.jdbc.queryForObject(
                  "SELECT jsonb_array_length(completed_admissions) FROM studio_guided_relearn_switches"
                      + " WHERE session_id=? AND reason='DRIFT'",
                  Integer.class,
                  replay.fixtureSession()))
          .isEqualTo(4);
      assertThat(
              replay.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_actions WHERE session_id=?"
                      + " AND proposal->'operation'->>'kind'='assert'",
                  Integer.class,
                  replay.fixtureSession()))
          .isZero();
    }
  }

  @Test
  void persistedPrefixRequestRejectsMalformedActualProducerReceipt() throws Exception {
    var mutations =
        List.<Consumer<ObjectNode>>of(
            p -> p.put("origin", "https://foreign.example.test"),
            p -> p.withObject("/recipe").put("policyRuleId", "foreign-rule"),
            p -> p.remove("availability"),
            p -> p.withObject("/availability").put("contextId", "foreign-context"),
            p -> p.withObject("/availability").put("workerId", "foreign-worker"),
            p -> p.withObject("/availability").put("ownerFence", 2),
            p -> p.withObject("/availability").put("bindingId", "foreign-binding"),
            p -> p.withObject("/availability").put("producerAdmissionId", "foreign-admission"));
    try (var seed = new GuidedPublicationMigrationTest.Database()) {
      var original =
          new GuidedPublicationMigrationTest.Database(
              seed.jdbc, seed.tx, "wi6-prefix-producer-base", sameReadSourceBasis());
      var base = original.capture();
      original.finalizing();
      var candidate =
          new ObservedArtifactLowerer(C)
              .lower(
                  original.snapshot(base).basis(), GuidedPublicationMigrationTest.currentProfile());
      commitSqlCandidate(original, base, candidate);
      var revision =
          original.jdbc.queryForObject(
              "SELECT id FROM ui_test_revisions WHERE guided_session_id=?",
              java.util.UUID.class,
              original.fixtureSession());
      var next = appendPrefixWriteBoundary(original);
      int index = 0;
      for (Consumer<ObjectNode> mutation : mutations) {
        var replay =
            new GuidedPublicationMigrationTest.Database(
                seed.jdbc,
                seed.tx,
                "wi6-prefix-producer-" + index++,
                next,
                original.testId,
                revision);
        replay.producerDocumentMutation = mutation;
        replay.capture();
        replay.finalizing();
        var program =
            C.parse(
                replay.jdbc.queryForObject(
                    "SELECT prefix_program::text FROM studio_guided_relearn_plans WHERE session_id=?",
                    String.class,
                    replay.fixtureSession()));
        var request = sourcePrefixRequest(replay, program, program.path("actions").get(4));
        assertThatThrownBy(() -> insertSourcePrefixRequest(replay, request))
            .isInstanceOf(org.springframework.dao.DataAccessException.class)
            .hasStackTraceContaining("prefix producer receipt mismatch");
        assertThat(
                replay.jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_prefix_requests WHERE session_id=?",
                    Integer.class,
                    replay.fixtureSession()))
            .isZero();
      }
    }
  }

  @Test
  void persistedFrozenRevisionInsertRejectsCoherentModeStrippingAgainstSuccessfulPreparation()
      throws Exception {
    try (var seed = new GuidedPublicationMigrationTest.Database()) {
      int index = 0;
      for (var source : List.of(sameReadSourceBasis(), directParagraphBasis())) {
        var db =
            new GuidedPublicationMigrationTest.Database(
                seed.jdbc, seed.tx, "wi6-frozen-strip-" + index++, source);
        var base = db.capture();
        db.finalizing();
        var basis = db.snapshot(base).basis();
        var candidate =
            new ObservedArtifactLowerer(C)
                .lower(basis, GuidedPublicationMigrationTest.currentProfile());
        commitSqlCandidate(db, base, candidate);
        var stripped = copy(candidate.artifact());
        var action = (ObjectNode) stripped.path("learnedPlan").path("actions").get(4);
        action.withObject("/target").remove("assertTextMode");
        stripped.withArray("guards").get(4).withObject("/target").remove("assertTextMode");
        var operationIdentity = C.object();
        for (String field : List.of("coordinate", "origin", "target", "operation")) {
          operationIdentity.set(field, action.path(field));
        }
        action.put("operationHash", hash(operationIdentity));
        stripped.put("learnedPlanHash", hash(stripped.path("learnedPlan")));
        var hashes = copy(candidate.hashes());
        hashes
            .put("learnedPlanHash", hash(stripped.path("learnedPlan")))
            .put("artifactHash", hash(stripped));
        var equivalence = C.object();
        var operations = equivalence.putArray("operations");
        stripped.path("steps").forEach(step -> step.path("operations").forEach(operations::add));
        equivalence.set("guards", stripped.path("guards"));
        equivalence.set("inputRecipes", stripped.path("inputRecipes"));
        equivalence.set("bindings", basis.path("bindings"));
        equivalence.set("transfers", basis.path("transfers"));
        hashes.put("operationEquivalenceHash", hash(equivalence));
        hashes.put(
            "revisionDigest", hash(new ObservedArtifactLowerer(C).revisionIdentity(basis, hashes)));
        // Reuse every other actual persisted column. BEFORE INSERT must reject against the
        // successful preparation, before uniqueness or deferred publication receipt checks.
        var replacement = C.object().put("id", java.util.UUID.randomUUID().toString());
        replacement.set("artifact", stripped);
        replacement.set("artifact_hash", hashes.path("artifactHash"));
        replacement.set("learned_plan_hash", hashes.path("learnedPlanHash"));
        replacement.set("revision_digest", hashes.path("revisionDigest"));
        var provenance = copy(hashes);
        provenance.set("profile", stripped.path("profile"));
        provenance.put("guidedSessionId", db.fixtureSession()).put("publicationKind", "GUIDED_RUN");
        provenance.set("runAuthorization", base.document().path("runAuthorization"));
        replacement.set("provenance", provenance);
        assertThatThrownBy(
                () ->
                    db.jdbc.update(
                        "INSERT INTO ui_test_revisions SELECT (jsonb_populate_record(NULL::ui_test_revisions,"
                            + " to_jsonb(r)||?::jsonb)).* FROM ui_test_revisions r WHERE guided_session_id=?",
                        replacement.toString(),
                        db.fixtureSession()))
            .isInstanceOf(org.springframework.dao.DataAccessException.class)
            .hasStackTraceContaining("frozen assertion metadata invalid");
        assertThat(
                db.jdbc.queryForObject(
                    "SELECT count(*) FROM ui_test_revisions WHERE guided_session_id=?",
                    Integer.class,
                    db.fixtureSession()))
            .isEqualTo(1);
      }
    }
  }

  static ObjectNode directParagraphBasis() throws Exception {
    ObjectNode basis = copy(fixture("fresh-order-reference").path("basis"));
    var obligations = basis.withObject("/translationPlan").withArray("obligations");
    ((ObjectNode) obligations.get(3)).put("referenceIndex", 2);
    var assertion = (ObjectNode) obligations.get(4);
    assertion
        .put("predicate", "containsText")
        .put("targetIntent", "Café")
        .put("referenceIndex", 1)
        .putNull("needId");
    ((ObjectNode) basis.path("translationPlan").path("sourceReferences").get(1))
        .put("intendedSlot", "assert.expected");
    var entry = (ObjectNode) basis.path("materializationEvidence").path("entries").get(1);
    entry.withObject("/metadata").put("intendedSlot", "assert.expected");
    entry.withObject("/metadata/provenance").put("intendedSlot", "assert.expected");
    JsonNode span = entry.path("metadata").path("provenance");
    String literal =
        basis
            .path("sourceSteps")
            .get(2)
            .path("source")
            .asText()
            .substring(span.path("startUtf16").asInt(), span.path("endUtf16").asInt());
    entry.put(
        "inputHash", GuidedContracts.hash(copy(entry.path("metadata")).put("value", literal)));
    var preparations = basis.withArray("preparations");
    ((ObjectNode) preparations.get(3))
        .withObject("/proposal/operation/value")
        .put("sourceInputId", "input-config");
    var consumer = (ObjectNode) preparations.get(4);
    var op = consumer.withObject("/proposal/operation").put("predicate", "containsText");
    op.putObject("expected").put("kind", "authoredLiteral").put("sourceInputId", "input-label");
    var target =
        consumer
            .withObject("/proof")
            .putObject("target")
            .put("tier", "testId")
            .put("assertTextMode", "DIRECT_PUBLIC");
    target.putArray("locator").addObject().put("by", "testId").put("value", "direct-paragraph");
    target.putObject("identity").put("role", "paragraph").putNull("name");
    String observationHash = consumer.path("observationHash").asText();
    for (JsonNode row : basis.path("observations")) {
      if (!row.path("observationHash").asText().equals(observationHash)) {
        continue;
      }
      var observation = (ObjectNode) row.path("observation");
      var fact =
          observation
              .withObject("/facts/e2")
              .put("role", "paragraph")
              .put("name", "")
              .put("editable", false)
              .put("evidence", literal)
              .put("text", literal)
              .put("ownTextComplete", true)
              .put("directTextAssertion", true);
      fact.putArray("evidenceSegments")
          .addObject()
          .put("field", "ownText")
          .put("start", 0)
          .put("end", literal.length());
      observation
          .withObject("/facts")
          .putObject("e3")
          .put("role", "caption")
          .put("name", "Python")
          .put("editable", false)
          .put("evidence", "Python")
          .put("nameComplete", true)
          .put("ownTextComplete", true)
          .putArray("evidenceSegments")
          .addObject()
          .put("field", "name")
          .put("start", 0)
          .put("end", 6);
      observation
          .withObject("/facts")
          .putObject("e4")
          .put("role", "link")
          .put("name", "Designed by")
          .put("editable", false)
          .put("evidence", "Designed by")
          .put("nameComplete", true)
          .put("ownTextComplete", true)
          .putArray("evidenceSegments")
          .addObject()
          .put("field", "name")
          .put("start", 0)
          .put("end", 11);
      var readScope =
          observation
              .withObject("/facts/e1")
              .putObject("readScope")
              .put("relation", "SAME_ROW_LABEL")
              .put("tableTitleRef", "e3");
      readScope.putArray("sourceRefs").add("e3").add("e4");
      String outline =
          "- document\n"
              + "  - text \"Reference\" [e1]\n"
              + "  - paragraph [e2]\n"
              + "  - caption \"Python\" [e3]\n"
              + "  - link \"Designed by\" [e4]";
      observation.put("outline", outline);
      observation
          .withObject("/projection")
          .put("totalNodes", 4)
          .put("shownNodes", 4)
          .put("outlineBytes", outline.getBytes(StandardCharsets.UTF_8).length);
    }
    for (JsonNode need : basis.path("translationPlan").path("needs")) {
      ((ArrayNode) need.path("consumers")).remove(1);
    }
    for (JsonNode allocation : basis.path("allocations")) {
      ((ArrayNode) allocation.path("consumers")).remove(1);
    }
    ((ArrayNode) basis.path("consumerEdges")).remove(1);
    ((ArrayNode) basis.path("transfers")).remove(1);
    return basis;
  }

  @Test
  void realMigratedDirectParagraphAndTitleObservationPersistAndRefuseModeNullAndSourceSwap()
      throws Exception {
    try (var seed = new GuidedPublicationMigrationTest.Database()) {
      var db =
          new GuidedPublicationMigrationTest.Database(
              seed.jdbc, seed.tx, "wi6-direct", directParagraphBasis());
      var base = db.capture();
      db.finalizing();
      JsonNode basis = db.snapshot(base).basis();
      var candidate =
          new ObservedArtifactLowerer(C)
              .lower(basis, GuidedPublicationMigrationTest.currentProfile());
      assertThat(
              candidate
                  .artifact()
                  .path("guards")
                  .get(4)
                  .path("target")
                  .path("assertTextMode")
                  .asText())
          .isEqualTo("DIRECT_PUBLIC");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_wi6_frozen_assertion_metadata(?::jsonb)",
                  Boolean.class,
                  candidate.artifact().toString()))
          .isTrue();
      var stripped = copy(candidate.artifact());
      ((ObjectNode) stripped.path("learnedPlan").path("actions").get(4).path("target"))
          .remove("assertTextMode");
      ((ObjectNode) stripped.path("guards").get(4).path("target")).remove("assertTextMode");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_wi6_frozen_assertion_metadata(?::jsonb)",
                  Boolean.class,
                  stripped.toString()))
          .isFalse();

      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_publication_observations WHERE session_id=?"
                      + " AND jsonb_exists(observation->'facts'->'e1'->'readScope','tableTitleRef')",
                  Integer.class,
                  db.fixtureSession()))
          .isEqualTo(1);
      var prepared = basis.path("preparations").get(4);
      var proof = copy(prepared.path("proof"));
      var mutations =
          java.util.List.<Consumer<ObjectNode>>of(
              value -> value.withObject("/target").remove("assertTextMode"),
              value -> value.withObject("/target").putNull("assertTextMode"),
              value -> value.withObject("/target").put("assertTextMode", "READ_BINDING_SOURCE"),
              value -> value.putNull("assertSourceBinding"));
      int index = 0;
      for (Consumer<ObjectNode> mutation : mutations) {
        var changed = proof.deepCopy().put("preparationId", "invalid-direct-" + index++);
        mutation.accept(changed);
        assertThatThrownBy(
                () ->
                    db.jdbc.update(
                        "INSERT INTO studio_guided_preparations(session_id,preparation_id,conte"
                            + ("xt_id,owner_fence,request_digest,proof,expires_at) VALUES"
                                + " (?,?,?,?,?,?")
                            + ("::jsonb,?::timestamptz)"),
                        db.fixtureSession(),
                        changed.path("preparationId").asText(),
                        changed.path("contextId").asText(),
                        changed.path("ownerFence").asInt(),
                        changed.path("requestDigest").asText(),
                        changed.toString(),
                        changed.path("expiresAt").asText()))
            .isInstanceOf(org.springframework.dao.DataAccessException.class);
      }
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_preparations WHERE session_id=?",
                  Integer.class,
                  db.fixtureSession()))
          .isEqualTo(5);
      commitSqlCandidate(db, base, candidate);
    }
  }

  @Test
  void realProducerInsertCannotLaunderAvailabilityOriginOrRecipeIntoSourceAssertion()
      throws Exception {
    var mutations =
        List.<Consumer<ObjectNode>>of(
            producer -> producer.put("origin", "https://foreign.example.test"),
            producer -> producer.withObject("/recipe").put("policyRuleId", "other-policy"),
            producer -> producer.remove("availability"),
            producer -> producer.putNull("availability"),
            producer -> producer.withObject("/availability").put("contextId", "foreign-context"),
            producer -> producer.withObject("/availability").put("workerId", "foreign-worker"),
            producer -> producer.withObject("/availability").put("ownerFence", 2),
            producer -> producer.withObject("/availability").put("bindingId", "foreign-binding"),
            producer ->
                producer
                    .withObject("/availability")
                    .put("producerAdmissionId", "foreign-admission"),
            producer -> producer.withObject("/availability").put("backendNodeId", 123));
    try (var seed = new GuidedPublicationMigrationTest.Database()) {
      var good =
          new GuidedPublicationMigrationTest.Database(
              seed.jdbc, seed.tx, "wi6-receipt-good", sameReadSourceBasis());
      var base = good.capture();
      good.finalizing();
      var basis = good.snapshot(base).basis();
      var producer = basis.path("producers").get(0);
      var prior = basis.path("actions").get(1).path("ledger");
      var prepared = basis.path("preparations").get(1);
      var source = basis.path("preparations").get(4).path("proof").path("assertSourceBinding");
      assertThat(
              seed.jdbc.queryForObject(
                  "SELECT"
                      + " studio_wi6_read_producer_metadata(?::jsonb,?::jsonb,?::jsonb,?::jsonb,?::jsonb)",
                  Boolean.class,
                  producer.toString(),
                  prior.toString(),
                  prepared.path("proposal").toString(),
                  prepared.path("proof").toString(),
                  source.toString()))
          .isTrue();
      int index = 0;
      for (Consumer<ObjectNode> mutation : mutations) {
        var malformed = copy(producer);
        mutation.accept(malformed);
        assertThat(
                seed.jdbc.queryForObject(
                    "SELECT"
                        + " studio_wi6_read_producer_metadata(?::jsonb,?::jsonb,?::jsonb,?::jsonb,?::jsonb)",
                    Boolean.class,
                    malformed.toString(),
                    prior.toString(),
                    prepared.path("proposal").toString(),
                    prepared.path("proof").toString(),
                    source.toString()))
            .isFalse();
        var badBasis = copy(basis);
        ((ArrayNode) badBasis.path("producers")).set(0, malformed);
        assertThatThrownBy(
                () -> new GuidedPlanBuilder(C).plan(badBasis, C.object().put("contract", 3)))
            .isInstanceOf(GuidedSessionException.class);
        var bad =
            new GuidedPublicationMigrationTest.Database(
                seed.jdbc, seed.tx, "wi6-receipt-bad-" + index++, sameReadSourceBasis());
        bad.producerDocumentMutation = mutation;
        bad.capture();
        assertThatThrownBy(bad::finalizing)
            .hasStackTraceContaining("assertion producer receipt mismatch");
      }
    }
  }

  @Test
  void identicalReadAndEffectSourceArraysCannotGiveCaptionEffectAuthorityInSql() throws Exception {
    var invalid = directParagraphBasis();
    var observation = invalid.path("observations").get(2).path("observation");
    ((ObjectNode) observation.path("facts").path("e1"))
        .set(
            "scopeRefs",
            observation.path("facts").path("e1").path("readScope").path("sourceRefs").deepCopy());
    assertThatThrownBy(
            () ->
                com.citi.put.checks.studio.guided.translation.GuidedGates.requireCoherentSources(
                    observation.path("facts")))
        .isInstanceOf(GuidedSessionException.class);
    try (var seed = new GuidedPublicationMigrationTest.Database()) {
      var bad =
          new GuidedPublicationMigrationTest.Database(
              seed.jdbc, seed.tx, "wi6-caption-effect", invalid);
      bad.capture();
      assertThatThrownBy(bad::finalizing)
          .hasStackTraceContaining("ck_publication_observation_shape");
    }
  }

  @Test
  void exactSourceWithPublicFactTextCannotCoherentlyOmitReadModeInPersistedPreparation()
      throws Exception {
    var input = sameReadSourceBasis();
    ((ObjectNode) input.path("observations").get(2).path("observation").path("facts").path("e1"))
        .put("text", "Reference");
    try (var seed = new GuidedPublicationMigrationTest.Database()) {
      var db =
          new GuidedPublicationMigrationTest.Database(
              seed.jdbc, seed.tx, "wi6-public-source", input);
      var base = db.capture();
      db.finalizing();
      var basis = db.snapshot(base).basis();
      var stripped = copy(basis.path("preparations").get(4).path("proof"));
      stripped.put("preparationId", "stripped-public-source").remove("assertSourceBinding");
      stripped.withObject("/target").remove("assertTextMode");
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "INSERT INTO studio_guided_preparations(session_id,preparation_id,conte"
                          + ("xt_id,owner_fence,request_digest,proof,expires_at) VALUES"
                              + " (?,?,?,?,?,?")
                          + ("::jsonb,?::timestamptz)"),
                      db.fixtureSession(),
                      stripped.path("preparationId").asText(),
                      stripped.path("contextId").asText(),
                      stripped.path("ownerFence").asInt(),
                      stripped.path("requestDigest").asText(),
                      stripped.toString(),
                      stripped.path("expiresAt").asText()))
          .hasStackTraceContaining("source assertion mode omitted");
    }
  }

  @Test
  void namedReceiverInNewDocumentMayReuseRefWithWithheldTextWithoutNewSourceMode()
      throws Exception {
    var input = sameReadSourceBasis();
    var prepared = (ObjectNode) input.path("preparations").get(4);
    prepared.withObject("/proof").remove("assertSourceBinding");
    var target = prepared.withObject("/proof/target");
    target.remove("assertTextMode");
    target.putObject("identity").put("role", "heading").put("name", "Invoice");
    target.putArray("locator").addObject().put("by", "testId").put("value", "invoice-receiver");
    prepared.withObject("/proposal/target").put("documentId", "receiver-document");
    prepared.withObject("/proposal/executionEvidence").put("documentId", "receiver-document");
    prepared.withObject("/executionEvidence").put("documentId", "receiver-document");
    ((ObjectNode) input.path("actions").get(4).path("ledger"))
        .put("documentId", "receiver-document");
    var observation = (ObjectNode) input.path("observations").get(2).path("observation");
    observation.put("documentId", "receiver-document");
    var fact =
        observation
            .withObject("/facts/e1")
            .put("role", "heading")
            .put("name", "Invoice")
            .put("evidence", "Invoice");
    fact.remove("text");
    fact.putArray("evidenceSegments")
        .addObject()
        .put("field", "name")
        .put("start", 0)
        .put("end", 7);
    String outline = "- document\n  - heading \"Invoice\" [e1]\n  - textbox \"Destination\" [e2]";
    observation.put("outline", outline);
    observation
        .withObject("/projection")
        .put("outlineBytes", outline.getBytes(StandardCharsets.UTF_8).length);
    ((ObjectNode) input.path("translationPlan").path("obligations").get(4))
        .put("targetIntent", "Invoice");
    var sourceStep = (ObjectNode) input.path("sourceSteps").get(2);
    sourceStep.put(
        "source",
        sourceStep.path("source").asText() + "; check that Invoice contains the copied reference");
    ((ObjectNode)
            input.path("snapshotEvidence").path("current").path("authoring").path("steps").get(2))
        .put("text", sourceStep.path("source").asText());
    try (var seed = new GuidedPublicationMigrationTest.Database()) {
      var db =
          new GuidedPublicationMigrationTest.Database(
              seed.jdbc, seed.tx, "wi6-new-receiver", input);
      var base = db.capture();
      db.finalizing();
      var basis = db.snapshot(base).basis();
      var candidate =
          new ObservedArtifactLowerer(C)
              .lower(basis, GuidedPublicationMigrationTest.currentProfile());
      assertThat(basis.path("preparations").get(4).path("proof").has("assertSourceBinding"))
          .isFalse();
      assertThat(candidate.artifact().path("guards").get(4).path("target").has("assertTextMode"))
          .isFalse();
      var foreign = copy(basis.path("preparations").get(4).path("proof"));
      foreign.withObject("/target").put("assertTextMode", "READ_BINDING_SOURCE");
      foreign
          .putObject("assertSourceBinding")
          .put("bindingId", "binding-reference")
          .put(
              "producerAdmissionId",
              basis.path("producers").get(0).path("producerAdmissionId").asText())
          .put(
              "producerPreparationId",
              basis.path("preparations").get(1).path("preparationId").asText());
      foreign.put("preparationId", "foreign-mode-on-new-document");
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "INSERT INTO studio_guided_preparations(session_id,preparation_id,conte"
                          + ("xt_id,owner_fence,request_digest,proof,expires_at) VALUES"
                              + " (?,?,?,?,?,?")
                          + ("::jsonb,?::timestamptz)"),
                      db.fixtureSession(),
                      foreign.path("preparationId").asText(),
                      foreign.path("contextId").asText(),
                      foreign.path("ownerFence").asInt(),
                      foreign.path("requestDigest").asText(),
                      foreign.toString(),
                      foreign.path("expiresAt").asText()))
          .hasStackTraceContaining("assertion producer mismatch");
      commitSqlCandidate(db, base, candidate);
      var history = C.object().putArray("history");
      for (JsonNode action : basis.path("actions")) {
        JsonNode prep =
            GuidedPlanBuilder.unique(
                basis.path("preparations"), "preparationId", action.path("preparationId").asText());
        var row = history.addObject();
        row.set("ledger", action.path("ledger"));
        row.set("proposal", prep.path("proposal"));
        row.set("proof", prep.path("proof"));
      }
      assertThatThrownBy(
              () ->
                  com.citi.put.checks.studio.guided.session.GuidedPreparationCrossCheck
                      .verifySourceHistory(
                          C,
                          basis.path("translationPlan"),
                          basis.path("preparations").get(4).path("proposal"),
                          foreign,
                          history,
                          basis.path("producers")))
          .hasMessage("EVIDENCE_MISMATCH");
    }
  }

  @Test
  void persistedDirectPreparationRejectsNegativeOutOfRangeAndForeignPlanMeaningPointers()
      throws Exception {
    try (var seed = new GuidedPublicationMigrationTest.Database()) {
      int index = 0;
      for (int invalid : List.of(-1, -2, Integer.MAX_VALUE)) {
        var bad =
            new GuidedPublicationMigrationTest.Database(
                seed.jdbc, seed.tx, "wi6-direct-index-" + index++, directParagraphBasis());
        bad.obligationMeaningMutation =
            meaning -> {
              if (meaning.path("operationKind").asText().equals("assert")) {
                meaning.put("referenceIndex", invalid);
              }
            };
        bad.capture();
        assertThatThrownBy(bad::finalizing)
            .hasStackTraceContaining("direct assertion reference index");
      }
      var duplicateCatalog = directParagraphBasis();
      duplicateCatalog
          .withObject("/translationPlan")
          .withArray("sourceReferences")
          .add(duplicateCatalog.path("translationPlan").path("sourceReferences").get(1).deepCopy());
      var wrongPointer =
          new GuidedPublicationMigrationTest.Database(
              seed.jdbc, seed.tx, "wi6-direct-valid-index", duplicateCatalog);
      wrongPointer.obligationMeaningMutation =
          meaning -> {
            if (meaning.path("operationKind").asText().equals("assert")) {
              meaning.put("referenceIndex", 3);
            }
          };
      wrongPointer.capture();
      assertThatThrownBy(wrongPointer::finalizing)
          .hasStackTraceContaining("direct assertion plan meaning mismatch");
      var wrongObligation =
          new GuidedPublicationMigrationTest.Database(
              seed.jdbc, seed.tx, "wi6-direct-obligation", directParagraphBasis());
      wrongObligation.obligationMeaningMutation =
          meaning -> {
            if (meaning.path("operationKind").asText().equals("assert")) {
              meaning.put("obligationId", "foreign-direct-obligation");
            }
          };
      wrongObligation.capture();
      assertThatThrownBy(wrongObligation::finalizing)
          .hasStackTraceContaining("direct assertion plan meaning mismatch");
    }
  }

  @Test
  void persistedCaptionNeedsPresentTitleRefAndNeverEffectScopeEvenForEqualArrays()
      throws Exception {
    try (var seed = new GuidedPublicationMigrationTest.Database()) {
      var valid =
          new GuidedPublicationMigrationTest.Database(
              seed.jdbc, seed.tx, "wi6-caption-present", directParagraphBasis());
      var base = valid.capture();
      valid.finalizing();
      var basis = valid.snapshot(base).basis();
      commitSqlCandidate(
          valid,
          base,
          new ObservedArtifactLowerer(C)
              .lower(basis, GuidedPublicationMigrationTest.currentProfile()));
      for (String variant : List.of("omitted", "null", "effect")) {
        var invalid = directParagraphBasis();
        var fact =
            (ObjectNode)
                invalid.path("observations").get(2).path("observation").path("facts").path("e1");
        if (variant.equals("omitted")) {
          fact.withObject("/readScope").remove("tableTitleRef");
        }
        if (variant.equals("null")) {
          fact.withObject("/readScope").putNull("tableTitleRef");
        }
        if (variant.equals("effect")) {
          fact.set("scopeRefs", fact.path("readScope").path("sourceRefs").deepCopy());
        }
        var bad =
            new GuidedPublicationMigrationTest.Database(
                seed.jdbc, seed.tx, "wi6-caption-" + variant, invalid);
        bad.capture();
        assertThatThrownBy(bad::finalizing)
            .hasStackTraceContaining("ck_publication_observation_shape");
      }
    }
  }
}
