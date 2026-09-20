package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class CompileBudgetTest {
  @Test
  void cancellationWakesBackoffAndRunsEveryCancellationHook() throws Exception {
    CompileBudget budget = new CompileBudget(Duration.ofSeconds(30));
    AtomicInteger calls = new AtomicInteger();
    budget.onCancel(
        () -> {
          throw new IllegalStateException("fixture cancellation failure");
        });
    budget.onCancel(calls::incrementAndGet);
    CompletableFuture<Boolean> waiting =
        CompletableFuture.supplyAsync(
            () -> {
              try {
                budget.backoff(Duration.ofSeconds(20));
                return false;
              } catch (CancellationException expected) {
                return true;
              } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                return false;
              }
            });
    budget.cancel();
    assertThat(waiting.get(1, TimeUnit.SECONDS)).isTrue();
    assertThat(calls).hasValue(1);
    assertThatThrownBy(budget::transport).isInstanceOf(CancellationException.class);
  }

  @Test
  void proposalAndTransportLimitsCannotBeResetByRepairs() {
    CompileBudget budget = new CompileBudget(Duration.ofSeconds(5));
    for (int i = 0; i < 3; i++) {
      budget.proposal();
    }
    for (int i = 0; i < 9; i++) {
      budget.transport();
    }
    assertThatThrownBy(budget::proposal).isInstanceOf(CancellationException.class);
    assertThatThrownBy(budget::transport).isInstanceOf(CancellationException.class);
  }

  @Test
  void absentUsageDoesNotMasqueradeAsZeroAndRemovedCallbacksDoNotRun() {
    CompileBudget budget = new CompileBudget(Duration.ofSeconds(5));
    budget.accountInput(25);
    budget.accountOutput(10, null, null);
    assertThat(budget.usage().inputBytes()).isEqualTo(25);
    assertThat(budget.usage().usageAvailable()).isFalse();
    assertThat(budget.usage().inputTokens()).isNull();
    AtomicInteger calls = new AtomicInteger();
    budget.onCancel(calls::incrementAndGet).run();
    budget.cancel();
    assertThat(calls).hasValue(0);
  }
}
