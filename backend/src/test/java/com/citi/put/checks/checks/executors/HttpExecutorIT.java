package com.citi.put.checks.checks.executors;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.CheckType;
import com.citi.put.checks.checks.model.HttpConfiguration;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class HttpExecutorIT {

  static WireMockServer target = new WireMockServer(WireMockConfiguration.options().dynamicPort());

  private HttpCheckExecutor executor;

  @BeforeAll
  static void startTarget() {
    target.start();
  }

  @AfterAll
  static void stopTarget() {
    target.stop();
  }

  @BeforeEach
  void setUp() {
    target.resetAll();
    executor =
        new HttpCheckExecutor(new io.micrometer.core.instrument.simple.SimpleMeterRegistry());
  }

  private Check httpCheck(String path, int expectedStatus, int timeoutMs) {
    HttpConfiguration config =
        new HttpConfiguration(
            "HTTP",
            "GET",
            target.baseUrl() + path,
            null,
            null,
            expectedStatus,
            true,
            timeoutMs,
            true);
    return new Check(
        "Test Check", "HTTP", null, "CSI1", "CSI Name", config, "Production", "test@citi.com");
  }

  private ExecutionContext ctx() {
    return ExecutionContext.of(UUID.randomUUID(), "test-trace");
  }

  @Test
  void successWhenStatusMatches() {
    target.stubFor(get(urlEqualTo("/health")).willReturn(aResponse().withStatus(200)));

    ExecutionOutcome outcome = executor.execute(httpCheck("/health", 200, 5000), ctx());

    assertThat(outcome).isInstanceOf(ExecutionOutcome.Success.class);
    assertThat(outcome.duration().toMillis()).isPositive();
    assertThat(((ExecutionOutcome.Success) outcome).output()).contains("HTTP 200");
  }

  @Test
  void failureWhenStatusMismatch() {
    target.stubFor(get(urlEqualTo("/bad")).willReturn(aResponse().withStatus(500)));

    ExecutionOutcome outcome = executor.execute(httpCheck("/bad", 200, 5000), ctx());

    assertThat(outcome).isInstanceOf(ExecutionOutcome.Failure.class);
    assertThat(((ExecutionOutcome.Failure) outcome).errorMessage())
        .contains("Expected status 200 but got 500");
  }

  @Test
  void timeoutOnSlowResponse() {
    target.stubFor(
        get(urlEqualTo("/slow")).willReturn(aResponse().withFixedDelay(3000).withStatus(200)));

    ExecutionOutcome outcome = executor.execute(httpCheck("/slow", 200, 500), ctx());

    assertThat(outcome)
        .isInstanceOfAny(ExecutionOutcome.Timeout.class, ExecutionOutcome.Failure.class);
  }

  @Test
  void failureOnConnectionRefused() {
    HttpConfiguration config =
        new HttpConfiguration(
            "HTTP", "GET", "http://localhost:1", null, null, 200, true, 2000, true);
    Check check =
        new Check(
            "Fail Check", "HTTP", null, "CSI1", "CSI Name", config, "Production", "test@citi.com");

    ExecutionOutcome outcome = executor.execute(check, ctx());

    assertThat(outcome).isInstanceOf(ExecutionOutcome.Failure.class);
    assertThat(((ExecutionOutcome.Failure) outcome).errorMessage()).containsIgnoringCase("connect");
  }

  @Test
  void dispatcherThrowsOnMissingType() {
    CheckExecutorDispatcher dispatcher = new CheckExecutorDispatcher(java.util.List.of(executor));
    Check check =
        new Check(
            "Fake",
            "SPLUNK",
            null,
            "CSI1",
            "CSI Name",
            new HttpConfiguration("SPLUNK", "GET", "http://x", null, null, 200, true, 5000, true),
            "Production",
            "test@citi.com");

    assertThatThrownBy(() -> dispatcher.dispatch(check, ctx()))
        .isInstanceOf(UnsupportedCheckTypeException.class)
        .hasMessageContaining("SPLUNK");
  }

  @Test
  void supportedTypeIsHttp() {
    assertThat(executor.supportedType()).isEqualTo(CheckType.HTTP);
  }
}
