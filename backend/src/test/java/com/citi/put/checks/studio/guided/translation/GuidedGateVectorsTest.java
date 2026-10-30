package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.translation.GuidedGates.Fact;
import com.citi.put.checks.studio.guided.translation.GuidedGates.TextCheck;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-007 D3 (AC1): the Java gates evaluated against the committed WI-2 golden vectors, read in
 * place from {@code studio-runner/test/fixtures/gate-vectors}. Every row is evaluated by the real
 * {@link GuidedGates} and, for the action rows, by the real {@link GuidedProposalValidator#action}.
 *
 * <p>Rules (the plan's goldenVectors): the intent, operation and action verdicts equal the stored
 * spike verdict on every row and the recorded harness verdict on every EXACT row; the PARTIAL rows
 * are evaluated on the same rebuilt inputs and their disagreement with the recording is counted per
 * gate and must equal the counts quoted in PARTIAL-ROWS.md; the G2 verdicts equal the spike's
 * case-insensitive verdict where the text is not cut; the synthetic vectors reach every branch. A
 * vector file edited by hand fails the sha256 pins. The test prints exactly one {@code
 * GATE_VECTORS_SUMMARY} line, which the lane wrapper checks.
 */
class GuidedGateVectorsTest {
  private static final Path DIR = Path.of("../studio-runner/test/fixtures/gate-vectors");
  private static final GuidedContracts C = new GuidedContracts();

  private static final Map<String, String> PINS =
      Map.of(
          "s3-gate-vectors.json",
              "f0693579f443a2127d73a54569fc8903eb4843a735c618608364a638de88f3d1",
          "synthetic-gate-vectors.json",
              "baa015eea9dbd5504065ec23600f0c3d14303a5855b9973eca2a481dd78a6214",
          "PARTIAL-ROWS.md", "2a7afd4f5e94f6c442af507e08f12111ab6fe73752d4816f0c1c3fe081b8078e");
  private static final String CLASSIFICATION_SHA =
      "7e42ce9b2ccfe37b7c532589ceb274de549ee3b8276893fff7010d9a158656e2";

  private static final Map<String, Set<GuidedRefusalDiagnostics.Gate>> ACTION_GATES =
      Map.of(
          "OPERATION_MISMATCH", Set.of(GuidedRefusalDiagnostics.Gate.NEXT_ACTION_MEANING),
          "VALUE_MISMATCH",
              Set.of(
                  GuidedRefusalDiagnostics.Gate.NEXT_AUTHORED_SOURCE,
                  GuidedRefusalDiagnostics.Gate.NEXT_BINDING_MEANING),
          "PREDICATE_MISMATCH", Set.of(GuidedRefusalDiagnostics.Gate.NEXT_ASSERTION_PREDICATE),
          "POLICY_DENIED", Set.of(GuidedRefusalDiagnostics.Gate.NEXT_SECRET_POLICY));

  private final List<String> differences = new ArrayList<>();
  private JsonNode plans;
  private final GuidedProposalValidator validator = new GuidedProposalValidator(C);

  @Test
  void theJavaGatesReproduceEveryGoldenVector() throws IOException {
    for (var pin : PINS.entrySet()) {
      assertThat(sha256(DIR.resolve(pin.getKey()))).as(pin.getKey()).isEqualTo(pin.getValue());
    }
    JsonNode recorded = C.parse(Files.readString(DIR.resolve("s3-gate-vectors.json")));
    JsonNode synthetic = C.parse(Files.readString(DIR.resolve("synthetic-gate-vectors.json")));
    assertThat(recorded.at("/provenance/classificationSha256").asText())
        .isEqualTo(CLASSIFICATION_SHA);
    plans = recorded.path("plans");

    Map<String, Integer> counts = new LinkedHashMap<>();
    int exact = 0, partial = 0, g2Rows = 0;
    int partialIntent = 0, partialOperation = 0, partialAction = 0;
    for (JsonNode row : recorded.path("rows")) {
      boolean isExact = row.path("class").asText().equals("EXACT");
      if (isExact) {
        exact++;
      } else {
        partial++;
      }
      String key = row.path("key").asText();
      JsonNode intent = row.path("intent");
      if (intent.isObject()) {
        String java = intent(intent.path("targetIntent"), intent.path("facts"));
        expectEqual(key + " intent/spike", text(intent.path("spike")), java);
        if (isExact) {
          expectEqual(key + " intent/recorded", text(intent.path("recorded")), java);
        } else if (!java.equals(nullable(text(intent.path("recorded"))))) {
          partialIntent++;
        }
      }
      JsonNode operation = row.path("operation");
      if (operation.isObject()) {
        String java = operation(operation.path("kind"), operation.path("node"));
        expectEqual(key + " operation/spike", text(operation.path("spike")), java);
        if (isExact) {
          expectEqual(key + " operation/recorded", text(operation.path("recorded")), java);
        } else if (!java.equals(nullable(text(operation.path("recorded"))))) {
          partialOperation++;
        }
      }
      JsonNode g2 = row.path("g2");
      if (g2.isObject()) {
        g2Rows++;
        if (!g2.path("truncated").asBoolean()) {
          Fact fact =
              new Fact(
                  g2.path("role").asText(),
                  "",
                  false,
                  "",
                  List.of(),
                  textOrNull(g2.at("/facts/text")));
          TextCheck check =
              GuidedGates.assertText("containsText", fact, g2.path("literal").asText());
          expectEqual(key + " g2", expectedText(g2.path("spike")), check.name());
        }
      }
      JsonNode action = row.path("action");
      List<String> codes = strings(action.path("recorded"));
      List<String> spike = strings(action.path("spike"));
      boolean differs = actionDiffers(key, action, spike);
      if (isExact) {
        assertThat(codes.isEmpty()).as(key + " action/recorded").isEqualTo(spike.isEmpty());
      } else if (codes.isEmpty() != spike.isEmpty()) {
        partialAction++;
      }
      if (differs) {
        differences.add(key + " action");
      }
    }

    int syntheticIntent = 0, syntheticOperation = 0, syntheticG2 = 0, syntheticAction = 0;
    for (JsonNode vector : synthetic.path("intent")) {
      syntheticIntent++;
      expectEqual(
          vector.path("id").asText(),
          text(vector.path("expected")),
          intent(vector.path("targetIntent"), vector.path("facts")));
    }
    for (JsonNode vector : synthetic.path("operation")) {
      syntheticOperation++;
      expectEqual(
          vector.path("id").asText(),
          text(vector.path("expected")),
          operation(vector.path("kind"), vector.path("node")));
    }
    for (JsonNode vector : synthetic.path("g2")) {
      syntheticG2++;
      boolean hidden = vector.path("withheld").asBoolean() || vector.has("descendant");
      Fact fact =
          new Fact(
              vector.path("role").asText(),
              "",
              false,
              "",
              List.of(),
              hidden ? null : vector.path("text").asText());
      TextCheck check =
          GuidedGates.assertText(
              vector.path("predicate").asText(), fact, vector.path("literal").asText());
      expectEqual(
          vector.path("id").asText(),
          textCheckName(vector.path("expected").asText()),
          check.name());
    }
    for (JsonNode vector : synthetic.path("action")) {
      syntheticAction++;
      if (actionDiffers(vector.path("id").asText(), vector, strings(vector.path("expected")))) {
        differences.add(vector.path("id").asText() + " action");
      }
    }

    counts.put("recordedRows", recorded.path("rows").size());
    counts.put("exactRows", exact);
    counts.put("partialRows", partial);
    counts.put("recordedG2", g2Rows);
    counts.put("syntheticIntent", syntheticIntent);
    counts.put("syntheticOperation", syntheticOperation);
    counts.put("syntheticG2", syntheticG2);
    counts.put("syntheticAction", syntheticAction);
    counts.put("partialDisagreementsIntent", partialIntent);
    counts.put("partialDisagreementsOperation", partialOperation);
    counts.put("partialDisagreementsAction", partialAction);
    counts.put("differences", differences.size());
    ObjectNode summary = C.object();
    counts.forEach(summary::put);
    // One line, read from the class XML system-out by the lane wrapper.
    System.out.println("GATE_VECTORS_SUMMARY " + summary);

    assertThat(differences).as("rows where the Java gates differ from the vectors").isEmpty();
    assertThat(counts)
        .containsEntry("recordedRows", 529)
        .containsEntry("exactRows", 431)
        .containsEntry("partialRows", 98)
        .containsEntry("recordedG2", 29)
        .containsEntry("syntheticIntent", 26)
        .containsEntry("syntheticOperation", 49)
        .containsEntry("syntheticG2", 24)
        .containsEntry("syntheticAction", 33)
        // PARTIAL-ROWS.md: intent 4, operation 14, action 0 PARTIAL rows differ from the recording.
        .containsEntry("partialDisagreementsIntent", 4)
        .containsEntry("partialDisagreementsOperation", 14)
        .containsEntry("partialDisagreementsAction", 0);
  }

  // ---- intent and operation ----

  private static String intent(JsonNode targetIntent, JsonNode facts) {
    Fact fact =
        new Fact(
            "generic",
            facts.path("name").asText(""),
            false,
            facts.path("evidence").asText(""),
            List.of(),
            null);
    return nullable(
        GuidedGates.intent(targetIntent.isTextual() ? targetIntent.asText() : null, fact).code());
  }

  /** The rebuilt operation input: a text line has role text, and an editable control fills. */
  private static String operation(JsonNode kind, JsonNode node) {
    Fact fact = null;
    if (node.isObject()) {
      String role = node.path("kind").asText().equals("node") ? node.path("role").asText() : "text";
      boolean editable = false;
      for (JsonNode state : node.path("states")) {
        editable |= state.asText().equals("editable");
      }
      // The runner derives editable for a combobox that is an input or a textarea.
      editable |=
          role.equals("combobox")
              && Set.of("input", "textarea").contains(node.path("tag").asText());
      fact = new Fact(role, "", editable, "", List.of(), null);
    }
    return nullable(GuidedGates.operationTarget(kind.isTextual() ? kind.asText() : null, fact));
  }

  private static String nullable(String code) {
    return code == null ? "null" : code;
  }

  private static String text(JsonNode node) {
    return node == null || node.isMissingNode() || node.isNull() ? "null" : node.asText();
  }

  private static String textOrNull(JsonNode node) {
    return node.isTextual() ? node.asText() : null;
  }

  private static String expectedText(JsonNode spike) {
    if (!spike.path("applies").asBoolean()) {
      return "NOT_APPLICABLE";
    }
    return spike.path("refuseCI").asBoolean() ? "REFUSE" : "PASS";
  }

  private void expectEqual(String what, String expected, String actual) {
    if (!expected.equals(actual)) {
      differences.add(what + ": expected " + expected + " but the Java gate said " + actual);
    }
  }

  private static List<String> strings(JsonNode array) {
    List<String> out = new ArrayList<>();
    array.forEach(item -> out.add(item.asText()));
    return out;
  }

  // ---- the action gate, through the real validator ----

  /**
   * Builds the proposal, the progress and the context the service would hold for one vector and
   * runs {@link GuidedProposalValidator#action}. The injected fact of the picked ref passes the
   * intent, the operation-versus-role and the read gates by construction (name = the obligation's
   * intent, a role that takes the operation, text present), so every refusal reported here comes
   * from the unchanged action gate; the intent, operation and G2 gates have vector sets of their
   * own.
   *
   * @return true when the Java outcome differs from the vector
   */
  private boolean actionDiffers(String id, JsonNode vector, List<String> codes) {
    // A recorded action row keeps its plan once, by id; a synthetic vector carries it inline.
    JsonNode action = vector.path("reply").path("action");
    JsonNode obligationSource = vector.path("obligation");
    JsonNode inputsSource = vector.path("inputs");
    JsonNode plan =
        vector.has("plan") ? vector.path("plan") : plans.path(vector.path("planId").asText());
    JsonNode operation = action.path("operation");
    // A reply the strict model-response schema already refuses never reaches the action gate.
    boolean shape =
        !action.isObject()
            || !operation.isObject()
            || !operation.path("kind").isTextual()
            || (Set.of("fill", "selectOption").contains(operation.path("kind").asText())
                && !operation.has("value"));
    if (shape) {
      return codes.isEmpty();
    }
    ObjectNode obligation = ((ObjectNode) obligationSource).deepCopy();
    obligation.putIfAbsent("stepId", C.parse("\"step-1\""));
    obligation.putIfAbsent("occurrence", C.parse("0"));
    // The production gate indexes the plan's references; admitPlan guarantees the index is in
    // range, so an out-of-range index is the spike's "no such reference" refusal by construction.
    if (obligation.path("referenceIndex").isIntegralNumber()
        && plan.path("sourceReferences").get(obligation.path("referenceIndex").asInt()) == null) {
      return codes.isEmpty();
    }
    String kind = operation.path("kind").asText();
    String name = obligation.path("targetIntent").asText("target");
    String ref = action.path("target").path("ref").asText("e1");

    ObjectNode session = C.object().put("sessionId", "vector").put("scopeHash", "a".repeat(64));
    ObjectNode evidence = C.object();
    evidence.put("kind", "observedDocument").put("sessionId", "vector").put("contextId", "ctx");
    evidence.put("documentId", "doc").put("generation", 1).put("origin", "https://example.test");
    evidence.put("observationHash", "b".repeat(64));
    ObjectNode progress = C.object();
    progress.put("documentId", "doc").put("generation", 1).put("stepIndex", 0);
    progress.set("executionEvidence", evidence);
    progress.put("evidenceHash", GuidedContracts.hash(evidence));
    ObjectNode observation = progress.putObject("observation");
    observation.put("readRuleId", "observed-read-v1-vector");
    observation.putObject("coverage").put("passwordControls", 1);
    ObjectNode facts = observation.putObject("facts");
    ObjectNode fact = facts.putObject(ref);
    fact.put("role", roleFor(kind)).put("name", name).put("editable", kind.equals("fill"));
    fact.put("evidence", name).put("text", name);
    fact.putArray("evidenceSegments")
        .addObject()
        .put("field", "name")
        .put("start", 0)
        .put("end", name.length());

    ObjectNode proposal = C.object().put("schemaVersion", 3);
    proposal.put("sessionId", "vector").put("scopeHash", "a".repeat(64));
    proposal
        .putObject("coordinate")
        .put("stepId", obligation.path("stepId").asText())
        .put("ordinal", obligation.path("occurrence").asInt());
    proposal.put("generation", 1);
    proposal.set("executionEvidence", evidence);
    proposal.put("evidenceHash", progress.path("evidenceHash").asText());
    proposal.put("authoredInputsHash", "c".repeat(64)).put("contextRevision", 1);
    ObjectNode target = ((ObjectNode) action.path("target")).deepCopy();
    target.put("documentId", "doc").put("generation", 1);
    proposal.set("target", target);
    ObjectNode op = ((ObjectNode) operation).deepCopy();
    if (kind.equals("assert")
        && op.path("predicate").asText().equals("visible")
        && codes.isEmpty()) {
      // A visible assertion names no value (the plan admits none), so an admitted vector is built
      // that way.
      op.putNull("expected");
      obligation.putNull("referenceIndex");
    }
    if (kind.equals("read")) {
      op.remove("recipe");
      op.putObject("recipe")
          .put("kind", "visibleText")
          .put("classification", "permittedBusinessData")
          .put("policyRuleId", "observed-read-v1-vector");
    }
    proposal.set("operation", op);

    // authored inputs: one per distinct used reference, in plan order of first use
    List<Integer> used = new ArrayList<>();
    for (JsonNode item : plan.path("obligations")) {
      JsonNode index = item.path("referenceIndex");
      if (index.isIntegralNumber()
          && plan.path("sourceReferences").get(index.asInt()) != null
          && !used.contains(index.asInt())) {
        used.add(index.asInt());
      }
    }
    ObjectNode context =
        C.object().put("contextRevision", 1).put("authoredInputsHash", "c".repeat(64));
    ArrayNode inputs = context.putObject("authoredInputs").putArray("inputs");
    int at = 0;
    for (JsonNode input : inputsSource) {
      ObjectNode copy = ((ObjectNode) input).deepCopy();
      if (at < used.size()) {
        JsonNode reference = plan.path("sourceReferences").get(used.get(at));
        copy.set("provenance", reference);
        // A hand-written vector names only the input id; the bound input carries its reference's
        // kind.
        copy.putIfAbsent(
            "kind",
            C.parse(
                reference.path("kind").asText().equals("secretRef")
                    ? "\"secretRef\""
                    : "\"nonsecretText\""));
        copy.putIfAbsent("sourceStepId", C.parse("\"" + obligation.path("stepId").asText() + "\""));
        copy.putIfAbsent("intendedSlot", C.parse("\"" + slot(kind) + "\""));
      } else {
        copy.putObject("provenance").put("unbound", true);
      }
      inputs.add(copy);
      at++;
    }

    GuidedGateRecorder recorder = new GuidedGateRecorder();
    boolean refused = false;
    String failure = null;
    try {
      validator.action(session, progress, plan, obligation, proposal, context, null, recorder);
    } catch (GuidedSessionException refusal) {
      refused = true;
      failure = refusal.getMessage();
    }
    if (refused != !codes.isEmpty()) {
      differences.add(
          id
              + " action: expected "
              + codes
              + " but refused="
              + refused
              + " ("
              + failure
              + ", "
              + recorder.firstGate()
              + ")");
      return true;
    }
    if (refused) {
      Set<GuidedRefusalDiagnostics.Gate> allowed = new java.util.HashSet<>();
      for (String code : codes) {
        allowed.addAll(ACTION_GATES.getOrDefault(code, Set.of()));
      }
      // The action schema encodes two of the rules as well (a secret fill needs the password
      // control
      // and a visible assertion names no value): the contract refuses first, as defence in depth.
      if (codes.contains("POLICY_DENIED") || codes.contains("PREDICATE_MISMATCH")) {
        allowed.add(GuidedRefusalDiagnostics.Gate.NEXT_ACTION_CONTRACT_CALL);
      }
      if (!allowed.contains(recorder.firstGate())) {
        differences.add(
            id
                + " action: first gate "
                + recorder.firstGate()
                + " is not one of "
                + allowed
                + " for "
                + codes);
        return true;
      }
    }
    return false;
  }

  private static String slot(String kind) {
    return switch (kind) {
      case "navigate" -> "navigate.destination";
      case "assert" -> "assert.expected";
      case "selectOption" -> "selectOption.value";
      default -> "fill.value";
    };
  }

  private static String roleFor(String kind) {
    return switch (kind) {
      case "fill" -> "textbox";
      case "selectOption" -> "combobox";
      case "check", "uncheck" -> "checkbox";
      default -> "button";
    };
  }

  private static String sha256(Path file) throws IOException {
    try {
      return HexFormat.of()
          .formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file)));
    } catch (java.security.NoSuchAlgorithmException impossible) {
      throw new IllegalStateException(impossible);
    }
  }

  /** The {@link TextCheck} name a vector's recorded verdict stands for. */
  private static String textCheckName(String recorded) {
    return switch (recorded) {
      case "refuse" -> "REFUSE";
      case "pass" -> "PASS";
      default -> "NOT_APPLICABLE";
    };
  }
}
