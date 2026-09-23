package com.citi.put.checks.studio.evidence;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Optional;

/**
 * Read-only filesystem adapter paired with the runner's atomic local object writer.
 *
 * <p>Reads only the requested range, never follows a symbolic link inside the store, and keeps a
 * missing key (empty) distinct from a missing or unreadable store root (unavailable).
 */
public final class LocalVideoObjectStore implements VideoObjectStore {

  private final Path root;

  public LocalVideoObjectStore(Path root) {
    try {
      Files.createDirectories(root);
      this.root = root.toRealPath();
    } catch (IOException e) {
      throw new UncheckedIOException("The local evidence store root cannot be prepared", e);
    }
  }

  @Override
  public Optional<VideoObjectMetadata> metadata(String key) {
    Path path = resolve(key);
    try {
      requireRoot();
      rejectLinks(path);
      BasicFileAttributes attributes =
          Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
      if (!attributes.isRegularFile()) {
        throw new IOException("Object is not a regular file");
      }
      return Optional.of(new VideoObjectMetadata(attributes.size()));
    } catch (NoSuchFileException e) {
      return Optional.empty();
    } catch (IOException e) {
      throw unavailable(e);
    }
  }

  @Override
  public byte[] read(String key, long firstByte, long lastByte) {
    if (firstByte < 0 || lastByte < firstByte || lastByte - firstByte >= Integer.MAX_VALUE) {
      throw new IllegalArgumentException("The requested evidence range is invalid");
    }
    Path path = resolve(key);
    try {
      requireRoot();
      rejectLinks(path);
      try (FileChannel channel =
          FileChannel.open(path, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS)) {
        if (lastByte >= channel.size()) {
          throw new IOException("Object changed during range read");
        }
        ByteBuffer bytes = ByteBuffer.allocate(Math.toIntExact(lastByte - firstByte + 1));
        channel.position(firstByte);
        while (bytes.hasRemaining()) {
          if (channel.read(bytes) < 0) {
            throw new IOException("Incomplete object range");
          }
        }
        return bytes.array();
      }
    } catch (IOException e) {
      throw unavailable(e);
    }
  }

  private Path resolve(String key) {
    if (Path.of(key).isAbsolute()) {
      throw new IllegalArgumentException("The object key resolves outside the store root");
    }
    Path path = root.resolve(key).normalize();
    if (!path.startsWith(root) || path.equals(root)) {
      throw new IllegalArgumentException("The object key resolves outside the store root");
    }
    return path;
  }

  /** A missing or unmounted store is different from an absent key; links are not object keys. */
  private void requireRoot() throws IOException {
    if (!Files.isDirectory(root) || !Files.isReadable(root)) {
      throw new IOException("The local evidence store root is unavailable");
    }
  }

  private void rejectLinks(Path path) throws IOException {
    Path current = root;
    for (Path part : root.relativize(path)) {
      current = current.resolve(part);
      if (Files.isSymbolicLink(current)) {
        throw new IOException("Symbolic links are not object keys");
      }
    }
  }

  private static VideoObjectStoreUnavailableException unavailable(IOException cause) {
    return new VideoObjectStoreUnavailableException(
        "The local evidence store is unavailable", cause);
  }
}
