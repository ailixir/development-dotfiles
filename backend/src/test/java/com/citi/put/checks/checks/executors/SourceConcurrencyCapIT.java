package com.citi.put.checks.checks.executors;

import static org.assertj.core.api.Assertions.assertThat;

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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class SourceConcurrencyCapIT {

  private CheckExecutor slowHttpExecutor(CountDownLatch holdLatch) {
    return new CheckExecutor() {
      @Override
      public CheckType supportedType() {
        return CheckType.HTTP;
      }

      @Override
      public ExecutionOutcome execute(Check check, ExecutionContext context) {
        try {
          holdLatch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
        }
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

  @Test
  void extraDispatchReturnsThrottledFailureWhenSourceExhausted() throws Exception {
    int sourceLimit = 2;
    CountDownLatch holdLatch = new CountDownLatch(1);

    SourceConcurrencyProperties concurrencyProps =
        new SourceConcurrencyProperties(250, Map.of(CheckType.HTTP, sourceLimit));
    CheckSourceProperties sourceProps = new CheckSourceProperties(Map.of(CheckType.HTTP, true));
    SimpleMeterRegistry registry = new SimpleMeterRegistry();

    CheckExecutorDispatcher dispatcher =
        new CheckExecutorDispatcher(
            List.of(slowHttpExecutor(holdLatch)), sourceProps, concurrencyProps, registry);

    Thread t1 =
        Thread.startVirtualThread(
            () -> dispatcher.dispatch(httpCheck(), ExecutionContext.of(UUID.randomUUID(), "t1")));
    Thread t2 =
        Thread.startVirtualThread(
            () -> dispatcher.dispatch(httpCheck(), ExecutionContext.of(UUID.randomUUID(), "t2")));

    Thread.sleep(100);

    AtomicReference<ExecutionOutcome> thirdResult = new AtomicReference<>();
    Thread t3 =
        Thread.startVirtualThread(
            () ->
                thirdResult.set(
                    dispatcher.dispatch(
                        httpCheck(), ExecutionContext.of(UUID.randomUUID(), "t3"))));
    t3.join(2000);

    assertThat(thirdResult.get()).isInstanceOf(ExecutionOutcome.Throttled.class);
    assertThat(((ExecutionOutcome.Throttled) thirdResult.get()).checkType())
        .isEqualTo(CheckType.HTTP);

    holdLatch.countDown();
    t1.join(3000);
    t2.join(3000);
  }

  @Test
  void permitReleasedAfterExecution() throws Exception {
    int sourceLimit = 1;
    CountDownLatch holdLatch = new CountDownLatch(1);

    SourceConcurrencyProperties concurrencyProps =
        new SourceConcurrencyProperties(250, Map.of(CheckType.HTTP, sourceLimit));
    CheckSourceProperties sourceProps = new CheckSourceProperties(Map.of(CheckType.HTTP, true));
    SimpleMeterRegistry registry = new SimpleMeterRegistry();

    CheckExecutor instantExecutor =
        new CheckExecutor() {
          @Override
          public CheckType supportedType() {
            return CheckType.HTTP;
          }

          @Override
          public ExecutionOutcome execute(Check check, ExecutionContext context) {
            return new ExecutionOutcome.Success(Duration.ofMillis(1), "OK");
          }
        };

    CheckExecutorDispatcher dispatcher =
        new CheckExecutorDispatcher(
            List.of(instantExecutor), sourceProps, concurrencyProps, registry);

    ExecutionOutcome first =
        dispatcher.dispatch(httpCheck(), ExecutionContext.of(UUID.randomUUID(), "t1"));
    assertThat(first).isInstanceOf(ExecutionOutcome.Success.class);

    ExecutionOutcome second =
        dispatcher.dispatch(httpCheck(), ExecutionContext.of(UUID.randomUUID(), "t2"));
    assertThat(second).isInstanceOf(ExecutionOutcome.Success.class);
  }

  @Test
  void metricsGaugeReflectsAvailablePermits() {
    int sourceLimit = 5;
    SourceConcurrencyProperties concurrencyProps =
        new SourceConcurrencyProperties(250, Map.of(CheckType.HTTP, sourceLimit));
    CheckSourceProperties sourceProps = new CheckSourceProperties(Map.of(CheckType.HTTP, true));
    SimpleMeterRegistry registry = new SimpleMeterRegistry();

    new CheckExecutorDispatcher(
        List.of(
            new CheckExecutor() {
              @Override
              public CheckType supportedType() {
                return CheckType.HTTP;
              }

              @Override
              public ExecutionOutcome execute(Check check, ExecutionContext context) {
                return new ExecutionOutcome.Success(Duration.ZERO, "OK");
              }
            }),
        sourceProps,
        concurrencyProps,
        registry);

    double available =
        registry
            .get("checks.executor.source_permits_available")
            .tag("check_type", "HTTP")
            .gauge()
            .value();
    assertThat(available).isEqualTo(sourceLimit);
  }

  @Test
  void availablePermitsSnapshotReflectsCapacity() {
    int httpLimit = 10;
    int tcpLimit = 5;
    SourceConcurrencyProperties concurrencyProps =
        new SourceConcurrencyProperties(
            250, Map.of(CheckType.HTTP, httpLimit, CheckType.TCP, tcpLimit));
    CheckSourceProperties sourceProps =
        new CheckSourceProperties(Map.of(CheckType.HTTP, true, CheckType.TCP, true));
    SimpleMeterRegistry registry = new SimpleMeterRegistry();

    CheckExecutorDispatcher dispatcher =
        new CheckExecutorDispatcher(
            List.of(
                new CheckExecutor() {
                  @Override
                  public CheckType supportedType() {
                    return CheckType.HTTP;
                  }

                  @Override
                  public ExecutionOutcome execute(Check check, ExecutionContext context) {
                    return new ExecutionOutcome.Success(Duration.ZERO, "OK");
                  }
                },
                new CheckExecutor() {
                  @Override
                  public CheckType supportedType() {
                    return CheckType.TCP;
                  }

                  @Override
                  public ExecutionOutcome execute(Check check, ExecutionContext context) {
                    return new ExecutionOutcome.Success(Duration.ZERO, "OK");
                  }
                }),
            sourceProps,
            concurrencyProps,
            registry);

    Map<CheckType, Integer> snapshot = dispatcher.availablePermitsSnapshot();
    assertThat(snapshot.get(CheckType.HTTP)).isEqualTo(httpLimit);
    assertThat(snapshot.get(CheckType.TCP)).isEqualTo(tcpLimit);
  }
}
