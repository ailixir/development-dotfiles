package com.citi.put.checks.studio.dispatch;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.compile.validator.StudioRunnerProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;

/**
 * Studio v1 WP7 — the scaling signal's names, values and 429 counting.
 *
 * <p>The exported names are asserted on the Prometheus scrape text, because the chart's KEDA query
 * is written against those names and not against the Micrometer ones.
 */
class StudioDispatchMetricsTest {

  private static WireMockServer wireMock;

  private JdbcTemplate jdbc;
  private PrometheusMeterRegistry registry;
  private StudioDispatchMetrics metrics;

  @BeforeAll
  static void startServer() {
    wireMock = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    wireMock.start();
  }

  @AfterAll
  static void stopServer() {
    wireMock.stop();
  }

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    jdbc = mock(JdbcTemplate.class);
    registry = new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);
    metrics = new StudioDispatchMetrics(jdbc, registry);
  }

  @Test
  void exportsTheNamesTheChartQueries() {
    String scrape = registry.scrape();

    assertThat(scrape).contains("studio_dispatch_backlog{state=\"QUEUED\"} 0.0");
    assertThat(scrape).contains("studio_dispatch_backlog{state=\"CLAIMED\"} 0.0");
    assertThat(scrape).contains("studio_dispatch_refusals_total 0.0");
  }

  @Test
  void theGaugeReadsTheLedgerCountsAndAnAbsentStateReadsZero() throws SQLException {
    ledgerReturns(Map.of("QUEUED", 3L, "CLAIMED", 1L));
    metrics.refresh();
    assertThat(metrics.backlog(DispatchState.QUEUED)).isEqualTo(3);
    assertThat(metrics.backlog(DispatchState.CLAIMED)).isEqualTo(1);
    assertThat(registry.scrape()).contains("studio_dispatch_backlog{state=\"QUEUED\"} 3.0");

    ledgerReturns(Map.of("QUEUED", 2L));
    metrics.refresh();
    assertThat(metrics.backlog(DispatchState.QUEUED)).isEqualTo(2);
    assertThat(metrics.backlog(DispatchState.CLAIMED)).as("no CLAIMED rows").isZero();
  }

  @Test
  void aFailedRefreshKeepsTheLastValuesRatherThanReportingNoBacklog() throws SQLException {
    ledgerReturns(Map.of("QUEUED", 4L));
    metrics.refresh();

    doThrow(new DataAccessResourceFailureException("database down"))
        .when(jdbc)
        .query(anyString(), org.mockito.ArgumentMatchers.any(RowCallbackHandler.class));
    metrics.refresh();

    assertThat(metrics.backlog(DispatchState.QUEUED)).isEqualTo(4);
  }

  @Test
  void onlyARunner429IncrementsTheRefusalCounter() {
    HttpRunnerDispatchClient client = client();
    client.setMetrics(metrics);

    for (int status : new int[] {202, 400, 503}) {
      stub(status);
      client.send(RunJobFixtures.conformingJob());
    }
    assertThat(refusals()).as("202, 400 and 503 are not refusals to count").isZero();

    stub(429);
    client.send(RunJobFixtures.conformingJob());
    client.send(RunJobFixtures.conformingJob());
    assertThat(refusals()).isEqualTo(2.0);
    assertThat(registry.scrape()).contains("studio_dispatch_refusals_total 2.0");
  }

  @Test
  void aClientWithoutMetricsStillClassifiesA429() {
    stub(429);
    DispatchOutcome outcome = client().send(RunJobFixtures.conformingJob());

    assertThat(outcome.kind()).isEqualTo(DispatchOutcome.Kind.DEFINITE_REFUSAL);
    assertThat(outcome.retryable()).isTrue();
  }

  private void ledgerReturns(Map<String, Long> counts) throws SQLException {
    doAnswer(
            invocation -> {
              RowCallbackHandler handler = invocation.getArgument(1);
              for (Map.Entry<String, Long> entry : counts.entrySet()) {
                ResultSet rs = mock(ResultSet.class);
                when(rs.getString(eq("state"))).thenReturn(entry.getKey());
                when(rs.getLong(eq("n"))).thenReturn(entry.getValue());
                handler.processRow(rs);
              }
              return null;
            })
        .when(jdbc)
        .query(anyString(), org.mockito.ArgumentMatchers.any(RowCallbackHandler.class));
  }

  private double refusals() {
    return registry.get(StudioDispatchMetrics.REFUSALS).counter().count();
  }

  private static void stub(int status) {
    wireMock.resetAll();
    wireMock.stubFor(post(urlPathEqualTo("/v1/runs")).willReturn(aResponse().withStatus(status)));
  }

  private static HttpRunnerDispatchClient client() {
    return new HttpRunnerDispatchClient(
        new ObjectMapper(),
        new StudioExecutionProperties(
            true, null, null, null, Duration.ofSeconds(5), null, null, null, null, null, null),
        new StudioRunnerProperties(
            "http://localhost:" + wireMock.port(),
            "test-runner-token",
            Duration.ofSeconds(5),
            Duration.ofSeconds(2)));
  }
}
