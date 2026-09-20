package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.UITestExecutionRepository;
import com.citi.put.checks.studio.UITestRevisionRepository;
import com.citi.put.checks.studio.dto.ExecutionStatus;
import com.citi.put.checks.studio.dto.LegacyStudioAdapter;
import com.citi.put.checks.studio.entity.StudioDispatchLedger;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestExecution;
import com.citi.put.checks.studio.entity.UITestRevision;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
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

  @Autowired
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
   * Accepts an execution, or refuses it. Returns the accepted execution id.
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
    if (!properties.enabledOrDefault()) {
      throw new StudioDispatchDisabledException("Studio execution is currently disabled");
    }

    UITest test =
        tests
            .findByIdForUpdate(testId)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + testId));
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

    ExecutionReadiness.Verdict verdict = readiness.evaluate(test);
    if (!verdict.ready()) {
      throw new StudioConflictException(verdict.errorCode(), verdict.message());
    }

    UITestRevision revision =
        revisions
            .findById(test.getConfirmedRevisionId())
            .orElseThrow(
                () ->
                    new StudioConflictException(
                        ExecutionReadiness.Verdict.COMPILE_REQUIRED,
                        "The confirmed revision for this draft is no longer available"));

    List<String> steps = LegacyStudioAdapter.parseSteps(revision.getSource());
    int maxSteps = properties.quotasOrDefault().maxStepsPerTestOrDefault();
    if (steps.size() > maxSteps) {
      throw new StudioValidationException(
          "STEP_LIMIT_EXCEEDED",
          "This revision declares " + steps.size() + " steps; the bound is " + maxSteps);
    }

    // Names only, typed. Values are resolved at dispatch (§5.1.3) and nowhere else.
    //
    // Two decisions are made here and they are deliberately separate (AC-4): the route's CSI
    // check has already established that this principal may execute for this CSI, and the
    // resolver additionally consults StudioSecretUseAuthorization per declared secret. §9.2 is
    // explicit that "Secret reference names alone grant no permission", and executing a draft does
    // not entitle a principal to every reference the draft names.
    //
    // The declaration is read from the confirmed revision the execution is about to snapshot,
    // never from the draft's current `variables` and never from the request (AC-5a). An
    // unreadable declaration is terminal rather than an empty set (AC-10).
    references.preflight(
        test.getCsiId(),
        test.getEnvironment(),
        principal,
        ExecutionReferences.declared(objectMapper, revision.getReferences()));

    enforcePendingQuotas(test.getCsiId());

    Instant acceptedAt = clock.instant();
    UITestExecution execution =
        new UITestExecution(testId, ExecutionStatus.PENDING, acceptedAt, test.getCsiId());
    execution.markFullExecution();
    execution.setPrincipal(principal);
    execution.setEnvironment(test.getEnvironment());
    execution.setRevisionId(revision.getId());
    execution.setConfigurationSnapshot(configurationSnapshot(test, revision));
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

  /** The nonsecret configuration snapshot taken at acceptance (§8.1). Never a resolved value. */
  private String configurationSnapshot(UITest test, UITestRevision revision) {
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
    return writeJson(snapshot);
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
