package com.citi.put.checks.studio.compile.gateway;

import java.util.Optional;

/**
 * Outcome of one {@link LlmGatewayClient#propose(CompileRequest)} call (Story 10.5, AC-7, AC-8).
 *
 * <p>Never throws for an expected gateway failure: every failure mode is a value here so callers
 * (10.8) can leave the draft saved and the compile {@code STALE} (architecture &sect;4.7).
 *
 * @param outcome audit outcome vocabulary
 * @param errorCode caller-facing error identifier, {@code null} when {@code outcome == OK}
 * @param artifactJson schema-valid artifact document, non-null only when {@code outcome == OK}
 * @param failureReason scrubbed, truncated reason; never contains request or response content
 * @param provenance what was sent/returned; {@code null} when no call was issued
 * @param retries transport retries actually performed (0 when the first attempt succeeded)
 * @param latencyMs wall-clock duration of the call, including retries and backoff
 * @param inputBytes UTF-8 size of the transport payload
 * @param outputBytes UTF-8 size of the extracted response text, 0 when nothing was received
 */
public record CompileResponse(
    GatewayOutcome outcome,
    GatewayErrorCode errorCode,
    String artifactJson,
    String failureReason,
    GatewayProvenance provenance,
    int retries,
    long latencyMs,
    int inputBytes,
    int outputBytes) {

  public boolean isOk() {
    return outcome == GatewayOutcome.OK;
  }

  public Optional<String> artifact() {
    return Optional.ofNullable(artifactJson);
  }

  /** Successful proposal carrying a schema-valid artifact document. */
  public static CompileResponse ok(
      String artifactJson,
      GatewayProvenance provenance,
      int retries,
      long latencyMs,
      int inputBytes,
      int outputBytes) {
    return new CompileResponse(
        GatewayOutcome.OK,
        null,
        artifactJson,
        null,
        provenance,
        retries,
        latencyMs,
        inputBytes,
        outputBytes);
  }

  /** The gateway answered but the payload was unusable (AC-7). */
  public static CompileResponse parseFailure(
      String reason,
      GatewayProvenance provenance,
      int retries,
      long latencyMs,
      int inputBytes,
      int outputBytes) {
    return new CompileResponse(
        GatewayOutcome.PARSE_FAILURE,
        GatewayErrorCode.GATEWAY_PARSE_FAILURE,
        null,
        reason,
        provenance,
        retries,
        latencyMs,
        inputBytes,
        outputBytes);
  }

  /** Any non-parse failure mode. */
  public static CompileResponse failure(
      GatewayOutcome outcome,
      GatewayErrorCode errorCode,
      String reason,
      GatewayProvenance provenance,
      int retries,
      long latencyMs,
      int inputBytes,
      int outputBytes) {
    return new CompileResponse(
        outcome, errorCode, null, reason, provenance, retries, latencyMs, inputBytes, outputBytes);
  }
}
