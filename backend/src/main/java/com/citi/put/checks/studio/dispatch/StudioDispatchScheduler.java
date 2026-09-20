package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.studio.StudioExecutionProperties;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Runs the dispatcher, and on the worker profile or an explicitly enabled local process (AC-12,
 * §5.4).
 *
 * <p>The dispatcher itself is an ordinary bean so that it can be driven directly by a test; what is
 * worker-only is the <em>schedule</em>. An API-profile context therefore has no {@code
 * StudioDispatchScheduler} bean at all, and a queued row it can see is a queued row it never claims
 * — which is what AC-12's API-profile assertion checks.
 *
 * <p>The thread budget is bounded and separate from every other Studio pool and from the ordinary
 * check executor (AC-38): a saturated dispatcher can consume its own threads and nothing else's.
 */
@Component
@Profile({"worker", "local"})
@ConditionalOnProperty(
    prefix = "studio.execution.dispatcher",
    name = "enabled",
    havingValue = "true",
    matchIfMissing = true)
public class StudioDispatchScheduler implements AutoCloseable {

  private static final Logger LOGGER = LoggerFactory.getLogger(StudioDispatchScheduler.class);

  private final StudioDispatcher dispatcher;
  private final ExecutorService pool;

  public StudioDispatchScheduler(
      StudioDispatcher dispatcher, StudioExecutionProperties properties) {
    this.dispatcher = dispatcher;
    int threads = properties.dispatcherOrDefault().threadsOrDefault();
    this.pool =
        new ThreadPoolExecutor(
            threads,
            threads,
            0L,
            TimeUnit.MILLISECONDS,
            new LinkedBlockingQueue<>(threads * 4),
            runnable -> {
              Thread thread = Executors.defaultThreadFactory().newThread(runnable);
              thread.setName("studio-dispatcher");
              thread.setDaemon(true);
              return thread;
            },
            new ThreadPoolExecutor.DiscardPolicy());
  }

  /** One bounded pass. A pass that overruns simply has its successor discarded, never queued. */
  @Scheduled(fixedDelayString = "${studio.execution.dispatcher.poll-interval-ms:2000}")
  public void poll() {
    pool.execute(
        () -> {
          try {
            int dispatched = dispatcher.dispatchOnce();
            if (dispatched > 0) {
              LOGGER.debug("Studio dispatcher dispatched {} execution(s)", dispatched);
            }
          } catch (RuntimeException e) {
            LOGGER.warn("Studio dispatcher pass failed", e);
          }
        });
  }

  @Override
  public void close() {
    pool.shutdownNow();
  }
}
