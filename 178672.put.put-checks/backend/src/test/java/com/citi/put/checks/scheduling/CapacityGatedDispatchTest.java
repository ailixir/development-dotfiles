package com.citi.put.checks.scheduling;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.checks.CheckRepository;
import com.citi.put.checks.checks.execution.ExecutionPersistenceService;
import com.citi.put.checks.checks.executors.CheckExecutorDispatcher;
import com.citi.put.checks.checks.model.CheckType;
import com.citi.put.checks.config.CheckSourceProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.task.support.TaskExecutorAdapter;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

class CapacityGatedDispatchTest {

  private ScheduleRepository scheduleRepository;
  private CheckRepository checkRepository;
  private CheckExecutorDispatcher executorDispatcher;
  private ExecutionPersistenceService persistenceService;
  private FailedDispatchRepository failedDispatchRepository;
  private PlatformTransactionManager txManager;
  private SimpleMeterRegistry meterRegistry;
  private CheckSourceProperties sourceProperties;

  private CronDispatcher cronDispatcher;

  @BeforeEach
  void setUp() {
    scheduleRepository = mock(ScheduleRepository.class);
    checkRepository = mock(CheckRepository.class);
    executorDispatcher = mock(CheckExecutorDispatcher.class);
    persistenceService = mock(ExecutionPersistenceService.class);
    failedDispatchRepository = mock(FailedDispatchRepository.class);
    txManager = mock(PlatformTransactionManager.class);
    meterRegistry = new SimpleMeterRegistry();
    sourceProperties = new CheckSourceProperties(Map.of(CheckType.HTTP, true, CheckType.TCP, true));

    TransactionStatus txStatus = new SimpleTransactionStatus(false);
    when(txManager.getTransaction(any())).thenReturn(txStatus);

    TaskExecutorAdapter checkExecutor =
        new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());
    TaskExecutorAdapter dispatchExecutor =
        new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());

    cronDispatcher =
        new CronDispatcher(
            scheduleRepository,
            checkRepository,
            executorDispatcher,
            persistenceService,
            sourceProperties,
            checkExecutor,
            dispatchExecutor,
            txManager,
            meterRegistry,
            failedDispatchRepository,
            500,
            3,
            250,
            30);
  }

  @Test
  void pollFetchesOnlyUpToAvailablePermitsPerType() {
    when(executorDispatcher.availablePermitsSnapshot())
        .thenReturn(Map.of(CheckType.HTTP, 3, CheckType.TCP, 2));

    when(scheduleRepository.findDueByType(any(Instant.class), eq("HTTP"), any(PageRequest.class)))
        .thenReturn(List.of());
    when(scheduleRepository.findDueByType(any(Instant.class), eq("TCP"), any(PageRequest.class)))
        .thenReturn(List.of());

    cronDispatcher.pollAndDispatch();

    ArgumentCaptor<PageRequest> httpPageCaptor = ArgumentCaptor.forClass(PageRequest.class);
    verify(scheduleRepository)
        .findDueByType(any(Instant.class), eq("HTTP"), httpPageCaptor.capture());
    assertThat(httpPageCaptor.getValue().getPageSize()).isLessThanOrEqualTo(3);

    ArgumentCaptor<PageRequest> tcpPageCaptor = ArgumentCaptor.forClass(PageRequest.class);
    verify(scheduleRepository)
        .findDueByType(any(Instant.class), eq("TCP"), tcpPageCaptor.capture());
    assertThat(tcpPageCaptor.getValue().getPageSize()).isLessThanOrEqualTo(2);
  }

  @Test
  void pollSkipsTypeWithZeroAvailablePermits() {
    when(executorDispatcher.availablePermitsSnapshot())
        .thenReturn(Map.of(CheckType.HTTP, 0, CheckType.TCP, 5));

    when(scheduleRepository.findDueByType(any(Instant.class), eq("TCP"), any(PageRequest.class)))
        .thenReturn(List.of());

    cronDispatcher.pollAndDispatch();

    verify(scheduleRepository, never())
        .findDueByType(any(Instant.class), eq("HTTP"), any(PageRequest.class));
  }

  @Test
  void globalBackpressureSkipsPoll() {
    when(executorDispatcher.availablePermitsSnapshot())
        .thenReturn(Map.of(CheckType.HTTP, 10, CheckType.TCP, 10));
    when(scheduleRepository.findDueByType(any(), any(), any())).thenReturn(List.of());

    cronDispatcher.pollAndDispatch();

    verify(scheduleRepository, never()).findDueSchedules(any(), any());
  }
}
