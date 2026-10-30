package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.SnapshotBasisParityTest.ALTERED;
import static com.citi.put.checks.studio.guided.publication.SnapshotBasisParityTest.C;
import static com.citi.put.checks.studio.guided.publication.SnapshotBasisParityTest.M;
import static com.citi.put.checks.studio.guided.publication.SnapshotBasisParityTest.at;
import static com.citi.put.checks.studio.guided.publication.SnapshotBasisParityTest.document;
import static com.citi.put.checks.studio.guided.publication.SnapshotBasisParityTest.put;
import static com.citi.put.checks.studio.guided.publication.SnapshotBasisParityTest.remove;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Supplied immediate-base preimages only. Immutable historical receipt authority needs real
 * DB/HTTP.
 */
class SnapshotBasisValidationTest {
  private static final String BASE = "snapshotEvidence/baseProof";
  private static final String IDENTITY = BASE + "/revision/identity";
  private static final String ARTIFACT = BASE + "/artifact";
  private static final List<String> IDENTITY_FIELDS =
      List.of(
          "version",
          "testId",
          "csiId",
          "sourceRevision",
          "configurationRevision",
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
  private static final Map<String, String> COMMITMENTS =
      Map.of(
          "source",
          "sourceHash",
          "authoring",
          "authoringHash",
          "config",
          "configurationHash",
          "artifact",
          "artifactHash",
          "plan",
          "learnedPlanHash",
          "policy",
          "referencePolicyHash",
          "profile",
          "profileHash",
          "equivalence",
          "operationEquivalenceHash");

  private static ObjectNode fresh(JsonNode doc) {
    return at(doc, "snapshotCorrection/positives/1/basis").deepCopy();
  }

  private static JsonNode expectedPlan(JsonNode doc) {
    return at(doc, "snapshotCorrection/positives/1/expectedArtifact/learnedPlan");
  }

  /** Independent reference envelope, using ordered old source facts rather than current draft. */
  private static Map<String, JsonNode> preimages(JsonNode basis) {
    JsonNode base = at(basis, BASE), artifact = at(base, "artifact");
    ArrayNode lines = M.createArrayNode(), ordered = M.createArrayNode();
    for (JsonNode step : at(base, "authoringIdentity/authoring/steps")) {
      lines.add(step.path("text"));
      ObjectNode row = C.object().put("ordinal", ordered.size());
      row.set("stepId", step.path("id"));
      row.set("source", step.path("text"));
      ordered.add(row);
    }
    Map<String, JsonNode> result = new LinkedHashMap<>();
    result.put("sourceHash", lines);
    result.put("authoringHash", ordered);
    result.put("configurationHash", at(base, "configuration"));
    result.put("artifactHash", artifact);
    result.put("learnedPlanHash", at(artifact, "learnedPlan"));
    result.put("referencePolicyHash", at(artifact, "replayPolicy"));
    result.put("profileHash", at(artifact, "profile"));
    result.put("operationEquivalenceHash", equivalence(artifact));
    return result;
  }

  private static ObjectNode equivalence(JsonNode artifact) {
    ObjectNode result = C.object();
    ArrayNode operations = result.putArray("operations");
    for (JsonNode step : artifact.path("steps")) {
      step.path("operations").forEach(operations::add);
    }
    result.set("guards", artifact.path("guards"));
    result.set("inputRecipes", artifact.path("inputRecipes"));
    result.set("bindings", artifact.path("replayPolicy").path("bindings"));
    result.set("transfers", artifact.path("replayPolicy").path("transfers"));
    return result;
  }

  /** Only unrelated outer commitments are repaired. Never repair the intended inner mismatch. */
  private static void reseal(ObjectNode basis, String preserve) {
    JsonNode artifact = at(basis, ARTIFACT), identity = at(basis, IDENTITY);
    if (!preserve.equals("learnedPlanHash")) {
      String hash = GuidedContracts.hash(artifact.path("learnedPlan"));
      put(artifact, "learnedPlanHash", hash);
      put(artifact, "replayPolicy/learnedPlanHash", hash);
      put(identity, "learnedPlanHash", hash);
    }
    if (!preserve.equals("referencePolicyHash")) {
      put(identity, "referencePolicyHash", GuidedContracts.hash(artifact.path("replayPolicy")));
    }
    if (!preserve.equals("artifactHash")) {
      put(identity, "artifactHash", GuidedContracts.hash(artifact));
    }
    digestLinks(basis, GuidedContracts.hash(identity));
  }

  private static void digestLinks(ObjectNode basis, String digest) {
    put(basis, BASE + "/revision/revisionDigest", digest);
    put(basis, "snapshotEvidence/pinnedBase/revisionDigest", digest);
    put(basis, "incrementalEvidence/program/baseRevisionDigest", digest);
    put(
        basis,
        "incrementalEvidence/plan/prefixProgramHash",
        GuidedContracts.hash(at(basis, "incrementalEvidence/program")));
  }

  private static void reject(String label, ObjectNode basis, JsonNode doc, boolean shape) {
    JsonNode original = basis.deepCopy();
    if (shape) {
      assertThatThrownBy(
              () -> C.validate("v3/replay-validation#/definitions/ValidationBasis", basis))
          .as(label + ": closed shape")
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage("INVALID_CONTRACT");
    } else {
      // Explicitly prove the malformed-claim case reaches semantics after original schemas pass.
      C.validate("v3/replay-validation#/definitions/ValidationBasis", basis);
      assertThatThrownBy(
              () -> new GuidedSnapshotDeriver(C).apply(basis, expectedPlan(doc).deepCopy()))
          .as(label + ": semantic commitment")
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage("EVIDENCE_MISMATCH");
      assertThatThrownBy(
              () -> new ObservedArtifactLowerer(C).lower(basis, at(doc, "artifact/profile")))
          .as(label + ": complete builder")
          .isInstanceOf(GuidedSessionException.class);
    }
    assertThat(basis).as(label + ": raw source/graph preserved").isEqualTo(original);
  }

  @Test
  void baseArtifactAndRevisionDigestHaveExactPreimages() throws Exception {
    JsonNode doc = document();
    ObjectNode control = fresh(doc);
    JsonNode original = control.deepCopy();
    C.validate("v3/replay-validation#/definitions/ValidationBasis", control);
    JsonNode identity = at(control, IDENTITY);
    assertThat(identity.size()).as("65/identity/exact16").isEqualTo(16);
    assertThat(fields(identity)).containsExactlyInAnyOrderElementsOf(IDENTITY_FIELDS);
    for (var entry : COMMITMENTS.entrySet()) {
      String label =
          "65/"
              + entry.getKey()
              + (List.of("source", "authoring").contains(entry.getKey()) ? "/array" : "/full");
      assertThat(GuidedContracts.hash(preimages(control).get(entry.getValue())))
          .as(label)
          .isEqualTo(identity.path(entry.getValue()).asText());
    }
    assertThat(at(control, ARTIFACT + "/profile"))
        .as("65/profile/full")
        .isEqualTo(C.parse("{\"contract\":3}"));
    assertThat(GuidedContracts.hash(identity))
        .as("65/identity/exact16")
        .isEqualTo(at(control, "snapshotEvidence/pinnedBase/revisionDigest").asText());
    assertThat(GuidedContracts.hash(at(control, "incrementalEvidence/program")))
        .isEqualTo(at(control, "incrementalEvidence/plan/prefixProgramHash").asText());
    new GuidedSnapshotDeriver(C)
        .verifyBase(at(control, BASE), at(control, "snapshotEvidence/pinnedBase"), control);
    ObjectNode plan = expectedPlan(doc).deepCopy();
    new GuidedSnapshotDeriver(C).apply(control, plan);
    assertThat(plan).isEqualTo(expectedPlan(doc));
    assertThat(
            new ObservedArtifactLowerer(C).lower(control, at(doc, "artifact/profile")).artifact())
        .isEqualTo(at(doc, "snapshotCorrection/positives/1/expectedArtifact"));
    assertThat(control).isEqualTo(original);
    wrappedAndPartialCommitments(doc);
    shapeOmissions(doc);
    semanticInnerChanges(doc);
    pinProgramAndMaps(doc);
    historicalEqualities(doc);
  }

  private static void wrappedAndPartialCommitments(JsonNode doc) {
    for (var commitment : COMMITMENTS.entrySet()) {
      ObjectNode basis = fresh(doc);
      String key = commitment.getValue();
      put(
          basis,
          IDENTITY + "/" + key,
          GuidedContracts.hash(C.object().set("value", preimages(basis).get(key))));
      reseal(basis, key);
      reject(
          "65/" + commitment.getKey() + (key.equals("profileHash") ? "/wrapper-claim" : "/wrapper"),
          basis,
          doc,
          false);
    }
    for (String key : List.of("sourceHash", "authoringHash")) {
      String label = key.equals("sourceHash") ? "source" : "authoring";
      for (String variant :
          key.equals("sourceHash")
              ? List.of("reorder", "omit-line")
              : List.of("reorder", "omit-stepId", "omit-ordinal", "omit-source")) {
        ObjectNode basis = fresh(doc);
        ArrayNode preimage = preimages(basis).get(key).deepCopy();
        if (variant.equals("reorder")) {
          reverse(preimage);
        } else if (variant.equals("omit-line")) {
          preimage.remove(preimage.size() - 1);
        } else {
          remove(preimage, "0/" + variant.substring(5));
        }
        put(basis, IDENTITY + "/" + key, GuidedContracts.hash(preimage));
        reseal(basis, key);
        reject("65/" + label + "/" + variant, basis, doc, false);
      }
    }
    // Existing old/current text arrays coincide; use an intentional changed current-draft line.
    ObjectNode currentDraft = fresh(doc);
    ArrayNode lines = M.createArrayNode();
    put(currentDraft, "snapshotEvidence/current/authoring/steps/2/text", "A changed current draft");
    put(currentDraft, "sourceSteps/2/source", "A changed current draft");
    for (JsonNode step : at(currentDraft, "snapshotEvidence/current/authoring/steps")) {
      lines.add(step.path("text"));
    }
    put(currentDraft, "sourceHash", GuidedContracts.hash(lines));
    put(currentDraft, "authoringHash", GuidedContracts.hash(at(currentDraft, "sourceSteps")));
    put(currentDraft, IDENTITY + "/sourceHash", GuidedContracts.hash(lines));
    reseal(currentDraft, "sourceHash");
    reject("65/source/current-draft", currentDraft, doc, false);
    for (String field :
        List.of("operations", "guards", "inputRecipes", "bindings", "transfers", "order")) {
      ObjectNode basis = fresh(doc), preimage = equivalence(at(basis, ARTIFACT));
      if (field.equals("order")) {
        reverse((ArrayNode) preimage.path("operations"));
      } else {
        preimage.remove(field);
      }
      put(basis, IDENTITY + "/operationEquivalenceHash", GuidedContracts.hash(preimage));
      reseal(basis, "");
      reject(
          "65/equivalence/" + (field.equals("order") ? "order" : "omit-" + field),
          basis,
          doc,
          false);
    }
    for (String kind : List.of("wrapper", "whole-revision")) {
      ObjectNode basis = fresh(doc);
      JsonNode preimage =
          kind.equals("wrapper")
              ? C.object().set("identity", at(basis, IDENTITY))
              : at(basis, BASE + "/revision");
      digestLinks(basis, GuidedContracts.hash(preimage));
      reject("65/identity/" + kind, basis, doc, false);
    }
    for (String kind : List.of("artifact", "policy")) {
      ObjectNode basis = fresh(doc);
      String key = kind.equals("artifact") ? "artifactHash" : "referencePolicyHash";
      put(
          basis,
          IDENTITY + "/" + key,
          GuidedContracts.hash(
              at(
                  basis,
                  ARTIFACT
                      + (kind.equals("artifact") ? "/learnedPlan" : "/replayPolicy/bindings"))));
      reseal(basis, key);
      reject("65/" + kind + "/subset", basis, doc, false);
    }
  }

  private static void reverse(ArrayNode array) {
    List<JsonNode> values = new ArrayList<>();
    array.forEach(values::add);
    Collections.reverse(values);
    array.removeAll();
    values.forEach(array::add);
  }

  private static void shapeOmissions(JsonNode doc) {
    Map<String, List<String>> groups = new LinkedHashMap<>();
    groups.put(
        BASE + "/configuration",
        List.of("browser", "viewport", "timeoutSeconds", "waitStrategy", "environment"));
    groups.put(
        ARTIFACT,
        List.of(
            "version",
            "kind",
            "profile",
            "sourceHash",
            "configurationHash",
            "authoringHash",
            "learnedPlan",
            "learnedPlanHash",
            "guards",
            "inputRecipes",
            "steps",
            "replayPolicy"));
    groups.put(ARTIFACT + "/learnedPlan", fields(at(fresh(doc), ARTIFACT + "/learnedPlan")));
    groups.put(ARTIFACT + "/replayPolicy", fields(at(fresh(doc), ARTIFACT + "/replayPolicy")));
    groups.put(
        "incrementalEvidence/program",
        List.of(
            "schemaVersion", "baseRevisionId", "baseRevisionDigest", "sourceStepIds", "actions"));
    groups.put(IDENTITY, IDENTITY_FIELDS);
    groups.put(ARTIFACT + "/profile", List.of("contract"));
    groups.put(BASE + "/configuration/viewport", List.of("width", "height"));
    groups.put(BASE + "/authoringIdentity/authoring/steps/0", List.of("id", "text", "context"));
    Map<String, String> labels =
        Map.of(
            BASE + "/configuration",
            "65/config/each-required-omission",
            ARTIFACT,
            "65/artifact/required-omission",
            ARTIFACT + "/learnedPlan",
            "65/plan/required-omission",
            ARTIFACT + "/replayPolicy",
            "65/policy/required-omission",
            "incrementalEvidence/program",
            "65/program/required-omission",
            IDENTITY,
            "65/identity/omit",
            ARTIFACT + "/profile",
            "65/profile/omission",
            BASE + "/configuration/viewport",
            "65/config/each-required-omission/viewport",
            BASE + "/authoringIdentity/authoring/steps/0",
            "65/source/required-omission");
    for (var group : groups.entrySet()) {
      for (String field : group.getValue()) {
        ObjectNode basis = fresh(doc);
        remove(basis, group.getKey() + "/" + field);
        reject(
            labels.get(group.getKey()) + (group.getKey().equals(IDENTITY) ? "-" : "/") + field,
            basis,
            doc,
            true);
      }
    }
    ObjectNode profile = fresh(doc);
    put(profile, ARTIFACT + "/profile/contract", M.valueToTree(2));
    reject("65/profile/unsupported-constant", profile, doc, true);
    ObjectNode unknown = fresh(doc);
    put(unknown, IDENTITY + "/extra", M.valueToTree(true));
    reject("65/identity/unknown-field", unknown, doc, true);
  }

  private static List<String> fields(JsonNode node) {
    List<String> result = new ArrayList<>();
    node.fieldNames().forEachRemaining(result::add);
    return result;
  }

  private static void semanticInnerChanges(JsonNode doc) {
    for (var mutation :
        List.of(
            new SnapshotBasisParityTest.Mutation(
                "environment", "environment", M.valueToTree("other")),
            new SnapshotBasisParityTest.Mutation("width", "viewport/width", M.valueToTree(1281)),
            new SnapshotBasisParityTest.Mutation("height", "viewport/height", M.valueToTree(721)),
            new SnapshotBasisParityTest.Mutation("timeout", "timeoutSeconds", M.valueToTree(11)),
            new SnapshotBasisParityTest.Mutation(
                "wait", "waitStrategy", M.valueToTree("networkidle")))) {
      ObjectNode basis = fresh(doc);
      put(basis, BASE + "/configuration/" + mutation.path(), mutation.value());
      reseal(basis, "");
      reject("65/config/legal-field-change/" + mutation.label(), basis, doc, false);
    }
    for (String[] mutation :
        List.of(
            new String[] {
              "65/artifact/valid-inner-change",
              ARTIFACT + "/learnedPlan/planId",
              "different-plan",
              "artifactHash"
            },
            new String[] {
              "65/plan/semantic-change",
              ARTIFACT + "/learnedPlan/actions/0/operation/destinationInputId",
              "input-other",
              "learnedPlanHash"
            },
            new String[] {
              "65/policy/semantic-change",
              ARTIFACT + "/replayPolicy/bindings/0/sourceOrigin",
              "https://other.example.test",
              "referencePolicyHash"
            },
            new String[] {
              "65/plan/duplicate-field-mismatch",
              ARTIFACT + "/learnedPlanHash",
              ALTERED,
              "learnedPlanHash"
            })) {
      ObjectNode basis = fresh(doc);
      put(basis, mutation[1], mutation[2]);
      reseal(basis, mutation[3]);
      reject(mutation[0], basis, doc, false);
    }
  }

  private static void pinProgramAndMaps(JsonNode doc) {
    for (String path :
        List.of(
            BASE + "/revision/id",
            "snapshotEvidence/pinnedBase/revisionId",
            "incrementalEvidence/plan/baseRevisionId",
            "incrementalEvidence/program/baseRevisionId",
            "incrementalEvidence/switch/baseRevisionId")) {
      ObjectNode basis = fresh(doc);
      put(basis, path, "00000000-0000-4000-8000-000000000902");
      if (path.contains("/program/")) {
        put(
            basis,
            "incrementalEvidence/plan/prefixProgramHash",
            GuidedContracts.hash(at(basis, "incrementalEvidence/program")));
      }
      reject("65/pin/each-id-copy/" + path, basis, doc, false);
    }
    for (String path :
        List.of(
            BASE + "/revision/revisionDigest",
            "snapshotEvidence/pinnedBase/revisionDigest",
            "incrementalEvidence/program/baseRevisionDigest")) {
      ObjectNode basis = fresh(doc);
      put(basis, path, ALTERED);
      if (path.contains("/program/")) {
        put(
            basis,
            "incrementalEvidence/plan/prefixProgramHash",
            GuidedContracts.hash(at(basis, "incrementalEvidence/program")));
      }
      reject("65/pin/each-digest-copy/" + path, basis, doc, false);
    }
    ObjectNode wrapper = fresh(doc);
    put(
        wrapper,
        "incrementalEvidence/plan/prefixProgramHash",
        GuidedContracts.hash(
            C.object().set("program", at(wrapper, "incrementalEvidence/program"))));
    reject("65/program/wrapper", wrapper, doc, false);
    for (String kind : List.of("guard", "action")) {
      ObjectNode basis = fresh(doc);
      put(
          basis,
          "incrementalEvidence/program/"
              + (kind.equals("guard")
                  // ADR-SC-007: a guard target is the runner-reported locator, tier and identity.
                  ? "actions/1/guard/target/identity/role"
                  : "actions/0/operation/destinationInputId"),
          kind.equals("guard") ? M.valueToTree("other-role") : M.valueToTree("other-input"));
      put(
          basis,
          "incrementalEvidence/plan/prefixProgramHash",
          GuidedContracts.hash(at(basis, "incrementalEvidence/program")));
      reject("65/program/" + kind + "-resealed", basis, doc, false);
    }
    for (String variant : List.of("missing-key", "extra-key", "reuse-copy-mismatch")) {
      ObjectNode basis = fresh(doc);
      String id = "00000000-0000-4000-8000-000000000001";
      if (variant.equals("reuse-copy-mismatch")) {
        put(
            basis,
            BASE + "/revision/reusedFrom/" + id,
            C.object().put("revisionId", "00000000-0000-4000-8000-000000000902").put("stepId", id));
      } else {
        for (String path :
            List.of(
                BASE + "/revision/stepSnapshotHashes",
                ARTIFACT + "/learnedPlan/stepSnapshotHashes")) {
          if (variant.equals("missing-key")) {
            remove(basis, path + "/" + id);
          } else {
            put(basis, path + "/00000000-0000-4000-8000-000000000999", ALTERED);
          }
        }
      }
      reseal(basis, "");
      reject("65/maps/" + variant, basis, doc, false);
    }
    for (String name :
        List.of(
            "base-operation-equivalence-is-recomputed",
            "base-claimed-map-resealed-still-not-source-derived")) {
      JsonNode found = null;
      for (JsonNode row : at(doc, "snapshotCorrection/negatives")) {
        if (row.path("name").asText().equals(name)) {
          found = row;
        }
      }
      assertThat(found).isNotNull();
      reject("65/maps/resealed-claimed-map;" + name, at(found, "basis").deepCopy(), doc, false);
    }
  }

  private static void historicalEqualities(JsonNode doc) {
    for (String[] pair :
        List.of(
            new String[] {"admission", "admissionProvenanceHash"},
            new String[] {"publication", "publicationEvidenceHash"},
            new String[] {"authorization", "runAuthorizationHash"})) {
      ObjectNode basis = fresh(doc);
      put(basis, ARTIFACT + "/replayPolicy/" + pair[1], ALTERED);
      reseal(basis, "");
      reject("65/receipt/" + pair[0] + "-one-sided", basis, doc, false);
    }
    // 65/receipt/actual-stored-authority: this pure test grants no hidden-history authenticity.
    // Retained obligations31/52/54/60/61/63 require ObservedRevisionVerifier.verify(UUID) plus
    // GuidedPublicationEvidenceRepository's real original revision/receipt/principal/test/CSI/
    // session and original-pin/CAS joins. Never fabricate an old basis or recursively revalidate
    // it.
  }
}
