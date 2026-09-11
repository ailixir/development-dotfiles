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
}
