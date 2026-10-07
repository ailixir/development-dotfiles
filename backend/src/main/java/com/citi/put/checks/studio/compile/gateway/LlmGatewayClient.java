package com.citi.put.checks.studio.compile.gateway;

/**
 * Transport-level contract for asking the Citi/R2D2 LLM gateway to propose Playwright source (Story
 * 10.5, AC-1; architecture &sect;4.1).
 *
 * <p>Deliberately free of Vertex AI SDK types: story 10.8 and every test depend on this interface
 * only, and {@link GenAiLlmGatewayClient} is the single place that knows the SDK.
 */
public interface LlmGatewayClient {

  /**
   * Ask the gateway to propose an artifact for the given source.
   *
   * <p>Does not throw for expected gateway failures — see {@link CompileResponse}. Callers must not
   * make draft persistence conditional on this call (architecture &sect;4.7).
   *
   * @param request opaque token inputs plus audit metadata
   * @return the proposal, or a typed failure
   */
  CompileResponse propose(CompileRequest request);

  /** Nonsecret immutable settings used to bind compilation compatibility. */
  default String compilationSettings() {
    return "{\"adapter\":\"disabled-or-test\",\"envelopeVersion\":1}";
  }

  /**
   * Whether {@link CompileResponse#artifactJson()} holds the model's proposal envelope ({@code
   * {"version":1,"kind","steps":[{stepId,status,code}]}}) rather than an executable artifact.
   *
   * <p>Declared, never sniffed from the payload: when {@code true} the compile pipeline assembles
   * the artifact server-side — {@code stepIndex} and {@code originalText} come from the ordered
   * source, only {@code code} from the model — before the version gate and {@code /v1/validate}.
   * The default {@code false} keeps clients that already return artifacts unchanged.
   *
   * @return {@code true} when the response carries a proposal envelope
   */
  default boolean returnsProposalEnvelope() {
    return false;
  }

  /** Uses the same request-owned deadline across every repair. */
  default CompileResponse propose(
      CompileRequest request, com.citi.put.checks.studio.compile.CompileBudget budget) {
    budget.remaining();
    return propose(request);
  }
}
