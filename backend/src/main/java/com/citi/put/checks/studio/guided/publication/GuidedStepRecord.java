package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;

/**
 * The one frozen step record {@code {kind, code, captures, uses, sourceHash}} (ADR-SC-008 D2). The
 * backend treats {@code code} as opaque data: it checks the record's identity, size and
 * persistability only. Syntax admission is the runner's, before any effect.
 */
final class GuidedStepRecord {
  /** The byte cap of {@code code} (16 KiB). */
  static final int MAX_CODE_BYTES = 16384;

  private GuidedStepRecord() {}

  /**
   * Refuses, with a closed code, a record whose kind is not {@code step}, whose sourceHash is not
   * the canonical-JSON SHA-256 of its code, whose code is over the cap, or whose code holds a
   * character a stored document cannot carry.
   *
   * @param mismatchStatus HTTP status of the evidence-mismatch refusal (422 while deriving, 409
   *     while verifying a stored revision)
   */
  static void check(JsonNode operation, int mismatchStatus) {
    JsonNode code = operation.path("code");
    require(code.isTextual(), "EVIDENCE_MISMATCH", mismatchStatus);
    String text = code.textValue();
    require(isStorable(text), "INVALID_CONTRACT", 422);
    require(text.getBytes(StandardCharsets.UTF_8).length <= MAX_CODE_BYTES, "BUDGET_EXCEEDED", 413);
    require(
        operation.path("kind").asText().equals("step")
            && operation.path("sourceHash").isTextual()
            && GuidedContracts.hash(code).equals(operation.path("sourceHash").asText()),
        "EVIDENCE_MISMATCH",
        mismatchStatus);
  }

  /** JSONB cannot store U+0000, and a lone surrogate has no UTF-8 form. */
  static boolean isStorable(String text) {
    for (int at = 0; at < text.length(); at++) {
      char c = text.charAt(at);
      if (c == 0) {
        return false;
      }
      if (Character.isHighSurrogate(c)) {
        if (at + 1 >= text.length() || !Character.isLowSurrogate(text.charAt(at + 1))) {
          return false;
        }
        at++;
      } else if (Character.isLowSurrogate(c)) {
        return false;
      }
    }
    return true;
  }
}
