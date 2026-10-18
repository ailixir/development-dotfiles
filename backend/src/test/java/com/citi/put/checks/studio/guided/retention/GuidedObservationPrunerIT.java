package com.citi.put.checks.studio.guided.retention;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationResultProjector;
import com.citi.put.checks.studio.guided.publication.ObservedRevisionVerifier;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationStore;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-OBS-014 AC-3 (ruling AR-2 b, PO X6): the guided observation pruner end to end through the
 * Spring bean, against the real V19 function on the Flyway head.
 *
 * <p>The window is judged on the database clock only. {@code expires_at} is immutable (V14 identity
 * trigger), so an "old" session is seeded by back-dating it with {@code session_replication_role =
 * replica} inside the seeding transaction; every assertion and every prune runs with the role back
 * at {@code origin}, so every guard is live. No JVM clock is faked.
 *
 * <p>The column-by-column guard negatives (attempt {@code safe_result}, publication immutability,
 * the FK-ordered delete of never-published copies) are proven at SQL level by {@code
 * GuidedGovernanceMigrationIT}; this class proves the Java pruner drives the function, that the
 * public result is unchanged by a prune, and that a published revision still verifies.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import(ObservedPublicationFixture.FreshAuthority.class)
class GuidedObservationPrunerIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
    // A live (never-published) session is read through the session service, which re-checks that
    // the fixture application and environment are an administrator-approved guided scope.
    registry.add(
        "studio.guided-authoring.translation.applications",
        () -> ObservedPublicationFixture.APPLICATION);
    registry.add(
        "studio.guided-authoring.translation.environments",
        () -> String.join(",", ObservedPublicationFixture.ENVIRONMENTS));
    // The guided reaper would race the FINALIZING case below (it expires overdue sessions); this
    // context runs it once at start-up and not again during the class.
    registry.add("studio.guided-authoring.reaper-delay-ms", () -> "3600000");
  }

  private static final String CSI_ID = "60471";
  private static final String OWNER = "pruner-owner@citi.com";
  private static final List<String> RETAINED =
      List.of(
          "stepIndex",
          "errorCode",
          "detail",
          "teardownStatus",
          "publicationRevisionId",
          "publicationRevisionDigest",
          "evidenceRef");

  @Autowired private JdbcTemplate jdbc;
  @Autowired private TransactionTemplate transactions;
  @Autowired private GuidedObservationPruner pruner;
  @Autowired private GuidedSessionService sessions;
  @Autowired private GuidedPublicationResultProjector projector;
  @Autowired private ObservedRevisionVerifier verifier;
  @Autowired private GuidedTranslationStore store;

  private StudioExecutionFixtures fixtures;
  private ObservedPublicationFixture observed;
  private Authentication owner;

  @BeforeEach
  void setUp() {
    fixtures = new StudioExecutionFixtures(jdbc);
    observed = new ObservedPublicationFixture(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
  }

  /**
   * A never-published FAILED (LOGIN_REQUIRED) session past the window: the public result is
   * byte-identical before and after, the progress keeps exactly the retained keys, the three
   * publication copy tables hold nothing for it, its base row is unchanged, and a second pass does
   * nothing.
   */
  @Test
  void aNeverPublishedFailedSessionIsPrunedAndItsResultIsUnchanged() {
    String id = failedNeverPublished();
    backdate(id, "31 days");
    String baseBefore = baseRow(id);
    JsonNode serviceBefore = sessions.read(owner, id, "result");
    JsonNode projectedBefore = projected(id);
    assertThat(progressKeys(id)).contains("observation", "clarification", "origin");

    pruner.pruneOnce();

    assertThat(prunedAt(id)).isNotNull();
    assertThat(progressKeys(id)).isSubsetOf(RETAINED).contains("stepIndex", "errorCode");
    assertThat(sessions.read(owner, id, "result")).isEqualTo(serviceBefore);
    assertThat(sessions.read(owner, id, "result").toString()).isEqualTo(serviceBefore.toString());
    assertThat(projected(id).toString()).isEqualTo(projectedBefore.toString());
    assertThat(copyRows(id)).isZero();
    assertThat(baseRow(id)).as("bases are never deleted or changed").isEqualTo(baseBefore);
    assertThat(prune(id)).as("a second prune does nothing").isFalse();
    // AR-2 S-4: a late settlement or usage receipt for a pruned session is refused EXPIRED before
    // any SQL write reaches the V19 attempt guard.
    assertThatThrownBy(
            () ->
                transactions.executeWithoutResult(
                    status -> store.finishAttempt(id, "late-attempt", "APPLIED", null, 1, 1)))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("EXPIRED");
    assertThatThrownBy(
            () ->
                transactions.executeWithoutResult(
                    status -> store.recordLateUsage(id, "late-attempt", 1, 1)))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("EXPIRED");
  }

  /**
   * A published session past the window keeps every publication row byte-identical (PO X6-a), its
   * public result is unchanged, and the published revision still verifies.
   */
  @Test
  void aPublishedSessionKeepsItsPublicationRowsAndItsRevisionStillVerifies() {
    UUID testId =
        fixtures.seedRunnableTest("Pruned published", CSI_ID, OWNER, List.of("Go home")).testId();
    UUID revision = observed.publish(testId, List.of(), List.of());
    String id = sessionOf(revision);
    addPrunableContent(id);
    backdate(id, "31 days");
    String publicationBefore = publicationSnapshot(id);
    String projectedBefore = projected(id).toString();
    verifier.verify(revision);

    pruner.pruneOnce();

    assertThat(prunedAt(id)).isNotNull();
    assertThat(progressKeys(id)).isSubsetOf(RETAINED);
    assertThat(publicationSnapshot(id)).isEqualTo(publicationBefore);
    assertThat(projected(id).toString()).isEqualTo(projectedBefore);
    verifier.verify(revision);
  }

  /** Inside the window, or not terminal (FINALIZING): the pass leaves the session untouched. */
  @Test
  void sessionsInsideTheWindowOrStillFinalizingAreNotPruned() {
    String recent = failedNeverPublished();
    backdate(recent, "1 hour");
    String finalizing = failedNeverPublished();
    setState(finalizing, "FINALIZING");
    backdate(finalizing, "31 days");
    String recentProgress = progress(recent);
    String finalizingProgress = progress(finalizing);

    pruner.pruneOnce();

    assertThat(prunedAt(recent)).isNull();
    assertThat(progress(recent)).isEqualTo(recentProgress);
    assertThat(prunedAt(finalizing)).isNull();
    assertThat(progress(finalizing)).isEqualTo(finalizingProgress);
    assertThat(prune(recent)).isFalse();
    assertThat(prune(finalizing)).isFalse();
  }

  // ── seeding ──────────────────────────────────────────────────────────────

  private String failedNeverPublished() {
    UUID testId =
        fixtures
            .seedRunnableTest("Pruned failed " + UUID.randomUUID(), CSI_ID, OWNER, List.of("Login"))
            .testId();
    String id = observed.learnWithoutPublishing(testId);
    // The fixture's synthetic session omits the public-view fields a real start writes; add them
    // so the session's public view and result render as for a real session.
    asReplica(
        "UPDATE studio_guided_sessions SET document = document || jsonb_build_object("
            + "'schemaVersion',3,'counters',jsonb_build_object('actions',0,'observations',0,"
            + "'modelProposals',0,'modelInputTokens',0,'modelOutputTokens',0,"
            + "'sanitizedEvidenceBytes',0)) WHERE session_id=?",
        id);
    String stepId =
        jdbc.queryForObject(
            "SELECT document->'sourceSteps'->0->>'stepId' FROM studio_guided_sessions"
                + " WHERE session_id=?",
            String.class,
            id);
    setState(id, "FAILED");
    asReplica(
        "UPDATE studio_guided_sessions SET progress = jsonb_build_object('stepIndex',0,"
            + "'errorCode','LOGIN_REQUIRED','detail',jsonb_build_object('stepId',?::text,"
            + "'loginStepsPresent',false)) WHERE session_id=?",
        stepId,
        id);
    addPrunableContent(id);
    return id;
  }

  /** Observation-bearing keys the retain list does not name. */
  private void addPrunableContent(String id) {
    asReplica(
        "UPDATE studio_guided_sessions SET progress = progress || jsonb_build_object("
            + "'observation',jsonb_build_object('origin','https://studio-fixture.example.test',"
            + "'nodes','[]'::jsonb),'clarification',jsonb_build_object('choices','[]'::jsonb),"
            + "'origin','https://studio-fixture.example.test') WHERE session_id=?",
        id);
  }

  private void setState(String id, String state) {
    asReplica(
        "UPDATE studio_guided_sessions SET state=?, document=jsonb_set(document,'{state}',"
            + "to_jsonb(?::text)) WHERE session_id=?",
        state,
        state,
        id);
  }

  /** Seeds an old session: expires_at is immutable to every live guard, so the role is replica. */
  private void backdate(String id, String age) {
    asReplica(
        "UPDATE studio_guided_sessions SET expires_at = clock_timestamp() - ?::interval,"
            + " document=jsonb_set(document,'{expiresAt}',to_jsonb(to_char((clock_timestamp() -"
            + " ?::interval) AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))) WHERE"
            + " session_id=?",
        age,
        age,
        id);
  }

  private void asReplica(String sql, Object... args) {
    transactions.executeWithoutResult(
        status -> {
          jdbc.execute("SET LOCAL session_replication_role = 'replica'");
          assertThat(jdbc.update(sql, args)).isEqualTo(1);
        });
  }

  // ── reads ────────────────────────────────────────────────────────────────

  private JsonNode projected(String id) {
    return projector.read(owner, ObservedPublicationFixture.request(owner), id, true).orElseThrow();
  }

  private boolean prune(String id) {
    return Boolean.TRUE.equals(
        transactions.execute(
            status ->
                jdbc.queryForObject(
                    "SELECT studio_guided_prune_session(?, interval '30 days')",
                    Boolean.class,
                    id)));
  }

  private Object prunedAt(String id) {
    return jdbc.queryForObject(
        "SELECT pruned_at FROM studio_guided_sessions WHERE session_id=?", Object.class, id);
  }

  private String progress(String id) {
    return jdbc.queryForObject(
        "SELECT progress::text FROM studio_guided_sessions WHERE session_id=?", String.class, id);
  }

  private List<String> progressKeys(String id) {
    return new ArrayList<>(
        jdbc.queryForList(
            "SELECT jsonb_object_keys(progress) FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id));
  }

  private int copyRows(String id) {
    return jdbc.queryForObject(
        "SELECT (SELECT count(*) FROM studio_guided_publication_observations WHERE session_id=?)"
            + " + (SELECT count(*) FROM studio_guided_publication_preparations WHERE session_id=?)"
            + " + (SELECT count(*) FROM studio_guided_publication_admissions WHERE session_id=?)",
        Integer.class,
        id,
        id,
        id);
  }

  private String baseRow(String id) {
    return jdbc.queryForObject(
        "SELECT to_jsonb(b)::text FROM studio_guided_publication_bases b WHERE session_id=?",
        String.class,
        id);
  }

  /** Every publication-table row of the session, in a stable order, as JSON text. */
  private String publicationSnapshot(String id) {
    StringBuilder out = new StringBuilder();
    for (String table :
        List.of(
            "studio_guided_publication_bases",
            "studio_guided_publication_observations",
            "studio_guided_publication_preparations",
            "studio_guided_publication_admissions",
            "studio_guided_publication_attempts",
            "studio_guided_publications")) {
      out.append(table)
          .append('=')
          .append(
              jdbc.queryForObject(
                  "SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text"
                      + " FROM "
                      + table
                      + " t WHERE session_id=?",
                  String.class,
                  id))
          .append('\n');
    }
    return out.toString();
  }

  private String sessionOf(UUID revision) {
    return jdbc.queryForObject(
        "SELECT session_id FROM studio_guided_publications WHERE revision_id=?",
        String.class,
        revision);
  }
}
