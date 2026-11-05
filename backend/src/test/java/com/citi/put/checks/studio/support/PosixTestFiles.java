package com.citi.put.checks.studio.support;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;

/**
 * Creates test files and directories with a POSIX mode where the file system supports one, and
 * without it elsewhere (Windows, whose per-user profile ACL covers test temp files). Linux and
 * macOS get exactly the mode asked for. Test material only.
 */
public final class PosixTestFiles {
  /** True on Windows, where POSIX signals, modes and {@code unix:*} attributes do not exist. */
  public static final boolean WINDOWS =
      System.getProperty("os.name", "").toLowerCase(java.util.Locale.ROOT).startsWith("windows");

  private PosixTestFiles() {}

  /**
   * {@link Files#createFile} with mode {@code mode} (for example {@code rw-------}) where POSIX
   * permissions exist.
   */
  public static Path createFile(Path file, String mode) throws IOException {
    try {
      return Files.createFile(
          file, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString(mode)));
    } catch (UnsupportedOperationException notPosix) {
      return Files.createFile(file);
    }
  }

  /** {@link Files#createDirectory} with mode {@code mode} where POSIX permissions exist. */
  public static Path createDirectory(Path directory, String mode) throws IOException {
    try {
      return Files.createDirectory(
          directory, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString(mode)));
    } catch (UnsupportedOperationException notPosix) {
      return Files.createDirectory(directory);
    }
  }

  /**
   * {@link Files#createTempDirectory(String, java.nio.file.attribute.FileAttribute[])} likewise.
   */
  public static Path createTempDirectory(String prefix, String mode) throws IOException {
    try {
      return Files.createTempDirectory(
          prefix, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString(mode)));
    } catch (UnsupportedOperationException notPosix) {
      return Files.createTempDirectory(prefix);
    }
  }
}
