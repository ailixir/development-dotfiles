package com.citi.put.checks.studio.recovery;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * The `ED-03` fake store story 10.14 replaces (AC-28b).
 *
 * <p>Test-only in-memory fixture. Runtime recovery reads the same filesystem directory or S3 bucket
 * as the video reader, selected by {@code studio.storage.provider}.
 */
@Component
@Profile("test")
@ConditionalOnProperty(name = "studio.storage.provider", havingValue = "fake")
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

  /** An unreachable store must not be mistaken for an absent key; a test proves the difference. */
  public void makeUnavailable() {
    this.available = false;
  }
}
