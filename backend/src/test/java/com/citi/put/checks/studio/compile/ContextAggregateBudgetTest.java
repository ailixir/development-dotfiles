package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import org.junit.jupiter.api.Test;

class ContextAggregateBudgetTest {

  @Test
  void repairAndTransportRetriesChargeRepeatedInputAndStopBeforeNextCall() {
    CompilePipeline.AggregateUsage usage =
        new CompilePipeline.AggregateUsage(new StudioCompileProperties.Aggregate(5, 1_000));

    assertThat(usage.charge(response(2, 100, 50))).isTrue();
    assertThat(usage.calls()).isEqualTo(3);
    assertThat(usage.bytes()).isEqualTo(350);
    assertThat(usage.charge(response(1, 200, 20))).isTrue();
    assertThat(usage.calls()).isEqualTo(5);
    assertThat(usage.bytes()).isEqualTo(770);
    assertThat(usage.canStart()).isFalse();
  }

  @Test
  void individuallyValidAttemptsFailClosedWhenAggregateBytesAreExhausted() {
    CompilePipeline.AggregateUsage usage =
        new CompilePipeline.AggregateUsage(new StudioCompileProperties.Aggregate(10, 900));

    assertThat(usage.charge(response(1, 300, 100))).isTrue();
    assertThat(usage.charge(response(0, 150, 100))).isFalse();
    assertThat(usage.bytes()).isEqualTo(950);
    assertThat(usage.canStart()).isFalse();
  }

  @Test
  void aggregateBoundsMustBePositive() {
    assertThatThrownBy(
            () -> new CompilePipeline.AggregateUsage(new StudioCompileProperties.Aggregate(0, 1)))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("positive");
  }

  private static CompileResponse response(int retries, int inputBytes, int outputBytes) {
    return CompileResponse.ok(
        "{\"version\":1,\"steps\":[]}",
        new GatewayProvenance("model", "v1", "prompt", "sdk", true, 0.0),
        retries,
        1,
        inputBytes,
        outputBytes);
  }
}
