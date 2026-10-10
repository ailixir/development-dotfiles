package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.C;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.array;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.at;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.canonical;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.choiceFixture;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.copy;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.fixture;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.hash;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.object;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

/** Independent RUNNER fixture artifact/hash vectors are the expected results, never Java output. */
class ObservedArtifactLowererTest {
  @ParameterizedTest
  @ValueSource(strings = {"fresh-order-reference", "control-value-reference"})
  void reproducesIndependentNodeArtifactAndEveryCanonicalHash(String name) throws Exception {
    var original = fixture(name);
    var candidate =
        new ObservedArtifactLowerer(C)
            .lower(original.path("basis"), original.path("artifact").path("profile"));
    assertThat(candidate.artifact()).isEqualTo(original.path("artifact"));
    assertThat(candidate.learnedPlan()).isEqualTo(original.path("artifact").path("learnedPlan"));
    assertThat(candidate.policy()).isEqualTo(original.path("artifact").path("replayPolicy"));
    for (var fields = original.path("hashes").fields(); fields.hasNext(); ) {
      var entry = fields.next();
      assertThat(candidate.hashes().path(entry.getKey()))
          .as(entry.getKey())
          .isEqualTo(entry.getValue());
    }
    assertThat(hash(candidate.artifact()))
        .isEqualTo(original.path("hashes").path("artifactHash").asText());
    assertThat(candidate.artifact().path("guards").get(0).path("target"))
        .isEqualTo(C.parse("{\"kind\":\"initialBlank\"}"));
    assertThat(
            candidate
                .artifact()
                .path("steps")
                .get(1)
                .path("operations")
                .get(0)
                .path("operation")
                .path("kind")
                .asText())
        .isEqualTo("read");
    assertThat(
            candidate
                .artifact()
                .path("steps")
                .get(2)
                .path("operations")
                .get(0)
                .path("operation")
                .path("value")
                .path("kind")
                .asText())
        .isEqualTo("binding");
  }

  @Test
  void reproducesIndependentCanonicalUnicodeAndNumericVectors() throws Exception {
    var vectors =
        C.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v2/publication-canonical-vectors.json")));
    for (JsonNode vector : vectors.path("positive")) {
      assertThat(
              HexFormat.of()
                  .formatHex(
                      GuidedContracts.canonical(vector.path("input"))
                          .getBytes(StandardCharsets.UTF_8)))
          .as(vector.path("name").asText())
          .isEqualTo(vector.path("canonicalUtf8Hex").asText());
      assertThat(GuidedContracts.hash(vector.path("input")))
          .as(vector.path("name").asText())
          .isEqualTo(vector.path("sha256").asText());
      assertThat(hash(vector.path("input"))).isEqualTo(vector.path("sha256").asText());
    }
  }

  @Test
  void recipeBoundariesAndAuthoritativePlacementAreNotSilentlyNormalized() throws Exception {
    var original = fixture("fresh-order-reference").path("basis");
    var lowerer = new ObservedArtifactLowerer(C);
    var split = copy(original);
    var label = at(split, "inputs", 1);
    String source = split.path("sourceSteps").get(2).path("source").asText();
    int middle = source.indexOf("🧪") + 1;
    object(label, "provenance").put("startUtf16", middle).put("endUtf16", middle + 1);
    assertThatThrownBy(() -> lowerer.recipes(split)).isInstanceOf(GuidedSessionException.class);
    var duplicate = copy(original);
    array(duplicate, "inputs").add(duplicate.path("inputs").get(0).deepCopy());
    assertThatThrownBy(() -> lowerer.recipes(duplicate)).isInstanceOf(GuidedSessionException.class);
    var sameMeaning = copy(original);
    var extra = copy(sameMeaning.path("inputs").get(0)).put("inputId", "invented-input");
    array(sameMeaning, "inputs").add(extra);
    assertThatThrownBy(() -> lowerer.recipes(sameMeaning))
        .isInstanceOf(GuidedSessionException.class);
    var wrongStep = copy(original);
    object(at(wrongStep, "inputs", 0), "provenance")
        .put("stepId", wrongStep.path("sourceSteps").get(1).path("stepId").asText());
    assertThatThrownBy(() -> lowerer.recipes(wrongStep)).isInstanceOf(GuidedSessionException.class);
    var wrongSlot = copy(original);
    object(at(wrongSlot, "inputs", 1), "provenance").put("intendedSlot", "assert.expected");
    assertThatThrownBy(() -> lowerer.recipes(wrongSlot)).isInstanceOf(GuidedSessionException.class);
    var wrongConfig = copy(original);
    at(wrongConfig, "configurationReferences", 0).put("referenceId", "different-saved-reference");
    assertThatThrownBy(() -> lowerer.recipes(wrongConfig))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void policyUsesOriginalAdmissionTupleHashAndSeparateEvidenceBundle() throws Exception {
    var original = fixture("fresh-order-reference");
    var basis = original.path("basis");
    var policy =
        new ObservedReferencePolicyDeriver(C)
            .derive(
                basis,
                original.path("artifact").path("learnedPlan"),
                original.path("artifact").path("inputRecipes"));
    assertThat(policy).isEqualTo(original.path("artifact").path("replayPolicy"));
    var tuples = C.object().putArray("items");
    for (JsonNode fact : basis.path("actions")) {
      var tuple = C.object();
      for (String key : List.of("coordinate", "admission", "operationHash", "scopeHash")) {
        tuple.set(key, fact.path("ledger").path(key));
      }
      tuples.add(tuple);
    }
    assertThat(policy.path("admissionProvenanceHash").asText()).isEqualTo(hash(tuples));
    assertThat(policy.path("publicationEvidenceHash"))
        .isNotEqualTo(policy.path("admissionProvenanceHash"));
    var changed = copy(basis);
    object(changed, "learningProvenance").put("outputContractHash", "f".repeat(64));
    var next =
        new ObservedReferencePolicyDeriver(C)
            .derive(
                changed,
                original.path("artifact").path("learnedPlan"),
                original.path("artifact").path("inputRecipes"));
    assertThat(next.path("admissionProvenanceHash"))
        .isEqualTo(policy.path("admissionProvenanceHash"));
    assertThat(next.path("publicationEvidenceHash"))
        .isNotEqualTo(policy.path("publicationEvidenceHash"));
  }

  @Test
  void defensiveCandidateCannotBeChangedThroughCallerJson() throws Exception {
    var fixture = fixture("fresh-order-reference");
    var candidate =
        new ObservedArtifactLowerer(C)
            .lower(fixture.path("basis"), fixture.path("artifact").path("profile"));
    var before = candidate.artifact();
    object(candidate.artifact(), "replayPolicy").put("learnedPlanHash", "f".repeat(64));
    assertThat(candidate.artifact()).isEqualTo(before);
    var binding = candidate.artifact().path("replayPolicy").path("bindings").get(0);
    assertThat(binding.has("value")).isFalse();
    assertThat(binding.path("producer").path("ordinal").asInt()).isZero();
  }

  @Test
  void reproducesIndependentPythonObservedChoiceArtifactAndAllHashes() throws Exception {
    var independent = choiceFixture();
    var original = new GuidedPlanBuilderTest.Original(independent.path("basis"));
    var reconstructed = original.build();
    assertThat(reconstructed).isEqualTo(original.expected);
    assertThat(reconstructed.path("sourceManifestHash"))
        .isNotEqualTo(independent.path("basis").path("sourceManifestHash"));
    // Golden fixture carries an explicitly opaque standalone manifest projection, not
    // the full source body constructed by Original. Its unchanged pure oracle stays separate.
    var candidate =
        new ObservedArtifactLowerer(C)
            .lower(independent.path("basis"), independent.path("artifact").path("profile"));
    assertThat(candidate.artifact()).isEqualTo(independent.path("artifact"));
    assertThat(candidate.policy()).isEqualTo(independent.path("artifact").path("replayPolicy"));
    assertThat(candidate.learnedPlan()).isEqualTo(independent.path("artifact").path("learnedPlan"));
    for (var fields = independent.path("hashes").fields(); fields.hasNext(); ) {
      var entry = fields.next();
      assertThat(candidate.hashes().path(entry.getKey()))
          .as(entry.getKey())
          .isEqualTo(entry.getValue());
    }
    assertThat(hash(candidate.artifact()))
        .isEqualTo("b46c947e135be6a3ae51240a1bfcd02febad64314a30b572f8c171419740c447");
    assertThat(
            candidate
                .artifact()
                .path("guards")
                .get(3)
                .path("target")
                .path("locator")
                .path("value")
                .asText())
        .isEqualTo("backup-label-é");
    assertThat(
            reconstructed
                .path("translationPlan")
                .path("obligations")
                .get(3)
                .path("targetIntent")
                .asText())
        .isEqualTo("label-input");
  }

  @Test
  void compiledNodeIndependentlyValidatesChoiceAgainstCurrentPackagedBuild() throws Exception {
    var independent = choiceFixture();
    var original = new GuidedPlanBuilderTest.Original(independent.path("basis"));
    assertThat(original.build()).isEqualTo(original.expected);
    var candidate =
        new ObservedArtifactLowerer(C)
            .lower(independent.path("basis"), independent.path("artifact").path("profile"));
    var node = compiledNode(independent.path("basis"), candidate.artifact(), false);
    assertThat(node.path("artifact")).isEqualTo(independent.path("artifact"));
    assertThat(node.path("hashes")).isEqualTo(independent.path("hashes"));
    assertThat(node.path("verdict").path("ok").asBoolean()).isTrue();
    assertThat(node.path("build").path("schemaBundleHash"))
        .isEqualTo(node.path("recordedSchemaBundleHash"));
    assertThat(node.path("build").path("referenceBundleHash"))
        .isEqualTo(node.path("recordedReferenceBundleHash"));
    assertThat(node.path("build").path("profileHash").asText())
        .isEqualTo(hash(candidate.artifact().path("profile")));
    assertThat(
            compiledNode(independent.path("basis"), candidate.artifact(), true)
                .path("refusal")
                .asText())
        .isEqualTo("PROFILE_MISMATCH");
    var reconstructed =
        new ObservedArtifactLowerer(C)
            .lower(original.build(), independent.path("artifact").path("profile"));
    assertExecutableSemanticsEqual(reconstructed, candidate);
    var changed = new java.util.ArrayList<String>();
    reconstructed
        .hashes()
        .fields()
        .forEachRemaining(
            entry -> {
              if (!entry.getValue().equals(candidate.hashes().path(entry.getKey()))) {
                changed.add(entry.getKey());
              }
            });
    assertThat(changed)
        .containsExactlyInAnyOrder(
            "publicationEvidenceHash", "referencePolicyHash", "artifactHash", "revisionDigest");
    var reconstructedNode = compiledNode(original.build(), reconstructed.artifact(), false);
    assertThat(reconstructedNode.path("verdict").path("ok").asBoolean()).isTrue();
    assertThat(reconstructedNode.path("artifact")).isEqualTo(reconstructed.artifact());
    reconstructedNode
        .path("hashes")
        .fields()
        .forEachRemaining(
            entry ->
                assertThat(reconstructed.hashes().path(entry.getKey()))
                    .as(entry.getKey())
                    .isEqualTo(entry.getValue()));
    // Current packaged tuple is built from actual compiled records, never an old fixture build.
    // Image digest is explicitly synthetic; this pure test does not grant deployment authority.
  }

  static ObjectNode compiledNode(JsonNode basis, JsonNode artifact, boolean unsupportedBuild)
      throws Exception {
    String script =
        String.join(
            "\n",
            "import {readFileSync} from 'node:fs';",
            "import {deriveObservedArtifact,validateObservedRequest} from"
                + " './dist/validator/observedReplay.js';",
            "import {OBSERVED_PROFILE,OBSERVED_SCHEMA_BUNDLE_HASH,hashObserved}",
            "from './dist/validator/observedReferencePolicy.js';",
            "let input='';for await(const chunk of process.stdin)input+=chunk;",
            "const data=JSON.parse(input);",
            "const runtime=JSON.parse(readFileSync('./dist/runtime-versions.json','utf8'));",
            "const references=JSON.parse(readFileSync('./dist/observed-reference.json','utf8'));",
            "const build={profileHash:hashObserved(OBSERVED_PROFILE),",
            "schemaBundleHash:runtime.observedSchemaBundleHash,",
            "referenceBundleHash:runtime.observedReferenceBundleHash,executableImageDigest:'c'.repeat(64),",
            "chromiumBuild:runtime.observedChromiumBuild};",
            "if(build.schemaBundleHash!==OBSERVED_SCHEMA_BUNDLE_HASH||",
            "build.referenceBundleHash!==hashObserved(references))",
            "throw Error('packaged build records differ');",
            "const request={schemaVersion:2,attemptId:'00000000-0000-4000-8000-000000000900',",
            "claimId:'00000000-0000-4000-8000-000000000901',",
            "snapshotHash:'d'.repeat(64),basisHash:hashObserved(data.basis),",
            "requiredProfile:OBSERVED_PROFILE,requiredBuild:{...build},",
            "artifact:data.artifact,validationBasis:data.basis};",
            "if(data.unsupportedBuild)request.requiredBuild.schemaBundleHash='0'.repeat(64);",
            "try{const"
                + " verdict=validateObservedRequest(request,build),derived=deriveObservedArtifact(data.basis);",
            "process.stdout.write(JSON.stringify({...derived,verdict,build,",
            "recordedSchemaBundleHash:runtime.observedSchemaBundleHash,",
            "recordedReferenceBundleHash:runtime.observedReferenceBundleHash}));",
            "}catch(e){process.stdout.write(JSON.stringify({refusal:e.code??e.message}));}");
    var input = C.object().put("unsupportedBuild", unsupportedBuild);
    input.set("basis", basis);
    input.set("artifact", artifact);
    Process process =
        new ProcessBuilder("node", "--input-type=module", "-e", script)
            .directory(Path.of("../studio-runner").toFile())
            .start();
    var stdout =
        new java.util.concurrent.FutureTask<byte[]>(() -> process.getInputStream().readAllBytes());
    var errors =
        new java.util.concurrent.FutureTask<byte[]>(() -> process.getErrorStream().readAllBytes());
    Thread.ofVirtual().start(stdout);
    Thread.ofVirtual().start(errors);
    try {
      try (var stdin = process.getOutputStream()) {
        stdin.write(input.toString().getBytes(StandardCharsets.UTF_8));
      }
      assertThat(process.waitFor(Duration.ofSeconds(20).toMillis(), TimeUnit.MILLISECONDS))
          .as("bounded actual packaged Node validator completion")
          .isTrue();
      String stderr = new String(errors.get(1, TimeUnit.SECONDS), StandardCharsets.UTF_8);
      assertThat(process.exitValue()).as(stderr).isZero();
      return (ObjectNode)
          C.parse(new String(stdout.get(1, TimeUnit.SECONDS), StandardCharsets.UTF_8));
    } finally {
      if (process.isAlive()) {
        process.destroyForcibly();
      }
      stdout.cancel(true);
      errors.cancel(true);
    }
  }

  @Test
  void choiceCanonicalHashesPreserveUnicodeAndOriginalInstantWithoutNormalization()
      throws Exception {
    var f = new GuidedPlanBuilderTest.Original(choiceFixture().path("basis"));
    assertThat(f.build()).isEqualTo(f.expected);
    var witness = f.witness();
    var receipt = witness.path("receipt");
    assertThat(receipt.path("contextIdentityHash").asText())
        .isEqualTo(hash(witness.path("context")));
    assertThat(receipt.path("meaningsHash").asText()).isEqualTo(hash(witness.path("meanings")));
    assertThat(receipt.path("questionCaptureHash").asText())
        .isEqualTo(hash(witness.path("context").path("questionCapture")));
    assertThat(receipt.path("answer").path("resolvedAt").asText())
        .isEqualTo("2026-10-08T03:00:05.123456789Z");
    ObjectNode reordered = C.object();
    var names = new java.util.ArrayList<String>();
    witness.fieldNames().forEachRemaining(names::add);
    java.util.Collections.reverse(names);
    names.forEach(name -> reordered.set(name, witness.path(name).deepCopy()));
    assertThat(hash(reordered)).isEqualTo(hash(witness));
    assertThat(GuidedContracts.hash(reordered)).isEqualTo(hash(witness));
    ObjectNode explicitNull = copy(f.raw.path("preparations").get(0)).putNull("observedChoice");
    assertThat(hash(explicitNull)).isNotEqualTo(hash(f.raw.path("preparations").get(0)));
  }

  @Test
  void originalZeroAndSourceOnlyProofsOmitChoiceAndKeepReferenceBytes() throws Exception {
    var zero = fixture("fresh-order-reference");
    var original = new GuidedPlanBuilderTest.Original(zero.path("basis"));
    assertThat(original.build()).isEqualTo(original.expected);
    for (JsonNode preparation : original.build().path("preparations")) {
      assertThat(preparation.has("observedChoice")).isFalse();
    }
    var candidate =
        new ObservedArtifactLowerer(C)
            .lower(zero.path("basis"), zero.path("artifact").path("profile"));
    assertThat(candidate.artifact()).isEqualTo(zero.path("artifact"));
    assertThat(hash(candidate.artifact()))
        .isEqualTo(zero.path("hashes").path("artifactHash").asText());
    var reconstructed =
        new ObservedArtifactLowerer(C)
            .lower(original.build(), zero.path("artifact").path("profile"));
    assertExecutableSemanticsEqual(reconstructed, candidate);
    // Existing source-selection semantics use this original evidence and require no observed
    // witness.
    var selections = original.raw.putArray("sourceSelections");
    var selection = selections.addObject();
    selection
        .putObject("need")
        .put(
            "stepId",
            original.raw.path("translationPlan").path("obligations").get(3).path("stepId").asText())
        .put("occurrence", 1)
        .put("operationKind", "fill")
        .put("argumentSlot", "fill.value");
    selection.set(
        "reference",
        original.raw.path("translationPlan").path("sourceReferences").get(1).deepCopy());
    ObjectNode sourceOnly = original.build();
    for (JsonNode preparation : sourceOnly.path("preparations")) {
      assertThat(preparation.has("observedChoice")).isFalse();
    }
    // Source evidence has its own basis hash; executable operations/profile stay byte-identical.
    var sourceCandidate =
        new ObservedArtifactLowerer(C).lower(sourceOnly, zero.path("artifact").path("profile"));
    assertThat(sourceCandidate.learnedPlan()).isEqualTo(candidate.learnedPlan());
    assertThat(sourceCandidate.artifact().path("steps"))
        .isEqualTo(candidate.artifact().path("steps"));
    assertThat(sourceCandidate.artifact().path("profile"))
        .isEqualTo(candidate.artifact().path("profile"));
  }

  @Test
  void independentUtf8LimitsDoNotBorrowTheLargerTransportAllowance() {
    // Isolated size utility probes only: padding documents are not publication evidence.
    for (int limit :
        List.of(
            16384,
            262144,
            PublicationContracts.MAX_BASIS_BYTES,
            PublicationContracts.MAX_VALIDATION_BYTES)) {
      ObjectNode exact = C.object().put("padding", "é".repeat((limit - 14) / 2));
      int remaining = limit - canonical(exact).getBytes(StandardCharsets.UTF_8).length;
      exact.put("padding", exact.path("padding").asText() + "a".repeat(remaining));
      assertThat(canonical(exact).getBytes(StandardCharsets.UTF_8).length).isEqualTo(limit);
      assertThat(PublicationContracts.bounded(exact, limit)).isEqualTo(exact);
      ObjectNode oversized = exact.deepCopy().put("padding", exact.path("padding").asText() + "a");
      assertThatThrownBy(() -> PublicationContracts.bounded(oversized, limit))
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage("BUDGET_EXCEEDED");
      if (limit == PublicationContracts.MAX_BASIS_BYTES) {
        assertThat(
                PublicationContracts.bounded(oversized, PublicationContracts.MAX_VALIDATION_BYTES))
            .isEqualTo(oversized);
      }
    }
  }

  static java.util.stream.Stream<GuidedPlanBuilderTest.Mutation> pairedChoiceMutations() {
    return GuidedPlanBuilderTest.brokenChoiceJoins()
        .filter(
            m ->
                List.of(
                        "missing prospective choice witness",
                        "coherently resealed singleton original question",
                        "provider meanings order changed",
                        "exact locator kind differs with same text",
                        "answer after expiry by one nanosecond",
                        "original question plan changed meaning despite resealing",
                        "old duplicate locator on hidden unrelated node",
                        "fresh duplicate locator on hidden unrelated node",
                        "old generation equals fresh preparation with coherent snapshot",
                        "missing original question observation",
                        "coherent changed operation",
                        "coherent alternative authored input",
                        "meaning cannot replace authored argument with binding",
                        "unapproved original question origin coherently resealed")
                    .contains(m.name()));
  }

  @ParameterizedTest(name = "independent Java/Node original proof: {0}")
  @MethodSource("pairedChoiceMutations")
  void bothIndependentValidatorsRejectTheSameCoherentProofMutation(
      GuidedPlanBuilderTest.Mutation mutation) throws Exception {
    var independent = choiceFixture();
    var f = new GuidedPlanBuilderTest.Original(independent.path("basis"));
    assertThat(f.build()).isEqualTo(f.expected);
    var baseline =
        new ObservedArtifactLowerer(C)
            .lower(f.build(), independent.path("artifact").path("profile"));
    assertThat(
            compiledNode(f.suppliedBasis(), baseline.artifact(), false)
                .path("verdict")
                .path("ok")
                .asBoolean())
        .isTrue();
    mutation.change().accept(f);
    assertThatThrownBy(f::build).isInstanceOf(GuidedSessionException.class);
    var node = compiledNode(f.suppliedBasis(), baseline.artifact(), false);
    assertThat(node.has("refusal"))
        .as("coherent proof must fail before artifact comparison: %s", mutation.name())
        .isTrue();
  }

  @Test
  void providerAuditLabelsAndIdsNeverBecomeExecutableSelectors() throws Exception {
    var independent = choiceFixture();
    var f = new GuidedPlanBuilderTest.Original(independent.path("basis"));
    assertThat(f.build()).isEqualTo(f.expected);
    var before =
        new ObservedArtifactLowerer(C)
            .lower(f.build(), independent.path("artifact").path("profile"));
    at(object(object(f.witness(), "attempt"), "modelQuestion"), "choices", 1)
        .put("choiceId", "audit-provider-é🧪")
        .put("safeLabel", "Café e\u0301 🧪 untrusted audit");
    f.resealChoice();
    var result =
        new ObservedArtifactLowerer(C)
            .lower(f.build(), independent.path("artifact").path("profile"));
    assertThat(result.learnedPlan()).isEqualTo(before.learnedPlan());
    assertThat(result.artifact().path("steps")).isEqualTo(before.artifact().path("steps"));
    assertThat(result.artifact().path("guards")).isEqualTo(before.artifact().path("guards"));
    assertThat(result.artifact().path("inputRecipes"))
        .isEqualTo(before.artifact().path("inputRecipes"));
    assertThat(result.artifact().toString())
        .doesNotContain("audit-provider-é🧪", "untrusted audit");
    assertThat(result.hashes().path("publicationEvidenceHash"))
        .isNotEqualTo(before.hashes().path("publicationEvidenceHash"));
  }

  static void assertExecutableSemanticsEqual(
      PublicationContracts.Candidate reconstructed, PublicationContracts.Candidate standalone) {
    assertThat(reconstructed.learnedPlan()).isEqualTo(standalone.learnedPlan());
    for (String field :
        List.of(
            "profile",
            "steps",
            "guards",
            "inputRecipes",
            "sourceHash",
            "configurationHash",
            "authoringHash",
            "learnedPlanHash")) {
      assertThat(reconstructed.artifact().path(field))
          .as(field)
          .isEqualTo(standalone.artifact().path(field));
    }
    ObjectNode actualPolicy = copy(reconstructed.policy()),
        expectedPolicy = copy(standalone.policy());
    actualPolicy.remove("publicationEvidenceHash");
    expectedPolicy.remove("publicationEvidenceHash");
    assertThat(actualPolicy).isEqualTo(expectedPolicy);
  }
}
