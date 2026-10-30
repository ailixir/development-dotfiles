package com.citi.put.checks.studio.gateway;

/**
 * Caller-facing error identifiers for one gateway call (Story 10.5, AC-5, AC-6).
 *
 * <p>Separate from {@link GatewayOutcome} because a single audit outcome can map to more than one
 * caller-facing code: {@link GatewayOutcome#TOO_LARGE} covers both the pre-flight input rejection
 * and the post-flight response rejection.
 */
public enum GatewayErrorCode {
  /** The gateway is disabled by configuration. */
  GATEWAY_UNAVAILABLE,
  /** Bounded concurrency stayed saturated for the caller's whole remaining budget. */
  GATEWAY_BUSY,
  /** The request deadline elapsed. */
  GATEWAY_TIMEOUT,
  /** A definite transport failure. */
  GATEWAY_TRANSPORT,
  /** The response could not be parsed or failed schema validation. */
  GATEWAY_PARSE_FAILURE,
  /** Input exceeded {@code studio.gateway.max-input-bytes}; rejected pre-flight. */
  GATEWAY_INPUT_TOO_LARGE,
  /** Response exceeded {@code studio.gateway.max-output-bytes} and was discarded. */
  GATEWAY_OUTPUT_TOO_LARGE
}
