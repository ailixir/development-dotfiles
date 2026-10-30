package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** The trusted deployment catalog is configuration, never an artifact-supplied grant. */
@ConfigurationProperties("studio.observed-replay")
public record ObservedReplayProperties(
    @DefaultValue("true") boolean enabled,
    @DefaultValue("30000") long authorizationTtlMs,
    @DefaultValue("1048576") int maxArtifactBytes,
    @DefaultValue("4194304") int maxJobBytes,
    @DefaultValue("2097152") int maxExecuteFrameBytes,
    @DefaultValue("[]") String catalogJson,
    @DefaultValue("1280") int recordingWidth,
    @DefaultValue("720") int recordingHeight) {
  public ObservedReplayProperties {
    require(
        authorizationTtlMs > 0
            && authorizationTtlMs <= 30000
            && maxArtifactBytes > 0
            && maxArtifactBytes <= PublicationContracts.MAX_ARTIFACT_BYTES
            && maxJobBytes > 0
            && maxJobBytes <= PublicationContracts.MAX_JOB_BYTES
            && maxExecuteFrameBytes > 0
            && maxExecuteFrameBytes <= 2097152
            && recordingWidth > 0
            && recordingWidth <= 8192
            && recordingHeight > 0
            && recordingHeight <= 8192,
        "RUNTIME_INCOMPATIBLE",
        409);
  }
}
