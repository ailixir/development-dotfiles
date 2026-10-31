package com.citi.put.checks.studio.guided.session;

import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Immutable per-session ceilings bind to the approved flat kebab-case configuration keys. */
@ConfigurationProperties("studio.guided-authoring")
public record GuidedSessionProperties(
    @DefaultValue("true") boolean enabled,
    @DefaultValue("600") int maxSessionSeconds,
    @DefaultValue("200") int maxActions,
    @DefaultValue("400") int maxObservations,
    @DefaultValue("100") int maxModelProposals,
    // The field counts request BYTES (wire + 2,048 per call, charged at the ceiling, never
    // refunded).
    @DefaultValue("1572864") int maxModelInputTokensTotal,
    @DefaultValue("98304") int maxModelOutputTokensTotal,
    @DefaultValue("524288") int maxObservationBytes,
    @DefaultValue("40000") int maxOutlineBytes,
    @DefaultValue("4194304") int maxSanitizedEvidenceBytesTotal,
    @DefaultValue("32") int maxRuntimeValues,
    @DefaultValue("4096") int maxRuntimeValueBytes,
    @DefaultValue("65536") int maxRuntimeValuesBytesTotal,
    @DefaultValue("100") int maxSourceSteps) {
  @ConstructorBinding
  public GuidedSessionProperties {}

  /** Convenience constructor for independently bounded configurations and fixture tests. */
  public GuidedSessionProperties(boolean enabled, Map<String, Integer> limits) {
    this(
        enabled,
        limits.getOrDefault("maxSessionSeconds", 600),
        limits.getOrDefault("maxActions", 200),
        limits.getOrDefault("maxObservations", 400),
        limits.getOrDefault("maxModelProposals", 100),
        limits.getOrDefault("maxModelInputTokensTotal", 1572864),
        limits.getOrDefault("maxModelOutputTokensTotal", 98304),
        limits.getOrDefault("maxObservationBytes", 524288),
        limits.getOrDefault("maxOutlineBytes", 40000),
        limits.getOrDefault("maxSanitizedEvidenceBytesTotal", 4194304),
        limits.getOrDefault("maxRuntimeValues", 32),
        limits.getOrDefault("maxRuntimeValueBytes", 4096),
        limits.getOrDefault("maxRuntimeValuesBytesTotal", 65536),
        limits.getOrDefault("maxSourceSteps", 100));
  }

  public ObjectNode snapshot(GuidedContracts contracts) {
    ObjectNode out = contracts.object();
    out.put("maxSessionSeconds", maxSessionSeconds);
    out.put("maxActions", maxActions);
    out.put("maxObservations", maxObservations);
    out.put("maxModelProposals", maxModelProposals);
    out.put("maxModelInputTokensTotal", maxModelInputTokensTotal);
    out.put("maxModelOutputTokensTotal", maxModelOutputTokensTotal);
    out.put("maxObservationBytes", maxObservationBytes);
    out.put("maxOutlineBytes", maxOutlineBytes);
    out.put("maxSanitizedEvidenceBytesTotal", maxSanitizedEvidenceBytesTotal);
    out.put("maxRuntimeValues", maxRuntimeValues);
    out.put("maxRuntimeValueBytes", maxRuntimeValueBytes);
    out.put("maxRuntimeValuesBytesTotal", maxRuntimeValuesBytesTotal);
    out.put("maxSourceSteps", maxSourceSteps);
    contracts.validate("limits", out);
    return out;
  }
}
