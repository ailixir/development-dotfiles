package com.citi.put.checks.scheduling;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

class SchedulingCoordinatorTest {
  private static class Target implements ScheduledTarget {
    final String id;
    final Duration interval;
    final Duration initial;
    final Runnable pass;
    final AtomicBoolean enabled = new AtomicBoolean(true);

    Target(String id, long interval, long initial, Runnable pass) {
      this.id = id;
      this.interval = Duration.ofMillis(interval);
      this.initial = Duration.ofMillis(initial);
      this.pass = pass;
    }

    @Override
    public String targetId() {
      return id;
    }

    @Override
    public boolean enabled() {
      return enabled.get();
    }

    @Override
    public Duration pollInterval() {
      return interval;
    }

    @Override
    public Duration initialDelay() {
      return initial;
    }

    @Override
    public void pollAndDispatch() {
      pass.run();
    }
  }

  @Test
  void initialDelayAndFullPassCompletionOwnCadenceWithoutOverlap() throws Exception {
    var ticker = new AtomicLong();
    var began = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    var calls = new AtomicInteger();
    Target target =
        new Target(
            "checks",
            100,
            50,
            () -> {
              calls.incrementAndGet();
              began.countDown();
              await(release);
            });
    try (var worker = new SchedulingTargetWorker(target, ticker::get)) {
      worker.start();
      assertThat(worker.kick()).isFalse();
      ticker.set(TimeUnit.MILLISECONDS.toNanos(50));
      assertThat(worker.kick()).isTrue();
      assertThat(began.await(5, TimeUnit.SECONDS)).isTrue();
      ticker.set(TimeUnit.MILLISECONDS.toNanos(500));
      for (int i = 0; i < 100; i++) {
        assertThat(worker.kick()).isFalse();
      }
      release.countDown();
      eventually(() -> !worker.inFlight());
      ticker.set(TimeUnit.MILLISECONDS.toNanos(599));
      assertThat(worker.kick()).isFalse();
      ticker.set(TimeUnit.MILLISECONDS.toNanos(600));
      assertThat(worker.kick()).isTrue();
      eventually(() -> calls.get() == 2);
    }
  }

  @Test
  void disabledTargetIsIncludedInHeartbeatAndFlagsRemainIndependent() throws Exception {
    var ticker = new AtomicLong();
    var checks = new AtomicInteger();
    var studio = new AtomicInteger();
    var ordinary = new Target("checks", 250, 0, checks::incrementAndGet);
    var browser = new Target("studio", 50, 0, studio::incrementAndGet);
    browser.enabled.set(false);
    var coordinator =
        new SchedulingCoordinator(
            List.of(ordinary, browser), ticker::get, new SchedulingCoordinatorProperties());
    try {
      assertThat(coordinator.heartbeatMillis()).isEqualTo(50);
      coordinator.start();
      coordinator.tick();
      eventually(() -> checks.get() == 1);
      assertThat(studio.get()).isZero();
      ordinary.enabled.set(false);
      browser.enabled.set(true);
      coordinator.tick();
      eventually(() -> studio.get() == 1);
      assertThat(checks.get()).isEqualTo(1);
    } finally {
      coordinator.stop();
    }
    var properties = new SchedulingCoordinatorProperties();
    properties.setHeartbeatMs(10000);
    assertThat(
            new SchedulingCoordinator(List.of(ordinary), ticker::get, properties).heartbeatMillis())
        .isEqualTo(250);
  }

  @Test
  void blockedThrownAndGuardFailureTargetsCannotSuppressAnotherTarget() throws Exception {
    var ticker = new AtomicLong();
    var began = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    var healthy = new AtomicInteger();
    var blocked =
        new Target(
            "blocked",
            100,
            0,
            () -> {
              began.countDown();
              await(release);
            });
    var thrown =
        new Target(
            "throwing",
            100,
            0,
            () -> {
              throw new IllegalStateException("fixture");
            });
    var guard =
        new Target(
            "guard",
            100,
            0,
            () -> {
              /* The eligibility guard prevents this pass. */
            }) {
          @Override
          public boolean enabled() {
            throw new IllegalStateException("fixture guard");
          }
        };
    var good = new Target("checks", 100, 0, healthy::incrementAndGet);
    var coordinator =
        new SchedulingCoordinator(
            List.of(blocked, thrown, guard, good),
            ticker::get,
            new SchedulingCoordinatorProperties());
    try {
      coordinator.start();
      coordinator.tick();
      assertThat(began.await(5, TimeUnit.SECONDS)).isTrue();
      eventually(() -> healthy.get() == 1);
      ticker.set(TimeUnit.MILLISECONDS.toNanos(200));
      coordinator.tick();
      eventually(() -> healthy.get() == 2);
    } finally {
      release.countDown();
      coordinator.stop();
    }
  }

  @Test
  void lifecycleRestartRecreatesWorkersAndStopsFutureSubmission() throws Exception {
    var ticker = new AtomicLong();
    var calls = new AtomicInteger();
    var coordinator =
        new SchedulingCoordinator(
            List.of(new Target("checks", 100, 25, calls::incrementAndGet)),
            ticker::get,
            new SchedulingCoordinatorProperties());
    coordinator.start();
    ticker.set(TimeUnit.MILLISECONDS.toNanos(25));
    coordinator.tick();
    eventually(() -> calls.get() == 1);
    coordinator.stop();
    ticker.set(TimeUnit.MILLISECONDS.toNanos(500));
    coordinator.tick();
    assertThat(calls.get()).isEqualTo(1);
    coordinator.start();
    coordinator.tick();
    assertThat(calls.get()).isEqualTo(1);
    ticker.set(TimeUnit.MILLISECONDS.toNanos(525));
    coordinator.tick();
    eventually(() -> calls.get() == 2);
    coordinator.stop();
  }

  @Test
  void unfinishedOldGenerationCannotOverlapRestartedWork() throws Exception {
    var ticker = new AtomicLong();
    var began = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    var calls = new AtomicInteger();
    var props = new SchedulingCoordinatorProperties();
    props.setShutdownTimeoutMs(0);
    var target =
        new Target(
            "studio",
            100,
            0,
            () -> {
              calls.incrementAndGet();
              began.countDown();
              while (release.getCount() > 0) {
                try {
                  release.await(50, TimeUnit.MILLISECONDS);
                } catch (InterruptedException ignored) {
                  /* Simulates noninterruptible network cleanup. */
                }
              }
            });
    var coordinator = new SchedulingCoordinator(List.of(target), ticker::get, props);
    try {
      coordinator.start();
      coordinator.tick();
      assertThat(began.await(5, TimeUnit.SECONDS)).isTrue();
      coordinator.stop();
      coordinator.start();
      ticker.set(TimeUnit.MILLISECONDS.toNanos(1000));
      coordinator.tick();
      assertThat(calls.get()).isEqualTo(1);
      release.countDown();
      eventually(() -> !coordinator.hasInFlightPass());
      coordinator.tick();
      assertThat(calls.get()).isEqualTo(1);
      ticker.set(TimeUnit.MILLISECONDS.toNanos(1100));
      coordinator.tick();
      eventually(() -> calls.get() == 2);
    } finally {
      release.countDown();
      coordinator.stop();
    }
  }

  @Test
  void roleMatrixKeepsTheOrdinaryTargetOnTheSchedulerRoleOnly() throws Exception {
    for (String[] profiles :
        List.of(
            new String[] {"dev"},
            new String[] {"test"},
            new String[] {"local"},
            new String[] {"api"},
            new String[] {"local", "api"},
            new String[] {"worker"},
            new String[] {"worker", "api"})) {
      var checks = new AtomicInteger();
      try (var context = new AnnotationConfigApplicationContext()) {
        context.getEnvironment().setActiveProfiles(profiles);
        context.register(
            SchedulingConfiguration.class,
            SchedulingCoordinatorProperties.class,
            SchedulingCoordinator.class);
        context.registerBean(
            "ordinary",
            ScheduledTarget.class,
            () -> new Target("checks", 100, 0, checks::incrementAndGet));
        context.refresh();
        boolean worker = List.of(profiles).contains("worker");
        boolean api = List.of(profiles).contains("api");
        var hub = context.getBeanProvider(SchedulingCoordinator.class).getIfAvailable();
        assertThat(hub != null).isEqualTo(!api || worker);
        if (hub != null) {
          hub.tick();
          eventually(() -> checks.get() == 1);
        } else {
          assertThat(checks.get()).isZero();
        }
      }
    }
  }

  private static void eventually(BooleanSupplier ready) throws Exception {
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
    while (!ready.getAsBoolean() && System.nanoTime() < deadline) {
      Thread.sleep(5);
    }
    assertThat(ready.getAsBoolean()).isTrue();
  }

  private static void await(CountDownLatch latch) {
    try {
      if (!latch.await(5, TimeUnit.SECONDS)) {
        throw new IllegalStateException("fixture timeout");
      }
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(ex);
    }
  }
}
