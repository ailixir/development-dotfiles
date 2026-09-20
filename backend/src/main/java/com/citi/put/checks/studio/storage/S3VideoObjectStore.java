package com.citi.put.checks.studio.storage;

import com.citi.put.checks.studio.evidence.VideoObjectMetadata;
import com.citi.put.checks.studio.evidence.VideoObjectStore;
import com.citi.put.checks.studio.evidence.VideoObjectStoreUnavailableException;
import java.util.Optional;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.S3Exception;

/** Read-only S3 adapter. No list, put or delete operations are used. */
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
      var response = client.headObject(request -> request.bucket(bucket).key(key));
      return Optional.of(new VideoObjectMetadata(response.contentLength()));
    } catch (S3Exception e) {
      if (e.statusCode() == 404) {
        return Optional.empty();
      }
      throw unavailable();
    } catch (SdkException e) {
      throw unavailable();
    }
  }

  @Override
  public byte[] read(String key, long firstByte, long lastByte) {
    if (firstByte < 0 || lastByte < firstByte || lastByte - firstByte >= Integer.MAX_VALUE) {
      throw new IllegalArgumentException("Invalid object byte range");
    }
    try {
      byte[] bytes =
          client
              .getObjectAsBytes(
                  request ->
                      request.bucket(bucket).key(key).range("bytes=" + firstByte + "-" + lastByte))
              .asByteArray();
      if (bytes.length != lastByte - firstByte + 1) {
        throw unavailable();
      }
      return bytes;
    } catch (SdkException e) {
      throw unavailable();
    }
  }

  private static VideoObjectStoreUnavailableException unavailable() {
    return new VideoObjectStoreUnavailableException("Studio S3 storage is unavailable");
  }
}
