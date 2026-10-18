package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.text;
import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** BFF-only explicit Run grant issuance; workers consume the resulting safe binding. */
public final class ObservedReplayAuthorizer {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;
  private final ObservedRevisionVerifier verifier;
  private final ObservedReplayPins pins;
  private final GuidedPublicationAuthorization authorization;
  private final ObservedReplayProperties properties;
  private final Clock clock;

  public ObservedReplayAuthorizer(
      JdbcTemplate jdbc,
      GuidedContracts contracts,
      ObservedRevisionVerifier verifier,
      ObservedReplayPins pins,
      GuidedPublicationAuthorization authorization,
      ObservedReplayProperties properties,
      Clock clock) {
    this.jdbc = jdbc;
    this.contracts = contracts;
    this.verifier = verifier;
    this.pins = pins;
    this.authorization = authorization;
    this.properties = properties;
    this.clock = clock;
  }

  public ObservedReplayAuthorization.Prepared authorize(
      UUID testId, Authentication caller, HttpServletRequest request) {
    require(
        !TransactionSynchronizationManager.isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    require(properties.enabled(), "RUNTIME_INCOMPATIBLE", 409);
    require(request != null && caller instanceof BffAuthenticationToken, "UNAUTHENTICATED", 401);
    var rows =
        jdbc.queryForList(
            "SELECT confirmed_revision_id,csi_id FROM ui_tests WHERE id=? AND deleted_at IS NULL"
                + " AND quarantined_at IS NULL",
            testId);
    require(
        rows.size() == 1 && rows.getFirst().get("confirmed_revision_id") != null,
        "FORBIDDEN_SCOPE",
        403);
    var row = rows.getFirst();
    UUID revisionId = (UUID) row.get("confirmed_revision_id");
    String principal = ((BffAuthenticationToken) caller).getPrincipal().userId(),
        csiId = row.get("csi_id").toString();
    ObjectNode verified = verifier.verify(revisionId);
    authorization.fresh(caller, request, principal, csiId, true);
    Instant issued = PublicationContracts.millisecond(clock.instant());
    Instant ceiling = issued.plusMillis(properties.authorizationTtlMs());
    UUID executionId = UUID.randomUUID(), attemptId = UUID.randomUUID();
    ObjectNode scope = PublicationContracts.copy(verified.path("policy").path("scope"));
    scope.put("principalId", principal);
    String scopeHash = GuidedContracts.hash(scope);
    ObjectNode policy = pins.policy(scope);
    ObjectNode supported = pins.supported(verified.path("artifact").path("profile"), null);
    ceiling = PublicationContracts.millisecond(ceiling);
    require(ceiling.isAfter(clock.instant()), "AUTHORIZATION_EXPIRED", 409);
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
