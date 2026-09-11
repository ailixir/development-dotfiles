package com.citi.put.checks.studio.recovery;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * The pending reaper (AC-29, §5.4 row 1).
 *
 * <p><b>It reclaims only rows for which no dispatch attempt was issued.</b> {@code QUEUED} or
 * {@code CLAIMED} with an expired lease is the whole of it. A {@code DISPATCHING} row is never
 * reclaimed, whatever its lease says, because an attempt was committed and sent and a browser may
 * already be running — reclaiming it would be a second dispatch, which is the one thing §5.1's
 * closing paragraph forbids. The rule is in {@link StudioDispatchLedgerStatements#findReclaimable}
 * (which does not select {@code DISPATCHING}) and again in {@link
 * StudioDispatchLedgerStatements#releaseClaim} (whose {@code WHERE} carries {@code attempt_id IS
 * NULL}), so it holds whichever way the row is reached.
 *
 * <p>Past {@code pending_deadline_at} the row is closed, and the two closures are
 * <b>distinguishable from the persisted state rather than from a log line</b>: a row that never
 * issued an attempt is {@code DISPATCH_FAILED}; a row that did, and whose send outcome was
 * therefore ambiguous, is {@code DISPATCH_UNKNOWN}. §5.1 explicitly permits that second case to end
 * as unknown rather than risk duplicate effects, and a "fix" that replays it is the failure.
 *
 * <p>Bounded in batch size, idempotent, and it runs on the worker profile only.
 */
@Component
public class PendingReaper {

  private static final Logger LOGGER = LoggerFactory.getLogger(PendingReaper.class);

  private final StudioDispatchLedgerStatements statements;
  private final FinalizationReconciler reconciler;
  private final StudioExecutionProperties properties;
  private final Clock clock;

  @Autowired
  public PendingReaper(
      StudioDispatchLedgerStatements statements,
      FinalizationReconciler reconciler,
      StudioExecutionProperties properties) {
    this(statements, reconciler, properties, Clock.systemUTC());
  }

  PendingReaper(
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

    // 1. Reclaim what never issued an attempt. releaseClaim carries attempt_id IS NULL itself.
    for (UUID executionId : statements.findReclaimable(now, batch)) {
      changed += statements.releaseClaim(executionId);
    }

    // 2. Close what is past its pending deadline, distinguishing the two cases by persisted state.
    for (UUID executionId : statements.findPastPendingDeadline(now, batch)) {
      Map<String, Object> row = statements.find(executionId).orElse(null);
      if (row == null) {
        continue;
      }
      boolean attemptWasIssued = row.get("attempt_id") != null;
      if (attemptWasIssued && reconciler.reconcile(executionId)) {
        // The manifest was there: the real outcome replaced the verdict entirely.
        changed++;
        continue;
      }
      String code =
          attemptWasIssued
              ? ExecutionErrorCode.DISPATCH_UNKNOWN
              : ExecutionErrorCode.DISPATCH_FAILED;
      int closed = statements.closeWithError(executionId, code, now);
      if (closed == 1) {
        LOGGER.info(
            "Studio execution {} closed by the pending reaper as {} past its pending deadline",
            executionId,
            code);
      }
      changed += closed;
    }
    return changed;
  }
}
