package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.text;
import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** One binding shape for foreground and scheduled authority; never resolves secrets. */
final class ObservedReplayBindingBuilder {
  private final GuidedContracts contracts;
  private final ObservedReplayPins pins;
  private final ObservedReplayProperties properties;
  private final Clock clock;

  ObservedReplayBindingBuilder(
      GuidedContracts contracts,
      ObservedReplayPins pins,
      ObservedReplayProperties properties,
      Clock clock) {
    this.contracts = contracts;
    this.pins = pins;
    this.properties = properties;
    this.clock = clock;
  }

  ObservedReplayAuthorization.Prepared build(
      UUID testId,
      UUID revisionId,
      String principal,
      String csiId,
      ObjectNode verified,
      boolean checkBeforePins) {
    Instant issued = PublicationContracts.millisecond(clock.instant());
    Instant ceiling = issued.plusMillis(properties.authorizationTtlMs());
    if (checkBeforePins) {
      ceiling = PublicationContracts.millisecond(ceiling);
      require(ceiling.isAfter(clock.instant()), "AUTHORIZATION_EXPIRED", 409);
    }
    UUID executionId = UUID.randomUUID(), attemptId = UUID.randomUUID();
    ObjectNode scope = PublicationContracts.copy(verified.path("policy").path("scope"));
    scope.put("principalId", principal);
    String scopeHash = GuidedContracts.hash(scope);
    ObjectNode policy = pins.policy(scope);
    ObjectNode supported = pins.supported(verified.path("artifact").path("profile"), null);
    if (!checkBeforePins) {
      ceiling = PublicationContracts.millisecond(ceiling);
      require(ceiling.isAfter(clock.instant()), "AUTHORIZATION_EXPIRED", 409);
    }
    ObjectNode grant =
        contracts
            .object()
            .put("version", 1)
            .put("grantId", UUID.randomUUID().toString())
            .put("executionId", executionId.toString())
            .put("attemptId", attemptId.toString())
            .put("revisionId", revisionId.toString())
            .put("revisionDigest", text(verified.path("receipt"), "revisionDigest"))
            .put("principalId", principal)
            .put("csiId", csiId)
            .put("scopeHash", scopeHash)
            .put("profileHash", GuidedContracts.hash(supported.path("profile")))
            .put("buildHash", GuidedContracts.hash(supported.path("build")))
            .put("currentPolicyHash", GuidedContracts.hash(policy))
            .put("issuedAt", PublicationContracts.time(issued))
            .put("expiresAt", PublicationContracts.time(ceiling));
    ObjectNode binding =
        contracts
            .object()
            .put("version", 1)
            .put("executionId", executionId.toString())
            .put("startedAt", PublicationContracts.time(issued))
            .put("attemptId", attemptId.toString())
            .put("revisionId", revisionId.toString())
            .put("testId", testId.toString())
            .put("csiId", csiId)
            .put("principalId", principal)
            .put("environment", text(scope, "environment"));
    for (String key :
        List.of(
            "revisionDigest",
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "publicationEvidenceHash")) {
      binding.set(key, verified.path("receipt").path(key));
    }
    binding.set("configurationHash", verified.path("artifact").path("configurationHash"));
    binding.set("requiredProfile", supported.path("profile"));
    binding.set("requiredBuild", supported.path("build"));
    binding.set("scope", scope);
    binding.put("scopeHash", scopeHash).put("currentPolicyHash", GuidedContracts.hash(policy));
    binding.set("replayGrant", grant);
    contracts.validate("v3/replay-job#/definitions/ExecutionBinding", binding);
    return new ObservedReplayAuthorization.Prepared(binding);
  }
}
