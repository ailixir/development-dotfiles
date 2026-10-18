package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Independent frozen vectors: pure Java conformance, never browser/SQL/secret-resolution credit.
 */
class IncrementalPublicationConformanceTest {
  private static final GuidedContracts C = new GuidedContracts();

  private static JsonNode document() throws Exception {
    return C.parse(
        Files.readString(
            Path.of(
                "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")));
  }

  record Vector(String name, JsonNode document) {
    @Override
    public String toString() {
      return name;
    }
  }

  private static Stream<Vector> vectors(String section, String field) throws Exception {
    var out = Stream.<Vector>builder();
    for (JsonNode item : document().path(section).path(field)) {
      out.add(new Vector(section + ":" + item.path("name").asText(), item));
    }
    return out.build();
  }

  static Stream<Vector> positives() throws Exception {
    return Stream.concat(
        vectors("snapshotCorrection", "positives"),
        vectors("graphTimingConformance", "graphCases")
            .filter(v -> v.document().path("expected").asText().equals("ACCEPT")));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("positives")
  void derivesCompleteIndependentArtifactWithoutMutatingRawEvidence(Vector vector) {
    JsonNode basis = vector.document().path("basis");
    JsonNode original = basis.deepCopy();
    JsonNode expected = vector.document().path("expectedArtifact");
    var candidate = new ObservedArtifactLowerer(C).lower(basis, expected.path("profile"));
    assertThat(candidate.artifact()).isEqualTo(expected);
    assertThat(basis).isEqualTo(original);
    assertThat(candidate.hashes().path("learnedPlanHash").asText())
        .isEqualTo(expected.path("learnedPlanHash").asText());
  }

  static Stream<Vector> snapshotNegatives() throws Exception {
    // These attacks alter facts present in the pure basis. External immutable-authority and
    // private-value substitutions are checked by the repository tests, not credited here.
    Set<String> local =
        Set.of(
            "missing-snapshot-evidence",
            "null-base-for-nonempty-original-prefix",
            "foreign-base-id",
            "foreign-test-base-identity",
            "forged-base-revision-digest",
            "forged-base-artifact-hash",
            "claimed-map-not-recomputed",
            "changed-base-context-retains-old-snapshot",
            "source-text-does-not-match-basis",
            "duplicate-reference-declaration",
            "missing-referenced-plain-identity",
            "private-resolved-value-in-declaration",
            "noncontiguous-original-prefix-program",
            "program-action-not-from-base",
            "current-prefix-context-cannot-be-reused",
            "base-authoring-identity-version-absent",
            "missing-current-global-context",
            "missing-step-evidence-reference-array",
            "claimed-current-step-input-is-forbidden",
            "recursive-past-basis-is-forbidden",
            "raw-configuration-values-in-current-evidence",
            "extra-snapshot-evidence-field",
            "missing-required-base-proof-null",
            "base-operation-equivalence-is-recomputed",
            "base-claimed-map-resealed-still-not-source-derived",
            "empty-prefix-must-not-require-or-supply-old-proof",
            "nonempty-original-prefix-cannot-null-proof-after-drift-at-one");
    return vectors("snapshotCorrection", "negatives")
        .filter(v -> local.contains(v.document().path("name").asText()));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("snapshotNegatives")
  void rejectsSuppliedSourceBaseAndSnapshotAttacks(Vector vector) throws Exception {
    JsonNode expected = document().path("artifact");
    assertThatThrownBy(
            () ->
                new ObservedArtifactLowerer(C)
                    .lower(vector.document().path("basis"), expected.path("profile")))
        .isInstanceOf(GuidedSessionException.class);
  }

  static Stream<Vector> graphNegatives() throws Exception {
    // Transport authentication, private input and original authority sidecars are outside a pure
    // lowerer. Those are exercised through the real owning-worker/repository paths.
    return vectors("graphTimingConformance", "graphCases")
        .filter(v -> v.document().path("expected").asText().equals("REJECT"))
        .filter(
            v ->
                !v.document()
                    .path("name")
                    .asText()
                    .equals("receipt-transport-authority-cannot-be-inferred-from-hash"))
        // Exact private-ledger mutation moves intact to the real PostgreSQL companion below.
        .filter(
            v -> !v.document().path("name").asText().equals("raw-edge-cannot-name-pending-action"));
  }

  static Stream<Vector> candidateSnapshotNegatives() throws Exception {
    Set<String> names =
        Set.of(
            "candidate-snapshot-map-cannot-be-copied-even-if-resealed",
            "candidate-gap-in-reused-prefix",
            "candidate-older-same-test-revision-id",
            "candidate-suffix-reuse-is-forbidden");
    return vectors("snapshotCorrection", "negatives")
        .filter(v -> names.contains(v.document().path("name").asText()));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("candidateSnapshotNegatives")
  void actualWriterComparisonRefusesOfferedSnapshotCandidateAfterItsValidParent(Vector vector)
      throws Exception {
    JsonNode basis = vector.document().path("basis"),
        offered = vector.document().path("expectedArtifact");
    JsonNode parent = null;
    for (JsonNode positive : document().path("snapshotCorrection").path("positives")) {
      if (positive.path("basis").equals(basis)) {
        parent = positive;
      }
    }
    assertThat(parent).as("original coherent complete parent for %s", vector.name()).isNotNull();
    var accepted =
        new ObservedArtifactLowerer(C)
            .lower(basis, parent.path("expectedArtifact").path("profile"));
    assertThat(accepted.artifact()).isEqualTo(parent.path("expectedArtifact"));
    ObjectNode identity = C.object().put("basisHash", GuidedContracts.hash(basis));
    ObjectNode base = identity.putObject("base");
    for (String field :
        java.util.List.of(
            "sourceHash", "configurationHash", "authoringHash", "runAuthorizationHash")) {
      base.set(field, accepted.hashes().path(field));
    }
    for (String field :
        java.util.List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      identity.set(field, accepted.hashes().path(field));
    }
    var snapshot = new PublicationContracts.Snapshot(identity, basis);
    var jdbc = org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class);
    var writer = new GuidedPublicationRepository(jdbc, C);
    writer.verifyCandidate(snapshot, accepted, accepted.hashes());
    JsonNode originalOffered = offered.deepCopy(), originalBasis = basis.deepCopy();
    var malicious = offeredCandidate(basis, offered, accepted);
    assertThatThrownBy(() -> writer.verifyCandidate(snapshot, malicious, malicious.hashes()))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("EVIDENCE_MISMATCH");
    assertThat(offered).isEqualTo(originalOffered);
    assertThat(basis).isEqualTo(originalBasis);
    org.mockito.Mockito.verifyNoInteractions(jdbc);
  }

  /**
   * Re-seal all offered candidate hashes; refusal must still come from comparison to derivation.
   */
  private static PublicationContracts.Candidate offeredCandidate(
      JsonNode basis, JsonNode artifact, PublicationContracts.Candidate parent) {
    JsonNode plan = artifact.path("learnedPlan"), policy = artifact.path("replayPolicy");
    ObjectNode hashes = parent.hashes().deepCopy();
    hashes
        .put("artifactHash", GuidedContracts.hash(artifact))
        .put("learnedPlanHash", GuidedContracts.hash(plan))
        .put("referencePolicyHash", GuidedContracts.hash(policy))
        .put("profileHash", GuidedContracts.hash(artifact.path("profile")));
    ObjectNode equivalence = C.object();
    var operations = equivalence.putArray("operations");
    for (JsonNode step : artifact.path("steps")) {
      step.path("operations").forEach(operations::add);
    }
    for (String field : java.util.List.of("guards", "inputRecipes")) {
      equivalence.set(field, artifact.path(field));
    }
    equivalence.set("bindings", policy.path("bindings"));
    equivalence.set("transfers", policy.path("transfers"));
    hashes.put("operationEquivalenceHash", GuidedContracts.hash(equivalence));
    for (String field :
        java.util.List.of(
            "admissionProvenanceHash", "publicationEvidenceHash", "runAuthorizationHash")) {
      hashes.set(field, policy.path(field));
    }
    hashes.put(
        "revisionDigest",
        GuidedContracts.hash(new ObservedArtifactLowerer(C).revisionIdentity(basis, hashes)));
    // The offered artifact itself remains byte-exact to the original malicious vector.
    return new PublicationContracts.Candidate(plan, artifact, policy, hashes);
  }

  static Stream<Vector> admittedHistoryNegatives() throws Exception {
    return vectors("graphTimingConformance", "graphCases")
        .filter(
            v ->
                Set.of(
                        "raw-allocation-cannot-be-replaced-with-effective-empty-copy",
                        "raw-failed-edge-history-cannot-be-erased")
                    .contains(v.document().path("name").asText()));
  }

  @ParameterizedTest(name = "admitted raw history {0}")
  @MethodSource("admittedHistoryNegatives")
  void admittedExcludedBindingStillRequiresItsExactRawIntentAndEdge(Vector vector)
      throws Exception {
    JsonNode parent = null;
    for (JsonNode row : document().path("graphTimingConformance").path("graphCases")) {
      if (row.path("name").asText().equals("admitted-binding-replacement")) {
        parent = row;
      }
    }
    assertThat(parent).isNotNull();
    new ObservedArtifactLowerer(C)
        .lower(parent.path("basis"), parent.path("expectedArtifact").path("profile"));
    assertThatThrownBy(() -> new GuidedEffectiveGraph(C).project(vector.document().path("basis")))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("REFERENCE_MISMATCH");
  }

  @org.junit.jupiter.params.ParameterizedTest(name = "excluded binding multiplicity {0}")
  @org.junit.jupiter.params.provider.ValueSource(strings = {"duplicate-edge", "duplicate-pair"})
  void excludedBindingHistoryCannotDuplicateItsAdmissionEdgeOrAllocationPair(String mutation)
      throws Exception {
    JsonNode parent = null;
    for (JsonNode row : document().path("graphTimingConformance").path("graphCases")) {
      if (row.path("name").asText().equals("admitted-binding-replacement")) {
        parent = row;
      }
    }
    assertThat(parent).isNotNull();
    ObjectNode basis = parent.path("basis").deepCopy();
    new GuidedEffectiveGraph(C).project(basis);
    var values =
        (com.fasterxml.jackson.databind.node.ArrayNode)
            (mutation.equals("duplicate-edge")
                ? basis.path("consumerEdges")
                : basis.path("allocations").get(0).path("consumers"));
    values.add(values.get(0).deepCopy());
    assertThatThrownBy(() -> new GuidedEffectiveGraph(C).project(basis))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("REFERENCE_MISMATCH");
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("graphNegatives")
  void rejectsForgedGraphOrDerivesAnArtifactDifferentFromTheForgedCandidate(Vector vector) {
    JsonNode basis = vector.document().path("basis"), original = basis.deepCopy();
    JsonNode offered = vector.document().path("expectedArtifact");
    try {
      var derived = new ObservedArtifactLowerer(C).lower(basis, offered.path("profile"));
      // Candidate-only attacks leave the valid basis intact. Derivation must retain its exact
      // successful graph, transfers and hash preimages, so the forged candidate cannot match.
      assertThat(derived.artifact()).as(vector.name()).isNotEqualTo(offered);
    } catch (GuidedSessionException refused) {
      assertThat(refused.status()).isIn(409, 413, 422);
    }
    assertThat(basis).isEqualTo(original);
  }

  @org.junit.jupiter.params.ParameterizedTest(name = "extended basis refuses {0}")
  @org.junit.jupiter.params.provider.ValueSource(
      strings = {
        "materializationEvidence",
        "incrementalEvidence",
        "snapshotEvidence",
        "extra-root",
        "extra-version",
        "extra-entry",
        "extra-current-source"
      })
  void extendedEvidenceEnvelopeIsRequiredAndClosed(String mutation) throws Exception {
    ObjectNode basis = document().path("basis").deepCopy();
    switch (mutation) {
      case "extra-root" -> basis.put("claimedAuthority", true);
      case "extra-version" ->
          ((ObjectNode) basis.path("materializationEvidence").path("versions").get(0))
              .put("trusted", true);
      case "extra-entry" ->
          ((ObjectNode) basis.path("materializationEvidence").path("entries").get(0))
              .put("resolvedValue", "forged-private-data");
      case "extra-current-source" ->
          ((ObjectNode) basis.path("snapshotEvidence").path("current"))
              .put("claimedStepSnapshot", "0".repeat(64));
      default -> basis.remove(mutation);
    }
    JsonNode profile = document().path("artifact").path("profile");
    assertThatThrownBy(() -> new ObservedArtifactLowerer(C).lower(basis, profile))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void issuedPrefixReadObservationRemainsAnchoredWithoutAnEffectiveReadAction() throws Exception {
    JsonNode vector = null;
    for (JsonNode row : document().path("graphTimingConformance").path("graphCases")) {
      if (row.path("name").asText().equals("unperformed-read")) {
        vector = row;
      }
    }
    assertThat(vector).isNotNull();
    JsonNode basis = vector.path("basis"), before = basis.deepCopy();
    String issuedHash = basis.path("observations").get(0).path("observationHash").asText();
    for (JsonNode action : basis.path("actions")) {
      assertThat(action.path("ledger").path("executionEvidence").path("observationHash").asText())
          .isNotEqualTo(issuedHash);
    }
    new GuidedBasisValidator(C).validate(basis);
    assertThat(basis).isEqualTo(before);
  }

  @Test
  void historicalChoiceCaptureAnchorsItsOlderObservationButAnUnusedSnapshotDoesNot()
      throws Exception {
    ObjectNode basis = document().path("observedChoice").path("basis").deepCopy();
    JsonNode before = basis.deepCopy();
    new GuidedBasisValidator(C).validate(basis);
    assertThat(basis).isEqualTo(before);
    boolean removed = false;
    for (JsonNode prepared : basis.path("preparations")) {
      if (prepared.has("observedChoice")) {
        String hash =
            prepared
                .path("observedChoice")
                .path("context")
                .path("questionCapture")
                .path("observationHash")
                .asText();
        for (JsonNode action : basis.path("actions")) {
          assertThat(
                  action.path("ledger").path("executionEvidence").path("observationHash").asText())
              .isNotEqualTo(hash);
        }
        ((ObjectNode) prepared).remove("observedChoice");
        removed = true;
      }
    }
    assertThat(removed).isTrue();
    assertThatThrownBy(() -> new GuidedBasisValidator(C).validate(basis))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("EVIDENCE_MISMATCH");
  }

  @Test
  void unusedMaterializedInputNeverBecomesFutureReplayRecipe() throws Exception {
    JsonNode vector = document().path("snapshotCorrection").path("positives").get(1);
    JsonNode basis = vector.path("basis"), before = basis.deepCopy();
    var candidate =
        new ObservedArtifactLowerer(C)
            .lower(basis, vector.path("expectedArtifact").path("profile"));
    assertThat(candidate.artifact().path("inputRecipes")).hasSize(2);
    assertThat(basis.path("materializationEvidence").path("entries")).hasSize(3);
    assertThat(candidate.artifact().path("inputRecipes").toString()).doesNotContain("input-config");
    assertThat(basis).isEqualTo(before);
  }

  @Test
  void oldBasisCannotDistinguishUnexecutedContextChange() throws Exception {
    JsonNode correction = document().path("snapshotCorrection");
    JsonNode counterexample = correction.path("underdeterminationCounterexample");
    JsonNode frozenBefore = counterexample.deepCopy();
    JsonNode oldBasis = counterexample.path("oldBasis");
    JsonNode identityA = counterexample.path("identityA"),
        identityB = counterexample.path("identityB");
    assertThat(counterexample.path("equalBeforeCorrection").asBoolean()).isTrue();
    assertThat(oldBasis.has("snapshotEvidence")).isFalse();

    // The sole identity difference is the frozen unused ContextText at step two.
    ObjectNode withoutHint = identityB.deepCopy();
    ((ObjectNode) withoutHint.path("authoring").path("steps").get(1))
        .set("context", identityA.path("authoring").path("steps").get(1).path("context"));
    assertThat(withoutHint).isEqualTo(identityA);
    assertThat(
            identityB
                .path("authoring")
                .path("steps")
                .get(1)
                .path("context")
                .path("entries")
                .get(0)
                .path("value")
                .asText())
        .isEqualTo("A distinct unused authored hint");

    JsonNode ordinary = correction.path("positives").get(0);
    assertThat(ordinary.path("name").asText()).isEqualTo("ordinary");
    JsonNode currentBasis = ordinary.path("basis"), currentBefore = currentBasis.deepCopy();
    JsonNode expectedPlan = ordinary.path("expectedArtifact").path("learnedPlan");
    // This current, complete control has its corrected manifest pin. The historical oldBasis
    // is supplied-preimage evidence only; it is never claimed to be publishable today.
    var control =
        new ObservedArtifactLowerer(C)
            .lower(currentBasis, ordinary.path("expectedArtifact").path("profile"));
    assertThat(control.artifact()).isEqualTo(ordinary.path("expectedArtifact"));
    for (String side : java.util.List.of("A", "B")) {
      JsonNode identity = counterexample.path("identity" + side);
      var source = IncrementalAuthoringIdentity.snapshot(identity);
      JsonNode maps =
          IncrementalAuthoringIdentity.snapshots(
              source.authoring(), source.identity(), oldBasis.path("configuration"), expectedPlan);
      assertThat(maps)
          .as("frozen supplied-preimage map %s", side)
          .isEqualTo(counterexample.path("snapshotMap" + side));

      ObjectNode corrected = currentBasis.deepCopy();
      ((ObjectNode) corrected.path("snapshotEvidence")).set("current", identity.deepCopy());
      ObjectNode sharedOldFacts = corrected.deepCopy();
      sharedOldFacts.remove("snapshotEvidence");
      // The frozen historical pin predates the correction. Do not relabel it as current validity.
      sharedOldFacts.set("sourceManifestHash", oldBasis.path("sourceManifestHash"));
      assertThat(sharedOldFacts)
          .as("same exact frozen old facts for identity %s", side)
          .isEqualTo(oldBasis);
      JsonNode correctedBefore = corrected.deepCopy();
      ObjectNode derivedPlan = expectedPlan.deepCopy();
      new GuidedSnapshotDeriver(C).apply(corrected, derivedPlan);
      assertThat(derivedPlan.path("stepSnapshotHashes"))
          .as("current derivation map %s", side)
          .isEqualTo(counterexample.path("snapshotMap" + side));
      assertThat(corrected).isEqualTo(correctedBefore);
    }
    for (int index = 0; index < identityA.path("authoring").path("steps").size(); index++) {
      String stepId = identityA.path("authoring").path("steps").get(index).path("id").asText();
      if (index == 0) {
        assertThat(counterexample.path("snapshotMapA").path(stepId))
            .isEqualTo(counterexample.path("snapshotMapB").path(stepId));
      } else {
        assertThat(counterexample.path("snapshotMapA").path(stepId))
            .isNotEqualTo(counterexample.path("snapshotMapB").path(stepId));
      }
    }
    assertThat(counterexample).isEqualTo(frozenBefore);
    assertThat(currentBasis).isEqualTo(currentBefore);
  }

  @ParameterizedTest(name = "normalized snapshot source refuses {0}")
  @org.junit.jupiter.params.provider.ValueSource(
      strings = {"numeric-captured-at", "lone-surrogate-context", "unsafe-evidence-revision"})
  void normalizedSnapshotSourceRejectsNumericTimeSurrogatesAndUnsafeRevision(String mutation)
      throws Exception {
    JsonNode correction = document().path("snapshotCorrection");
    JsonNode normalized = correction.path("normalization").path("identity");
    JsonNode normalizedBefore = normalized.deepCopy();
    C.validate("v3/authoring-snapshot#/definitions/AuthoringSnapshotIdentity", normalized);
    var source = IncrementalAuthoringIdentity.snapshot(normalized);
    assertThat(source.authoring().steps()).hasSize(3);
    assertThat(
            normalized
                .path("authoring")
                .path("steps")
                .get(1)
                .path("context")
                .path("evidenceReferences")
                .get(0)
                .path("capturedAt")
                .asText())
        .isEqualTo("2026-10-15T04:00:00.123456789Z");

    JsonNode ordinary = correction.path("positives").get(0);
    ObjectNode validBasis = ordinary.path("basis").deepCopy();
    ((ObjectNode) validBasis.path("snapshotEvidence")).set("current", normalized.deepCopy());
    ObjectNode validPlan = ordinary.path("expectedArtifact").path("learnedPlan").deepCopy();
    new GuidedSnapshotDeriver(C).apply(validBasis, validPlan);

    ObjectNode malformed = normalized.deepCopy();
    ObjectNode secondContext =
        (ObjectNode) malformed.path("authoring").path("steps").get(1).path("context");
    ObjectNode evidence = (ObjectNode) secondContext.path("evidenceReferences").get(0);
    switch (mutation) {
      case "numeric-captured-at" -> evidence.put("capturedAt", 1792036800L);
      case "lone-surrogate-context" ->
          ((ObjectNode)
                  malformed
                      .path("authoring")
                      .path("steps")
                      .get(2)
                      .path("context")
                      .path("entries")
                      .get(1))
              .put("value", "\uD800");
      case "unsafe-evidence-revision" -> evidence.put("revision", 9007199254740992L);
      default -> throw new IllegalArgumentException(mutation);
    }
    JsonNode malformedBefore = malformed.deepCopy();
    assertThatThrownBy(
            () ->
                C.validate(
                    "v3/authoring-snapshot#/definitions/AuthoringSnapshotIdentity", malformed))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(() -> IncrementalAuthoringIdentity.snapshot(malformed))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("INVALID_CONTRACT");
    ObjectNode invalidBasis = validBasis.deepCopy();
    ((ObjectNode) invalidBasis.path("snapshotEvidence")).set("current", malformed);
    ObjectNode unchangedPlan = validPlan.deepCopy();
    assertThatThrownBy(() -> new GuidedSnapshotDeriver(C).apply(invalidBasis, validPlan))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("INVALID_CONTRACT");
    assertThat(validPlan).isEqualTo(unchangedPlan);
    assertThat(malformed).isEqualTo(malformedBefore);
    assertThat(normalized).isEqualTo(normalizedBefore);
  }

  @Test
  void completeExtendedBasisFactsCommitTheOriginalSixFieldEvidenceEnvelope() throws Exception {
    JsonNode cases = document().path("incrementalContracts").path("basisCases");
    int total = 0;
    for (int parentIndex = 0; parentIndex < 3; parentIndex++) {
      JsonNode parent = cases.get(parentIndex), basis = parent.path("basis");
      JsonNode before = basis.deepCopy(), artifact = parent.path("expectedArtifact");
      assertThat(new ObservedArtifactLowerer(C).lower(basis, artifact.path("profile")).artifact())
          .as("complete lawful parent %s", parent.path("name").asText())
          .isEqualTo(artifact);
      var pointers = new java.util.ArrayList<String>();
      for (String root :
          java.util.List.of(
              "/snapshotEvidence/current",
              "/materializationEvidence/versions",
              "/materializationEvidence/entries")) {
        commitmentLeaves(basis.at(root), root, pointers);
      }
      if (!basis.path("incrementalEvidence").isNull()) {
        for (String field :
            java.util.List.of(
                "plan",
                "program",
                "switch",
                "prefixRequests",
                "driftReceipt",
                "firstSuffixAcceptance",
                "excludedAttempts")) {
          String root = "/incrementalEvidence/" + field;
          commitmentLeaves(basis.at(root), root, pointers);
        }
      }
      assertThat(pointers).doesNotHaveDuplicates();
      assertThat(pointers).hasSize(new int[] {79, 175, 284}[parentIndex]);
      ObjectNode originalEnvelope = expectedPublicationEvidencePreimage(basis);
      assertThat(GuidedContracts.hash(originalEnvelope))
          .isEqualTo(artifact.path("replayPolicy").path("publicationEvidenceHash").asText());
      for (String pointer : pointers) {
        ObjectNode changed = basis.deepCopy();
        replaceCommitmentLeaf(changed, pointer);
        JsonNode changedBefore = changed.deepCopy();
        assertThat(GuidedContracts.hash(changed))
            .as("whole basis %s %s", parent.path("name"), pointer)
            .isNotEqualTo(GuidedContracts.hash(basis));
        ObjectNode expectedEnvelope = expectedPublicationEvidencePreimage(changed);
        assertThat(expectedEnvelope).hasSize(6);
        assertThat(expectedEnvelope.path("version").asInt()).isEqualTo(1);
        assertThat(GuidedContracts.hash(expectedEnvelope))
            .as("six-field envelope %s", pointer)
            .isNotEqualTo(GuidedContracts.hash(originalEnvelope));
        // Projection commits supplied facts even when a mutation is semantically invalid.
        // It is deliberately NOT evidence of validation, DB authority or publishability.
        JsonNode projected =
            new ObservedReferencePolicyDeriver(C)
                .derive(changed, artifact.path("learnedPlan"), artifact.path("inputRecipes"));
        assertThat(projected.path("publicationEvidenceHash").asText())
            .as(pointer)
            .isEqualTo(GuidedContracts.hash(expectedEnvelope));
        // These roots do not alter the effective action tuple array, including excluded attempts.
        assertThat(projected.path("admissionProvenanceHash"))
            .isEqualTo(artifact.path("replayPolicy").path("admissionProvenanceHash"));
        assertThat(changed).isEqualTo(changedBefore);
      }
      assertThat(basis).isEqualTo(before);
      total += pointers.size();
    }
    assertThat(total).isEqualTo(538);
  }

  @ParameterizedTest(name = "recomputed commitment cannot bypass semantic join {0}")
  @org.junit.jupiter.params.provider.ValueSource(
      strings = {
        "materialization-version", "materialization-entry", "prefix-program", "relearn-switch",
        "prefix-request", "drift-receipt", "first-suffix-acceptance", "excluded-attempt"
      })
  void recomputedBasisAndEvidenceHashesCannotReplaceOriginalSemanticJoins(String mutation)
      throws Exception {
    JsonNode parent = document().path("incrementalContracts").path("basisCases").get(2);
    assertThat(parent.path("name").asText()).isEqualTo("admittedDrift");
    JsonNode basis = parent.path("basis"), before = basis.deepCopy();
    JsonNode artifact = parent.path("expectedArtifact");
    assertThat(new ObservedArtifactLowerer(C).lower(basis, artifact.path("profile")).artifact())
        .isEqualTo(artifact);
    ObjectNode changed = basis.deepCopy();
    switch (mutation) {
      case "materialization-version" ->
          ((ObjectNode) changed.at("/materializationEvidence/versions/0"))
              .put("authoredInputsHash", "f".repeat(64));
      case "materialization-entry" ->
          ((ObjectNode) changed.at("/materializationEvidence/entries/0"))
              .put("inputId", "foreign-input");
      case "prefix-program" ->
          ((ObjectNode) changed.at("/incrementalEvidence/program/actions/0"))
              .put("operationHash", "f".repeat(64));
      case "relearn-switch" ->
          ((ObjectNode) changed.at("/incrementalEvidence/switch"))
              .put("retainedPrefixAdmissionsHash", "f".repeat(64));
      case "prefix-request" ->
          ((ObjectNode) changed.at("/incrementalEvidence/prefixRequests/0"))
              .put("evidenceHash", "f".repeat(64));
      case "drift-receipt" ->
          ((ObjectNode) changed.at("/incrementalEvidence/driftReceipt"))
              .put("operationHash", "f".repeat(64));
      case "first-suffix-acceptance" ->
          ((ObjectNode) changed.at("/incrementalEvidence/firstSuffixAcceptance"))
              .put("planRevision", 3);
      case "excluded-attempt" ->
          ((ObjectNode) changed.at("/incrementalEvidence/excludedAttempts/0/action/ledger"))
              .put("operationHash", "f".repeat(64));
      default -> throw new IllegalArgumentException(mutation);
    }
    JsonNode changedBefore = changed.deepCopy();
    ObjectNode envelope = expectedPublicationEvidencePreimage(changed);
    JsonNode projection =
        new ObservedReferencePolicyDeriver(C)
            .derive(changed, artifact.path("learnedPlan"), artifact.path("inputRecipes"));
    assertThat(projection.path("publicationEvidenceHash").asText())
        .isEqualTo(GuidedContracts.hash(envelope))
        .isNotEqualTo(artifact.path("replayPolicy").path("publicationEvidenceHash").asText());
    assertThatThrownBy(
            () -> new ObservedArtifactLowerer(C).lower(changed, artifact.path("profile")))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("EVIDENCE_MISMATCH");
    assertThat(changed).isEqualTo(changedBefore);
    assertThat(basis).isEqualTo(before);
  }

  /** Exact six fields from PublicationEvidencePreimage; never derived from a returned policy. */
  private static ObjectNode expectedPublicationEvidencePreimage(JsonNode basis) {
    return C.object()
        .put("version", 1)
        .put("basisHash", GuidedContracts.hash(basis))
        .put("runAuthorizationHash", GuidedContracts.hash(basis.path("runAuthorization")))
        .put("translationHash", basis.path("translationHash").asText())
        .put("bootstrapHash", GuidedContracts.hash(basis.path("bootstrap")))
        .put("sourceManifestHash", basis.path("sourceManifestHash").asText());
  }

  private static void commitmentLeaves(JsonNode value, String pointer, java.util.List<String> out) {
    assertThat(value.isMissingNode()).as(pointer).isFalse();
    if (value.isObject() && !value.isEmpty()) {
      value
          .fields()
          .forEachRemaining(
              entry ->
                  commitmentLeaves(
                      entry.getValue(),
                      pointer + "/" + entry.getKey().replace("~", "~0").replace("/", "~1"),
                      out));
    } else if (value.isArray() && !value.isEmpty()) {
      for (int index = 0; index < value.size(); index++) {
        commitmentLeaves(value.get(index), pointer + "/" + index, out);
      }
    } else {
      out.add(pointer);
    }
  }

  private static void replaceCommitmentLeaf(ObjectNode basis, String pointer) {
    JsonNode value = basis.at(pointer), replacement;
    if (value.isTextual()) {
      String text = value.asText();
      replacement =
          C.object()
              .textNode(
                  text.isEmpty()
                      ? "changed"
                      : (text.charAt(0) == 'a' ? "b" : "a") + text.substring(1));
    } else if (value.isIntegralNumber()) {
      replacement = C.object().numberNode(value.longValue() + 1);
    } else if (value.isBoolean()) {
      replacement = C.object().booleanNode(!value.asBoolean());
    } else if (value.isNull()) {
      replacement = C.object().textNode("changed-null");
    } else {
      // Empty required containers and constants are shape-negative commitment subjects only.
      replacement = C.object().nullNode();
    }
    int slash = pointer.lastIndexOf('/');
    JsonNode parent = basis.at(pointer.substring(0, slash));
    String key = pointer.substring(slash + 1).replace("~1", "/").replace("~0", "~");
    if (parent.isArray()) {
      ((com.fasterxml.jackson.databind.node.ArrayNode) parent)
          .set(Integer.parseInt(key), replacement);
    } else {
      ((ObjectNode) parent).set(key, replacement);
    }
  }

  static Stream<Vector> fullyResealedCandidateAttacks() throws Exception {
    Set<String> graph =
        Set.of(
            "candidate-policy-cannot-omit-successful-transfer",
            "candidate-policy-binding-cannot-drop-successful-consumer",
            "publication-preimage-must-commit-raw-failed-edge",
            "publication-preimage-envelope-cannot-change",
            "admission-preimage-must-exclude-spent-attempt",
            "admission-preimage-is-array-not-wrapper",
            "candidate-authorization-preimage-is-exact",
            "candidate-source-identity-cannot-be-substituted");
    return Stream.concat(
        candidateSnapshotNegatives(),
        vectors("graphTimingConformance", "graphCases")
            .filter(v -> graph.contains(v.document().path("name").asText())));
  }

  @ParameterizedTest(name = "fully resealed offered candidate {0}")
  @MethodSource("fullyResealedCandidateAttacks")
  void actualWriterRefusesFullyResealedSemanticCandidateAfterCompleteParent(Vector vector)
      throws Exception {
    JsonNode basis = vector.document().path("basis"), basisBefore = basis.deepCopy();
    JsonNode offered = vector.document().path("expectedArtifact"),
        offeredBefore = offered.deepCopy();
    JsonNode parent = null;
    for (String section : java.util.List.of("snapshotCorrection", "graphTimingConformance")) {
      String field = section.equals("snapshotCorrection") ? "positives" : "graphCases";
      for (JsonNode row : document().path(section).path(field)) {
        if (row.path("basis").equals(basis)
            && (!row.has("expected") || row.path("expected").asText().equals("ACCEPT"))) {
          parent = row;
        }
      }
    }
    assertThat(parent).as("complete independent parent %s", vector.name()).isNotNull();
    var accepted =
        new ObservedArtifactLowerer(C)
            .lower(basis, parent.path("expectedArtifact").path("profile"));
    assertThat(accepted.artifact()).isEqualTo(parent.path("expectedArtifact"));
    var jdbc = org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class);
    var writer = new GuidedPublicationRepository(jdbc, C);
    var snapshot = candidateSnapshot(basis, accepted);
    writer.verifyCandidate(snapshot, accepted, accepted.hashes());
    var malicious = fullyResealedCandidate(basis, offered, accepted);
    assertThat(malicious.artifact().path("learnedPlanHash").asText())
        .isEqualTo(GuidedContracts.hash(malicious.learnedPlan()));
    assertThat(malicious.policy().path("learnedPlanHash"))
        .isEqualTo(malicious.artifact().path("learnedPlanHash"));
    assertThat(malicious.hashes().path("referencePolicyHash").asText())
        .isEqualTo(GuidedContracts.hash(malicious.policy()));
    assertThat(malicious.hashes().path("artifactHash").asText())
        .isEqualTo(GuidedContracts.hash(malicious.artifact()));
    var attackSnapshot = candidateSnapshot(basis, malicious);
    assertCandidateSnapshotClaims(attackSnapshot, basis, malicious);
    assertThatThrownBy(() -> writer.verifyCandidate(attackSnapshot, malicious, malicious.hashes()))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("EVIDENCE_MISMATCH");
    assertThat(basis).isEqualTo(basisBefore);
    assertThat(offered).isEqualTo(offeredBefore);
    org.mockito.Mockito.verifyNoInteractions(jdbc);
  }

  @ParameterizedTest(name = "current prefix and illegal reuse at drift j, parent {0}")
  @org.junit.jupiter.params.provider.ValueSource(ints = {2, 3})
  void driftJReconstructsCurrentPrefixButNeverGrantsReuseAtTheDriftStep(int parentIndex)
      throws Exception {
    JsonNode parent = document().path("incrementalContracts").path("basisCases").get(parentIndex);
    JsonNode basis = parent.path("basis"), before = basis.deepCopy();
    JsonNode expected = parent.path("expectedArtifact"),
        expectedPlan = expected.path("learnedPlan");
    JsonNode transition = basis.at("/incrementalEvidence/switch");
    int j = transition.path("effectiveFirstLearnIndex").asInt();
    assertThat(j).isEqualTo(1);
    assertThat(basis.at("/incrementalEvidence/plan/initialFirstLearnIndex").asInt()).isEqualTo(2);
    String driftId = basis.path("sourceSteps").get(j).path("stepId").asText();
    String prefixId = basis.path("sourceSteps").get(0).path("stepId").asText();
    JsonNode pin = basis.at("/snapshotEvidence/pinnedBase");
    ObjectNode reconstructed = expectedPlan.deepCopy();
    reconstructed.remove(java.util.List.of("stepSnapshotHashes", "reusedFrom", "incremental"));
    new GuidedSnapshotDeriver(C).apply(basis, reconstructed);
    assertThat(reconstructed).isEqualTo(expectedPlan);
    assertThat(reconstructed.path("reusedFrom")).hasSize(j);
    assertThat(reconstructed.path("reusedFrom").has(driftId)).isFalse();
    assertThat(reconstructed.at("/incremental/retainedPrefixAdmissionIds"))
        .isEqualTo(transition.path("retainedPrefixAdmissionIds"));
    // Exact equal semantics at j still grant no whole-step reuse after a drift there.
    assertThat(reconstructed.path("stepSnapshotHashes").path(driftId))
        .isEqualTo(
            basis.at("/snapshotEvidence/baseProof/revision/stepSnapshotHashes").path(driftId));
    var accepted = new ObservedArtifactLowerer(C).lower(basis, expected.path("profile"));
    assertThat(accepted.artifact()).isEqualTo(expected);
    var jdbc = org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class);
    var writer = new GuidedPublicationRepository(jdbc, C);
    var snapshot = candidateSnapshot(basis, accepted);
    writer.verifyCandidate(snapshot, accepted, accepted.hashes());
    for (String mutation :
        java.util.List.of("reuse-at-j", "gap-before-j", "forged-current-prefix-map")) {
      ObjectNode offered = expected.deepCopy();
      ObjectNode plan = (ObjectNode) offered.path("learnedPlan");
      switch (mutation) {
        case "reuse-at-j" ->
            ((ObjectNode) plan.path("reusedFrom"))
                .putObject(driftId)
                .put("revisionId", pin.path("revisionId").asText())
                .put("stepId", driftId);
        case "gap-before-j" -> ((ObjectNode) plan.path("reusedFrom")).remove(prefixId);
        case "forged-current-prefix-map" ->
            ((ObjectNode) plan.path("stepSnapshotHashes")).put(prefixId, "f".repeat(64));
        default -> throw new IllegalArgumentException(mutation);
      }
      var malicious = fullyResealedCandidate(basis, offered, accepted);
      var attackSnapshot = candidateSnapshot(basis, malicious);
      assertCandidateSnapshotClaims(attackSnapshot, basis, malicious);
      assertThatThrownBy(
              () -> writer.verifyCandidate(attackSnapshot, malicious, malicious.hashes()))
          .as(mutation)
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage("EVIDENCE_MISMATCH");
    }
    assertThat(basis).isEqualTo(before);
    org.mockito.Mockito.verifyNoInteractions(jdbc);
  }

  private static PublicationContracts.Snapshot candidateSnapshot(
      JsonNode basis, PublicationContracts.Candidate accepted) {
    ObjectNode identity = C.object().put("basisHash", GuidedContracts.hash(basis));
    ObjectNode base = identity.putObject("base");
    for (String field :
        java.util.List.of(
            "sourceHash", "configurationHash", "authoringHash", "runAuthorizationHash")) {
      base.set(field, accepted.hashes().path(field));
    }
    for (String field :
        java.util.List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      identity.set(field, accepted.hashes().path(field));
    }
    return new PublicationContracts.Snapshot(identity, basis);
  }

  /** Attack claims agree with the offer, isolating the writer's independent semantic comparison. */
  private static void assertCandidateSnapshotClaims(
      PublicationContracts.Snapshot snapshot,
      JsonNode basis,
      PublicationContracts.Candidate candidate) {
    assertThat(snapshot.basis()).isEqualTo(basis);
    assertThat(snapshot.identity().path("basisHash").asText())
        .isEqualTo(GuidedContracts.hash(basis));
    for (String field :
        java.util.List.of(
            "sourceHash", "configurationHash", "authoringHash", "runAuthorizationHash")) {
      assertThat(snapshot.identity().path("base").path(field))
          .as("attack base %s", field)
          .isEqualTo(candidate.hashes().path(field));
    }
    for (String field :
        java.util.List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      assertThat(snapshot.identity().path(field))
          .as("attack snapshot %s", field)
          .isEqualTo(candidate.hashes().path(field));
    }
  }

  /** Reseal every dependent candidate claim, retaining each original malicious semantic fact. */
  private static PublicationContracts.Candidate fullyResealedCandidate(
      JsonNode basis, JsonNode offered, PublicationContracts.Candidate accepted) {
    ObjectNode artifact = offered.deepCopy(), plan = (ObjectNode) artifact.path("learnedPlan");
    ObjectNode policy = (ObjectNode) artifact.path("replayPolicy");
    artifact.put("learnedPlanHash", GuidedContracts.hash(plan));
    policy.put("learnedPlanHash", GuidedContracts.hash(plan));
    ObjectNode hashes = accepted.hashes().deepCopy();
    for (String field : java.util.List.of("sourceHash", "configurationHash", "authoringHash")) {
      hashes.set(field, artifact.path(field));
    }
    hashes
        .put("learnedPlanHash", GuidedContracts.hash(plan))
        .put("artifactHash", GuidedContracts.hash(artifact))
        .put("referencePolicyHash", GuidedContracts.hash(policy))
        .put("profileHash", GuidedContracts.hash(artifact.path("profile")));
    ObjectNode equivalence = C.object();
    var operations = equivalence.putArray("operations");
    for (JsonNode step : artifact.path("steps")) {
      step.path("operations").forEach(operations::add);
    }
    for (String field : java.util.List.of("guards", "inputRecipes")) {
      equivalence.set(field, artifact.path(field));
    }
    for (String field : java.util.List.of("bindings", "transfers")) {
      equivalence.set(field, policy.path(field));
    }
    hashes.put("operationEquivalenceHash", GuidedContracts.hash(equivalence));
    for (String field :
        java.util.List.of(
            "admissionProvenanceHash", "publicationEvidenceHash", "runAuthorizationHash")) {
      hashes.set(field, policy.path(field));
    }
    ObjectNode revision = C.object().put("version", 1);
    for (String field :
        java.util.List.of("testId", "csiId", "sourceRevision", "configurationRevision")) {
      revision.set(field, basis.path(field));
    }
    hashes
        .fields()
        .forEachRemaining(
            entry -> {
              if (!entry.getKey().equals("revisionDigest")) {
                revision.set(entry.getKey(), entry.getValue());
              }
            });
    hashes.put("revisionDigest", GuidedContracts.hash(revision));
    return new PublicationContracts.Candidate(plan, artifact, policy, hashes);
  }

  @Test
  void rawAllocationCommitmentCannotBeReplacedByItsEffectiveProjection() throws Exception {
    JsonNode vector = document().path("graphTimingConformance").path("graphCases").get(0);
    ObjectNode basis = vector.path("basis").deepCopy();
    JsonNode raw = basis.path("allocations").deepCopy();
    var projection = new GuidedEffectiveGraph(C).project(basis);
    assertThat(basis.path("allocations")).isEqualTo(raw);
    assertThat(projection.allocations()).isNotEqualTo(raw);
    assertThat(GuidedContracts.hash(raw))
        .isEqualTo(basis.path("bootstrap").path("allocationHash").asText());
    ((ObjectNode) basis.path("bootstrap"))
        .put("allocationHash", GuidedContracts.hash(projection.allocations()));
    assertThatThrownBy(
            () ->
                new ObservedArtifactLowerer(C)
                    .lower(basis, vector.path("expectedArtifact").path("profile")))
        .isInstanceOf(GuidedSessionException.class);
  }
}
