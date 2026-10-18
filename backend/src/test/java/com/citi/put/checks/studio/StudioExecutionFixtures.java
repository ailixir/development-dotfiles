package com.citi.put.checks.studio;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;

/**
 * Seeding shared by the story 10.7 integration tests.
 *
 * <p><b>STUDIO-OBS-012A (ADR-SC-005 D-A).</b> Only an observed ({@code GUIDED_RUN}) revision may
 * execute, so {@link #confirmRevision} and {@link #seedRunnableTest} publish one through the
 * production publication writers ({@link ObservedPublicationFixture}). A test that executes must
 * register the trusted observed-replay configuration ({@link ObservedPublicationFixture#register}),
 * import {@link ObservedPublicationFixture.FreshAuthority}, and send the Run with the caller's
 * session ({@link ObservedPublicationFixture#request}).
 */
public final class StudioExecutionFixtures {

  private static final com.fasterxml.jackson.databind.ObjectMapper MAPPER =
      new com.fasterxml.jackson.databind.ObjectMapper();

  private final JdbcTemplate jdbc;

  public StudioExecutionFixtures(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /**
   * An identity with the given role on one CSI, and no administrator escape hatch.
   *
   * <p>The Core user id is the email, the shape of the Core identity contract ({@code
   * FakeCoreServiceClient}). An observed Run records the Core user id as the execution principal
   * (ADR-SC-005), so principal-scoped assertions and secret-use grants keyed by the email keep
   * naming the same caller.
   */
  public static Authentication identity(String email, String csiId, String role) {
    return new BffAuthenticationToken(
        new UserIdentity(
            email, email, email, "Ops", List.of(), List.of(new CsiOwnershipEntry(csiId, role))));
  }

  /** A platform administrator: readable and executable everywhere. */
  public static Authentication admin(String email) {
    return new BffAuthenticationToken(
        new UserIdentity(email, email, email, "Ops", List.of("checks-admin"), List.of()));
  }

  public void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Studio User', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  public void seedCsi(String csiId, String ownerEmail) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Studio CSI ' || ?, 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        csiId,
        csiId,
        ownerEmail,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  /** A draft with the given steps, at source/configuration revision 1/1 and {@code STALE}. */
  public UUID seedTest(String name, String csiId, String createdBy, List<String> steps) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " timeout_seconds, wait_strategy, created_by, created_at, updated_at)"
            + " VALUES (?, ?, ?, 'Production', 'chromium', CAST(? AS jsonb), CAST('[]' AS jsonb),"
            + " 30, 'networkidle', ?, ?, ?)",
        id,
        name,
        csiId,
        stepsJson(steps),
        createdBy,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    com.citi.put.checks.studio.support.CanonicalAuthoringFixture.seed(jdbc, id);
    return id;
  }

  /** The reference declaration of a revision that declares nothing (§8.3). */
  public static final String NO_REFERENCES = "{\"variables\":[],\"secrets\":[]}";

  /**
   * The publisher's input sets (AC-1). Not a stored document: the publication writes the single V21
   * {@code RevisionReferences} shape that {@code ExecutionReferences} reads.
   */
  public static String references(List<String> variables, List<String> secrets) {
    return "{\"variables\":["
        + variables.stream()
            .map(name -> '"' + name + '"')
            .collect(java.util.stream.Collectors.joining(","))
        + "],\"secrets\":["
        + secrets.stream()
            .map(name -> '"' + name + '"')
            .collect(java.util.stream.Collectors.joining(","))
        + "]}";
  }

  /** A nonsecret configuration in the shape the contract's {@code TestConfiguration} declares. */
  public static final String DEFAULT_CONFIGURATION =
      "{\"browser\":\"chromium\",\"viewport\":{\"width\":1280,\"height\":720},"
          + "\"timeoutSeconds\":30,\"waitStrategy\":\"load\"}";

  /**
   * Publishes the draft's current steps and configuration as an observed revision and confirms it
   * (ADR-SC-005: the only runnable family).
   *
   * @param steps the draft's steps; an observed revision always learns the draft's current text, so
   *     these must be what the draft holds
   * @param references the declaration document, or {@code null} for none
   * @return the published revision id
   */
  public UUID confirmRevision(UUID testId, String csiId, List<String> steps, String references) {
    String held =
        jdbc.queryForObject("SELECT steps::text FROM ui_tests WHERE id = ?", String.class, testId);
    String expected = stepsJson(steps);
    try {
      if (!MAPPER.readTree(held).equals(MAPPER.readTree(expected))) {
        throw new IllegalArgumentException(
            "An observed revision learns the draft's current steps; the draft holds " + held);
      }
      String csi =
          jdbc.queryForObject("SELECT csi_id FROM ui_tests WHERE id = ?", String.class, testId);
      if (!csiId.equals(csi)) {
        throw new IllegalArgumentException("The draft belongs to CSI " + csi);
      }
      com.fasterxml.jackson.databind.JsonNode declared =
          MAPPER.readTree(references == null ? NO_REFERENCES : references);
      List<String> variables = new java.util.ArrayList<>();
      List<String> secrets = new java.util.ArrayList<>();
      declared.path("variables").forEach(name -> variables.add(name.asText()));
      declared.path("secrets").forEach(name -> secrets.add(name.asText()));
      return new ObservedPublicationFixture(jdbc).publish(testId, variables, secrets);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalArgumentException(e);
    }
  }

  /**
   * An execution history row with no observed revision binding, and its dispatch-ledger locator
   * (STUDIO-OBS-012A architect ruling R2).
   *
   * <p>The final schema still allows this row shape: {@code ui_test_executions.csi_id} is nullable
   * (V13, core history the backfill could not resolve) and the V15 observed execution guard checks
   * nothing on a row whose {@code observed_revision_binding} is null and whose revision is not a
   * {@code GUIDED_RUN} publication. Only such a row may have its own CSI changed or cleared, so the
   * route-level CSI authorization tests seat their mutation here. An observed (bound) row refuses
   * the same mutation in the database.
   *
   * <p>{@code revision_id} is null: every revision under V15 is a {@code GUIDED_RUN} publication,
   * and the guard refuses an unbound row that names one. {@code PENDING}/{@code RUNNING} rows get a
   * {@code QUEUED} ledger row (claimable by {@code StudioDispatchLedgerStatements}); any other
   * status is terminal and gets a {@code DONE} ledger row. No dispatcher runs under the {@code
   * test} profile, so the queued row is not picked up.
   *
   * @param status the history status ({@code PENDING}, {@code RUNNING}, {@code PASSED}, {@code
   *     FAILED} or {@code ERROR})
   * @return the execution id
   */
  public UUID unboundExecution(
      UUID testId, String csiId, String principal, String environment, String status) {
    UUID executionId = UUID.randomUUID();
    Timestamp acceptedAt =
        Timestamp.from(Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS));
    boolean terminal = !"PENDING".equals(status) && !"RUNNING".equals(status);
    jdbc.update(
        "INSERT INTO studio_dispatch_ledger (execution_id, execution_accepted_at, test_id, csi_id,"
            + " principal, state) VALUES (?, ?, ?, ?, ?, ?)",
        executionId,
        acceptedAt,
        testId,
        csiId,
        principal,
        terminal ? "DONE" : "QUEUED");
    jdbc.update(
        "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at, ended_at, duration_ms,"
            + " csi_id, principal, environment, revision_id, observed_revision_binding,"
            + " observed_admission_receipt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)",
        executionId,
        testId,
        status,
        acceptedAt,
        terminal ? acceptedAt : null,
        terminal ? 0 : null,
        csiId,
        principal,
        environment);
    return executionId;
  }

  /** A draft with a published observed revision of its current steps: runnable. */
  public RunnableTest seedRunnableTest(
      String name, String csiId, String createdBy, List<String> steps) {
    UUID testId = seedTest(name, csiId, createdBy, steps);
    UUID revisionId = confirmRevision(testId, csiId, steps, null);
    return new RunnableTest(testId, revisionId);
  }

  /** A runnable draft and its confirmed revision. */
  public record RunnableTest(UUID testId, UUID revisionId) {}

  private static String stepsJson(List<String> steps) {
    StringBuilder json = new StringBuilder("[");
    for (int index = 0; index < steps.size(); index++) {
      if (index > 0) {
        json.append(',');
      }
      json.append('"').append(steps.get(index).replace("\"", "\\\"")).append('"');
    }
    return json.append(']').toString();
  }
}
