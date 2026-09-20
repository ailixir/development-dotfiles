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
 * Studio v1 gaps: a deployment that sets nothing gets {@code provider: none}, i.e. recordings are
 * reported UNAVAILABLE rather than offered on a route that can only 404. Bound from the shipped
 * {@code application.yml} alone, outside the test task's {@code in-memory} override.
 */
class VideoStoreProviderDefaultTest {

  @Test
  void theShippedDefaultServesNoRecordings() throws IOException {
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
