package com.citi.put.checks.studio.compile.gateway;

/**
 * Caller-facing error identifiers returned on {@link CompileResponse} (Story 10.5, AC-5, AC-6).
 *
 * <p>Separate from {@link GatewayOutcome} because a single audit outcome can map to more than one
 * caller-facing code: {@link GatewayOutcome#TOO_LARGE} covers both the pre-flight input rejection
 * and the post-flight response rejection.
 */
public enum GatewayErrorCode {
  /** The gateway is disabled by configuration. */
  GATEWAY_UNAVAILABLE,
  /** Bounded concurrency saturated; the caller should retry later rather than queue. */
  GATEWAY_BUSY,
  /** The request deadline elapsed. */
  GATEWAY_TIMEOUT,
  /** A definite transport failure survived the bounded transport retry. */
  GATEWAY_TRANSPORT,
  /** The response could not be parsed or failed artifact-schema validation. */
  GATEWAY_PARSE_FAILURE,
  /** Input exceeded {@code studio.compile.gateway.max-input-bytes}; rejected pre-flight. */
  COMPILE_INPUT_TOO_LARGE,
  /** Response exceeded {@code studio.compile.gateway.max-output-bytes} and was discarded. */
  GATEWAY_OUTPUT_TOO_LARGE
}
