package com.citi.put.checks.dc;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.executors.ExecutionContext;
import com.citi.put.checks.checks.executors.ExecutionOutcome;
import com.citi.put.checks.checks.model.SplunkConfiguration;
import com.citi.put.checks.dc.mapping.SplunkMapping;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DailyChecksAdapterTest {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @BeforeEach
  void setUp() {
    if (!wireMock.isRunning()) {
      wireMock.start();
    }
    wireMock.resetAll();
  }

  @AfterAll
  static void stop() {
    if (wireMock.isRunning()) {
      wireMock.stop();
    }
  }

  private DailyChecksAdapter adapter() {
    DcProperties props =
        new DcProperties(
            true,
            wireMock.baseUrl(),
            "/api/v1/execute",
            new DcProperties.Auth("none", null, null, null, "X-Api-Key", null),
            new DcProperties.Timeout(2000, 5000));
    DcClient client = new DcClient(props, new ObjectMapper());
    return new DailyChecksAdapter(client, props, new SimpleMeterRegistry());
  }

  private Check splunkCheck() {
    return new Check(
        "Splunk errors",
        "SPLUNK",
        null,
        "CSI1",
        "CSI Name",
        new SplunkConfiguration("SPLUNK", "search index=main | stats count", "main", "15m", 0, ">"),
        "Production",
        "user@citi.com");
  }

  @Test
  void successMapsToSuccessOutcome() {
    wireMock.stubFor(
        com.github.tomakehurst.wiremock.client.WireMock.post(
                com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo("/api/v1/execute"))
            .willReturn(
                com.github.tomakehurst.wiremock.client.WireMock.okJson(
                    """
                    {
                      "status": "SUCCESS",
                      "comment": "count threshold met",
                      "deepLink": "https://dc.example/runs/1",
                      "actualCount": 12
                    }
                    """)));

    ExecutionOutcome outcome =
        adapter()
            .run(
                splunkCheck(),
                ExecutionContext.of(UUID.randomUUID(), "t1"),
                c -> SplunkMapping.toRequest(c, props()),
                SplunkMapping::parseDetail);

    assertThat(outcome).isInstanceOf(ExecutionOutcome.Success.class);
    ExecutionOutcome.Success success = (ExecutionOutcome.Success) outcome;
    assertThat(success.output()).contains("actualCount=12");
  }

  @Test
  void businessFailMapsToFailureWithDeepLink() {
    wireMock.stubFor(
        com.github.tomakehurst.wiremock.client.WireMock.post(
                com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo("/api/v1/execute"))
            .willReturn(
                com.github.tomakehurst.wiremock.client.WireMock.okJson(
                    """
                    {
                      "status": "FAILURE",
                      "comment": "expected count not met",
                      "deepLink": "https://dc.example/runs/2"
                    }
                    """)));

    ExecutionOutcome outcome =
        adapter()
            .run(
                splunkCheck(),
                ExecutionContext.of(UUID.randomUUID(), "t2"),
                c -> SplunkMapping.toRequest(c, props()),
                SplunkMapping::parseDetail);

    assertThat(outcome).isInstanceOf(ExecutionOutcome.Failure.class);
    ExecutionOutcome.Failure failure = (ExecutionOutcome.Failure) outcome;
    assertThat(failure.errorMessage()).contains("expected count not met");
    assertThat(failure.deepLinkUrl()).isEqualTo("https://dc.example/runs/2");
  }

  @Test
  void authFailureMapsClearly() {
    wireMock.stubFor(
        com.github.tomakehurst.wiremock.client.WireMock.post(
                com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo("/api/v1/execute"))
            .willReturn(
                com.github.tomakehurst.wiremock.client.WireMock.aResponse().withStatus(401)));

    ExecutionOutcome outcome =
        adapter()
            .run(
                splunkCheck(),
                ExecutionContext.of(UUID.randomUUID(), "t3"),
                c -> SplunkMapping.toRequest(c, props()),
                SplunkMapping::parseDetail);

    assertThat(outcome).isInstanceOf(ExecutionOutcome.Failure.class);
    assertThat(((ExecutionOutcome.Failure) outcome).errorMessage()).contains("DC auth failed");
  }

  @Test
  void serverErrorMapsToDcUnavailable() {
    wireMock.stubFor(
        com.github.tomakehurst.wiremock.client.WireMock.post(
                com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo("/api/v1/execute"))
            .willReturn(
                com.github.tomakehurst.wiremock.client.WireMock.aResponse().withStatus(503)));

    ExecutionOutcome outcome =
        adapter()
            .run(
                splunkCheck(),
                ExecutionContext.of(UUID.randomUUID(), "t4"),
                c -> SplunkMapping.toRequest(c, props()),
                SplunkMapping::parseDetail);

    assertThat(outcome).isInstanceOf(ExecutionOutcome.Failure.class);
    assertThat(((ExecutionOutcome.Failure) outcome).errorMessage()).contains("DC unavailable");
  }

  private DcProperties props() {
    return new DcProperties(
        true,
        wireMock.baseUrl(),
        "/api/v1/execute",
        new DcProperties.Auth("none", null, null, null, "X-Api-Key", null),
        new DcProperties.Timeout(2000, 5000));
  }
}
