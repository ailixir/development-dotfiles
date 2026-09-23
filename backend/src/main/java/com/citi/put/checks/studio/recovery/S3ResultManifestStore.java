package com.citi.put.checks.studio.recovery;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;

/** Read-only, bounded Sonic/S3 terminal-manifest adapter. */
public final class S3ResultManifestStore implements ResultManifestStore {

  private final S3Client client;
  private final String bucket;
  private final int maxBytes;
  private final ObjectMapper objectMapper;
  private final AtomicBoolean lastKnownAvailable = new AtomicBoolean(false);

  public S3ResultManifestStore(
      S3Client client, String bucket, int maxBytes, ObjectMapper objectMapper) {
    this.client = client;
    this.bucket = bucket;
    this.maxBytes = maxBytes;
    this.objectMapper = objectMapper;
  }

  @Override
  public Optional<ResultManifest> read(String key) {
    try {
      ResponseBytes<GetObjectResponse> response =
          client.getObjectAsBytes(
              request ->
                  request.bucket(bucket).key(key).range("bytes=0-" + Integer.toString(maxBytes)));
      byte[] bytes = response.asByteArray();
      if (bytes.length > maxBytes) {
        throw new IllegalStateException("The result manifest exceeds the configured size bound");
      }
      ResultManifest manifest = objectMapper.readValue(bytes, ResultManifest.class);
      lastKnownAvailable.set(true);
      return Optional.of(manifest);
    } catch (NoSuchKeyException e) {
      lastKnownAvailable.set(true);
      return Optional.empty();
    } catch (S3Exception e) {
      if (isMissingKey(e)) {
        lastKnownAvailable.set(true);
        return Optional.empty();
      }
      lastKnownAvailable.set(false);
      throw new IllegalStateException("The Sonic result manifest store is unavailable", e);
    } catch (IOException | RuntimeException e) {
      lastKnownAvailable.set(false);
      throw new IllegalStateException("The Sonic result manifest store is unavailable", e);
    }
  }

  @Override
  public boolean isAvailable() {
    return lastKnownAvailable.get();
  }

  private static boolean isMissingKey(S3Exception exception) {
    String code =
        exception.awsErrorDetails() == null ? null : exception.awsErrorDetails().errorCode();
    return "NoSuchKey".equals(code) || "NotFound".equals(code);
  }
}
