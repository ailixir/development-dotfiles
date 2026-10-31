package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.UITestExecutionRepository;
import com.citi.put.checks.studio.UITestRevisionRepository;
import com.citi.put.checks.studio.dto.CanonicalStudioCodec;
import com.citi.put.checks.studio.dto.ExecutionStatus;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.entity.StudioDispatchLedger;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestExecution;
import com.citi.put.checks.studio.entity.UITestRevision;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.secrets.VaultProviderUnavailableException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The acceptance transaction (AC-7 – AC-11).
 *
 * <p>One transaction does all of it: the kill switch, readiness, input limits, the reference
 * preflight, the two pending quotas, the immutable provenance snapshot, the {@code PENDING} history
 * row, its ledger row, and the principal-scoped {@code (idempotency_key, request_digest)} mapping.
 * {@code 202} is returned only after it commits.
 *
 * <p><b>The idempotency guard is the unique index itself</b>, not a read followed by an insert. A
 * {@code SELECT} that finds nothing and an {@code INSERT} that follows it are two decisions about
 * one fact taken at two different instants, and across three-to-six API replicas the window between
 * them is exactly where the second execution appears. The loser here observes {@code
 * uq_studio_dispatch_ledger_idempotency} and resolves to the winner's execution — which is why
 * {@link #accept} declares {@link IdempotencyRaceException} rather than swallowing the violation: a
 * transaction that has hit a constraint cannot read anything afterwards, so the resolution must
 * happen in a new one.
 *
 * <p><b>Quotas are one critical section with the insert.</b> Two transaction-scoped advisory locks
 * are taken, global first and per-CSI second — always in that order, so two accepts can never
 * deadlock — and both are released by commit. The deliberate cost is named rather than hidden: the
 * global lock serializes accepts across the whole deployment. At Studio volume (a pending bound in
 * the low hundreds) that is acceptable, and it is what makes "two concurrent accepts at the limit
 * cannot both observe room" true rather than likely.
 */
@Service
public class StudioAcceptanceService {

  /** Advisory-lock namespace. Arbitrary but fixed: it only has to not collide with another user. */
  private static final int LOCK_NAMESPACE = 0x5701;

  /** Second key of the global pending-quota lock. */
  private static final int GLOBAL_QUOTA_LOCK = 1;

  private final StudioRepository tests;
  private final UITestRevisionRepository revisions;
  private final UITestExecutionRepository executions;
  private final com.citi.put.checks.studio.StudioDispatchLedgerRepository ledger;
  private final ExecutionReadiness readiness;
  private final StudioReferenceResolver references;
  private final StudioExecutionProperties properties;
  private final ObjectMapper objectMapper;
  private final JdbcTemplate jdbc;
  private final Clock clock;
  @PersistenceContext private EntityManager entityManager;

  @Autowired(required = false)
  private com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization observed;

  /** Trusted internal identity, independent of client-supplied manual idempotency strings. */
  public record ScheduledIdentity(UUID scheduleId, Instant scheduledAt) {}

  public record ScheduledResult(UUID executionId, String decision, String code) {}

  /**
   * The proof replay a publication accepted: its execution, or exactly one closed refusal code (the
   * set {@code ck_studio_learn_proofs_refusal} accepts).
   */
  public record PublishedResult(UUID executionId, String refusalCode) {}

  /**
   * Expected refusals are caught inside this non-proxied core path; SQL failures still roll back.
   */
  public ScheduledResult acceptScheduled(
      UUID testId, String principal, ScheduledIdentity identity) {
    if (!org.springframework.transaction.support.TransactionSynchronizationManager
        .isActualTransactionActive()) {
      throw new IllegalStateException("Scheduled acceptance requires its schedule transaction");
    }
    try {
      return new ScheduledResult(
          acceptCore(testId, principal, null, identity, null, null), "ACCEPTED", "ACCEPTED");
    } catch (StudioConflictException ex) {
      return new ScheduledResult(null, "REFUSED", ex.getCode());
    } catch (StudioQuotaExceededException ex) {
      return new ScheduledResult(null, "DEFERRED", ex.getCode());
    } catch (StudioDispatchDisabledException ex) {
      return new ScheduledResult(null, "SKIPPED", "DISPATCH_DISABLED");
    } catch (StudioReferenceResolver.UnknownReferenceException ex) {
      return new ScheduledResult(null, "REFUSED", "REFERENCE_UNAVAILABLE");
    } catch (VaultProviderUnavailableException ex) {
      return new ScheduledResult(null, "DEFERRED", "VAULT_UNAVAILABLE");
    } catch (StudioValidationException ex) {
      return new ScheduledResult(null, "REFUSED", ex.getCode());
    }
  }

  /**
   * Accepts the one observed replay of the revision a publication has just made the confirmed one
   * (trigger source {@code AFTER_LEARN}). It runs inside the publication's own transaction, so the
   * revision, the receipt and the proof commit together or not at all.
   *
   * <p>Like {@link #acceptScheduled} it is deliberately not {@code @Transactional}: the expected
   * refusals are caught here and every one of them is thrown before any row is written, so none can
   * leave the publication transaction rollback-only. A refusal is returned as its closed code and
   * the publication is kept. Anything else (a SQL error, a trigger refusal, a bug) is not caught
   * and rolls the whole publication back: a defect in proof acceptance blocks publishing, it never
   * produces an unproven publication. The ledger idempotency key is {@code null}, so its unique
   * index can never be involved; exactly-once is the link table's primary key under the session
   * lock.
   */
  public PublishedResult acceptPublished(UUID testId, UUID revisionId, String principal) {
    if (!org.springframework.transaction.support.TransactionSynchronizationManager
        .isActualTransactionActive()) {
      throw new IllegalStateException("Proof acceptance requires the publication transaction");
    }
    try {
      return new PublishedResult(acceptCore(testId, principal, null, null, null, revisionId), null);
    } catch (StudioConflictException ex) {
      return new PublishedResult(null, "NOT_READY");
    } catch (StudioQuotaExceededException ex) {
      return new PublishedResult(null, "PENDING_QUOTA_EXCEEDED");
    } catch (StudioDispatchDisabledException ex) {
      return new PublishedResult(null, "DISPATCH_DISABLED");
    } catch (StudioReferenceResolver.UnknownReferenceException ex) {
      return new PublishedResult(null, "REFERENCE_UNAVAILABLE");
    } catch (VaultProviderUnavailableException ex) {
      return new PublishedResult(null, "VAULT_UNAVAILABLE");
    } catch (StudioValidationException ex) {
      return new PublishedResult(
          null,
          "STEP_LIMIT_EXCEEDED".equals(ex.getCode())
              ? "STEP_LIMIT_EXCEEDED"
              : "RUNTIME_INCOMPATIBLE");
    } catch (GuidedSessionException ex) {
      // The observed binding was refused before any row was written (unsupported pin, scope drift).
      return new PublishedResult(null, "RUNTIME_INCOMPATIBLE");
    }
  }

  @SuppressWarnings("checkstyle:ParameterNumber")
  public StudioAcceptanceService(
      StudioRepository tests,
      UITestRevisionRepository revisions,
      UITestExecutionRepository executions,
      com.citi.put.checks.studio.StudioDispatchLedgerRepository ledger,
      ExecutionReadiness readiness,
      StudioReferenceResolver references,
      StudioExecutionProperties properties,
      ObjectMapper objectMapper,
      JdbcTemplate jdbc) {
    this(
        tests,
        revisions,
        executions,
        ledger,
        readiness,
        references,
        properties,
        objectMapper,
        jdbc,
        Clock.systemUTC());
  }

  @Autowired
  @SuppressWarnings("checkstyle:ParameterNumber")
  StudioAcceptanceService(
      StudioRepository tests,
      UITestRevisionRepository revisions,
      UITestExecutionRepository executions,
      com.citi.put.checks.studio.StudioDispatchLedgerRepository ledger,
      ExecutionReadiness readiness,
      StudioReferenceResolver references,
      StudioExecutionProperties properties,
      ObjectMapper objectMapper,
      JdbcTemplate jdbc,
      Clock clock) {
    this.tests = tests;
    this.revisions = revisions;
    this.executions = executions;
    this.ledger = ledger;
    this.readiness = readiness;
    this.references = references;
    this.properties = properties;
    this.objectMapper = objectMapper;
    this.jdbc = jdbc;
    this.clock = clock;
  }

  /** The idempotency unique index refused a second row; the winner must be read in a new one. */
  public static class IdempotencyRaceException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String principal;
    private final String idempotencyKey;

    public IdempotencyRaceException(String principal, String idempotencyKey, Throwable cause) {
      super("Concurrent execute for principal-scoped idempotency key", cause);
      this.principal = principal;
      this.idempotencyKey = idempotencyKey;
    }

    public String getPrincipal() {
      return principal;
    }

    public String getIdempotencyKey() {
      return idempotencyKey;
    }
  }

  /**
   * An execute that carries no observed Run authorization. It can never create an execution: it
   * answers the kill switch, the lifecycle, an idempotent replay of an execution already accepted
   * under the same key, or the readiness refusal ({@code 409 LEARN_REQUIRED} for a test with no
   * learned revision) in that order, and an observed revision without a grant is {@code 409
   * AUTHORIZATION_REQUIRED}.
   *
   * @throws StudioDispatchDisabledException the kill switch is engaged ({@code 503})
   * @throws StudioConflictException readiness or idempotency-key reuse ({@code 409})
   * @throws StudioQuotaExceededException a pending quota is full ({@code 429})
   * @throws StudioValidationException an input limit or an unknown reference ({@code 400})
   * @throws IdempotencyRaceException a concurrent accept won the unique index
   */
  // Propagation is REQUIRED rather than REQUIRES_NEW so that an interleaving test can hold this
  // transaction open across a second accept's insert (AC-7, AC-9, AC-39). In production nothing
  // calls this inside a transaction, so the two are equivalent there.
  @Transactional
  public UUID accept(UUID testId, String principal, String idempotencyKey) {
    return acceptCore(testId, principal, idempotencyKey, null, null, null);
  }

  /**
   * Accepts the proof replay of the recorded candidate on an author's request ("Verify again"). It
   * is the same accepted execution a publication's proof is: trigger source {@code AFTER_LEARN},
   * the candidate as the revision, and no model.
   */
  @Transactional
  public UUID acceptVerify(
      UUID testId,
      String principal,
      String key,
      com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization.Prepared
          authorization,
      UUID candidateRevisionId) {
    return acceptCore(testId, principal, key, null, authorization, candidateRevisionId);
  }

  /** The execution an earlier request with this principal and key already accepted, if any. */
  @Transactional(readOnly = true)
  public Optional<UUID> acceptedUnderKey(String principal, String idempotencyKey) {
    return ledger
        .findByPrincipalAndIdempotencyKey(principal, idempotencyKey)
        .map(StudioDispatchLedger::getExecutionId);
  }

  @Transactional
  public UUID acceptObserved(
      UUID testId,
      String principal,
      String key,
      com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization.Prepared
          authorization) {
    return acceptCore(testId, principal, key, null, authorization, null);
  }

  private UUID acceptCore(
      UUID testId,
      String principal,
      String idempotencyKey,
      ScheduledIdentity scheduled,
      com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization.Prepared
          observedGrant,
      UUID publishedRevisionId) {
    if (!properties.enabledOrDefault()) {
      throw new StudioDispatchDisabledException("Studio execution is currently disabled");
    }

    // Hold the draft row across readiness and execution snapshot creation. Confirmation and
    // authoring writes update this same row, so the lock prevents readiness from validating one
    // confirmed revision while the execution persists another from an earlier entity snapshot.
    UITest test =
        tests
            .findByIdForUpdate(testId)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + testId));
    if (entityManager != null) {
      entityManager.flush();
      entityManager.refresh(test);
    }
    if (test.getDeletedAt() != null) {
      throw new StudioConflictException("TEST_DELETED", "Test " + testId + " has been deleted");
    }
    if (test.getQuarantinedAt() != null) {
      throw new StudioConflictException(
          "TEST_QUARANTINED", "Test " + testId + " is quarantined and cannot be executed");
    }

    String key = emptyToNull(idempotencyKey);
    String digest = requestDigest(testId, principal);
    if (key != null) {
      Optional<StudioDispatchLedger> existing =
          ledger.findByPrincipalAndIdempotencyKey(principal, key);
      if (existing.isPresent()) {
        return resolveExisting(existing.get(), digest, key);
      }
    }

    // Which revision runs (ADR-SC-008 D5). A scheduled run fires the confirmed revision only; while
    // a recorded candidate exists the draft already follows the candidate, so the confirmed
    // revision is judged on its own evidence (verifier included) and runs under its own stored
    // configuration. A manual Run and a proof run the one runnable revision readiness names.
    boolean intrinsic = scheduled != null && test.getCandidateRevisionId() != null;
    UUID targetRevisionId =
        scheduled != null ? test.getConfirmedRevisionId() : readiness.runnableRevisionId(test);
    if (targetRevisionId == null) {
      throw new StudioConflictException(
          ExecutionReadiness.Verdict.LEARN_REQUIRED,
          "This test has not been learned yet. Run it to learn the steps before it can replay.");
    }
    ExecutionReadiness.Verdict verdict =
        intrinsic ? readiness.evaluateConfirmedIntrinsic(test) : readiness.evaluate(test);
    if (!verdict.ready()) {
      throw new StudioConflictException(verdict.errorCode(), verdict.message());
    }
    if (publishedRevisionId != null && !publishedRevisionId.equals(targetRevisionId)) {
      // The proof is of the recorded candidate only; a draft that moved on is not ready for it.
      throw new StudioConflictException(
          ExecutionReadiness.Verdict.LEARN_REQUIRED,
          "The recorded revision no longer matches the draft. Run the test to learn it again.");
    }
    boolean diagnostic =
        scheduled == null
            && publishedRevisionId == null
            && !targetRevisionId.equals(test.getConfirmedRevisionId());

    UITestRevision revision =
        revisions
            .findById(targetRevisionId)
            .orElseThrow(
                () ->
                    new StudioConflictException(
                        ExecutionReadiness.Verdict.LEARN_REQUIRED,
                        "The learned revision for this draft is no longer available"));

    // One execution family (ADR-SC-005): only an observed revision runs, and only under a fresh
    // explicit Run authorization. Readiness has already refused every other revision.
    if (revision.getArtifactSchemaVersion() < 2) {
      throw new StudioConflictException(
          ExecutionReadiness.Verdict.LEARN_REQUIRED,
          "This test has no learned revision. Run it to learn the steps before it can replay.");
    }
    if (observedGrant == null && observed != null) {
      if (scheduled != null) {
        // A scheduled run has no caller session: it runs as the constant scheduler principal
        // against the test's current confirmed revision, and this mints the same binding an
        // explicit Run carries.
        observedGrant = observed.prepareScheduled(test, revision, principal);
      } else if (publishedRevisionId != null) {
        // The proof of a publication runs as the learner, on the authority of the fresh execute
        // proof the finalize request has just obtained (see prepareForPublication).
        observedGrant = observed.prepareForPublication(test, revision, principal);
      }
    }
    if (observedGrant == null || observed == null) {
      throw new StudioConflictException(
          "AUTHORIZATION_REQUIRED", "Observed replay needs fresh explicit Run authorization");
    }

    List<String> steps = CanonicalStudioCodec.parseSteps(revision.getSource());
    int maxSteps = properties.quotasOrDefault().maxStepsPerTestOrDefault();
    if (steps.size() > maxSteps) {
      throw new StudioValidationException(
          "STEP_LIMIT_EXCEEDED",
          "This revision declares " + steps.size() + " steps; the bound is " + maxSteps);
    }

    // Names are taken from the immutable confirmed revision. Plain values are already persisted on
    // the draft and are snapshotted with this accepted execution; Vault is reserved for secrets.
    //
    // Whoever may run the test may use its secrets: the resolver reads them under the test's own
    // Vault scope, so no secret of another test is reachable.
    //
    // The declaration is read from the confirmed revision the execution is about to snapshot,
    // never from the draft's current `variables` and never from the request (AC-5a). An
    // unreadable declaration is terminal rather than an empty set (AC-10).
    ReferenceDeclarations declarations =
        ExecutionReferences.declared(objectMapper, revision.getReferences());
    Map<String, String> plainVariables = plainVariableValues(test, declarations);
    references.preflight(
        test.getCsiId(), test.getEnvironment(), test.getId(), principal, secretsOnly(declarations));

    enforcePendingQuotas(test.getCsiId());

    Instant acceptedAt =
        com.citi.put.checks.studio.guided.publication.PublicationContracts.millisecond(
            clock.instant());
    JsonNode observedBinding = observed.bind(observedGrant, test, revision, acceptedAt);
    if (!observedBinding.path("principalId").asText().equals(principal)) {
      throw new StudioConflictException("AUTHORIZATION_REQUIRED", "Execution principal changed");
    }
    UITestExecution execution =
        new UITestExecution(
            UUID.fromString(observedBinding.path("executionId").asText()),
            testId,
            ExecutionStatus.PENDING,
            acceptedAt,
            test.getCsiId());
    execution.setObservedRevisionBinding(observedBinding.toString());
    execution.markFullExecution();
    execution.setPrincipal(principal);
    execution.setEnvironment(test.getEnvironment());
    execution.setRevisionId(revision.getId());
    execution.setTriggerSource(
        scheduled != null ? "SCHEDULED" : publishedRevisionId != null ? "AFTER_LEARN" : "MANUAL");
    if (scheduled != null) {
      execution.setScheduleId(scheduled.scheduleId());
      execution.setScheduledAt(scheduled.scheduledAt());
    }
    execution.setDiagnostic(diagnostic);
    execution.setConfigurationSnapshot(
        intrinsic
            ? storedConfigurationSnapshot(revision, plainVariables)
            : configurationSnapshot(test, revision, plainVariables));
    execution.setStepResults(pendingStepResults(steps));
    execution = executions.save(execution);

    StudioDispatchLedger row =
        new StudioDispatchLedger(
            execution.getId(),
            acceptedAt,
            testId,
            test.getCsiId(),
            principal,
            key,
            key == null ? null : digest);
    // Queue time and browser runtime are separate budgets (AC-19): this is the pending SLA, and
    // start/run deadlines are assigned by the admission CAS from a different origin.
    row.setPendingDeadlineAt(acceptedAt.plus(properties.pendingSlaOrDefault()));
    try {
      ledger.saveAndFlush(row);
    } catch (DataIntegrityViolationException e) {
      throw new IdempotencyRaceException(principal, key, e);
    }
    return execution.getId();
  }

  private UUID resolveExisting(StudioDispatchLedger existing, String digest, String key) {
    if (!digest.equals(existing.getRequestDigest())) {
      throw new StudioConflictException(
          "IDEMPOTENCY_KEY_REUSED",
          "Idempotency key '" + key + "' was already used with a different request");
    }
    return existing.getExecutionId();
  }

  /**
   * Resolves an idempotency race outside the poisoned transaction (AC-7). The winner's row is
   * committed by the time the unique index rejected us, so this read is not a retry of a guess.
   */
  @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
  public UUID resolveIdempotencyRace(UUID testId, String principal, String idempotencyKey) {
    String digest = requestDigest(testId, principal);
    StudioDispatchLedger winner =
        ledger
            .findByPrincipalAndIdempotencyKey(principal, idempotencyKey)
            .orElseThrow(
                () ->
                    new IllegalStateException(
                        "The idempotency index refused an insert but holds no winning row"));
    return resolveExisting(winner, digest, idempotencyKey);
  }

  /**
   * The two pending bounds, taken inside the acceptance transaction (AC-9).
   *
   * <p>The locks are transaction-scoped, so they are held across the count <em>and</em> the insert
   * that follows and are released by commit. Global first, per-CSI second, always: a fixed lock
   * order is what makes two concurrent accepts on different CSIs unable to deadlock.
   */
  private void enforcePendingQuotas(String csiId) {
    jdbc.queryForObject(
        "SELECT pg_advisory_xact_lock(?, ?)", Object.class, LOCK_NAMESPACE, GLOBAL_QUOTA_LOCK);
    jdbc.queryForObject(
        "SELECT pg_advisory_xact_lock(?, ?)", Object.class, LOCK_NAMESPACE, csiLockKey(csiId));

    StudioExecutionProperties.Quotas quotas = properties.quotasOrDefault();
    Integer global =
        jdbc.queryForObject(
            "SELECT count(*) FROM studio_dispatch_ledger WHERE state <> 'DONE'", Integer.class);
    if (global != null && global >= quotas.globalOrDefault()) {
      throw new StudioQuotaExceededException(
          "PENDING_QUOTA_EXCEEDED",
          "The global Studio pending quota of " + quotas.globalOrDefault() + " is full");
    }
    Integer perCsi =
        jdbc.queryForObject(
            "SELECT count(*) FROM studio_dispatch_ledger WHERE state <> 'DONE' AND csi_id = ?",
            Integer.class,
            csiId);
    if (perCsi != null && perCsi >= quotas.perCsiOrDefault()) {
      throw new StudioQuotaExceededException(
          "PENDING_QUOTA_EXCEEDED",
          "CSI " + csiId + " already has " + perCsi + " pending Studio executions");
    }
  }

  /** A stable int key per CSI. Collisions cost extra serialization and nothing else. */
  private static int csiLockKey(String csiId) {
    return csiId == null ? 0 : csiId.hashCode();
  }

  /**
   * The digest of what was actually <em>requested</em> (AC-7).
   *
   * <p>It covers the method, the public route, the test id and the principal, each length-prefixed
   * so that a value containing the separator cannot be read as two fields. It covers <b>no server
   * state</b> — not the revision, not the configuration, not the environment, not a clock reading —
   * because returning the same execution is the entire point of a retry, and a digest that moved
   * when the server moved would turn every retry into a {@code 409}.
   */
  static String requestDigest(UUID testId, String principal) {
    StringBuilder material = new StringBuilder("studio-execute-digest-v2");
    appendField(material, "POST");
    appendField(material, "/api/v1/studio/tests/{id}/execute");
    appendField(material, testId == null ? "" : testId.toString());
    appendField(material, principal == null ? "" : principal);
    try {
      MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
      return HexFormat.of()
          .formatHex(sha256.digest(material.toString().getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 is required to compute a request digest", e);
    }
  }

  private static void appendField(StringBuilder material, String value) {
    material.append('|').append(value.length()).append(':').append(value);
  }

  /** The immutable nonsecret configuration and plain-variable snapshot taken at acceptance. */
  private String configurationSnapshot(
      UITest test, UITestRevision revision, Map<String, String> plainVariables) {
    Map<String, Object> snapshot = new LinkedHashMap<>();
    snapshot.put("browser", test.getBrowser());
    snapshot.put("viewportWidth", test.getViewportWidth());
    snapshot.put("viewportHeight", test.getViewportHeight());
    snapshot.put("timeoutSeconds", test.getTimeoutSeconds());
    snapshot.put("waitStrategy", test.getWaitStrategy());
    snapshot.put("environment", test.getEnvironment());
    snapshot.put("sourceRevision", revision.getSourceRevision());
    snapshot.put("configurationRevision", revision.getConfigurationRevision());
    snapshot.put("artifactHash", revision.getArtifactHash());
    snapshot.put("variables", plainVariables);
    return writeJson(snapshot);
  }

  /**
   * The snapshot of a run of a revision the draft has moved past: the revision's own stored
   * configuration, never the draft's. Plain variable values are not versioned on a revision, so
   * they still come from the draft by the revision's declared names (a missing one is refused
   * before this point).
   */
  private String storedConfigurationSnapshot(
      UITestRevision revision, Map<String, String> plainVariables) {
    JsonNode stored;
    try {
      stored = objectMapper.readTree(revision.getConfiguration());
    } catch (JsonProcessingException e) {
      throw new StudioConflictException(
          ExecutionReadiness.Verdict.LEARN_REQUIRED,
          "The stored configuration of the learned revision cannot be read");
    }
    Map<String, Object> snapshot = new LinkedHashMap<>();
    snapshot.put("browser", stored.path("browser").asText(null));
    snapshot.put("viewportWidth", stored.path("viewport").path("width").asInt());
    snapshot.put("viewportHeight", stored.path("viewport").path("height").asInt());
    snapshot.put("timeoutSeconds", stored.path("timeoutSeconds").asInt());
    snapshot.put("waitStrategy", stored.path("waitStrategy").asText(null));
    snapshot.put("environment", stored.path("environment").asText(null));
    snapshot.put("sourceRevision", revision.getSourceRevision());
    snapshot.put("configurationRevision", revision.getConfigurationRevision());
    snapshot.put("artifactHash", revision.getArtifactHash());
    snapshot.put("variables", plainVariables);
    return writeJson(snapshot);
  }

  private static Map<String, String> plainVariableValues(
      UITest test, ReferenceDeclarations declarations) {
    Map<String, String> available = new LinkedHashMap<>();
    for (StudioVariable variable : CanonicalStudioCodec.parseVariables(test.getVariables())) {
      if (StudioVariable.KIND_PLAIN.equals(variable.kind()) && variable.value() != null) {
        available.put(variable.name(), variable.value());
      }
    }
    Map<String, String> selected = new LinkedHashMap<>();
    for (String name : declarations.variables()) {
      if (!available.containsKey(name)) {
        throw new StudioReferenceResolver.UnknownReferenceException(name);
      }
      selected.put(name, available.get(name));
    }
    return Map.copyOf(selected);
  }

  private static ReferenceDeclarations secretsOnly(ReferenceDeclarations declarations) {
    return new ReferenceDeclarations(List.of(), declarations.secrets());
  }

  /**
   * One entry per original step, all {@code PENDING} (§8.2, AC-24). The persisted result therefore
   * has the right shape from acceptance onwards, and the runner never has to resend {@code
   * originalText}.
   */
  private String pendingStepResults(List<String> steps) {
    List<Map<String, Object>> results = new java.util.ArrayList<>();
    for (int index = 0; index < steps.size(); index++) {
      Map<String, Object> entry = new LinkedHashMap<>();
      entry.put("stepIndex", index);
      entry.put("originalText", steps.get(index));
      entry.put("status", com.citi.put.checks.studio.dto.StepResult.PENDING);
      entry.put("offsetMs", null);
      entry.put("durationMs", null);
      entry.put("message", null);
      results.add(entry);
    }
    return writeJson(results);
  }

  private String writeJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("Could not serialize an acceptance snapshot", e);
    }
  }

  private static String emptyToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
