package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Story 10.7 AC-38 (inventory half) — every Studio pool is bounded, <b>separate</b>, and named.
 *
 * <p>"Bounded" is not a property you can read off a running system after the fact; it is a property
 * of the configuration, and an unbounded pool is usually one nobody remembered to name. This test
 * is the roll call: each bound AC-38 enumerates must exist, must be positive, and must come from
 * {@link StudioExecutionProperties} rather than from a literal somewhere in the code.
 *
 * <p>The overload <em>run</em> — Studio driven to all of these bounds at once with deliberately
 * stalled consumers while ordinary check and REST traffic is measured in the same run — needs the
 * SSE surface and lands with it (10.7c). This half is what makes the other half enumerable.
 */
@SpringBootTest(properties = "studio.execution.dispatcher.threads=7")
@ActiveProfiles("test")
class StudioBoundedResourcesTest {

  @Autowired private StudioExecutionProperties properties;

  @Test
  void everyStudioBoundExistsAndIsNamed() {
    Map<String, Number> bounds = new LinkedHashMap<>();
    bounds.put("dispatcher threads", properties.dispatcherOrDefault().threadsOrDefault());
    bounds.put("dispatcher batch size", properties.dispatcherOrDefault().batchSizeOrDefault());
    bounds.put("pending rows per CSI", properties.quotasOrDefault().perCsiOrDefault());
    bounds.put("pending rows globally", properties.quotasOrDefault().globalOrDefault());
    bounds.put("steps per test", properties.quotasOrDefault().maxStepsPerTestOrDefault());
    bounds.put("callback body bytes", properties.callbackOrDefault().maxBodyBytesOrDefault());
    bounds.put("callback steps", properties.callbackOrDefault().maxStepsOrDefault());
    bounds.put("callback log entries", properties.callbackOrDefault().maxLogEntriesOrDefault());
    bounds.put(
        "callback log entry chars", properties.callbackOrDefault().maxLogEntryCharsOrDefault());
    bounds.put("SSE sender threads", properties.sseOrDefault().senderThreadsOrDefault());
    bounds.put("SSE streams per user", properties.sseOrDefault().maxStreamsPerUserOrDefault());
    bounds.put("SSE streams per pod", properties.sseOrDefault().maxStreamsPerPodOrDefault());
    bounds.put("SSE watched executions", properties.sseOrDefault().maxWatchedExecutionsOrDefault());

    assertThat(bounds)
        .allSatisfy(
            (name, value) ->
                assertThat(value.longValue()).as("bound '%s' must be positive", name).isPositive());
  }

  @Test
  void thePoolsAreSeparateSoASaturatedOneCannotConsumeAnothersCapacity() {
    // Named separately, configured separately, and therefore exhaustible separately. This class
    // sets the dispatcher's thread bound to 7 and asserts that the SSE sender bound did not move
    // with it: one deployment knob per pool is what makes "separate" mean something.
    assertThat(properties.dispatcherOrDefault().threadsOrDefault()).isEqualTo(7);
    assertThat(properties.sseOrDefault().senderThreadsOrDefault())
        .as("the SSE sender pool is not the dispatcher's pool under another name")
        .isEqualTo(4);
    assertThat(properties.quotasOrDefault().perCsiOrDefault())
        .as("a full CSI must not be able to exhaust the global bound by itself")
        .isLessThan(properties.quotasOrDefault().globalOrDefault());
  }

  @Test
  void theThreeDeadlinesAreThreeSeparateBudgets() {
    Duration pending = properties.pendingSlaOrDefault();
    Duration start = properties.startDeadlineOrDefault();
    Duration run = properties.runDeadlineOrDefault();

    assertThat(start)
        .as("the admitted-start budget is far tighter than the queue budget, and separate from it")
        .isLessThan(pending);
    assertThat(run).isPositive();
    assertThat(properties.admissionTimeoutOrDefault()).isPositive();
  }

  @Test
  void theKillSwitchIsDeploymentConfigurationAndDefaultsToEnabled() {
    assertThat(properties.enabledOrDefault()).isTrue();
  }
}
