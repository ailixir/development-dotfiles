package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
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
  private final com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization;
  private final ObservedReplayProperties properties;
  private final Clock clock;

  public ObservedReplayAuthorizer(
      JdbcTemplate jdbc,
      GuidedContracts contracts,
      ObservedRevisionVerifier verifier,
      ObservedReplayPins pins,
      com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization,
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

  /** Authorizes a Run of the confirmed revision. */
  public ObservedReplayAuthorization.Prepared authorize(
      UUID testId, Authentication caller, HttpServletRequest request) {
    return authorize(testId, null, caller, request);
  }

  /**
   * Authorizes a Run or a proof of {@code revisionId}, which the caller resolved (the runnable
   * revision, or the recorded candidate for "Verify again"). It must be this test's confirmed or
   * candidate revision; {@code null} means the confirmed one.
   */
  public ObservedReplayAuthorization.Prepared authorize(
      UUID testId, UUID requestedRevisionId, Authentication caller, HttpServletRequest request) {
    require(
        !TransactionSynchronizationManager.isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    require(properties.enabled(), "RUNTIME_INCOMPATIBLE", 409);
    require(request != null && caller instanceof BffAuthenticationToken, "UNAUTHENTICATED", 401);
    var rows =
        jdbc.queryForList(
            "SELECT confirmed_revision_id,candidate_revision_id,csi_id FROM ui_tests WHERE id=?"
                + " AND deleted_at IS NULL AND quarantined_at IS NULL",
            testId);
    require(rows.size() == 1, "FORBIDDEN_SCOPE", 403);
    var row = rows.getFirst();
    UUID confirmed = (UUID) row.get("confirmed_revision_id"),
        candidate = (UUID) row.get("candidate_revision_id");
    UUID revisionId = requestedRevisionId == null ? confirmed : requestedRevisionId;
    require(
        revisionId != null && (revisionId.equals(confirmed) || revisionId.equals(candidate)),
        "FORBIDDEN_SCOPE",
        403);
    String principal = ((BffAuthenticationToken) caller).getPrincipal().userId(),
        csiId = row.get("csi_id").toString();
    ObjectNode verified = verifier.verify(revisionId);
    authorization.fresh(caller, request, principal, csiId, true);
    return new ObservedReplayBindingBuilder(contracts, pins, properties, clock)
        .build(testId, revisionId, principal, csiId, verified, false);
  }
}
