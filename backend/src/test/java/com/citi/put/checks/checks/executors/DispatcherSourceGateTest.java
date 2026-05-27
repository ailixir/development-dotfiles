package com.citi.put.checks.checks.executors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.CheckType;
import com.citi.put.checks.checks.model.HttpConfiguration;
import com.citi.put.checks.config.CheckSourceProperties;
import com.citi.put.checks.config.SourceConcurrencyProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DispatcherSourceGateTest {

  private CheckExecutor fakeHttpExecutor() {
    return new CheckExecutor() {
      @Override
      public CheckType supportedType() {
        return CheckType.HTTP;
      }

      @Override
      public ExecutionOutcome execute(Check check, ExecutionContext context) {
        return new ExecutionOutcome.Success(Duration.ofMillis(10), "OK");
      }
    };
  }

  private Check httpCheck() {
    return new Check(
        "Test",
        "HTTP",
        null,
        "CSI1",
        "CSI Name",
        new HttpConfiguration("HTTP", "GET", "http://localhost", null, null, 200, true, 5000, true),
        "Production",
        "user@citi.com");
  }

  private Check splunkCheck() {
    return new Check(
        "Splunk Test",
        "SPLUNK",
        null,
        "CSI1",
        "CSI Name",
        new HttpConfiguration(
            "SPLUNK", "GET", "http://localhost", null, null, 200, true, 5000, true),
        "Production",
        "user@citi.com");
  }

  @Test
  void dispatchEnabledTypeDelegatesToExecutor() {
    CheckSourceProperties props =
        new CheckSourceProperties(Map.of(CheckType.HTTP, true, CheckType.TCP, true));
    CheckExecutorDispatcher dispatcher =
        new CheckExecutorDispatcher(
            List.of(fakeHttpExecutor()),
            props,
            new SourceConcurrencyProperties(250, null),
            new SimpleMeterRegistry());

    ExecutionOutcome outcome =
        dispatcher.dispatch(httpCheck(), ExecutionContext.of(UUID.randomUUID(), "test-trace"));
    assertThat(outcome).isInstanceOf(ExecutionOutcome.Success.class);
  }

  @Test
  void dispatchDisabledTypeThrowsCheckSourceDisabled() {
    CheckSourceProperties props =
        new CheckSourceProperties(
            Map.of(CheckType.HTTP, true, CheckType.TCP, true, CheckType.SPLUNK, false));
    CheckExecutorDispatcher dispatcher =
        new CheckExecutorDispatcher(
            List.of(fakeHttpExecutor()),
            props,
            new SourceConcurrencyProperties(250, null),
            new SimpleMeterRegistry());

    assertThatThrownBy(
            () ->
                dispatcher.dispatch(
                    splunkCheck(), ExecutionContext.of(UUID.randomUUID(), "test-trace")))
        .isInstanceOf(CheckSourceDisabledException.class)
        .hasMessageContaining("SPLUNK")
        .hasMessageContaining("disabled");
  }
}
