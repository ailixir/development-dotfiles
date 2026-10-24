package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.text;
import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestRevision;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Each explicit observed Run has fresh, bounded authority; learning consent cannot admit a replay.
 */
public final class ObservedReplayAuthorization {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;
  private final ObservedRevisionVerifier verifier;
  private final ObservedReplayPins pins;
  private final com.citi.put.checks.studio.dispatch.StudioReferenceResolver references;
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
      com.citi.put.checks.studio.dispatch.StudioReferenceResolver references,
      ObservedReplayProperties properties,
      StudioExecutionProperties execution,
      Clock clock) {
    this.jdbc = jdbc;
    this.contracts = contracts;
    this.verifier = verifier;
    this.pins = pins;
    this.references = references;
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
    contracts.validate("v3/replay-job#/definitions/AdmissionRequest", request);
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
            && request.path("grantId").equals(binding.path("replayGrant").path("grantId")),
        "FORBIDDEN_SCOPE",
        403);
    Instant expiry = Instant.parse(text(binding.path("replayGrant"), "expiresAt"));
    Instant authorizationCheck = PublicationContracts.millisecond(clock.instant().plusMillis(5000));
    if (expiry.isAfter(authorizationCheck)) {
      expiry = authorizationCheck;
    }
    return new AdmissionPermit(request, binding, expiry);
  }

  /**
   * Background authority for an observed schedule (STUDIO-OBS-009 AC-6, A17). No caller session
   * exists, so no Core read happens here: the schedule's activation fixed the revision and the
   * execution principal, and the scheduler has already required the live background grant for that
   * principal, CSI and environment before it asks for this binding (and requires it again at the
   * final write boundary and at every dispatch recheck). The binding is the same shape that {@link
   * ObservedReplayAuthorizer#authorize} issues for an explicit Run, minted on the database clock
   * and bound to the same short grant window; {@link #bind} then pins it to the locked test and
   * revision exactly as for a manual Run.
   *
   * <p>Called only from the acceptance transaction, after the revision has been loaded and before
   * any row is written. Secrets are never resolved here: they are resolved per run, at dispatch,
   * for this principal through the secret-use authorization.
   */
  public Prepared prepareScheduled(UITest test, UITestRevision revision, String principal) {
    require(properties.enabled(), "RUNTIME_INCOMPATIBLE", 409);
    require(principal != null && !principal.isBlank(), "FORBIDDEN_SCOPE", 403);
    UUID testId = test.getId(), revisionId = revision.getId();
    String csiId = test.getCsiId();
    ObjectNode verified = verifier.verify(revisionId);
    return new ObservedReplayBindingBuilder(contracts, pins, properties, clock)
        .build(testId, revisionId, principal, csiId, verified, true);
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

  /** Fresh attempt only after a proven definite refusal or an audited zero-send Vault outage. */
  public JsonNode refreshRetry(JsonNode accepted, String owner) {
    require(
        TransactionSynchronizationManager.isActualTransactionActive(), "RUNTIME_INCOMPATIBLE", 409);
    UUID id = UUID.fromString(text(accepted, "executionId"));
    var rows =
        jdbc.queryForList(
            ("SELECT l.*,e.observed_admission_receipt FROM studio_dispatch_ledger l JOIN ui_test_ex"
                + "ecutions e ON e.id=l.execution_id AND e.started_at=l.execution_accepted_at WHERE l.ex"
                + "ecution_id=? FOR UPDATE OF l,e"),
            id);
    require(rows.size() == 1, "FORBIDDEN_SCOPE", 403);
    var row = rows.getFirst();
    Object definite = row.get("definite_refusal_attempt_id"),
        zeroSend = row.get("zero_send_decision_attempt_id");
    Object token =
        definite != null && definite.toString().equals(text(accepted, "attemptId"))
            ? definite
            : zeroSend != null && zeroSend.toString().equals(text(accepted, "attemptId"))
                ? zeroSend
                : null;
    if (token == null) {
      return accepted;
    }
    require(
        "CLAIMED".equals(row.get("state"))
            && owner.equals(row.get("lease_owner"))
            && row.get("attempt_id") == null
            && row.get("admission_id") == null
            && row.get("observed_admission_receipt") == null
            && token.toString().equals(text(accepted, "attemptId")),
        "FORBIDDEN_SCOPE",
        403);
    ObjectNode fresh = PublicationContracts.copy(accepted);
    String attempt = UUID.randomUUID().toString();
    fresh.put("attemptId", attempt);
    ObjectNode grant = PublicationContracts.copy(accepted.path("replayGrant"));
    Instant issued = PublicationContracts.millisecond(clock.instant());
    grant
        .put("grantId", UUID.randomUUID().toString())
        .put("attemptId", attempt)
        .put("issuedAt", PublicationContracts.time(issued))
        .put(
            "expiresAt",
            PublicationContracts.time(issued.plusMillis(properties.authorizationTtlMs())));
    fresh.set("replayGrant", grant);
    check(fresh);
    jdbc.queryForObject(
        "SELECT set_config('studio.observed_retry_owner',?,true)", String.class, owner);
    int changed =
        jdbc.update(
            ("UPDATE ui_test_executions e SET observed_revision_binding=?::jsonb FROM studio_dispat"
                + "ch_ledger l WHERE e.id=l.execution_id AND e.started_at=l.execution_accepted_at AND l."
                + "execution_id=? AND l.state='CLAIMED' AND l.lease_owner=? AND l.lease_expires_at>clock"
                + "_timestamp() AND l.attempt_id IS NULL AND l.admission_id IS NULL AND e.observed_admis"
                + "sion_receipt IS NULL AND (l.definite_refusal_attempt_id=? OR l.zero_send_decision_att"
                + "empt_id=?)"),
            fresh.toString(),
            id,
            owner,
            UUID.fromString(token.toString()),
            UUID.fromString(token.toString()));
    require(changed == 1, "FORBIDDEN_SCOPE", 403);
    return fresh;
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
    contracts.validate("v3/replay-job#/definitions/ExecutionBinding", binding);
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
                + " (cancel_requested_at IS NOT NULL OR revoked_at IS NOT NULL OR state='DONE')",
            Integer.class,
            UUID.fromString(text(binding, "executionId")));
    require(cancelled != null && cancelled == 0, "CANCELLED", 409);
  }

  /** The callback must finish a committed marker before the existing provider can be entered. */
  com.citi.put.checks.studio.dispatch.StudioReferenceResolver.ValueReadEntry trackedReadEntry(
      JsonNode binding,
      com.citi.put.checks.studio.dispatch.StudioReferenceResolver.ValueReadEntry observer) {
    return secretId -> {
      requireIndependentReadView();
      observer.beforeRead(secretId);
      requireIndependentReadView();
      Integer count =
          jdbc.queryForObject(
              ("SELECT count(*) FROM studio_observed_secret_read_entries r JOIN ui_test_executions e "
                  + "ON e.id=r.execution_id AND e.started_at=r.execution_accepted_at JOIN studio_dispatch_"
                  + "ledger l ON l.execution_id=e.id AND l.execution_accepted_at=e.started_at WHERE r.exec"
                  + "ution_id=? AND r.execution_accepted_at=? AND r.attempt_id=? AND r.secret_id=? AND e.o"
                  + "bserved_revision_binding=?::jsonb AND r.binding_digest=studio_publication_hash(e.obse"
                  + "rved_revision_binding) AND r.revision_id=e.revision_id AND r.revision_digest=e.observ"
                  + "ed_revision_binding->>'revisionDigest' AND r.scope_hash=e.observed_revision_binding->"
                  + ">'scopeHash' AND r.principal_id=l.principal AND r.csi_id=l.csi_id AND r.test_id=l.tes"
                  + "t_id AND r.environment=e.environment AND r.lease_owner=l.lease_owner AND l.state='CLA"
                  + "IMED' AND l.lease_expires_at>clock_timestamp() AND l.attempt_id IS NULL AND l.admissi"
                  + "on_id IS NULL AND e.observed_admission_receipt IS NULL AND l.cancel_requested_at IS N"
                  + "ULL AND l.revoked_at IS NULL"),
              Integer.class,
              UUID.fromString(text(binding, "executionId")),
              java.sql.Timestamp.from(Instant.parse(text(binding, "startedAt"))),
              UUID.fromString(text(binding, "attemptId")),
              secretId,
              binding.toString());
      require(count != null && count == 1, "RUNTIME_INCOMPATIBLE", 409);
    };
  }

  private void requireIndependentReadView() {
    require(
        !TransactionSynchronizationManager.isActualTransactionActive()
            && (jdbc.getDataSource() == null
                || !TransactionSynchronizationManager.hasResource(jdbc.getDataSource())),
        "RUNTIME_INCOMPATIBLE",
        409);
  }

  /** Safe metadata plus an owned resolution, never a persisted or cached body. */
  public record ResolvedJob(
      ObjectNode metadata,
      com.citi.put.checks.studio.dispatch.StudioReferenceResolver.Resolved resolved)
      implements AutoCloseable {
    public com.citi.put.checks.studio.dispatch.RunJob runJob() {
      return com.citi.put.checks.studio.dispatch.RunJob.observed(
          metadata, resolved.secretValues(), resolved.secretOrigins());
    }

    @Override
    public void close() {
      resolved.close();
    }

    @Override
    public String toString() {
      return "ResolvedJob[<secret>]";
    }
  }

  public ResolvedJob job(JsonNode binding, Map<String, String> plainValues) {
    return job(
        binding,
        plainValues,
        id -> {
          throw new IllegalStateException("Scoped committed value-read entry is required");
        });
  }

  public ResolvedJob job(
      JsonNode binding,
      Map<String, String> plainValues,
      com.citi.put.checks.studio.dispatch.StudioReferenceResolver.ValueReadEntry readEntry) {
    require(
        !TransactionSynchronizationManager.isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    var acceptedDeclarations = new java.util.LinkedHashSet<String>();
    var immutableReferences =
        contracts.parse(
            jdbc.queryForObject(
                "SELECT \"references\"::text FROM ui_test_revisions WHERE id=?",
                String.class,
                UUID.fromString(text(binding, "revisionId"))));
    for (JsonNode id : immutableReferences.path("secrets")) {
      acceptedDeclarations.add(id.asText());
    }
    boolean resolutionEntered = false;
    try {
      check(binding);
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
      ObjectNode job = contracts.object().put("schemaVersion", 3).put("kind", "observed");
      job.set("binding", binding.deepCopy());
      job.set("artifact", verified.path("artifact"));
      job.set("configuration", verified.path("configuration"));
      var inputs = job.putArray("inputs");
      JsonNode authoring =
          contracts.parse(
              jdbc.queryForObject(
                  "SELECT authoring::text FROM ui_test_revisions WHERE id=?",
                  String.class,
                  UUID.fromString(text(binding, "revisionId"))));
      for (JsonNode recipe : verified.path("artifact").path("inputRecipes")) {
        if (recipe.path("kind").asText().equals("secretRef")) {
          continue;
        }
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
              "stepTimeoutMs",
              verified.path("configuration").path("timeoutSeconds").asLong() * 1000L)
          .put("totalRuntimeMs", execution.totalRuntimeOrDefault().toMillis());
      // Ordinary explicit recording geometry remains distinct from the authored viewport.
      job.putObject("recording")
          .put("width", properties.recordingWidth())
          .put("height", properties.recordingHeight());
      job.putObject("secrets");
      job.putObject("secretOrigins");
      contracts.validate("v3/replay-job", job);
      PublicationContracts.bounded(job, properties.maxJobBytes());
      check(binding);
      for (JsonNode recipe : verified.path("artifact").path("inputRecipes")) {
        if (recipe.path("kind").asText().equals("secretRef")) {
          require(
              acceptedDeclarations.contains(text(recipe.path("provenance"), "referenceName")),
              "REFERENCE_MISMATCH",
              422);
        }
      }
      var typedDeclarations =
          new com.citi.put.checks.studio.dispatch.ReferenceDeclarations(
              List.of(), List.copyOf(acceptedDeclarations));
      resolutionEntered = true;
      var resolved =
          acceptedDeclarations.isEmpty()
              ? references.resolve(
                  text(binding, "csiId"),
                  text(binding, "environment"),
                  UUID.fromString(text(binding, "testId")),
                  text(binding, "principalId"),
                  typedDeclarations)
              : references.resolve(
                  text(binding, "csiId"),
                  text(binding, "environment"),
                  UUID.fromString(text(binding, "testId")),
                  text(binding, "principalId"),
                  typedDeclarations,
                  trackedReadEntry(binding, readEntry));
      try {
        verifier.assertResolvedSecretLiterals(
            verified.path("artifact"), resolved, job.path("inputs"));
        job.set(
            "secretOrigins",
            new com.fasterxml.jackson.databind.ObjectMapper()
                .valueToTree(resolved.secretOrigins()));
        return new ResolvedJob(job, resolved);
      } catch (RuntimeException failure) {
        var decisions =
            new java.util.LinkedHashMap<
                String, com.citi.put.checks.studio.dispatch.StudioReferenceResolver.Decision>();
        resolved
            .secretVersions()
            .forEach(
                (id, version) ->
                    decisions.put(
                        id,
                        new com.citi.put.checks.studio.dispatch.StudioReferenceResolver.Decision(
                            com.citi.put.checks.studio.dispatch.StudioReferenceResolver
                                .DecisionOutcome.RESOLVED,
                            version)));
        com.citi.put.checks.studio.dispatch.StudioReferenceResolver.attachDecisionFacts(
            failure, decisions);
        resolved.close();
        throw failure;
      }
    } catch (RuntimeException failure) {
      if (!resolutionEntered) {
        com.citi.put.checks.studio.dispatch.StudioReferenceResolver.attachDecisionFacts(
            failure, Map.of(), acceptedDeclarations);
      }
      throw failure;
    }
  }
}
