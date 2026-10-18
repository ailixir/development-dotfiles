package com.citi.put.checks.studio.dispatch;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The Studio runner's scaling signal (Studio v1 WP7, decision D3).
 *
 * <p>The runner is scaled by <b>pods</b>, one browser each, and never by CPU: a saturated runner
 * refuses with {@code 429} and stays ready, so CPU is not the constraint. What the autoscaler needs
 * is how much work is waiting for a browser, and that is the ledger rows no runner has taken yet:
 *
 * <ul>
 *   <li>{@code studio_dispatch_backlog{state="QUEUED"}} and {@code
 *       studio_dispatch_backlog{state="CLAIMED"}} — the count of ledger rows in each state, read by
 *       one grouped query every {@code studio.execution.metrics.backlog-refresh-ms} (default 5 s).
 *       A state with no rows reads 0, never "absent".
 *   <li>{@code studio_dispatch_refusals_total} — incremented once for every {@code 429} the runner
 *       answers to {@code POST /v2/runs}, by {@link HttpRunnerDispatchClient}.
 * </ul>
 *
 * <p>Worker-only, like the dispatcher it describes. Every worker replica exports the same global
 * count, so a consumer must aggregate with {@code max}, not {@code sum}; the chart's KEDA query
 * does.
 *
 * <p>If the count query fails the gauges keep their last value and the failure is logged. They are
 * not reset to 0, which would read as "no backlog" and invite a scale-in.
 */
@Component
@Profile("worker")
public class StudioDispatchMetrics {

  static final String BACKLOG = "studio.dispatch.backlog";
  static final String REFUSALS = "studio.dispatch.refusals";

  /** The states that make up the backlog: accepted, and not yet handed to a runner. */
  static final List<DispatchState> BACKLOG_STATES =
      List.of(DispatchState.QUEUED, DispatchState.CLAIMED);

  private static final Logger LOGGER = LoggerFactory.getLogger(StudioDispatchMetrics.class);

  private static final String COUNT_BY_STATE =
      "SELECT state, count(*) AS n FROM studio_dispatch_ledger"
          + " WHERE state IN ('QUEUED', 'CLAIMED') GROUP BY state";

  private final JdbcTemplate jdbc;
  private final Map<DispatchState, AtomicLong> backlog = new EnumMap<>(DispatchState.class);
  private final Counter refusals;

  public StudioDispatchMetrics(JdbcTemplate jdbc, MeterRegistry registry) {
    this.jdbc = jdbc;
    for (DispatchState state : BACKLOG_STATES) {
      AtomicLong value = new AtomicLong();
      backlog.put(state, value);
      Gauge.builder(BACKLOG, value, AtomicLong::get)
          .description("Studio dispatch ledger rows waiting for a runner, by ledger state")
          .tag("state", state.name())
          .register(registry);
    }
    this.refusals =
        Counter.builder(REFUSALS)
            .description("Runner 429 refusals of POST /v2/runs")
            .register(registry);
  }

  /** Re-reads the ledger counts. Scheduled on the worker; called directly by tests. */
  @Scheduled(
      fixedDelayString = "${studio.execution.metrics.backlog-refresh-ms:5000}",
      initialDelay = 0)
  public void refresh() {
    Map<DispatchState, Long> counts = new EnumMap<>(DispatchState.class);
    try {
      jdbc.query(
          COUNT_BY_STATE,
          rs -> {
            counts.put(DispatchState.valueOf(rs.getString("state")), rs.getLong("n"));
          });
    } catch (DataAccessException e) {
      LOGGER.warn("Studio dispatch backlog refresh failed; keeping the last values", e);
      return;
    }
    for (DispatchState state : BACKLOG_STATES) {
      backlog.get(state).set(counts.getOrDefault(state, 0L));
    }
  }

  /** One runner {@code 429}. */
  public void recordRefusal() {
    refusals.increment();
  }

  /** The last value read for {@code state}. */
  public long backlog(DispatchState state) {
    AtomicLong value = backlog.get(state);
    if (value == null) {
      throw new IllegalArgumentException(state + " is not a backlog state");
    }
    return value.get();
  }
}
