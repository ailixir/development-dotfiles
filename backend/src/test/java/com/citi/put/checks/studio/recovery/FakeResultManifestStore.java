package com.citi.put.checks.studio.recovery;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/** In-memory manifest store used only by tests. It is not packaged with the application. */
public class FakeResultManifestStore implements ResultManifestStore {

  private final Map<String, ResultManifest> objects = new ConcurrentHashMap<>();
  private volatile boolean available = true;

  @Override
  public Optional<ResultManifest> read(String key) {
    if (!available) {
      throw new IllegalStateException("The result manifest store is unreachable");
    }
    return Optional.ofNullable(objects.get(key));
  }

  @Override
  public boolean isAvailable() {
    return available;
  }

  public void put(String key, ResultManifest manifest) {
    objects.put(key, manifest);
  }

  public void clear() {
    objects.clear();
    available = true;
  }

  public void makeUnavailable() {
    available = false;
  }
}
