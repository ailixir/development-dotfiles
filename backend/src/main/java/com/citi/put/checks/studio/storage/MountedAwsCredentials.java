package com.citi.put.checks.studio.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials;
import software.amazon.awssdk.core.exception.SdkClientException;

/** Reads the existing Kubernetes Secret mount on each resolution, including rotation. */
final class MountedAwsCredentials implements AwsCredentialsProvider {
  private final Path directory;

  MountedAwsCredentials(Path directory) {
    this.directory = directory;
  }

  @Override
  public AwsCredentials resolveCredentials() {
    try {
      String accessKey = Files.readString(directory.resolve("accessKeyId")).trim();
      String secretKey = Files.readString(directory.resolve("secretAccessKey")).trim();
      if (accessKey.isBlank() || secretKey.isBlank()) {
        throw new IOException("Empty credentials");
      }
      Path tokenPath = directory.resolve("sessionToken");
      return Files.exists(tokenPath)
          ? AwsSessionCredentials.create(accessKey, secretKey, Files.readString(tokenPath).trim())
          : AwsBasicCredentials.create(accessKey, secretKey);
    } catch (IOException e) {
      throw SdkClientException.create("Studio S3 credentials could not be read");
    }
  }
}
