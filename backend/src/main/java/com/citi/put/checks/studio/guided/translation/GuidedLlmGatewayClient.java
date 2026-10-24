package com.citi.put.checks.studio.guided.translation;

/** Authoring-only provider seam; never used by ordinary saved execution. */
public interface GuidedLlmGatewayClient {
  GuidedModelResponse propose(GuidedModelRequest request, GuidedCallBudget budget);

  /** Legacy implementations retain their original single send and two-argument dispatch. */
  default GuidedModelResponse propose(
      GuidedModelRequest request,
      GuidedCallBudget budget,
      GuidedRefusalDiagnostics.Capture capture) {
    return propose(request, budget);
  }
}
