package com.citi.put.checks.studio.storage;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.evidence.FakeVideoObjectStore;
import com.citi.put.checks.studio.evidence.VideoObjectStore;
import com.citi.put.checks.studio.evidence.VideoStoreProperties;
import com.citi.put.checks.studio.recovery.FakeResultManifestStore;
import com.citi.put.checks.studio.recovery.ResultManifestStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class StorageProviderWiringTest {
  @TempDir Path directory;
  private final ApplicationContextRunner runner =
      new ApplicationContextRunner()
          .withUserConfiguration(
              StudioStorageConfiguration.class,
              FakeVideoObjectStore.class,
              FakeResultManifestStore.class)
          .withBean(ObjectMapper.class, ObjectMapper::new)
          .withBean(VideoStoreProperties.class, () -> new VideoStoreProperties(null, null, null));

  @Test
  void localSelectsFilesystemForBothReaders() {
    runner
        .withPropertyValues(
            "spring.profiles.active=local",
            "studio.storage.provider=filesystem",
            "studio.storage.directory=" + directory)
        .run(
            context -> {
              assertThat(context)
                  .hasNotFailed()
                  .hasSingleBean(VideoObjectStore.class)
                  .hasSingleBean(ResultManifestStore.class);
              assertThat(context.getBean(VideoObjectStore.class))
                  .isInstanceOf(FilesystemVideoObjectStore.class);
              assertThat(context.getBean(ResultManifestStore.class))
                  .isInstanceOf(ObjectStoreManifestReader.class);
              assertThat(context)
                  .doesNotHaveBean(FakeVideoObjectStore.class)
                  .doesNotHaveBean(FakeResultManifestStore.class);
            });
  }

  @Test
  void inMemoryStoresRequireExplicitTestProfileAndProvider() {
    runner
        .withPropertyValues("spring.profiles.active=test", "studio.storage.provider=fake")
        .run(
            context -> {
              assertThat(context)
                  .hasNotFailed()
                  .hasSingleBean(VideoObjectStore.class)
                  .hasSingleBean(ResultManifestStore.class);
              assertThat(context.getBean(VideoObjectStore.class))
                  .isInstanceOf(FakeVideoObjectStore.class);
              assertThat(context.getBean(ResultManifestStore.class))
                  .isInstanceOf(FakeResultManifestStore.class);
            });
    runner
        .withPropertyValues("spring.profiles.active=local", "studio.storage.provider=fake")
        .run(context -> assertThat(context).hasFailed());
    runner
        .withPropertyValues(
            "spring.profiles.active=local,prod", "studio.storage.provider=filesystem")
        .run(context -> assertThat(context).hasFailed());
  }

  @Test
  void remoteS3RequiresBucketAndRegionAndNeverFallsBack() {
    runner
        .withPropertyValues("spring.profiles.active=prod", "studio.storage.provider=s3")
        .run(context -> assertThat(context).hasFailed());
    runner
        .withPropertyValues(
            "spring.profiles.active=prod",
            "studio.storage.provider=s3",
            "studio.storage.bucket=test-evidence",
            "studio.storage.region=us-east-1")
        .run(
            context -> {
              assertThat(context).hasNotFailed().hasSingleBean(VideoObjectStore.class);
              assertThat(context.getBean(VideoObjectStore.class))
                  .isInstanceOf(S3VideoObjectStore.class);
            });
    runner
        .withPropertyValues("studio.storage.provider=typo")
        .run(context -> assertThat(context).hasFailed());
  }
}
