package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;

import java.time.Duration;
import org.junit.jupiter.api.Test;

/** STUDIO-OBS-015 aria-warn-ruling01 T3: the reaper tick order and its interval guard. */
class GuidedSessionReaperTest {
  private static final Duration WINDOW = Duration.ofMinutes(15);
  private static final int BATCH = 32;
  private static final Duration INTERVAL = Duration.ofMinutes(15);

  @Test
  void constructorRejectsAnAbandonedWarnIntervalThatIsZeroOrNegative() {
    var service = mock(GuidedSessionService.class);

    assertThatThrownBy(() -> new GuidedSessionReaper(service, WINDOW, BATCH, Duration.ZERO))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(
            () -> new GuidedSessionReaper(service, WINDOW, BATCH, Duration.ofSeconds(-1)))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void expireRunsExpiryThenRedriveThenTheAbandonedReportAndNothingElse() {
    var service = mock(GuidedSessionService.class);

    new GuidedSessionReaper(service, WINDOW, BATCH, INTERVAL).expire();

    var order = inOrder(service);
    order.verify(service).expire();
    order.verify(service).redriveTeardowns(WINDOW, BATCH);
    order.verify(service).reportAbandonedTeardowns(WINDOW, INTERVAL);
    order.verifyNoMoreInteractions();
  }
}
