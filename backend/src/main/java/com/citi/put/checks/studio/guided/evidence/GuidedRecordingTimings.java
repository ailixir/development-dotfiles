package com.citi.put.checks.studio.guided.evidence;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Semantic checks and the step derivation for {@code actionTimings} (STUDIO-OBS-013, ruling AR-1 R2
 * and R3 acceptance step 10). Pure: no I/O, no clock.
 *
 * <p>The runner sends {@code kind=action} items only, each one reading pair on the recording
 * timeline (R4). The backend refuses anything else, then derives one {@code step} item per step
 * that has at least one action, merges and sorts. It never re-rounds, re-bases or shifts a reading
 * (ADR-002 §11.7). Items carry IDs and integers only.
 */
public final class GuidedRecordingTimings {

  /** The kinds; the last two are reserved for OBS-015 and refused here. */
  public static final String ACTION = "action";

  public static final String STEP = "step";
  public static final String CLARIFICATION_WAIT = "clarificationWait";
  public static final String PREFIX_REPLAY = "prefixReplay";

  /** The schema ceiling: 200 actions + 100 steps/prefix replays + 100 clarification waits. */
  public static final int MAX_ITEMS = 400;

  private static final List<String> KIND_ORDER =
      List.of(PREFIX_REPLAY, STEP, CLARIFICATION_WAIT, ACTION);

  private GuidedRecordingTimings() {}

  /** One ledger admission, as studio_guided_actions holds it. */
  public record LedgerAction(String admissionId, String stepId, int ordinal, int dispatchCount) {}

  /** The session's own bounds (document.limits). */
  public record Limits(long maxSessionSeconds, long maxActions, long maxSourceSteps) {}

  /**
   * Checks the runner's items and returns the public list: derived step items merged with the
   * action items, in R2 order.
   *
   * @param timings the callback's {@code timings} array (already schema-valid)
   * @param ledger this session's admissions by admission id
   * @param limits this session's limits
   * @return the merged, sorted list to store and serve verbatim
   * @throws com.citi.put.checks.studio.guided.session.GuidedSessionException {@code 422
   *     INVALID_CONTRACT} for any refused item
   */
  public static ArrayNode acceptAndDerive(
      JsonNode timings, Map<String, LedgerAction> ledger, Limits limits) {
    require(timings != null && timings.isArray(), "INVALID_CONTRACT", 422);
    require(timings.size() <= limits.maxActions(), "INVALID_CONTRACT", 422);
    long ceiling = limits.maxSessionSeconds() * 1000L;
    Set<String> seen = new HashSet<>();
    List<JsonNode> actions = new ArrayList<>();
    for (JsonNode item : timings) {
      require(item.isObject(), "INVALID_CONTRACT", 422);
      require(item.path("kind").asText().equals(ACTION), "INVALID_CONTRACT", 422);
      require(item.path("admissionId").isTextual(), "INVALID_CONTRACT", 422);
      require(item.path("ordinal").isIntegralNumber(), "INVALID_CONTRACT", 422);
      require(item.path("stepId").isTextual(), "INVALID_CONTRACT", 422);
      require(item.path("startMs").isIntegralNumber(), "INVALID_CONTRACT", 422);
      JsonNode end = item.path("endMs");
      require(end.isNull() || end.isIntegralNumber(), "INVALID_CONTRACT", 422);
      String admissionId = item.path("admissionId").asText();
      require(seen.add(admissionId), "INVALID_CONTRACT", 422);
      LedgerAction action = ledger.get(admissionId);
      require(
          action != null
              && action.dispatchCount() == 1
              && action.stepId().equals(item.path("stepId").asText())
              && action.ordinal() == item.path("ordinal").asLong(),
          "INVALID_CONTRACT",
          422);
      long start = item.path("startMs").asLong();
      require(start >= 0 && start <= ceiling, "INVALID_CONTRACT", 422);
      if (!end.isNull()) {
        require(end.asLong() >= start && end.asLong() <= ceiling, "INVALID_CONTRACT", 422);
      }
      actions.add(item);
    }
    for (int i = 1; i < actions.size(); i++) {
      require(ORDER.compare(actions.get(i - 1), actions.get(i)) < 0, "INVALID_CONTRACT", 422);
    }

    List<JsonNode> merged = new ArrayList<>(actions);
    merged.addAll(steps(actions));
    require(merged.size() - actions.size() <= limits.maxSourceSteps(), "INVALID_CONTRACT", 422);
    merged.sort(ORDER);
    require(merged.size() <= MAX_ITEMS, "INVALID_CONTRACT", 422);
    ArrayNode out = JsonNodeFactory.instance.arrayNode();
    for (JsonNode item : merged) {
      out.add(canonicalItem(item));
    }
    return out;
  }

  /**
   * One step item per step id with at least one action: {@code startMs} is the minimum action
   * {@code startMs}; {@code endMs} is the {@code endMs} of that step's action with the greatest
   * {@code startMs} (null if that value is null). Selection over readings, not calibration.
   */
  static List<JsonNode> steps(List<JsonNode> actions) {
    Map<String, List<JsonNode>> byStep = new LinkedHashMap<>();
    for (JsonNode action : actions) {
      byStep.computeIfAbsent(action.path("stepId").asText(), k -> new ArrayList<>()).add(action);
    }
    List<JsonNode> steps = new ArrayList<>();
    for (var entry : byStep.entrySet()) {
      List<JsonNode> items = new ArrayList<>(entry.getValue());
      items.sort(ORDER);
      long start = items.getFirst().path("startMs").asLong();
      JsonNode last = items.getLast();
      ObjectNode step =
          JsonNodeFactory.instance
              .objectNode()
              .put("kind", STEP)
              .put("stepId", entry.getKey())
              .putNull("admissionId")
              .putNull("ordinal")
              .put("startMs", Math.toIntExact(start));
      if (last.path("endMs").isNull()) {
        step.putNull("endMs");
      } else {
        step.put("endMs", Math.toIntExact(last.path("endMs").asLong()));
      }
      steps.add(step);
    }
    return steps;
  }

  /**
   * R2 ordering: {@code startMs} ascending; ties by kind (prefixReplay, step, clarificationWait,
   * action), then {@code ordinal} ascending (null first), then {@code stepId} and finally {@code
   * admissionId} in Unicode scalar order (null first). ARCH015-03 preserves measured ties.
   */
  static final Comparator<JsonNode> ORDER =
      Comparator.<JsonNode>comparingLong(item -> item.path("startMs").asLong())
          .thenComparingInt(item -> KIND_ORDER.indexOf(item.path("kind").asText()))
          .thenComparingLong(
              item -> item.path("ordinal").isNull() ? -1L : item.path("ordinal").asLong())
          .thenComparing(item -> item.path("stepId").asText(), GuidedRecordingTimings::codePoints)
          .thenComparing(
              item -> item.path("admissionId").isNull() ? null : item.path("admissionId").asText(),
              Comparator.nullsFirst(GuidedRecordingTimings::codePoints));

  private static int codePoints(String a, String b) {
    int i = 0;
    int j = 0;
    while (i < a.length() && j < b.length()) {
      int x = a.codePointAt(i);
      int y = b.codePointAt(j);
      if (x != y) {
        return Integer.compare(x, y);
      }
      i += Character.charCount(x);
      j += Character.charCount(y);
    }
    return Integer.compare(a.length() - i, b.length() - j);
  }

  /** The six public fields, in schema order, and nothing else. */
  private static ObjectNode canonicalItem(JsonNode item) {
    ObjectNode out =
        JsonNodeFactory.instance
            .objectNode()
            .put("kind", item.path("kind").asText())
            .put("stepId", item.path("stepId").asText());
    if (item.path("admissionId").isTextual()) {
      out.put("admissionId", item.path("admissionId").asText());
    } else {
      out.putNull("admissionId");
    }
    if (item.path("ordinal").isIntegralNumber()) {
      out.put("ordinal", Math.toIntExact(item.path("ordinal").asLong()));
    } else {
      out.putNull("ordinal");
    }
    out.put("startMs", Math.toIntExact(item.path("startMs").asLong()));
    if (item.path("endMs").isIntegralNumber()) {
      out.put("endMs", Math.toIntExact(item.path("endMs").asLong()));
    } else {
      out.putNull("endMs");
    }
    return out;
  }
}
