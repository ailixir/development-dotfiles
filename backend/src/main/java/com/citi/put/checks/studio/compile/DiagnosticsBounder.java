package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.compile.validator.RunnerDiagnostic;
import com.citi.put.checks.studio.compile.validator.ValidationOutcome;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Bounds and redacts validator output <em>before</em> it is handed to {@code publishInvalid} (Story
 * 10.8, AC-15; closes the 10.4 LOW finding "{@code compile_diagnostics} unbounded until 10.8").
 *
 * <p>Bounding happens here rather than at the database because a hostile or merely broken validator
 * response is untrusted input the moment it is parsed, and the column is {@code jsonb}: a document
 * that is too large to store is also too large to have been built in memory and logged on the way.
 *
 * <p><strong>Truncation is explicit in the stored structure, never silent.</strong> Every level
 * that drops something records that it did: a step that lost diagnostics carries {@code
 * "truncated": true}; a message or excerpt that was cut ends with the marker; and a document that
 * had to shed whole steps to fit the byte cap carries a document-level {@code "truncated": true}
 * with a reason. A reviewer reading a short diagnostics list must be able to tell "there were no
 * more problems" from "we stopped telling you".
 *
 * <p>The structure keeps artifact-level diagnostics separate from step diagnostics, exactly as the
 * frozen {@code ValidateResponse} separates them, and holds one entry per original step so the
 * authoring UI can align diagnostics to the line the author wrote (AC-13).
 *
 * <p>Story 10.9 added {@code attempts} and {@code exhausted} as two more keys on the same document,
 * under the spellings ADR-002 &sect;16.2 fixes. It is deliberately <em>not</em> a second bounder: a
 * second bounding path is how the 64 KiB cap stops being true. The caps, the shedding order and the
 * truncation behaviour are unchanged.
 */
@Component
public class DiagnosticsBounder {

  /** Appended to a message or excerpt that was cut. */
  public static final String TRUNCATION_MARKER = "…[truncated]";

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final StudioCompileProperties.Diagnostics limits;

  public DiagnosticsBounder(StudioCompileProperties properties) {
    this.limits = properties.diagnostics();
  }

  /**
   * Builds the bounded {@code compile_diagnostics} document.
   *
   * @param outcome the validator verdict being recorded
   * @param stepCount the number of <em>original</em> source steps; the document always has exactly
   *     this many step entries, even when the validator returned fewer or more
   * @param attempts how many compile attempts this document describes the last of, at least 1
   * @param exhausted whether the repair bound was reached with the artifact still invalid
   * @return a JSON document within every configured cap
   */
  public String bound(ValidationOutcome outcome, int stepCount, int attempts, boolean exhausted) {
    if (attempts < 1) {
      throw new IllegalArgumentException("attempts must be >= 1 but was " + attempts);
    }
    Map<Integer, ValidationOutcome.StepVerdict> byIndex = new HashMap<>();
    for (ValidationOutcome.StepVerdict step : outcome.steps()) {
      byIndex.putIfAbsent(step.stepIndex(), step);
    }

    ObjectNode root = MAPPER.createObjectNode();
    root.put("validatorSchemaVersion", outcome.validatorSchemaVersion());
    root.set("artifact", boundedList(outcome.diagnostics()));

    ArrayNode steps = root.putArray("steps");
    for (int index = 0; index < stepCount; index++) {
      ValidationOutcome.StepVerdict verdict = byIndex.get(index);
      ObjectNode step = steps.addObject();
      step.put("stepIndex", index);
      step.put("ok", verdict == null || verdict.ok());
      List<RunnerDiagnostic> found = verdict == null ? List.of() : verdict.diagnostics();
      step.set("diagnostics", boundedList(found));
      step.put("truncated", found.size() > limits.maxPerStep());
    }
    root.put("truncated", false);
    // ADR-002 §16.2 fixes these two spellings so this producer and story 10.10's consumer are not
    // guessing at each other. They describe the LAST attempt only: earlier attempts' diagnostics
    // describe artifacts the author never saw, and accumulating three of them would either breach
    // the byte cap or make truncation the normal case.
    root.put("attempts", attempts);
    root.put("exhausted", exhausted);

    return shrinkToByteCap(root, steps);
  }

  private ArrayNode boundedList(List<RunnerDiagnostic> diagnostics) {
    ArrayNode array = MAPPER.createArrayNode();
    int kept = Math.min(diagnostics.size(), limits.maxPerStep());
    for (int i = 0; i < kept; i++) {
      RunnerDiagnostic diagnostic = diagnostics.get(i);
      ObjectNode node = array.addObject();
      node.put("code", clamp(diagnostic.code(), limits.maxMessageChars()));
      node.put("stepIndex", diagnostic.stepIndex());
      node.put("message", clamp(diagnostic.message(), limits.maxMessageChars()));
      node.put("node", clamp(diagnostic.node(), limits.maxMessageChars()));
      node.put("excerpt", clamp(diagnostic.excerpt(), limits.maxExcerptChars()));
    }
    return array;
  }

  /**
   * Sheds diagnostics until the serialized document fits the total byte cap, then says so.
   *
   * <p>Steps are emptied from the last to the first, so the earliest failing step — the one the
   * author will fix first — keeps its diagnostics longest. The step entries themselves are never
   * dropped: index alignment is what makes the document readable, and a document that is within the
   * cap because it forgot half the steps would be worse than one that says it was truncated.
   */
  private String shrinkToByteCap(ObjectNode root, ArrayNode steps) {
    String serialized = root.toString();
    if (utf8(serialized) <= limits.maxTotalBytes()) {
      return serialized;
    }
    root.put("truncated", true);
    root.put("truncationReason", "TOTAL_BYTES");

    for (int index = steps.size() - 1; index >= 0; index--) {
      ObjectNode step = (ObjectNode) steps.get(index);
      if (!step.path("diagnostics").isEmpty()) {
        step.putArray("diagnostics");
        step.put("truncated", true);
      }
      serialized = root.toString();
      if (utf8(serialized) <= limits.maxTotalBytes()) {
        return serialized;
      }
    }

    root.putArray("artifact");
    serialized = root.toString();
    if (utf8(serialized) <= limits.maxTotalBytes()) {
      return serialized;
    }
    // Nothing left to shed: the step list alone is over the cap. Keep the verdict and the marker.
    ObjectNode minimal = MAPPER.createObjectNode();
    minimal.put("validatorSchemaVersion", root.path("validatorSchemaVersion").asText(null));
    minimal.putArray("artifact");
    minimal.putArray("steps");
    minimal.put("truncated", true);
    minimal.put("truncationReason", "TOTAL_BYTES");
    // Carried through the last-resort shape too: `attempts` and `exhausted` are `required` on the
    // declared schema, and a document that dropped them would break its own contract at exactly
    // the moment a reader most needs to know that repair happened and stopped.
    minimal.put("attempts", root.path("attempts").asInt(1));
    minimal.put("exhausted", root.path("exhausted").asBoolean(false));
    return minimal.toString();
  }

  private static int utf8(String value) {
    return value.getBytes(StandardCharsets.UTF_8).length;
  }

  private static String clamp(String value, int max) {
    if (value == null) {
      return null;
    }
    if (value.length() <= max) {
      return value;
    }
    if (max <= TRUNCATION_MARKER.length()) {
      // A cap smaller than the marker is absurd configuration, but the cap still wins: a truncation
      // marker that pushed the value back over the bound would defeat the bound it announces.
      return value.substring(0, Math.max(0, max));
    }
    return value.substring(0, max - TRUNCATION_MARKER.length()) + TRUNCATION_MARKER;
  }
}
