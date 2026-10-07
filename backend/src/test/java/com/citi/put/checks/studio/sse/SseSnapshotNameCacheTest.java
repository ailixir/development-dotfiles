package com.citi.put.checks.studio.sse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.ExecutionSnapshotMapper;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.UITestExecutionRepository;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.entity.UITestExecution;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** PERF-001 (Story 10.46): the test name is resolved once per watched execution, not per frame. */
class SseSnapshotNameCacheTest {

  private final UUID executionId = UUID.randomUUID();
  private final UUID testId = UUID.randomUUID();

  private WatchedExecutionRegistry registry;
  private StudioRepository tests;
  private SnapshotBroadcaster broadcaster;

  @BeforeEach
  void setUp() {
    registry = mock(WatchedExecutionRegistry.class);
    UITestExecutionRepository executions = mock(UITestExecutionRepository.class);
    ExecutionSnapshotMapper mapper = mock(ExecutionSnapshotMapper.class);
    tests = mock(StudioRepository.class);

    UITestExecution row = mock(UITestExecution.class);
    when(row.getTestId()).thenReturn(testId);
    when(executions.findByExecutionId(executionId)).thenReturn(Optional.of(row));
    ExecutionSnapshotDto snapshot = mock(ExecutionSnapshotDto.class);
    when(mapper.toSnapshot(any())).thenReturn(snapshot);
    when(snapshot.withTestName(any())).thenReturn(snapshot);
    when(tests.findVisibleName(testId)).thenReturn("Login smoke");
    when(registry.watchedExecutionIds()).thenReturn(Set.of(executionId));

    broadcaster =
        new SnapshotBroadcaster(
            registry,
            executions,
            mapper,
            tests,
            mock(BoundedSenders.class),
            mock(StreamAuthorization.class),
            mock(StudioExecutionProperties.class));
  }

  @Test
  void looksTheNameUpOnceAcrossFramesForTheSameWatchedExecution() {
    broadcaster.broadcast();
    broadcaster.broadcast();
    broadcaster.broadcast();

    verify(tests, times(1)).findVisibleName(testId);
  }

  @Test
  void looksTheNameUpAgainOnceTheExecutionStoppedBeingWatched() {
    broadcaster.broadcast();
    when(registry.watchedExecutionIds()).thenReturn(Set.of());
    assertThat(broadcaster.broadcast()).isZero();
    when(registry.watchedExecutionIds()).thenReturn(Set.of(executionId));
    broadcaster.broadcast();

    verify(tests, times(2)).findVisibleName(testId);
  }
}
