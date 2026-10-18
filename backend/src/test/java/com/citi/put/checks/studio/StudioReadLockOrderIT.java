package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.citi.put.checks.studio.StudioService.AuthoringDraft;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-OBS-009 AC-9 obligation TF-3 (STUDIO-OBS-015 advisory S1): {@code GET /tests/{id}} takes
 * the draft's row write lock only after it has authorized the caller.
 *
 * <p>The deviation, before this change: {@code readAuthoringDraft} issued {@code SELECT … FOR NO
 * KEY UPDATE} (the {@code findByIdForUpdate} lock) <em>before</em> {@code requireRead}, so any
 * authenticated caller could briefly lock a draft it could not read. ADR-002 §27.2 requires the
 * order visible read, {@code canRead}, then the locked read. T0 ruling A8 picked option (ii),
 * mirroring {@code lockForAuthoringWrite}: a visible read, {@code requireRead}, then the locked
 * read, then flush and refresh and a second {@code requireRead}. Option (i), a non-locking read
 * only, stays rejected: it would give up the draft and readiness consistency of the locked read.
 *
 * <p><b>How the property is observed.</b> A second connection holds the row lock, and the read runs
 * on another thread.
 *
 * <ul>
 *   <li>A caller who may not read the draft is refused {@code 403} while that lock is held. If the
 *       read tried to take the lock first, it would block behind the holder and never settle in
 *       time.
 *   <li>The control: an authorized caller <em>does</em> wait on the same lock. This is what keeps a
 *       "fix" that simply drops the locked read from passing the first case. The wait is observed
 *       in {@code pg_stat_activity}, not inferred from a sleep.
 * </ul>
 *
 * <p>The unit-level shape (the order of the repository calls, the second check after the lock) is
 * in {@code StudioServiceWriteAuthorizationTest} (e).
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class StudioReadLockOrderIT {

  private static final String CSI_ID = "60491";
  private static final String OWNER = "read-lock-owner@citi.com";
  private static final String STEP = "Go to the home page";
  private static final long SETTLE_SECONDS = 10;

  @Autowired private StudioService studioService;
  @Autowired private JdbcTemplate jdbc;

  private final ExecutorService elsewhere = Executors.newCachedThreadPool();
  private UUID draft;

  @BeforeEach
  void setUp() {
    StudioExecutionFixtures fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    draft = fixtures.seedTest("Read lock order draft", CSI_ID, OWNER, List.of(STEP));
  }

  @AfterEach
  void tearDown() {
    elsewhere.shutdownNow();
  }

  @Test
  void aCallerWhoMayNotReadTheDraftIsRefusedWithoutWaitingForItsRowLock() throws Exception {
    Authentication stranger =
        StudioExecutionFixtures.identity("stranger@citi.com", "99991", "owner");
    Future<Throwable> read;
    boolean settledWhileLocked;
    Throwable refusal = null;
    try (Connection holder = jdbc.getDataSource().getConnection()) {
      holder.setAutoCommit(false);
      lock(holder, draft);
      try {
        read =
            elsewhere.submit(
                () -> catchThrowable(() -> studioService.readAuthoringDraft(draft, stranger)));
        try {
          refusal = read.get(SETTLE_SECONDS, TimeUnit.SECONDS);
          settledWhileLocked = true;
        } catch (TimeoutException blocked) {
          settledWhileLocked = false;
        }
      } finally {
        holder.rollback();
      }
    }
    if (!settledWhileLocked) {
      // Let the blocked read finish so no thread is left behind, then report the finding.
      refusal = read.get(SETTLE_SECONDS, TimeUnit.SECONDS);
    }

    assertThat(settledWhileLocked)
        .as("the refusal did not wait behind another transaction's lock on the draft's row")
        .isTrue();
    assertThat(refusal).isInstanceOf(StudioAccessDeniedException.class);
  }

  @Test
  void anUnknownIdAndAnUnreadableDraftAreRefusedAlike() {
    Authentication stranger =
        StudioExecutionFixtures.identity("stranger@citi.com", "99991", "owner");

    Throwable unreadable = catchThrowable(() -> studioService.readAuthoringDraft(draft, stranger));
    Throwable unknown =
        catchThrowable(() -> studioService.readAuthoringDraft(UUID.randomUUID(), stranger));

    assertThat(unreadable).isInstanceOf(StudioAccessDeniedException.class);
    assertThat(unknown).isInstanceOf(StudioAccessDeniedException.class);
    assertThat(unknown.getMessage()).isEqualTo(unreadable.getMessage());
  }

  @Test
  void anAuthorizedReadStillTakesTheRowLockAndReturnsTheDraft() throws Exception {
    Authentication owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    AuthoringDraft read;
    boolean waitedOnTheLock;
    try (Connection holder = jdbc.getDataSource().getConnection()) {
      holder.setAutoCommit(false);
      lock(holder, draft);
      Future<AuthoringDraft> pending =
          elsewhere.submit(() -> studioService.readAuthoringDraft(draft, owner));
      try {
        waitedOnTheLock = awaitBlockedOnTheDraftRow();
      } finally {
        holder.rollback();
      }
      read = pending.get(SETTLE_SECONDS, TimeUnit.SECONDS);
    }

    assertThat(waitedOnTheLock)
        .as("the authorized read queued behind the holder: the locked read is still taken")
        .isTrue();
    assertThat(read.test().id()).isEqualTo(draft);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** {@code FOR NO KEY UPDATE} is the lock {@code findByIdForUpdate} issues. */
  private static void lock(Connection connection, UUID id) throws SQLException {
    try (PreparedStatement statement =
        connection.prepareStatement("SELECT id FROM ui_tests WHERE id = ? FOR NO KEY UPDATE")) {
      statement.setObject(1, id);
      statement.executeQuery().close();
    }
  }

  /** True once some backend is waiting on a lock for a statement that reads {@code ui_tests}. */
  private boolean awaitBlockedOnTheDraftRow() throws InterruptedException {
    long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(SETTLE_SECONDS);
    while (System.nanoTime() < until) {
      Integer waiting =
          jdbc.queryForObject(
              "SELECT count(*) FROM pg_stat_activity"
                  + " WHERE wait_event_type = 'Lock' AND query ILIKE '%ui_tests%'"
                  + " AND pid <> pg_backend_pid()",
              Integer.class);
      if (waiting != null && waiting > 0) {
        return true;
      }
      Thread.sleep(50);
    }
    return false;
  }
}
