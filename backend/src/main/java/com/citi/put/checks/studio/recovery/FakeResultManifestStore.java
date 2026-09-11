package com.citi.put.checks.studio.recovery;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * The `ED-03` fake store story 10.14 replaces (AC-28b).
 *
 * <p>It is in-memory and holds whatever a test puts in it. That is the honest scope: what this
 * story owes is the <em>reconciliation behaviour</em> — a manifest found before finalization wins,
 * one arriving after it is recorded and changes nothing — and the key derivation, which is not
 * deferred. Real Sonic keys, credentials and lifecycle are 10.14 and 10.18.
 */
@Component
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
