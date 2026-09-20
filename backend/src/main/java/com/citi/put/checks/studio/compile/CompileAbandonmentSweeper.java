package com.citi.put.checks.studio.compile;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The schedule for the abandoned-compile sweep (Story 10.9, AC-18; architecture &sect;4.7).
 *
 * <h2>This class holds no SQL, deliberately</h2>
 *
 * <p>The statement lives in {@link CompileStateService#sweepAbandoned}, because story 10.8 AC-3
 * requires every compile-state write to go through that class and {@code CompileStateSurfaceTest}
 * scans this package and fails on any statement that targets a compile-state column elsewhere. If
 * that scan ever goes red because of a change here, the correct response is to move the SQL back,
 * never to relax the scan.
 *
 * <h2>Why it may run on every replica</h2>
 *
 * <p>Unlike the execution reapers, this is not worker-only. The sweep's selection is {@code SELECT
 * ... FOR UPDATE SKIP LOCKED}, so concurrent replicas divide the work rather than contend for it,
 * and each run is capped at a configured batch size — the run stops at the cap and the next
 * scheduled run continues. There is never an unbounded {@code UPDATE}.
 *
 * <h2>What it buys, and what it must never cost</h2>
 *
 * <p>A truthful authoring display and a {@code compile_error} the author can see — not a recovered
 * capability. Because readiness never reads {@code compile_status} (10.8 AC-22/AC-23), a row
 * stranded in {@code COMPILING} blocks nothing: the confirmed revision still executes and {@code
 * POST /execute} is still accepted, before and after this runs. If implementing the sweep ever
 * required weakening one of 10.8's de-ready tests, the implementation would be wrong, not the test.
 */
@Component
@ConditionalOnProperty(
    prefix = "studio.compile.abandonment",
    name = "enabled",
    havingValue = "true",
    matchIfMissing = true)
public class CompileAbandonmentSweeper {

  private static final Logger LOGGER = LoggerFactory.getLogger(CompileAbandonmentSweeper.class);

  private final CompileStateService states;
  private final StudioCompileProperties properties;

  public CompileAbandonmentSweeper(CompileStateService states, StudioCompileProperties properties) {
    this.states = states;
    this.properties = properties;
  }

  /**
   * One bounded pass.
   *
   * <p>Public and callable so a test can drive a single deterministic pass rather than waiting for
   * a schedule; what is scheduled is the cadence, not the behaviour.
   *
   * @return how many rows this pass settled
   */
  @Scheduled(fixedDelayString = "${studio.compile.abandonment.interval-ms:15000}")
  public int sweepOnce() {
    try {
      int swept =
          states.sweepAbandoned(
              properties.abandonment().threshold(), properties.abandonment().batchSize());
      if (swept > 0) {
        LOGGER.info(
            "studio.compile.sweep_abandoned swept={} thresholdMs={}",
            swept,
            properties.abandonment().threshold().toMillis());
      }
      return swept;
    } catch (RuntimeException e) {
      // The class name, never the throwable: consistent with the rest of this package, where an
      // exception message can quote the source or artifact text these logs must never carry.
      LOGGER.warn("studio.compile.sweep_failed type={}", e.getClass().getName());
      return 0;
    }
  }
}
