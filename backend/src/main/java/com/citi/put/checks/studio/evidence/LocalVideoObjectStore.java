package com.citi.put.checks.studio.evidence;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/** Read-only filesystem adapter paired with the runner's atomic local object writer. */
public final class LocalVideoObjectStore implements VideoObjectStore {

  private final Path root;

  public LocalVideoObjectStore(Path root) {
    this.root = root.toAbsolutePath().normalize();
  }

  @Override
  public Optional<VideoObjectMetadata> metadata(String key) {
    Path path = resolve(key);
    try {
      if (!Files.exists(path)) {
        return Optional.empty();
      }
      return Optional.of(new VideoObjectMetadata(Files.size(path)));
    } catch (IOException e) {
      throw unavailable(e);
    }
  }

  @Override
  public byte[] read(String key, long firstByte, long lastByte) {
    Path path = resolve(key);
    long length = lastByte - firstByte + 1;
    if (length < 0 || length > Integer.MAX_VALUE) {
      throw new IllegalArgumentException("The requested evidence range is too large");
    }
    byte[] bytes = new byte[(int) length];
    try (RandomAccessFile file = new RandomAccessFile(path.toFile(), "r")) {
      file.seek(firstByte);
      file.readFully(bytes);
      return bytes;
    } catch (IOException e) {
      throw unavailable(e);
    }
  }

  private Path resolve(String key) {
    Path path = root.resolve(key).normalize();
    if (!path.startsWith(root) || path.equals(root)) {
      throw new IllegalArgumentException("The object key resolves outside the store root");
    }
    return path;
  }

  private static VideoObjectStoreUnavailableException unavailable(IOException cause) {
    return new VideoObjectStoreUnavailableException(
        "The local evidence store is unavailable", cause);
  }
}
