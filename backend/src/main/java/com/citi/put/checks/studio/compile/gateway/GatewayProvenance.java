package com.citi.put.checks.studio.compile.gateway;

/**
 * What the client actually sent and what the gateway actually reported back (Story 10.5, AC-8).
 *
 * <p>Values are recorded as sent/returned, never as configured-but-unused, so a later audit can
 * tell a configuration drift from a proxy substitution.
 *
 * @param model model identifier requested by the client
 * @param modelVersion model version reported by the gateway, or {@code null} when it reports none
 * @param promptVersion prompt version passed through from the {@link CompileRequest}
 * @param sdkVersion version of the Vertex AI SDK that issued the call
 * @param structuredOutput whether a JSON response was requested
 * @param temperature legacy compatibility field; {@code 0} means no sampling temperature was sent
 */
public record GatewayProvenance(
    String model,
    String modelVersion,
    String promptVersion,
    String sdkVersion,
    boolean structuredOutput,
    double temperature) {}
