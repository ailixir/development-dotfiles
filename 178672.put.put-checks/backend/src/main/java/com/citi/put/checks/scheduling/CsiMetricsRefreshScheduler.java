package com.citi.put.checks.scheduling;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class CsiMetricsRefreshScheduler {

  private static final Logger LOG = LoggerFactory.getLogger(CsiMetricsRefreshScheduler.class);

  private final JdbcTemplate jdbcTemplate;
  private final boolean concurrent;

  public CsiMetricsRefreshScheduler(
      JdbcTemplate jdbcTemplate,
      @Value("${checks.metrics.concurrent-refresh:true}") boolean concurrent) {
    this.jdbcTemplate = jdbcTemplate;
    this.concurrent = concurrent;
  }

  @Scheduled(fixedRate = 300_000, initialDelay = 60_000)
  @SchedulerLock(name = "csiMetricsRefresh", lockAtMostFor = "2m", lockAtLeastFor = "30s")
  public void scheduledRefresh() {
    refreshCsiMetrics();
  }

  public void refreshCsiMetrics() {
    String sql =
        concurrent
            ? "REFRESH MATERIALIZED VIEW CONCURRENTLY csi_metrics_current"
            : "REFRESH MATERIALIZED VIEW csi_metrics_current";
    LOG.debug("Refreshing csi_metrics_current materialized view (concurrent={})", concurrent);
    jdbcTemplate.execute(sql);
    LOG.debug("csi_metrics_current materialized view refreshed");
  }
}
