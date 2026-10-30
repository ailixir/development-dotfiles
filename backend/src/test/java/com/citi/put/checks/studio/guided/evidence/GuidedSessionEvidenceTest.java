package com.citi.put.checks.studio.guided.evidence;

import static com.citi.put.checks.studio.guided.evidence.GuidedRecordingSeed.action;
import static com.citi.put.checks.studio.guided.evidence.GuidedRecordingSeed.body;
import static com.citi.put.checks.studio.guided.evidence.GuidedRecordingSeed.timings;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.ExecutionSnapshotMapper;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedInternalSecurity;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Duration;
import java.util.UUID;
import java.util.function.Consumer;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * STUDIO-OBS-013 AR-1 R3/R5/R6 on real PostgreSQL: the recording-evidence acceptance predicate, the
 * write-once V20 fact and the R1 projection judged on the database clock.
 *
 * <p>Needs V20 ({@code studio_guided_session_recordings}, data lane) and the C1 bridge definition
 * {@code recordingEvidence}. Time is moved only through the DB-side {@code expires_at} written at
 * seed time; no application clock is faked.
 */
class GuidedSessionEvidenceTest {

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine");
  private static final Duration RETENTION = Duration.ofDays(30);

  private final GuidedContracts contracts = new GuidedContracts();
  private final Authentication worker = identity("worker-1", "owning-worker");
  private JdbcTemplate jdbc;
  private GuidedRecordingSeed seed;
  private GuidedSessionEvidenceService service;
  private GuidedSessionEvidenceRepository evidence;
  private TransactionTemplate transactions;

  @BeforeAll
  static void database() {
    POSTGRES.start();
  }

  @AfterAll
  static void close() {
    POSTGRES.stop();
  }

  /**
   * The internal identity type is package-private to the session package; build it reflectively.
   */
  static Authentication identity(String subject, String role) {
    try {
      var type =
          Class.forName(
              "com.citi.put.checks.studio.guided.session.GuidedInternalSecurity$Identity");
      var constructor = type.getDeclaredConstructor(String.class, String.class);
      constructor.setAccessible(true);
      return (Authentication) constructor.newInstance(subject, role);
    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException(e);
    }
  }

  @BeforeEach
  void setup() {
    String database = "rec_" + UUID.randomUUID().toString().replace("-", "");
    var admin =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    new JdbcTemplate(admin).execute("CREATE DATABASE " + database);
    var source =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl().replace(POSTGRES.getDatabaseName(), database),
            POSTGRES.getUsername(),
            POSTGRES.getPassword());
    jdbc = new JdbcTemplate(source);
    Flyway.configure().dataSource(source).load().migrate();
    seed = new GuidedRecordingSeed(jdbc);
    transactions = new TransactionTemplate(new DataSourceTransactionManager(source));
    var sessions = new GuidedSessionRepository(jdbc, transactions, contracts);
    evidence = new GuidedSessionEvidenceRepository(jdbc);
    service =
        new GuidedSessionEvidenceService(
            sessions,
            evidence,
            new GuidedMaterializationService(
                jdbc, contracts, com.citi.put.checks.studio.support.TestDomains.FIXTURES),
            contracts,
            new GuidedRecordingProperties(null),
            new StudioExecutionProperties(
                null, null, null, null, null, null, RETENTION, null, null, null, null, null));
  }

  private int rows(String sessionId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_session_recordings WHERE session_id=?",
        Integer.class,
        sessionId);
  }

  private RecordedGuidedEvidenceProjection projection(boolean serves) {
    return new RecordedGuidedEvidenceProjection(
        evidence, new GuidedRecordingProperties(null), serves, contracts);
  }

  private void validVideo(GuidedEvidenceProjection.Projection p) {
    contracts.validate("v3/result#/definitions/videoEvidence", p.video());
  }

  // ── acceptance ────────────────────────────────────────────────────────────

  @Test
  void aTerminalSessionWithinTheWindowIsAcceptedAndNotRevived() {
    var s = seed.session("SUCCEEDED", 60, 2);
    seed.action(s.sessionId(), "a1", "step-1", 0, true);
    seed.action(s.sessionId(), "a2", "step-2", 0, true);
    ObjectNode body = body(s, "rec-1", "STORED", false);
    timings(body).add(action("a1", "step-1", 0, 120, 480));
    timings(body).add(action("a2", "step-2", 0, 900, null));
    String before = seed.sessionRow(s.sessionId());

    JsonNode echo = service.record(worker, s.sessionId(), 2L, "rec-rec-1", body);

    assertThat(echo).isEqualTo(body);
    assertThat(echo.toString()).isEqualTo(GuidedContracts.canonical(body));
    assertThat(rows(s.sessionId())).isEqualTo(1);
    // Document, progress and state byte-unchanged: no revival, owner and lease untouched.
    assertThat(seed.sessionRow(s.sessionId())).isEqualTo(before);
    var stored =
        jdbc.queryForMap(
            "SELECT state,partial,video_key,manifest_key,worker_id,owner_fence,recording_id,"
                + "timings::text AS timings,"
                + "extract(epoch FROM expires_at - recorded_at)::bigint AS retention"
                + " FROM studio_guided_session_recordings"
                + " WHERE session_id=?",
            s.sessionId());
    assertThat(stored.get("state")).isEqualTo("AVAILABLE");
    assertThat(stored.get("partial")).isEqualTo(false);
    assertThat(stored.get("video_key"))
        .isEqualTo("studio/CSI-123/guided/" + s.sessionId() + ".webm");
    assertThat(stored.get("manifest_key"))
        .isEqualTo("studio/CSI-123/guided/" + s.sessionId() + ".manifest.json");
    assertThat(stored.get("worker_id")).isEqualTo("worker-1");
    assertThat(stored.get("owner_fence")).isEqualTo(2);
    assertThat(stored.get("recording_id")).isEqualTo("rec-1");
    // expires_at = recorded_at + studio.execution.evidence-retention, from one DB-clock sample.
    assertThat(((Number) stored.get("retention")).longValue()).isEqualTo(RETENTION.toSeconds());
    JsonNode stamped = contracts.parse((String) stored.get("timings"));
    assertThat(stamped).hasSize(4);
    assertThat(stamped.get(0).path("kind").asText()).isEqualTo("step");
    assertThat(stamped.get(3).path("admissionId").asText()).isEqualTo("a2");
  }

  @Test
  void everySessionStateIsAcceptedIncludingNonTerminal() {
    for (String state : new String[] {"ACTING", "FINALIZING", "CANCELLED", "UNKNOWN_OUTCOME"}) {
      var s = seed.session(state, 60, 1);
      service.record(worker, s.sessionId(), 1L, "k", body(s, "r-" + state, "UNAVAILABLE", false));
      assertThat(rows(s.sessionId())).isEqualTo(1);
    }
  }

  @Test
  void theWindowIsJudgedOnTheDatabaseClockAgainstExpiresAtPlusGrace() {
    // Default grace PT2M: 60 s past expiry is still inside, 180 s past is outside.
    var inside = seed.session("SUCCEEDED", -60, 1);
    service.record(worker, inside.sessionId(), 1L, "k", body(inside, "r1", "FAILED", false));
    assertThat(rows(inside.sessionId())).isEqualTo(1);

    var outside = seed.session("SUCCEEDED", -180, 1);
    assertThatThrownBy(
            () ->
                service.record(
                    worker, outside.sessionId(), 1L, "k", body(outside, "r2", "FAILED", false)))
        .hasMessage("EXPIRED");
    assertThat(rows(outside.sessionId())).isZero();
  }

  @Test
  void identityRefusals() {
    var s = seed.session("SUCCEEDED", 60, 3);
    ObjectNode good = body(s, "r", "UNAVAILABLE", false);

    assertThatThrownBy(
            () ->
                service.record(identity("worker-2", "owning-worker"), s.sessionId(), 3L, "k", good))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThatThrownBy(
            () ->
                service.record(
                    identity("worker-1", "backend-controller"), s.sessionId(), 3L, "k", good))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThatThrownBy(
            () ->
                service.record(
                    new UsernamePasswordAuthenticationToken("worker-1", null),
                    s.sessionId(),
                    3L,
                    "k",
                    good))
        .hasMessage("UNAUTHENTICATED");
    assertThatThrownBy(() -> service.record(worker, s.sessionId(), 2L, "k", good))
        .hasMessage("STALE_FENCE");
    refused(s, b -> b.put("ownerFence", 2), "STALE_FENCE");
    refused(s, b -> b.put("workerId", "worker-2"), "FORBIDDEN_SCOPE");
    refused(s, b -> b.put("scopeHash", "0".repeat(64)), "FORBIDDEN_SCOPE");
    refused(s, b -> b.put("contextId", "ctx-other"), "STALE_FENCE");
    refused(s, b -> b.put("contextRevision", 2), "STALE_FENCE");
    refused(s, b -> b.put("sourceRevision", "source-2"), "STALE_FENCE");
    refused(s, b -> b.put("configurationRevision", "config-2"), "STALE_FENCE");
    refused(s, b -> b.put("sessionId", "other"), "INVALID_CONTRACT");

    var unknown = body(s, "r", "UNAVAILABLE", false).put("sessionId", "rec-unknown");
    assertThatThrownBy(() -> service.record(worker, "rec-unknown", 3L, "k", unknown))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThat(rows(s.sessionId())).isZero();
  }

  private void refused(GuidedRecordingSeed.Seeded s, Consumer<ObjectNode> mutate, String code) {
    ObjectNode body = body(s, "r", "UNAVAILABLE", false);
    mutate.accept(body);
    assertThatThrownBy(() -> service.record(worker, s.sessionId(), (long) s.fence(), "k", body))
        .as(code)
        .hasMessage(code);
    assertThat(rows(s.sessionId())).isZero();
  }

  @Test
  void writeOnceAndSameKeyIdempotency() {
    var s = seed.session("SUCCEEDED", 60, 1);
    seed.action(s.sessionId(), "a1", "step-1", 0, true);
    ObjectNode body = body(s, "rec-x", "STORED", true);
    timings(body).add(action("a1", "step-1", 0, 5, 6));

    JsonNode first = service.record(worker, s.sessionId(), 1L, "rec-rec-x", body);
    JsonNode again = service.record(worker, s.sessionId(), 1L, "rec-rec-x", body.deepCopy());
    assertThat(again).isEqualTo(first);
    // Byte identity, not only JSON equality: the replay reads the echo back from jsonb.
    assertThat(again.toString()).isEqualTo(first.toString());
    assertThat(rows(s.sessionId())).isEqualTo(1);

    ObjectNode changed = body.deepCopy().put("partial", false);
    assertThatThrownBy(() -> service.record(worker, s.sessionId(), 1L, "rec-rec-x", changed))
        .hasMessage("IDEMPOTENCY_CONFLICT");
    assertThatThrownBy(() -> service.record(worker, s.sessionId(), 1L, "rec-other", changed))
        .hasMessage("IDEMPOTENCY_CONFLICT");
    assertThat(rows(s.sessionId())).isEqualTo(1);
  }

  @Test
  void anIdenticalDuplicateAfterTheWindowEchoesWithoutChangingAnyFact() {
    var s = seed.session("SUCCEEDED", 60, 1);
    ObjectNode body = body(s, "rec-window", "UNAVAILABLE", false);
    JsonNode first = service.record(worker, s.sessionId(), 1L, "k-window", body);
    transactions.executeWithoutResult(
        status -> {
          jdbc.execute("SET LOCAL session_replication_role = 'replica'");
          assertThat(
                  jdbc.update(
                      "UPDATE studio_guided_sessions SET expires_at=clock_timestamp()-interval '3"
                          + " minutes',"
                          + " document=jsonb_set(document,'{expiresAt}',to_jsonb(to_char((clock_timestamp()-interval"
                          + " '3 minutes') AT TIME ZONE"
                          + " 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))) WHERE session_id=?",
                      s.sessionId()))
              .isEqualTo(1);
        });
    assertThat(evidence.withinAcceptanceWindow(s.sessionId(), 120)).isFalse();
    String before = seed.sessionRow(s.sessionId());
    String fact = recordingFact(s.sessionId());
    assertThat(service.record(worker, s.sessionId(), 1L, "k-window", body).toString())
        .isEqualTo(first.toString());
    assertThat(seed.sessionRow(s.sessionId())).isEqualTo(before);
    assertThat(recordingFact(s.sessionId())).isEqualTo(fact);
    assertThat(rows(s.sessionId())).isEqualTo(1);
    assertThatThrownBy(() -> service.record(worker, s.sessionId(), 1L, "new-key", body))
        .hasMessage("EXPIRED");
  }

  @Test
  void aDuplicateNeverBypassesCallerFenceScopeOrMaterializationIdentity() {
    var s = seed.session("SUCCEEDED", 60, 3);
    ObjectNode good = body(s, "rec-identity", "UNAVAILABLE", false);
    JsonNode first = service.record(worker, s.sessionId(), 3L, "k", good);
    String fact = recordingFact(s.sessionId());
    assertThatThrownBy(
            () ->
                service.record(identity("worker-2", "owning-worker"), s.sessionId(), 3L, "k", good))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThatThrownBy(
            () ->
                service.record(
                    identity("worker-1", "backend-controller"), s.sessionId(), 3L, "k", good))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThatThrownBy(() -> service.record(worker, s.sessionId(), 2L, "k", good))
        .hasMessage("STALE_FENCE");
    assertThatThrownBy(
            () ->
                service.record(
                    worker,
                    s.sessionId(),
                    3L,
                    "k",
                    good.deepCopy().put("scopeHash", "0".repeat(64))))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThatThrownBy(
            () ->
                service.record(
                    worker, s.sessionId(), 3L, "k", good.deepCopy().put("contextId", "ctx-other")))
        .hasMessage("STALE_FENCE");
    // A byte-identical accepted body still fails when the recorded materialization identity
    // differs.
    transactions.executeWithoutResult(
        status -> {
          jdbc.execute("SET LOCAL session_replication_role = 'replica'");
          assertThat(
                  jdbc.update(
                      "UPDATE studio_guided_materializations SET context_id='ctx-new' WHERE"
                          + " session_id=?",
                      s.sessionId()))
              .isEqualTo(1);
        });
    assertThatThrownBy(() -> service.record(worker, s.sessionId(), 3L, "k", good))
        .hasMessage("STALE_FENCE");
    assertThat(recordingFact(s.sessionId())).isEqualTo(fact);
    assertThat(rows(s.sessionId())).isEqualTo(1);
    assertThat(first).isEqualTo(contracts.parse(GuidedContracts.canonical(good)));
  }

  private String recordingFact(String sessionId) {
    return jdbc.queryForObject(
        "SELECT to_jsonb(r)::text FROM studio_guided_session_recordings r WHERE session_id=?",
        String.class,
        sessionId);
  }

  @Test
  void semanticTimingRefusalsWriteNoRow() {
    var s = seed.session("SUCCEEDED", 60, 1);
    seed.action(s.sessionId(), "a1", "step-1", 0, true);
    seed.action(s.sessionId(), "a2", "step-1", 1, true);
    seed.action(s.sessionId(), "admitted", "step-2", 0, false);
    var other = seed.session("SUCCEEDED", 60, 1);
    seed.action(other.sessionId(), "foreign", "step-1", 5, true);

    String[][] cases = {
      {"foreign", "step-1", "5", "10", "20"},
      {"admitted", "step-2", "0", "10", "20"},
      {"a1", "step-2", "0", "10", "20"},
      {"a1", "step-1", "1", "10", "20"},
      {"a1", "step-1", "0", "30", "20"},
      {"a1", "step-1", "0", "600001", "600002"},
    };
    for (String[] c : cases) {
      ObjectNode body = body(s, "r", "STORED", false);
      timings(body)
          .add(
              action(
                  c[0],
                  c[1],
                  Integer.parseInt(c[2]),
                  Integer.parseInt(c[3]),
                  Integer.parseInt(c[4])));
      assertThatThrownBy(() -> service.record(worker, s.sessionId(), 1L, "k", body))
          .as(String.join(",", c))
          .hasMessage("INVALID_CONTRACT");
    }
    ObjectNode duplicate = body(s, "r", "STORED", false);
    timings(duplicate).add(action("a1", "step-1", 0, 1, 2)).add(action("a1", "step-1", 0, 3, 4));
    ObjectNode unsorted = body(s, "r", "STORED", false);
    timings(unsorted).add(action("a2", "step-1", 1, 9, 10)).add(action("a1", "step-1", 0, 1, 2));
    for (ObjectNode b : new ObjectNode[] {duplicate, unsorted}) {
      assertThatThrownBy(() -> service.record(worker, s.sessionId(), 1L, "k", b))
          .hasMessage("INVALID_CONTRACT");
    }
    for (String kind : new String[] {"step", "clarificationWait", "prefixReplay"}) {
      ObjectNode b = body(s, "r", "STORED", false);
      ObjectNode item =
          GuidedRecordingSeed.JSON
              .createObjectNode()
              .put("kind", kind)
              .put("stepId", "step-1")
              .putNull("admissionId");
      item.putNull("ordinal").put("startMs", 1).put("endMs", 2);
      timings(b).add(item);
      assertThatThrownBy(() -> service.record(worker, s.sessionId(), 1L, "k", b))
          .as(kind)
          .hasMessage("INVALID_CONTRACT");
    }
    assertThat(rows(s.sessionId())).isZero();
  }

  @Test
  void contractRefusalsBeforeAnyRead() {
    var s = seed.session("SUCCEEDED", 60, 1);
    String[] forbidden = {"videoKey", "error", "url", "recordedAt"};
    for (String extra : forbidden) {
      ObjectNode b = body(s, "r", "UNAVAILABLE", false).put(extra, "x");
      assertThatThrownBy(() -> service.record(worker, s.sessionId(), 1L, "k", b))
          .as(extra)
          .hasMessage("INVALID_CONTRACT");
    }
    assertThatThrownBy(
            () -> service.record(worker, s.sessionId(), 1L, "k", body(s, "r", "PENDING", false)))
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(
            () -> service.record(worker, s.sessionId(), 1L, "k", body(s, "r", "FAILED", true)))
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(
            () -> service.record(worker, s.sessionId(), 1L, "k", body(s, "a/b", "FAILED", false)))
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(
            () -> service.record(worker, s.sessionId(), 1L, null, body(s, "r", "FAILED", false)))
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(
            () -> service.record(worker, s.sessionId(), null, "k", body(s, "r", "FAILED", false)))
        .hasMessage("INVALID_CONTRACT");
    assertThat(rows(s.sessionId())).isZero();
  }

  @Test
  void aCsiOutsideTheKeyAlphabetFailsClosed() {
    var s = seed.session("SUCCEEDED", 60, 1, "user-1", "CSI/123");
    assertThatThrownBy(
            () -> service.record(worker, s.sessionId(), 1L, "k", body(s, "r", "FAILED", false)))
        .hasMessage("INVALID_CONTRACT");
    assertThat(rows(s.sessionId())).isZero();
  }

  // ── projection on the database clock ─────────────────────────────────────

  @Test
  void projectionAbsentRowFlipsFromProcessingToUnavailableAtTheDeadline() {
    var running = seed.session("ACTING", 300, 1);
    var waiting = seed.session("SUCCEEDED", -60, 1);
    var passed = seed.session("SUCCEEDED", -180, 1);
    var p = projection(true);
    assertThat(p.project(running.sessionId(), null).status()).isEqualTo("PROCESSING");
    assertThat(p.project(waiting.sessionId(), null).status()).isEqualTo("PROCESSING");
    var gone = p.project(passed.sessionId(), null);
    assertThat(gone.status()).isEqualTo("UNAVAILABLE");
    validVideo(gone);
  }

  @Test
  void projectionStoredRows() {
    var p = projection(true);
    var available = seed.session("SUCCEEDED", 60, 1);
    seed.action(available.sessionId(), "a1", "step-1", 0, true);
    ObjectNode body = body(available, "rec-a", "STORED", true);
    timings(body).add(action("a1", "step-1", 0, 7, 8));
    service.record(worker, available.sessionId(), 1L, "k", body);
    var shown = p.project(available.sessionId(), null);
    validVideo(shown);
    assertThat(shown.status()).isEqualTo("AVAILABLE");
    assertThat(shown.video().path("partial").asBoolean()).isTrue();
    assertThat(shown.actionTimings()).hasSize(2);
    assertThat(shown.video().path("expiresAt").asText())
        .isEqualTo(
            jdbc.queryForObject(
                    "SELECT expires_at FROM studio_guided_session_recordings WHERE session_id=?",
                    java.sql.Timestamp.class,
                    available.sessionId())
                .toInstant()
                .toString());

    var unserved = projection(false).project(available.sessionId(), null);
    validVideo(unserved);
    assertThat(unserved.status()).isEqualTo("UNAVAILABLE");
    assertThat(unserved.video().path("error").asText())
        .isEqualTo(ExecutionSnapshotMapper.NO_RECORDING_STORE);
    assertThat(unserved.actionTimings()).isEmpty();

    var failed = seed.session("SUCCEEDED", 60, 1);
    service.record(worker, failed.sessionId(), 1L, "k", body(failed, "rec-f", "FAILED", false));
    var f = p.project(failed.sessionId(), null);
    validVideo(f);
    assertThat(f.video().path("error").asText())
        .isEqualTo(RecordedGuidedEvidenceProjection.FAILED_TEXT);

    var none = seed.session("SUCCEEDED", 60, 1);
    service.record(worker, none.sessionId(), 1L, "k", body(none, "rec-u", "UNAVAILABLE", false));
    var u = p.project(none.sessionId(), null);
    validVideo(u);
    assertThat(u.status()).isEqualTo("UNAVAILABLE");
  }

  @Test
  void projectionExpiredIsJudgedOnTheDatabaseClock() {
    var s = seed.session("SUCCEEDED", 60, 1);
    // A fact whose retention already ran out on the DB clock (written directly: rows are
    // immutable, and the service always stamps clock_timestamp() + retention).
    jdbc.update(
        "INSERT INTO studio_guided_session_recordings(session_id,scope_hash,recording_id,"
            + "worker_id,owner_fence,state,partial,video_key,manifest_key,recorded_at,expires_at,"
            + "timings) VALUES (?,?,'old','worker-1',1,'AVAILABLE',false,'k','m',"
            + "clock_timestamp() - interval '2 days', clock_timestamp() - interval '1 day','[]')",
        s.sessionId(),
        s.scopeHash());
    var expired = projection(true).project(s.sessionId(), null);
    validVideo(expired);
    assertThat(expired.status()).isEqualTo("EXPIRED");
    assertThat(expired.video().path("expiresAt").isTextual()).isTrue();
    assertThat(expired.actionTimings()).isEmpty();
  }

  @Test
  void noPublicProjectionCarriesAKeyBucketOrEndpoint() {
    var s = seed.session("SUCCEEDED", 60, 1);
    service.record(worker, s.sessionId(), 1L, "k", body(s, "rec-k", "STORED", false));
    var shown = projection(true).project(s.sessionId(), null);
    String text = shown.video().toString() + shown.actionTimings();
    assertThat(text).doesNotContain("studio/", ".webm", "manifest", "bucket", "sonic", "http");
  }

  @Test
  void requireRoleIsTheSharedCheck() {
    assertThatThrownBy(() -> GuidedInternalSecurity.requireRole(null, "owning-worker"))
        .hasMessage("UNAUTHENTICATED");
  }
}
