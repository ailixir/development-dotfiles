package com.citi.put.checks.studio.guided.policy;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.StudioAccessDeniedException;
import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.guided.publication.ObservedReplayPins;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The governed observation policy (STUDIO-OBS-014 AC-1, rulings AR-2 a, f, g and h).
 *
 * <p>One policy per (CSI, application, environment), owned by the CSI's writers. Versions are
 * immutable; a version becomes active only by an approval from a member of a configured approver
 * group who is not the version's author. The chain (who, when, what hash) is written by database
 * triggers only. A learning session freezes the active version at start; replay keeps its published
 * snapshot and is not affected (AR-2 g).
 *
 * <p>Governance narrows and never widens: a policy's origins must be a subset of the platform's
 * trusted policy for the same application and environment, checked when a version is written and
 * again at session start (the trusted configuration can change after approval).
 *
 * <p>Errors use the Studio envelope: {@code 400 INVALID_POLICY}, {@code 403 STUDIO_FORBIDDEN}
 * (unknown and forbidden alike, no existence oracle) and {@code 409 STALE_REVISION}.
 */
public class ObservationPolicyService {

  private final ObservationPolicyRepository repository;
  private final GuidedContracts contracts;
  private final CsiOwnershipEvaluator ownership;
  private final ObservedReplayPins pins;
  private final GuidedPolicyProperties properties;
  private final TransactionTemplate transactions;

  public ObservationPolicyService(
      ObservationPolicyRepository repository,
      GuidedContracts contracts,
      CsiOwnershipEvaluator ownership,
      ObservedReplayPins pins,
      GuidedPolicyProperties properties,
      TransactionTemplate transactions) {
    this.repository = repository;
    this.contracts = contracts;
    this.ownership = ownership;
    this.pins = pins;
    this.properties = properties;
    this.transactions = transactions;
  }

  /** Creates the policy and its version 1 (not yet approved, so not yet in force). */
  public ObjectNode create(Authentication user, JsonNode request) {
    String principal = principal(user);
    String csiId = text(request, "csiId", 20);
    String applicationId = text(request, "applicationId", 256);
    String environmentId = text(request, "environmentId", 256);
    if (!ownership.canWrite(user, csiId)) {
      throw new StudioAccessDeniedException();
    }
    ObjectNode document = document(request.path("document"), applicationId, environmentId);
    UUID policyId = UUID.randomUUID();
    return transactions.execute(
        status -> {
          if (repository.exists(csiId, applicationId, environmentId)) {
            throw new StudioConflictException(
                "GUIDED_POLICY_EXISTS",
                "A governed policy already exists for this application environment");
          }
          repository.insertPolicy(policyId, csiId, applicationId, environmentId, principal);
          insertVersion(policyId, 1, document, principal);
          return view(policyId);
        });
  }

  /** Adds the next version; {@code expectedVersion} must be the current latest. */
  public ObjectNode addVersion(Authentication user, UUID policyId, JsonNode request) {
    String principal = principal(user);
    return transactions.execute(
        status -> {
          ObjectNode policy = writable(user, policyId);
          int latest = repository.latestVersion(policyId);
          if (!request.path("expectedVersion").isInt()
              || request.path("expectedVersion").asInt() != latest) {
            throw new StudioConflictException(
                "STALE_REVISION", "The policy has a newer version than the one expected");
          }
          ObjectNode document =
              document(
                  request.path("document"),
                  policy.path("applicationId").asText(),
                  policy.path("environmentId").asText());
          insertVersion(policyId, latest + 1, document, principal);
          return view(policyId);
        });
  }

  /**
   * Approves a version, which activates it (c2b-spec order): approver-group membership {@code 403}
   * first, then an unknown policy or version, or the version's own author, is the same {@code 403};
   * then only the latest, not yet approved version can be approved ({@code 409 STALE_REVISION}).
   */
  public ObjectNode approve(Authentication user, UUID policyId, int version, JsonNode request) {
    String principal = principal(user);
    String approvalRef = text(request, "approvalRef", 256);
    if (!approver(user)) {
      throw new StudioAccessDeniedException();
    }
    return transactions.execute(
        status -> {
          ObjectNode policy =
              repository.lock(policyId).orElseThrow(StudioAccessDeniedException::new);
          ObjectNode target =
              repository.version(policyId, version).orElseThrow(StudioAccessDeniedException::new);
          if (principal.equals(target.path("createdBy").asText())) {
            throw new StudioAccessDeniedException();
          }
          if (version != repository.latestVersion(policyId)
              || repository.approved(policyId, version)
              || (policy.path("activeVersion").isInt()
                  && policy.path("activeVersion").asInt() >= version)) {
            throw new StudioConflictException(
                "STALE_REVISION", "Only the latest, unapproved version can be approved");
          }
          repository.insertApproval(policyId, version, principal, approvalRef);
          return view(policyId);
        });
  }

  /**
   * The policy of one application environment. A caller who may neither read the CSI nor approve is
   * refused {@code 403} before any lookup; only then is an absent policy {@code 404}.
   */
  public ObjectNode lookup(
      Authentication user, String csiId, String applicationId, String environmentId) {
    principal(user);
    if (!ownership.canRead(user, csiId) && !approver(user)) {
      throw new StudioAccessDeniedException();
    }
    return transactions.execute(
        status ->
            view(
                repository
                    .state(csiId, applicationId, environmentId)
                    .orElseThrow(GuidedPolicyNotFoundException::new)
                    .policyId()));
  }

  public ObjectNode read(Authentication user, UUID policyId) {
    return transactions.execute(
        status -> {
          readable(user, policyId);
          return view(policyId);
        });
  }

  /**
   * The approved, active policy for a learning session's scope, inside the caller's start
   * transaction. Refuses {@code 409 POLICY_NOT_APPROVED} when none is in force (including "edited
   * but not yet approved", which leaves the previous version active only if one was approved), and
   * {@code 409 RUNTIME_INCOMPATIBLE} when its origins are no longer inside the trusted policy.
   */
  public ObservationPolicyRepository.ActivePolicy activeForStart(JsonNode scope) {
    String csiId = scope.path("csiId").asText();
    String applicationId = scope.path("applicationId").asText();
    String environmentId = scope.path("environmentId").asText();
    var state =
        repository
            .state(csiId, applicationId, environmentId)
            .orElseThrow(() -> notApproved("GUIDED_POLICY_ABSENT"));
    if (state.activeVersion() == null) {
      throw notApproved("GUIDED_POLICY_UNAPPROVED");
    }
    if (state.latestVersion() > state.activeVersion()) {
      // An edit awaiting approval blocks new learning even while an older version is active.
      throw notApproved("GUIDED_POLICY_PENDING_VERSION");
    }
    var active =
        repository
            .active(csiId, applicationId, environmentId)
            .orElseThrow(() -> notApproved("GUIDED_POLICY_UNAPPROVED"));
    var trusted = new HashSet<String>();
    pins.policy(trustedScope(scope)).path("allowedOrigins").forEach(o -> trusted.add(o.asText()));
    for (JsonNode origin : active.document().path("allowedOrigins")) {
      GuidedSessionException.require(
          trusted.contains(origin.asText()), "RUNTIME_INCOMPATIBLE", 409);
    }
    return active;
  }

  private static GuidedSessionException notApproved(String messageCode) {
    return new GuidedSessionException("POLICY_NOT_APPROVED", 409, messageCode, false, null);
  }

  /**
   * The trusted-policy lookup key only. {@code ObservedReplayPins.policy} refuses FORBIDDEN_SCOPE
   * for a scope origin outside the trusted set, which is the wrong code at start; the subset check
   * is done here explicitly instead (c2b-spec startGuidedSession step 4).
   */
  private ObjectNode trustedScope(JsonNode scope) {
    return contracts
        .object()
        .put("applicationId", scope.path("applicationId").asText())
        .put("environmentId", scope.path("environmentId").asText());
  }

  /** Freezes the start-time policy into the session (V19 re-checks it under its trigger). */
  public void freeze(String sessionId, ObservationPolicyRepository.ActivePolicy policy) {
    repository.freeze(sessionId, policy);
  }

  public Optional<ObservationPolicyRepository.ActivePolicy> frozen(String sessionId) {
    return repository.frozen(sessionId);
  }

  // ── internals ───────────────────────────────────────────────────────────

  private ObjectNode document(JsonNode submitted, String applicationId, String environmentId) {
    ObjectNode document =
        ObservationPolicyDocuments.materialize(
            contracts, submitted, properties.defaultDestructiveVocabulary());
    ObjectNode scope =
        contracts.object().put("applicationId", applicationId).put("environmentId", environmentId);
    var trusted = new HashSet<String>();
    final JsonNode trustedPolicy;
    try {
      trustedPolicy = pins.policy(scope);
    } catch (GuidedSessionException noTrustedPolicy) {
      throw new StudioValidationException(
          "INVALID_POLICY", "No trusted policy exists for this application and environment");
    }
    trustedPolicy.path("allowedOrigins").forEach(origin -> trusted.add(origin.asText()));
    for (JsonNode origin : document.path("allowedOrigins")) {
      if (!trusted.contains(origin.asText())) {
        throw new StudioValidationException(
            "INVALID_POLICY", "allowedOrigins must be inside the platform's trusted origins");
      }
    }
    return document;
  }

  private void insertVersion(UUID policyId, int version, ObjectNode document, String principal) {
    repository.insertVersion(
        policyId,
        version,
        document,
        ObservationPolicyDocuments.documentHash(document),
        ObservationPolicyDocuments.observationPolicyHash(document),
        principal);
  }

  private ObjectNode readable(Authentication user, UUID policyId) {
    ObjectNode policy = repository.lock(policyId).orElseThrow(StudioAccessDeniedException::new);
    if (!ownership.canRead(user, policy.path("csiId").asText()) && !approver(user)) {
      throw new StudioAccessDeniedException();
    }
    return policy;
  }

  private ObjectNode writable(Authentication user, UUID policyId) {
    ObjectNode policy = repository.lock(policyId).orElseThrow(StudioAccessDeniedException::new);
    if (!ownership.canWrite(user, policy.path("csiId").asText())) {
      throw new StudioAccessDeniedException();
    }
    return policy;
  }

  /** The closed v3 {@code guided-policy#/definitions/policyView}. */
  private ObjectNode view(UUID policyId) {
    ObjectNode policy = repository.find(policyId).orElseThrow(StudioAccessDeniedException::new);
    ObjectNode out = contracts.object().put("schemaVersion", 3);
    for (String key : List.of("policyId", "csiId", "applicationId", "environmentId")) {
      out.set(key, policy.path(key));
    }
    out.set("activeVersion", policy.path("activeVersion"));
    int latest = repository.latestVersion(policyId);
    out.put("latestVersion", latest);
    out.set(
        "active",
        policy.path("activeVersion").isInt()
            ? repository.version(policyId, policy.path("activeVersion").asInt()).orElseThrow()
            : com.fasterxml.jackson.databind.node.NullNode.instance);
    out.set("latest", repository.version(policyId, latest).orElseThrow());
    return out;
  }

  private boolean approver(Authentication user) {
    if (!(user instanceof BffAuthenticationToken bff)) {
      return false;
    }
    var groups = new HashSet<>(properties.approverGroups());
    groups.retainAll(bff.getPrincipal().roles());
    return !groups.isEmpty();
  }

  private static String principal(Authentication user) {
    if (!(user instanceof BffAuthenticationToken bff) || !user.isAuthenticated()) {
      throw new StudioAccessDeniedException();
    }
    return bff.getPrincipal().userId();
  }

  private static String text(JsonNode request, String field, int max) {
    JsonNode value = request == null ? null : request.path(field);
    if (value == null
        || !value.isTextual()
        || value.asText().isEmpty()
        || value.asText().length() > max) {
      throw new StudioValidationException("INVALID_POLICY", field + " is required");
    }
    return value.asText();
  }
}
