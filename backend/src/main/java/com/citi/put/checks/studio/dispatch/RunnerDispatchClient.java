package com.citi.put.checks.studio.dispatch;

/**
 * The single outbound seam to the runner (AC-15).
 *
 * <p>It exists as one narrow interface so that two facts about the dispatch send stay visible and
 * cannot be collapsed into a client default by a later change:
 *
 * <ul>
 *   <li><b>Automatic retries are disabled.</b> An ambiguous outcome may already have started a
 *       browser, so a resend is a duplicate effect, not a recovery.
 *   <li><b>Redirects are not followed.</b> A followed redirect is a second dispatch wearing a
 *       different name, and the caller would never see that two requests left the process.
 * </ul>
 *
 * <p>The mirror-image policy lives on the other side of the same wire: the runner <em>does</em>
 * retry its terminal report, byte-identically, until acknowledged (10.6 AC-17), which is exactly
 * why the API must be idempotent by {@code (attemptId, runnerSequence)} and must acknowledge only
 * after commit. Both policies are deliberate and opposite; keep both named.
 */
public interface RunnerDispatchClient {

  /** Sends exactly one request. Never two, whatever happens. */
  DispatchOutcome send(RunJob job);

  /**
   * Relays a recorded cancel to the runner: exactly one {@code DELETE /v1/runs/{executionId}}
   * (Studio v1 WP4, ADR-002 §29). Unlike {@link #send}, a repeat is harmless — the runner answers a
   * second cancel of the same run idempotently — so an unacknowledged relay is retried by the next
   * dispatcher pass rather than left to recovery.
   */
  CancelOutcome cancel(java.util.UUID executionId);

  /** How the runner answered a relayed cancel. */
  enum CancelOutcome {
    /** {@code 202}: the runner is stopping the run and will deliver its {@code FINAL} report. */
    ACKNOWLEDGED,
    /** {@code 409}: the runner held the run and it had already finished; its report stands. */
    ALREADY_FINISHED,
    /** {@code 404}: this runner holds no such run. Retried: another pod may hold it. */
    NOT_FOUND,
    /** Not configured, refused, or ambiguous. Retried; the running reaper bounds the retries. */
    FAILED;

    /** True when no further relay is needed. */
    public boolean settled() {
      return this == ACKNOWLEDGED || this == ALREADY_FINISHED;
    }
  }
}
