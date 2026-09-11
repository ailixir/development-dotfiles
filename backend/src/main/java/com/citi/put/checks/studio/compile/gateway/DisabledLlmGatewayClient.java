package com.citi.put.checks.studio.compile.gateway;

/**
 * The default client when {@code studio.compile.gateway.enabled=false} (Story 10.5, AC-6).
 *
 * <p>Opens no socket and holds no SDK state, so a stock deployment cannot reach an LLM by accident.
 * Draft persistence must remain independent of this outcome (architecture &sect;4.7).
 */
public class DisabledLlmGatewayClient implements LlmGatewayClient {

  private final GatewayAuditLogger auditLogger;

  public DisabledLlmGatewayClient(GatewayAuditLogger auditLogger) {
    this.auditLogger = auditLogger;
  }

  @Override
  public CompileResponse propose(CompileRequest request) {
    CompileResponse response =
        CompileResponse.failure(
            GatewayOutcome.DISABLED,
            GatewayErrorCode.GATEWAY_UNAVAILABLE,
            "studio.compile.gateway.enabled=false",
            null,
            0,
            0L,
            0,
            0);
    auditLogger.audit(request, null, response);
    return response;
  }
}
