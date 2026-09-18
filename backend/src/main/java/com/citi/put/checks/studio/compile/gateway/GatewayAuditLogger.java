package com.citi.put.checks.studio.compile.gateway;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.StringJoiner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The single audit line emitted per gateway call (Story 10.5, AC-9; architecture &sect;4.7).
 *
 * <p>Built from an explicit allow-list of fields. The prompt, the response body, resolved values
 * and the text surrounding a placeholder are structurally unable to reach it: no method here takes
 * them.
 */
public class GatewayAuditLogger {

  /** Dedicated logger name so deployments can route or retain the audit stream separately. */
  public static final String AUDIT_LOGGER = "studio.compile.gateway.audit";

  private static final Logger AUDIT = LoggerFactory.getLogger(AUDIT_LOGGER);
  private static final Logger DIAGNOSTIC = LoggerFactory.getLogger(GatewayAuditLogger.class);

  /**
   * Writes the audit line at INFO — the only INFO log this package emits.
   *
   * @param request the call's metadata source
   * @param model model identifier actually requested, {@code null} when no call was issued
   * @param response the call outcome
   */
  public void audit(CompileRequest request, String model, CompileResponse response) {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("testId", request.testId());
    fields.put("csiId", request.csiId());
    fields.put("principal", request.principal());
    fields.put("compileRequestId", request.compileRequestId());
    fields.put("attempt", request.attempt());
    fields.put("model", model);
    fields.put("promptVersion", request.promptVersion());
    fields.put("syntaxReferenceVersion", request.syntaxReferenceVersion());
    fields.put("latencyMs", response.latencyMs());
    fields.put("outcome", response.outcome());
    fields.put("inputBytes", response.inputBytes());
    fields.put("outputBytes", response.outputBytes());
    fields.put("retries", response.retries());

    StringJoiner line = new StringJoiner(" ", "studio.gateway.call ", "");
    fields.forEach((key, value) -> line.add(key + "=" + value));
    AUDIT.info(line.toString());
  }

  /**
   * Records why a call failed, at WARN, separately from the audit line.
   *
   * @param request the failing request, used only to redact its own content from the reason
   * @param outcome the audit outcome
   * @param reason an already scrubbed reason from {@link GatewayErrorScrubber}
   */
  public void diagnostic(CompileRequest request, GatewayOutcome outcome, String reason) {
    if (reason == null || reason.isBlank()) {
      return;
    }
    DIAGNOSTIC.warn(
        "studio.gateway.failure compileRequestId={} attempt={} outcome={} reason={}",
        request.compileRequestId(),
        request.attempt(),
        outcome,
        GatewayErrorScrubber.scrubText(reason, request));
  }
}
