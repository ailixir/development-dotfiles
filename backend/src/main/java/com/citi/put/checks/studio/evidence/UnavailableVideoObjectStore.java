package com.citi.put.checks.studio.evidence;

import java.util.Optional;

/** Explicit disabled adapter; it never masquerades as an empty, reachable object store. */
final class UnavailableVideoObjectStore implements VideoObjectStore {
  @Override
  public Optional<VideoObjectMetadata> metadata(String key) {
    throw new VideoObjectStoreUnavailableException("The Studio evidence store is disabled");
  }

  @Override
  public byte[] read(String key, long firstByte, long lastByte) {
    throw new VideoObjectStoreUnavailableException("The Studio evidence store is disabled");
  }
}
