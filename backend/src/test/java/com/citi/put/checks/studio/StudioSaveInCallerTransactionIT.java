package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.entity.UITest;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.FlushModeType;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.assertj.core.api.SoftAssertions;
import org.hibernate.FlushMode;
import org.hibernate.Session;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.30 QA finding DETACH-1 — the authenticated save, called inside a caller's own
 * transaction.
 *
 * <p>{@code updateTest(…, auth)} reads the draft twice in one transaction: through the visibility
 * restriction to authorize, then under a row lock to compare revisions (ADR-002 §27.2). Hibernate
 * hands an entity it already manages back to the locking query unrefreshed, so the service has to
 * make the lock's read current. Two properties pull against each other there, and each case below
 * holds one of them deterministically, with no race to win:
 *
 * <ul>
 *   <li><b>(a)</b> a save that committed while this transaction held an older copy is seen, so the
 *       stale save is refused {@code 409 STALE_REVISION} and writes nothing. Dropping the refresh
 *       makes it succeed and overwrite. {@code OptimisticSaveIT} is the same property as a race
 *       over HTTP.
 *   <li><b>(b)</b> a caller that already holds the managed draft (the shape of the studio-inference
 *       program's {@code StudioAuthoringService.update}: lock, save, then write authoring metadata
 *       through the same reference) keeps that reference managed, so what it writes before and
 *       after the save lands. Detaching the visible copy, the shape this story first shipped,
 *       silently drops both.
 * </ul>
 *
 * <p>Case (b) runs once per caller flush mode, because the two dispositions of the pre-save write
 * are not the same property (QA finding REFRESH-FLUSH-1). The refresh reads the row and discards
 * whatever is still pending against the entity; under the default {@code AUTO} the locking JPQL
 * query inside the save flushes the caller's write for it, so an {@code AUTO}-only case would stay
 * green with the service's own flush removed and prove nothing about the refresh. Under {@code
 * COMMIT} and Hibernate's {@code MANUAL} no query flushes, so the write is still pending when the
 * refresh runs and only the service's flush can save it. Each case records {@code
 * Session.isDirty()} immediately before calling the save and asserts it, so a body that lost its
 * pending write to an earlier flush reports that instead of passing quietly. {@code AUTO} is kept
 * because it is what production runs.
 *
 * <p>Every observation made inside a transaction is recorded and asserted only after it ends, so a
 * red run reports the database's final state, not just the first mismatch.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class StudioSaveInCallerTransactionIT {

  private static final String CSI_ID = "60462";
  private static final String OWNER = "detach-owner@citi.com";
  private static final String SEEDED_STEP = "Go to the home page";

  @Autowired private StudioService studioService;
  @Autowired private StudioRepository studioRepository;
  @Autowired private TransactionTemplate transactions;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private ObjectMapper objectMapper;
  @PersistenceContext private EntityManager entityManager;

  private final ExecutorService elsewhere = Executors.newSingleThreadExecutor();
  private UUID draft;

  @BeforeEach
  void setUp() {
    StudioExecutionFixtures fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    draft = fixtures.seedTest("Caller transaction draft", CSI_ID, OWNER, List.of(SEEDED_STEP));
  }

  @AfterEach
  void tearDown() {
    elsewhere.shutdownNow();
  }

  @Test
  void aStaleSaveIsRefusedWhenASaveCommittedWhileThisTransactionHeldAnOlderCopy() {
    AtomicLong heldRevision = new AtomicLong();

    Throwable refused =
        catchThrowable(
            () ->
                transactions.executeWithoutResult(
                    status -> {
                      heldRevision.set(
                          studioRepository.findById(draft).orElseThrow().getSourceRevision());
                      // Another request's save commits on its own connection and transaction.
                      commitElsewhere(save("Winning step", "from the winner"));
                      studioService.updateTest(
                          draft, save("Losing step", "from the loser"), owner());
                    }));

    SoftAssertions softly = new SoftAssertions();
    softly.assertThat(heldRevision.get()).as("the copy this transaction held").isEqualTo(1L);
    softly
        .assertThat(refused)
        .as("the stale save")
        .isInstanceOfSatisfying(
            StudioConflictException.class,
            e -> assertThat(e.getCode()).isEqualTo("STALE_REVISION"));
    Map<String, Object> row = row();
    softly.assertThat(row.get("source_revision")).as("one increment, the winner's").isEqualTo(2L);
    softly.assertThat(steps(row)).as("steps").containsExactly("Winning step");
    softly.assertThat(row.get("description")).as("description").isEqualTo("from the winner");
    softly.assertAll();
  }

  @ParameterizedTest(name = "caller flush mode {0}")
  @EnumSource(CallerFlush.class)
  void aCallerHoldingTheDraftKeepsWhatItWritesBeforeAndAfterTheSave(CallerFlush flushMode) {
    AtomicBoolean pendingWhenTheSaveWasCalled = new AtomicBoolean();
    AtomicBoolean managedAfterSave = new AtomicBoolean();
    AtomicLong revisionSeenThroughReference = new AtomicLong();

    transactions.executeWithoutResult(
        status -> {
          flushMode.applyTo(entityManager);
          // StudioAuthoringService.lock's shape: the caller takes the row and keeps the reference.
          UITest held = studioRepository.findByIdForUpdate(draft).orElseThrow();
          held.setSchedule("{\"written\":\"before the save\"}");
          pendingWhenTheSaveWasCalled.set(entityManager.unwrap(Session.class).isDirty());

          studioService.updateTest(draft, save("Saved step", "from the save"), owner());

          managedAfterSave.set(entityManager.contains(held));
          revisionSeenThroughReference.set(held.getSourceRevision());
          held.setDescription("from the caller, after the save");
          // MANUAL does not flush at commit either, so the caller ends its own unit of work. For
          // AUTO and COMMIT the commit would have done it: this only makes the three bodies one.
          entityManager.flush();
        });

    SoftAssertions softly = new SoftAssertions();
    softly
        .assertThat(pendingWhenTheSaveWasCalled.get())
        .as("the caller's write was still pending when the save was called")
        .isTrue();
    softly.assertThat(managedAfterSave.get()).as("caller's reference still managed").isTrue();
    softly
        .assertThat(revisionSeenThroughReference.get())
        .as("the save, seen through the caller's reference")
        .isEqualTo(2L);
    Map<String, Object> row = row();
    softly.assertThat(row.get("source_revision")).as("the save's increment").isEqualTo(2L);
    softly.assertThat(steps(row)).as("the save's steps").containsExactly("Saved step");
    softly
        .assertThat(row.get("description"))
        .as("the caller's write after the save")
        .isEqualTo("from the caller, after the save");
    softly
        .assertThat(String.valueOf(row.get("schedule")))
        .as("the caller's write before the save")
        .contains("before the save");
    softly.assertAll();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** The flush modes a caller's persistence context can be in when it calls the save. */
  private enum CallerFlush {
    /** Production's default. The save's locking JPQL query flushes the caller's pending write. */
    AUTO,
    /** JPA's {@code COMMIT}: no query flushes, so the write is still pending at the refresh. */
    COMMIT,
    /** Hibernate's {@code MANUAL}: not even the commit flushes; the caller flushes explicitly. */
    MANUAL;

    void applyTo(EntityManager entityManager) {
      switch (this) {
        case AUTO -> entityManager.setFlushMode(FlushModeType.AUTO);
        case COMMIT -> entityManager.setFlushMode(FlushModeType.COMMIT);
        case MANUAL -> entityManager.unwrap(Session.class).setHibernateFlushMode(FlushMode.MANUAL);
        default -> throw new IllegalStateException("unhandled flush mode " + this);
      }
    }
  }

  private void commitElsewhere(UITestRequest request) {
    try {
      elsewhere
          .submit(() -> studioService.updateTest(draft, request, owner()))
          .get(30, TimeUnit.SECONDS);
    } catch (Exception e) {
      throw new IllegalStateException("the concurrent save did not commit", e);
    }
  }

  private static UITestRequest save(String step, String description) {
    return new UITestRequest(
        "Caller transaction draft",
        description,
        CSI_ID,
        "Production",
        List.of(step),
        List.of(),
        null,
        1L,
        1L);
  }

  private static Authentication owner() {
    return StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
  }

  private Map<String, Object> row() {
    return jdbc.queryForMap(
        "SELECT source_revision, description, steps::text AS steps, schedule::text AS schedule"
            + " FROM ui_tests WHERE id = ?",
        draft);
  }

  private List<String> steps(Map<String, Object> row) {
    try {
      String[] stored = objectMapper.readValue((String) row.get("steps"), String[].class);
      return List.of(stored);
    } catch (Exception e) {
      throw new IllegalStateException("unreadable steps column", e);
    }
  }
}
