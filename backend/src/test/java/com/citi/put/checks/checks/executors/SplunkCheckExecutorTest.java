package com.citi.put.checks.checks.executors;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.CheckType;
import com.citi.put.checks.checks.model.SplunkConfiguration;
import com.citi.put.checks.dc.DailyChecksAdapter;
import com.citi.put.checks.dc.DcClient;
import com.citi.put.checks.dc.DcProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.WireMock;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SplunkCheckExecutorTest {

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

  @Test
  void thinExecutorDelegatesToAdapter() {
    wireMock.stubFor(
        WireMock.post(WireMock.urlEqualTo("/api/v1/execute"))
            .willReturn(
                WireMock.okJson(
                    """
                    {"status":"SUCCESS","comment":"ok","actualCount":1}
                    """)));

    DcProperties props =
        new DcProperties(
            true,
            wireMock.baseUrl(),
            "/api/v1/execute",
            new DcProperties.Auth("none", null, null, null, "X-Api-Key", null),
            new DcProperties.Timeout(2000, 5000));
    SplunkCheckExecutor executor =
        new SplunkCheckExecutor(
            new DailyChecksAdapter(
                new DcClient(props, new ObjectMapper()), props, new SimpleMeterRegistry()),
            props);

    assertThat(executor.supportedType()).isEqualTo(CheckType.SPLUNK);

    Check check =
        new Check(
            "Splunk",
            "SPLUNK",
            null,
            "CSI1",
            "CSI",
            new SplunkConfiguration("SPLUNK", "search *", null, "15m", 0, ">"),
            "Production",
            "u@citi.com");

    ExecutionOutcome outcome =
        executor.execute(check, ExecutionContext.of(UUID.randomUUID(), "trace"));
    assertThat(outcome).isInstanceOf(ExecutionOutcome.Success.class);
  }
}
