package com.citi.put.checks.studio.evidence;

import java.io.IOException;
import java.util.Optional;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;

/** Read-only Sonic/S3 adapter: inclusive ranged GetObject only, including a one-byte size probe. */
public final class S3VideoObjectStore implements VideoObjectStore {

  private final S3Client client;
  private final String bucket;

  public S3VideoObjectStore(S3Client client, String bucket) {
    this.client = client;
    this.bucket = bucket;
  }

  @Override
  public Optional<VideoObjectMetadata> metadata(String key) {
    try {
      try (ResponseInputStream<GetObjectResponse> response =
          client.getObject(request -> request.bucket(bucket).key(key).range("bytes=0-0"))) {
        return Optional.of(new VideoObjectMetadata(totalSize(response.response().contentRange())));
      } catch (IOException e) {
        throw unavailable(e);
      }
    } catch (NoSuchKeyException e) {
      return Optional.empty();
    } catch (S3Exception e) {
      if (isMissingKey(e)) {
        return Optional.empty();
      }
      throw unavailable(e);
    } catch (RuntimeException e) {
      throw unavailable(e);
    }
  }

  @Override
  public byte[] read(String key, long firstByte, long lastByte) {
    try {
      ResponseBytes<GetObjectResponse> response =
          client.getObjectAsBytes(
              request ->
                  request.bucket(bucket).key(key).range("bytes=" + firstByte + "-" + lastByte));
      byte[] bytes = response.asByteArray();
      long expected = lastByte - firstByte + 1;
      if (bytes.length != expected) {
        throw new VideoObjectStoreUnavailableException(
            "The Sonic evidence store returned an incomplete range");
      }
      return bytes;
    } catch (NoSuchKeyException e) {
      throw unavailable(e);
    } catch (S3Exception e) {
      throw unavailable(e);
    } catch (RuntimeException e) {
      throw unavailable(e);
    }
  }

  private static VideoObjectStoreUnavailableException unavailable(RuntimeException cause) {
    return new VideoObjectStoreUnavailableException(
        "The Sonic evidence store is unavailable", cause);
  }

  private static VideoObjectStoreUnavailableException unavailable(IOException cause) {
    return new VideoObjectStoreUnavailableException(
        "The Sonic evidence store is unavailable", cause);
  }

  private static long totalSize(String contentRange) {
    if (contentRange == null) {
      throw new VideoObjectStoreUnavailableException(
          "The Sonic evidence store omitted Content-Range from a ranged read");
    }
    int slash = contentRange.lastIndexOf('/');
    if (slash < 0 || slash == contentRange.length() - 1) {
      throw new VideoObjectStoreUnavailableException(
          "The Sonic evidence store returned an invalid Content-Range");
    }
    try {
      long size = Long.parseLong(contentRange.substring(slash + 1));
      if (size <= 0) {
        throw new NumberFormatException("non-positive size");
      }
      return size;
    } catch (NumberFormatException e) {
      throw new VideoObjectStoreUnavailableException(
          "The Sonic evidence store returned an invalid Content-Range", e);
    }
  }

  private static boolean isMissingKey(S3Exception exception) {
    String code =
        exception.awsErrorDetails() == null ? null : exception.awsErrorDetails().errorCode();
    return "NoSuchKey".equals(code) || "NotFound".equals(code);
  }
}
