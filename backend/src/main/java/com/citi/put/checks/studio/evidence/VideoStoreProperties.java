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
 * <p><b>{@code provider} says whether the API can read recordings at all</b> (Studio v1 gaps). It
 * is read here rather than declared on {@link VideoObjectStore}, whose surface is pinned to the two
 * read operations. The only store in this codebase is the in-memory {@link FakeVideoObjectStore};
 * there is no real object-store client yet (ED-03). So a deployment — and {@code dev.sh}, whose
 * runner writes recordings to its own local directory — must not tell the browser a recording is
 * available and then answer its {@code GET …/video} with 404. {@code none}, the default, makes the
 * snapshot report such recordings {@code UNAVAILABLE}; {@code in-memory} is the test fake serving
 * what a test put into it, and is set for the Gradle test task only.
 *
 * @param bucket the evidence bucket; deployment configuration, never a response value
 * @param endpoint the object store endpoint; deployment configuration, never a response value
 * @param provider {@code none} (default) or {@code in-memory}; anything else serves nothing
 */
@ConfigurationProperties(prefix = "studio.execution.video-store")
public record VideoStoreProperties(String bucket, String endpoint, String provider) {

  /** The API has no store it can read recordings from. */
  public static final String PROVIDER_NONE = "none";

  /** The in-memory test fake, serving exactly what a test put into it. */
  public static final String PROVIDER_IN_MEMORY = "in-memory";

  /** True only for a provider that can actually serve recording bytes to the API. */
  public boolean servesRecordings() {
    return PROVIDER_IN_MEMORY.equals(provider);
  }

  public String bucketOrDefault() {
    return bucket == null || bucket.isBlank() ? "put-checks-studio-evidence" : bucket;
  }

  public String endpointOrDefault() {
    return endpoint == null || endpoint.isBlank() ? "https://sonic.invalid" : endpoint;
  }
}
