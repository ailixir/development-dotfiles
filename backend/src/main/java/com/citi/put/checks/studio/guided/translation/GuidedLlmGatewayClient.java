package com.citi.put.checks.studio.guided.translation;

/** Authoring-only provider seam; never used by ordinary saved execution. */
public interface GuidedLlmGatewayClient {
  GuidedModelResponse propose(GuidedModelRequest request, GuidedCallBudget budget);
}
