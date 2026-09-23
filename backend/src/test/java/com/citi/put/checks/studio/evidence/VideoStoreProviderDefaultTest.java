package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.PropertySourcesPlaceholdersResolver;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

/**
 * The shipped application default stores nothing: storage is off until an environment selects it.
 * The local profile selects the filesystem adapter and the Helm chart always sets the provider, so
 * a deployment never inherits storage it did not ask for.
 */
class VideoStoreProviderDefaultTest {

  @Test
  void theShippedDefaultStoresNothingUntilAnEnvironmentSelectsAProvider() throws IOException {
    MutablePropertySources sources = new MutablePropertySources();
    for (PropertySource<?> source :
        new YamlPropertySourceLoader()
            .load("application.yml", new ClassPathResource("application.yml"))) {
      sources.addLast(source);
    }
    Binder binder =
        new Binder(
            ConfigurationPropertySources.from(sources),
            new PropertySourcesPlaceholdersResolver(sources));

    VideoStoreProperties bound =
        binder.bind("studio.execution.video-store", VideoStoreProperties.class).get();

    assertThat(bound.provider()).isEqualTo(VideoStoreProperties.PROVIDER_NONE);
    assertThat(bound.servesRecordings()).isFalse();
  }
}
