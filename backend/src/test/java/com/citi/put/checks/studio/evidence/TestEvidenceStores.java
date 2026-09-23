package com.citi.put.checks.studio.evidence;

import com.citi.put.checks.studio.recovery.FakeResultManifestStore;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Test-only evidence beans. Production code has no in-memory evidence provider. */
@TestConfiguration(proxyBeanMethods = false)
public class TestEvidenceStores {

  @Bean
  @Primary
  VideoStoreProperties testVideoStoreProperties() {
    return new VideoStoreProperties(
        null,
        null,
        VideoStoreProperties.PROVIDER_LOCAL,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null);
  }

  @Bean
  @Primary
  FakeVideoObjectStore fakeVideoObjectStore(VideoStoreProperties properties) {
    return new FakeVideoObjectStore(properties);
  }

  @Bean
  @Primary
  FakeResultManifestStore fakeResultManifestStore() {
    return new FakeResultManifestStore();
  }
}
