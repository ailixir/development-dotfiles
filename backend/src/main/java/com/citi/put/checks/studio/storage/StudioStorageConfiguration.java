package com.citi.put.checks.studio.storage;

import com.citi.put.checks.studio.evidence.VideoObjectMetadata;
import com.citi.put.checks.studio.evidence.VideoObjectStore;
import com.citi.put.checks.studio.evidence.VideoObjectStoreUnavailableException;
import com.citi.put.checks.studio.recovery.ResultManifestStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Optional;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration
@EnableConfigurationProperties(StudioStorageProperties.class)
public class StudioStorageConfiguration {
  public StudioStorageConfiguration(StudioStorageProperties properties, Environment environment) {
    String provider = properties.provider();
    if (!java.util.Set.of("disabled", "filesystem", "s3", "fake").contains(provider)) {
      throw new IllegalStateException("Unknown studio.storage.provider: " + provider);
    }
    var profiles = Arrays.asList(environment.getActiveProfiles());
    if (provider.equals("fake")
        && (!profiles.contains("test")
            || profiles.stream().anyMatch(java.util.Set.of("dev", "staging", "prod")::contains))) {
      throw new IllegalStateException("Studio fake storage is confined to the test profile");
    }
    if (provider.equals("filesystem")
        && (!profiles.contains("local")
            || profiles.stream().anyMatch(java.util.Set.of("staging", "prod")::contains))) {
      throw new IllegalStateException("Studio filesystem storage requires the local profile only");
    }
  }

  @Bean
  @ConditionalOnProperty(name = "studio.storage.provider", havingValue = "filesystem")
  public VideoObjectStore filesystemVideoObjectStore(StudioStorageProperties properties)
      throws IOException {
    return new FilesystemVideoObjectStore(Path.of(properties.directory()));
  }

  @Bean(destroyMethod = "close")
  @ConditionalOnProperty(name = "studio.storage.provider", havingValue = "s3")
  public S3Client studioS3Client(StudioStorageProperties properties) {
    if (properties.bucket() == null
        || properties.bucket().isBlank()
        || properties.region() == null
        || properties.region().isBlank()) {
      throw new IllegalStateException(
          "Studio S3 requires STUDIO_STORAGE_BUCKET and STUDIO_STORAGE_REGION; configure AWS credentials separately");
    }
    if (properties.requestTimeout().isNegative() || properties.requestTimeout().isZero()) {
      throw new IllegalStateException("Studio storage request timeout must be positive");
    }
    var builder =
        S3Client.builder()
            .region(Region.of(properties.region()))
            .httpClientBuilder(
                UrlConnectionHttpClient.builder()
                    .connectionTimeout(properties.requestTimeout())
                    .socketTimeout(properties.requestTimeout()))
            .overrideConfiguration(config -> config.apiCallTimeout(properties.requestTimeout()));
    if (properties.credentialsDirectory() != null && !properties.credentialsDirectory().isBlank()) {
      builder.credentialsProvider(
          new MountedAwsCredentials(Path.of(properties.credentialsDirectory())));
    }
    return builder.build();
  }

  @Bean
  @ConditionalOnProperty(name = "studio.storage.provider", havingValue = "s3")
  public VideoObjectStore s3VideoObjectStore(
      S3Client studioS3Client, StudioStorageProperties properties) {
    return new S3VideoObjectStore(studioS3Client, properties.bucket());
  }

  @Bean
  @ConditionalOnProperty(
      name = "studio.storage.provider",
      havingValue = "disabled",
      matchIfMissing = true)
  public VideoObjectStore disabledVideoObjectStore() {
    return new VideoObjectStore() {
      @Override
      public Optional<VideoObjectMetadata> metadata(String key) {
        throw new VideoObjectStoreUnavailableException("Studio storage is disabled");
      }

      @Override
      public byte[] read(String key, long firstByte, long lastByte) {
        throw new VideoObjectStoreUnavailableException("Studio storage is disabled");
      }
    };
  }

  @Bean
  @org.springframework.boot.autoconfigure.condition.ConditionalOnExpression(
      "'${studio.storage.provider:disabled}' != 'fake'")
  public ResultManifestStore objectStoreManifestReader(
      VideoObjectStore store, ObjectMapper mapper) {
    return new ObjectStoreManifestReader(store, mapper);
  }
}
