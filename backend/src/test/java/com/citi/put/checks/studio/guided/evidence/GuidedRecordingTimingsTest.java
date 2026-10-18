package com.citi.put.checks.studio.guided.evidence;

import static com.citi.put.checks.studio.guided.evidence.GuidedRecordingSeed.JSON;
import static com.citi.put.checks.studio.guided.evidence.GuidedRecordingSeed.action;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.evidence.GuidedRecordingTimings.LedgerAction;
import com.citi.put.checks.studio.guided.evidence.GuidedRecordingTimings.Limits;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;

/** STUDIO-OBS-013 AR-1 R2 / R3 step 10: semantic checks, step derivation, ordering. Pure. */
class GuidedRecordingTimingsTest {

  private static final Limits LIMITS = new Limits(600, 200, 100);

  private static Map<String, LedgerAction> ledger() {
    Map<String, LedgerAction> ledger = new LinkedHashMap<>();
    ledger.put("a1", new LedgerAction("a1", "step-1", 0, 1));
    ledger.put("a2", new LedgerAction("a2", "step-1", 1, 1));
    ledger.put("a3", new LedgerAction("a3", "step-2", 0, 1));
    ledger.put("admitted", new LedgerAction("admitted", "step-2", 1, 0));
    return ledger;
  }

  private static ArrayNode items(ObjectNode... items) {
    ArrayNode out = JSON.createArrayNode();
    List.of(items).forEach(out::add);
    return out;
  }

  @Test
  void derivesOneStepItemPerStepAndMergesInRuledOrder() {
    ArrayNode out =
        GuidedRecordingTimings.acceptAndDerive(
            items(
                action("a1", "step-1", 0, 100, 400),
                action("a2", "step-1", 1, 500, 900),
                action("a3", "step-2", 0, 1000, null)),
            ledger(),
            LIMITS);

    assertThat(out).hasSize(5);
    // startMs ties: step sorts before action (prefixReplay, step, clarificationWait, action).
    assertThat(out.get(0).toString())
        .isEqualTo(
            "{\"kind\":\"step\",\"stepId\":\"step-1\",\"admissionId\":null,\"ordinal\":null,"
                + "\"startMs\":100,\"endMs\":900}");
    assertThat(out.get(1).path("kind").asText()).isEqualTo("action");
    assertThat(out.get(1).path("admissionId").asText()).isEqualTo("a1");
    assertThat(out.get(2).path("admissionId").asText()).isEqualTo("a2");
    // A step whose last action has no observed completion has endMs null.
    assertThat(out.get(3).toString())
        .isEqualTo(
            "{\"kind\":\"step\",\"stepId\":\"step-2\",\"admissionId\":null,\"ordinal\":null,"
                + "\"startMs\":1000,\"endMs\":null}");
    assertThat(out.get(4).path("admissionId").asText()).isEqualTo("a3");
    // IDs and integers only: exactly the six public fields on every item.
    out.forEach(
        item ->
            assertThat(item.fieldNames())
                .toIterable()
                .containsExactly("kind", "stepId", "admissionId", "ordinal", "startMs", "endMs"));
  }

  @Test
  void anEmptyListAndASubsetOfTheDispatchedActionsAreAccepted() {
    assertThat(GuidedRecordingTimings.acceptAndDerive(items(), ledger(), LIMITS)).isEmpty();
    // a2 and a3 were dispatched but never reached the runner: a subset is honest evidence.
    assertThat(
            GuidedRecordingTimings.acceptAndDerive(
                items(action("a1", "step-1", 0, 0, 0)), ledger(), LIMITS))
        .hasSize(2);
  }

  @Test
  void endMsIsTakenFromTheActionWithTheGreatestStartNotTheLargestEnd() {
    ArrayNode out =
        GuidedRecordingTimings.acceptAndDerive(
            items(action("a1", "step-1", 0, 10, 5000), action("a2", "step-1", 1, 20, 30)),
            ledger(),
            LIMITS);
    assertThat(out.get(0).path("startMs").asInt()).isEqualTo(10);
    assertThat(out.get(0).path("endMs").asInt()).isEqualTo(30);
  }

  private static void refused(Consumer<ArrayNode> mutate) {
    ArrayNode body =
        items(action("a1", "step-1", 0, 100, 200), action("a2", "step-1", 1, 300, 400));
    mutate.accept(body);
    assertThatThrownBy(() -> GuidedRecordingTimings.acceptAndDerive(body, ledger(), LIMITS))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void refusesEveryRuledSemanticViolation() {
    refused(b -> b.add(action("unknown", "step-2", 0, 500, 600)));
    refused(b -> b.add(action("admitted", "step-2", 1, 500, 600)));
    refused(b -> ((ObjectNode) b.get(1)).put("stepId", "step-2"));
    refused(b -> ((ObjectNode) b.get(1)).put("ordinal", 7));
    refused(b -> b.add(action("a2", "step-1", 1, 500, 600)));
    refused(b -> ((ObjectNode) b.get(0)).put("startMs", 350).put("endMs", 360));
    refused(b -> ((ObjectNode) b.get(1)).put("endMs", 299));
    refused(b -> ((ObjectNode) b.get(1)).put("startMs", 600_001).put("endMs", 600_002));
    refused(b -> ((ObjectNode) b.get(1)).put("endMs", 600_001));
    refused(b -> ((ObjectNode) b.get(1)).put("startMs", -1));
    for (String kind : List.of("step", "clarificationWait", "prefixReplay")) {
      refused(b -> ((ObjectNode) b.get(0)).put("kind", kind));
    }
  }

  @Test
  void theScaleGuardUsesTheSessionsOwnLimits() {
    Limits shorter = new Limits(1, 200, 100);
    assertThatThrownBy(
            () ->
                GuidedRecordingTimings.acceptAndDerive(
                    items(action("a1", "step-1", 0, 1001, null)), ledger(), shorter))
        .hasMessage("INVALID_CONTRACT");
    assertThat(
            GuidedRecordingTimings.acceptAndDerive(
                items(action("a1", "step-1", 0, 1000, 1000)), ledger(), shorter))
        .hasSize(2);
  }

  @Test
  void perKindCapsFollowTheSessionLimits() {
    assertThatThrownBy(
            () ->
                GuidedRecordingTimings.acceptAndDerive(
                    items(action("a1", "step-1", 0, 1, 2), action("a2", "step-1", 1, 3, 4)),
                    ledger(),
                    new Limits(600, 1, 100)))
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(
            () ->
                GuidedRecordingTimings.acceptAndDerive(
                    items(action("a1", "step-1", 0, 1, 2), action("a3", "step-2", 0, 3, 4)),
                    ledger(),
                    new Limits(600, 200, 1)))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void stepIdTiesBreakInCodePointOrder() {
    // U+1F600 (surrogate pair in UTF-16) is above U+FFFD in code-point order, below it in UTF-16.
    ObjectNode high = JSON.createObjectNode().put("kind", "step").put("stepId", "😀");
    ObjectNode low = JSON.createObjectNode().put("kind", "step").put("stepId", "�");
    high.putNull("ordinal").put("startMs", 5);
    low.putNull("ordinal").put("startMs", 5);
    assertThat(GuidedRecordingTimings.ORDER.compare(low, high)).isNegative();
  }

  @Test
  void equalMeasuredAttemptCoordinatesUseAdmissionIdentityWithoutChangingReadings() {
    var admissions =
        Map.of(
            "a-old", new LedgerAction("a-old", "step-1", 0, 1),
            "b-new", new LedgerAction("b-new", "step-1", 0, 1));
    var old = action("a-old", "step-1", 0, 100, 105);
    var replacement = action("b-new", "step-1", 0, 100, 110);
    var originalOld = old.deepCopy();
    var originalReplacement = replacement.deepCopy();
    var accepted =
        GuidedRecordingTimings.acceptAndDerive(items(old, replacement), admissions, LIMITS);
    assertThat(accepted).hasSize(3);
    assertThat(accepted.get(1)).isEqualTo(originalOld);
    assertThat(accepted.get(2)).isEqualTo(originalReplacement);
    assertThat(accepted.get(0).path("startMs").asInt()).isEqualTo(100);
    assertThat(accepted.get(0).path("endMs").asInt()).isEqualTo(110);
    assertThat(old).isEqualTo(originalOld);
    assertThat(replacement).isEqualTo(originalReplacement);
    assertThatThrownBy(
            () ->
                GuidedRecordingTimings.acceptAndDerive(items(replacement, old), admissions, LIMITS))
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(
            () ->
                GuidedRecordingTimings.acceptAndDerive(
                    items(old, old.deepCopy()), admissions, LIMITS))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void admissionTieBreakIsScalarAndNeverCreatesAnAbsentPreNativeReading() {
    var admissions =
        Map.of(
            "�", new LedgerAction("�", "step-1", 0, 1),
            "😀", new LedgerAction("😀", "step-1", 0, 1),
            "never-started", new LedgerAction("never-started", "step-1", 0, 1));
    var first = action("�", "step-1", 0, 8, null);
    var second = action("😀", "step-1", 0, 8, null);
    var accepted = GuidedRecordingTimings.acceptAndDerive(items(first, second), admissions, LIMITS);
    assertThat(accepted).hasSize(3);
    assertThat(accepted.get(1)).isEqualTo(first);
    assertThat(accepted.get(2)).isEqualTo(second);
    assertThat(accepted.toString()).doesNotContain("never-started");
    assertThat(accepted.get(0).path("endMs").isNull()).isTrue();
    assertThat(GuidedRecordingTimings.ORDER.compare(first, second)).isNegative();
  }

  // ARCH015-03 T1 parity with the runner (validation ledger rows 83/84). The same vector file
  // drives studio-runner/test/guided/evidence.test.ts; `wire` is what the runner sends.
  private static final Path TIMING_ORDER_VECTORS =
      Path.of("../docs/specs/studio-observed-authoring/contracts/v3/timing-order-vectors.json");

  private static JsonNode timingOrder() throws IOException {
    return JSON.readTree(Files.readString(TIMING_ORDER_VECTORS));
  }

  private static Map<String, LedgerAction> vectorLedger(JsonNode entries) {
    Map<String, LedgerAction> ledger = new LinkedHashMap<>();
    for (JsonNode e : entries) {
      String id = e.path("admissionId").asText();
      ledger.put(
          id,
          new LedgerAction(
              id,
              e.path("stepId").asText(),
              e.path("ordinal").asInt(),
              e.path("dispatchCount").asInt()));
    }
    return ledger;
  }

  private static Limits vectorLimits(JsonNode vector) {
    JsonNode l = vector.path("limits");
    return new Limits(
        l.path("maxSessionSeconds").asLong(),
        l.path("maxActions").asLong(),
        l.path("maxSourceSteps").asLong());
  }

  /** Accepts the runner's wire exactly as the vector states, and refuses it reversed. */
  private static void acceptsWireAsStated(JsonNode vector, JsonNode c) {
    String name = c.path("name").asText();
    Map<String, LedgerAction> ledger = vectorLedger(c.path("ledger"));
    ArrayNode wire = (ArrayNode) c.path("wire").deepCopy();
    ArrayNode accepted = GuidedRecordingTimings.acceptAndDerive(wire, ledger, vectorLimits(vector));
    assertThat(accepted).as(name).isEqualTo(c.path("accepted"));
    assertThat(wire).as(name + " readings unchanged").isEqualTo(c.path("wire"));
    for (JsonNode item : accepted) {
      assertThat(item.fieldNames())
          .toIterable()
          .as(name)
          .containsExactly("kind", "stepId", "admissionId", "ordinal", "startMs", "endMs");
    }
    // Every dispatched admission without a measured reading stays absent; nothing is invented.
    List<String> measured = new ArrayList<>();
    c.path("wire").forEach(item -> measured.add(item.path("admissionId").asText()));
    for (JsonNode item : accepted) {
      if (item.path("kind").asText().equals(GuidedRecordingTimings.ACTION)) {
        assertThat(measured).as(name).contains(item.path("admissionId").asText());
      }
    }
    assertThat(accepted.size() - measured.size())
        .as(name + " one derived step per measured step")
        .isEqualTo((int) measured.stream().map(id -> ledger.get(id).stepId()).distinct().count());
    // ORDER restores the stated wire from the runner's own reading order.
    List<JsonNode> fromReadings = new ArrayList<>();
    for (JsonNode r : c.path("readings")) {
      for (JsonNode item : c.path("wire")) {
        if (item.path("admissionId").equals(r.path("admissionId"))) {
          fromReadings.add(item);
        }
      }
    }
    fromReadings.sort(GuidedRecordingTimings.ORDER);
    assertThat(fromReadings).as(name).containsExactlyElementsOf(c.path("wire"));
    if (wire.size() > 1) {
      ArrayNode reversed = JSON.createArrayNode();
      for (int i = wire.size() - 1; i >= 0; i--) {
        reversed.add(wire.get(i).deepCopy());
      }
      assertThatThrownBy(
              () -> GuidedRecordingTimings.acceptAndDerive(reversed, ledger, vectorLimits(vector)))
          .as(name + " reversed")
          .hasMessage("INVALID_CONTRACT");
    }
  }

  private static List<JsonNode> casesFor(JsonNode vector, int ledgerRow) {
    List<JsonNode> out = new ArrayList<>();
    vector
        .path("cases")
        .forEach(
            c -> {
              if (c.path("ledgerRow").asInt() == ledgerRow) {
                out.add(c);
              }
            });
    assertThat(out).as("vector cases for ledger row " + ledgerRow).isNotEmpty();
    return out;
  }

  @Test
  void distinctAdmissionsWithIdenticalMeasuredKeysRemainDistinct() throws IOException {
    JsonNode vector = timingOrder();
    for (JsonNode c : casesFor(vector, 83)) {
      acceptsWireAsStated(vector, c);
    }
    Map<String, LedgerAction> ledger = vectorLedger(vector.path("refusedLedger"));
    assertThat(vector.path("refused").size()).isPositive();
    for (JsonNode refused : vector.path("refused")) {
      ArrayNode body = (ArrayNode) refused.path("timings").deepCopy();
      assertThatThrownBy(
              () -> GuidedRecordingTimings.acceptAndDerive(body, ledger, vectorLimits(vector)))
          .as(refused.path("name").asText())
          .hasMessage("INVALID_CONTRACT");
    }
  }

  @Test
  void tieEndSelectionAndUnicodeOrderMatchRunner() throws IOException {
    JsonNode vector = timingOrder();
    assertThat(vector.path("kindOrder"))
        .containsExactly(
            JSON.getNodeFactory().textNode(GuidedRecordingTimings.PREFIX_REPLAY),
            JSON.getNodeFactory().textNode(GuidedRecordingTimings.STEP),
            JSON.getNodeFactory().textNode(GuidedRecordingTimings.CLARIFICATION_WAIT),
            JSON.getNodeFactory().textNode(GuidedRecordingTimings.ACTION));
    for (JsonNode c : casesFor(vector, 84)) {
      acceptsWireAsStated(vector, c);
    }
  }
}
