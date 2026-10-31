package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * One WARN for every model proposal the backend refuses on apply, so a repeated repairable refusal
 * can be traced to the exact check. The check id is the throwing frame plus its caller (class,
 * method and line only), and the facts are counts; the log never carries step text, page text,
 * literals or locators.
 */
final class GuidedRejectionDiagnostics {
  private static final Logger LOG = LoggerFactory.getLogger(GuidedRejectionDiagnostics.class);
  private static final String PACKAGE = "com.citi.put.checks.studio.";

  private GuidedRejectionDiagnostics() {}

  static void log(
      GuidedModelRequest.Kind kind,
      int attempt,
      JsonNode proposal,
      GuidedSessionException failure) {
    LOG.warn(
        "Guided proposal refused kind={} attempt={} code={} check={} sourceReferences={}"
            + " obligations={} needIds={}",
        kind,
        attempt,
        failure.getMessage(),
        check(failure),
        count(proposal, "sourceReferences"),
        count(proposal, "obligations"),
        needIds(proposal));
  }

  /** Distinct needIds the obligations carry (a count, never the ids); -1 without obligations. */
  private static int needIds(JsonNode proposal) {
    JsonNode obligations = proposal == null ? null : proposal.path("obligations");
    if (obligations == null || !obligations.isArray()) {
      return -1;
    }
    var ids = new java.util.HashSet<String>();
    for (JsonNode item : obligations) {
      if (item.path("needId").isTextual()) {
        ids.add(item.path("needId").asText());
      }
    }
    return ids.size();
  }

  /** The throwing check and its caller, skipping the shared {@code require} helpers. */
  static String check(Throwable failure) {
    var frames = new java.util.ArrayList<String>();
    for (StackTraceElement frame : failure.getStackTrace()) {
      String owner = frame.getClassName();
      if (!owner.startsWith(PACKAGE)
          || owner.equals(GuidedSessionException.class.getName())
          || frame.getMethodName().startsWith("lambda$")) {
        continue;
      }
      frames.add(
          owner.substring(owner.lastIndexOf('.') + 1)
              + "."
              + frame.getMethodName()
              + ":"
              + frame.getLineNumber());
      if (frames.size() == 2) {
        break;
      }
    }
    return String.join("<", frames);
  }

  private static int count(JsonNode proposal, String field) {
    JsonNode value = proposal == null ? null : proposal.path(field);
    return value != null && value.isArray() ? value.size() : -1;
  }
}
