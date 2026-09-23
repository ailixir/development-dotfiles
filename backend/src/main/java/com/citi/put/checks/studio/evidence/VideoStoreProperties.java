package com.citi.put.checks.studio.evidence;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Where the recordings live (§6.2, §8.5).
 *
 * <p>The provider is explicit: {@code local} is the runnable application default, {@code s3}
 * activates Sonic, and {@code none} is explicitly disabled. No bucket, endpoint, filesystem path or
 * credential path may appear on the browser wire.
 *
 * <p><b>No retention value lives here.</b> Evidence retention is declared exactly once, at {@code
 * studio.execution.evidence-retention}, and §8.5 asks that bounds keep their values in one
 * configuration source; a second copy is the drift that section exists to prevent.
 *
 * <p>The S3 credential fields are mounted-file paths rather than values. This record can therefore
 * be logged structurally without containing either credential, though production code does not log
 * it. The runner has a separate write-only credential and API/worker share the read-only one.
 *
 * @param bucket the evidence bucket; deployment configuration, never a response value
 * @param endpoint the object store endpoint; deployment configuration, never a response value
 * @param provider {@code local}, {@code s3}, or {@code none}
 */
@ConfigurationProperties(prefix = "studio.execution.video-store")
public record VideoStoreProperties(
    String bucket,
    String endpoint,
    String provider,
    String directory,
    String region,
    Boolean pathStyleAccess,
    String accessKeyIdFile,
    String secretAccessKeyFile,
    Integer maxManifestBytes,
    Duration connectTimeout,
    Duration requestTimeout) {

  /** The API has no store it can read recordings from. */
  public static final String PROVIDER_NONE = "none";

  /** Shared filesystem used by the local runner and API. */
  public static final String PROVIDER_LOCAL = "local";

  /** Sonic's S3-compatible API. */
  public static final String PROVIDER_S3 = "s3";

  /** True only for a provider that can actually serve recording bytes to the API. */
  public boolean servesRecordings() {
    return PROVIDER_LOCAL.equals(provider) || PROVIDER_S3.equals(provider);
  }

  public String bucketOrDefault() {
    return bucket == null || bucket.isBlank() ? "put-checks-studio-evidence" : bucket;
  }

  public String endpointOrDefault() {
    return endpoint == null || endpoint.isBlank() ? "https://sonic.invalid" : endpoint;
  }

  public String directoryOrDefault() {
    return directory == null || directory.isBlank() ? "/tmp/studio-runner-objects" : directory;
  }

  public String regionOrDefault() {
    return region == null || region.isBlank() ? "us-east-1" : region;
  }

  public boolean pathStyleAccessOrDefault() {
    return pathStyleAccess == null || pathStyleAccess;
  }

  public int maxManifestBytesOrDefault() {
    return maxManifestBytes == null ? 512 * 1024 : maxManifestBytes;
  }

  public Duration connectTimeoutOrDefault() {
    return connectTimeout == null ? Duration.ofSeconds(2) : connectTimeout;
  }

  public Duration requestTimeoutOrDefault() {
    return requestTimeout == null ? Duration.ofSeconds(10) : requestTimeout;
  }
}
