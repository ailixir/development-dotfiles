package com.citi.put.checks.studio.evidence;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Where the recordings live (§6.2, §8.5).
 *
 * <p>Two values and no third: a bucket and an endpoint. Neither may ever appear on the wire — §6.2
 * says the API stores object keys only and exposes the protected API path to the browser — which is
 * why story 10.15 AC-6 asserts their absence from every response this route can produce, headers
 * included.
 *
 * <p><b>No retention value lives here.</b> Evidence retention is declared exactly once, at {@code
 * studio.execution.evidence-retention}, and §8.5 asks that bounds keep their values in one
 * configuration source; a second copy is the drift that section exists to prevent.
 *
 * @param bucket the evidence bucket; deployment configuration, never a response value
 * @param endpoint the object store endpoint; deployment configuration, never a response value
 */
@ConfigurationProperties(prefix = "studio.execution.video-store")
public record VideoStoreProperties(String bucket, String endpoint) {

  public String bucketOrDefault() {
    return bucket == null || bucket.isBlank() ? "put-checks-studio-evidence" : bucket;
  }

  public String endpointOrDefault() {
    return endpoint == null || endpoint.isBlank() ? "https://sonic.invalid" : endpoint;
  }
}
