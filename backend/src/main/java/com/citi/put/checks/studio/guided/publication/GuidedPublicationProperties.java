package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Configuration may tighten publication limits; it cannot enlarge the approved contract. */
@ConfigurationProperties("studio.guided.publication")
public record GuidedPublicationProperties(
    boolean enabled,
    @DefaultValue("3") int maxValidationAttempts,
    @DefaultValue("15000") long validationTimeoutMs,
    @DefaultValue("5000") long authorizationTtlMs,
    @DefaultValue("8388608") int maxValidationBytes) {
  public GuidedPublicationProperties {
    require(
        maxValidationAttempts > 0
            && maxValidationAttempts <= 3
            && validationTimeoutMs > 0
            && validationTimeoutMs <= 15000
            && authorizationTtlMs > 0
            && authorizationTtlMs <= 5000
            && maxValidationBytes > 0
            && maxValidationBytes <= PublicationContracts.MAX_VALIDATION_BYTES,
        "RUNTIME_INCOMPATIBLE",
        409);
  }
}
