package com.citi.put.checks.studio.evidence;

import java.util.Arrays;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Component;

/**
 * The `ED-03` stand-in this story owns (story 10.15 AC-18a).
 *
 * <p>In-memory, holding whatever a test puts in it. The real Sonic client that replaces it is
 * `ED-03`'s, owned by story 10.18 and proven in 10.19; AC-18b is recorded <b>skipped, never
 * passed</b> for exactly that reason.
 *
 * <p>Two properties it has that a {@code Map<String, byte[]>} would not, and both are criteria:
 *
 * <ul>
 *   <li><b>It reads ranges, and it counts what it produced.</b> {@link #bytesProduced()} is the
 *       instrument AC-16's behavioural half asserts on: a route that read the whole object and then
 *       sliced it would be sixteen times over on a 64 KiB request against a 1 MiB object. A fake
 *       that handed back the whole array and let the caller slice would make that unfalsifiable.
 *   <li><b>Unreachable is not absent.</b> {@link #makeUnreachable()} makes every operation throw
 *       {@link VideoObjectStoreUnavailableException}; an absent key is {@link Optional#empty()}
 *       from {@link #metadata}. The two are different outcomes at the route and a test drives both.
 * </ul>
 *
 * <p>The inspection methods live on the fake and not on {@link VideoObjectStore}, which is what
 * keeps "read-only by construction" a statement about the production interface rather than about a
 * test double that quietly grew a surface.
 *
 * <p><b>On this being an unguarded {@code @Component} in {@code src/main/java}</b> — raised by @qa
 * as LOW-3 on story 10.15 and <b>declined here deliberately, with the reason recorded rather than
 * left to inference.</b> {@code FakeResultManifestStore} is identically unguarded, in the same
 * tree, shipped by story 10.14 and merged; the two fakes are swapped for real Sonic clients by the
 * same story (10.18, under `ED-03`) and should acquire the same guard in the same change, not two
 * different ones invented separately. Guessing a profile name here would be invention, and
 * {@code @ConditionalOnMissingBean} does not apply to a {@code @Component}. What protects the
 * criterion today is behavioural rather than structural: {@code ExecutionVideoStoreBindingIT}
 * asserts the <b>injected</b> bean is this class, so AC-18b cannot be reported as cleared by wiring
 * a real endpoint under this name. <b>10.18: guard both fakes together.</b>
 */
@Component
public class FakeVideoObjectStore implements VideoObjectStore {

  private final Map<String, byte[]> objects = new ConcurrentHashMap<>();
  private final AtomicLong bytesProduced = new AtomicLong();
  private final VideoStoreProperties properties;
  private volatile boolean reachable = true;

  public FakeVideoObjectStore(VideoStoreProperties properties) {
    this.properties = properties;
  }

  @Override
  public Optional<VideoObjectMetadata> metadata(String key) {
    requireReachable();
    byte[] object = objects.get(key);
    return object == null ? Optional.empty() : Optional.of(new VideoObjectMetadata(object.length));
  }

  @Override
  public byte[] read(String key, long firstByte, long lastByte) {
    requireReachable();
    byte[] object = objects.get(key);
    if (object == null) {
      throw new IllegalStateException("No object at the derived key");
    }
    if (firstByte < 0 || lastByte < firstByte || lastByte >= object.length) {
      throw new IllegalArgumentException(
          "The store was asked for bytes outside the object it holds");
    }
    // Only the requested window is materialized, and only the requested window is counted.
    byte[] slice = Arrays.copyOfRange(object, (int) firstByte, (int) lastByte + 1);
    bytesProduced.addAndGet(slice.length);
    return slice;
  }

  // ── test-facing surface; deliberately not on VideoObjectStore ────────────

  public void put(String key, byte[] bytes) {
    objects.put(key, bytes.clone());
  }

  public void clear() {
    objects.clear();
    bytesProduced.set(0);
    reachable = true;
  }

  /** How many bytes this store has been asked to produce since the last {@link #resetMeter()}. */
  public long bytesProduced() {
    return bytesProduced.get();
  }

  public void resetMeter() {
    bytesProduced.set(0);
  }

  /** An unreachable store must not look like an absent key; a test drives both and compares. */
  public void makeUnreachable() {
    this.reachable = false;
  }

  public void makeReachable() {
    this.reachable = true;
  }

  private void requireReachable() {
    if (!reachable) {
      // The message names the deployment values on purpose: it is a real leak path, and AC-6
      // asserts that none of it reaches the wire.
      throw new VideoObjectStoreUnavailableException(
          "The Studio evidence store is unreachable (bucket "
              + properties.bucketOrDefault()
              + " at "
              + properties.endpointOrDefault()
              + ")");
    }
  }
}
