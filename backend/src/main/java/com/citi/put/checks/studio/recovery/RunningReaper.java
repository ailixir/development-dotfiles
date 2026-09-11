package com.citi.put.checks.studio.recovery;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.dto.VideoEvidence;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * The running reaper (AC-30, §5.4 rows 2–4).
 *
 * <p>Three conditions, each reconciled against the manifest before any verdict is written:
 *
 * <ol>
 *   <li>{@code ADMITTED} past {@code start_deadline_at} — reconcile, else {@code ERROR /
 *       START_TIMEOUT}.
 *   <li>{@code RUNNING} past {@code run_deadline_at} — reconcile the manifest, else {@code ERROR /
 *       STALE}. <b>Heartbeats never extend {@code run_deadline_at}</b>: nothing in the progress
 *       path writes that column, so repeated reports past the deadline leave this reaper's work
 *       exactly where it was.
 *   <li>Outcome known but evidence not settled by its deadline — <b>preserve the check outcome</b>,
 *       settle evidence, and set {@code streamComplete}. The statement that does it has no {@code
 *       status} in its {@code SET} list, so preserving the outcome is structural rather than
 *       remembered.
 * </ol>
 *
 * <p>Every write goes through the same conditional statements a runner report goes through, so a
 * reaper can never regress a state a late report already settled — <b>and symmetrically</b> a late
 * report can never regress the reaper's terminal state, because {@code DONE} is absorbing and every
 * report statement requires a non-terminal state.
 *
 * <p>Bounded in batch size and <b>idempotent</b>: a second pass matches nothing and bumps no
 * revision.
 */
@Component
public class RunningReaper {

  private static final Logger LOGGER = LoggerFactory.getLogger(RunningReaper.class);

  private final StudioDispatchLedgerStatements statements;
  private final FinalizationReconciler reconciler;
  private final StudioExecutionProperties properties;
  private final Clock clock;

  @Autowired
  public RunningReaper(
      StudioDispatchLedgerStatements statements,
      FinalizationReconciler reconciler,
      StudioExecutionProperties properties) {
    this(statements, reconciler, properties, Clock.systemUTC());
  }

  RunningReaper(
      StudioDispatchLedgerStatements statements,
      FinalizationReconciler reconciler,
      StudioExecutionProperties properties,
      Clock clock) {
    this.statements = statements;
    this.reconciler = reconciler;
    this.properties = properties;
    this.clock = clock;
  }

  /** One bounded pass. Returns how many rows it changed. */
  public int reapOnce() {
    Instant now = clock.instant();
    int batch = properties.dispatcherOrDefault().batchSizeOrDefault();
    int changed = 0;

    for (UUID executionId : statements.findPastStartDeadline(now, batch)) {
      changed += closeUnlessReconciled(executionId, ExecutionErrorCode.START_TIMEOUT, now);
    }
    for (UUID executionId : statements.findPastRunDeadline(now, batch)) {
      changed += closeUnlessReconciled(executionId, ExecutionErrorCode.STALE, now);
    }
    for (UUID executionId : statements.findEvidenceUnsettled(now, batch)) {
      int settled =
          statements.settleEvidenceByReaper(
              executionId,
              VideoEvidence.UNAVAILABLE,
              "Evidence was not settled before its deadline");
      if (settled == 1) {
        LOGGER.info(
            "Studio execution {}: the check outcome was preserved and evidence settled "
                + "UNAVAILABLE by the running reaper",
            executionId);
      }
      changed += settled;
    }
    return changed;
  }

  private int closeUnlessReconciled(UUID executionId, String code, Instant now) {
    if (reconciler.reconcile(executionId)) {
      return 1;
    }
    int closed = statements.closeWithError(executionId, code, now);
    if (closed == 1) {
      LOGGER.info("Studio execution {} closed by the running reaper as {}", executionId, code);
    }
    return closed;
  }
}
