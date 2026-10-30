package com.citi.put.checks.studio.guided.session;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.entity.UITest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.Authentication;

/**
 * The caller's latest terminal learning attempt per test (STUDIO-UNIFY-001.6 AC-09, D9-D15).
 *
 * <p>A pure read: no write, no row lock and no call outside the database. The answer is not an
 * existence oracle: a test the caller may not read, an unknown, deleted or quarantined test, and a
 * test with no terminal session of the caller are omitted, never refused.
 */
public final class GuidedLatestAttemptReader {
  private final GuidedSessionRepository repository;
  private final GuidedPublicPresentationProjector presentation;
  private final GuidedContracts contracts;
  private final StudioRepository tests;
  private final CsiOwnershipEvaluator ownership;

  public GuidedLatestAttemptReader(
      GuidedSessionRepository repository,
      GuidedPublicPresentationProjector presentation,
      GuidedContracts contracts,
      StudioRepository tests,
      CsiOwnershipEvaluator ownership) {
    this.repository = repository;
    this.presentation = presentation;
    this.contracts = contracts;
    this.tests = tests;
    this.ownership = ownership;
  }

  /** {@code testIds} are already parsed and bounded by the caller; duplicates collapse. */
  public JsonNode read(Authentication user, List<UUID> testIds) {
    GuidedSessionException.require(
        user instanceof BffAuthenticationToken && user.isAuthenticated(), "FORBIDDEN_SCOPE", 403);
    String principalId = ((BffAuthenticationToken) user).getPrincipal().userId();
    ObjectNode body = contracts.object();
    body.put("schemaVersion", 3);
    var attempts = body.putArray("attempts");
    repository
        .transaction(() -> latest(user, principalId, new LinkedHashSet<>(testIds)))
        .forEach(attempts::add);
    contracts.validate("v3/latest-attempts", body);
    return body;
  }

  private List<ObjectNode> latest(Authentication user, String principalId, Iterable<UUID> ids) {
    // findAllById hides deleted and quarantined tests through the @SQLRestriction on UITest.
    Map<String, UUID> readable = new HashMap<>();
    List<UUID> order = new ArrayList<>();
    for (UITest test : tests.findAllById(ids)) {
      if (test.getCsiId() != null && ownership.canRead(user, test.getCsiId())) {
        readable.put(test.getId().toString(), test.getId());
      }
    }
    for (UUID id : ids) {
      if (readable.containsKey(id.toString())) {
        order.add(id);
      }
    }
    Map<String, GuidedSessionRepository.Session> sessions = new HashMap<>();
    for (var session : repository.latestTerminal(readable.keySet(), principalId)) {
      sessions.put(session.document().path("testId").asText(), session);
    }
    List<ObjectNode> found = new ArrayList<>();
    for (UUID id : order) {
      var session = sessions.get(id.toString());
      ObjectNode attempt = session == null ? null : attempt(id, session);
      if (attempt != null) {
        found.add(attempt);
      }
    }
    return found;
  }

  /** One attempt, or null when this session cannot be described; it never fails the others. */
  private ObjectNode attempt(UUID testId, GuidedSessionRepository.Session session) {
    JsonNode document = session.document();
    String state = document.path("state").asText();
    JsonNode createdAt = document.path("createdAt");
    if (!createdAt.isTextual()) {
      return null;
    }
    ObjectNode attempt = contracts.object();
    attempt.put("testId", testId.toString());
    attempt.put("sessionId", document.path("sessionId").asText());
    attempt.put("state", state);
    attempt.put("startedAt", createdAt.asText());
    JsonNode errorCode = session.progress().path("errorCode");
    if (errorCode.isTextual()) {
      attempt.put("errorCode", errorCode.asText());
    } else {
      attempt.putNull("errorCode");
    }
    if (state.equals("FAILED")) {
      try {
        attempt.set("explanation", presentation.explanation(session));
      } catch (GuidedSessionException cannotProject) {
        return null;
      }
    } else {
      attempt.putNull("explanation");
    }
    return attempt;
  }
}
