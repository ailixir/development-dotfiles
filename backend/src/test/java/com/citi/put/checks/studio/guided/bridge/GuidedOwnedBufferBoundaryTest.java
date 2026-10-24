package com.citi.put.checks.studio.guided.bridge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.Flow;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/** Actual owned-buffer boundaries; JDK copies and joined service effects are outside this scope. */
class GuidedOwnedBufferBoundaryTest {
  /** The real accepted-body bound, read from {@code BoundedResponse.LIMIT} (not hard-coded). */
  private static final int LIMIT = limit("$BoundedResponse", "LIMIT");

  /**
   * The real definite-refusal reply bound, read from {@code
   * HttpRunnerDispatchClient.REFUSAL_LIMIT}.
   */
  private static final int REFUSAL_LIMIT = limit("", "REFUSAL_LIMIT");

  @Test
  void exactResponseLimitCompletesAndAllOwnedArraysAreErased() throws Exception {
    Object owner = response();
    var subscriber = subscriber(owner);
    var subscription = new CountedSubscription();
    subscriber.onSubscribe(subscription);
    byte[] initial = array(owner, "bytes");
    byte[] prefix = new byte[4096];
    Arrays.fill(prefix, (byte) 73);
    subscriber.onNext(List.of(ByteBuffer.wrap(prefix)));
    assertThat(initial).containsOnly((byte) 73);
    byte[] suffix = new byte[LIMIT - prefix.length];
    Arrays.fill(suffix, (byte) 74);
    subscriber.onNext(List.of(ByteBuffer.wrap(suffix)));
    byte[] grown = array(owner, "bytes");
    assertThat(grown).isNotSameAs(initial).hasSize(LIMIT);
    assertThat(initial).containsOnly((byte) 0);
    assertThat(subscriber.getBody().toCompletableFuture()).isNotCompleted();
    subscriber.onComplete();
    byte[] completed = subscriber.getBody().toCompletableFuture().join();
    assertThat(completed).hasSize(LIMIT).isNotSameAs(grown);
    assertThat(completed[0]).isEqualTo((byte) 73);
    assertThat(completed[LIMIT - 1]).isEqualTo((byte) 74);
    ((AutoCloseable) owner).close();
    assertThat(grown).containsOnly((byte) 0);
    assertThat(completed).containsOnly((byte) 0);
    assertThat(subscription.cancelled.get()).isEqualTo(1);
  }

  @Test
  void oneByteBeyondLimitCancelsAndOwnerCloseErasesAccumulation() throws Exception {
    Object owner = response();
    var subscriber = subscriber(owner);
    var subscription = new CountedSubscription();
    subscriber.onSubscribe(subscription);
    byte[] content = new byte[LIMIT];
    Arrays.fill(content, (byte) 81);
    subscriber.onNext(List.of(ByteBuffer.wrap(content)));
    byte[] owned = array(owner, "bytes");
    ByteBuffer excess = ByteBuffer.wrap(new byte[] {82});
    subscriber.onNext(List.of(excess));
    assertThat(excess.position()).isZero();
    assertThat(subscription.cancelled.get()).isEqualTo(1);
    assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().join())
        .hasCauseInstanceOf(java.io.IOException.class)
        .hasRootCauseMessage("Guided response exceeded size bound");
    ((AutoCloseable) owner).close();
    assertThat(owned).containsOnly((byte) 0);
  }

  /**
   * The definite-refusal reply bound (ar-2-r14-stops ruling 2: a context 409 body is read up to
   * REFUSAL_LIMIT). It equals the initial owned buffer, so unlike LIMIT nothing grows: exactly
   * REFUSAL_LIMIT bytes complete into the original array, and one byte more cancels without
   * consuming it.
   */
  @Test
  void refusalReplyLimitCompletesExactlyAndCancelsOneByteBeyond() throws Exception {
    Object exact = response(REFUSAL_LIMIT);
    var subscriber = subscriber(exact);
    var subscription = new CountedSubscription();
    subscriber.onSubscribe(subscription);
    byte[] initial = array(exact, "bytes");
    byte[] content = new byte[REFUSAL_LIMIT];
    Arrays.fill(content, (byte) 61);
    subscriber.onNext(List.of(ByteBuffer.wrap(content)));
    assertThat(array(exact, "bytes")).as("no growth at the refusal bound").isSameAs(initial);
    subscriber.onComplete();
    assertThat(subscriber.getBody().toCompletableFuture().join()).hasSize(REFUSAL_LIMIT);
    ((AutoCloseable) exact).close();
    assertThat(initial).containsOnly((byte) 0);

    Object beyond = response(REFUSAL_LIMIT);
    var over = subscriber(beyond);
    var cancelled = new CountedSubscription();
    over.onSubscribe(cancelled);
    over.onNext(List.of(ByteBuffer.wrap(new byte[REFUSAL_LIMIT])));
    ByteBuffer excess = ByteBuffer.wrap(new byte[] {62});
    over.onNext(List.of(excess));
    assertThat(excess.position()).isZero();
    assertThat(cancelled.cancelled.get()).isEqualTo(1);
    assertThatThrownBy(() -> over.getBody().toCompletableFuture().join())
        .hasRootCauseMessage("Guided response exceeded size bound");
    ((AutoCloseable) beyond).close();
  }

  @Test
  void closeBeforeSubscriptionRefusesLateChunksWithoutConsumingThem() throws Exception {
    Object owner = response();
    var subscriber = subscriber(owner);
    byte[] owned = array(owner, "bytes");
    ((AutoCloseable) owner).close();
    var late = new CountedSubscription();
    subscriber.onSubscribe(late);
    ByteBuffer chunk = ByteBuffer.wrap(new byte[] {91, 92});
    subscriber.onNext(List.of(chunk));
    subscriber.onComplete();
    assertThat(late.cancelled.get()).isEqualTo(1);
    assertThat(late.requested.get()).isZero();
    assertThat(chunk.position()).isZero();
    assertThat(owned).containsOnly((byte) 0);
    assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().join())
        .hasRootCauseMessage("Guided response refused");
  }

  @Test
  void requestCloseWaitsForOwnedReadMonitorAndRefusesSubsequentReads() throws Exception {
    byte[] owned = new byte[] {101, 102, 103};
    Class<?> type = Class.forName(HttpRunnerDispatchClient.class.getName() + "$OwnedRequestBody");
    var constructor = type.getDeclaredConstructor(byte[].class);
    constructor.setAccessible(true);
    InputStream stream = (InputStream) constructor.newInstance((Object) owned);
    var entered = new java.util.concurrent.CountDownLatch(1);
    var finished = new java.util.concurrent.CountDownLatch(1);
    var error = new java.util.concurrent.atomic.AtomicReference<Throwable>();
    Thread closer;
    synchronized (stream) {
      closer =
          Thread.ofPlatform()
              .start(
                  () -> {
                    entered.countDown();
                    try {
                      stream.close();
                    } catch (Throwable failure) {
                      error.set(failure);
                    } finally {
                      finished.countDown();
                    }
                  });
      assertThat(entered.await(2, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
      assertThat(finished.getCount()).isEqualTo(1);
      byte[] copied = new byte[2];
      assertThat(stream.read(copied)).isEqualTo(2);
      assertThat(copied).containsExactly((byte) 101, (byte) 102);
      Arrays.fill(copied, (byte) 0);
    }
    closer.join(2000);
    assertThat(closer.isAlive()).isFalse();
    assertThat(error.get()).isNull();
    assertThat(owned).containsOnly((byte) 0);
    assertThatThrownBy(stream::read).isInstanceOf(java.io.IOException.class);
    assertThatThrownBy(() -> stream.read(new byte[1])).isInstanceOf(java.io.IOException.class);
  }

  private static Object response() throws Exception {
    return response(LIMIT);
  }

  private static Object response(int limit) throws Exception {
    Class<?> type = Class.forName(HttpRunnerDispatchClient.class.getName() + "$BoundedResponse");
    var constructor = type.getDeclaredConstructor(boolean.class, int.class);
    constructor.setAccessible(true);
    return constructor.newInstance(true, limit);
  }

  private static int limit(String nested, String name) {
    try {
      Field field =
          Class.forName(HttpRunnerDispatchClient.class.getName() + nested).getDeclaredField(name);
      field.setAccessible(true);
      return field.getInt(null);
    } catch (ReflectiveOperationException failure) {
      throw new ExceptionInInitializerError(failure);
    }
  }

  @SuppressWarnings("unchecked")
  private static HttpResponse.BodySubscriber<byte[]> subscriber(Object owner) {
    return (HttpResponse.BodySubscriber<byte[]>) owner;
  }

  private static byte[] array(Object owner, String name) throws Exception {
    Field field = owner.getClass().getDeclaredField(name);
    field.setAccessible(true);
    return (byte[]) field.get(owner);
  }

  private static final class CountedSubscription implements Flow.Subscription {
    private final AtomicInteger requested = new AtomicInteger();
    private final AtomicInteger cancelled = new AtomicInteger();

    @Override
    public void request(long count) {
      requested.addAndGet(Math.toIntExact(count));
    }

    @Override
    public void cancel() {
      cancelled.incrementAndGet();
    }
  }
}
