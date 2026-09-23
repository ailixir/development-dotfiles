package com.citi.put.checks.studio.evidence;

import com.citi.put.checks.studio.recovery.LocalResultManifestStore;
import com.citi.put.checks.studio.recovery.ResultManifestStore;
import com.citi.put.checks.studio.recovery.S3ResultManifestStore;
import com.citi.put.checks.studio.recovery.UnavailableResultManifestStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

/** Binds the evidence store's deployment values (§8.5). */
@Configuration
@EnableConfigurationProperties(VideoStoreProperties.class)
public class StudioEvidenceConfig {

  private static final String PREFIX = "studio.execution.video-store";
  private static final Set<String> PROVIDERS = Set.of("none", "local", "s3");

  @Bean
  public EvidenceProviderValidation evidenceProviderValidation(VideoStoreProperties properties) {
    validate(properties);
    return new EvidenceProviderValidation(properties.provider());
  }

  @Bean
  @ConditionalOnProperty(
      prefix = PREFIX,
      name = "provider",
      havingValue = "local",
      matchIfMissing = true)
  public VideoObjectStore localVideoObjectStore(VideoStoreProperties properties) {
    return new LocalVideoObjectStore(Path.of(properties.directoryOrDefault()));
  }

  @Bean
  @ConditionalOnProperty(
      prefix = PREFIX,
      name = "provider",
      havingValue = "local",
      matchIfMissing = true)
  public ResultManifestStore localResultManifestStore(
      VideoStoreProperties properties, ObjectMapper objectMapper) {
    return new LocalResultManifestStore(
        Path.of(properties.directoryOrDefault()),
        properties.maxManifestBytesOrDefault(),
        objectMapper);
  }

  @Bean
  @ConditionalOnProperty(prefix = PREFIX, name = "provider", havingValue = "none")
  public VideoObjectStore unavailableVideoObjectStore() {
    return new UnavailableVideoObjectStore();
  }

  @Bean
  @ConditionalOnProperty(prefix = PREFIX, name = "provider", havingValue = "none")
  public ResultManifestStore unavailableResultManifestStore() {
    return new UnavailableResultManifestStore();
  }

  @Bean(destroyMethod = "close")
  @ConditionalOnProperty(prefix = PREFIX, name = "provider", havingValue = "s3")
  public S3Client studioEvidenceS3Client(VideoStoreProperties properties) {
    AwsCredentialsProvider credentials =
        () ->
            AwsBasicCredentials.create(
                readCredential(properties.accessKeyIdFile(), "access key id"),
                readCredential(properties.secretAccessKeyFile(), "secret access key"));
    return S3Client.builder()
        .endpointOverride(URI.create(properties.endpoint()))
        .region(Region.of(properties.regionOrDefault()))
        .credentialsProvider(credentials)
        .httpClientBuilder(
            UrlConnectionHttpClient.builder()
                .connectionTimeout(properties.connectTimeoutOrDefault())
                .socketTimeout(properties.requestTimeoutOrDefault()))
        .serviceConfiguration(
            S3Configuration.builder()
                .pathStyleAccessEnabled(properties.pathStyleAccessOrDefault())
                .build())
        .overrideConfiguration(
            configuration ->
                configuration
                    .retryStrategy(builder -> builder.maxAttempts(1))
                    .apiCallAttemptTimeout(properties.requestTimeoutOrDefault())
                    .apiCallTimeout(properties.requestTimeoutOrDefault()))
        .build();
  }

  @Bean
  @ConditionalOnProperty(prefix = PREFIX, name = "provider", havingValue = "s3")
  public VideoObjectStore s3VideoObjectStore(
      S3Client studioEvidenceS3Client, VideoStoreProperties properties) {
    return new S3VideoObjectStore(studioEvidenceS3Client, properties.bucketOrDefault());
  }

  @Bean
  @ConditionalOnProperty(prefix = PREFIX, name = "provider", havingValue = "s3")
  public ResultManifestStore s3ResultManifestStore(
      S3Client studioEvidenceS3Client, VideoStoreProperties properties, ObjectMapper objectMapper) {
    return new S3ResultManifestStore(
        studioEvidenceS3Client,
        properties.bucketOrDefault(),
        properties.maxManifestBytesOrDefault(),
        objectMapper);
  }

  private static void validate(VideoStoreProperties properties) {
    String provider = properties.provider();
    if (provider == null || !PROVIDERS.contains(provider)) {
      throw new IllegalStateException(PREFIX + ".provider must be one of " + PROVIDERS);
    }
    if (properties.maxManifestBytesOrDefault() <= 0
        || properties.maxManifestBytesOrDefault() == Integer.MAX_VALUE) {
      throw new IllegalStateException(
          PREFIX + ".max-manifest-bytes must be between 1 and " + (Integer.MAX_VALUE - 1));
    }
    if (properties.connectTimeoutOrDefault().isZero()
        || properties.connectTimeoutOrDefault().isNegative()
        || properties.requestTimeoutOrDefault().isZero()
        || properties.requestTimeoutOrDefault().isNegative()) {
      throw new IllegalStateException(PREFIX + " timeouts must be greater than zero");
    }
    if (!VideoStoreProperties.PROVIDER_S3.equals(provider)) {
      return;
    }
    requireText(properties.endpoint(), "endpoint");
    requireText(properties.bucket(), "bucket");
    requireText(properties.region(), "region");
    requireText(properties.accessKeyIdFile(), "access-key-id-file");
    requireText(properties.secretAccessKeyFile(), "secret-access-key-file");
    URI endpoint = URI.create(properties.endpoint());
    boolean loopback =
        "localhost".equals(endpoint.getHost())
            || "127.0.0.1".equals(endpoint.getHost())
            || "::1".equals(endpoint.getHost());
    if (!"https".equals(endpoint.getScheme())
        && !("http".equals(endpoint.getScheme()) && loopback)) {
      throw new IllegalStateException(PREFIX + ".endpoint must use https outside loopback tests");
    }
    if (endpoint.getUserInfo() != null
        || endpoint.getQuery() != null
        || endpoint.getFragment() != null) {
      throw new IllegalStateException(PREFIX + ".endpoint must not contain credentials or a query");
    }
  }

  private static void requireText(String value, String name) {
    if (value == null || value.isBlank()) {
      throw new IllegalStateException(PREFIX + "." + name + " is required for provider=s3");
    }
  }

  private static String readCredential(String file, String label) {
    try {
      String value = Files.readString(Path.of(file)).trim();
      if (value.isEmpty()) {
        throw new IOException("empty file");
      }
      return value;
    } catch (IOException e) {
      throw new IllegalStateException("The mounted object-store " + label + " is unavailable", e);
    }
  }

  /** Forces validation to run even when no store operation has happened yet. */
  public record EvidenceProviderValidation(String provider) {}
}
