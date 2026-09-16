package com.citi.put.checks.studio.evidence;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.recovery.ManifestKeys;
import com.citi.put.checks.studio.recovery.ResultManifestStore;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Seeds one finished execution with a real recording behind it, for story 10.15's criteria.
 *
 * <p>Two things here are criteria rather than convenience.
 *
 * <p><b>The object is position-derivable.</b> {@link #recording(int)} is a keyed byte stream, not a
 * run of zeros: a megabyte of the same byte makes every wrong offset look correct, so an off-by-one
 * and a wrong window would both pass a byte comparison. Here {@code object[a..b]} is unique to
 * {@code (a, b)} — AC-13's whole premise.
 *
 * <p><b>The attempt is real.</b> The key the API derives includes the attempt id, which lives on
 * the dispatch ledger and is written by an actual {@code beginDispatch}. Seeding a column by hand
 * would let the test agree with an implementation that read the row instead of deriving the key.
 */
public final class VideoEvidenceFixtures {

  private final JdbcTemplate jdbc;
  private final StudioDispatchLedgerStatements statements;
  private final TransactionTemplate transactions;

  public VideoEvidenceFixtures(
      JdbcTemplate jdbc,
      StudioDispatchLedgerStatements statements,
      TransactionTemplate transactions) {
    this.jdbc = jdbc;
    this.statements = statements;
    this.transactions = transactions;
  }

  /**
   * A deterministic, position-derivable object of {@code size} bytes.
   *
   * <p>A keyed linear congruential stream: each position's byte depends on the position, so a
   * window read at the wrong offset returns bytes that differ from the expected slice rather than
   * bytes that happen to match.
   */
  public static byte[] recording(int size) {
    byte[] bytes = new byte[size];
    long state = 0x5DEECE66DL;
    for (int i = 0; i < size; i++) {
      state = (state * 6364136223846793005L + 1442695040888963407L);
      bytes[i] = (byte) ((state >>> 33) ^ (i * 31L));
    }
    return bytes;
  }

  /** Gives the execution an attempt, which is what makes the derived key derivable. */
  public UUID dispatch(UUID executionId, String owner) {
    UUID attempt = UUID.randomUUID();
    transactions.executeWithoutResult(
        status -> {
          statements.claim(executionId, owner, Instant.now().plusSeconds(600), Instant.now());
          statements.beginDispatch(executionId, owner, attempt);
        });
    return attempt;
  }

  /**
   * The key the API derives — computed here by the same production derivation, never transcribed.
   */
  public static String derivedKey(String csiId, UUID testId, UUID executionId, UUID attemptId) {
    return ManifestKeys.videoKey(
        new ResultManifestStore.ExecutionIdentity(csiId, testId, executionId, attemptId));
  }

  /**
   * Marks the run finished with the given outcome, so the five-state derivation has a run to read.
   */
  public void finish(UUID executionId, String status, long durationMs) {
    jdbc.update(
        "UPDATE ui_test_executions SET status = ?, ended_at = NOW(), duration_ms = ? WHERE id = ?",
        status,
        (int) durationMs,
        executionId);
  }

  /** Sets the persisted evidence columns exactly as a runner report would have left them. */
  public void evidence(
      UUID executionId, String videoStatus, Instant expiresAt, boolean partial, String videoKey) {
    jdbc.update(
        "UPDATE ui_test_executions SET video_status = ?, video_expires_at = ?, "
            + "video_partial = ?, video_key = ? WHERE id = ?",
        videoStatus,
        expiresAt == null ? null : java.sql.Timestamp.from(expiresAt),
        partial,
        videoKey,
        executionId);
  }

  /** An identity supplied through the gateway header path the BFF filter already implements. */
  public static HttpHeaders identity(String email, String roles, String ownership) {
    HttpHeaders headers = new HttpHeaders();
    headers.setAccept(List.of(MediaType.ALL));
    headers.set("X-User-Id", "uid-" + email);
    headers.set("X-User-Email", email);
    headers.set("X-User-Roles", roles);
    headers.set("X-User-Csi-Ownership", ownership);
    return headers;
  }

  /** A request that carries no identity headers at all. */
  public static HttpHeaders noIdentity() {
    HttpHeaders headers = new HttpHeaders();
    headers.setAccept(List.of(MediaType.ALL));
    return headers;
  }

  public static StudioExecutionFixtures studioFixtures(JdbcTemplate jdbc) {
    return new StudioExecutionFixtures(jdbc);
  }
}
