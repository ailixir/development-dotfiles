package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.support.ObservationFixtures;
import com.citi.put.checks.studio.support.TestDomains;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-007 AC2: what the model is shown is the spike's S3 text and schema, with two documented
 * production edits and nothing else. E1 is the wording of the selectedChoice paragraph (the stored
 * selection is re-established by a count, D-6); E2 is the read operation without a recipe (the
 * backend completes it from the page's read grant, D-7). The spike directory is not committed, so
 * both spike files are verbatim, sha-pinned copies under {@code resources/studio/guided/wi3}.
 */
class GuidedS3ParityTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final String S3_CONTRACT_SHA256 =
      "498e1040d8b2141d26348cf68f7ac3841bb2099fbca5bc14379c9e8987b8e782";

  /** Edit E1 (text): the spike paragraph and its production replacement. */
  private static final String E1_SPIKE =
      "An obligation selectedLocator records the authenticated author's previously accepted"
          + " semantic choice. Re-establish it against fresh observation and name the ref of the"
          + " matching outline line; a historical ref or node ID is not authority. Do not silently"
          + " substitute another field.";

  private static final String E1_PRODUCTION =
      "An obligation selectedChoice {role, name, ref} records the authenticated author's"
          + " previously accepted choice: the element with that role and name, which the ref names"
          + " in the current outline. Use that ref for the target; a historical ref or node ID is"
          + " not authority. Do not silently substitute another field. When an obligation has"
          + " reconfirm true, the earlier choice of the authenticated author no longer identifies"
          + " exactly one element of this outline: return CLARIFICATION with every candidate ref"
          + " and never an ACTION.";

  private static final String STEP = "11111111-1111-4111-8111-111111111111";

  private static String text(String resource) throws IOException {
    try (var in = GuidedS3ParityTest.class.getResourceAsStream(resource)) {
      assertThat(in).as(resource).isNotNull();
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
  }

  private static String sha256(String value) throws Exception {
    return HexFormat.of()
        .formatHex(
            MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
  }

  @Test
  void theSystemTextIsTheSpikeS3ContractWithOnlyEditE1() throws Exception {
    String spike = text("/studio/guided/wi3/s3-contract.md");
    assertThat(sha256(spike)).as("the verbatim spike copy").isEqualTo(S3_CONTRACT_SHA256);
    String production = text("/studio/guided-output-contract.md");
    assertThat(spike.split(java.util.regex.Pattern.quote(E1_SPIKE), -1))
        .as("E1 anchor occurs exactly once")
        .hasSize(2);
    assertThat(spike.replace(E1_SPIKE, E1_PRODUCTION)).isEqualTo(production);
    // The assembled request carries exactly this text as its system text.
    GuidedModelRequest request = assemble(List.of(obligation("click", "Save", null, null)), null);
    assertThat(request.outputContract()).isEqualTo(production);
  }

  @Test
  void theNextActionProviderSchemaIsTheSpikeS3SchemaWithOnlyEditE2() throws Exception {
    JsonNode spike = C.parse(text("/studio/guided/wi3/s3-response.schema.json"));
    JsonNode production =
        new GuidedPromptAssembler(C, TestDomains.FIXTURES)
            .providerSchema(GuidedModelRequest.Kind.NEXT_ACTION);
    ObjectNode inlinedSpike = (ObjectNode) inline(spike);
    assertThat(dropRecipeOfTheReadOperation(inlinedSpike))
        .as("E2 removes the recipe from exactly one operation shape")
        .isEqualTo(1);
    JsonNode inlinedProduction = inline(production);
    assertThat(inlinedProduction).isEqualTo(inlinedSpike);
    // And the edit is the whole difference: with the recipe the spike shape would not equal.
    assertThat(inline(spike)).isNotEqualTo(inlinedProduction);
    // The strict schema carries no recipe for a read either.
    assertThat(strictReadOperation().has("recipe")).isFalse();
  }

  @Test
  void sixObligationFamiliesBuildTheSameContextKeysWithTheOutlineAsAString() {
    List<ObjectNode> families =
        List.of(
            obligation("click", "Save", null, null),
            obligation("fill", "Email", 0, null),
            obligation("selectOption", "Country", 1, null),
            obligation("check", "Terms", null, null),
            assertion("Order placed"),
            obligation("read", "Reference", null, "need-1"));
    assertThat(families)
        .extracting(f -> f.path("operationKind").asText())
        .containsExactly("click", "fill", "selectOption", "check", "assert", "read");
    TreeSet<String> expected =
        new TreeSet<>(
            List.of(
                "schemaVersion",
                "sessionId",
                "scopeHash",
                "sourceRevision",
                "configurationRevision",
                "sourceSteps",
                "configurationReferences",
                "authoringContext",
                "clarificationSelections",
                "inputs",
                "obligations",
                "needs",
                "observation",
                "executionEvidence",
                "coordinate",
                "authoredInputsHash",
                "contextRevision",
                "repairCodes"));
    for (ObjectNode family : families) {
      GuidedModelRequest request = assemble(List.of(family), null);
      JsonNode context = request.projection().document();
      TreeSet<String> keys = new TreeSet<>();
      context.fieldNames().forEachRemaining(keys::add);
      assertThat(keys).as(family.path("operationKind").asText()).isEqualTo(expected);
      assertThat(context.path("observation").isTextual()).isTrue();
      assertThat(context.path("observation").asText()).contains("[e1]").startsWith("- document");
      assertThat(context.path("obligations")).hasSize(1);
      assertThat(context.path("obligations").get(0).path("operationKind"))
          .isEqualTo(family.path("operationKind"));
    }
  }

  @Test
  void modelRequestNeverCarriesFactsEvidence() {
    List<String> canaries =
        List.of(
            "canary-evidence-name",
            "canary-evidence-group",
            "canary-evidence-header",
            "canary-evidence-sibling",
            "canary-facts-text",
            "canary-selection-evidence");
    ObjectNode observation = observationWithCanaries();
    ObjectNode chosen = obligation("click", "Save", null, null);
    chosen.putObject("selectedChoice").put("role", "button").put("name", "Save").put("ref", "e1");
    // The stored triple is an internal property of the obligation; the allow-list must not copy it.
    chosen
        .putObject("selection")
        .put("role", "button")
        .put("name", "Save")
        .put("evidence", "Save " + canaries.get(5));
    ObjectNode again = obligation("click", "Save", null, null);
    again.put("reconfirm", true);
    again
        .putObject("selection")
        .put("role", "button")
        .put("name", "Save")
        .put("evidence", "Save " + canaries.get(5));
    for (ObjectNode withChoice : List.of(chosen, again)) {
      GuidedModelRequest request = assemble(List.of(withChoice), observation);
      String body =
          request.projection().document().toString()
              + request.outputContract()
              + request.responseSchema();
      for (String canary : canaries) {
        assertThat(body).as(canary).doesNotContain(canary);
      }
      JsonNode sent = request.projection().document().path("obligations").get(0);
      assertThat(sent.has("selection")).isFalse();
      assertThat(sent.has("selectedChoice")).isEqualTo(withChoice.has("selectedChoice"));
      assertThat(sent.path("reconfirm").asBoolean(false)).isEqualTo(withChoice.has("reconfirm"));
      assertThat(sent.has("selectedChoice") && sent.has("reconfirm")).isFalse();
      assertThat(request.projection().document().has("facts")).isFalse();
      assertThat(request.projection().document().path("observation").asText())
          .isEqualTo(observation.path("outline").asText());
    }
  }

  private static ObjectNode observationWithCanaries() {
    ObjectNode save = ObservationFixtures.fact("button", "Save", false, "canary-facts-text");
    save.put(
        "evidence",
        "Save canary-evidence-name canary-evidence-group canary-evidence-header"
            + " canary-evidence-sibling");
    ArrayNode segments = save.withArray("evidenceSegments");
    segments.removeAll();
    segments.addObject().put("field", "name").put("start", 0).put("end", 4);
    segments.addObject().put("field", "group").put("start", 5).put("end", 25);
    segments.addObject().put("field", "header").put("start", 26).put("end", 47);
    segments.addObject().put("field", "sibling").put("start", 48).put("end", 70);
    return ObservationFixtures.observation().withFact("e1", save).build();
  }

  private static ObjectNode obligation(String kind, String intent, Integer reference, String need) {
    ObjectNode obligation = C.object();
    obligation
        .put("obligationId", "obligation-" + kind)
        .put("stepId", STEP)
        .put("occurrence", 0)
        .put("operationKind", kind)
        .put("targetIntent", intent)
        .putNull("scopeIntent");
    if (reference == null) {
      obligation.putNull("referenceIndex");
    } else {
      obligation.put("referenceIndex", reference);
    }
    if (need == null) {
      obligation.putNull("needId");
    } else {
      obligation.put("needId", need);
    }
    obligation.putNull("predicate");
    return obligation;
  }

  private static ObjectNode assertion(String intent) {
    ObjectNode obligation = obligation("assert", intent, 0, null);
    obligation.put("predicate", "containsText");
    return obligation;
  }

  private static GuidedModelRequest assemble(List<ObjectNode> remaining, ObjectNode observation) {
    ObjectNode scope = C.object().put("sourceRevision", "1").put("configurationRevision", "1");
    ObjectNode session = C.object();
    session.put("sessionId", "synthetic-session").put("scopeHash", "a".repeat(64));
    session.set("scope", scope);
    session.putArray("sourceSteps").addObject().put("stepId", STEP).put("text", "Click Save");
    ObjectNode state = C.object();
    ObjectNode manifest = state.putObject("manifest");
    manifest.set("sourceSteps", session.path("sourceSteps"));
    manifest.putArray("configurationReferences");
    manifest.putArray("authoringContext");
    state.putObject("plan").putArray("needs");
    ObjectNode progress = C.object();
    progress.put("stepIndex", 0).put("translationOrdinal", 0).put("contextRevision", 0);
    progress.set(
        "observation",
        observation != null
            ? observation
            : ObservationFixtures.observation()
                .element("e1", "button", "Save")
                .readRuleId("business-reference")
                .build());
    ArrayNode obligations = C.object().putArray("items");
    remaining.forEach(obligations::add);
    return new GuidedPromptAssembler(C, TestDomains.FIXTURES)
        .assemble(
            "synthetic-request",
            1,
            GuidedModelRequest.Kind.NEXT_ACTION,
            session,
            progress,
            state,
            C.object().putArray("items"),
            obligations,
            C.object().putArray("items"),
            List.of(),
            1024);
  }

  /** The schema with every {@code $ref: #/$defs/X} replaced by its definition, and no $defs. */
  private static JsonNode inline(JsonNode root) {
    JsonNode defs = root.path("$defs");
    ObjectNode body = root.deepCopy();
    body.remove("$defs");
    return resolve(body, defs);
  }

  private static JsonNode resolve(JsonNode node, JsonNode defs) {
    if (node.isObject()) {
      JsonNode ref = node.get("$ref");
      if (ref != null && ref.asText().startsWith("#/$defs/")) {
        return resolve(defs.path(ref.asText().substring("#/$defs/".length())), defs);
      }
      ObjectNode copy = C.object();
      Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
      while (fields.hasNext()) {
        Map.Entry<String, JsonNode> field = fields.next();
        copy.set(field.getKey(), resolve(field.getValue(), defs));
      }
      return copy;
    }
    if (node.isArray()) {
      ArrayNode copy = C.object().arrayNode();
      node.forEach(item -> copy.add(resolve(item, defs)));
      return copy;
    }
    return node;
  }

  /** Edit E2 on the spike copy: the read operation shape loses recipe. Returns shapes changed. */
  private static int dropRecipeOfTheReadOperation(JsonNode node) {
    int changed = 0;
    if (node.isObject()) {
      JsonNode properties = node.path("properties");
      if (properties.path("kind").path("enum").toString().equals("[\"read\"]")
          && properties.has("recipe")) {
        ((ObjectNode) properties).remove("recipe");
        ArrayNode required = (ArrayNode) node.path("required");
        List<JsonNode> keep = new ArrayList<>();
        required.forEach(
            item -> {
              if (!item.asText().equals("recipe")) {
                keep.add(item);
              }
            });
        required.removeAll();
        keep.forEach(required::add);
        changed++;
      }
      Iterator<JsonNode> children = node.elements();
      while (children.hasNext()) {
        changed += dropRecipeOfTheReadOperation(children.next());
      }
    } else if (node.isArray()) {
      for (JsonNode child : node) {
        changed += dropRecipeOfTheReadOperation(child);
      }
    }
    return changed;
  }

  /** The read operation shape of the strict NEXT_ACTION reply schema. */
  private static JsonNode strictReadOperation() {
    // The strict schema is the one the parser enforces: a read with a recipe is refused (see
    // GuidedReadRecipeTest); here the shape itself is inspected through the packaged schema.
    try {
      JsonNode schema =
          C.parse(text("/studio/observed-contracts/v3/guided-model-response.schema.json"));
      for (JsonNode variant : schema.path("oneOf")) {
        if (variant.path("properties").path("kind").path("const").asText().equals("NEXT_ACTION")) {
          for (JsonNode operation :
              variant
                  .path("properties")
                  .path("action")
                  .path("oneOf")
                  .get(0)
                  .path("properties")
                  .path("operation")
                  .path("oneOf")) {
            if (operation.path("properties").path("kind").path("const").asText().equals("read")) {
              return operation.path("properties");
            }
          }
        }
      }
      throw new AssertionError("no read operation in the strict schema");
    } catch (IOException failure) {
      throw new AssertionError(failure);
    }
  }
}
