package com.citi.put.checks.checks.executors;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.CheckType;
import com.citi.put.checks.checks.model.TcpConfiguration;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TcpCheckExecutorIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  private TcpCheckExecutor executor;

  @BeforeAll
  static void startServer() {
    wireMock.start();
  }

  @AfterAll
  static void stopServer() {
    wireMock.stop();
  }

  @BeforeEach
  void setUp() {
    executor = new TcpCheckExecutor(new SimpleMeterRegistry());
  }

  private Check tcpCheck(String host, int port, int timeoutMs) {
    TcpConfiguration config = new TcpConfiguration("TCP", host, port, timeoutMs);
    return new Check(
        "TCP Check", "TCP", null, "CSI1", "CSI Name", config, "Production", "test@citi.com");
  }

  private ExecutionContext ctx() {
    return ExecutionContext.of(UUID.randomUUID(), "test-trace");
  }

  @Test
  void successOnOpenPort() {
    ExecutionOutcome outcome =
        executor.execute(tcpCheck("localhost", wireMock.port(), 5000), ctx());

    assertThat(outcome).isInstanceOf(ExecutionOutcome.Success.class);
    ExecutionOutcome.Success success = (ExecutionOutcome.Success) outcome;
    assertThat(success.output()).contains("Connected to localhost:" + wireMock.port());
    assertThat(success.duration().toNanos()).isPositive();
  }

  @Test
  void failureOnConnectionRefused() {
    ExecutionOutcome outcome = executor.execute(tcpCheck("localhost", 1, 2000), ctx());

    assertThat(outcome).isInstanceOf(ExecutionOutcome.Failure.class);
    ExecutionOutcome.Failure failure = (ExecutionOutcome.Failure) outcome;
    assertThat(failure.errorMessage()).containsIgnoringCase("connection failed");
  }

  @Test
  void failureOnDnsResolution() {
    ExecutionOutcome outcome =
        executor.execute(tcpCheck("this.host.does.not.exist.invalid", 80, 2000), ctx());

    assertThat(outcome).isInstanceOf(ExecutionOutcome.Failure.class);
    ExecutionOutcome.Failure failure = (ExecutionOutcome.Failure) outcome;
    assertThat(failure.errorMessage()).containsIgnoringCase("dns");
  }

  @Test
  void supportedTypeIsTcp() {
    assertThat(executor.supportedType()).isEqualTo(CheckType.TCP);
  }
}
