package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver.UnknownReferenceException;
import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.guided.session.GuidedSessionAccess;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.citi.put.checks.studio.navigation.AllowedDomains;
import com.citi.put.checks.studio.secrets.VaultProviderUnavailableException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;

/** Real source/revision/verification access, composed with only the later account handoff. */
public final class GuidedProductionSessionAccess
    implements GuidedSessionAccess, GuidedSessionService.StepVerifier {
  private final GuidedSourceSnapshotRepository snapshots;
  private final GuidedSourceClassifier classifier;
  private final GuidedSourceInputResolver resolver;
  private final GuidedTranslationStore store;
  private final CsiOwnershipEvaluator ownership;
  private final AllowedDomains domains;
  private final com.citi.put.checks.studio.dispatch.StudioReferenceResolver references;

  public GuidedProductionSessionAccess(
      GuidedSourceSnapshotRepository snapshots,
      GuidedSourceClassifier classifier,
      GuidedSourceInputResolver resolver,
      GuidedTranslationStore store,
      CsiOwnershipEvaluator ownership,
      AllowedDomains domains,
      com.citi.put.checks.studio.dispatch.StudioReferenceResolver references) {
    this.snapshots = snapshots;
    this.classifier = classifier;
    this.resolver = resolver;
    this.store = store;
    this.ownership = ownership;
    this.domains = domains;
    this.references = references;
  }

  @Override
  public Snapshot resolve(Authentication user, JsonNode request) {
    require(
        user instanceof BffAuthenticationToken && user.isAuthenticated(), "UNAUTHENTICATED", 401);
    ObjectNode current =
        snapshots.lockCurrent(
            UUID.fromString(request.path("testId").asText()),
            csi -> require(ownership.canExecute(user, csi), "FORBIDDEN_SCOPE", 403));
    require(ownership.canExecute(user, current.path("csiId").asText()), "FORBIDDEN_SCOPE", 403);
    ObjectNode scope = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
    for (String key : List.of("sourceRevision", "configurationRevision", "environmentId")) {
      scope.set(key, request.path(key));
    }
    scope.set("csiId", current.path("csiId"));
    scope.put("modelDataPolicyId", "INPUT-POLICY-01-A").putNull("valueTransferPolicyId");
    scope.put("principalId", ((BffAuthenticationToken) user).getPrincipal().userId());
    scope.putArray("capabilities").add("observe").add("step");
    JsonNode manifest = classifier.classify(current, scope);
    // A test that names no URL cannot be learned, and its first URL (step order) must be on the
    // deployment's allowed domains. Any later URL is checked when a step uses it as a destination.
    String startUrl = AuthoredUrls.first(current.path("authoring"), current.path("variables"));
    require(startUrl != null, "NO_APPLICATION_URL", 422);
    require(domains.allows(startUrl), "ORIGIN_NOT_ALLOWED", 403);
    var ids = new java.util.LinkedHashSet<String>();
    for (JsonNode reference : manifest.path("configurationReferences")) {
      if (reference.path("kind").asText().equals("secretRef")) {
        ids.add(reference.path("referenceName").asText());
      }
    }
    try {
      references.preflight(
          scope.path("csiId").asText(),
          scope.path("environmentId").asText(),
          UUID.fromString(current.path("testId").asText()),
          scope.path("principalId").asText(),
          new com.citi.put.checks.studio.dispatch.ReferenceDeclarations(
              List.of(), List.copyOf(ids)));
    } catch (UnknownReferenceException failure) {
      throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
          "SECRET_UNAVAILABLE", 404);
    } catch (VaultProviderUnavailableException failure) {
      throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
          "VAULT_UNAVAILABLE", 503);
    }
    var steps = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
    for (JsonNode step : manifest.path("sourceSteps")) {
      steps.addObject().put("stepId", step.path("stepId").asText()).put("requiresAssertion", false);
    }
    return new Snapshot(scope, steps);
  }

  @Override
  public void checkSourceCurrent(JsonNode session) {
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
    store.initialize(session, classifier.classify(current, session.path("scope")));
  }

  @Override
  public GuidedSourceReferenceValidator.Sources sources(JsonNode session) {
    checkSourceCurrent(session);
    return resolver.sources(
        session, store.state(session.path("sessionId").asText()).path("manifest"));
  }

  @Override
  public boolean complete(JsonNode session, JsonNode completion, List<ObjectNode> actions) {
    return store.stepFulfilled(
        session.path("sessionId").asText(), completion.path("stepId").asText(), actions);
  }
}
