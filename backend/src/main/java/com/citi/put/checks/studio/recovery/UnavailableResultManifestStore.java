package com.citi.put.checks.studio.recovery;

import java.util.Optional;

/** Explicit disabled adapter used when evidence storage is configured as `none`. */
public final class UnavailableResultManifestStore implements ResultManifestStore {
  @Override
  public Optional<ResultManifest> read(String key) {
    throw new IllegalStateException("The Studio result manifest store is disabled");
  }

  @Override
  public boolean isAvailable() {
    return false;
  }
}
