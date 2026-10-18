package com.citi.put.checks.studio.dispatch;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * A fake runner client that counts what left the process.
 *
 * <p>"Exactly one {@code POST /v1/runs}" is the assertion half the recovery and dispatch criteria
 * are written around, and it is only meaningful if something counts. This also lets a test block
 * inside the send, which is how the attempt-before-send commit ordering is observed from a second
 * connection rather than assumed from reading the code.
 */
public class RecordingRunnerDispatchClient implements RunnerDispatchClient {

  private final List<RunJob> sent = new CopyOnWriteArrayList<>();
  private final List<java.util.UUID> cancelled = new CopyOnWriteArrayList<>();
  private final AtomicReference<CancelOutcome> nextCancelOutcome =
      new AtomicReference<>(CancelOutcome.ACKNOWLEDGED);
  private final AtomicReference<DispatchOutcome> nextOutcome =
      new AtomicReference<>(DispatchOutcome.accepted());
  private volatile CountDownLatch blockUntil;
  private volatile CountDownLatch sendStarted;
  private volatile java.util.function.Consumer<RunJob> onSend =
      job -> {
        // No observer effect until a test installs its callback.
      };

  public void onSend(java.util.function.Consumer<RunJob> observer) {
    this.onSend = observer;
  }

  @Override
  public DispatchOutcome send(RunJob job) {
    onSend.accept(job);
    sent.add(job);
    if (sendStarted != null) {
      sendStarted.countDown();
    }
    CountDownLatch gate = blockUntil;
    if (gate != null) {
      try {
        gate.await(30, TimeUnit.SECONDS);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
    }
    return nextOutcome.get();
  }

  @Override
  public CancelOutcome cancel(java.util.UUID executionId) {
    cancelled.add(executionId);
    return nextCancelOutcome.get();
  }

  public void willAnswerCancel(CancelOutcome outcome) {
    nextCancelOutcome.set(outcome);
  }

  /** How many cancels were relayed for one execution — never a deployment-global count. */
  public long cancelsFor(java.util.UUID executionId) {
    return cancelled.stream().filter(executionId::equals).count();
  }

  public void willAnswer(DispatchOutcome outcome) {
    nextOutcome.set(outcome);
  }

  /** Blocks inside {@link #send} until the returned latch is counted down. */
  public CountDownLatch blockInsideSend(CountDownLatch sendHasStarted) {
    this.sendStarted = sendHasStarted;
    CountDownLatch gate = new CountDownLatch(1);
    this.blockUntil = gate;
    return gate;
  }

  public void unblock() {
    this.blockUntil = null;
    this.sendStarted = null;
  }

  public List<RunJob> sent() {
    return List.copyOf(sent);
  }

  public int sendCount() {
    return sent.size();
  }

  public void reset() {
    sent.clear();
    onSend =
        job -> {
          // No observer effect until a test installs its callback.
        };
    cancelled.clear();
    unblock();
    nextOutcome.set(DispatchOutcome.accepted());
    nextCancelOutcome.set(CancelOutcome.ACKNOWLEDGED);
  }
}
