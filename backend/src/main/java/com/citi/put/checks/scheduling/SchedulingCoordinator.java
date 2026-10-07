package com.citi.put.checks.scheduling;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.SmartLifecycle;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** The one due-production timer. Domain execution/recovery timers remain independent consumers. */
@Component("schedulingCoordinator")
@Profile("!api | worker")
public class SchedulingCoordinator implements SmartLifecycle {
  private static final Logger LOG = LoggerFactory.getLogger(SchedulingCoordinator.class);
  private volatile List<SchedulingTargetWorker> workers = List.of();
  private final List<ScheduledTarget> targets;
  private final SchedulingTicker ticker;
  private final Map<String, SchedulingTargetWorker.Cadence> cadence = new LinkedHashMap<>();
  private final SchedulingCoordinatorProperties properties;
  private final long heartbeatMs;
  private volatile boolean running;

  @Autowired
  public SchedulingCoordinator(
      ObjectProvider<ScheduledTarget> targets,
      SchedulingTicker ticker,
      SchedulingCoordinatorProperties properties) {
    this(targets.orderedStream().toList(), ticker, properties);
  }

  public SchedulingCoordinator(
      List<ScheduledTarget> targets,
      SchedulingTicker ticker,
      SchedulingCoordinatorProperties properties) {
    this.properties = properties;
    this.targets = List.copyOf(targets);
    this.ticker = ticker;
    if (targets.stream().map(ScheduledTarget::targetId).distinct().count() != targets.size()) {
      throw new IllegalArgumentException("Scheduled target identities must be unique");
    }
    heartbeatMs = SchedulingHeartbeat.effectiveMillis(targets, properties);
    targets.forEach(t -> cadence.put(t.targetId(), new SchedulingTargetWorker.Cadence()));
  }

  public long heartbeatMillis() {
    return heartbeatMs;
  }

  boolean hasInFlightPass() {
    return workers.stream().anyMatch(SchedulingTargetWorker::inFlight);
  }

  @Scheduled(fixedDelayString = "#{@schedulingHeartbeat.millis()}")
  public void tick() {
    if (running) {
      for (var worker : workers) {
        try {
          worker.kick();
        } catch (RuntimeException ex) {
          LOG.warn("Scheduling target eligibility failed ({})", ex.getClass().getSimpleName());
        }
      }
    }
  }

  @Override
  public synchronized void start() {
    if (running) {
      return;
    }
    workers =
        targets.stream()
            .map(t -> new SchedulingTargetWorker(t, ticker, cadence.get(t.targetId())))
            .toList();
    workers.forEach(SchedulingTargetWorker::start);
    running = true;
  }

  @Override
  public synchronized void stop() {
    running = false;
    workers.forEach(SchedulingTargetWorker::close);
    long deadline =
        System.nanoTime()
            + java.util.concurrent.TimeUnit.MILLISECONDS.toNanos(properties.getShutdownTimeoutMs());
    for (var worker : workers) {
      worker.awaitStop(
          java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(
              Math.max(0, deadline - System.nanoTime())));
    }
  }

  @Override
  public boolean isRunning() {
    return running;
  }

  @Override
  public int getPhase() {
    return Integer.MAX_VALUE - 99;
  }
}
