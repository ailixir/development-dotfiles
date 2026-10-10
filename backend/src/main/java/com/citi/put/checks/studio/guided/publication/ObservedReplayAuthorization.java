package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.text;
import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestRevision;
import com.citi.put.checks.studio.guided.account.ReplayAccountAccess;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Each explicit observed Run has fresh, bounded authority; learning consent cannot admit a replay.
 */
public final class ObservedReplayAuthorization {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;
  private final ObservedRevisionVerifier verifier;
  private final ObservedReplayPins pins;
  private final GuidedPublicationAuthorization authorization;
  private final ReplayAccountAccess accounts;
  private final ObservedReplayProperties properties;
  private final StudioExecutionProperties execution;
  private final Clock clock;

  public record Prepared(JsonNode binding) {
    public Prepared {
      binding = PublicationContracts.bounded(binding, 32768);
    }

    @Override
    public JsonNode binding() {
      return binding.deepCopy();
    }
  }

  public ObservedReplayAuthorization(
      JdbcTemplate jdbc,
      GuidedContracts contracts,
      ObservedRevisionVerifier verifier,
      ObservedReplayPins pins,
      GuidedPublicationAuthorization authorization,
      ReplayAccountAccess accounts,
      ObservedReplayProperties properties,
      StudioExecutionProperties execution,
      Clock clock) {
    this.jdbc = jdbc;
    this.contracts = contracts;
    this.verifier = verifier;
    this.pins = pins;
    this.authorization = authorization;
    this.accounts = accounts;
    this.properties = properties;
    this.execution = execution;
    this.clock = clock;
  }

  public record AdmissionPermit(JsonNode request, JsonNode binding, Instant expiresAt) {
    public AdmissionPermit {
      request = PublicationContracts.bounded(request, 16384);
      binding = PublicationContracts.bounded(binding, 32768);
    }

    @Override
    public JsonNode request() {
      return request.deepCopy();
    }

    @Override
    public JsonNode binding() {
      return binding.deepCopy();
    }
  }

  /** Account freshness precedes the admission transaction; SQL rechecks exact stored authority. */
  public AdmissionPermit prepareAdmission(UUID id, JsonNode request) {
    require(
        !TransactionSynchronizationManager.isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    contracts.validate("v2/replay-job#/definitions/AdmissionRequest", request);
    require(text(request, "executionId").equals(id.toString()), "FORBIDDEN_SCOPE", 403);
    JsonNode binding =
        binding(id).orElseThrow(() -> new GuidedSessionException("FORBIDDEN_SCOPE", 403));
    check(binding);
    for (String field :
        List.of(
            "executionId",
            "startedAt",
            "attemptId",
            "revisionId",
            "revisionDigest",
            "artifactHash",
            "configurationHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "publicationEvidenceHash",
            "scopeHash",
            "currentPolicyHash")) {
      require(request.path(field).equals(binding.path(field)), "FORBIDDEN_SCOPE", 403);
    }
    require(
        request.path("profile").equals(binding.path("requiredProfile"))
            && request.path("build").equals(binding.path("requiredBuild"))
            && request.path("grantId").equals(binding.path("replayGrant").path("grantId"))
            && request
                .path("accountGrantId")
                .equals(binding.path("accountAuthorization").path("grantId")),
        "FORBIDDEN_SCOPE",
        403);
    require(
        accounts.isCurrent(
            new ReplayAccountAccess.AccountAuthorization(binding.path("accountAuthorization")),
            clock.instant()),
        "AUTH_CONNECTION_REQUIRED",
        409);
    Instant expiry = Instant.parse(text(binding.path("replayGrant"), "expiresAt"));
    Instant accountCheck = PublicationContracts.millisecond(clock.instant().plusMillis(5000));
    if (expiry.isAfter(accountCheck)) {
      expiry = accountCheck;
    }
    return new AdmissionPermit(request, binding, expiry);
  }

  public Prepared authorize(UUID testId, Authentication caller, HttpServletRequest request) {
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
    ObjectNode accountRequest =
        contracts
            .object()
            .put("executionId", executionId.toString())
            .put("attemptId", attemptId.toString())
            .put("revisionDigest", text(verified.path("receipt"), "revisionDigest"))
            .put("issuedAt", PublicationContracts.time(issued))
            .put("latestExpiry", PublicationContracts.time(ceiling));
    accountRequest.set("scope", scope);
    contracts.validate("v2/replay-account#/definitions/ReplayAccountRequest", accountRequest);
    JsonNode account =
        accounts.authorize(new ReplayAccountAccess.ReplayAccountRequest(accountRequest)).document();
    contracts.validate("v2/replay-account#/definitions/AccountAuthorization", account);
    for (String key : List.of("executionId", "attemptId", "revisionDigest", "scope")) {
      require(account.path(key).equals(accountRequest.path(key)), "FORBIDDEN_SCOPE", 403);
    }
    require(account.path("scopeHash").asText().equals(scopeHash), "FORBIDDEN_SCOPE", 403);
    Instant accountExpiry = Instant.parse(text(account, "expiresAt"));
    if (ceiling.isAfter(accountExpiry)) {
      ceiling = accountExpiry;
    }
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
            .put("accountGrantId", text(account, "grantId"))
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
    binding.set("accountAuthorization", account);
    contracts.validate("v2/replay-job#/definitions/ExecutionBinding", binding);
    return new Prepared(binding);
  }

  /** Called only inside ordinary locked acceptance; no Core/account I/O. */
  public ObjectNode bind(
      Prepared prepared, UITest test, UITestRevision revision, Instant acceptedAt) {
    require(
        TransactionSynchronizationManager.isActualTransactionActive(), "RUNTIME_INCOMPATIBLE", 409);
    ObjectNode binding = PublicationContracts.copy(prepared.binding());
    require(
        text(binding, "testId").equals(test.getId().toString())
            && text(binding, "revisionId").equals(revision.getId().toString())
            && text(binding, "csiId").equals(test.getCsiId())
            && text(binding, "environment").equals(test.getEnvironment())
            && text(binding, "artifactHash").equals(revision.getArtifactHash()),
        "REVISION_CONFLICT",
        409);
    binding.put("startedAt", PublicationContracts.time(acceptedAt));
    check(binding);
    return binding;
  }

  public Optional<JsonNode> binding(UUID id) {
    var values =
        jdbc.queryForList(
            "SELECT e.observed_revision_binding::text FROM ui_test_executions e JOIN"
                + " studio_dispatch_ledger l ON l.execution_id=e.id AND"
                + " l.execution_accepted_at=e.started_at WHERE l.execution_id=?",
            String.class,
            id);
    return values.isEmpty() || values.getFirst() == null
        ? Optional.empty()
        : Optional.of(contracts.parse(values.getFirst()));
  }

  /**
   * Configuration/current cancellation checks are local; account network access occurs separately.
   */
  public void check(JsonNode binding) {
    require(properties.enabled(), "RUNTIME_INCOMPATIBLE", 409);
    contracts.validate("v2/replay-job#/definitions/ExecutionBinding", binding);
    pins.supported(binding.path("requiredProfile"), binding.path("requiredBuild"));
    require(
        Instant.parse(text(binding.path("replayGrant"), "expiresAt")).isAfter(clock.instant()),
        "AUTHORIZATION_EXPIRED",
        409);
    require(
        GuidedContracts.hash(binding.path("scope")).equals(text(binding, "scopeHash"))
            && GuidedContracts.hash(pins.policy(binding.path("scope")))
                .equals(text(binding, "currentPolicyHash")),
        "FORBIDDEN_SCOPE",
        403);
    JsonNode grant = binding.path("replayGrant");
    for (String field :
        List.of(
            "executionId",
            "attemptId",
            "revisionId",
            "revisionDigest",
            "principalId",
            "csiId",
            "scopeHash",
            "currentPolicyHash")) {
      require(grant.path(field).equals(binding.path(field)), "FORBIDDEN_SCOPE", 403);
    }
    require(
        GuidedContracts.hash(binding.path("requiredBuild")).equals(text(grant, "buildHash"))
            && GuidedContracts.hash(binding.path("requiredProfile"))
                .equals(text(grant, "profileHash")),
        "FORBIDDEN_SCOPE",
        403);
    Integer cancelled =
        jdbc.queryForObject(
            "SELECT count(*) FROM studio_dispatch_ledger WHERE execution_id=? AND"
                + " (cancel_requested_at IS NOT NULL OR state='DONE')",
            Integer.class,
            UUID.fromString(text(binding, "executionId")));
    require(cancelled != null && cancelled == 0, "CANCELLED", 409);
  }

  public ObjectNode job(JsonNode binding, Map<String, String> plainValues) {
    require(
        !TransactionSynchronizationManager.isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    check(binding);
    var account =
        new ReplayAccountAccess.AccountAuthorization(binding.path("accountAuthorization"));
    require(accounts.isCurrent(account, clock.instant()), "AUTH_CONNECTION_REQUIRED", 409);
    JsonNode handle = accounts.issueHandle(account, binding.path("replayGrant")).document();
    contracts.validate("v2/replay-account", handle);
    require(handle.path("authorization").equals(account.document()), "FORBIDDEN_SCOPE", 403);
    JsonNode verified = verifier.verify(UUID.fromString(text(binding, "revisionId")));
    require(
        verified
                .path("artifact")
                .path("configurationHash")
                .equals(binding.path("configurationHash"))
            && GuidedContracts.hash(verified.path("artifact"))
                .equals(text(binding, "artifactHash")),
        "EVIDENCE_MISMATCH",
        409);
    ObjectNode job = contracts.object().put("schemaVersion", 2).put("kind", "observed");
    job.set("binding", binding.deepCopy());
    job.set("artifact", verified.path("artifact"));
    job.set("configuration", verified.path("configuration"));
    job.set("accountHandle", handle);
    var inputs = job.putArray("inputs");
    JsonNode authoring =
        contracts.parse(
            jdbc.queryForObject(
                "SELECT authoring::text FROM ui_test_revisions WHERE id=?",
                String.class,
                UUID.fromString(text(binding, "revisionId"))));
    for (JsonNode recipe : verified.path("artifact").path("inputRecipes")) {
      JsonNode provenance = recipe.path("provenance");
      String value;
      if (provenance.path("kind").asText().equals("sourceSpan")) {
        JsonNode step =
            GuidedPlanBuilder.unique(authoring.path("steps"), "id", text(recipe, "stepId"));
        String source = text(step, "text");
        int start = provenance.path("start").asInt(-1), end = provenance.path("end").asInt(-1);
        require(start >= 0 && end > start && end <= source.length(), "REFERENCE_MISMATCH", 422);
        value = source.substring(start, end);
      } else {
        value = plainValues.get(text(provenance, "referenceName"));
        require(value != null, "REFERENCE_MISMATCH", 422);
      }
      inputs.addObject().put("inputId", text(recipe, "inputId")).put("value", value);
    }
    job.putObject("runtime")
        .put(
            "stepTimeoutMs", verified.path("configuration").path("timeoutSeconds").asLong() * 1000L)
        .put("totalRuntimeMs", execution.totalRuntimeOrDefault().toMillis());
    // Ordinary explicit recording geometry remains distinct from the authored viewport.
    job.putObject("recording")
        .put("width", properties.recordingWidth())
        .put("height", properties.recordingHeight());
    contracts.validate("v2/replay-job", job);
    PublicationContracts.bounded(job, properties.maxJobBytes());
    check(binding);
    return job;
  }
}
