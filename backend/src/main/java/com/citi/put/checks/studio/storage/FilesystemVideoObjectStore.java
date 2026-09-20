package com.citi.put.checks.studio.storage;

import com.citi.put.checks.studio.evidence.VideoObjectMetadata;
import com.citi.put.checks.studio.evidence.VideoObjectStore;
import com.citi.put.checks.studio.evidence.VideoObjectStoreUnavailableException;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Optional;

/** Reads the same keys the runner writes, without loading an entire video for a range request. */
public final class FilesystemVideoObjectStore implements VideoObjectStore {
  private final Path root;

  public FilesystemVideoObjectStore(Path root) throws IOException {
    Files.createDirectories(root);
    this.root = root.toRealPath();
  }

  private Path resolveKey(String key) throws IOException {
    Path path = root.resolve(key).normalize();
    if (!path.startsWith(root) || path.equals(root) || Path.of(key).isAbsolute()) {
      throw new IllegalArgumentException("Object key must stay inside the storage directory");
    }
    Path current = root;
    for (Path part : root.relativize(path)) {
      current = current.resolve(part);
      if (Files.isSymbolicLink(current)) {
        throw new IOException("Symbolic links are not object keys");
      }
    }
    // A missing/unmounted store is different from an absent key.
    if (!Files.isDirectory(root) || !Files.isReadable(root)) {
      throw new IOException("Storage directory is unavailable");
    }
    return path;
  }

  @Override
  public Optional<VideoObjectMetadata> metadata(String key) {
    try {
      var attributes =
          Files.readAttributes(
              resolveKey(key), BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
      if (!attributes.isRegularFile()) {
        throw new IOException("Object is not a regular file");
      }
      return Optional.of(new VideoObjectMetadata(attributes.size()));
    } catch (NoSuchFileException e) {
      return Optional.empty();
    } catch (IOException e) {
      throw unavailable();
    }
  }

  @Override
  public byte[] read(String key, long firstByte, long lastByte) {
    if (firstByte < 0 || lastByte < firstByte || lastByte - firstByte >= Integer.MAX_VALUE) {
      throw new IllegalArgumentException("Invalid object byte range");
    }
    try (FileChannel channel =
        FileChannel.open(resolveKey(key), StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS)) {
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
    } catch (IOException e) {
      throw unavailable();
    }
  }

  private static VideoObjectStoreUnavailableException unavailable() {
    return new VideoObjectStoreUnavailableException("Studio filesystem storage is unavailable");
  }
}
