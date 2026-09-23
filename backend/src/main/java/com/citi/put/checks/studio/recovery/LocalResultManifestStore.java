package com.citi.put.checks.studio.recovery;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/** Read-only filesystem manifest adapter paired with the runner's local object writer. */
public final class LocalResultManifestStore implements ResultManifestStore {

  private final Path root;
  private final int maxBytes;
  private final ObjectMapper objectMapper;

  public LocalResultManifestStore(Path root, int maxBytes, ObjectMapper objectMapper) {
    this.root = root.toAbsolutePath().normalize();
    this.maxBytes = maxBytes;
    this.objectMapper = objectMapper;
  }

  @Override
  public Optional<ResultManifest> read(String key) {
    Path path = resolve(key);
    try {
      if (!Files.exists(path)) {
        return Optional.empty();
      }
      long size = Files.size(path);
      if (size > maxBytes) {
        throw new IllegalStateException("The result manifest exceeds the configured size bound");
      }
      byte[] bytes;
      try (InputStream input = Files.newInputStream(path)) {
        bytes = input.readNBytes(maxBytes + 1);
      }
      if (bytes.length > maxBytes) {
        throw new IllegalStateException("The result manifest exceeds the configured size bound");
      }
      return Optional.of(objectMapper.readValue(bytes, ResultManifest.class));
    } catch (IOException e) {
      throw new IllegalStateException("The local result manifest store is unavailable", e);
    }
  }

  @Override
  public boolean isAvailable() {
    return Files.isDirectory(root) && Files.isReadable(root);
  }

  private Path resolve(String key) {
    Path path = root.resolve(key).normalize();
    if (!path.startsWith(root) || path.equals(root)) {
      throw new IllegalArgumentException("The object key resolves outside the store root");
    }
    return path;
  }
}
