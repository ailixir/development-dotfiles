package com.citi.put.checks.studio.storage;

import com.citi.put.checks.studio.evidence.VideoObjectStore;
import com.citi.put.checks.studio.recovery.ResultManifest;
import com.citi.put.checks.studio.recovery.ResultManifestStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.Optional;

/**
 * Both evidence readers use one provider and namespace. Manifest bytes are bounded before reading.
 */
public final class ObjectStoreManifestReader implements ResultManifestStore {
  private static final long MAX_MANIFEST_BYTES = 1024 * 1024;
  private final VideoObjectStore store;
  private final ObjectMapper mapper;

  public ObjectStoreManifestReader(VideoObjectStore store, ObjectMapper mapper) {
    this.store = store;
    this.mapper = mapper;
  }

  @Override
  public Optional<ResultManifest> read(String key) {
    var metadata = store.metadata(key);
    if (metadata.isEmpty()) {
      return Optional.empty();
    }
    long size = metadata.get().sizeBytes();
    if (size <= 0 || size > MAX_MANIFEST_BYTES) {
      throw new IllegalStateException("Result manifest is empty or exceeds its size limit");
    }
    try {
      return Optional.of(mapper.readValue(store.read(key, 0, size - 1), ResultManifest.class));
    } catch (IOException e) {
      throw new IllegalStateException("Result manifest could not be decoded");
    }
  }

  @Override
  public boolean isAvailable() {
    // Probe one known key, never enumerate the bucket. Missing means reachable; refusal/outage does
    // not.
    try {
      store.metadata("studio/.availability");
      return true;
    } catch (RuntimeException e) {
      return false;
    }
  }
}
