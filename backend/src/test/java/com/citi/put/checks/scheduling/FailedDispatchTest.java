package com.citi.put.checks.scheduling;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.scheduling.entity.FailedDispatch;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class FailedDispatchTest {

  @Test
  void initialStateHasRetryCountZeroAndFutureNextRetry() {
    FailedDispatch fd = new FailedDispatch("CHECK", java.util.UUID.randomUUID(), "error", 3);
    assertThat(fd.getRetryCount()).isZero();
    assertThat(fd.getNextRetryAt()).isAfter(Instant.now().plusSeconds(20));
    assertThat(fd.isExhausted()).isFalse();
  }

  @Test
  void incrementRetryDoublesDelay() {
    FailedDispatch fd = new FailedDispatch("CHECK", java.util.UUID.randomUUID(), "error", 3);

    Instant before = Instant.now();
    fd.incrementRetry("retry 1 error");
    assertThat(fd.getRetryCount()).isEqualTo(1);
    assertThat(fd.getNextRetryAt()).isAfter(before.plusSeconds(50));
    assertThat(fd.getLastError()).isEqualTo("retry 1 error");

    fd.incrementRetry("retry 2 error");
    assertThat(fd.getRetryCount()).isEqualTo(2);
    assertThat(fd.getNextRetryAt()).isAfter(before.plusSeconds(100));

    fd.incrementRetry("retry 3 error — exhausted");
    assertThat(fd.getRetryCount()).isEqualTo(3);
    assertThat(fd.isExhausted()).isTrue();
    assertThat(fd.getNextRetryAt()).isNull();
  }

  @Test
  void maxRetriesOneExhaustsAfterSingleIncrement() {
    FailedDispatch fd = new FailedDispatch("REPORT", java.util.UUID.randomUUID(), "error", 1);
    fd.incrementRetry("fail");
    assertThat(fd.isExhausted()).isTrue();
    assertThat(fd.getNextRetryAt()).isNull();
  }
}
