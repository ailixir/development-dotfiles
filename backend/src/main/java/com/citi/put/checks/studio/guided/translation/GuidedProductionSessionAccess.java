package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.guided.session.GuidedSessionAccess;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;

/** Real source/revision/verification access, composed with only the later account handoff. */
public final class GuidedProductionSessionAccess
    implements GuidedSessionAccess, GuidedSessionService.StepVerifier {
  public interface AccountAccess {
    Snapshot resolve(Authentication user, JsonNode request);

    void checkCurrent(JsonNode session);
  }

  private final GuidedSourceSnapshotRepository snapshots;
  private final GuidedSourceClassifier classifier;
  private final GuidedSourceInputResolver resolver;
  private final GuidedTranslationStore store;
  private final GuidedStepVerifier verifier;
  private final CsiOwnershipEvaluator ownership;
  private final AccountAccess accounts;

  public GuidedProductionSessionAccess(
      GuidedSourceSnapshotRepository snapshots,
      GuidedSourceClassifier classifier,
      GuidedSourceInputResolver resolver,
      GuidedTranslationStore store,
      GuidedStepVerifier verifier,
      CsiOwnershipEvaluator ownership,
      AccountAccess accounts) {
    this.snapshots = snapshots;
    this.classifier = classifier;
    this.resolver = resolver;
    this.store = store;
    this.verifier = verifier;
    this.ownership = ownership;
    this.accounts = accounts;
  }

  @Override
  public Snapshot resolve(Authentication user, JsonNode request) {
    require(
        user instanceof BffAuthenticationToken && user.isAuthenticated(), "UNAUTHENTICATED", 401);
    ObjectNode current = snapshots.lockCurrent(UUID.fromString(request.path("testId").asText()));
    require(ownership.canExecute(user, current.path("csiId").asText()), "FORBIDDEN_SCOPE", 403);
    Snapshot account = accounts.resolve(user, request);
    JsonNode manifest = classifier.classify(current, account.scope());
    var steps = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
    for (JsonNode step : manifest.path("sourceSteps")) {
      steps.addObject().put("stepId", step.path("stepId").asText()).put("requiresAssertion", false);
    }
    return new Snapshot(account.scope(), steps, account.authConnection());
  }

  @Override
  public void checkCurrent(JsonNode session) {
    accounts.checkCurrent(session);
  }

  @Override
  public void checkSourceCurrent(JsonNode session) {
    classifier.requireCurrentPolicy(session.path("scope"));
    JsonNode current = snapshots.lockCurrent(UUID.fromString(session.path("testId").asText()));
    JsonNode scope = session.path("scope");
    require(
        current.path("sourceRevision").equals(scope.path("sourceRevision"))
            && current.path("configurationRevision").equals(scope.path("configurationRevision"))
            && current.path("csiId").equals(scope.path("csiId"))
            && current.path("environment").equals(scope.path("environmentId")),
        "REVISION_CONFLICT",
        409);
  }

  @Override
  public void checkUser(Authentication user, JsonNode session) {
    require(
        user instanceof BffAuthenticationToken
            && user.isAuthenticated()
            && ((BffAuthenticationToken) user)
                .getPrincipal()
                .userId()
                .equals(session.path("scope").path("principalId").asText())
            && ownership.canExecute(user, session.path("scope").path("csiId").asText()),
        "FORBIDDEN_SCOPE",
        403);
  }

  public void initialize(JsonNode session) {
    var current = snapshots.lockCurrent(UUID.fromString(session.path("testId").asText()));
    store.initialize(session, classifier.classify(current, session.path("scope")), true);
  }

  @Override
  public GuidedSourceReferenceValidator.Sources sources(JsonNode session) {
    checkSourceCurrent(session);
    return resolver.sources(
        session, store.state(session.path("sessionId").asText()).path("manifest"));
  }

  @Override
  public boolean complete(JsonNode session, JsonNode completion, List<ObjectNode> actions) {
    return verifier.complete(session, completion, actions);
  }
}
