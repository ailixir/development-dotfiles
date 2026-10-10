package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.text;
import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CoreServiceClient;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Fresh Core authority, explicitly separate for active publication and immutable receipt reads. */
public final class GuidedPublicationAuthorization {
  private final CoreServiceClient core;
  private final CsiOwnershipEvaluator ownership;
  private final Clock clock;
  private final GuidedPublicationProperties properties;

  public GuidedPublicationAuthorization(
      CoreServiceClient core,
      CsiOwnershipEvaluator ownership,
      Clock clock,
      GuidedPublicationProperties properties) {
    this.core = core;
    this.ownership = ownership;
    this.clock = clock;
    this.properties = properties;
  }

  public BffAuthenticationToken fresh(
      Authentication caller,
      HttpServletRequest request,
      String expectedPrincipal,
      String csiId,
      boolean execution) {
    require(
        !TransactionSynchronizationManager.isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    require(
        caller instanceof BffAuthenticationToken && caller.isAuthenticated(),
        "UNAUTHENTICATED",
        401);
    String principal = ((BffAuthenticationToken) caller).getPrincipal().userId();
    require(principal.equals(expectedPrincipal), "FORBIDDEN_SCOPE", 403);
    String cookie =
        request.getCookies() == null
            ? null
            : Arrays.stream(request.getCookies())
                .filter(value -> value.getName().equals("put_session"))
                .map(jakarta.servlet.http.Cookie::getValue)
                .findFirst()
                .orElse(null);
    require(cookie != null && !cookie.isBlank(), "UNAUTHENTICATED", 401);
    BffAuthenticationToken fresh;
    try {
      fresh = new BffAuthenticationToken(core.getUserMe(cookie));
    } catch (com.citi.put.checks.security.CoreServiceUnauthorizedException failure) {
      throw new GuidedSessionException("UNAUTHENTICATED", 401);
    } catch (RuntimeException failure) {
      throw new GuidedSessionException("AUTHORITY_UNAVAILABLE", 503);
    }
    require(
        principal.equals(fresh.getPrincipal().userId())
            && (execution ? ownership.canExecute(fresh, csiId) : ownership.canRead(fresh, csiId)),
        "FORBIDDEN_SCOPE",
        403);
    return fresh;
  }

  public PublicationContracts.Grant authorizePublication(
      Authentication caller,
      HttpServletRequest request,
      PublicationContracts.Snapshot snapshot,
      JsonNode currentSession) {
    JsonNode identity = snapshot.identity(), base = identity.path("base");
    String principal = text(base, "originalPrincipalId"), csiId = text(base, "csiId");
    fresh(caller, request, principal, csiId, true);
    Instant deadline = clock.instant().plusMillis(properties.authorizationTtlMs());
    for (Instant ceiling :
        java.util.List.of(
            Instant.parse(text(identity, "validationDeadline")),
            Instant.parse(text(currentSession, "expiresAt")),
            Instant.parse(text(currentSession.path("owner"), "leaseExpiresAt")))) {
      if (deadline.isAfter(ceiling)) {
        deadline = ceiling;
      }
    }
    deadline = PublicationContracts.millisecond(deadline);
    require(deadline.isAfter(clock.instant()), "EXPIRED", 409);
    return new PublicationContracts.Grant(
        text(base, "sessionId"), principal, csiId, snapshot.hash(), deadline);
  }

  public void authorizeReceiptRead(
      Authentication caller, HttpServletRequest request, PublicationContracts.Receipt receipt) {
    JsonNode document = receipt.document();
    fresh(caller, request, text(document, "originalPrincipalId"), text(document, "csiId"), false);
  }
}
