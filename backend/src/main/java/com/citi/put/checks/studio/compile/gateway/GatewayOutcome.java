package com.citi.put.checks.studio.compile.gateway;

/**
 * Audit outcome vocabulary for a single gateway call (Story 10.5, AC-9).
 *
 * <p>This is the only outcome vocabulary written to the gateway audit log. Caller-facing error
 * identifiers live in {@link GatewayErrorCode}.
 */
public enum GatewayOutcome {
  /** The gateway answered and the answer parsed and validated against the artifact schema. */
  OK,
  /** The gateway answered but the payload could not be extracted or failed schema validation. */
  PARSE_FAILURE,
  /** The request deadline elapsed. Never retried (Story 10.5, AC-4). */
  TIMEOUT,
  /** A definite transport failure that survived the bounded transport retry. */
  TRANSPORT,
  /** The bounded-concurrency semaphore was saturated; the call was rejected without queueing. */
  BUSY,
  /** Input exceeded {@code maxInputBytes} or the response exceeded {@code maxOutputBytes}. */
  TOO_LARGE,
  /** The gateway is disabled by configuration; no network access was attempted. */
  DISABLED
}
