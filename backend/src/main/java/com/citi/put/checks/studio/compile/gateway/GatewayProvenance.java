package com.citi.put.checks.studio.compile.gateway;

/**
 * What the client actually sent and what the gateway actually reported back (Story 10.5, AC-8;
 * Story 10.45, AC 4).
 *
 * <p>Values are recorded as sent/returned, never as configured-but-unused, so a later audit can
 * tell a configuration drift from a proxy substitution.
 *
 * <p>Token counts are copied from the vendor's {@code usageMetadata} per proposal. A count the
 * vendor did not report is {@code null}, never {@code 0}: a zero would claim "nothing was spent" or
 * "nothing was cached", which is not known (spec &sect;3.2.6 "Usage", DEP genai "null-not-zero").
 *
 * @param model model identifier requested by the client
 * @param modelVersion model version reported by the gateway, or {@code null} when it reports none
 * @param promptVersion prompt version passed through from the {@link CompileRequest}
 * @param sdkVersion version of the Vertex AI SDK that issued the call
 * @param structuredOutput whether a JSON response was requested
 * @param temperature legacy compatibility field; {@code 0} means no sampling temperature was sent
 * @param maxOutputTokens output-token ceiling actually sent, or {@code null} when unknown
 * @param finishReason the single candidate's finish reason as reported, or {@code null}
 * @param inputTokens vendor {@code promptTokenCount}, or {@code null} when not reported
 * @param outputTokens vendor {@code candidatesTokenCount}, or {@code null} when not reported
 * @param usageAvailable {@code true} only when both {@code inputTokens} and {@code outputTokens}
 *     were reported; {@code false} whenever the vendor reported no usage
 * @param thoughtsTokens vendor {@code thoughtsTokenCount}, or {@code null} when not reported
 * @param cachedContentTokens vendor {@code cachedContentTokenCount}, or {@code null} when not
 *     reported; recorded for observation only, never a savings claim (NFR-2)
 * @param totalTokens vendor {@code totalTokenCount}, or {@code null} when not reported
 * @param thinkingLevel thinking level actually requested, {@code PROVIDER_DEFAULT} when {@code
 *     thinkingConfig} was omitted, or {@code null} when the client does not record it
 */
public record GatewayProvenance(
    String model,
    String modelVersion,
    String promptVersion,
    String sdkVersion,
    boolean structuredOutput,
    double temperature,
    Integer maxOutputTokens,
    String finishReason,
    Integer inputTokens,
    Integer outputTokens,
    boolean usageAvailable,
    Integer thoughtsTokens,
    Integer cachedContentTokens,
    Integer totalTokens,
    String thinkingLevel) {

  /** Provenance without any vendor usage: every count is {@code null}. */
  public GatewayProvenance(
      String model,
      String modelVersion,
      String promptVersion,
      String sdkVersion,
      boolean structuredOutput,
      double temperature) {
    this(
        model,
        modelVersion,
        promptVersion,
        sdkVersion,
        structuredOutput,
        temperature,
        null,
        null,
        null,
        null,
        false);
  }

  /** Pre-10.45 shape: thoughts, cached, total and thinking level are recorded as unknown. */
  public GatewayProvenance(
      String model,
      String modelVersion,
      String promptVersion,
      String sdkVersion,
      boolean structuredOutput,
      double temperature,
      Integer maxOutputTokens,
      String finishReason,
      Integer inputTokens,
      Integer outputTokens,
      boolean usageAvailable) {
    this(
        model,
        modelVersion,
        promptVersion,
        sdkVersion,
        structuredOutput,
        temperature,
        maxOutputTokens,
        finishReason,
        inputTokens,
        outputTokens,
        usageAvailable,
        null,
        null,
        null,
        null);
  }
}
