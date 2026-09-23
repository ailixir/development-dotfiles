package com.citi.put.checks.studio.evidence;

import java.util.Arrays;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** In-memory recording store used only by tests. It is not packaged with the application. */
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
    byte[] slice = Arrays.copyOfRange(object, (int) firstByte, (int) lastByte + 1);
    bytesProduced.addAndGet(slice.length);
    return slice;
  }

  public void put(String key, byte[] bytes) {
    objects.put(key, bytes.clone());
  }

  public void clear() {
    objects.clear();
    bytesProduced.set(0);
    reachable = true;
  }

  public long bytesProduced() {
    return bytesProduced.get();
  }

  public void resetMeter() {
    bytesProduced.set(0);
  }

  public void makeUnreachable() {
    reachable = false;
  }

  public void makeReachable() {
    reachable = true;
  }

  private void requireReachable() {
    if (!reachable) {
      throw new VideoObjectStoreUnavailableException(
          "The Studio evidence store is unreachable (bucket "
              + properties.bucketOrDefault()
              + " at "
              + properties.endpointOrDefault()
              + ")");
    }
  }
}
